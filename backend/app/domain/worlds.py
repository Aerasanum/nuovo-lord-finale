"""Worlds: generation + persistence (map chunks, 800 neutrals, 100 slots), listing, join with atomic slot claim,
Player bootstrap (world-scoped)."""
from __future__ import annotations

import asyncio
import hashlib
import logging
import uuid

import numpy as np
from pymongo.errors import DuplicateKeyError

from app.core import clock
from app.core.db import db
from app.core.errors import ApiError
from app.core.spec import get_spec
from app.domain import conquest, house, notifications, territory
from app.domain import formulas as F
from app.domain.pathfinding import CHUNK, invalidate
from app.domain.settlements import bootstrap_player_settlement, build_neutral_state, chunk_of, new_id
from app.domain.worldgen import N, GenConfig, generate_world

log = logging.getLogger("worlds")


def world_dto(w: dict) -> dict:
    return {
        "world_id": w["_id"],
        "name": w["name"],
        "status": w["status"],
        "seed": w.get("seed"),
        "size": w.get("size", N),
        "player_count": int(w.get("player_count", 0)),
        "player_slots": int(w.get("player_slots", 100)),
        "opened_at": clock.iso(w.get("opened_at")),
        "spec_version": w.get("spec_version"),
        "spec_hash": w.get("spec_hash"),
        "terrain_stats": w.get("terrain_stats", {}),
        "age_days": round((clock.now() - clock.aware(w["opened_at"])).total_seconds() / 86400.0, 3) if w.get("opened_at") else 0,
    }


