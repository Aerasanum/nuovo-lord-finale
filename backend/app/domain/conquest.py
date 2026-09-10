"""Conquest: neutral owner change (no Loyalty/Cart), PvP loyalty, retention 85%, cap20 atomic reservation,
post-conquest wall auto-repair, Mother succession / elimination."""
from __future__ import annotations

import math
from datetime import timedelta

from app.core import clock
from app.core.db import db
from app.core.spec import get_spec
from app.domain import formulas as F
from app.domain import notifications, progress, scheduler, territory


async def reserve_slot(player_id: str) -> bool:
    """owned + reservations < 20, atomic (spec.conquest.reservation)."""
    cap = int(get_spec().world["max_settlements_per_player"])
    res = await db().players.update_one(
        {"_id": player_id, "$expr": {"$lt": [{"$add": ["$settlement_count", {"$ifNull": ["$settlement_reservations", 0]}]}, cap]}},
        {"$inc": {"settlement_reservations": 1}},
    )
    return res.modified_count == 1


async def release_slot(player_id: str) -> None:
    await db().players.update_one({"_id": player_id, "settlement_reservations": {"$gt": 0}}, {"$inc": {"settlement_reservations": -1}})


async def consume_reservation(player_id: str) -> bool:
    """Convert a reservation into an owned settlement; final atomic cap check (owned < 20)."""
    cap = int(get_spec().world["max_settlements_per_player"])
    res = await db().players.update_one(
        {"_id": player_id, "settlement_count": {"$lt": cap}},
        {"$inc": {"settlement_count": 1, "settlement_reservations": -1}},
    )
    return res.modified_count == 1


def _research_depth(key: str, spec) -> int:
    depth = 0
    stack = [(key, 0)]
    while stack:
        k, d = stack.pop()
        depth = max(depth, d)
        for p in spec.research_prereqs(k):
            stack.append((p, d + 1))
    return depth


def retain_research(research: dict[str, int]) -> dict[str, int]:
    """Keep floor(85%) of research level-points pruning deepest nodes first, DAG stays valid."""
    spec = get_spec()
    pct = int(spec.retention["pct"])
    res = {F.dec(k): int(v) for k, v in research.items() if int(v) > 0}
    total = sum(res.values())
    target = int(math.floor(total * pct / 100))
    depth = {k: _research_depth(k, spec) for k in res}
    while sum(res.values()) > target:
        # deepest first, then lexicographically last (stable deterministic tiebreak)
        k = sorted(res.keys(), key=lambda x: (-depth[x], x))[0]
        dependents = [d for d in res if k in spec.research_prereqs(d) and res[d] >= 1]
        if res[k] == 1 and dependents:
            # cannot drop below 1 while dependents exist; remove a dependent level instead
            k = sorted(dependents, key=lambda x: (-depth[x], x))[0]
        res[k] -= 1
        if res[k] <= 0:
            del res[k]
    return {F.enc(k): v for k, v in res.items()}


def apply_retention(doc: dict) -> dict:
    spec = get_spec()
    pct = int(spec.retention["pct"]) / 100.0
    old_level = int(doc["level"])
    new_level = max(1, int(math.floor(old_level * pct)))
    buildings = {}
    for name, lvl in doc.get("buildings", {}).items():
        if int(lvl) <= 0:
            continue
        nb = min(new_level, max(1, int(math.floor(int(lvl) * pct))))
        buildings[name] = nb
    buildings["Castello / Fortezza"] = new_level
    research = retain_research(doc.get("research", {}))
    cap = F.warehouse_capacity(buildings, research, spec)
    resources = {}
    discarded = {}
    for r in F.RES:
        v = int(math.floor(int(doc.get("resources", {}).get(r, 0)) * pct))
        resources[r] = min(v, cap)
        discarded[r] = v - resources[r]
    wall = F.wall_stats(int(buildings.get("Mura", 0)), research, spec)
    old_wall = doc.get("wall") or {}
    current = min(int(old_wall.get("current_hp", wall["max_hp"])), wall["max_hp"])
    return {
        "level": new_level,
        "buildings": buildings,
        "research": research,
        "resources": resources,
        "carry": {r: 0.0 for r in F.RES},
        "wall": {"level": wall["level"], "max_hp": wall["max_hp"], "current_hp": current},
        "loyalty": int(spec.conquest["loyalty_start"]),
        "_discarded": discarded,
    }


