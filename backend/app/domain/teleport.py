"""Castle teleport (Bibbia GM §Teletrasporto): a conquered castle swaps places with an EMPTY castle (a FREE player slot)
of the player's own region. Fixed price 2000 Rubies. Levels, buildings, research, army, resources unchanged: only the
coordinates move. Atomic (slot claimed first, price debited second, positions swapped third; every failure rolls the
claim back), idempotent per `idempotency_key` (Ruby ledger), logged in `teleport_log`.

What follows the castle: base territory, Sentinels (re-anchored on the new slots; a slot that lands on water / off-map
becomes a natural boundary → that Sentinel is removed and its garrison rejoins the castle army), natural boundaries.
What is refused: the Mother castle, castles with marches in flight (paths are coordinate snapshots), classic realms.
"""
from __future__ import annotations

import uuid

from app.core import clock
from app.core.db import db
from app.core.errors import ApiError
from app.core.spec import get_spec
from app.domain import grande_mondo, notifications, premium, progress, scheduler, sentinels, territory
from app.domain.pathfinding import load_terrain
from app.domain.settlements import chunk_of

PRICE_RUBIES = 2000
ACTIVE_MARCH = ("OUTBOUND", "RESOLVING", "RETURNING", "HOLDING")


def _validate_source(world: dict, player: dict, doc: dict) -> None:
    if not grande_mondo.is_grande_mondo(world):
        raise ApiError("TELEPORT_NOT_AVAILABLE", "Castle teleport exists only in the Grande Mondo", 409)
    if doc.get("owner_player_id") != player["_id"] or doc.get("kind") != "PLAYER":
        raise ApiError("NOT_OWNER", "Settlement is not owned by this player", 403)
    if doc.get("is_mother"):
        raise ApiError("TELEPORT_MOTHER", "The Mother castle cannot be teleported: only conquered castles can", 409)
    if not player.get("region_code"):
        raise ApiError("REGION_REQUIRED", "Player has no region", 409)


def _needs_port(doc: dict) -> bool:
    return int((doc.get("buildings") or {}).get("Porto", 0)) > 0


async def candidates(world: dict, player: dict, doc: dict, limit: int = 60) -> dict:
    """Empty castles of the player's region a castle may swap with, nearest to the Mother castle first."""
    _validate_source(world, player, doc)
    mother = await db().settlements.find_one({"world_id": world["_id"], "owner_player_id": player["_id"], "is_mother": True}, {"x": 1, "y": 1})
    ref = (int(mother["x"]), int(mother["y"])) if mother else (int(doc["x"]), int(doc["y"]))
    q: dict = {"world_id": world["_id"], "kind": "PLAYER_SLOT", "slot_status": "FREE", "region_code": player["region_code"]}
    if _needs_port(doc):
        q["port_eligible"] = True
    out = []
    async for s in db().settlements.find(q, {"x": 1, "y": 1, "terrain": 1, "region": 1, "port_eligible": 1}):
        out.append({"slot_id": s["_id"], "x": int(s["x"]), "y": int(s["y"]), "terrain": s.get("terrain"), "landmass": s.get("region"), "port_eligible": bool(s.get("port_eligible")), "distance_from_mother": max(abs(int(s["x"]) - ref[0]), abs(int(s["y"]) - ref[1]))})
    out.sort(key=lambda c: (c["distance_from_mother"], c["slot_id"]))
    busy = await db().marches.count_documents({"world_id": world["_id"], "status": {"$in": list(ACTIVE_MARCH)}, "$or": [{"origin_settlement_id": doc["_id"]}, {"target_settlement_id": doc["_id"]}]})
    return {
        "settlement_id": doc["_id"],
        "from": [int(doc["x"]), int(doc["y"])],
        "region_code": player["region_code"],
        "mother": list(ref),
        "price_rubies": PRICE_RUBIES,
        "rubies": await premium.balance(player["account_id"]),
        "needs_port": _needs_port(doc),
        "blocked": "MARCHES_IN_FLIGHT" if busy else None,
        "candidates": out[:limit],
        "total": len(out),
    }


