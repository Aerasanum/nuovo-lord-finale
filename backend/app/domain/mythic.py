"""Santuario Mitico + Unicorno (Bible §12, spec.mythic) — player-wide endgame power.

Sanctuary: one per Player per World (`players.sanctuary = {level 0..5, applied: [job_id]}`), shown and upgraded in the
current Mother (each upgrade occupies one of the Mother's construction queues; dedicated 5-row cost/time table, no rubies).
Requirements (spec.unlock_registry): Metropolis L30 + research «Studi Mitici» (30/30). Progress follows Mother
succession and is never captured (the conqueror gets nothing).

Unicorn: Sanctuary L5 → ritual `POST /unicorn/summon` (cost from the Mother, 7 fixed days, 1 ritual slot player-wide)
→ READY → «Ponte Arcobaleno»: a normal formation lands on an enemy Player settlement after a 10 s event, bypassing
distance/water/mountains/sentinels; the Unicorn is consumed when the battle starts (cooldown 720 h) and a victory
changes the owner immediately (no Loyalty, no Cart, retention 85 %, Mother succession, cap20). A failed revalidation
at arrival cancels the bridge: troops come back, Unicorn NOT consumed.
"""
from __future__ import annotations

import re
from datetime import timedelta

from app.core import clock
from app.core.db import db
from app.core.errors import ApiError, insufficient_resources
from app.core.spec import get_spec
from app.domain import notifications, scheduler
from app.domain import formulas as F
from app.domain.settlements import building_unlocked

SANCTUARY = "Santuario Mitico"
MAX_LEVEL = 5
BRIDGE_MISSION = "RAINBOW_BRIDGE"
UNICORN_READY = "UNICORN_READY"


# --------------------------------------------------------------------------- sanctuary table
def _days(text: str) -> int:
    m = re.match(r"\s*(\d+)\s*gg", text)
    return int(m.group(1)) if m else 1


def level_row(level: int) -> dict:
    rows = get_spec().mythic["sanctuary_levels"]
    r = next(x for x in rows if int(x["level"]) == level)
    minutes = _days(r["time"]) * 24 * 60
    cost = {k: int(r[k]) for k in F.RES}
    return {"level": level, "cost": cost, "duration_min": minutes, "base_cost": cost, "base_time_min": minutes, "effect": r["effect"], "fast_applied": False, "cost_multiplier": 1.0, "time_multiplier": 1.0, "research_time_reduction": 0.0}


def levels_table() -> list[dict]:
    return [{"level": int(r["level"]), "cost": {k: int(r[k]) for k in F.RES}, "duration_min": _days(r["time"]) * 24 * 60, "effect": r["effect"]} for r in get_spec().mythic["sanctuary_levels"]]


def sanctuary_level(player: dict) -> int:
    return int((player.get("sanctuary") or {}).get("level", 0))


async def sanctuary_job(player_id: str) -> dict | None:
    return await db().jobs.find_one({"player_id": player_id, "target": SANCTUARY, "status": "RUNNING"})


async def unlocked_for(player: dict, mother: dict | None) -> tuple[bool, dict]:
    """Bible §12.1: at least one own Metropolis L30 with Università 30 and «Studi Mitici» researched (the Mother first)."""
    if mother:
        ok, gate = building_unlocked(SANCTUARY, int(mother["level"]), mother.get("research", {}))
        if ok:
            return True, gate
    else:
        gate = building_unlocked(SANCTUARY, 0, {})[1]
    async for s in db().settlements.find({"owner_player_id": player["_id"], "level": {"$gte": 30}}, {"level": 1, "research": 1}):
        ok, g = building_unlocked(SANCTUARY, int(s["level"]), s.get("research", {}))
        if ok:
            return True, g
    return False, gate


async def catalog_entry(entry: dict, doc: dict, player: dict, jobs: list[dict], queue_full: bool) -> dict:
    """The «Santuario Mitico» row of the Mother's building catalog (player-wide level, dedicated table)."""
    lvl = sanctuary_level(player)
    is_mother = bool(doc.get("is_mother"))
    ok, gate = await unlocked_for(player, doc if is_mother else None)
    entry.update({"level": lvl, "unlock": gate, "max_level": MAX_LEVEL, "mythic": {"is_mother": is_mother, "levels": levels_table(), "unicorn": unicorn_dto(player)}})
    running = next((j for j in jobs if j.get("target") == SANCTUARY), None) or await sanctuary_job(player["_id"])
    if running:
        from app.domain.settlements import job_dto

        entry["state"] = "IN_PROGRESS"
        entry["job"] = job_dto(running)
    elif not is_mother:
        entry["state"] = "MOTHER_ONLY"
    elif not ok:
        entry["state"] = "LOCKED"
    elif lvl >= MAX_LEVEL:
        entry["state"] = "MAXED"
    else:
        entry["state"] = "AVAILABLE"
    if lvl < MAX_LEVEL:
        q = level_row(lvl + 1)
        entry["next"] = {"level": lvl + 1, "cost": q["cost"], "duration_min": q["duration_min"], "base_time_min": q["base_time_min"], "fast_applied": False, "research_time_reduction": 0.0, "effect": q["effect"]}
        missing = {r: q["cost"][r] - int(doc["resources"].get(r, 0)) for r in F.RES if int(doc["resources"].get(r, 0)) < q["cost"][r]}
        entry["missing"] = missing
        if entry["state"] == "AVAILABLE":
            if queue_full:
                entry["state"] = "BLOCKED_QUEUE"
            elif missing:
                entry["state"] = "BLOCKED_RESOURCES"
    return entry