async def transfer_ownership(target: dict, new_player: dict, survivors: dict[str, int], battle_id: str) -> dict:
    """Atomic-by-state-machine owner change. Returns {changed: bool, reason}."""
    spec = get_spec()
    now = clock.now()
    effect = f"owner:{battle_id}"
    if effect in target.get("applied_effects", []):
        return {"changed": True, "reason": "ALREADY_APPLIED"}
    if not await consume_reservation(new_player["_id"]):
        return {"changed": False, "reason": "CAP20_REACHED"}
    ret = apply_retention(target)
    discarded = ret.pop("_discarded")
    old_owner = target.get("owner_player_id")
    updated = await db().settlements.find_one_and_update(
        {"_id": target["_id"], "owner_player_id": old_owner, "applied_effects": {"$ne": effect}},
        {
            "$set": {
                **ret,
                "kind": "PLAYER",
                "owner_player_id": new_player["_id"],
                "owner_house_name": new_player["house_name"],
                "owner_alliance_id": new_player.get("alliance_id"),
                "owner_alliance_tag": new_player.get("alliance_tag"),
                "pyramid_reward": new_player.get("pyramid_reward"),
                "name": f"{new_player['house_name']} · {target['x']},{target['y']}",
                "army": {k: int(v) for k, v in survivors.items() if int(v) > 0},
                "is_mother": False,
                "conquered_at": now,
                "last_accrued_at": now,
                "next_growth_at": None,
                "construction_active": 0,
                "research_active": 0,
                "recruit_active": {},
                "busy_targets": [],
                "busy_research": [],
                "ships": 0,
            },
            "$push": {"applied_effects": {"$each": [effect], "$slice": -500}},
        },
        return_document=True,
    )
    if updated is None:
        # owner changed concurrently; give the slot back
        await db().players.update_one({"_id": new_player["_id"]}, {"$inc": {"settlement_count": -1}})
        return {"changed": False, "reason": "TARGET_CHANGED"}
    # cancel running jobs of the conquered settlement (30% snapshot refund to old Mother is PvP-only)
    await db().jobs.update_many({"settlement_id": target["_id"], "status": "RUNNING"}, {"$set": {"status": "CANCELLED", "cancelled_at": now, "cancel_reason": "CONQUERED"}})
    if any(discarded.values()):
        await db().audit.insert_one({"world_id": target["world_id"], "type": "retention_overflow", "settlement_id": target["_id"], "discarded": discarded, "at": now})
    # territory: atomic recalculation for the anchor
    await territory.release_settlement(target["world_id"], target["_id"])
    await territory.claim_base(target["world_id"], updated)
    # player counters / shield
    await db().players.update_one({"_id": new_player["_id"]}, {"$inc": {"neutral_conquests": 1 if target["kind"] == "NEUTRAL" else 0}})
    await _check_shield_end(new_player["_id"])
    if old_owner:
        await db().players.update_one({"_id": old_owner}, {"$inc": {"settlement_count": -1}})
        await territory.release_player_sentinels_for_settlement(target["world_id"], target["_id"])
        if target.get("is_mother"):
            await mother_succession(old_owner, target["_id"])
    # post-conquest auto repair 5%/h
    await scheduler.schedule(target["world_id"], "WALL_AUTO_REPAIR", now + timedelta(hours=1), target["_id"], f"wall_repair:{target['_id']}:{int(now.timestamp())}:1", {"settlement_id": target["_id"], "tick": 1, "series": int(now.timestamp())})
    await notifications.notify(target["world_id"], new_player["_id"], "OWNERSHIP_CHANGED", {"settlement_id": target["_id"], "x": target["x"], "y": target["y"], "new_owner": new_player["_id"], "retention_pct": spec.retention["pct"], "new_level": ret["level"]}, dedupe_key=f"own:{battle_id}:{new_player['_id']}", deep_link="settlement")
    if old_owner:
        await notifications.notify(target["world_id"], old_owner, "OWNERSHIP_CHANGED", {"settlement_id": target["_id"], "x": target["x"], "y": target["y"], "new_owner": new_player["_id"], "lost": True}, dedupe_key=f"own:{battle_id}:{old_owner}", deep_link="settlement")
    await progress.on_conquest(target["world_id"], new_player["_id"], old_owner, target, battle_id)
    return {"changed": True, "reason": "OK", "new_level": ret["level"]}


