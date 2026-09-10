"""Construction runtime: 2 shared queues per settlement, FAST early-game snapshot, exact canonical rows,
idempotent completion and 70% cancel refund."""
from __future__ import annotations

from datetime import timedelta

from app.core import clock
from app.core.db import db
from app.core.errors import ApiError, insufficient_resources, queue_full
from app.core.spec import get_spec
from app.domain import economy, notifications, progress, scheduler
from app.domain import formulas as F
from app.domain.settlements import building_unlocked, job_dto, new_id, owned_count, running_jobs

CONSTRUCTION_KINDS = ("BUILDING", "SETTLEMENT_UPGRADE", "SENTINEL_BUILD")


async def _existing_by_idempotency(world_id: str, player_id: str, key: str | None) -> dict | None:
    if not key:
        return None
    return await db().jobs.find_one({"world_id": world_id, "player_id": player_id, "idempotency_key": key})


async def _start_construction_job(doc: dict, player: dict, kind: str, target: str, target_level: int, quote: dict, idempotency_key: str | None, extra: dict | None = None) -> dict:
    spec = get_spec()
    queues = int(spec.construction_runtime["queues_per_settlement"])
    now = clock.now()
    ends = now + timedelta(minutes=int(quote["duration_min"]))
    job_id = new_id("job")
    cost = quote["cost"]
    flt: dict = {"_id": doc["_id"], "construction_active": {"$not": {"$gte": queues}}, "busy_targets": {"$ne": target}}
    inc: dict = {"construction_active": 1}
    for r, v in cost.items():
        if v > 0:
            flt[f"resources.{r}"] = {"$gte": int(v)}
            inc[f"resources.{r}"] = -int(v)
    # single atomic operation: queue capacity + no duplicate target + resource spend
    res = await db().settlements.find_one_and_update(flt, {"$inc": inc, "$addToSet": {"busy_targets": target}})
    if res is None:
        fresh = await db().settlements.find_one({"_id": doc["_id"]})
        if fresh is None:
            raise ApiError("SETTLEMENT_NOT_FOUND", "Settlement not found", 404)
        if int(fresh.get("construction_active", 0)) >= queues:
            raise queue_full()
        if target in fresh.get("busy_targets", []):
            raise ApiError("TARGET_BUSY", "A job for this target is already running", 409, {"target": target})
        raise insufficient_resources(economy.missing_for(fresh, cost))
    job = {
        "_id": job_id,
        "world_id": doc["world_id"],
        "player_id": player["_id"],
        "settlement_id": doc["_id"],
        "kind": kind,
        "queue": "construction",
        "target": target,
        "target_level": target_level,
        "started_at": now,
        "ends_at": ends,
        "status": "RUNNING",
        "cost_snapshot": cost,
        "modifiers_snapshot": {
            "fast_applied": quote.get("fast_applied", False),
            "cost_multiplier": quote.get("cost_multiplier", 1.0),
            "time_multiplier": quote.get("time_multiplier", 1.0),
            "research_time_reduction": quote.get("research_time_reduction", 0.0),
            "base_cost": quote.get("base_cost"),
            "base_time_min": quote.get("base_time_min"),
            "spec_version": spec.version,
        },
        "idempotency_key": idempotency_key,
        **(extra or {}),
    }
    await db().jobs.insert_one(job)
    await scheduler.schedule(doc["world_id"], "BUILD_RESEARCH_RECRUIT_COMPLETE", ends, doc["_id"], f"job_complete:{job_id}", {"job_id": job_id})
    await notifications.notify(
        doc["world_id"], player["_id"], "BUILD_JOB_STATE" if kind != "SETTLEMENT_UPGRADE" else "SETTLEMENT_UPGRADE_STATE",
        {"job_id": job_id, "entity_id": doc["_id"], "settlement_id": doc["_id"], "target": target, "state": "STARTED", "eta": clock.iso(ends), "cost_or_refund": cost, "target_level": target_level},
        dedupe_key=f"job_started:{job_id}", deep_link="settlement/build",
    )
    return job


