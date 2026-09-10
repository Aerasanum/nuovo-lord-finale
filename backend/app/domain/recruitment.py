"""Recruitment runtime: one dedicated queue per producer building, canonical batch cap and throughput,
progressive production (partial cancel keeps produced units), idempotent completion."""
from __future__ import annotations

import math
from datetime import timedelta

from app.core import clock
from app.core.db import db
from app.core.errors import ApiError, insufficient_resources
from app.core.spec import get_spec
from app.domain import economy, notifications, scheduler
from app.domain import formulas as F
from app.domain.settlements import new_id, unit_unlocked


async def start_recruitment(doc: dict, player: dict, unit: str, count: int, idempotency_key: str | None) -> dict:
    spec = get_spec()
    if unit not in spec.units_by_name:
        raise ApiError("UNKNOWN_UNIT", "Unknown unit", 404, {"unit": unit})
    if count <= 0:
        raise ApiError("INVALID_COUNT", "Count must be positive", 400)
    if idempotency_key:
        existing = await db().jobs.find_one({"world_id": doc["world_id"], "player_id": player["_id"], "idempotency_key": idempotency_key})
        if existing:
            return existing
    unlocked, gate = unit_unlocked(unit, doc)
    if not unlocked:
        raise ApiError("UNIT_LOCKED", "Unit prerequisites not met", 409, gate)
    u = spec.units_by_name[unit]
    producer = gate["producer_building"]
    plevel = int(doc["buildings"].get(producer, 0))
    research = doc.get("research", {})
    if u["category"] == "legendary":
        cap = 1
        unit_time = float(spec.unit_base_time_seconds(unit))  # 14 days exact, no modifiers
    else:
        cap = F.batch_cap(plevel, spec)
        unit_time = F.unit_effective_time_seconds(unit, plevel, research, spec)
    if count > cap:
        raise ApiError("BATCH_CAP_EXCEEDED", "Batch exceeds producer cap", 409, {"cap": cap})
    unit_cost = spec.unit_cost(unit)
    cost = {r: unit_cost[r] * count for r in F.RES}
    flt: dict = {"_id": doc["_id"], f"recruit_active.{producer}": {"$not": {"$gte": 1}}}
    inc: dict = {f"recruit_active.{producer}": 1}
    for r, v in cost.items():
        if v > 0:
            flt[f"resources.{r}"] = {"$gte": int(v)}
            inc[f"resources.{r}"] = -int(v)
    res = await db().settlements.find_one_and_update(flt, {"$inc": inc})
    if res is None:
        fresh = await db().settlements.find_one({"_id": doc["_id"]})
        if int((fresh.get("recruit_active") or {}).get(producer, 0)) >= 1:
            raise ApiError("REJECT_QUEUE_FULL", f"{producer} queue is busy", 409, {"producer": producer})
        raise insufficient_resources(economy.missing_for(fresh, cost))
    now = clock.now()
    total_s = math.ceil(unit_time * count)
    ends = now + timedelta(seconds=total_s)
    job = {
        "_id": new_id("job"),
        "world_id": doc["world_id"],
        "player_id": player["_id"],
        "settlement_id": doc["_id"],
        "kind": "RECRUIT",
        "queue": producer,
        "producer": producer,
        "target": unit,
        "count": count,
        "produced_so_far": 0,
        "started_at": now,
        "ends_at": ends,
        "status": "RUNNING",
        "cost_snapshot": cost,
        "modifiers_snapshot": {"unit_cost": unit_cost, "unit_time_s": unit_time, "producer_level": plevel, "training_bonus": F.research_metric(research, "recruitment_throughput", spec)[0], "spec_version": spec.version},
        "idempotency_key": idempotency_key,
    }
    await db().jobs.insert_one(job)
    await scheduler.schedule(doc["world_id"], "BUILD_RESEARCH_RECRUIT_COMPLETE", ends, doc["_id"], f"job_complete:{job['_id']}", {"job_id": job["_id"]})
    await notifications.notify(doc["world_id"], player["_id"], "RECRUITMENT_JOB_STATE",
                               {"producer_id": producer, "unit_key": unit, "batch": count, "state": "STARTED", "eta": clock.iso(ends), "settlement_id": doc["_id"]},
                               dedupe_key=f"job_started:{job['_id']}", deep_link="army/recruitment")
    return job


async def sync_progress(job: dict) -> dict:
    """Credit units produced so far (progressive batch). Idempotent CAS on produced_so_far."""
    if job["status"] != "RUNNING":
        return job
    now = clock.now()
    started = clock.aware(job["started_at"])
    unit_time = float(job["modifiers_snapshot"]["unit_time_s"])
    produced_target = min(int(job["count"]), int((now - started).total_seconds() // max(1e-9, unit_time)))
    already = int(job.get("produced_so_far", 0))
    delta = produced_target - already
    if delta <= 0:
        return job
    updated = await db().jobs.find_one_and_update({"_id": job["_id"], "produced_so_far": already, "status": "RUNNING"}, {"$set": {"produced_so_far": produced_target}}, return_document=True)
    if updated is None:
        return await db().jobs.find_one({"_id": job["_id"]}) or job
    await db().settlements.update_one({"_id": job["settlement_id"]}, {"$inc": {f"army.{job['target']}": delta}})
    return updated


async def apply_complete(job: dict) -> None:
    doc = await db().settlements.find_one({"_id": job["settlement_id"]})
    if not doc or job["_id"] in doc.get("applied_effects", []):
        return
    remaining = int(job["count"]) - int(job.get("produced_so_far", 0))
    await db().jobs.update_one({"_id": job["_id"]}, {"$set": {"produced_so_far": int(job["count"])}})
    await db().settlements.update_one(
        {"_id": doc["_id"], "applied_effects": {"$ne": job["_id"]}},
        {"$inc": {f"army.{job['target']}": remaining, f"recruit_active.{job['producer']}": -1}, "$push": {"applied_effects": {"$each": [job["_id"]], "$slice": -500}}},
    )
    await notifications.notify(doc["world_id"], doc.get("owner_player_id"), "RECRUITMENT_JOB_STATE",
                               {"producer_id": job["producer"], "unit_key": job["target"], "batch": job["count"], "state": "COMPLETED", "eta": None, "settlement_id": doc["_id"]},
                               dedupe_key=f"job_done:{job['_id']}", deep_link="army/recruitment")