async def start_sanctuary_upgrade(doc: dict, player: dict, idempotency_key: str | None) -> dict:
    from app.domain.construction import _existing_by_idempotency, _start_construction_job

    existing = await _existing_by_idempotency(doc["world_id"], player["_id"], idempotency_key)
    if existing:
        return existing
    if not doc.get("is_mother"):
        raise ApiError("MOTHER_ONLY", "The Santuario Mitico is built in the current Mother only", 409)
    ok, gate = await unlocked_for(player, doc)
    if not ok:
        raise ApiError("BUILDING_LOCKED", "Building prerequisites not met", 409, gate)
    lvl = sanctuary_level(player)
    if lvl >= MAX_LEVEL:
        raise ApiError("MAX_LEVEL", "The Santuario Mitico is complete", 409)
    if await sanctuary_job(player["_id"]):
        raise ApiError("TARGET_BUSY", "A Santuario upgrade is already running", 409, {"target": SANCTUARY})
    return await _start_construction_job(doc, player, "BUILDING", SANCTUARY, lvl + 1, level_row(lvl + 1), idempotency_key, extra={"player_wide": True})


async def apply_sanctuary_complete(job: dict) -> None:
    """Player-wide effect (idempotent through `sanctuary.applied`); the Mother queue is released only if it is still ours."""
    res = await db().players.update_one(
        {"_id": job["player_id"], "sanctuary.applied": {"$ne": job["_id"]}},
        {"$max": {"sanctuary.level": int(job["target_level"])}, "$push": {"sanctuary.applied": {"$each": [job["_id"]], "$slice": -20}}},
    )
    await db().settlements.update_one(
        {"_id": job["settlement_id"], "owner_player_id": job["player_id"], "applied_effects": {"$ne": job["_id"]}},
        {"$inc": {"construction_active": -1}, "$pull": {"busy_targets": SANCTUARY}, "$push": {"applied_effects": {"$each": [job["_id"]], "$slice": -500}}},
    )
    if res.modified_count:
        row = level_row(int(job["target_level"]))
        await notifications.notify(job["world_id"], job["player_id"], "BUILD_JOB_STATE", {"job_id": job["_id"], "entity_id": job["settlement_id"], "settlement_id": job["settlement_id"], "target": SANCTUARY, "target_level": job["target_level"], "state": "COMPLETED", "eta": None, "cost_or_refund": job["cost_snapshot"], "effect": row["effect"]}, dedupe_key=f"job_done:{job['_id']}", deep_link="settlement/build")


# --------------------------------------------------------------------------- unicorn
def _unicorn(player: dict) -> dict:
    return dict(player.get("unicorn") or {"state": "NONE"})


def unicorn_dto(player: dict) -> dict:
    u = _unicorn(player)
    spec = get_spec().mythic["unicorn"]
    now = clock.now()
    state = u.get("state", "NONE")
    cd = clock.aware(u.get("cooldown_until"))
    if state == "COOLDOWN" and cd and cd <= now:
        state = "NONE"
    return {
        "state": state,
        "ready_at": clock.iso(u.get("ready_at")) if u.get("ready_at") else None,
        "cooldown_until": clock.iso(cd) if state == "COOLDOWN" else None,
        "march_id": u.get("march_id"),
        "cost": {k: int(v) for k, v in spec["cost"].items()},
        "summon_days": int(spec["build_time_days"]),
        "cooldown_hours": int(spec["cooldown_hours_after_consumption"]),
        "event_seconds": int(spec["rainbow_event_seconds"]),
        "sanctuary_level": sanctuary_level(player),
        "can_summon": state == "NONE" and sanctuary_level(player) >= MAX_LEVEL,
    }


