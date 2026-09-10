"""Personal missions (Bible §22 / §39, STC-34/35/37; spec.missions).

TIMED_MISSION: troops leave the origin garrison for `duration_hours`, reward = local production snapshot taken at start
× hours (all 5 resources, clamped to the reward-target Warehouse cap — overflow audited), + Prestige. Max 2 active per
Player, max 1 per key, no cancel, cooldown from completion. If the origin is lost meanwhile the completion routes to the
current Mother, else the nearest own settlement; an eliminated Player gets nothing and the troops disband.
"""
from __future__ import annotations

import hashlib
import uuid
from datetime import timedelta

from app.core import clock
from app.core.db import db
from app.core.errors import ApiError
from app.core.spec import get_spec
from app.domain import economy, formulas as F, notifications, progress, scheduler

TIMED = "TIMED_MISSION"
FALCO = "Falco"


def catalog() -> list[dict]:
    return [m for m in get_spec().missions["catalog"] if m["kind"] == TIMED]


def _entry(key: str) -> dict:
    m = next((m for m in catalog() if m["key"] == key), None)
    if not m:
        raise ApiError("UNKNOWN_MISSION", "Unknown or not yet available mission", 400, {"available": [m["key"] for m in catalog()]})
    return m


def _check_requirements(m: dict, origin: dict, units: dict[str, int]) -> None:
    req = m.get("requirements", {})
    total = sum(units.values())
    spec = get_spec()
    for u in units:
        if u not in spec.units_by_name:
            raise ApiError("INVALID_UNITS", f"Unknown unit {u}", 400)
    allowed = req.get("allowed_units")
    if allowed and any(u not in allowed for u in units):
        raise ApiError("MISSION_UNITS_NOT_ALLOWED", "Only these units may join this mission", 400, {"allowed_units": allowed})
    if total < int(req.get("minimum_units", 1)):
        raise ApiError("MISSION_MIN_UNITS", "Not enough units for this mission", 400, {"minimum_units": req.get("minimum_units", 1), "sent": total})
    if req.get("mixed_units_required") and len([u for u, c in units.items() if c > 0]) < 2:
        raise ApiError("MISSION_MIXED_UNITS", "This mission needs a mixed force (≥2 unit types)", 400)
    if req.get("Falco_min") and int(units.get(FALCO, 0)) < int(req["Falco_min"]):
        raise ApiError("MISSION_NEEDS_FALCO", "This mission needs at least one Falco", 400, {"Falco_min": req["Falco_min"]})
    if req.get("research_key") and F.rget(origin.get("research", {}), req["research_key"]) < int(req.get("research_min_level", 1)):
        raise ApiError("MISSION_RESEARCH_REQUIRED", "Research requirement not met", 409, {"research_key": req["research_key"], "min_level": req.get("research_min_level", 1)})


async def availability(player: dict, world_id: str) -> dict:
    """Per-key availability for the UI: active mission, cooldown until, slots left."""
    active = [m async for m in db().missions.find({"world_id": world_id, "player_id": player["_id"], "status": "ACTIVE"})]
    cds = player.get("mission_cooldowns") or {}
    now = clock.now()
    spec = get_spec().missions
    out = []
    for m in catalog():
        cd = clock.aware(cds.get(m["key"]))
        out.append(
            {
                **{k: m[k] for k in ("key", "name", "kind", "duration_hours", "requirements", "reward", "cooldown_hours")},
                "cooldown_until": clock.iso(cd) if cd and cd > now else None,
                "active_mission_id": next((a["_id"] for a in active if a["key"] == m["key"]), None),
            }
        )
    return {"catalog": out, "active": [dto(a) for a in active], "slots_left": max(0, int(spec["max_simultaneous_per_player"]) - len(active)), "max_simultaneous": int(spec["max_simultaneous_per_player"])}


