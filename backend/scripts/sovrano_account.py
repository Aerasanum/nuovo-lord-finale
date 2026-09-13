"""
QA fixture — «Sovrano» account in the Grande Mondo (gm_1, regione IT): everything unlocked, no fog wall for him
(`view_all_regions` like the Osservatore + `gm_admin` controls), 20 castles at every cap with all Sentinels GUARDED,
marches in flight with every march skin, caravans arriving and caravans under interception (all inside the IT region —
the fog wall rules for movement still apply while the Nebbia is up).

    cd /app/backend && python scripts/sovrano_account.py            # create / refresh (idempotent where possible)

Accounts
  sovrano@empirelords.com / Sovrano12345!   Casata «Casa Sovrana»  — the fixture (20 castles L30, 12 sentinels each
                                            where land allows, prestige 60k, Rubies 999.999, all castle + march skins,
                                            Santuario L5 + Unicorno pronto)
  predone@empirelords.com / Predone12345!   Casata «Casa Predone»  — hostile neighbour used to stage caravan raids
                                            (its caravans are intercepted by the Sovrano, it intercepts one of ours)
"""
from __future__ import annotations

import asyncio
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from app.core import auth, clock  # noqa: E402
from app.core.db import db  # noqa: E402
from app.core.errors import ApiError  # noqa: E402
from app.core.spec import get_spec  # noqa: E402
from app.domain import caravans, conquest, formulas as F, marches, sentinels, territory, worlds  # noqa: E402
from app.domain.pathfinding import load_terrain  # noqa: E402
from app.domain.settlements import new_id  # noqa: E402
from app.domain.store import PREMIUM_SKINS  # noqa: E402
from scripts.max_account import LEGENDARY, STANDARD_ARMY, max_buildings, max_research  # noqa: E402

EMAIL, PASSWORD, DISPLAY, HOUSE = "sovrano@empirelords.com", "Sovrano12345!", "Il Sovrano", "Casa Sovrana"
ENEMY_EMAIL, ENEMY_PASSWORD, ENEMY_DISPLAY, ENEMY_HOUSE = "predone@empirelords.com", "Predone12345!", "Il Predone", "Casa Predone"
WORLD = "gm_1"
REGION = "IT"
CASTLES = 20
SENTINEL_GARRISON = {"Fanteria": 400, "Arciere": 300, "Cavalleria": 120}
RUN = uuid.uuid4().hex[:6]  # idempotency keys must be fresh per run: replaying a key returns the old (completed) march
CASTLE_SKINS = ["dragon", "demon", "volcano", "light", "sun", "night", "frost", "sylvan", "ocean", "royal", "obsidian", "sandstone", "classic"]


def dist(a: dict, b: dict) -> int:
    return max(abs(a["x"] - b["x"]), abs(a["y"] - b["y"]))


