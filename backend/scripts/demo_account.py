"""QA fixture — standard «Casa Demo» player in the hidden e2e world (qa_1): a normal mid-game castle the automated
suite (house, skins, daily, chat, caravans…) can rely on.

    cd /app/backend && python scripts/demo_account.py

Account: demo@empirelords.com / Demo12345!  — qa_1 «Casa Demo» (L5 mother with default buildings, 2 villages); the same account also has a
regular player in the Grande Mondo (gm_1, regione FR, «Casa Demo GM») created through the app.
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
from app.domain import conquest, formulas as F, worlds  # noqa: E402
from scripts.max_account import max_buildings  # noqa: E402

EMAIL, PASSWORD, DISPLAY, HOUSE, WORLD = "demo@empirelords.com", "Demo12345!", "Demo", "Casa Demo", "qa_1"
# no Elefante and prestige < 2000 on purpose: the e2e suite expects the elephant march skin to be LOCKED for Demo
ARMY = {"Fanteria": 600, "Arciere": 400, "Cavalleria": 150, "Lupo": 80, "Orso": 40, "Falco": 20, "Drago": 1}
ALLY_EMAIL, ALLY_PASSWORD, ALLY_HOUSE = "ally@empirelords.com", "Ally12345!", "Casa Ally"


def state(level: int, spec) -> dict:
    buildings = {k: min(v, level) for k, v in max_buildings().items() if k != "Santuario Mitico"}
    research = {}
    cap = F.warehouse_capacity(buildings, research, spec)
    wall = F.wall_stats(level, research, spec)
    return {"level": level, "buildings": buildings, "research": research, "resources": {r: int(cap * 0.7) for r in F.RES}, "carry": {r: 0.0 for r in F.RES}, "last_accrued_at": clock.now(), "army": {u: max(1, n * level // 12) for u, n in ARMY.items()}, "wall": {"level": level, "current_hp": wall["max_hp"], "max_hp": wall["max_hp"]}, "loyalty": int(spec.conquest["loyalty_start"]), "recruit_active": {}}


async def main() -> None:
    spec = get_spec()
    now = clock.now()
    world = await db().worlds.find_one({"_id": WORLD})
    if not world:
        raise SystemExit(f"{WORLD} not found — run scripts/reset_worlds.py first")
    acc = await db().accounts.find_one({"email": EMAIL})
    if not acc:
        out = await auth.register(EMAIL, PASSWORD, DISPLAY)
        acc = await db().accounts.find_one({"_id": out["account"]["account_id"]})
    else:
        await db().accounts.update_one({"_id": acc["_id"]}, {"$set": {"password_hash": auth.hash_password(PASSWORD)}})
    player = await db().players.find_one({"world_id": WORLD, "account_id": acc["_id"]})
    if not player:
        player = await worlds.join_world(world, acc["_id"], HOUSE)
        print(f"joined {WORLD} as {HOUSE}")
    home = await db().settlements.find_one({"_id": player["mother_settlement_id"]})
    # Mother: settlement L5 but buildings left at their join defaults → the legacy e2e suite can still upgrade them
    # (BUILDING_CAP_SETTLEMENT_LEVEL headroom) and expects royal (L10) / obsidian (L20) castle skins to be locked
    buildings = {k: 2 for k in max_buildings() if k != "Santuario Mitico"}
    buildings.update({"Castello / Fortezza": 5, "Magazzino": 4, "Caserma": 3, "Officina": 3})
    wall = F.wall_stats(5, {}, spec)
    cap = F.warehouse_capacity(buildings, {}, spec)
    await db().settlements.update_one({"_id": home["_id"]}, {"$set": {"level": 5, "buildings": buildings, "research": {}, "resources": {r: int(cap * 0.8) for r in F.RES}, "army": dict(ARMY), "wall": {"level": 5, "current_hp": wall["max_hp"], "max_hp": wall["max_hp"]}, "last_accrued_at": clock.now(), "recruit_active": {}}})
    await db().players.update_one({"_id": player["_id"]}, {"$set": {"prestige": 1_200, "intro_seen_at": now, "tour_seen_at": now, "inactivity_exempt": True, "shield_ended_at": now, "shield_end_reason": "QA_DEMO", "march_skin": "dragon"}})
    if await db().settlements.count_documents({"world_id": WORLD, "owner_player_id": player["_id"]}) < 3:
        neutrals = [n async for n in db().settlements.find({"world_id": WORLD, "kind": "NEUTRAL", "owner_player_id": None})]
        neutrals.sort(key=lambda n: max(abs(n["x"] - home["x"]), abs(n["y"] - home["y"])))
        for n in neutrals:
            if await db().settlements.count_documents({"world_id": WORLD, "owner_player_id": player["_id"]}) >= 3:
                break
            fresh = await db().players.find_one({"_id": player["_id"]})
            if not await conquest.reserve_slot(player["_id"]):
                break
            res = await conquest.transfer_ownership(n, fresh, {"Fanteria": 200}, f"qa_demo_{n['_id']}")
            if not res["changed"]:
                await conquest.release_slot(player["_id"])
                continue
            await db().settlements.update_one({"_id": n["_id"]}, {"$set": state(6, spec)})
    await db().settlements.update_many({"world_id": WORLD, "owner_player_id": player["_id"], "is_mother": {"$ne": True}}, {"$set": state(6, spec)})
    total = await db().settlements.count_documents({"world_id": WORLD, "owner_player_id": player["_id"]})
    print(f"LOGIN  {EMAIL} / {PASSWORD}   world {WORLD}  house {HOUSE}  settlements {total}  mother ({home['x']},{home['y']})")
    # companion account used by the alliance / intro e2e tests
    ally = await db().accounts.find_one({"email": ALLY_EMAIL})
    if not ally:
        out = await auth.register(ALLY_EMAIL, ALLY_PASSWORD, "Ally")
        ally = await db().accounts.find_one({"_id": out["account"]["account_id"]})
    else:
        await db().accounts.update_one({"_id": ally["_id"]}, {"$set": {"password_hash": auth.hash_password(ALLY_PASSWORD)}})
    ap = await db().players.find_one({"world_id": WORLD, "account_id": ally["_id"]})
    if not ap:
        ap = await worlds.join_world(world, ally["_id"], ALLY_HOUSE)
        await db().settlements.update_one({"_id": ap["mother_settlement_id"]}, {"$set": state(6, spec)})
    await db().players.update_one({"_id": ap["_id"]}, {"$set": {"inactivity_exempt": True, "shield_ended_at": now, "shield_end_reason": "QA_ALLY"}})
    print(f"LOGIN  {ALLY_EMAIL} / {ALLY_PASSWORD}   world {WORLD}  house {ALLY_HOUSE}")


if __name__ == "__main__":
    asyncio.run(main())
