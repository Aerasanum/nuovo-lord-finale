"""
Daily login reward (product addition, not in the Bible — keeps every Bible invariant: no free Rubies, resources are
credited through the warehouse cap, speed-ups never touch locked jobs):

  7-day streak cycle, realm day = UTC+1 calendar day (same clock as the map daylight). Missing a day resets to day 1.
    D1 resources ×1.0   D2 speed-up 30 min   D3 resources ×1.5   D4 speed-up 1 h
    D5 resources ×2.0   D6 speed-up 2 h      D7 chest: resources ×3 + speed-up 8 h
  Resource base = 8 % of the capital's warehouse capacity per resource (scales with progression, never overflows).
  Speed-ups accumulate as `players.speedup_minutes` and are spent on a running job (construction/research/recruit)
  with POST /jobs/{id}/speedup — same completion path as the scheduler (idempotent).
"""
from datetime import timedelta

from app.core import clock
from app.core.db import db
from app.core.errors import ApiError
from app.domain import construction, economy, scheduler, settlements
from app.domain import formulas as F

REALM_UTC_OFFSET_HOURS = 1
RESOURCE_BASE_PCT = 0.08
RESOURCES = tuple(F.RES)  # grain, wood, clay, iron, gold

CYCLE: list[dict] = [
    {"day": 1, "kind": "RESOURCES", "mult": 1.0},
    {"day": 2, "kind": "SPEEDUP", "minutes": 30},
    {"day": 3, "kind": "RESOURCES", "mult": 1.5},
    {"day": 4, "kind": "SPEEDUP", "minutes": 60},
    {"day": 5, "kind": "RESOURCES", "mult": 2.0},
    {"day": 6, "kind": "SPEEDUP", "minutes": 120},
    {"day": 7, "kind": "CHEST", "mult": 3.0, "minutes": 480},
]


def realm_day(dt) -> str:
    return (clock.aware(dt) + timedelta(hours=REALM_UTC_OFFSET_HOURS)).strftime("%Y-%m-%d")


