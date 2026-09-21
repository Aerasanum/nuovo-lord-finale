"""
QA fixture — "Lord" account: 5 villages, the home developed to every cap with all 12 Sentinels GUARDED.

    cd /app/backend && python scripts/lord_account.py            # create / refresh (idempotent)

Account: lord@empirelords.com / Lord12345!  (Grande Mondo 1 = gm_1, regione IT, Casata "Casa Lord")
  - home: settlement L30 (Metropolis), every building at cap, all research maxed, resources = warehouse cap, wall L30,
    full army, 12 Sentinels (4 inner r3 + 8 outer r5) GUARDED with a garrison → the whole 11×11 domain is owned
    (slots on water become natural boundaries automatically)
  - 4 more villages: the nearest neutral settlements, taken over with the server's own conquest transfer
    (`conquest.transfer_ownership`) and developed to L18 / L14 / L10 / L6 respecting the Bible cap (building ≤ level)
The spawn slot is chosen so that all 12 Sentinel tiles are land and there are ≥4 neutrals within 30 tiles.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from app.core import auth, clock  # noqa: E402
from app.core.db import db  # noqa: E402
from app.domain.settlements import new_id  # noqa: E402
from app.core.spec import get_spec  # noqa: E402
from app.domain import conquest, formulas as F, sentinels, territory, worlds  # noqa: E402
from app.domain.pathfinding import load_terrain  # noqa: E402
from scripts.max_account import LEGENDARY, STANDARD_ARMY, max_buildings, max_research  # noqa: E402
from scripts.fixture_creds import cred  # noqa: E402

EMAIL = "lord@empirelords.com"
PASSWORD = cred("LORD_PASSWORD", "Lord12345!")
DISPLAY = "LordDragon"
HOUSE = "Casa Lord"
WORLD = os.environ.get("LORD_WORLD", "gm_1")  # gm_1 (regione IT) for players, qa_1 (hidden classic) for the e2e suite
REGION = os.environ.get("LORD_REGION", "IT")
REGION_ACTIVE = True
VILLAGE_LEVELS = (18, 14, 10, 6)
SENTINEL_GARRISON = {"Fanteria": 400, "Arciere": 300, "Cavalleria": 120}


async def pick_slot(world_id: str, grid) -> dict:
    """Free player slot whose 12 Sentinel tiles are all land, with the most neutrals within 30 tiles."""
    t = get_spec().territory
    r_in, r_out = int(t["inner_sentinel_radius_tiles"]), int(t["outer_sentinel_radius_tiles"])
    region = {"region_code": REGION} if REGION_ACTIVE else {}
    neutrals = [(n["x"], n["y"]) async for n in db().settlements.find({"world_id": world_id, "kind": "NEUTRAL", "owner_player_id": None, **region}, {"x": 1, "y": 1})]
    best, best_score = None, -1
    async for slot in db().settlements.find({"world_id": world_id, "kind": "PLAYER_SLOT", "slot_status": "FREE", **region}).sort("_id", 1):
        ok = True
        for d, (dx, dy) in sentinels.DIRS.items():
            for r in ((r_in, r_out) if d in sentinels.INNER else (r_out,)):
                x, y = slot["x"] + dx * r, slot["y"] + dy * r
                if not (0 <= x < grid.shape[1] and 0 <= y < grid.shape[0]) or int(grid[y, x]) == 3:
                    ok = False
        if not ok:
            continue
        near = sum(1 for nx, ny in neutrals if max(abs(nx - slot["x"]), abs(ny - slot["y"])) <= 30)
        if near >= 4 and near > best_score:
            best, best_score = slot, near
    if not best:
        raise SystemExit("no suitable free slot")
    return best


def village_state(level: int, spec) -> dict:
    buildings = {k: min(v, level) for k, v in max_buildings().items()}
    research = max_research()
    cap = F.warehouse_capacity(buildings, research, spec)
    wall = F.wall_stats(level, research, spec)
    army = {u: max(50, n // 20) for u, n in STANDARD_ARMY.items()}
    return {
        "level": level,
        "buildings": buildings,
        "research": research,
        "resources": {r: cap // 2 for r in F.RES},
        "carry": {r: 0.0 for r in F.RES},
        "army": army,
        "wall": {"level": level, "current_hp": wall["max_hp"], "max_hp": wall["max_hp"]},
        "loyalty": int(spec.conquest["loyalty_start"]),
        "recruit_active": {},
    }


async def main() -> None:
    spec = get_spec()
    now = clock.now()
    acc = await db().accounts.find_one({"email": EMAIL})
    if not acc:
        out = await auth.register(EMAIL, PASSWORD, DISPLAY)
        acc = await db().accounts.find_one({"_id": out["account"]["account_id"]})
        print(f"registered {EMAIL}")
    else:
        await db().accounts.update_one({"_id": acc["_id"]}, {"$set": {"password_hash": auth.hash_password(PASSWORD)}})
    world = await db().worlds.find_one({"_id": WORLD})
    if not world:
        raise SystemExit(f"world {WORLD} not found")
    global REGION_ACTIVE
    REGION_ACTIVE = world.get("kind") == "GRANDE_MONDO"
    grid = await load_terrain(WORLD)
    player = await db().players.find_one({"world_id": WORLD, "account_id": acc["_id"]})
    if not player:
        slot = await pick_slot(WORLD, grid)
        player = await worlds.join_world(world, acc["_id"], HOUSE, slot_id=slot["_id"], region_code=REGION if REGION_ACTIVE else None)
        print(f"joined {WORLD} as {HOUSE} at slot {slot['_id']} ({slot['x']},{slot['y']})")
    home = await db().settlements.find_one({"_id": player["mother_settlement_id"]})

    # ---- home at every cap (same state the max account writes)
    buildings = max_buildings()
    research = max_research()
    cap = F.warehouse_capacity(buildings, research, spec)
    wall = F.wall_stats(30, research, spec)
    army = {**STANDARD_ARMY, **{u: int(spec.raw["legendary_stacking"]["metropolis_cap"]["max_per_type_per_metropolis"]) for u in LEGENDARY}}
    await db().settlements.update_one(
        {"_id": home["_id"]},
        {"$set": {"level": 30, "buildings": buildings, "research": research, "resources": {r: cap for r in F.RES}, "carry": {r: 0.0 for r in F.RES}, "last_accrued_at": now, "army": army, "ships": 300, "wall": {"level": 30, "current_hp": wall["max_hp"], "max_hp": wall["max_hp"]}, "loyalty": int(spec.conquest["loyalty_start"]), "recruit_active": {}}},
    )
    home = await db().settlements.find_one({"_id": home["_id"]})
    await db().players.update_one({"_id": player["_id"]}, {"$set": {"prestige": 60_000, "intro_seen_at": now, "tour_seen_at": now, "inactivity_exempt": True, "shield_ended_at": now, "shield_end_reason": "QA_LORD"}})
    await db().accounts.update_one({"_id": acc["_id"]}, {"$set": {"rubies": 999_999}})

    # ---- 12 Sentinels GUARDED (water slots → natural boundary, synced below)
    cmd = int(home["buildings"].get("Comando Sentinelle", 30))
    garrison_cap = F.sentinel_garrison_cap(cmd, spec)
    garrison = dict(SENTINEL_GARRISON)
    while sum(garrison.values()) > garrison_cap:
        garrison = {u: max(1, n // 2) for u, n in garrison.items()}
    built = 0
    for direction, ring in sentinels.all_slots():
        x, y, _r = sentinels.slot_of(home, direction, ring)
        if not (0 <= x < grid.shape[1] and 0 <= y < grid.shape[0]) or int(grid[y, x]) == 3:
            continue
        existing = await db().sentinels.find_one({"settlement_id": home["_id"], "direction": direction, "ring": ring, "state": {"$ne": "REMOVED"}})
        if existing:
            sid = existing["_id"]
            await db().sentinels.update_one({"_id": sid}, {"$set": {"state": "GUARDED", "garrison": garrison, "garrison_cap": garrison_cap, "grace_deadline": None}})
        else:
            sid = new_id("sen")
            await db().sentinels.insert_one({"_id": sid, "world_id": WORLD, "settlement_id": home["_id"], "owner_player_id": player["_id"], "x": x, "y": y, "direction": direction, "ring": ring, "state": "GUARDED", "garrison": garrison, "garrison_cap": garrison_cap, "grace_deadline": None, "generation": 0, "created_at": now, "built_at": now})
        await territory.claim_tiles(WORLD, sentinels.sector_tiles_for(home, {"direction": direction, "ring": ring}), player["_id"], home["_id"], f"SENTINEL:{sid}")
        built += 1
    natural = await sentinels.sync_natural_boundaries(home)
    print(f"home {home['_id']} ({home['x']},{home['y']}) L30, sentinels GUARDED: {built}, natural boundaries: {len(natural)}")

    # ---- 4 more villages: nearest neutrals, real conquest transfer, then developed
    owned = await db().settlements.count_documents({"world_id": WORLD, "owner_player_id": player["_id"]})
    need = max(0, 5 - owned)
    if need:
        neutrals = [n async for n in db().settlements.find({"world_id": WORLD, "kind": "NEUTRAL", "owner_player_id": None})]
        neutrals.sort(key=lambda n: max(abs(n["x"] - home["x"]), abs(n["y"] - home["y"])))
        fresh_player = await db().players.find_one({"_id": player["_id"]})
        taken = 0
        for i, target in enumerate(neutrals):
            if taken >= need:
                break
            if not await conquest.reserve_slot(player["_id"]):
                break
            res = await conquest.transfer_ownership(target, fresh_player, {"Fanteria": 500, "Arciere": 300}, f"qa_lord_{target['_id']}")
            if not res["changed"]:
                await conquest.release_slot(player["_id"])
                continue
            taken += 1
            print(f"conquered {target['_id']} ({target['x']},{target['y']}) → {res}")
    villages = [s async for s in db().settlements.find({"world_id": WORLD, "owner_player_id": player["_id"], "is_mother": {"$ne": True}}).sort("conquered_at", 1)]
    for lvl, v in zip(VILLAGE_LEVELS, villages):
        await db().settlements.update_one({"_id": v["_id"]}, {"$set": {**village_state(lvl, spec), "last_accrued_at": now}})
        print(f"village {v['_id']} ({v['x']},{v['y']}) → L{lvl}")
    await db().audit.insert_one({"world_id": WORLD, "type": "qa_lord_account", "player_id": player["_id"], "settlement_id": home["_id"], "at": now})
    total = await db().settlements.count_documents({"world_id": WORLD, "owner_player_id": player["_id"]})
    print(f"\nLOGIN  {EMAIL} / {PASSWORD}   world {WORLD} ({world['name']})  house {HOUSE}  settlements {total}")


if __name__ == "__main__":
    asyncio.run(main())