async def teleport(world: dict, player: dict, account_id: str, doc: dict, slot_id: str, idempotency_key: str | None) -> dict:
    ex = await premium._existing(account_id, idempotency_key)  # noqa: SLF001 — same ledger idempotency as every Ruby spend
    if ex:
        fresh = await db().settlements.find_one({"_id": doc["_id"]})
        return {"settlement_id": doc["_id"], "from": ex["effect"].get("from"), "to": ex["effect"].get("to"), "x": int(fresh["x"]), "y": int(fresh["y"]), "price_rubies": -int(ex["amount"]), "rubies": await premium.balance(account_id), "replayed": True}
    _validate_source(world, player, doc)
    if await db().marches.count_documents({"world_id": world["_id"], "status": {"$in": list(ACTIVE_MARCH)}, "$or": [{"origin_settlement_id": doc["_id"]}, {"target_settlement_id": doc["_id"]}]}):
        raise ApiError("TELEPORT_BUSY", "Marches are travelling to or from this castle: wait for them to finish", 409)
    slot_q: dict = {"_id": slot_id, "world_id": world["_id"], "kind": "PLAYER_SLOT", "slot_status": "FREE", "region_code": player["region_code"]}
    if _needs_port(doc):
        slot_q["port_eligible"] = True
    # 1) claim the empty castle atomically
    slot = await db().settlements.find_one_and_update(slot_q, {"$set": {"slot_status": "SWAPPING", "claim_token": doc["_id"]}}, return_document=True)
    if not slot:
        raise ApiError("TELEPORT_SLOT_UNAVAILABLE", "This empty castle is no longer available (taken, wrong region or no port access)", 409)
    src_pos = {"x": int(doc["x"]), "y": int(doc["y"]), "terrain": doc.get("terrain"), "region": doc.get("region"), "port_eligible": bool(doc.get("port_eligible"))}
    dst_pos = {"x": int(slot["x"]), "y": int(slot["y"]), "terrain": slot.get("terrain"), "region": slot.get("region"), "port_eligible": bool(slot.get("port_eligible"))}
    # 2) debit (rolls the claim back on failure)
    try:
        tx = await premium._debit(account_id, PRICE_RUBIES, "TELEPORT_CASTLE", {"settlement_id": doc["_id"], "slot_id": slot_id, "from": [src_pos["x"], src_pos["y"]], "to": [dst_pos["x"], dst_pos["y"]], "region": player["region_code"]}, idempotency_key, world["_id"])  # noqa: SLF001
    except ApiError:
        await db().settlements.update_one({"_id": slot_id, "slot_status": "SWAPPING"}, {"$set": {"slot_status": "FREE"}, "$unset": {"claim_token": ""}})
        raise
    now = clock.now()
    # 3) swap coordinates
    def _pos_fields(p: dict) -> dict:
        cx, cy = chunk_of(p["x"], p["y"])
        return {"x": p["x"], "y": p["y"], "chunk_cx": cx, "chunk_cy": cy, "terrain": p["terrain"], "region": p["region"], "port_eligible": p["port_eligible"]}

    name = doc.get("name") or ""
    new_name = name.replace(f"{src_pos['x']},{src_pos['y']}", f"{dst_pos['x']},{dst_pos['y']}") if f"{src_pos['x']},{src_pos['y']}" in name else name
    # (world_id, x, y) is unique: park the empty castle off-map, move the castle, then place the empty castle
    await db().settlements.update_one({"_id": slot_id}, {"$set": {"x": -1, "y": -(1 + int(uuid.uuid4().int % 1_000_000))}})
    await db().settlements.update_one({"_id": doc["_id"]}, {"$set": {**_pos_fields(dst_pos), "name": new_name, "teleported_at": now, "teleport_count": int(doc.get("teleport_count", 0)) + 1}})
    await db().settlements.update_one({"_id": slot_id}, {"$set": {**_pos_fields(src_pos), "slot_status": "FREE"}, "$unset": {"claim_token": ""}})
    moved = await db().settlements.find_one({"_id": doc["_id"]})
    # territory: the castle's tiles (base, sentinel sectors, natural boundaries) leave with it; the empty castle's
    # reservation moves to the old coordinates
    await territory.release_settlement(world["_id"], doc["_id"])
    await db().territory_tiles.delete_many({"world_id": world["_id"], "settlement_id": slot_id})
    await _reserve_slot(world["_id"], slot_id, src_pos["x"], src_pos["y"])
    await territory.claim_base(world["_id"], moved)
    returned = await _move_sentinels(world["_id"], moved)
    await sentinels.sync_natural_boundaries(moved)
    if returned:
        await db().settlements.update_one({"_id": doc["_id"]}, {"$inc": {f"army.{u}": int(n) for u, n in returned.items()}})
    log = {"_id": f"tp_{uuid.uuid4().hex[:12]}", "world_id": world["_id"], "player_id": player["_id"], "account_id": account_id, "settlement_id": doc["_id"], "slot_id": slot_id, "from": [src_pos["x"], src_pos["y"]], "to": [dst_pos["x"], dst_pos["y"]], "region_code": player["region_code"], "price_rubies": PRICE_RUBIES, "transaction_id": tx["_id"], "idempotency_key": idempotency_key, "sentinel_units_returned": returned, "at": now}
    await db().teleport_log.insert_one(log)
    await progress.chronicle(world["_id"], "CASTLE_TELEPORTED", {"settlement_id": doc["_id"], "from": log["from"], "to": log["to"], "region": player["region_code"]}, [player["_id"]], ref=f"teleport:{log['_id']}")
    await notifications.notify(world["_id"], player["_id"], "CASTLE_TELEPORTED", {"settlement_id": doc["_id"], "from": log["from"], "to": log["to"], "price_rubies": PRICE_RUBIES}, dedupe_key=f"teleport:{log['_id']}", deep_link="settlement")
    return {"settlement_id": doc["_id"], "from": log["from"], "to": log["to"], "x": dst_pos["x"], "y": dst_pos["y"], "price_rubies": PRICE_RUBIES, "rubies": int(tx["balance_after"]), "sentinel_units_returned": returned, "replayed": False}


