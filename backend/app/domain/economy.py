"""Economy runtime: continuous production, warehouse hard cap, idempotent overflow accounting."""
from __future__ import annotations

import math

from app.core import clock
from app.core.db import db
from app.core.spec import get_spec
from app.domain import formulas as F


def snapshot_rates(doc: dict) -> dict:
    spec = get_spec()
    buildings = doc.get("buildings", {})
    research = doc.get("research", {})
    return {
        "production_per_h": F.production_per_hour(buildings, research, spec),
        "warehouse_capacity": F.warehouse_capacity(buildings, research, spec),
    }


async def accrue(doc: dict) -> dict:
    """Credit production since last_accrued_at with the canonical overflow rule.

    Idempotent under retries/concurrency: the update is a compare-and-set on `last_accrued_at`.
    Fractional production is carried in `carry` (resources stay 64-bit integers)."""
    now = clock.now()
    last = clock.aware(doc.get("last_accrued_at")) or now
    elapsed_h = max(0.0, (now - last).total_seconds() / 3600.0)
    if elapsed_h <= 0:
        return doc
    rates = snapshot_rates(doc)
    cap = rates["warehouse_capacity"]
    res = dict(doc.get("resources", {}))
    carry = dict(doc.get("carry", {}))
    discarded_total = 0.0
    for r in F.RES:
        incoming = rates["production_per_h"][r] * elapsed_h + float(carry.get(r, 0.0))
        current = int(res.get(r, 0))
        accepted, discarded = F.overflow_credit(incoming, current, cap)
        whole = int(math.floor(accepted + 1e-9))
        res[r] = current + whole
        carry[r] = accepted - whole if current + whole < cap else 0.0
        discarded_total += discarded
    updated = await db().settlements.find_one_and_update(
        {"_id": doc["_id"], "last_accrued_at": doc.get("last_accrued_at")},
        {"$set": {"resources": res, "carry": carry, "last_accrued_at": now}},
        return_document=True,
    )
    if updated is None:
        # someone else accrued concurrently; read the authoritative state
        updated = await db().settlements.find_one({"_id": doc["_id"]})
        return updated or doc
    if discarded_total > 0:
        await db().audit.insert_one(
            {
                "world_id": doc["world_id"],
                "type": "economy_overflow",
                "settlement_id": doc["_id"],
                "discarded": round(discarded_total, 3),
                "at": now,
            }
        )
    return updated


async def spend(settlement_id: str, cost: dict[str, int]) -> bool:
    """Atomic conditional spend; returns False when any resource is insufficient."""
    flt: dict = {"_id": settlement_id}
    inc: dict = {}
    for r, v in cost.items():
        if v > 0:
            flt[f"resources.{r}"] = {"$gte": int(v)}
            inc[f"resources.{r}"] = -int(v)
    if not inc:
        return True
    res = await db().settlements.update_one(flt, {"$inc": inc})
    return res.modified_count == 1


async def credit(settlement_id: str, amounts: dict[str, int], source: str) -> dict[str, int]:
    """Credit resources respecting the warehouse cap; returns the discarded amounts (audited)."""
    doc = await db().settlements.find_one({"_id": settlement_id})
    if not doc:
        return {}
    cap = F.warehouse_capacity(doc.get("buildings", {}), doc.get("research", {}))
    accepted: dict[str, int] = {}
    discarded: dict[str, int] = {}
    for r, v in amounts.items():
        cur = int(doc.get("resources", {}).get(r, 0))
        a, d = F.overflow_credit(float(v), cur, cap)
        accepted[r] = int(math.floor(a))
        discarded[r] = int(v) - accepted[r]
    inc = {f"resources.{r}": v for r, v in accepted.items() if v}
    if inc:
        await db().settlements.update_one({"_id": settlement_id}, {"$inc": inc})
    if any(discarded.values()):
        await db().audit.insert_one(
            {"world_id": doc["world_id"], "type": f"{source}_overflow", "settlement_id": settlement_id, "discarded": discarded, "at": clock.now()}
        )
    return discarded


def missing_for(doc: dict, cost: dict[str, int]) -> dict[str, int]:
    res = doc.get("resources", {})
    return {r: int(v) - int(res.get(r, 0)) for r, v in cost.items() if int(res.get(r, 0)) < int(v)}