async def create_world(name: str | None = None, seed: int | None = None, gen_overrides: dict | None = None) -> dict:
    """Generate and open a new realm. `gen_overrides` (size / spacing / pyramid anchor) tune the landmass layout for
    this world only — see worldgen.GenConfig; Bible counts, timers and costs are untouched."""
    spec = get_spec()
    cfg = GenConfig.from_spec(spec, gen_overrides)
    count = await db().worlds.count_documents({})
    world_id = f"world_{count + 1}"
    if seed is None:
        seed = int(hashlib.sha256(world_id.encode()).hexdigest(), 16) % 1_000_000
    now = clock.now()
    size = cfg.size
    doc = {
        "_id": world_id,
        "name": name or f"Regno {count + 1}",
        "status": "GENERATING",
        "seed": seed,
        "size": size,
        "gen_config": cfg.to_doc(),
        "player_slots": int(spec.world["player_slots"]),
        "player_count": 0,
        "spec_version": spec.version,
        "spec_hash": spec.computed_hash,
        "created_at": now,
        "opened_at": None,
    }
    if list(cfg.pyramid_anchor) != [int(v) for v in spec.world["pyramid_anchor"]]:
        doc["pyramid_config"] = {"anchor": list(cfg.pyramid_anchor)}  # the monument sits in the middle of the realm
    try:
        await db().worlds.insert_one(doc)
    except DuplicateKeyError:
        raise ApiError("WORLD_EXISTS", "World already exists", 409)
    try:
        gen = await asyncio.get_running_loop().run_in_executor(None, generate_world, seed, spec, cfg)
    except Exception as e:  # noqa: BLE001
        await db().worlds.update_one({"_id": world_id}, {"$set": {"status": "FAILED", "error": str(e)}})
        raise ApiError("MAP_GENERATION_CONSTRAINT_FAILED", "World generation failed", 500, {"error": str(e)})
    # chunks
    chunks = []
    n_chunks = (size + CHUNK - 1) // CHUNK
    for cy in range(n_chunks):
        for cx in range(n_chunks):
            block = np.full((CHUNK, CHUNK), 3, dtype=np.uint8)
            h = min(CHUNK, size - cy * CHUNK)
            w = min(CHUNK, size - cx * CHUNK)
            block[:h, :w] = gen.terrain[cy * CHUNK : cy * CHUNK + h, cx * CHUNK : cx * CHUNK + w]
            chunks.append({"_id": f"{world_id}:{cx}:{cy}", "world_id": world_id, "cx": cx, "cy": cy, "terrain": block.tobytes()})
    await db().map_chunks.insert_many(chunks)
    # settlements
    docs = []
    for a in gen.anchors:
        cx, cy = chunk_of(a.x, a.y)
        base = {
            "_id": new_id("stl"),
            "world_id": world_id,
            "x": a.x,
            "y": a.y,
            "chunk_cx": cx,
            "chunk_cy": cy,
            "terrain": a.terrain,
            "region": a.region,
            "port_eligible": a.port_eligible,
            "owner_player_id": None,
            "applied_effects": [],
            "resources": {r: 0 for r in F.RES},
            "carry": {r: 0.0 for r in F.RES},
            "last_accrued_at": now,
            "research": {},
            "ships": 0,
        }
        if a.kind == "NEUTRAL":
            st = build_neutral_state(a.level, a.port_eligible)
            docs.append({**base, "kind": "NEUTRAL", "name": f"Neutrale {a.x},{a.y}", "level": st["level"], "buildings": st["buildings"], "army": st["army"], "wall": st["wall"], "growth_ticks": 0, "next_growth_at": None})
        else:
            docs.append({**base, "kind": "PLAYER_SLOT", "slot_status": "FREE", "level": 0, "buildings": {}, "army": {}, "wall": {"level": 0, "current_hp": 0, "max_hp": 0}})
    await db().settlements.insert_many(docs)
    # slot reservation radius 4 blocks territory claims around unused slots
    slot_tiles = []
    for d in docs:
        if d["kind"] == "PLAYER_SLOT":
            r = int(spec.spawn["unused_slot_reservation"]["radius_tiles_chebyshev"])
            for dx in range(-r, r + 1):
                for dy in range(-r, r + 1):
                    slot_tiles.append((d["x"] + dx, d["y"] + dy, d["_id"]))
    tile_docs = []
    for x, y, sid in slot_tiles:
        if 0 <= x < size and 0 <= y < size and gen.terrain[y, x] != 3:
            tile_docs.append({"_id": f"{world_id}:{x}:{y}", "world_id": world_id, "x": x, "y": y, "chunk_cx": x // CHUNK, "chunk_cy": y // CHUNK, "owner_player_id": None, "settlement_id": sid, "source": "SLOT_RESERVATION"})
    if tile_docs:
        try:
            await db().territory_tiles.insert_many(tile_docs, ordered=False)
        except Exception:  # overlapping reservations between slots are fine
            pass
    invalidate(world_id)
    await db().worlds.update_one({"_id": world_id}, {"$set": {"status": "OPEN", "opened_at": now, "terrain_stats": gen.stats, "generation_seed": gen.seed}})
    return await db().worlds.find_one({"_id": world_id})


async def ensure_default_world() -> None:
    if await db().worlds.count_documents({"status": "OPEN"}) == 0:
        stuck = await db().worlds.find_one({"status": "GENERATING"})
        if stuck:
            await db().worlds.delete_one({"_id": stuck["_id"]})
            await db().map_chunks.delete_many({"world_id": stuck["_id"]})
            await db().settlements.delete_many({"world_id": stuck["_id"]})
            await db().territory_tiles.delete_many({"world_id": stuck["_id"]})
        log.info("generating default world…")
        await create_world("Regno 1")
        log.info("default world ready")


async def list_worlds(account_id: str) -> list[dict]:
    out = []
    async for w in db().worlds.find({"status": {"$in": ["OPEN", "GENERATING"]}}).sort("created_at", 1):
        d = world_dto(w)
        p = await db().players.find_one({"world_id": w["_id"], "account_id": account_id})
        d["joined"] = bool(p)
        d["player_id"] = p["_id"] if p else None
        d["house_name"] = p["house_name"] if p else None
        d["house_crest"] = (p.get("house_crest") or house.default_crest(p["house_name"])) if p else None
        out.append(d)
    return out


async def get_world(world_id: str) -> dict:
    w = await db().worlds.find_one({"_id": world_id})
    if not w:
        raise ApiError("WORLD_NOT_FOUND", "World not found", 404, {"world_id": world_id})
    return w


async def get_player(world_id: str, account_id: str) -> dict:
    p = await db().players.find_one({"world_id": world_id, "account_id": account_id})
    if not p:
        raise ApiError("PLAYER_NOT_IN_WORLD", "Join this world first", 404, {"world_id": world_id})
    if p.get("status") == "ELIMINATED":
        raise ApiError("PLAYER_ELIMINATED", "This Player has been eliminated", 409)
    return p


def player_dto(p: dict) -> dict:
    spec = get_spec()
    created = clock.aware(p["created_at"])
    from datetime import timedelta

    shield_until = created + timedelta(days=int(spec.pvp_shield["max_age_days"]))
    return {
        "player_id": p["_id"],
        "world_id": p["world_id"],
        "account_id": p["account_id"],
        "house_name": p["house_name"],
        "house": house.dto(p),
        "mother_settlement_id": p.get("mother_settlement_id"),
        "settlement_count": int(p.get("settlement_count", 1)),
        "settlement_reservations": int(p.get("settlement_reservations", 0)),
        "max_settlements": int(spec.world["max_settlements_per_player"]),
        "neutral_conquests": int(p.get("neutral_conquests", 0)),
        "shield_active": conquest.shield_active(p),
        "shield_until": clock.iso(shield_until) if not p.get("shield_ended_at") else None,
        "shield_ended_at": clock.iso(p.get("shield_ended_at")),
        "specialization": p.get("specialization"),
        "intro_seen": bool(p.get("intro_seen_at")),
        "status": p.get("status", "ACTIVE"),
        "created_at": clock.iso(created),
        "alliance": {"alliance_id": p["alliance_id"], "tag": p.get("alliance_tag"), "name": p.get("alliance_name"), "kind": p.get("alliance_kind"), "role": p.get("alliance_role")} if p.get("alliance_id") else None,
        "alliance_join_cooldown_until": clock.iso(p.get("alliance_join_cooldown_until")),
        "war_involved_until": clock.iso(p.get("war_involved_until")),
    }


async def join_world(world: dict, account_id: str, house_name: str, slot_id: str | None = None) -> dict:
    """Join a realm; the spawn slot is picked deterministically among the FREE ones (QA tools may pin `slot_id`)."""
    spec = get_spec()
    house_name = house_name.strip()
    if not (3 <= len(house_name) <= 24):
        raise ApiError("INVALID_HOUSE_NAME", "House name must be 3-24 characters", 400)
    if world["status"] != "OPEN":
        raise ApiError("WORLD_NOT_OPEN", "World is not open", 409)
    existing = await db().players.find_one({"world_id": world["_id"], "account_id": account_id})
    if existing:
        return existing
    if await db().players.find_one({"world_id": world["_id"], "house_name_lc": house_name.lower()}):
        raise ApiError("HOUSE_NAME_TAKEN", "House name already used in this world", 409)
    player_id = f"ply_{uuid.uuid4().hex[:12]}"
    crest = house.default_crest(house_name)
    # deterministic-but-random spawn: claim ONE free slot atomically
    slot = await db().settlements.find_one_and_update(
        {"world_id": world["_id"], "kind": "PLAYER_SLOT", "slot_status": "FREE", **({"_id": slot_id} if slot_id else {})},
        {"$set": {"slot_status": "CLAIMING", "claim_token": player_id}},
        sort=[("_id", 1)],
        return_document=True,
    )
    if not slot:
        raise ApiError("WORLD_FULL", "No free player slots in this world", 409)
    now = clock.now()
    player = {
        "_id": player_id,
        "world_id": world["_id"],
        "account_id": account_id,
        "house_name": house_name,
        "house_name_lc": house_name.lower(),
        "house_crest": crest,
        "house_motto": None,
        "prestige": 0,
        "mother_settlement_id": slot["_id"],
        "settlement_count": 1,
        "settlement_reservations": 0,
        "neutral_conquests": 0,
        "shield_ended_at": None,
        "specialization": None,
        "status": "ACTIVE",
        "created_at": now,
    }
    try:
        await db().players.insert_one(player)
    except DuplicateKeyError:
        await db().settlements.update_one({"_id": slot["_id"], "claim_token": player_id}, {"$set": {"slot_status": "FREE"}, "$unset": {"claim_token": ""}})
        raise ApiError("HOUSE_NAME_TAKEN", "House name already used in this world (or account already joined)", 409)
    state = bootstrap_player_settlement(slot, player_id, house_name)
    await db().settlements.update_one({"_id": slot["_id"]}, {"$set": {**state, "owner_house_name": house_name, "owner_house_crest": crest}, "$unset": {"claim_token": ""}})
    fresh = await db().settlements.find_one({"_id": slot["_id"]})
    # release slot reservation, then claim canonical base territory
    await db().territory_tiles.delete_many({"world_id": world["_id"], "settlement_id": slot["_id"], "source": "SLOT_RESERVATION"})
    await territory.claim_base(world["_id"], fresh)
    await db().worlds.update_one({"_id": world["_id"]}, {"$inc": {"player_count": 1}})
    await notifications.notify(world["_id"], player_id, "SETTLEMENT_UPGRADE_STATE", {"settlement_id": slot["_id"], "state": "FOUNDED", "new_level": 1, "unlocks": spec.settlement_progression[1]["unlocks"]}, dedupe_key=f"founded:{player_id}", deep_link="settlement")
    return player
