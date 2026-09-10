"""Game API — all world-scoped, server-authoritative. Every mutation accepts an optional idempotency_key."""
from __future__ import annotations

import base64
import math

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.core import clock
from app.core.auth import CurrentAccount, require_admin
from app.core.db import db
from app.core.errors import ApiError, not_found
from app.core.spec import get_spec, spec_meta
from app.domain import construction, economy, marches, navy, notifications, recruitment, research, scheduler, sentinels, worlds
from app.domain import formulas as F
from app.domain.pathfinding import CHUNK
from app.domain.settlements import building_catalog, catch_up_neutral, get_owned_settlement, job_dto, owner_dto, public_dto, research_catalog, running_jobs, unit_catalog
from app.domain.worlds import player_dto, world_dto

router = APIRouter(prefix="/api", tags=["game"])


# --------------------------------------------------------------------------- helpers
class Ctx:
    def __init__(self, world: dict, player: dict, account_id: str):
        self.world = world
        self.player = player
        self.account_id = account_id


async def ctx(world_id: str, account_id: str = CurrentAccount) -> Ctx:
    world = await worlds.get_world(world_id)
    player = await worlds.get_player(world_id, account_id)
    return Ctx(world, player, account_id)


async def _fresh_settlement(world_id: str, settlement_id: str, player_id: str) -> dict:
    doc = await get_owned_settlement(world_id, settlement_id, player_id)
    for j in await running_jobs(doc["_id"]):
        if j["kind"] == "RECRUIT":
            await recruitment.sync_progress(j)
    return await economy.accrue(doc)


# --------------------------------------------------------------------------- spec / health
@router.get("/health")
async def health():
    return {"status": "ok", "spec": spec_meta(), "server_time": clock.iso(clock.now()), "scheduler": scheduler.metrics()}


@router.get("/spec/meta")
async def spec_meta_route():
    return spec_meta()


@router.get("/spec/catalog")
async def spec_catalog():
    s = get_spec()
    return {
        "buildings": [{"name": b["name"], "category": b["category"], "purpose": b["purpose"], "unlock_settlement_level": b["unlock_settlement_level"], "required_research_key": b["required_research_key"]} for b in s.buildings],
        "units": [{**u, "cost": s.unit_cost(u["name"]), "base_time_s": s.unit_base_time_seconds(u["name"]), "role": s.unit_costs[u["name"]]["role"]} for u in s.units],
        "research_branches": s.research_branches,
        "research_nodes": [{"key": n["key"], "name": n["name"], "branch": n["branch"], "max_level": n["max_level"], "prerequisites": s.research_prereqs(n["key"]), "effect": n["effect"], "cost_class": n["cost_class"], "required_university_level": n["required_university_level"], "required_settlement_level": n["required_settlement_level"]} for n in s.research_nodes],
        "economy": [s.economy[l] for l in range(1, 31)],
        "settlement_progression": [s.settlement_progression[l] for l in range(1, 31)],
        "walls": [s.walls[l] for l in range(1, 31)],
        "terrain": s.terrain,
        "counter_matrix": s.counter_matrix,
        "missions": ["ATTACK", "RAID", "CONQUEST", "REINFORCE", "GARRISON_SENTINEL"],
    }


# --------------------------------------------------------------------------- worlds / players
@router.get("/worlds")
async def list_worlds(account_id: str = CurrentAccount):
    return {"worlds": await worlds.list_worlds(account_id), "server_time": clock.iso(clock.now())}


class CreateWorldIn(BaseModel):
    name: str | None = None
    seed: int | None = None


@router.post("/worlds", dependencies=[Depends(require_admin)])
async def create_world(body: CreateWorldIn):
    return world_dto(await worlds.create_world(body.name, body.seed))


class JoinIn(BaseModel):
    house_name: str = Field(min_length=3, max_length=24)


@router.post("/worlds/{world_id}/join")
async def join(world_id: str, body: JoinIn, account_id: str = CurrentAccount):
    world = await worlds.get_world(world_id)
    player = await worlds.join_world(world, account_id, body.house_name)
    return {"player": player_dto(player), "world": world_dto(world)}


