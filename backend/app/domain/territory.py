"""Territory tiles: land_tile_single_owner_invariant via unique (world_id,x,y) index.
Base territory = anchor + up to 4 cardinal land tiles; sentinel sectors add tiles (sentinels.py)."""
from __future__ import annotations

from pymongo.errors import BulkWriteError, DuplicateKeyError

from app.core.db import db
from app.domain.pathfinding import load_terrain

N = 400
CHUNK = 32


def _tile_doc(world_id: str, x: int, y: int, owner: str, settlement_id: str, source: str) -> dict:
    return {"_id": f"{world_id}:{x}:{y}", "world_id": world_id, "x": x, "y": y, "chunk_cx": x // CHUNK, "chunk_cy": y // CHUNK, "owner_player_id": owner, "settlement_id": settlement_id, "source": source}


async def claim_tiles(world_id: str, tiles: list[tuple[int, int]], owner: str, settlement_id: str, source: str) -> int:
    grid = await load_terrain(world_id)
    docs = []
    for x, y in tiles:
        if not (0 <= x < N and 0 <= y < N) or int(grid[y, x]) == 3:
            continue  # water is never land ownership
        docs.append(_tile_doc(world_id, x, y, owner, settlement_id, source))
    if not docs:
        return 0
    try:
        res = await db().territory_tiles.insert_many(docs, ordered=False)
        return len(res.inserted_ids)
    except BulkWriteError as e:
        return int(e.details.get("nInserted", 0))
    except DuplicateKeyError:
        return 0


async def claim_base(world_id: str, settlement: dict) -> int:
    x, y = settlement["x"], settlement["y"]
    owner = settlement["owner_player_id"]
    tiles = [(x, y), (x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    # release stale ownership of the anchor tile (unclaimed slot reservation / previous owner)
    await db().territory_tiles.delete_many({"world_id": world_id, "settlement_id": settlement["_id"]})
    return await claim_tiles(world_id, tiles, owner, settlement["_id"], "BASE")


async def release_settlement(world_id: str, settlement_id: str) -> None:
    await db().territory_tiles.delete_many({"world_id": world_id, "settlement_id": settlement_id})


async def release_source(world_id: str, source: str) -> int:
    res = await db().territory_tiles.delete_many({"world_id": world_id, "source": source})
    return res.deleted_count


async def release_player_sentinels_for_settlement(world_id: str, settlement_id: str) -> None:
    cur = db().sentinels.find({"world_id": world_id, "settlement_id": settlement_id, "state": {"$ne": "REMOVED"}})
    async for s in cur:
        # STC-22: surviving structures transfer empty to the new owner with a fresh 24h grace
        from app.domain import sentinels

        await sentinels.transfer_to_new_owner(s)


async def owner_of_tile(world_id: str, x: int, y: int) -> str | None:
    t = await db().territory_tiles.find_one({"_id": f"{world_id}:{x}:{y}"}, {"owner_player_id": 1})
    return t["owner_player_id"] if t else None


async def player_tiles(world_id: str, player_id: str) -> set[tuple[int, int]]:
    cur = db().territory_tiles.find({"world_id": world_id, "owner_player_id": player_id}, {"x": 1, "y": 1})
    return {(t["x"], t["y"]) async for t in cur}
