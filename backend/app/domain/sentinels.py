"""Territorial Sentinels (spec.sentinel_runtime / territory): distinct from the Comando Sentinelle building.
No HP, no walls, no repair. States BUILDING -> GUARDED | UNGUARDED_GRACE -> REMOVED. Grace 24h; expiry is
idempotent through a generation counter (regarrison before deadline supersedes the pending expiry)."""
from __future__ import annotations

import math
from datetime import timedelta

from app.core import clock
from app.core.db import db
from app.core.errors import ApiError, insufficient_resources, queue_full
from app.core.spec import get_spec
from app.domain import economy, notifications, scheduler, territory
from app.domain import formulas as F
from app.domain.pathfinding import load_terrain
from app.domain.settlements import new_id

DIRS = {"N": (0, -1), "NE": (1, -1), "E": (1, 0), "SE": (1, 1), "S": (0, 1), "SW": (-1, 1), "W": (-1, 0), "NW": (-1, -1)}
INNER = ("N", "E", "S", "W")
OUTER_ORDER = ("E", "SE", "S", "SW", "W", "NW", "N", "NE")  # by increasing atan2 angle (screen y grows southwards)


def sector_tiles(anchor: tuple[int, int], direction: str, ring: str, inner_r: int, outer_r: int) -> list[tuple[int, int]]:
    """Sector geometry (Bible §14, "settore" of a Sentinel):
    - INNER sentinel at Chebyshev radius `inner_r` facing D → the 90° wedge of the (2r+1)² square around the anchor that
      faces D (each wedge takes one diagonal, clockwise: N+NE, E+SE, S+SW, W+NW → 12 tiles each at r=3): the four inner
      sentinels together cover the whole square.
    - OUTER sentinel at radius `outer_r` → the 45° wedge of the ring band (inner_r+1 .. outer_r) facing D: the eight
      outer sentinels together cover the whole (2·outer_r+1)² square minus the inner square.
    The anchor tile itself is never part of a sector (it is BASE territory). Water/foreign tiles are filtered by the
    claim (single-owner invariant), not here."""
    ax, ay = anchor
    out: list[tuple[int, int]] = []
    if ring == "INNER":
        for dy in range(-inner_r, inner_r + 1):
            for dx in range(-inner_r, inner_r + 1):
                if dx == 0 and dy == 0:
                    continue
                if direction == "N":
                    ok = dy < 0 and (abs(dx) < -dy or (dx > 0 and dx == -dy))  # + NE diagonal
                elif direction == "E":
                    ok = dx > 0 and (abs(dy) < dx or (dy > 0 and dy == dx))  # + SE diagonal
                elif direction == "S":
                    ok = dy > 0 and (abs(dx) < dy or (dx < 0 and -dx == dy))  # + SW diagonal
                else:  # W
                    ok = dx < 0 and (abs(dy) < -dx or (dy < 0 and dy == dx))  # + NW diagonal
                if ok:
                    out.append((ax + dx, ay + dy))
        return sorted(out)
    for dy in range(-outer_r, outer_r + 1):
        for dx in range(-outer_r, outer_r + 1):
            d = max(abs(dx), abs(dy))
            if d <= inner_r:
                continue
            k = int(round(math.atan2(dy, dx) / (math.pi / 4))) % 8
            if OUTER_ORDER[k] == direction:
                out.append((ax + dx, ay + dy))
    return sorted(out)


def sector_tiles_for(doc: dict, sentinel: dict) -> list[tuple[int, int]]:
    t = get_spec().territory
    return sector_tiles((doc["x"], doc["y"]), sentinel["direction"], sentinel["ring"], int(t["inner_sentinel_radius_tiles"]), int(t["outer_sentinel_radius_tiles"]))


def _combat_capable(garrison: dict[str, int]) -> bool:
    spec = get_spec()
    return any(int(c) >= 1 and spec.units_by_name[u]["atk"] > 0 for u, c in garrison.items())


