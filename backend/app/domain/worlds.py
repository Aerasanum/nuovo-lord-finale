"""Worlds: generation + persistence (map chunks, 800 neutrals, 100 slots), listing, join with atomic slot claim,
Player bootstrap (world-scoped)."""
from __future__ import annotations

import asyncio
import hashlib
import math
import logging
import uuid

import numpy as np
from pymongo.errors import DuplicateKeyError

from app.core import clock
from app.core.db import db
from app.core.errors import ApiError
from app.core.spec import get_spec
from app.domain import conquest, grande_mondo, house, inactivity, mythic, notifications, territory
from app.domain import formulas as F
from app.domain.pathfinding import CHUNK, invalidate
from app.domain.settlements import bootstrap_player_settlement, build_neutral_state, chunk_of, new_id
from app.domain.worldgen import N, GenConfig, SectorGeom, generate_grande_mondo, generate_world

log = logging.getLogger("worlds")


def world_dto(w: dict, player: dict | None = None) -> dict:
    return {
        "world_id": w["_id"],
        "name": w["name"],
        "kind": w.get("kind") or "REALM",
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
        "inactivity": inactivity.rule(w),
        "grande_mondo": grande_mondo.dto(w, player),
    }


# Owner's rule: foreign caravans are visible/raidable up to this Chebyshev distance from the observing settlement
# (the Bible research radius 5–12 is the floor; see caravans.search_radius).
CARAVAN_SEARCH_RADIUS = 50


async def create_world(name: str | None = None, seed: int | None = None, gen_overrides: dict | None = None, *, world_id: str | None = None, hidden: bool = False) -> dict:
    """Generate and open a classic single-region realm. `gen_overrides` (size / spacing / pyramid anchor) tune the
    landmass layout for this world only — see worldgen.GenConfig; Bible counts, timers and costs are untouched.

    Product decision (June 2026): every player-facing realm is a Grande Mondo (9 regions of 600×600); classic realms
    remain only as `hidden` QA worlds for the automated e2e suite (never listed to players)."""
    spec = get_spec()
    cfg = GenConfig.from_spec(spec, gen_overrides)
    count = await db().worlds.count_documents({})
    world_id = world_id or f"world_{count + 1}"
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
        "hidden": hidden,
        "caravan_search_radius": CARAVAN_SEARCH_RADIUS,
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
    await _persist_chunks(world_id, gen.terrain)
    await _persist_settlements(world_id, [(a, None) for a in gen.anchors], gen.terrain, now)
    invalidate(world_id)
    await db().worlds.update_one({"_id": world_id}, {"$set": {"status": "OPEN", "opened_at": now, "terrain_stats": gen.stats, "generation_seed": gen.seed}})
    world = await db().worlds.find_one({"_id": world_id})
    await inactivity.ensure_schedule(world)
    return world


async def _persist_chunks(world_id: str, terrain: np.ndarray) -> None:
    size = int(terrain.shape[0])
    n_chunks = (size + CHUNK - 1) // CHUNK
    chunks = []
    for cy in range(n_chunks):
        for cx in range(n_chunks):
            block = np.full((CHUNK, CHUNK), 3, dtype=np.uint8)
            h = min(CHUNK, size - cy * CHUNK)
            w = min(CHUNK, size - cx * CHUNK)
            block[:h, :w] = terrain[cy * CHUNK : cy * CHUNK + h, cx * CHUNK : cx * CHUNK + w]
            chunks.append({"_id": f"{world_id}:{cx}:{cy}", "world_id": world_id, "cx": cx, "cy": cy, "terrain": block.tobytes()})
            if len(chunks) >= 2000:
                await db().map_chunks.insert_many(chunks)
                chunks = []
    if chunks:
        await db().map_chunks.insert_many(chunks)


