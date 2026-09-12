"""Create (or re-create with --force) the Grande Mondo (Bibbia GM v0.2): 9 regions of 600×600 on a ring around the
neutral central land with the Grande Piramide, fog wall for 120 days, War of the Regions for 20 days.

    cd /app/backend && python scripts/create_grande_mondo.py [--name "Grande Mondo 1"] [--seed N] [--force]
"""
from __future__ import annotations

import argparse
import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core import clock  # noqa: E402
from app.core.db import db, ensure_indexes  # noqa: E402
from app.domain import grande_mondo, worlds  # noqa: E402


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", default="Grande Mondo 1")
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--force", action="store_true", help="delete every existing Grande Mondo first (players included)")
    args = ap.parse_args()
    await ensure_indexes()
    await clock.load_offset()  # QA clock offset (persisted) — the world must open on the server clock
    existing = [w async for w in db().worlds.find({"kind": grande_mondo.KIND})]
    if existing and not args.force:
        for w in existing:
            print(f"exists: {w['_id']} {w['name']} status={w['status']} size={w.get('size')} players={w.get('player_count')}")
        return
    for w in existing:
        wid = w["_id"]
        print("deleting", wid)
        pids = [p["_id"] async for p in db().players.find({"world_id": wid}, {"_id": 1})]
        for coll in ("map_chunks", "settlements", "territory_tiles", "sentinels", "marches", "battles", "inbox", "jobs", "scheduled_events", "chronicle", "pyramid", "missions"):
            await db()[coll].delete_many({"world_id": wid})
        await db().pyramid.delete_one({"_id": wid})
        await db().players.delete_many({"world_id": wid})
        if pids:
            await db().alliances.delete_many({"world_id": wid})
        await db().worlds.delete_one({"_id": wid})
        grande_mondo._zone_cache.pop(wid, None)
    t = time.time()
    w = await worlds.create_grande_mondo(args.name, args.seed, None, background=False)
    d = grande_mondo.dto(w)
    print(f"created {w['_id']} '{w['name']}' {w['size']}x{w['size']} in {time.time() - t:.1f}s — status {w['status']}")
    print("regions:", ", ".join(f"{r['code']}({r['x0']},{r['y0']})" for r in d["regions"]))
    print("center:", w["center"], "phase:", d["phase"], "until", d["phase_until"])
    print("stats:", {k: v for k, v in (w.get("terrain_stats") or {}).items() if k != "regions"})


if __name__ == "__main__":
    asyncio.run(main())