def _next_reset_iso() -> str:
    local = clock.now() + timedelta(hours=REALM_UTC_OFFSET_HOURS)
    nxt = (local + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return clock.iso(nxt - timedelta(hours=REALM_UTC_OFFSET_HOURS))


async def _capital(player: dict) -> dict | None:
    """The Player's first (home) settlement receives the resources."""
    return await db().settlements.find_one({"owner_player_id": player["_id"]}, sort=[("created_at", 1), ("_id", 1)])


def _preview(cap: int, entry: dict) -> dict:
    out = {"day": entry["day"], "kind": entry["kind"], "resources": None, "speedup_minutes": None}
    if entry["kind"] in ("RESOURCES", "CHEST"):
        amt = int(cap * RESOURCE_BASE_PCT * entry["mult"])
        out["resources"] = {r: amt for r in RESOURCES}
    if entry["kind"] in ("SPEEDUP", "CHEST"):
        out["speedup_minutes"] = int(entry["minutes"])
    return out


def _state(player: dict) -> tuple[int, bool, int]:
    """(day to claim 1..7, claimable now, current streak)."""
    today = realm_day(clock.now())
    last_day = player.get("daily_last_day")
    streak = int(player.get("daily_streak", 0))
    if last_day == today:
        return ((streak - 1) % 7) + 1, False, streak
    yesterday = realm_day(clock.now() - timedelta(days=1))
    if last_day != yesterday:
        streak = 0
    return (streak % 7) + 1, True, streak


async def status(player: dict) -> dict:
    cap_doc = await _capital(player)
    cap = int(F.warehouse_capacity(cap_doc.get("buildings", {}), cap_doc.get("research", {})) if cap_doc else 0)
    day, claimable, streak = _state(player)
    return {
        "day": day,
        "claimable": claimable,
        "streak": streak,
        "next_reset_at": _next_reset_iso(),
        "speedup_minutes": int(player.get("speedup_minutes", 0)),
        "rewards": [_preview(cap, e) for e in CYCLE],
        "capital_settlement_id": cap_doc["_id"] if cap_doc else None,
    }


async def claim(player: dict) -> dict:
    day, claimable, streak = _state(player)
    if not claimable:
        raise ApiError("ALREADY_CLAIMED", "Today's reward was already claimed", 409, {"next_reset_at": _next_reset_iso()})
    today = realm_day(clock.now())
    # atomic: only one claim per realm day even under concurrent taps
    res = await db().players.update_one({"_id": player["_id"], "daily_last_day": {"$ne": today}}, {"$set": {"daily_last_day": today, "daily_streak": streak + 1, "daily_claimed_at": clock.now()}})
    if res.modified_count == 0:
        raise ApiError("ALREADY_CLAIMED", "Today's reward was already claimed", 409, {"next_reset_at": _next_reset_iso()})
    cap_doc = await _capital(player)
    cap = int(F.warehouse_capacity(cap_doc.get("buildings", {}), cap_doc.get("research", {})) if cap_doc else 0)
    reward = _preview(cap, CYCLE[day - 1])
    granted: dict = {"day": day, "kind": reward["kind"], "resources": None, "discarded": None, "speedup_minutes": None}
    if reward["resources"] and cap_doc:
        discarded = await economy.credit(cap_doc["_id"], reward["resources"], "daily_login")
        granted["resources"] = reward["resources"]
        granted["discarded"] = {k: v for k, v in discarded.items() if v}
    if reward["speedup_minutes"]:
        await db().players.update_one({"_id": player["_id"]}, {"$inc": {"speedup_minutes": int(reward["speedup_minutes"])}})
        granted["speedup_minutes"] = int(reward["speedup_minutes"])
    await db().audit.insert_one({"world_id": player["world_id"], "type": "daily_login_claim", "player_id": player["_id"], "day": day, "streak": streak + 1, "granted": granted, "at": clock.now()})
    fresh = await db().players.find_one({"_id": player["_id"]})
    return {"granted": granted, "status": await status(fresh)}


async def speedup(player: dict, job: dict, minutes: int) -> dict:
    """Spend speed-up minutes on a RUNNING job; completing early runs the scheduler's own handler (idempotent)."""
    have = int(player.get("speedup_minutes", 0))
    minutes = int(minutes)
    if minutes <= 0 or minutes > have:
        raise ApiError("INSUFFICIENT_SPEEDUP", "Not enough speed-up minutes", 409, {"have": have})
    if job.get("status") != "RUNNING":
        raise ApiError("JOB_NOT_RUNNING", "Job is not running", 409)
    now = clock.now()
    remaining = max(0.0, (clock.aware(job["ends_at"]) - now).total_seconds() / 60.0)
    use = int(min(minutes, max(1, round(remaining))))
    new_end = clock.aware(job["ends_at"]) - timedelta(minutes=use)
    finish_now = new_end <= now
    claimed = await db().jobs.find_one_and_update({"_id": job["_id"], "status": "RUNNING", "ends_at": job["ends_at"]}, {"$set": {"ends_at": now if finish_now else new_end}}, return_document=True)
    if not claimed:
        raise ApiError("JOB_NOT_RUNNING", "Job changed, retry", 409)
    await db().players.update_one({"_id": player["_id"]}, {"$inc": {"speedup_minutes": -use}})
    await db().audit.insert_one({"world_id": job["world_id"], "type": "speedup_spent", "player_id": player["_id"], "job_id": job["_id"], "minutes": use, "at": now})
    await scheduler.cancel(f"job_complete:{job['_id']}")
    if finish_now:
        await construction.on_job_complete({"payload": {"job_id": job["_id"]}})
    else:
        await scheduler.schedule(job["world_id"], "BUILD_RESEARCH_RECRUIT_COMPLETE", new_end, claimed.get("settlement_id", job["_id"]), f"job_complete:{job['_id']}", {"job_id": job["_id"]})
    fresh = await db().jobs.find_one({"_id": job["_id"]})
    return {"job": settlements.job_dto(fresh) if fresh else None, "spent_minutes": use, "speedup_minutes": have - use}
