"""Inspect qa_1 state around the demo player (dev helper, not a test)."""
import asyncio
import os
import sys

from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402


async def main():
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ.get("DB_NAME", "empire_lords")]
    demo = await db.players.find_one({"house_name": "Casa Demo", "world_id": "qa_1"})
    print("player", demo["_id"], demo.get("world_id"))
    async for s in db.settlements.find({"world_id": "qa_1", "owner_player_id": demo["_id"]}, {"name": 1, "x": 1, "y": 1, "level": 1, "buildings.Caravanserraglio": 1, "buildings.Sala di Guerra": 1, "research": 1, "army": 1, "resources": 1}):
        print("own", s["_id"], s["name"], s["x"], s["y"], "L", s.get("level"), "carav", s.get("buildings", {}).get("Caravanserraglio"), "warhall", s.get("buildings", {}).get("Sala di Guerra"))
        print("   research", {k: v for k, v in (s.get("research") or {}).items() if "carav" in k or "intercept" in k or "cavalry" in k})
        print("   army", s.get("army"), "res", {k: int(v) for k, v in (s.get("resources") or {}).items()})
    x0, y0 = int(sys.argv[1]) if len(sys.argv) > 1 else 6, int(sys.argv[2]) if len(sys.argv) > 2 else 188
    r = 25
    async for s in db.settlements.find({"world_id": "qa_1", "kind": {"$in": ["NEUTRAL", "PLAYER"]}, "x": {"$gte": x0 - r, "$lte": x0 + r}, "y": {"$gte": y0 - r, "$lte": y0 + r}}, {"name": 1, "x": 1, "y": 1, "level": 1, "terrain": 1, "kind": 1, "owner_player_id": 1}):
        print(s["kind"], s["_id"], s["name"], s["x"], s["y"], "L", s.get("level"), s.get("terrain"), s.get("owner_player_id"))
    async for m in db.marches.find({"world_id": "qa_1", "status": {"$in": ["OUTBOUND", "RETURNING"]}}, {"mission": 1, "status": 1, "player_id": 1, "arrival_at": 1, "origin_settlement_id": 1}):
        print("march", m)


asyncio.run(main())