async def start(player: dict, origin: dict, key: str, units: dict[str, int], idempotency_key: str | None) -> dict:
    spec = get_spec().missions
    m = _entry(key)
    units = {u: int(c) for u, c in (units or {}).items() if int(c) > 0}
    if not units:
        raise ApiError("INVALID_UNITS", "Send at least one unit", 400)
    if idempotency_key:
        dup = await db().missions.find_one({"player_id": player["_id"], "idempotency_key": idempotency_key})
        if dup:
            return dto(dup)
    _check_requirements(m, origin, units)
    now = clock.now()
    cd = clock.aware((player.get("mission_cooldowns") or {}).get(key))
    if cd and cd > now:
        raise ApiError("MISSION_COOLDOWN", "Mission on cooldown", 409, {"cooldown_until": clock.iso(cd)})
    active = [a async for a in db().missions.find({"world_id": origin["world_id"], "player_id": player["_id"], "status": "ACTIVE"})]
    if len(active) >= int(spec["max_simultaneous_per_player"]):
        raise ApiError("MISSION_SLOTS_FULL", "Maximum simultaneous missions reached", 409, {"max": spec["max_simultaneous_per_player"]})
    if any(a["key"] == key for a in active) and int(spec["max_same_mission_type_simultaneous"]) <= 1:
        raise ApiError("MISSION_TYPE_ACTIVE", "This mission type is already active", 409)
    # atomically remove the troops from the garrison (STC: troops unavailable for the whole duration)
    flt: dict = {"_id": origin["_id"], "owner_player_id": player["_id"]}
    inc: dict = {}
    for u, c in units.items():
        flt[f"army.{u}"] = {"$gte": c}
        inc[f"army.{u}"] = -c
    res = await db().settlements.update_one(flt, {"$inc": inc})
    if res.modified_count != 1:
        raise ApiError("INSUFFICIENT_UNITS", "Not enough units in the garrison", 409)
    rates = economy.snapshot_rates(origin)  # reward snapshot at mission start (STC-37)
    ends = now + timedelta(hours=float(m["duration_hours"]))
    doc = {
        "_id": f"msn_{uuid.uuid4().hex[:16]}",
        "world_id": origin["world_id"],
        "player_id": player["_id"],
        "key": key,
        "name": m["name"],
        "origin_settlement_id": origin["_id"],
        "origin_xy": [origin["x"], origin["y"]],
        "units": units,
        "status": "ACTIVE",
        "started_at": now,
        "ends_at": ends,
        "production_snapshot": rates["production_per_h"],
        "idempotency_key": idempotency_key,
        "reward_result": None,
    }
    await db().missions.insert_one(doc)
    await scheduler.schedule(origin["world_id"], "MISSION_COMPLETE", ends, doc["_id"], f"mission_complete:{doc['_id']}", {"mission_id": doc["_id"]})
    return dto(doc)


async def _destination(m: dict, player: dict | None) -> dict | None:
    origin = await db().settlements.find_one({"_id": m["origin_settlement_id"]})
    if origin and origin.get("owner_player_id") == m["player_id"]:
        return origin
    if not player:
        return None
    mother = await db().settlements.find_one({"_id": player.get("mother_settlement_id"), "owner_player_id": m["player_id"]})
    if mother:
        return mother
    best = None
    ox, oy = m["origin_xy"]
    async for s in db().settlements.find({"world_id": m["world_id"], "owner_player_id": m["player_id"], "kind": "PLAYER"}):
        d = max(abs(s["x"] - ox), abs(s["y"] - oy))
        if best is None or d < best[0]:
            best = (d, s)
    return best[1] if best else None


def _seeded_cosmetic(mission_id: str, pct: int) -> bool:
    h = int(hashlib.sha256(mission_id.encode()).hexdigest()[:8], 16)
    return (h % 10000) < pct * 100


async def _intel_snapshot(m: dict, dest: dict, units: dict[str, int]) -> dict:
    """Ricognizione distante: deterministic intelligence snapshot of the settlements around the origin (radius 12)."""
    from app.domain import intel  # local import: intel depends on marches

    ox, oy = m["origin_xy"]
    r = 12
    score = intel.score(dest.get("research", {}), {}, None)
    rows = []
    async for s in db().settlements.find({"world_id": m["world_id"], "kind": {"$in": ["PLAYER", "NEUTRAL"]}, "x": {"$gte": ox - r, "$lte": ox + r}, "y": {"$gte": oy - r, "$lte": oy + r}, "owner_player_id": {"$ne": m["player_id"]}}).limit(40):
        rows.append({"settlement_id": s["_id"], "name": s.get("name"), "x": s["x"], "y": s["y"], "level": int(s.get("level", 1)), "kind": s["kind"], "wall_level": int((s.get("wall") or {}).get("level", 0)), "garrison_total": sum(int(v) for v in (s.get("army") or {}).values())})
    rows.sort(key=lambda z: max(abs(z["x"] - ox), abs(z["y"] - oy)))
    return {"radius": r, "falcons": int(units.get(FALCO, 0)), "intel_score": score, "settlements": rows[:20], "taken_at": clock.iso(clock.now())}