async def summon_unicorn(world: dict, player: dict, mother: dict) -> dict:
    spec = get_spec().mythic["unicorn"]
    if sanctuary_level(player) < MAX_LEVEL:
        raise ApiError("SANCTUARY_REQUIRED", "The Santuario Mitico must reach level 5", 409, {"level": sanctuary_level(player)})
    d = unicorn_dto(player)
    if d["state"] == "COOLDOWN":
        raise ApiError("UNICORN_COOLDOWN", "The Unicorn is recovering", 409, {"cooldown_until": d["cooldown_until"]})
    if d["state"] != "NONE":
        raise ApiError("UNICORN_ACTIVE", "Only one Unicorn may be queued, ready or in flight", 409, {"state": d["state"]})
    cost = {k: int(v) for k, v in spec["cost"].items()}
    now = clock.now()
    ready_at = now + timedelta(days=int(spec["build_time_days"]))
    # claim the ritual slot first (state machine), then pay from the Mother; roll back the claim if the vault is short
    claimed = await db().players.find_one_and_update(
        {"_id": player["_id"], "$or": [{"unicorn": {"$exists": False}}, {"unicorn.state": "NONE"}, {"unicorn.state": "COOLDOWN", "unicorn.cooldown_until": {"$lte": now}}]},
        {"$set": {"unicorn": {"state": "QUEUED", "summoned_at": now, "ready_at": ready_at, "cost_snapshot": cost}}},
    )
    if not claimed:
        raise ApiError("UNICORN_ACTIVE", "Only one Unicorn may be queued, ready or in flight", 409)
    flt: dict = {"_id": mother["_id"], "owner_player_id": player["_id"]}
    inc: dict = {}
    for r, v in cost.items():
        flt[f"resources.{r}"] = {"$gte": v}
        inc[f"resources.{r}"] = -v
    paid = await db().settlements.find_one_and_update(flt, {"$inc": inc})
    if not paid:
        await db().players.update_one({"_id": player["_id"], "unicorn.state": "QUEUED", "unicorn.summoned_at": now}, {"$set": {"unicorn": {"state": "NONE"}}})
        fresh = await db().settlements.find_one({"_id": mother["_id"]}) or mother
        from app.domain.economy import missing_for

        raise insufficient_resources(missing_for(fresh, cost))
    await scheduler.schedule(world["_id"], UNICORN_READY, ready_at, player["_id"], f"unicorn_ready:{player['_id']}:{int(now.timestamp())}", {"player_id": player["_id"]})
    await notifications.notify(world["_id"], player["_id"], "MYTHIC_RITUAL", {"state": "QUEUED", "ready_at": clock.iso(ready_at), "cost": cost}, dedupe_key=f"unicorn_queued:{player['_id']}:{int(now.timestamp())}", deep_link="settlement/build")
    return unicorn_dto(await db().players.find_one({"_id": player["_id"]}))


@scheduler.handler(UNICORN_READY)
async def on_unicorn_ready(evt: dict) -> None:
    pid = evt["payload"]["player_id"]
    res = await db().players.update_one({"_id": pid, "unicorn.state": "QUEUED", "unicorn.ready_at": {"$lte": clock.now() + timedelta(seconds=1)}}, {"$set": {"unicorn.state": "READY"}})
    if res.modified_count:
        await notifications.notify(evt["world_id"], pid, "MYTHIC_RITUAL", {"state": "READY"}, dedupe_key=f"unicorn_ready:{pid}:{evt['_id']}", deep_link="settlement/build")


async def claim_for_bridge(player_id: str, march_id: str) -> bool:
    res = await db().players.update_one({"_id": player_id, "unicorn.state": "READY"}, {"$set": {"unicorn.state": "IN_FLIGHT", "unicorn.march_id": march_id}})
    return bool(res.modified_count)


async def release_bridge(player_id: str, march_id: str) -> None:
    """Revalidation failed before the battle: the Unicorn is NOT consumed."""
    await db().players.update_one({"_id": player_id, "unicorn.state": "IN_FLIGHT", "unicorn.march_id": march_id}, {"$set": {"unicorn.state": "READY"}, "$unset": {"unicorn.march_id": ""}})


async def consume(player_id: str, march_id: str) -> bool:
    """The battle resolver starts: the Unicorn is spent and the exact 720 h cooldown begins (once per march)."""
    now = clock.now()
    hours = int(get_spec().mythic["unicorn"]["cooldown_hours_after_consumption"])
    res = await db().players.update_one(
        {"_id": player_id, "unicorn.state": "IN_FLIGHT", "unicorn.march_id": march_id},
        {"$set": {"unicorn.state": "COOLDOWN", "unicorn.cooldown_until": now + timedelta(hours=hours), "unicorn.consumed_at": now, "unicorn.consumed_march_id": march_id}, "$unset": {"unicorn.march_id": "", "unicorn.ready_at": ""}},
    )
    return bool(res.modified_count)
