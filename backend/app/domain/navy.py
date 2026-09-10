"""Transport ships: logistics only (navigation / naval_surveillance). One naval queue per Porto."""
from __future__ import annotations

import math
from datetime import timedelta

from app.core import clock
from app.core.db import db
from app.core.errors import ApiError, insufficient_resources
from app.core.spec import get_spec
from app.domain import economy, notifications, scheduler
from app.domain import formulas as F
from app.domain.settlements import new_id


def port_capacity_per_ship(port_level: int, research: dict[str, int]) -> int:
    """SPEC NOTE: navigation.port_capacity_by_level bands are 15-19/20-24/25-29/30 — the settlement level
    range in which a Porto can exist; interpreted as the settlement level of the port settlement."""
    spec = get_spec()
    base = 0
    for rng_key, cap in spec.navigation["port_capacity_by_level"].items():
        if "-" in rng_key:
            lo, hi = [int(v) for v in rng_key.split("-")]
        else:
            lo = hi = int(rng_key)
        if lo <= port_level <= hi:
            base = int(cap)
    bonus = F.capped_metric(research, "ship_capacity", float(spec.navigation["max_capacity_research_bonus_pct"]) / 100.0)
    return int(math.floor(base * (1.0 + bonus)))


def fleet_speed_tph(research: dict[str, int]) -> float:
    spec = get_spec()
    bonus = F.capped_metric(research, "fleet_speed", float(spec.navigation["max_research_speed_bonus_pct"]) / 100.0)
    return float(spec.navigation["base_speed_tph"]) * (1.0 + bonus)


async def start_ship_production(doc: dict, player: dict, count: int, idempotency_key: str | None) -> dict:
    spec = get_spec()
    nav = spec.navigation
    if count <= 0:
        raise ApiError("INVALID_COUNT", "Count must be positive", 400)
    if idempotency_key:
        existing = await db().jobs.find_one({"world_id": doc["world_id"], "player_id": player["_id"], "idempotency_key": idempotency_key})
        if existing:
            return existing
    port = int(doc["buildings"].get("Porto", 0))
    if port < 1:
        raise ApiError("PORT_REQUIRED", "Porto required", 409)
    if F.rget(doc.get("research", {}), "navigation.shipbuilding") < 1:
        raise ApiError("RESEARCH_REQUIRED", "navigation.shipbuilding required", 409)
    unit_cost = {r: int(nav["cost"][r]) for r in F.RES}
    cost = {r: unit_cost[r] * count for r in F.RES}
    flt: dict = {"_id": doc["_id"], "naval_active": {"$not": {"$gte": 1}}}
    inc: dict = {"naval_active": 1}
    for r, v in cost.items():
        if v > 0:
            flt[f"resources.{r}"] = {"$gte": v}
            inc[f"resources.{r}"] = -v
    res = await db().settlements.find_one_and_update(flt, {"$inc": inc})
    if res is None:
        fresh = await db().settlements.find_one({"_id": doc["_id"]})
        if int(fresh.get("naval_active", 0)) >= 1:
            raise ApiError("REJECT_QUEUE_FULL", "Naval queue busy", 409)
        raise insufficient_resources(economy.missing_for(fresh, cost))
    unit_time = int(nav["base_time_min"]) * 60 * F.training_time_multiplier(port)
    now = clock.now()
    ends = now + timedelta(seconds=math.ceil(unit_time * count))
    job = {
        "_id": new_id("job"),
        "world_id": doc["world_id"],
        "player_id": player["_id"],
        "settlement_id": doc["_id"],
        "kind": "SHIP",
        "queue": "Porto",
        "producer": "Porto",
        "target": nav["ship"],
        "count": count,
        "produced_so_far": 0,
        "started_at": now,
        "ends_at": ends,
        "status": "RUNNING",
        "cost_snapshot": cost,
        "modifiers_snapshot": {"unit_cost": unit_cost, "unit_time_s": unit_time, "port_level": port, "spec_version": spec.version},
        "idempotency_key": idempotency_key,
    }
    await db().jobs.insert_one(job)
    await scheduler.schedule(doc["world_id"], "BUILD_RESEARCH_RECRUIT_COMPLETE", ends, doc["_id"], f"job_complete:{job['_id']}", {"job_id": job["_id"]})
    return job


async def apply_complete(job: dict) -> None:
    doc = await db().settlements.find_one({"_id": job["settlement_id"]})
    if not doc or job["_id"] in doc.get("applied_effects", []):
        return
    await db().settlements.update_one(
        {"_id": doc["_id"], "applied_effects": {"$ne": job["_id"]}},
        {"$inc": {"ships": int(job["count"]), "naval_active": -1}, "$push": {"applied_effects": {"$each": [job["_id"]], "$slice": -500}}},
    )
    await notifications.notify(doc["world_id"], doc.get("owner_player_id"), "RECRUITMENT_JOB_STATE", {"producer_id": "Porto", "unit_key": job["target"], "batch": job["count"], "state": "COMPLETED", "eta": None, "settlement_id": doc["_id"]}, dedupe_key=f"job_done:{job['_id']}")