def dto(s: dict) -> dict:
    return {
        "sentinel_id": s["_id"],
        "settlement_id": s["settlement_id"],
        "owner_player_id": s["owner_player_id"],
        "x": s["x"],
        "y": s["y"],
        "direction": s["direction"],
        "ring": s["ring"],
        "state": s["state"],
        "garrison": {k: int(v) for k, v in (s.get("garrison") or {}).items() if int(v) > 0},
        "garrison_cap": s.get("garrison_cap"),
        "grace_deadline": clock.iso(s.get("grace_deadline")),
        "generation": s.get("generation", 0),
        "built_at": clock.iso(s.get("built_at")),
    }


async def start_build(doc: dict, player: dict, direction: str, idempotency_key: str | None) -> dict:
    spec = get_spec()
    sr = spec.sentinel_runtime
    direction = direction.upper()
    if direction not in DIRS:
        raise ApiError("INVALID_DIRECTION", "Direction must be one of N,NE,E,SE,S,SW,W,NW", 400)
    if idempotency_key:
        existing = await db().jobs.find_one({"world_id": doc["world_id"], "player_id": player["_id"], "idempotency_key": idempotency_key})
        if existing:
            return existing
    cmd = int(doc["buildings"].get("Comando Sentinelle", 0))
    if cmd < 1:
        raise ApiError("SENTINEL_COMMAND_REQUIRED", "Comando Sentinelle required", 409)
    ring = "INNER" if direction in INNER else "OUTER"
    if ring == "OUTER" and F.rget(doc.get("research", {}), "sentinel.advanced_perimeter") < 1:
        raise ApiError("ADVANCED_PERIMETER_REQUIRED", "Outer ring requires sentinel.advanced_perimeter", 409)
    radius = int(spec.territory["inner_sentinel_radius_tiles" if ring == "INNER" else "outer_sentinel_radius_tiles"])
    dx, dy = DIRS[direction]
    x, y = doc["x"] + dx * radius, doc["y"] + dy * radius
    grid = await load_terrain(doc["world_id"])
    if not (0 <= x < grid.shape[1] and 0 <= y < grid.shape[0]) or int(grid[y, x]) == 3:
        raise ApiError("SENTINEL_TILE_INVALID", "Sentinel slot is water or out of map", 409, {"x": x, "y": y})
    owner = await territory.owner_of_tile(doc["world_id"], x, y)
    if owner and owner != player["_id"]:
        raise ApiError("TILE_OWNED_BY_OTHER", "Tile belongs to another player", 409)
    if await db().sentinels.find_one({"world_id": doc["world_id"], "settlement_id": doc["_id"], "direction": direction, "state": {"$ne": "REMOVED"}}):
        raise ApiError("SENTINEL_SLOT_TAKEN", "A sentinel already exists in this direction", 409)
    if await db().sentinels.find_one({"world_id": doc["world_id"], "x": x, "y": y, "state": {"$ne": "REMOVED"}}):
        raise ApiError("SENTINEL_TILE_TAKEN", "Tile already hosts a sentinel", 409)
    cost = {r: int(sr["construction_cost"][r]) for r in F.RES}
    minutes = int(sr["construction_time_min"])  # fixed, no early-game discount
    queues = int(spec.construction_runtime["queues_per_settlement"])
    target = f"SENTINEL:{direction}"
    flt: dict = {"_id": doc["_id"], "construction_active": {"$not": {"$gte": queues}}, "busy_targets": {"$ne": target}}
    inc: dict = {"construction_active": 1}
    for r, v in cost.items():
        if v > 0:
            flt[f"resources.{r}"] = {"$gte": v}
            inc[f"resources.{r}"] = -v
    res = await db().settlements.find_one_and_update(flt, {"$inc": inc, "$addToSet": {"busy_targets": target}})
    if res is None:
        fresh = await db().settlements.find_one({"_id": doc["_id"]})
        if int(fresh.get("construction_active", 0)) >= queues:
            raise queue_full()
        if target in fresh.get("busy_targets", []):
            raise ApiError("TARGET_BUSY", "Sentinel already under construction", 409)
        raise insufficient_resources(economy.missing_for(fresh, cost))
    now = clock.now()
    ends = now + timedelta(minutes=minutes)
    sentinel_id = new_id("sen")
    await db().sentinels.insert_one(
        {"_id": sentinel_id, "world_id": doc["world_id"], "settlement_id": doc["_id"], "owner_player_id": player["_id"], "x": x, "y": y, "direction": direction, "ring": ring, "state": "BUILDING", "garrison": {}, "garrison_cap": F.sentinel_garrison_cap(cmd, spec), "grace_deadline": None, "generation": 0, "created_at": now}
    )
    job = {
        "_id": new_id("job"),
        "world_id": doc["world_id"],
        "player_id": player["_id"],
        "settlement_id": doc["_id"],
        "kind": "SENTINEL_BUILD",
        "queue": "construction",
        "target": target,
        "target_level": 1,
        "sentinel_id": sentinel_id,
        "started_at": now,
        "ends_at": ends,
        "status": "RUNNING",
        "cost_snapshot": cost,
        "modifiers_snapshot": {"fast_applied": False, "fixed": True, "spec_version": spec.version},
        "idempotency_key": idempotency_key,
    }
    await db().jobs.insert_one(job)
    await scheduler.schedule(doc["world_id"], "BUILD_RESEARCH_RECRUIT_COMPLETE", ends, doc["_id"], f"job_complete:{job['_id']}", {"job_id": job["_id"]})
    return job


