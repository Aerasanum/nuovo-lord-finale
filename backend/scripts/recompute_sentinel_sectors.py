"""Recompute the territory sector of every live Sentinel with the current `sector_tiles` geometry (wedges).

Releases the tiles previously claimed by each sentinel (source SENTINEL:<id>) and claims the new wedge — single-owner
invariant and BASE tiles are respected by `territory.claim_tiles`. Idempotent; safe to re-run.

Usage: cd /app/backend && python scripts/recompute_sentinel_sectors.py [world_id]
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from app.core.db import db  # noqa: E402
from app.domain import territory  # noqa: E402
from app.domain.sentinels import sector_tiles_for  # noqa: E402


async def main() -> None:
    flt: dict = {"state": {"$ne": "REMOVED"}}
    if len(sys.argv) > 1:
        flt["world_id"] = sys.argv[1]
    n = 0
    async for s in db().sentinels.find(flt):
        doc = await db().settlements.find_one({"_id": s["settlement_id"]})
        if not doc:
            continue
        src = f"SENTINEL:{s['_id']}"
        await territory.release_source(s["world_id"], src)
        if s["state"] == "BUILDING":
            continue  # claims on completion
        tiles = sector_tiles_for(doc, s)
        await territory.claim_tiles(s["world_id"], tiles, s["owner_player_id"], doc["_id"], src)
        got = await db().territory_tiles.count_documents({"world_id": s["world_id"], "source": src})
        print(f"{s['_id']} {s['direction']:>2} {s['ring']:<5} {s['state']:<15} tiles={got}/{len(tiles)}")
        n += 1
    print("recomputed", n)


if __name__ == "__main__":
    asyncio.run(main())