async def start_building(doc: dict, player: dict, name: str, idempotency_key: str | None) -> dict:
    spec = get_spec()
    if name not in spec.buildings_by_name:
        raise ApiError("UNKNOWN_BUILDING", "Unknown building", 404, {"name": name})
    if name == "Castello / Fortezza":
        raise ApiError("USE_SETTLEMENT_UPGRADE", "Upgrade the settlement instead", 400)
    if name == "Santuario Mitico":
        raise ApiError("NOT_IN_VERTICAL_SLICE", "Santuario Mitico uses its dedicated table (not yet enabled)", 400)
    existing = await _existing_by_idempotency(doc["world_id"], player["_id"], idempotency_key)
    if existing:
        return existing
    level = int(doc["level"])
    cur = int(doc["buildings"].get(name, 0))
    target = cur + 1
    unlocked, gate = building_unlocked(name, level, doc.get("research", {}))
    if not unlocked:
        raise ApiError("BUILDING_LOCKED", "Building prerequisites not met", 409, gate)
    if target > 30:
        raise ApiError("MAX_LEVEL", "Building is at max level", 409)
    if target > level:
        raise ApiError("BUILDING_CAP_SETTLEMENT_LEVEL", "No building may exceed the settlement level", 409, {"settlement_level": level})
    owned = await owned_count(doc["world_id"], player["_id"])
    quote = F.construction_cost_time(name, target, owned, doc.get("research", {}), spec)
    return await _start_construction_job(doc, player, "BUILDING", name, target, quote, idempotency_key)


async def start_settlement_upgrade(doc: dict, player: dict, idempotency_key: str | None) -> dict:
    spec = get_spec()
    existing = await _existing_by_idempotency(doc["world_id"], player["_id"], idempotency_key)
    if existing:
        return existing
    level = int(doc["level"])
    target = level + 1
    if target > 30:
        raise ApiError("MAX_LEVEL", "Settlement is a Metropolis already", 409)
    for name, lvl in spec.settlement_requirements(target):
        have = min(int(doc["buildings"].get(p, 0)) for p in spec.PRODUCERS) if name == "__PRODUCERS__" else int(doc["buildings"].get(name, 0))
        if have < lvl:
            raise ApiError("REQUIREMENTS_NOT_MET", "Settlement upgrade requirements not met", 409, {"building": name, "required": lvl, "have": have})
    owned = await owned_count(doc["world_id"], player["_id"])
    quote = F.construction_cost_time("Castello / Fortezza", target, owned, doc.get("research", {}), spec)
    return await _start_construction_job(doc, player, "SETTLEMENT_UPGRADE", "Castello / Fortezza", target, quote, idempotency_key)


async def cancel_job(job: dict, player_id: str) -> dict:
    if job["player_id"] != player_id:
        raise ApiError("NOT_OWNER", "Not your job", 403)
    updated = await db().jobs.find_one_and_update({"_id": job["_id"], "status": "RUNNING"}, {"$set": {"status": "CANCELLED", "cancelled_at": clock.now()}}, return_document=True)
    if not updated:
        raise ApiError("JOB_NOT_RUNNING", "Job already finished", 409)
    await scheduler.cancel(f"job_complete:{job['_id']}")
    pct = int(get_spec().cancellation_policy["resource_refund_pct"])
    kind = job["kind"]
    if kind == "RECRUIT":
        produced = int(job.get("produced_so_far", 0))
        remaining = max(0, int(job["count"]) - produced)
        unit_cost = job["modifiers_snapshot"]["unit_cost"]
        refund = {r: int(unit_cost[r] * remaining * pct / 100) for r in F.RES}
        release = {"$inc": {f"recruit_active.{job['producer']}": -1}}
    else:
        refund = {r: int(job["cost_snapshot"].get(r, 0) * pct / 100) for r in F.RES}
        if kind == "RESEARCH":
            release = {"$inc": {"research_active": -1}, "$pull": {"busy_research": job["target"]}}
        else:
            release = {"$inc": {"construction_active": -1}, "$pull": {"busy_targets": job["target"]}}
    await db().settlements.update_one({"_id": job["settlement_id"]}, release)
    await economy.credit(job["settlement_id"], refund, "cancel_refund")
    await notifications.notify(job["world_id"], player_id, "BUILD_JOB_STATE" if kind in CONSTRUCTION_KINDS else f"{kind}_JOB_STATE",
                               {"job_id": job["_id"], "entity_id": job["settlement_id"], "state": "CANCELLED", "cost_or_refund": refund}, dedupe_key=f"job_cancelled:{job['_id']}")
    return {"job": job_dto(updated), "refund": refund}