async def _persist_settlements(world_id: str, anchors: list[tuple], terrain: np.ndarray, now) -> None:
    """Neutral + PLAYER_SLOT documents (+ slot reservation tiles). `anchors` = (Anchor, region_code | None)."""
    spec = get_spec()
    size = int(terrain.shape[0])
    docs = []
    for a, code in anchors:
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
        if code:
            base["region_code"] = code
        if a.kind == "NEUTRAL":
            st = build_neutral_state(a.level, a.port_eligible)
            docs.append({**base, "kind": "NEUTRAL", "name": f"Neutrale {a.x},{a.y}", "level": st["level"], "buildings": st["buildings"], "army": st["army"], "wall": st["wall"], "growth_ticks": 0, "next_growth_at": None})
        else:
            docs.append({**base, "kind": "PLAYER_SLOT", "slot_status": "FREE", "level": 0, "buildings": {}, "army": {}, "wall": {"level": 0, "current_hp": 0, "max_hp": 0}})
    for i in range(0, len(docs), 2000):
        await db().settlements.insert_many(docs[i : i + 2000])
    # slot reservation radius 4 blocks territory claims around unused slots
    r = int(spec.spawn["unused_slot_reservation"]["radius_tiles_chebyshev"])
    tile_docs = []
    seen = set()
    for d in docs:
        if d["kind"] != "PLAYER_SLOT":
            continue
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                x, y = d["x"] + dx, d["y"] + dy
                if 0 <= x < size and 0 <= y < size and terrain[y, x] != 3 and (x, y) not in seen:
                    seen.add((x, y))
                    tile_docs.append({"_id": f"{world_id}:{x}:{y}", "world_id": world_id, "x": x, "y": y, "chunk_cx": x // CHUNK, "chunk_cy": y // CHUNK, "owner_player_id": None, "settlement_id": d["_id"], "source": "SLOT_RESERVATION"})
    for i in range(0, len(tile_docs), 5000):
        try:
            await db().territory_tiles.insert_many(tile_docs[i : i + 5000], ordered=False)
        except Exception:  # overlapping reservations between slots are fine
            pass


async def create_grande_mondo(name: str | None = None, seed: int | None = None, params: dict | None = None, background: bool = False) -> dict:
    """Bibbia GM: one mega-realm disc — neutral centre with the Grande Piramide + `regions` sectors, each a complete realm.
    Generation takes ~1-2 min (9 sectors): with `background=True` the world is returned as GENERATING and completed by a task."""
    spec = get_spec()
    D = {**grande_mondo.DEFAULTS, **(params or {})}  # noqa: N806
    n = int(D["regions"])
    if not (2 <= n <= len(grande_mondo.REGION_CATALOG)):
        raise ApiError("INVALID_REGIONS", f"regions must be 2..{len(grande_mondo.REGION_CATALOG)}", 400)
    lay = grande_mondo.layout(n, int(D["r_out"]), int(D["margin"]))
    count = await db().worlds.count_documents({})
    world_id = f"gm_{await db().worlds.count_documents({'kind': grande_mondo.KIND}) + 1}"
    if seed is None:
        seed = int(hashlib.sha256(world_id.encode()).hexdigest(), 16) % 1_000_000
    now = clock.now()
    cx, cy = lay["center"]
    gm_config = {k: D[k] for k in ("regions", "max_players_per_region", "isolation_days", "war_days", "pyramid_hold_hours", "r_in", "r_land", "r_out", "channel_half", "margin")}
    skeleton = {"gm_config": gm_config, "center": {"x": cx, "y": cy}, "regions": None}
    regions = [grande_mondo.region_record(i, grande_mondo.REGION_CATALOG[i], skeleton) for i in range(n)]
    gm_state, _ = grande_mondo.initial_state(world_id, now, D)
    doc = {
        "_id": world_id,
        "name": name or f"Grande Mondo {count + 1}",
        "kind": grande_mondo.KIND,
        "status": "GENERATING",
        "seed": seed,
        "size": int(lay["world_size"]),
        "gen_config": GenConfig.from_spec(spec, {"size": 600, **D["region_gen"]}).to_doc(),
        "gm_config": gm_config,
        "regions": regions,
        "center": {"x": cx, "y": cy, "radius": int(D["r_in"]), "pyramid_anchor": [cx, cy]},
        "player_slots": int(spec.world["player_slots"]) * n,
        "player_count": 0,
        "hidden": False,
        "caravan_search_radius": CARAVAN_SEARCH_RADIUS,
        # Grande Piramide monument at the centre; the classic Alliance cycle stays dormant here (regional control comes with the GM Pyramid rules)
        "pyramid_config": {"anchor": [cx, cy], "footprint": [41, 41]},  # Grande Piramide: manual open (admin, during a war) — see pyramid._kind_defaults
        "gm": gm_state,
        "spec_version": spec.version,
        "spec_hash": spec.computed_hash,
        "created_at": now,
        "opened_at": None,
    }
    try:
        await db().worlds.insert_one(doc)
    except DuplicateKeyError:
        raise ApiError("WORLD_EXISTS", "World already exists", 409)
    sectors = [SectorGeom(r["index"], r["code"], float(cx), float(cy), math.radians(r["mid_deg"]), math.radians(r["half_deg"]), r["r_in"], r["r_land"], r["r_out"], int(D["channel_half"])) for r in regions]

    async def _finish() -> None:
        try:
            gen = await asyncio.get_running_loop().run_in_executor(None, generate_grande_mondo, seed, spec, D["region_gen"], sectors, int(lay["world_size"]), (cx, cy), int(D["r_in"]))
        except Exception as e:  # noqa: BLE001
            log.exception("grande mondo generation failed")
            await db().worlds.update_one({"_id": world_id}, {"$set": {"status": "FAILED", "error": str(e)}})
            if not background:
                raise ApiError("MAP_GENERATION_CONSTRAINT_FAILED", "World generation failed", 500, {"error": str(e)})
            return
        await _persist_chunks(world_id, gen.terrain)
        await _persist_settlements(world_id, gen.anchors, gen.terrain, now)
        invalidate(world_id)
        opened = clock.now()
        state, key = grande_mondo.initial_state(world_id, opened, D)
        # regional Pyramid anchors as generated (mid angle, mid radius)
        sets = {"status": "OPEN", "opened_at": opened, "terrain_stats": gen.stats, "generation_seed": gen.seed, "gm": state}
        for r in regions:
            pa = (gen.stats["regions"].get(r["code"]) or {}).get("pyramid_anchor")
            if pa:
                sets[f"regions.{r['index']}.pyramid_anchor"] = pa
        await db().worlds.update_one({"_id": world_id}, {"$set": sets})
        await grande_mondo.ensure_schedule(await db().worlds.find_one({"_id": world_id}))
        await inactivity.ensure_schedule(await db().worlds.find_one({"_id": world_id}))
        log.info("grande mondo %s ready (%d regions, %dx%d)", world_id, n, lay["world_size"], lay["world_size"])

    if background:
        asyncio.create_task(_finish())
    else:
        await _finish()
    return await db().worlds.find_one({"_id": world_id})


async def ensure_default_world() -> None:
    """First boot: the default realm is a Grande Mondo (9 regions of 600×600 — product decision, June 2026)."""
    if await db().worlds.count_documents({"status": "OPEN", "hidden": {"$ne": True}}) == 0:
        stuck = await db().worlds.find_one({"status": "GENERATING"})
        if stuck:
            await delete_world(stuck["_id"])
        log.info("generating default Grande Mondo…")
        await create_grande_mondo("Grande Mondo 1", None, None, background=False)
        log.info("default world ready")


WORLD_SCOPED_COLLECTIONS = ("map_chunks", "settlements", "territory_tiles", "sentinels", "marches", "battles", "inbox", "jobs", "scheduled_events", "chronicle", "pyramid", "missions", "teleport_log", "players", "alliances", "alliance_chat", "alliance_invites", "alliance_relations", "chat_messages", "emerald_ledger", "mercenary_contracts", "war_votes")


async def delete_world(world_id: str) -> dict[str, int]:
    """Remove a realm and everything scoped to it (players included — accounts survive). Admin/QA only."""
    from app.domain import grande_mondo

    counts: dict[str, int] = {}
    names = set(await db().list_collection_names())
    for coll in WORLD_SCOPED_COLLECTIONS:
        if coll in names:
            res = await db()[coll].delete_many({"world_id": world_id})
            if res.deleted_count:
                counts[coll] = res.deleted_count
    res = await db().pyramid.delete_many({"_id": {"$regex": f"^{world_id}(:|$)"}})
    if res.deleted_count:
        counts["pyramid"] = counts.get("pyramid", 0) + res.deleted_count
    await db().worlds.delete_one({"_id": world_id})
    grande_mondo._zone_cache.pop(world_id, None)
    return counts


async def list_worlds(account_id: str) -> list[dict]:
    out = []
    async for w in db().worlds.find({"status": {"$in": ["OPEN", "GENERATING"]}, "hidden": {"$ne": True}}).sort("created_at", 1):
        p = await db().players.find_one({"world_id": w["_id"], "account_id": account_id})
        d = world_dto(w, p)
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
        raise ApiError("PLAYER_ELIMINATED", "This Player has been eliminated", 409, {"reason": p.get("eliminated_reason")})
    await inactivity.touch(p)
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
        "region_code": p.get("region_code"),
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
        "tour_seen": bool(p.get("tour_seen_at")),
        "hints_seen": list(p.get("hints_seen") or []),
        "return_pending": bool(p.get("return_pending")),
        "return_since": clock.iso(p["return_since"]) if p.get("return_since") else None,
        "sanctuary_level": int((p.get("sanctuary") or {}).get("level", 0)),
        "unicorn": mythic.unicorn_dto(p),
        "status": p.get("status", "ACTIVE"),
        "created_at": clock.iso(created),
        "last_active_at": clock.iso(inactivity.last_active(p)),
        "alliance": {"alliance_id": p["alliance_id"], "tag": p.get("alliance_tag"), "name": p.get("alliance_name"), "kind": p.get("alliance_kind"), "role": p.get("alliance_role")} if p.get("alliance_id") else None,
        "alliance_join_cooldown_until": clock.iso(p.get("alliance_join_cooldown_until")),
        "war_involved_until": clock.iso(p.get("war_involved_until")),
    }


async def join_world(world: dict, account_id: str, house_name: str, slot_id: str | None = None, region_code: str | None = None) -> dict:
    """Join a realm; the spawn slot is picked deterministically among the FREE ones (QA tools may pin `slot_id`).
    Grande Mondo (Bibbia GM): the player must pick a region explicitly; a full region (100 players) refuses him."""
    spec = get_spec()
    house_name = house_name.strip()
    if not (3 <= len(house_name) <= 24):
        raise ApiError("INVALID_HOUSE_NAME", "House name must be 3-24 characters", 400)
    if world["status"] != "OPEN":
        raise ApiError("WORLD_NOT_OPEN", "World is not open", 409)
    existing = await db().players.find_one({"world_id": world["_id"], "account_id": account_id})
    if existing:
        return existing
    region = None
    if grande_mondo.is_grande_mondo(world):
        region = grande_mondo.region_by_code(world, region_code)
        if not region:
            raise ApiError("REGION_REQUIRED", "Choose a region of the Grande Mondo", 400, {"regions": [r["code"] for r in world.get("regions") or []]})
        if int(region.get("player_count", 0)) >= int(region.get("player_slots", 100)):
            raise ApiError("REGION_FULL", "This region has reached its player limit", 409, {"region": region["code"]})
    if await db().players.find_one({"world_id": world["_id"], "house_name_lc": house_name.lower()}):
        raise ApiError("HOUSE_NAME_TAKEN", "House name already used in this world", 409)
    player_id = f"ply_{uuid.uuid4().hex[:12]}"
    crest = house.default_crest(house_name)
    # deterministic-but-random spawn: claim ONE free slot atomically
    slot = await db().settlements.find_one_and_update(
        {"world_id": world["_id"], "kind": "PLAYER_SLOT", "slot_status": "FREE", **({"_id": slot_id} if slot_id else {}), **({"region_code": region["code"]} if region else {})},
        {"$set": {"slot_status": "CLAIMING", "claim_token": player_id}},
        sort=[("_id", 1)],
        return_document=True,
    )
    if not slot:
        raise ApiError("REGION_FULL" if region else "WORLD_FULL", "No free player slots" + (" in this region" if region else " in this world"), 409)
    now = clock.now()
    player = {
        "_id": player_id,
        "world_id": world["_id"],
        "account_id": account_id,
        "region_code": region["code"] if region else None,
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
    inc = {"player_count": 1}
    if region:
        inc[f"regions.{int(region['index'])}.player_count"] = 1
    await db().worlds.update_one({"_id": world["_id"]}, {"$inc": inc})
    await notifications.notify(world["_id"], player_id, "SETTLEMENT_UPGRADE_STATE", {"settlement_id": slot["_id"], "state": "FOUNDED", "new_level": 1, "unlocks": spec.settlement_progression[1]["unlocks"]}, dedupe_key=f"founded:{player_id}", deep_link="settlement")
    return player
