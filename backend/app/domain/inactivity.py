"""Inactivity elimination — owner's rule layered on Bibbia §18 / spec.inactivity_transition.

Activity = any authenticated request to a world endpoint (`players.last_active_at`, throttled write in worlds.get_player).

* EARLY phase — while the World is younger than `early_phase_days` (30): a Player who stays away `early_timeout_days`
  (3) consecutive days is REMOVED so his seat goes to a newcomer: the spawn-slot castle(s) become FREE PLAYER_SLOTs
  again (with their reservation radius), conquered ex-neutrals turn Neutral, `player_count` is decremented.
* MATURE phase — from day 30 on the canonical 120 days apply (spec.inactivity_transition.timeout_days): every castle
  is converted to a Neutral per spec.neutral_conversion.player_to_neutral_on_inactivity (levels/buildings kept, wall HP
  kept, resources 50%, garrison 100·L², territory + Sentinels removed, research frozen); the seat does NOT reopen.

Either way: marches disbanded, jobs cancelled, alliance left, Casata marked ELIMINATED (reason INACTIVE_EARLY|INACTIVE),
Chronicle entry. One day before, an INACTIVITY_WARNING lands in the Inbox (once per inactivity period). One idempotent sweep event per World every `sweep_hours`; QA fixtures (`inactivity_exempt`) and the
Osservatore (`view_all_regions`) are never swept. Per-world overrides live in `worlds.inactivity_config` (QA only; when it
carries `only_player_ids` the sweep is confined to those Players — a short test threshold must never hit the whole World).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

from app.core import clock
from app.core.db import db
from app.core.spec import get_spec
from app.domain import alliances, grande_mondo, notifications, progress, scheduler, territory
from app.domain.pathfinding import CHUNK, load_terrain
from app.domain.return_summary import RETURN_GAP_H
from app.domain.settlements import build_neutral_state

log = logging.getLogger("inactivity")
EVENT = "INACTIVITY_SWEEP"
TOUCH_THROTTLE_S = 600
WARN_DAYS_BEFORE = 1.0  # Inbox warning one day before the elimination (sweeps run every `sweep_hours`)
DEFAULTS = {"early_phase_days": 30, "early_timeout_days": 3, "sweep_hours": 6}


def config(world: dict) -> dict:
    return {**DEFAULTS, "timeout_days": int(get_spec().inactivity_transition["timeout_days"]), **(world.get("inactivity_config") or {})}


def rule(world: dict) -> dict | None:
    """Threshold in force right now for this World (None while it is still generating)."""
    opened = clock.aware(world.get("opened_at"))
    if not opened:
        return None
    cfg = config(world)
    early_until = opened + timedelta(days=float(cfg["early_phase_days"]))
    early = clock.now() < early_until
    return {
        "phase": "EARLY" if early else "MATURE",
        "timeout_days": float(cfg["early_timeout_days"]) if early else float(cfg["timeout_days"]),
        "mode": "REMOVE" if early else "NEUTRAL",
        "early_phase_until": clock.iso(early_until),
        "early_phase_days": int(cfg["early_phase_days"]),
        "early_timeout_days": float(cfg["early_timeout_days"]),
        "timeout_days_after": int(cfg["timeout_days"]),
    }


def last_active(player: dict) -> datetime:
    return clock.aware(player.get("last_active_at")) or clock.aware(player["created_at"])


async def touch(player: dict) -> None:
    """Record activity (throttled: at most one write per TOUCH_THROTTLE_S per Player). A gap of ≥ RETURN_GAP_H hours
    also arms the «Riepilogo rientro» (return_summary.py) with the previous activity timestamp."""
    now = clock.now()
    prev = last_active(player)
    gap = (now - prev).total_seconds()
    if gap < TOUCH_THROTTLE_S:
        return
    sets: dict = {"last_active_at": now}
    if gap >= RETURN_GAP_H * 3600 and not player.get("return_pending"):
        sets["return_since"] = prev
        sets["return_pending"] = True
        player["return_since"] = prev
        player["return_pending"] = True
    await db().players.update_one({"_id": player["_id"]}, {"$set": sets})
    player["last_active_at"] = now


def _sweep_key(world_id: str, at: datetime) -> str:
    return f"inactivity:{world_id}:{int(at.timestamp())}"


async def ensure_schedule(world: dict) -> None:
    if world.get("status") != "OPEN" or await db().scheduled_events.find_one({"world_id": world["_id"], "type": EVENT, "status": "PENDING"}, {"_id": 1}):
        return
    at = clock.now() + timedelta(minutes=1)
    await scheduler.schedule(world["_id"], EVENT, at, world["_id"], _sweep_key(world["_id"], at), {})


async def bootstrap() -> None:
    """Players created before this feature start their inactivity clock now (nobody is swept on deploy)."""
    await db().players.update_many({"last_active_at": {"$exists": False}}, {"$set": {"last_active_at": clock.now()}})
    async for w in db().worlds.find({"status": "OPEN"}):
        await ensure_schedule(w)


@scheduler.handler(EVENT)
async def on_sweep(evt: dict) -> None:
    world = await db().worlds.find_one({"_id": evt["world_id"]})
    if not world or world.get("status") != "OPEN":
        return
    try:
        await sweep_world(world)
    finally:
        at = clock.now() + timedelta(hours=float(config(world)["sweep_hours"]))
        await scheduler.schedule(world["_id"], EVENT, at, world["_id"], _sweep_key(world["_id"], at), {})


async def sweep_world(world: dict) -> list[dict]:
    r = rule(world)
    if not r:
        return []
    now = clock.now()
    cutoff = now - timedelta(days=r["timeout_days"])
    warn_cutoff = now - timedelta(days=max(0.0, r["timeout_days"] - WARN_DAYS_BEFORE))
    out = []
    flt: dict = {"world_id": world["_id"], "status": {"$ne": "ELIMINATED"}, "inactivity_exempt": {"$ne": True}, "view_all_regions": {"$ne": True}}
    only = (world.get("inactivity_config") or {}).get("only_player_ids")
    if only:  # QA override in force: never touch anybody else while a short threshold is being exercised
        flt["_id"] = {"$in": list(only)}
    async for p in db().players.find(flt):
        la = last_active(p)
        if la <= cutoff:
            res = await eliminate(world, p, r["mode"])
            if res:
                out.append(res)
        elif la <= warn_cutoff:
            await warn(world, p, r, la)
    if out:
        log.info("inactivity sweep %s (%s): %d player(s) eliminated", world["_id"], r["mode"], len(out))
    return out


async def warn(world: dict, player: dict, r: dict, la: datetime) -> None:
    """Inbox warning ~1 day before the elimination (once per inactivity period: the dedupe key carries the last activity)."""
    eliminate_at = la + timedelta(days=r["timeout_days"])
    await notifications.notify(
        world["_id"],
        player["_id"],
        "INACTIVITY_WARNING",
        {"eliminate_at": clock.iso(eliminate_at), "mode": r["mode"], "timeout_days": r["timeout_days"], "last_active_at": clock.iso(la), "world_name": world.get("name")},
        dedupe_key=f"inactivity_warn:{player['_id']}:{int(la.timestamp())}",
        deep_link="settings",
    )


async def eliminate(world: dict, player: dict, mode: str) -> dict | None:
    """Idempotent: the status flip is the claim; everything after it is conditional on ownership."""
    now = clock.now()
    reason = "INACTIVE_EARLY" if mode == "REMOVE" else "INACTIVE"
    claimed = await db().players.find_one_and_update(
        {"_id": player["_id"], "status": {"$ne": "ELIMINATED"}},
        {"$set": {"status": "ELIMINATED", "eliminated_at": now, "eliminated_reason": reason, "settlement_count": 0, "settlement_reservations": 0}},
    )
    if not claimed:
        return None
    pid = player["_id"]
    wid = world["_id"]
    await db().marches.update_many({"player_id": pid, "status": {"$in": ["OUTBOUND", "RETURNING"]}}, {"$set": {"status": "DISBANDED", "disbanded_at": now, "disband_reason": reason}})
    await db().jobs.update_many({"player_id": pid, "status": "RUNNING"}, {"$set": {"status": "CANCELLED", "cancelled_at": now, "cancel_reason": reason}})
    if player.get("alliance_id"):
        a = await db().alliances.find_one({"_id": player["alliance_id"], "status": "ACTIVE"})
        if a:
            await alliances._remove_member(a, pid, reason)
    freed = 0
    converted = 0
    castles = []
    async for s in db().settlements.find({"world_id": wid, "owner_player_id": pid}):
        castles.append({"settlement_id": s["_id"], "x": s["x"], "y": s["y"], "level": int(s.get("level", 0))})
        if mode == "REMOVE" and s.get("slot_status") == "CLAIMED":
            await _free_slot(world, s)
            freed += 1
        else:
            await _to_neutral(world, s, reason)
            converted += 1
    if freed:
        inc: dict = {"player_count": -freed}
        region = grande_mondo.region_by_code(world, player.get("region_code")) if grande_mondo.is_grande_mondo(world) else None
        if region:
            inc[f"regions.{int(region['index'])}.player_count"] = -freed
        await db().worlds.update_one({"_id": wid}, {"$inc": inc})
    await db().audit.insert_one({"world_id": wid, "type": "player_inactive", "player_id": pid, "mode": mode, "castles": castles, "freed_slots": freed, "converted": converted, "last_active_at": last_active(player), "at": now})
    await progress.chronicle(wid, "PLAYER_INACTIVE", {"player_id": pid, "mode": mode, "castles": len(castles)}, [pid], ref=f"inactive:{pid}")
    return {"player_id": pid, "house_name": player.get("house_name"), "mode": mode, "freed_slots": freed, "converted": converted}


async def _release(world_id: str, s: dict) -> None:
    await territory.release_settlement(world_id, s["_id"])
    async for sen in db().sentinels.find({"world_id": world_id, "settlement_id": s["_id"], "state": {"$ne": "REMOVED"}}, {"_id": 1}):
        await territory.release_source(world_id, f"SENTINEL:{sen['_id']}")
    await db().sentinels.update_many({"world_id": world_id, "settlement_id": s["_id"], "state": {"$ne": "REMOVED"}}, {"$set": {"state": "REMOVED", "removed_at": clock.now(), "grace_deadline": None, "removed_reason": "OWNER_INACTIVE"}})
    await db().scheduled_events.update_many({"world_id": world_id, "status": "PENDING", "effect_key": {"$regex": f"^wall_repair:{s['_id']}:"}}, {"$set": {"status": "CANCELLED"}})


async def _to_neutral(world: dict, s: dict, reason: str) -> None:
    """spec.neutral_conversion.player_to_neutral_on_inactivity — levels, buildings and current wall HP preserved."""
    await _release(world["_id"], s)
    level = max(1, int(s.get("level", 1)))
    tpl = build_neutral_state(level, bool(s.get("port_eligible")))
    tick_h = int(get_spec().neutral_runtime["growth_tick_hours"])
    res = await db().settlements.update_one(
        {"_id": s["_id"], "owner_player_id": s["owner_player_id"]},
        {
            "$set": {
                "kind": "NEUTRAL",
                "name": f"Neutrale {s['x']},{s['y']}",
                "owner_player_id": None,
                "owner_house_name": None,
                "owner_house_crest": None,
                "owner_alliance_id": None,
                "owner_alliance_tag": None,
                "pyramid_reward": None,
                "grand_pyramid_reward": None,
                "is_mother": False,
                "converted_from_player": True,
                "converted_at": clock.now(),
                "converted_reason": reason,
                "resources": {k: int(int(v) * 0.5) for k, v in (s.get("resources") or {}).items()},
                "carry": {k: 0.0 for k in (s.get("carry") or {})},
                "army": tpl["army"],
                "ships": 0,
                "construction_active": 0,
                "research_active": 0,
                "recruit_active": {},
                "busy_targets": [],
                "busy_research": [],
                "growth_ticks": int(s.get("growth_ticks", 0)),
                "next_growth_at": clock.now() + timedelta(hours=tick_h),
                "last_accrued_at": clock.now(),
            },
            "$unset": {"loyalty": "", "last_conquest_hit_at": "", "conquered_at": ""},
        },
    )
    if res.modified_count:
        await db().territory_tiles.delete_many({"world_id": world["_id"], "settlement_id": s["_id"]})


async def _free_slot(world: dict, s: dict) -> None:
    """Early-phase removal: the spawn slot is a FREE PLAYER_SLOT again, with its reservation radius (worlds._persist_settlements)."""
    await _release(world["_id"], s)
    wid = world["_id"]
    keep = {k: s[k] for k in ("_id", "world_id", "x", "y", "chunk_cx", "chunk_cy", "terrain", "region", "port_eligible", "region_code") if k in s}
    fresh = {
        **keep,
        "kind": "PLAYER_SLOT",
        "slot_status": "FREE",
        "level": 0,
        "buildings": {},
        "army": {},
        "wall": {"level": 0, "current_hp": 0, "max_hp": 0},
        "owner_player_id": None,
        "applied_effects": [],
        "resources": {k: 0 for k in (s.get("resources") or {})},
        "carry": {k: 0.0 for k in (s.get("carry") or {})},
        "last_accrued_at": clock.now(),
        "research": {},
        "ships": 0,
        "freed_at": clock.now(),
        "freed_from": s.get("owner_player_id"),
    }
    res = await db().settlements.replace_one({"_id": s["_id"], "owner_player_id": s["owner_player_id"]}, fresh)
    if not res.modified_count:
        return
    terrain = await load_terrain(wid)
    size = int(terrain.shape[0])
    r = int(get_spec().spawn["unused_slot_reservation"]["radius_tiles_chebyshev"])
    tiles = []
    for dx in range(-r, r + 1):
        for dy in range(-r, r + 1):
            x, y = s["x"] + dx, s["y"] + dy
            if 0 <= x < size and 0 <= y < size and terrain[y, x] != 3:
                tiles.append({"_id": f"{wid}:{x}:{y}", "world_id": wid, "x": x, "y": y, "chunk_cx": x // CHUNK, "chunk_cy": y // CHUNK, "owner_player_id": None, "settlement_id": s["_id"], "source": "SLOT_RESERVATION"})
    if tiles:
        try:
            await db().territory_tiles.insert_many(tiles, ordered=False)
        except Exception:  # noqa: BLE001 — tiles already owned by neighbours stay theirs
            pass