@router.get("/worlds/{world_id}/me")
async def me(c: Ctx = Depends(ctx)):
    cur = db().settlements.find({"world_id": c.world["_id"], "owner_player_id": c.player["_id"]}).sort("founded_at", 1)
    settlements = []
    async for s in cur:
        s = await economy.accrue(s)
        settlements.append({**public_dto(s, c.player["_id"]), "is_mother": bool(s.get("is_mother")), "resources": s["resources"]})
    unread = await db().inbox.count_documents({"world_id": c.world["_id"], "player_id": c.player["_id"], "read_at": None})
    return {"player": player_dto(c.player), "world": world_dto(c.world), "settlements": settlements, "unread_inbox": unread, "server_time": clock.iso(clock.now())}


# --------------------------------------------------------------------------- settlements
@router.get("/worlds/{world_id}/settlements/{settlement_id}")
async def get_settlement(world_id: str, settlement_id: str, c: Ctx = Depends(ctx)):
    doc = await _fresh_settlement(world_id, settlement_id, c.player["_id"])
    return await owner_dto(doc, c.player)


@router.get("/worlds/{world_id}/settlements/{settlement_id}/buildings")
async def buildings(world_id: str, settlement_id: str, c: Ctx = Depends(ctx)):
    doc = await _fresh_settlement(world_id, settlement_id, c.player["_id"])
    jobs = await running_jobs(doc["_id"])
    return {"buildings": await building_catalog(doc, jobs, int(c.player.get("settlement_count", 1))), "settlement_upgrade": (await owner_dto(doc, c.player))["settlement_upgrade"], "jobs": [job_dto(j) for j in jobs], "resources": doc["resources"], "server_time": clock.iso(clock.now())}


class IdemIn(BaseModel):
    idempotency_key: str | None = Field(default=None, max_length=80)


@router.post("/worlds/{world_id}/settlements/{settlement_id}/buildings/{name}/upgrade")
async def upgrade_building(world_id: str, settlement_id: str, name: str, body: IdemIn, c: Ctx = Depends(ctx)):
    doc = await _fresh_settlement(world_id, settlement_id, c.player["_id"])
    job = await construction.start_building(doc, c.player, name, body.idempotency_key)
    return {"job": job_dto(job)}


@router.post("/worlds/{world_id}/settlements/{settlement_id}/upgrade")
async def upgrade_settlement(world_id: str, settlement_id: str, body: IdemIn, c: Ctx = Depends(ctx)):
    doc = await _fresh_settlement(world_id, settlement_id, c.player["_id"])
    job = await construction.start_settlement_upgrade(doc, c.player, body.idempotency_key)
    return {"job": job_dto(job)}


@router.get("/worlds/{world_id}/settlements/{settlement_id}/jobs")
async def jobs(world_id: str, settlement_id: str, c: Ctx = Depends(ctx)):
    doc = await _fresh_settlement(world_id, settlement_id, c.player["_id"])
    return {"jobs": [job_dto(j) for j in await running_jobs(doc["_id"])], "server_time": clock.iso(clock.now())}


@router.post("/worlds/{world_id}/jobs/{job_id}/cancel")
async def cancel_job(world_id: str, job_id: str, c: Ctx = Depends(ctx)):
    job = await db().jobs.find_one({"_id": job_id, "world_id": world_id})
    if not job:
        raise not_found("job", job_id)
    return await construction.cancel_job(job, c.player["_id"])


# --------------------------------------------------------------------------- research
@router.get("/worlds/{world_id}/settlements/{settlement_id}/research")
async def research_list(world_id: str, settlement_id: str, c: Ctx = Depends(ctx)):
    doc = await _fresh_settlement(world_id, settlement_id, c.player["_id"])
    jobs = await running_jobs(doc["_id"])
    return {"branches": get_spec().research_branches, "nodes": research_catalog(doc, jobs), "queues": int(get_spec().research_scope["queues_per_settlement"]), "active": len([j for j in jobs if j["kind"] == "RESEARCH"]), "resources": doc["resources"], "server_time": clock.iso(clock.now())}


@router.post("/worlds/{world_id}/settlements/{settlement_id}/research/{key}/start")
async def research_start(world_id: str, settlement_id: str, key: str, body: IdemIn, c: Ctx = Depends(ctx)):
    doc = await _fresh_settlement(world_id, settlement_id, c.player["_id"])
    job = await research.start_research(doc, c.player, key, body.idempotency_key)
    return {"job": job_dto(job)}


# --------------------------------------------------------------------------- army
@router.get("/worlds/{world_id}/settlements/{settlement_id}/army")
async def army(world_id: str, settlement_id: str, c: Ctx = Depends(ctx)):
    doc = await _fresh_settlement(world_id, settlement_id, c.player["_id"])
    jobs = await running_jobs(doc["_id"])
    return {"army": {k: int(v) for k, v in doc.get("army", {}).items() if int(v) > 0}, "ships": int(doc.get("ships", 0)), "units": unit_catalog(doc, jobs), "resources": doc["resources"], "server_time": clock.iso(clock.now())}


