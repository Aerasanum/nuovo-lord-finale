"""
QA fixture — "Osservatore" account for the Grande Mondo: sees every region without fog (map/overview/chunks) and the
Grande Piramide; owns a developed home on the IT mainland + 2 conquered villages (to test the castle teleport) and
999.999 Rubies. The movement rules (fog wall) still apply to it.

    cd /app/backend && python scripts/observer_account.py            # create / refresh (idempotent)

Account: osservatore@empirelords.com / Demo12345!  (Grande Mondo 1 = gm_1, regione IT, Casata "Casa Osservatore")
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from app.core import auth, clock  # noqa: E402
from app.core.db import db  # noqa: E402
from app.core.spec import get_spec  # noqa: E402
from app.domain import conquest, grande_mondo, worlds  # noqa: E402
from app.domain import formulas as F  # noqa: E402
from scripts.lord_account import village_state  # noqa: E402
from scripts.max_account import LEGENDARY, STANDARD_ARMY, max_buildings, max_research  # noqa: E402

EMAIL = "osservatore@empirelords.com"
PASSWORD = "Demo12345!"
DISPLAY = "Osservatore"
HOUSE = "Casa Osservatore"
REGION = "IT"


async def main() -> None:
    spec = get_spec()
    await clock.load_offset()
    now = clock.now()
    world = await db().worlds.find_one({"kind": grande_mondo.KIND, "status": "OPEN"})
    if not world:
        raise SystemExit("no Grande Mondo found (run scripts/create_grande_mondo.py first)")
    wid = world["_id"]
    acc = await db().accounts.find_one({"email": EMAIL})
    if not acc:
        out = await auth.register(EMAIL, PASSWORD, DISPLAY)
        acc = await db().accounts.find_one({"_id": out["account"]["account_id"]})
        print(f"registered {EMAIL}")
    else:
        await db().accounts.update_one({"_id": acc["_id"]}, {"$set": {"password_hash": auth.hash_password(PASSWORD)}})
    player = await db().players.find_one({"world_id": wid, "account_id": acc["_id"]})
    if not player:
        # mainland slot of the region (R0) so land marches towards the centre are possible once the fog falls
        slot = await db().settlements.find_one({"world_id": wid, "kind": "PLAYER_SLOT", "slot_status": "FREE", "region_code": REGION, "region": "R0"}, sort=[("_id", 1)])
        player = await worlds.join_world(world, acc["_id"], HOUSE, slot_id=slot["_id"], region_code=REGION)
        print(f"joined {wid} as {HOUSE} in {REGION} at ({slot['x']},{slot['y']})")
    home = await db().settlements.find_one({"_id": player["mother_settlement_id"]})
    buildings = max_buildings()
    research = max_research()
    cap = F.warehouse_capacity(buildings, research, spec)
    wall = F.wall_stats(30, research, spec)
    army = {**STANDARD_ARMY, **{u: int(spec.raw["legendary_stacking"]["metropolis_cap"]["max_per_type_per_metropolis"]) for u in LEGENDARY}}
    await db().settlements.update_one(
        {"_id": home["_id"]},
        {"$set": {"level": 30, "buildings": buildings, "research": research, "resources": {r: cap for r in F.RES}, "carry": {r: 0.0 for r in F.RES}, "last_accrued_at": now, "army": army, "ships": 300, "wall": {"level": 30, "current_hp": wall["max_hp"], "max_hp": wall["max_hp"]}, "loyalty": int(spec.conquest["loyalty_start"]), "recruit_active": {}}},
    )
    await db().players.update_one({"_id": player["_id"]}, {"$set": {"view_all_regions": True, "gm_admin": True, "prestige": 60_000, "intro_seen_at": now, "shield_ended_at": now, "shield_end_reason": "QA_OBSERVER"}})
    await db().accounts.update_one({"_id": acc["_id"]}, {"$set": {"rubies": 999_999}})
    # two conquered villages (same region, nearest neutrals) — teleport candidates
    owned = await db().settlements.count_documents({"world_id": wid, "owner_player_id": player["_id"]})
    need = max(0, 3 - owned)
    if need:
        neutrals = [n async for n in db().settlements.find({"world_id": wid, "kind": "NEUTRAL", "owner_player_id": None, "region_code": REGION})]
        neutrals.sort(key=lambda n: max(abs(n["x"] - home["x"]), abs(n["y"] - home["y"])))
        fresh = await db().players.find_one({"_id": player["_id"]})
        taken = 0
        for target in neutrals:
            if taken >= need:
                break
            if not await conquest.reserve_slot(player["_id"]):
                break
            res = await conquest.transfer_ownership(target, fresh, {"Fanteria": 500, "Arciere": 300}, f"qa_observer_{target['_id']}")
            if not res["changed"]:
                await conquest.release_slot(player["_id"])
                continue
            taken += 1
            print(f"conquered {target['_id']} ({target['x']},{target['y']})")
    villages = [s async for s in db().settlements.find({"world_id": wid, "owner_player_id": player["_id"], "is_mother": {"$ne": True}}).sort("conquered_at", 1)]
    for lvl, v in zip((14, 10), villages):
        await db().settlements.update_one({"_id": v["_id"]}, {"$set": {**village_state(lvl, spec), "last_accrued_at": now}})
    total = await db().settlements.count_documents({"world_id": wid, "owner_player_id": player["_id"]})
    print(f"\nLOGIN  {EMAIL} / {PASSWORD}   world {wid} ({world['name']})  region {REGION}  house {HOUSE}  settlements {total}  view_all_regions=True")


if __name__ == "__main__":
    asyncio.run(main())