async def _start_grace(s: dict, reason: str) -> None:
    spec = get_spec()
    now = clock.now()
    deadline = now + timedelta(hours=int(spec.sentinel_runtime["unoccupied_timeout_hours"]))
    gen = int(s.get("generation", 0)) + 1
    updated = await db().sentinels.find_one_and_update(
        {"_id": s["_id"], "generation": s.get("generation", 0), "state": {"$in": ["BUILDING", "GUARDED"]}},
        {"$set": {"state": "UNGUARDED_GRACE", "grace_deadline": deadline, "generation": gen}},
        return_document=True,
    )
    if not updated:
        return
    await scheduler.schedule(s["world_id"], "SENTINEL_GRACE_EXPIRE", deadline, s["_id"], f"sentinel_expire:{s['_id']}:{gen}", {"sentinel_id": s["_id"], "generation": gen})
    await notifications.notify(s["world_id"], s["owner_player_id"], "SENTINEL_LOST", {"sentinel_id": s["_id"], "sector": s["direction"], "grace_deadline": clock.iso(deadline), "reason": reason}, dedupe_key=f"sentinel_grace:{s['_id']}:{gen}", deep_link="map/sentinel")


async def apply_build_complete(job: dict) -> None:
    s = await db().sentinels.find_one({"_id": job["sentinel_id"]})
    doc = await db().settlements.find_one({"_id": job["settlement_id"]})
    if not s or not doc or job["_id"] in doc.get("applied_effects", []):
        return
    await db().settlements.update_one(
        {"_id": doc["_id"], "applied_effects": {"$ne": job["_id"]}},
        {"$inc": {"construction_active": -1}, "$pull": {"busy_targets": job["target"]}, "$push": {"applied_effects": {"$each": [job["_id"]], "$slice": -500}}},
    )
    if s["state"] != "BUILDING":
        return
    await db().sentinels.update_one({"_id": s["_id"]}, {"$set": {"built_at": clock.now()}})
    tiles = sector_tiles_for(doc, s)
    await territory.claim_tiles(doc["world_id"], tiles, s["owner_player_id"], doc["_id"], f"SENTINEL:{s['_id']}")
    # building_complete_without_garrison -> 24h grace starts at completion
    await _start_grace(s, "BUILT_WITHOUT_GARRISON")