class RecruitIn(IdemIn):
    unit: str
    count: int = Field(ge=1, le=100000)


@router.post("/worlds/{world_id}/settlements/{settlement_id}/recruit")
async def recruit(world_id: str, settlement_id: str, body: RecruitIn, c: Ctx = Depends(ctx)):
    doc = await _fresh_settlement(world_id, settlement_id, c.player["_id"])
    job = await recruitment.start_recruitment(doc, c.player, body.unit, body.count, body.idempotency_key)
    return {"job": job_dto(job)}


class ShipsIn(IdemIn):
    count: int = Field(ge=1, le=1000)


@router.post("/worlds/{world_id}/settlements/{settlement_id}/ships")
async def ships(world_id: str, settlement_id: str, body: ShipsIn, c: Ctx = Depends(ctx)):
    doc = await _fresh_settlement(world_id, settlement_id, c.player["_id"])
    job = await navy.start_ship_production(doc, c.player, body.count, body.idempotency_key)
    return {"job": job_dto(job)}


# --------------------------------------------------------------------------- sentinels
class SentinelIn(IdemIn):
    direction: str


@router.get("/worlds/{world_id}/settlements/{settlement_id}/sentinels")
async def list_sentinels(world_id: str, settlement_id: str, c: Ctx = Depends(ctx)):
    doc = await get_owned_settlement(world_id, settlement_id, c.player["_id"])
    return {"sentinels": await sentinels.list_for_settlement(world_id, doc["_id"]), "garrison_cap": F.sentinel_garrison_cap(int(doc["buildings"].get("Comando Sentinelle", 0))), "command_level": int(doc["buildings"].get("Comando Sentinelle", 0))}


@router.post("/worlds/{world_id}/settlements/{settlement_id}/sentinels")
async def build_sentinel(world_id: str, settlement_id: str, body: SentinelIn, c: Ctx = Depends(ctx)):
    doc = await _fresh_settlement(world_id, settlement_id, c.player["_id"])
    job = await sentinels.start_build(doc, c.player, body.direction, body.idempotency_key)
    return {"job": job_dto(job)}


# --------------------------------------------------------------------------- map
@router.get("/worlds/{world_id}/map/chunk/{cx}/{cy}")
async def map_chunk(world_id: str, cx: int, cy: int, c: Ctx = Depends(ctx)):
    n_chunks = math.ceil(400 / CHUNK)
    if not (0 <= cx < n_chunks and 0 <= cy < n_chunks):
        raise ApiError("CHUNK_OUT_OF_RANGE", "Chunk out of range", 400)
    chunk = await db().map_chunks.find_one({"world_id": world_id, "cx": cx, "cy": cy})
    if not chunk:
        raise not_found("chunk", f"{cx},{cy}")
    ents = []
    async for s in db().settlements.find({"world_id": world_id, "chunk_cx": cx, "chunk_cy": cy}):
        if s["kind"] == "NEUTRAL":
            s = await catch_up_neutral(s, c.world)
        ents.append(public_dto(s, c.player["_id"]))
    sents = [sentinels.dto(s) async for s in db().sentinels.find({"world_id": world_id, "x": {"$gte": cx * CHUNK, "$lt": (cx + 1) * CHUNK}, "y": {"$gte": cy * CHUNK, "$lt": (cy + 1) * CHUNK}, "state": {"$ne": "REMOVED"}})]
    for s in sents:
        s["faction"] = "OWN" if s["owner_player_id"] == c.player["_id"] else "ENEMY"
        if s["faction"] != "OWN":
            s["garrison"] = {}
    tiles = [{"x": t["x"], "y": t["y"], "faction": "OWN" if t.get("owner_player_id") == c.player["_id"] else ("RESERVED" if t.get("owner_player_id") is None else "ENEMY")} async for t in db().territory_tiles.find({"world_id": world_id, "chunk_cx": cx, "chunk_cy": cy})]
    return {
        "world_id": world_id,
        "cx": cx,
        "cy": cy,
        "size": CHUNK,
        "terrain_b64": base64.b64encode(chunk["terrain"]).decode("ascii"),
        "settlements": ents,
        "sentinels": sents,
        "territory": tiles,
        "server_time": clock.iso(clock.now()),
    }


