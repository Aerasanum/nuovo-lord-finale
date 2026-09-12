"""
One-off data repair (Bible invariant: no building may exceed its settlement level).
Old QA fixtures granted e.g. Università L10 to a L3 settlement; lift such settlements (and their Castello) to the
highest building level so the city grows behind its centre, never ahead of it.

    cd /app/backend && python scripts/repair_building_levels.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from app.core import clock  # noqa: E402
from app.core.db import db  # noqa: E402


async def main() -> None:
    fixed = 0
    async for d in db().settlements.find({"kind": "PLAYER"}, {"name": 1, "level": 1, "buildings": 1}):
        top = max((int(v) for b, v in d.get("buildings", {}).items() if b != "Santuario Mitico"), default=0)
        if top <= int(d["level"]):
            continue
        new_level = min(30, top)
        await db().settlements.update_one({"_id": d["_id"]}, {"$set": {"level": new_level, "buildings.Castello / Fortezza": new_level}})
        await db().audit.insert_one({"world_id": d.get("world_id"), "type": "repair_building_levels", "settlement_id": d["_id"], "from": d["level"], "to": new_level, "at": clock.now()})
        print(f"{d['_id']} {d.get('name')}: L{d['level']} → L{new_level} (highest building {top})")
        fixed += 1
    print(f"done, {fixed} settlement(s) repaired")


if __name__ == "__main__":
    asyncio.run(main())