@scheduler.handler("MISSION_COMPLETE")
async def on_complete(evt: dict) -> None:
    m = await db().missions.find_one({"_id": evt["payload"]["mission_id"]})
    if not m or m["status"] != "ACTIVE":
        return
    cat = _entry(m["key"])
    player = await db().players.find_one({"_id": m["player_id"]})
    now = clock.now()
    dest = await _destination(m, player) if player and player.get("status") != "ELIMINATED" else None
    result: dict = {"destination_settlement_id": None, "resources": {}, "overflow": {}, "prestige": 0, "disbanded": False}
    if dest is None:
        result["disbanded"] = True  # eliminated Player: no reward, troops disband (STC-35)
    else:
        result["destination_settlement_id"] = dest["_id"]
        units = {u: int(c) for u, c in m["units"].items() if int(c) > 0}
        if units:
            await db().settlements.update_one({"_id": dest["_id"]}, {"$inc": {f"army.{u}": c for u, c in units.items()}})
        rw = cat["reward"]
        hours = float(rw.get("local_production_hours_all_5_resources", 0))
        amounts = {r: int(round(float(m["production_snapshot"].get(r, 0)) * hours)) for r in F.RES} if hours > 0 else {}
        if rw.get("additional_gold_production_hours"):
            amounts["gold"] = amounts.get("gold", 0) + int(round(float(m["production_snapshot"].get("gold", 0)) * float(rw["additional_gold_production_hours"])))
        if amounts:
            result["overflow"] = await economy.credit(dest["_id"], amounts, f"mission_{m['key']}")
            result["resources"] = amounts
        prestige = int(rw.get("prestige", 0))
        if rw.get("seeded_cosmetic_chance_pct"):
            if _seeded_cosmetic(m["_id"], int(rw["seeded_cosmetic_chance_pct"])):
                result["cosmetic_unlock"] = f"token_{m['key']}"
                await db().players.update_one({"_id": m["player_id"]}, {"$addToSet": {"cosmetics": result["cosmetic_unlock"]}})
            else:
                prestige += int((rw.get("fallback_if_no_cosmetic") or {}).get("prestige", 0))
        if rw.get("intelligence_snapshot"):
            result["intel"] = await _intel_snapshot(m, dest, units)
        result["prestige"] = prestige
        await progress.award_prestige(m["world_id"], m["player_id"], prestige, f"mission_{m['key']}", m["_id"])
    cooldown_until = now + timedelta(hours=float(cat["cooldown_hours"]))  # cooldown starts at completion (STC-34)
    upd = await db().missions.update_one({"_id": m["_id"], "status": "ACTIVE"}, {"$set": {"status": "COMPLETED", "completed_at": now, "reward_result": result, "completion_id": f"cmp_{m['_id']}"}})
    if upd.modified_count != 1:
        return
    await db().players.update_one({"_id": m["player_id"]}, {"$set": {f"mission_cooldowns.{m['key']}": cooldown_until}, "$inc": {"missions_completed": 1}})
    if not result["disbanded"]:
        from app.domain import alliances  # Emerald source: first personal mission per member per UTC day (STRUCTURED only)

        await alliances.on_mission_completed(m["world_id"], m["player_id"], m["_id"])
    await notifications.notify(m["world_id"], m["player_id"], "MISSION_COMPLETED", {"mission_key": m["key"], "name": m["name"], "reward": {k: v for k, v in result.items() if k != "intel"}, "completion_id": f"cmp_{m['_id']}"}, dedupe_key=f"mission_done:{m['_id']}", deep_link="missions")


def dto(m: dict) -> dict:
    return {
        "mission_id": m["_id"],
        "key": m["key"],
        "name": m["name"],
        "origin_settlement_id": m["origin_settlement_id"],
        "origin_xy": m.get("origin_xy"),
        "units": m.get("units", {}),
        "status": m["status"],
        "started_at": clock.iso(m.get("started_at")),
        "ends_at": clock.iso(m.get("ends_at")),
        "completed_at": clock.iso(m.get("completed_at")),
        "reward_result": m.get("reward_result"),
    }


async def history(world_id: str, player_id: str, limit: int = 10) -> list[dict]:
    cur = db().missions.find({"world_id": world_id, "player_id": player_id, "status": "COMPLETED"}).sort("completed_at", -1).limit(limit)
    return [dto(m) async for m in cur]
