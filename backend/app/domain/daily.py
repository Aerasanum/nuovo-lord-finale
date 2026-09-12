"""
Daily login reward (product addition, not in the Bible — keeps every Bible invariant: no free Rubies, resources are
credited through the warehouse cap):

  7-day streak cycle, realm day = UTC+1 calendar day (same clock as the map daylight). Missing a day resets to day 1.
  Resources only (Player decision — no speed-ups, nothing that touches the queues):
    D1 ×1.0   D2 ×1.25   D3 ×1.5   D4 ×1.75   D5 ×2.0   D6 ×2.5   D7 chest ×4.0
  Resource base = 8 % of the capital's warehouse capacity per resource (scales with progression, never overflows).
"""
from datetime import timedelta

from app.core import clock
from app.core.db import db
from app.core.errors import ApiError
from app.domain import economy
from app.domain import formulas as F

REALM_UTC_OFFSET_HOURS = 1
RESOURCE_BASE_PCT = 0.08
RESOURCES = tuple(F.RES)  # grain, wood, clay, iron, gold

CYCLE: list[dict] = [
    {"day": 1, "kind": "RESOURCES", "mult": 1.0},
    {"day": 2, "kind": "RESOURCES", "mult": 1.25},
    {"day": 3, "kind": "RESOURCES", "mult": 1.5},
    {"day": 4, "kind": "RESOURCES", "mult": 1.75},
    {"day": 5, "kind": "RESOURCES", "mult": 2.0},
    {"day": 6, "kind": "RESOURCES", "mult": 2.5},
    {"day": 7, "kind": "CHEST", "mult": 4.0},
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
    amt = int(cap * RESOURCE_BASE_PCT * entry["mult"])
    return {"day": entry["day"], "kind": entry["kind"], "mult": entry["mult"], "resources": {r: amt for r in RESOURCES}}


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
    granted: dict = {"day": day, "kind": reward["kind"], "mult": reward["mult"], "resources": None, "discarded": None}
    if cap_doc:
        discarded = await economy.credit(cap_doc["_id"], reward["resources"], "daily_login")
        granted["resources"] = reward["resources"]
        granted["discarded"] = {k: v for k, v in discarded.items() if v}
    await db().audit.insert_one({"world_id": player["world_id"], "type": "daily_login_claim", "player_id": player["_id"], "day": day, "streak": streak + 1, "granted": granted, "at": clock.now()})
    fresh = await db().players.find_one({"_id": player["_id"]})
    return {"granted": granted, "status": await status(fresh)}