async def _check_shield_end(player_id: str) -> None:
    spec = get_spec()
    p = await db().players.find_one({"_id": player_id})
    if not p or p.get("shield_ended_at"):
        return
    if int(p.get("neutral_conquests", 0)) >= int(spec.pvp_shield["neutral_conquests_to_end"]):
        await db().players.update_one({"_id": player_id, "shield_ended_at": None}, {"$set": {"shield_ended_at": clock.now(), "shield_end_reason": "NEUTRAL_CONQUEST_THRESHOLD"}})


def shield_active(player: dict) -> bool:
    spec = get_spec()
    if player.get("shield_ended_at"):
        return False
    created = clock.aware(player["created_at"])
    return clock.now() < created + timedelta(days=int(spec.pvp_shield["max_age_days"]))


async def mother_succession(player_id: str, lost_settlement_id: str) -> None:
    cur = db().settlements.find({"owner_player_id": player_id, "kind": "PLAYER", "_id": {"$ne": lost_settlement_id}})
    candidates = [s async for s in cur]
    if not candidates:
        await db().players.update_one({"_id": player_id}, {"$set": {"status": "ELIMINATED", "eliminated_at": clock.now()}})
        await db().marches.update_many({"player_id": player_id, "status": {"$in": ["OUTBOUND", "RETURNING"]}}, {"$set": {"status": "DISBANDED"}})
        return
    candidates.sort(key=lambda s: (-F.development_score(int(s["level"]), s.get("buildings", {}), s.get("research", {})), clock.aware(s.get("founded_at")) or clock.now(), s["_id"]))
    new_mother = candidates[0]
    await db().settlements.update_one({"_id": new_mother["_id"]}, {"$set": {"is_mother": True}})
    await db().players.update_one({"_id": player_id}, {"$set": {"mother_settlement_id": new_mother["_id"]}})


@scheduler.handler("WALL_AUTO_REPAIR")
async def on_wall_auto_repair(evt: dict) -> None:
    spec = get_spec()
    sid = evt["payload"]["settlement_id"]
    doc = await db().settlements.find_one({"_id": sid})
    if not doc or evt["effect_key"] in doc.get("applied_effects", []):
        return
    wall = doc.get("wall") or {}
    max_hp = int(wall.get("max_hp", 0))
    cur = int(wall.get("current_hp", 0))
    if cur >= max_hp:
        return
    step = int(math.floor(max_hp * int(spec.conquest["post_conquest_wall_auto_repair_pct_max_hp_per_hour"]) / 100))
    new_hp = min(max_hp, cur + step)
    await db().settlements.update_one({"_id": sid, "applied_effects": {"$ne": evt["effect_key"]}}, {"$set": {"wall.current_hp": new_hp}, "$push": {"applied_effects": {"$each": [evt["effect_key"]], "$slice": -500}}})
    if new_hp < max_hp:
        tick = int(evt["payload"]["tick"]) + 1
        series = evt["payload"]["series"]
        await scheduler.schedule(doc["world_id"], "WALL_AUTO_REPAIR", clock.aware(evt["scheduled_at"]) + timedelta(hours=1), sid, f"wall_repair:{sid}:{series}:{tick}", {"settlement_id": sid, "tick": tick, "series": series})
