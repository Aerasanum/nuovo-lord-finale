"""Product decision (June 2026): every player-facing realm is a Grande Mondo (9 regions of 600×600).

    cd /app/backend && python scripts/reset_worlds.py

• deletes the classic realms (Regno 1 = world_1, Regno 2 = world_2, Regno 3 = world_4) with everything inside
  (players included — accounts survive and can join the Grande Mondo)
• creates the hidden classic QA world `qa_1` (400×400, never listed to players) used by the automated e2e tests
"""
from __future__ import annotations

import asyncio
import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from app.core import clock  # noqa: E402
from app.core.db import db, ensure_indexes  # noqa: E402
from app.domain import worlds  # noqa: E402

CLASSIC_TO_DELETE = ("world_1", "world_2", "world_3", "world_4")
QA_WORLD = "qa_1"


async def main() -> None:
    await ensure_indexes()
    await clock.load_offset()
    for wid in CLASSIC_TO_DELETE:
        w = await db().worlds.find_one({"_id": wid})
        if not w:
            continue
        counts = await worlds.delete_world(wid)
        print(f"deleted {wid} «{w.get('name')}»: {counts}")
    if not await db().worlds.find_one({"_id": QA_WORLD}):
        w = await worlds.create_world("QA Regno (nascosto)", seed=7, world_id=QA_WORLD, hidden=True)
        # born "mature" (≥ 30 days): the e2e suite jumps the QA clock by weeks, the EARLY 3-day inactivity removal would wipe its throwaway players
        await db().worlds.update_one({"_id": QA_WORLD}, {"$set": {"opened_at": clock.now() - timedelta(days=45), "created_at": clock.now() - timedelta(days=45)}})
        print(f"created hidden QA world {w['_id']} {w['size']}×{w['size']}")
    async for w in db().worlds.find({}, {"name": 1, "kind": 1, "size": 1, "hidden": 1, "player_count": 1}):
        print(w)


if __name__ == "__main__":
    asyncio.run(main())