@scheduler.handler("BUILD_RESEARCH_RECRUIT_COMPLETE")
async def on_job_complete(evt: dict) -> None:
    from app.domain import recruitment, research, sentinels  # local import: avoids cycles

    job = await db().jobs.find_one({"_id": evt["payload"]["job_id"]})
    if not job or job["status"] not in ("RUNNING", "APPLYING"):
        return
    kind = job["kind"]
    if kind == "BUILDING":
        await _apply_building_complete(job)
    elif kind == "SETTLEMENT_UPGRADE":
        await _apply_settlement_upgrade(job)
    elif kind == "RESEARCH":
        await research.apply_complete(job)
    elif kind == "RECRUIT":
        await recruitment.apply_complete(job)
    elif kind == "SENTINEL_BUILD":
        await sentinels.apply_build_complete(job)
    elif kind == "SHIP":
        from app.domain import navy

        await navy.apply_complete(job)
    await db().jobs.update_one({"_id": job["_id"], "status": {"$in": ["RUNNING", "APPLYING"]}}, {"$set": {"status": "COMPLETED", "completed_at": clock.now()}})


def _wall_update_fields(doc: dict, new_wall_level: int, research: dict) -> dict:
    """Recompute wall max HP preserving absolute missing HP (STC-03)."""
    spec = get_spec()
    old = doc.get("wall") or {"level": 0, "current_hp": 0, "max_hp": 0}
    missing = max(0, int(old.get("max_hp", 0)) - int(old.get("current_hp", 0)))
    stats = F.wall_stats(new_wall_level, research, spec)
    new_max = stats["max_hp"]
    return {"wall": {"level": new_wall_level, "max_hp": new_max, "current_hp": max(0, new_max - missing)}}


async def _apply_building_complete(job: dict) -> None:
    doc = await db().settlements.find_one({"_id": job["settlement_id"]})
    if not doc or job["_id"] in doc.get("applied_effects", []):
        return
    sets = {f"buildings.{job['target']}": int(job["target_level"])}
    if job["target"] == "Mura":
        sets.update(_wall_update_fields(doc, int(job["target_level"]), doc.get("research", {})))
    await db().settlements.update_one(
        {"_id": doc["_id"], "applied_effects": {"$ne": job["_id"]}},
        {"$set": sets, "$inc": {"construction_active": -1}, "$pull": {"busy_targets": job["target"]}, "$push": {"applied_effects": {"$each": [job["_id"]], "$slice": -500}}},
    )
    await notifications.notify(doc["world_id"], doc.get("owner_player_id"), "BUILD_JOB_STATE",
                               {"job_id": job["_id"], "entity_id": doc["_id"], "settlement_id": doc["_id"], "target": job["target"], "target_level": job["target_level"], "state": "COMPLETED", "eta": None, "cost_or_refund": job["cost_snapshot"]},
                               dedupe_key=f"job_done:{job['_id']}", deep_link="settlement/build")


async def _apply_settlement_upgrade(job: dict) -> None:
    doc = await db().settlements.find_one({"_id": job["settlement_id"]})
    if not doc or job["_id"] in doc.get("applied_effects", []):
        return
    new_level = int(job["target_level"])
    await db().settlements.update_one(
        {"_id": doc["_id"], "applied_effects": {"$ne": job["_id"]}},
        {"$set": {"level": new_level, "buildings.Castello / Fortezza": new_level}, "$inc": {"construction_active": -1}, "$pull": {"busy_targets": job["target"]}, "$push": {"applied_effects": {"$each": [job["_id"]], "$slice": -500}}},
    )
    prog = get_spec().settlement_progression[new_level]
    await progress.on_settlement_level(doc["world_id"], doc.get("owner_player_id"), doc, new_level, job["_id"])
    await notifications.notify(doc["world_id"], doc.get("owner_player_id"), "SETTLEMENT_UPGRADE_STATE",
                               {"settlement_id": doc["_id"], "old_level": new_level - 1, "new_level": new_level, "state": "COMPLETED", "eta": None, "unlocks": prog["unlocks"]},
                               dedupe_key=f"job_done:{job['_id']}", deep_link="settlement")


async def list_jobs(settlement_id: str) -> list[dict]:
    return [job_dto(j) for j in await running_jobs(settlement_id)]