OVERVIEW_FACTOR = 4
_overview_cache: dict[str, bytes] = {}


@router.get("/worlds/{world_id}/map/overview")
async def map_overview(world_id: str, c: Ctx = Depends(ctx)):
    """Low-resolution world terrain (1 cell = 4x4 tiles) + all player settlements, for far-zoom LOD rendering."""
    import numpy as np

    from app.domain.pathfinding import N, load_terrain

    if world_id not in _overview_cache:
        grid = await load_terrain(world_id)
        n = N // OVERVIEW_FACTOR
        blocks = grid[: n * OVERVIEW_FACTOR, : n * OVERVIEW_FACTOR].reshape(n, OVERVIEW_FACTOR, n, OVERVIEW_FACTOR)
        counts = np.stack([(blocks == code).sum(axis=(1, 3)) for code in range(4)], axis=-1).astype(np.float32)
        counts *= np.array([1.0, 1.15, 1.35, 1.05], dtype=np.float32)  # plain, forest, mountain, water — keep relief readable
        _overview_cache[world_id] = counts.argmax(axis=-1).astype(np.uint8).tobytes()
    players = []
    async for s in db().settlements.find({"world_id": world_id, "kind": "PLAYER"}):
        players.append(public_dto(s, c.player["_id"]))
    return {
        "world_id": world_id,
        "factor": OVERVIEW_FACTOR,
        "size": 400 // OVERVIEW_FACTOR,
        "terrain_b64": base64.b64encode(_overview_cache[world_id]).decode("ascii"),
        "settlements": players,
        "server_time": clock.iso(clock.now()),
    }


@router.get("/worlds/{world_id}/map/marches")
async def map_marches(world_id: str, chunks: str = Query(default=""), c: Ctx = Depends(ctx)):
    """chunks = 'cx:cy,cx:cy'. Returns own + incoming marches crossing these chunks."""
    parsed = []
    for part in chunks.split(","):
        if ":" in part:
            a, b = part.split(":")
            parsed.append((int(a), int(b)))
    if not parsed:
        return {"marches": await marches.active_for_player(world_id, c.player["_id"]), "server_time": clock.iso(clock.now())}
    return {"marches": await marches.visible_in_chunks(world_id, c.player["_id"], parsed), "server_time": clock.iso(clock.now())}


@router.get("/worlds/{world_id}/settlements/{settlement_id}/public")
async def settlement_public(world_id: str, settlement_id: str, c: Ctx = Depends(ctx)):
    doc = await db().settlements.find_one({"_id": settlement_id, "world_id": world_id})
    if not doc:
        raise not_found("settlement", settlement_id)
    doc = await catch_up_neutral(doc, c.world)
    d = public_dto(doc, c.player["_id"])
    if doc["kind"] == "NEUTRAL":
        d["garrison"] = {k: int(v) for k, v in doc.get("army", {}).items() if int(v) > 0}  # neutral composition is public (PvE)
        d["wall"] = doc.get("wall")
        d["buildings"] = doc.get("buildings")
        d["next_growth_at"] = clock.iso(doc.get("next_growth_at"))
    elif doc.get("owner_player_id"):
        owner = await db().players.find_one({"_id": doc["owner_player_id"]})
        d["owner_shield_active"] = bool(owner and __import__("app.domain.conquest", fromlist=["shield_active"]).shield_active(owner))
    return d


# --------------------------------------------------------------------------- marches
class MarchIn(IdemIn):
    origin_settlement_id: str
    target_settlement_id: str | None = None
    target_sentinel_id: str | None = None
    mission: str
    units: dict[str, int]
    naval: bool = False
    ships: int = 0


@router.post("/worlds/{world_id}/marches/preview")
async def march_preview(world_id: str, body: MarchIn, c: Ctx = Depends(ctx)):
    origin = await get_owned_settlement(world_id, body.origin_settlement_id, c.player["_id"])
    if body.target_sentinel_id:
        s = await db().sentinels.find_one({"_id": body.target_sentinel_id, "world_id": world_id})
        if not s:
            raise not_found("sentinel", body.target_sentinel_id)
        grid = await __import__("app.domain.pathfinding", fromlist=["load_terrain"]).load_terrain(world_id)
        target = {"x": s["x"], "y": s["y"], "terrain": get_spec().terrain_name(int(grid[s["y"], s["x"]]))}
    else:
        target = await db().settlements.find_one({"_id": body.target_settlement_id, "world_id": world_id})
        if not target:
            raise not_found("settlement", body.target_settlement_id or "")
    return await marches.preview(c.world, origin, target, {k: int(v) for k, v in body.units.items()}, body.mission, c.player)


