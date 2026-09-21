"""Seed the QA database (eld_qa, served by scripts/qa_backend.sh on :8002) for the automated e2e suite.

    cd /app/backend && DB_NAME=eld_qa python scripts/seed_qa_db.py

Creates (idempotent):
  • gm_1  «Grande Mondo 1» (9 regions) + Casa Osservatore (IT, admin/observer) + Casa Demo GM (FR) + Casa Lord (IT)
  • qa_1  hidden classic 400×400 realm born 45 days old (MATURE inactivity rule — the suite jumps the clock by weeks)
          + Casa Demo (L5, dragon/falcon skins), Casa Ally, Casa Max (all caps), Casa Lord (Metropolis L30)
Never run this against the live database (DB_NAME=eld).
"""
from __future__ import annotations

import asyncio
import os
import subprocess
import sys
from datetime import timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")

if os.environ.get("DB_NAME") != "eld_qa":
    raise SystemExit("refusing to run: set DB_NAME=eld_qa (this seeder is for the QA database only)")

from app.core import clock  # noqa: E402
from app.core.db import db, ensure_indexes  # noqa: E402
from app.domain import worlds  # noqa: E402

ENV = {**os.environ, "DB_NAME": "eld_qa"}


def run(*args: str, **env: str) -> None:
    print(f"$ {' '.join(args)}")
    subprocess.run([sys.executable, *args], cwd=ROOT, env={**ENV, **env}, check=True)


async def main() -> None:
    if "--drop" in sys.argv:
        # Full reseed: the e2e suite consumes player slots and mutates the fixtures, so a clean slate is the only way
        # to keep it repeatable. Guarded by the DB_NAME check at the top of this file.
        from pymongo import MongoClient

        MongoClient(os.environ["MONGO_URL"]).drop_database("eld_qa")
        print("dropped database eld_qa")
    await ensure_indexes()
    await clock.load_offset()
    if not await db().worlds.find_one({"_id": "gm_1"}):
        w = await worlds.create_grande_mondo("Grande Mondo 1", None, None, background=False)
        # born "mature" like qa_1: clock jumps must not trigger the EARLY 3-day removal of the fixture players
        await db().worlds.update_one({"_id": "gm_1"}, {"$set": {"opened_at": clock.now() - timedelta(days=45), "created_at": clock.now() - timedelta(days=45)}})
        # next war preset FR+IT (the GM suite asserts the admin-configured pair, like the live realm)
        await db().worlds.update_one({"_id": "gm_1"}, {"$set": {"gm.next_war": {"regions": ["FR", "IT"], "speed_multiplier": 5}}})
        print(f"created {w['_id']} {w['size']}×{w['size']} (aged 45 days)")
    if not await db().worlds.find_one({"_id": "qa_1"}):
        w = await worlds.create_world("QA Regno (nascosto)", seed=7, world_id="qa_1", hidden=True)
        await db().worlds.update_one({"_id": "qa_1"}, {"$set": {"opened_at": clock.now() - timedelta(days=45), "created_at": clock.now() - timedelta(days=45)}})
        print(f"created hidden {w['_id']} {w['size']}×{w['size']} (aged 45 days)")
    run("scripts/observer_account.py")
    run("scripts/demo_account.py")
    run("scripts/max_account.py")
    run("scripts/lord_account.py", LORD_WORLD="qa_1")
    run("scripts/lord_account.py", LORD_WORLD="gm_1", LORD_REGION="IT")
    # Casa Demo GM in FR (the GM suite logs in as demo)
    acc = await db().accounts.find_one({"email": "demo@empirelords.com"})
    if acc and not await db().players.find_one({"world_id": "gm_1", "account_id": acc["_id"]}):
        gm = await db().worlds.find_one({"_id": "gm_1"})
        p = await worlds.join_world(gm, acc["_id"], "Casa Demo GM", region_code="FR")
        await db().players.update_one({"_id": p["_id"]}, {"$set": {"inactivity_exempt": True, "intro_seen_at": clock.now(), "tour_seen_at": clock.now()}})
        print("Casa Demo GM joined gm_1/FR")
    # no fixture may ever be swept by the suite's clock jumps
    await db().players.update_many({"account_id": {"$in": [a["_id"] async for a in db().accounts.find({"email": {"$in": ["demo@empirelords.com", "ally@empirelords.com", "max@empirelords.com", "lord@empirelords.com", "osservatore@empirelords.com"]}}, {"_id": 1})]}}, {"$set": {"inactivity_exempt": True}})
    async for w in db().worlds.find({}, {"name": 1, "kind": 1, "size": 1, "hidden": 1, "player_count": 1}):
        print(w)


if __name__ == "__main__":
    asyncio.run(main())