def max_state(level: int, spec, full_army: bool) -> dict:
    buildings = {k: min(v, level) if k != "Santuario Mitico" else v for k, v in max_buildings().items()}
    research = max_research()
    cap = F.warehouse_capacity(buildings, research, spec)
    wall = F.wall_stats(level, research, spec)
    legendary_cap = int(spec.raw["legendary_stacking"]["metropolis_cap"]["max_per_type_per_metropolis"])
    army = {**STANDARD_ARMY, **{u: legendary_cap for u in LEGENDARY}} if full_army else {u: max(100, n // 4) for u, n in STANDARD_ARMY.items()}
    return {
        "level": level,
        "buildings": buildings,
        "research": research,
        "resources": {r: cap for r in F.RES},
        "carry": {r: 0.0 for r in F.RES},
        "last_accrued_at": clock.now(),
        "army": army,
        "ships": 300 if full_army else 40,
        "wall": {"level": level, "current_hp": wall["max_hp"], "max_hp": wall["max_hp"]},
        "loyalty": int(spec.conquest["loyalty_start"]),
        "recruit_active": {},
    }


async def account(email: str, password: str, display: str) -> dict:
    acc = await db().accounts.find_one({"email": email})
    if not acc:
        out = await auth.register(email, password, display)
        acc = await db().accounts.find_one({"_id": out["account"]["account_id"]})
        print(f"registered {email}")
    else:
        await db().accounts.update_one({"_id": acc["_id"]}, {"$set": {"password_hash": auth.hash_password(password)}})
    return acc


async def pick_slot(world_id: str, grid, neutrals: list[dict]) -> dict:
    """Free slot whose 12 Sentinel tiles are land, with ≥ 19 neutrals within 45 tiles and a free slot 15–35 tiles away."""
    t = get_spec().territory
    r_in, r_out = int(t["inner_sentinel_radius_tiles"]), int(t["outer_sentinel_radius_tiles"])
    slots = [s async for s in db().settlements.find({"world_id": world_id, "kind": "PLAYER_SLOT", "slot_status": "FREE", "region_code": REGION}).sort("_id", 1)]
    best, best_score = None, -1
    for slot in slots:
        ok = True
        for d, (dx, dy) in sentinels.DIRS.items():
            for r in ((r_in, r_out) if d in sentinels.INNER else (r_out,)):
                x, y = slot["x"] + dx * r, slot["y"] + dy * r
                if not (0 <= x < grid.shape[1] and 0 <= y < grid.shape[0]) or int(grid[y, x]) == 3:
                    ok = False
        if not ok:
            continue
        near = sum(1 for n in neutrals if dist(n, slot) <= 45)
        neighbour = any(15 <= dist(o, slot) <= 35 for o in slots if o["_id"] != slot["_id"])
        if near >= CASTLES - 1 and neighbour and near > best_score:
            best, best_score = slot, near
    if not best:
        raise SystemExit("no suitable free slot")
    return best


async def guard_all_sentinels(world_id: str, player: dict, castle: dict, grid) -> int:
    spec = get_spec()
    cmd = int(castle["buildings"].get("Comando Sentinelle", 30))
    cap = F.sentinel_garrison_cap(cmd, spec)
    garrison = dict(SENTINEL_GARRISON)
    while sum(garrison.values()) > cap:
        garrison = {u: max(1, n // 2) for u, n in garrison.items()}
    built = 0
    now = clock.now()
    for direction, ring in sentinels.all_slots():
        x, y, _r = sentinels.slot_of(castle, direction, ring)
        if not (0 <= x < grid.shape[1] and 0 <= y < grid.shape[0]) or int(grid[y, x]) == 3:
            continue
        owner = await territory.owner_of_tile(world_id, x, y)
        if owner and owner != player["_id"]:
            continue
        existing = await db().sentinels.find_one({"world_id": world_id, "settlement_id": castle["_id"], "direction": direction, "ring": ring, "state": {"$ne": "REMOVED"}})
        if existing:
            await db().sentinels.update_one({"_id": existing["_id"]}, {"$set": {"state": "GUARDED", "garrison": garrison, "garrison_cap": cap, "grace_deadline": None}})
            sid = existing["_id"]
        else:
            if await db().sentinels.find_one({"world_id": world_id, "x": x, "y": y, "state": {"$ne": "REMOVED"}}):
                continue  # tile already hosts a sentinel of a neighbouring castle
            sid = new_id("sen")
            await db().sentinels.insert_one({"_id": sid, "world_id": world_id, "settlement_id": castle["_id"], "owner_player_id": player["_id"], "x": x, "y": y, "direction": direction, "ring": ring, "state": "GUARDED", "garrison": garrison, "garrison_cap": cap, "grace_deadline": None, "generation": 0, "created_at": now, "built_at": now})
        await territory.claim_tiles(world_id, sentinels.sector_tiles_for(castle, {"direction": direction, "ring": ring}), player["_id"], castle["_id"], f"SENTINEL:{sid}")
        built += 1
    await sentinels.sync_natural_boundaries(castle)
    return built


async def conquer(world_id: str, player: dict, targets: list[dict], want: int, tag: str) -> list[dict]:
    taken: list[dict] = []
    for target in targets:
        if len(taken) >= want:
            break
        fresh = await db().players.find_one({"_id": player["_id"]})
        if not await conquest.reserve_slot(player["_id"]):
            break
        res = await conquest.transfer_ownership(target, fresh, {"Fanteria": 500, "Arciere": 300}, f"qa_{tag}_{target['_id']}")
        if not res["changed"]:
            await conquest.release_slot(player["_id"])
            continue
        taken.append(await db().settlements.find_one({"_id": target["_id"]}))
    return taken


async def main() -> None:
    spec = get_spec()
    now = clock.now()
    world = await db().worlds.find_one({"_id": WORLD})
    if not world:
        raise SystemExit(f"{WORLD} not found — create the Grande Mondo first (scripts/create_grande_mondo.py)")
    W = world["_id"]
    grid = await load_terrain(W)

    # ------------------------------------------------------------------ Sovrano
    acc = await account(EMAIL, PASSWORD, DISPLAY)
    player = await db().players.find_one({"world_id": W, "account_id": acc["_id"]})
    neutrals = [n async for n in db().settlements.find({"world_id": W, "kind": "NEUTRAL", "owner_player_id": None, "region_code": REGION})]
    if not player:
        slot = await pick_slot(W, grid, neutrals)
        player = await worlds.join_world(world, acc["_id"], HOUSE, slot_id=slot["_id"], region_code=REGION)
        print(f"joined {W} region {REGION} as {HOUSE} at ({slot['x']},{slot['y']})")
    home = await db().settlements.find_one({"_id": player["mother_settlement_id"]})
    await db().settlements.update_one({"_id": home["_id"]}, {"$set": {**max_state(30, spec, True), "skin": "dragon"}})
    await db().players.update_one(
        {"_id": player["_id"]},
        {"$set": {"prestige": 60_000, "intro_seen_at": now, "tour_seen_at": now, "inactivity_exempt": True, "shield_ended_at": now, "shield_end_reason": "QA_SOVRANO", "march_skin": "dragon", "sanctuary": {"level": 5}, "unicorn": {"state": "READY", "qa": True}, "specialization": "ATTACKER", "specialization_changed_at": now, "view_all_regions": True, "gm_admin": True}},
    )
    await db().accounts.update_one({"_id": acc["_id"]}, {"$set": {"rubies": 999_999, "castle_skins": [s["id"] for s in PREMIUM_SKINS]}})

    # 19 more castles: nearest neutrals, real conquest transfer, then every one at L30 with a different castle skin
    owned = await db().settlements.count_documents({"world_id": W, "owner_player_id": player["_id"]})
    if owned < CASTLES:
        neutrals = [n async for n in db().settlements.find({"world_id": W, "kind": "NEUTRAL", "owner_player_id": None, "region_code": REGION})]
        neutrals.sort(key=lambda n: dist(n, home))
        taken = await conquer(W, player, neutrals, CASTLES - owned, "sovrano")
        print(f"conquered {len(taken)} castles")
    castles = [s async for s in db().settlements.find({"world_id": W, "owner_player_id": player["_id"]}).sort([("is_mother", -1), ("conquered_at", 1)])]
    for i, c in enumerate(castles):
        if c.get("is_mother"):
            continue
        await db().settlements.update_one({"_id": c["_id"]}, {"$set": {**max_state(30, spec, True), "skin": CASTLE_SKINS[i % len(CASTLE_SKINS)]}})
    castles = [s async for s in db().settlements.find({"world_id": W, "owner_player_id": player["_id"]}).sort([("is_mother", -1), ("conquered_at", 1)])]
    total_sen = 0
    for c in castles:
        total_sen += await guard_all_sentinels(W, player, c, grid)
    print(f"castles {len(castles)} (all L30) · sentinels GUARDED {total_sen}")

    # ------------------------------------------------------------------ Predone (hostile neighbour)
    eacc = await account(ENEMY_EMAIL, ENEMY_PASSWORD, ENEMY_DISPLAY)
    enemy = await db().players.find_one({"world_id": W, "account_id": eacc["_id"]})
    if not enemy:
        slots = [s async for s in db().settlements.find({"world_id": W, "kind": "PLAYER_SLOT", "slot_status": "FREE", "region_code": REGION})]
        slots = [s for s in slots if 15 <= dist(s, home) <= 35] or [s for s in slots if dist(s, home) <= 45] or slots
        slots.sort(key=lambda s: dist(s, home))
        enemy = await worlds.join_world(world, eacc["_id"], ENEMY_HOUSE, slot_id=slots[0]["_id"], region_code=REGION)
        print(f"enemy joined at ({slots[0]['x']},{slots[0]['y']}) — {dist(slots[0], home)} tiles from the Sovrano")
    ehome = await db().settlements.find_one({"_id": enemy["mother_settlement_id"]})
    await db().settlements.update_one({"_id": ehome["_id"]}, {"$set": {**max_state(20, spec, False), "skin": "obsidian"}})
    await db().players.update_one({"_id": enemy["_id"]}, {"$set": {"prestige": 3_000, "intro_seen_at": now, "tour_seen_at": now, "inactivity_exempt": True, "shield_ended_at": now, "shield_end_reason": "QA_PREDONE", "march_skin": "falcon"}})
    if await db().settlements.count_documents({"world_id": W, "owner_player_id": enemy["_id"]}) < 2:
        neutrals = [n async for n in db().settlements.find({"world_id": W, "kind": "NEUTRAL", "owner_player_id": None, "region_code": REGION})]
        neutrals.sort(key=lambda n: dist(n, ehome))
        taken = await conquer(W, enemy, [n for n in neutrals if dist(n, ehome) >= 8], 1, "predone")
        for v in taken:
            await db().settlements.update_one({"_id": v["_id"]}, {"$set": {**max_state(12, spec, False), "skin": "ruin"}})
    ehome = await db().settlements.find_one({"_id": ehome["_id"]})
    evillage = await db().settlements.find_one({"world_id": W, "owner_player_id": enemy["_id"], "is_mother": {"$ne": True}})
    enemy = await db().players.find_one({"_id": enemy["_id"]})
    player = await db().players.find_one({"_id": player["_id"]})
    home = await db().settlements.find_one({"_id": home["_id"]})

    # ------------------------------------------------------------------ live traffic (only if nothing is in flight yet)
    if await db().marches.count_documents({"world_id": W, "player_id": player["_id"], "status": "OUTBOUND"}) == 0:
        far = [n async for n in db().settlements.find({"world_id": W, "kind": "NEUTRAL", "owner_player_id": None, "region_code": REGION})]
        far.sort(key=lambda n: dist(n, home))
        villages = [c for c in castles if not c.get("is_mother")]
        by_dist = sorted(villages, key=lambda c: dist(c, home))

        def pick_far(origin: dict, lo: int, hi: int) -> dict:
            cands = [n for n in far if lo <= dist(n, origin) <= hi]
            return cands[len(cands) // 2] if cands else far[-1]

        async def launch(origin: dict, mission: str, units: dict, target: dict, skin: str, key: str) -> None:
            cands = [target] + [n for n in far if dist(n, origin) >= 20 and n["_id"] != target["_id"]][::5][:8]
            for tgt in cands:
                try:
                    m = await marches.launch(world, player, origin, mission, units, tgt["_id"], None, key)
                except ApiError as e:
                    if e.code == "NO_LAND_PATH":
                        continue
                    print(f"  ! {mission} from {origin['_id']}: {e.code} {e.details}")
                    return
                await db().marches.update_one({"_id": m["_id"]}, {"$set": {"skin": skin}})
                print(f"  march {mission:<9} skin {skin:<8} {origin['name'] or origin['_id']} → {tgt.get('name')} · eta {int(m['eta_seconds'] // 3600)} h {int(m['eta_seconds'] % 3600 // 60)} min")
                return
            print(f"  ! {mission} from {origin['_id']}: no reachable target")

        # one march per skin, spread over different castles and distances
        await launch(home, "ATTACK", {"Drago": 1, "Cavalleria": 2000, "Falco": 500}, pick_far(home, 60, 120), "dragon", f"qa_sov_m1_{RUN}")
        await launch(by_dist[0], "RAID", {"Elefante da Guerra": 400, "Fanteria": 3000, "Arciere": 1500}, pick_far(by_dist[0], 25, 50), "elephant", f"qa_sov_m2_{RUN}")
        await launch(by_dist[1], "ATTACK", {"Falco": 1500, "Lupo": 800, "Cavalleria": 1200}, pick_far(by_dist[1], 30, 70), "falcon", f"qa_sov_m3_{RUN}")
        await launch(by_dist[2], "REINFORCE", {"Fanteria": 2000, "Arciere": 2000}, by_dist[-1], "classic", f"qa_sov_m4_{RUN}")
        await launch(by_dist[3], "ATTACK", {"Leone": 1200, "Orso": 600}, pick_far(by_dist[3], 30, 60), "dragon", f"qa_sov_m5_{RUN}")

        # caravans arriving (own castles, escorted) — one per origin castle
        async def caravan(origin: dict, target: dict, escort: dict, key: str, who: dict = player) -> dict | None:
            cargo = {r: 4000 for r in F.RES}
            try:
                m = await caravans.send(world, who, origin, target["_id"], cargo, 1, escort, key)
            except ApiError as e:
                print(f"  ! caravan from {origin['_id']}: {e.code} {e.details}")
                return None
            print(f"  caravan {origin.get('name') or origin['_id']} → {target.get('name')} · eta {int(m['eta_seconds'] // 3600)} h {int(m['eta_seconds'] % 3600 // 60)} min")
            return m

        my_car = await caravan(home, by_dist[-2], {"Cavalleria": 60}, f"qa_sov_c1_{RUN}")
        await caravan(by_dist[4], home, {"Fanteria": 80}, f"qa_sov_c2_{RUN}")
        await caravan(by_dist[5], home, {"Lupo": 40}, f"qa_sov_c3_{RUN}")
        await caravan(by_dist[6], by_dist[7], {}, f"qa_sov_c4_{RUN}")

        # enemy caravans → intercepted by the Sovrano («in saccheggio»); the enemy raids one of ours back
        if evillage:
            ec1 = await caravan(ehome, evillage, {"Fanteria": 40}, f"qa_pred_c1_{RUN}", enemy)
            ec2 = await caravan(evillage, ehome, {"Arciere": 30}, f"qa_pred_c2_{RUN}", enemy)
            for i, ec in enumerate([ec1, ec2]):
                if not ec:
                    continue
                origin = home if i == 0 else by_dist[0]
                try:
                    im = await caravans.intercept(world, player, origin, ec["_id"], {"Drago": 1, "Falco": 600}, f"qa_sov_i{i}_{RUN}")
                    print(f"  INTERCEPT {origin['name']} → carovana Predone · eta {int(im['eta_seconds'] // 60)} min")
                except ApiError as e:
                    print(f"  ! intercept {i}: {e.code} {e.details}")
            if my_car:
                try:
                    im = await caravans.intercept(world, enemy, ehome, my_car["_id"], {"Cavalleria": 150, "Fanteria": 200}, f"qa_pred_i0_{RUN}")
                    print(f"  enemy INTERCEPT on our caravan · eta {int(im['eta_seconds'] // 60)} min")
                except ApiError as e:
                    print(f"  ! enemy intercept: {e.code} {e.details}")
            try:
                m = await marches.launch(world, enemy, ehome, "RAID", {"Cavalleria": 300, "Fanteria": 400}, by_dist[0]["_id"], None, f"qa_pred_raid_{RUN}")
                print(f"  enemy RAID → {by_dist[0]['name']} · eta {int(m['eta_seconds'] // 3600)} h {int(m['eta_seconds'] % 3600 // 60)} min")
            except ApiError as e:
                print(f"  ! enemy raid: {e.code} {e.details}")

    await db().audit.insert_one({"world_id": W, "type": "qa_sovrano_account", "player_id": player["_id"], "settlement_id": home["_id"], "at": now})
    total = await db().settlements.count_documents({"world_id": W, "owner_player_id": player["_id"]})
    print(f"\nLOGIN  {EMAIL} / {PASSWORD}   world {W} («{world['name']}») region {REGION}  house {HOUSE}  castles {total}  mother ({home['x']},{home['y']})")
    print(f"LOGIN  {ENEMY_EMAIL} / {ENEMY_PASSWORD}   house {ENEMY_HOUSE}  mother ({ehome['x']},{ehome['y']})")


if __name__ == "__main__":
    asyncio.run(main())