@router.post("/worlds/{world_id}/marches")
async def march_launch(world_id: str, body: MarchIn, c: Ctx = Depends(ctx)):
    origin = await _fresh_settlement(world_id, body.origin_settlement_id, c.player["_id"])
    m = await marches.launch(c.world, c.player, origin, body.mission, body.units, body.target_settlement_id, body.target_sentinel_id, body.idempotency_key, naval=body.naval, ships=body.ships)
    return {"march": marches.dto(m)}


@router.get("/worlds/{world_id}/marches")
async def march_list(world_id: str, c: Ctx = Depends(ctx)):
    return {"marches": await marches.active_for_player(world_id, c.player["_id"]), "server_time": clock.iso(clock.now())}


@router.get("/worlds/{world_id}/marches/{march_id}")
async def march_get(world_id: str, march_id: str, c: Ctx = Depends(ctx)):
    m = await db().marches.find_one({"_id": march_id, "world_id": world_id, "player_id": c.player["_id"]})
    if not m:
        raise not_found("march", march_id)
    return marches.dto(m)


@router.post("/worlds/{world_id}/marches/{march_id}/recall")
async def march_recall(world_id: str, march_id: str, c: Ctx = Depends(ctx)):
    m = await db().marches.find_one({"_id": march_id, "world_id": world_id})
    if not m:
        raise not_found("march", march_id)
    return marches.dto(await marches.recall(m, c.player["_id"]))


# --------------------------------------------------------------------------- battles / inbox
def _battle_dto(b: dict) -> dict:
    return {
        "battle_id": b["_id"],
        "world_id": b["world_id"],
        "march_id": b.get("march_id"),
        "attacker_player_id": b.get("attacker_player_id"),
        "defender_player_id": b.get("defender_player_id"),
        "target_settlement_id": b.get("target_settlement_id"),
        "target_sentinel_id": b.get("target_sentinel_id"),
        "target_name": b.get("target_name"),
        "target_xy": b.get("target_xy"),
        "mission": b["mission"],
        "report": b["report"],
        "loot": b.get("loot"),
        "ownership_result": b.get("ownership_result"),
        "loyalty": b.get("loyalty"),
        "ships_excluded": b.get("ships_excluded", 0),
        "created_at": clock.iso(b["created_at"]),
    }


@router.get("/worlds/{world_id}/battles")
async def battles(world_id: str, limit: int = Query(default=30, le=100), c: Ctx = Depends(ctx)):
    cur = db().battles.find({"world_id": world_id, "participants": c.player["_id"]}).sort("created_at", -1).limit(limit)
    return {"battles": [_battle_dto(b) async for b in cur]}


@router.get("/worlds/{world_id}/battles/{battle_id}")
async def battle(world_id: str, battle_id: str, c: Ctx = Depends(ctx)):
    b = await db().battles.find_one({"_id": battle_id, "world_id": world_id, "participants": c.player["_id"]})
    if not b:
        raise not_found("battle", battle_id)
    return _battle_dto(b)


@router.get("/worlds/{world_id}/inbox")
async def inbox(world_id: str, limit: int = Query(default=50, le=200), c: Ctx = Depends(ctx)):
    cur = db().inbox.find({"world_id": world_id, "player_id": c.player["_id"]}).sort("created_at_utc", -1).limit(limit)
    items = [notifications.dto(n) async for n in cur]
    unread = await db().inbox.count_documents({"world_id": world_id, "player_id": c.player["_id"], "read_at": None})
    return {"items": items, "unread": unread, "server_time": clock.iso(clock.now())}


@router.post("/worlds/{world_id}/inbox/{notification_id}/read")
async def inbox_read(world_id: str, notification_id: str, c: Ctx = Depends(ctx)):
    await db().inbox.update_one({"_id": notification_id, "player_id": c.player["_id"], "read_at": None}, {"$set": {"read_at": clock.now()}})
    return {"ok": True}


@router.post("/worlds/{world_id}/inbox/read-all")
async def inbox_read_all(world_id: str, c: Ctx = Depends(ctx)):
    res = await db().inbox.update_many({"world_id": world_id, "player_id": c.player["_id"], "read_at": None}, {"$set": {"read_at": clock.now()}})
    return {"updated": res.modified_count}