async def _reserve_slot(world_id: str, slot_id: str, x: int, y: int) -> None:
    """Re-create the unused-slot reservation (radius 4, land only) around the empty castle's new coordinates."""
    grid = await load_terrain(world_id)
    r = int(get_spec().spawn["unused_slot_reservation"]["radius_tiles_chebyshev"])
    tiles = [(x + dx, y + dy) for dx in range(-r, r + 1) for dy in range(-r, r + 1) if 0 <= x + dx < grid.shape[1] and 0 <= y + dy < grid.shape[0] and int(grid[y + dy, x + dx]) != 3]
    docs = [{"_id": f"{world_id}:{tx}:{ty}", "world_id": world_id, "x": tx, "y": ty, "chunk_cx": tx // 32, "chunk_cy": ty // 32, "owner_player_id": None, "settlement_id": slot_id, "source": "SLOT_RESERVATION"} for tx, ty in tiles]
    if docs:
        try:
            await db().territory_tiles.insert_many(docs, ordered=False)
        except Exception:  # tiles already owned by someone stay theirs
            pass


async def _move_sentinels(world_id: str, moved: dict) -> dict[str, int]:
    """Re-anchor the castle's Sentinels on the slots of the new position. Returns the garrison units that had to
    return to the castle (slots that became water / off-map)."""
    grid = await load_terrain(world_id)
    returned: dict[str, int] = {}
    async for s in db().sentinels.find({"world_id": world_id, "settlement_id": moved["_id"], "state": {"$ne": "REMOVED"}}):
        x, y, _r = sentinels.slot_of(moved, s["direction"], s["ring"])
        on_land = 0 <= x < grid.shape[1] and 0 <= y < grid.shape[0] and int(grid[y, x]) != 3
        taken = on_land and await db().sentinels.find_one({"world_id": world_id, "x": x, "y": y, "state": {"$ne": "REMOVED"}, "_id": {"$ne": s["_id"]}})
        if not on_land or taken:
            for u, n in (s.get("garrison") or {}).items():
                returned[u] = returned.get(u, 0) + int(n)
            await db().sentinels.update_one({"_id": s["_id"]}, {"$set": {"state": "REMOVED", "removed_at": clock.now(), "grace_deadline": None, "garrison": {}, "removed_reason": "TELEPORT_NATURAL_BOUNDARY" if not on_land else "TELEPORT_SLOT_TAKEN"}})
            await scheduler.cancel(f"sentinel_expire:{s['_id']}:{int(s.get('generation', 0))}")
            await db().jobs.update_many({"sentinel_id": s["_id"], "status": "RUNNING"}, {"$set": {"status": "CANCELLED", "cancelled_at": clock.now(), "cancel_reason": "TELEPORT"}})
            continue
        await db().sentinels.update_one({"_id": s["_id"]}, {"$set": {"x": x, "y": y}})
        if s["state"] in ("GUARDED", "UNGUARDED_GRACE"):
            fresh = {**s, "x": x, "y": y}
            await territory.claim_tiles(world_id, sentinels.sector_tiles_for(moved, fresh), moved["owner_player_id"], moved["_id"], f"SENTINEL:{s['_id']}")
    return returned