async def add_garrison(sentinel_id: str, units: dict[str, int]) -> dict | None:
    s = await db().sentinels.find_one({"_id": sentinel_id})
    if not s or s["state"] == "REMOVED":
        return None
    inc = {f"garrison.{u}": int(c) for u, c in units.items() if int(c) > 0}
    if not inc:
        return s
    merged = dict(s.get("garrison") or {})
    for u, c in units.items():
        merged[u] = merged.get(u, 0) + int(c)
    sets = {}
    if _combat_capable(merged) and s["state"] in ("UNGUARDED_GRACE", "BUILDING"):
        sets = {"state": "GUARDED", "grace_deadline": None}
    upd: dict = {"$inc": inc}
    if sets:
        upd["$set"] = sets
        upd["$inc"]["generation"] = 1  # supersedes any pending expiry
    updated = await db().sentinels.find_one_and_update({"_id": sentinel_id}, upd, return_document=True)
    if sets:
        await scheduler.cancel(f"sentinel_expire:{sentinel_id}:{s.get('generation', 0)}")
    return updated


async def remove_garrison(sentinel_id: str, units: dict[str, int] | None, reason: str) -> dict | None:
    """units=None removes everything (e.g. annihilated by attacker)."""
    s = await db().sentinels.find_one({"_id": sentinel_id})
    if not s or s["state"] == "REMOVED":
        return None
    garrison = dict(s.get("garrison") or {})
    if units is None:
        garrison = {}
    else:
        for u, c in units.items():
            garrison[u] = max(0, garrison.get(u, 0) - int(c))
    garrison = {u: c for u, c in garrison.items() if c > 0}
    updated = await db().sentinels.find_one_and_update({"_id": sentinel_id}, {"$set": {"garrison": garrison}}, return_document=True)
    if updated and updated["state"] == "GUARDED" and not _combat_capable(garrison):
        await _start_grace(updated, reason)
        updated = await db().sentinels.find_one({"_id": sentinel_id})
    return updated


async def transfer_to_new_owner(s: dict) -> None:
    doc = await db().settlements.find_one({"_id": s["settlement_id"]})
    if not doc:
        return
    gen = int(s.get("generation", 0)) + 1
    await db().sentinels.update_one({"_id": s["_id"]}, {"$set": {"owner_player_id": doc["owner_player_id"], "garrison": {}, "state": "GUARDED", "generation": gen}})
    fresh = await db().sentinels.find_one({"_id": s["_id"]})
    await _start_grace(fresh, "TRANSFERRED_EMPTY")


@scheduler.handler("SENTINEL_GRACE_EXPIRE")
async def on_grace_expire(evt: dict) -> None:
    sid = evt["payload"]["sentinel_id"]
    gen = int(evt["payload"]["generation"])
    s = await db().sentinels.find_one_and_update(
        {"_id": sid, "state": "UNGUARDED_GRACE", "generation": gen},
        {"$set": {"state": "REMOVED", "removed_at": clock.now(), "grace_deadline": None}},
        return_document=True,
    )
    if not s:
        return  # superseded (regarrisoned) or already removed: idempotent no-op
    await territory.release_source(s["world_id"], f"SENTINEL:{sid}")
    await db().sentinels.update_one({"_id": sid}, {"$inc": {"expiry_count": 1}})
    await notifications.notify(s["world_id"], s["owner_player_id"], "SENTINEL_LOST", {"sentinel_id": sid, "sector": s["direction"], "grace_deadline": None, "state": "REMOVED"}, dedupe_key=f"sentinel_removed:{sid}:{gen}", deep_link="map/sentinel")


async def list_for_settlement(world_id: str, settlement_id: str) -> list[dict]:
    cur = db().sentinels.find({"world_id": world_id, "settlement_id": settlement_id, "state": {"$ne": "REMOVED"}})
    return [dto(s) async for s in cur]
