"""Caravans (Bible §13 / §34.9, spec.caravans): abstract logistic slots (Caravanserraglio) moving resources between own
settlements, optional escort, detection by radius, interception (military.caravan_interception) resolved by normal combat.

Caravans and interceptors are stored in the `marches` collection (mission CARAVAN / INTERCEPT) so the outgoing cap, the
map animation, ETA and return machinery are shared with military marches; `marches.on_arrival` dispatches here.
"""
from __future__ import annotations

import math
import uuid
from datetime import timedelta

from app.core import clock
from app.core.db import db
from app.core.errors import ApiError
from app.core.spec import get_spec
from app.domain import alliances, grande_mondo, combat, economy, formulas as F, intel, notifications, progress, scheduler, territory
from app.domain.pathfinding import astar_async, load_terrain
from app.domain.pyramid_reward import bonus_pct

BUILDING = "Caravanserraglio"
UNLOCK_RESEARCH = "logistics.caravans_1"  # Bible §13: "richiede Carovane I"
INTERCEPT_RESEARCH = "military.caravan_interception"


def _cfg() -> dict:
    return get_spec().caravans


def caravans_per_march(level: int) -> int:
    return 0 if level < 1 else (1 if level == 1 else 1 + math.ceil((level - 1) / 5))


def base_capacity(level: int) -> int:
    return 0 if level < 1 else int(round(5000 * (1.17 ** (level - 1))))


def capacity(level: int, assigned: int, research: dict, extra_pct: float = 0.0) -> int:
    """extra_pct: Pyramid reward window (+caravan capacity, Bible §21) — multiplicative, outside the research cap."""
    bonus, cap = F.research_metric(research, "caravan_capacity")
    if cap is not None:
        bonus = min(bonus, cap)
    return int(math.floor(base_capacity(level) * assigned * (1 + bonus) * (1 + max(0.0, float(extra_pct)) / 100.0)))


def speed_tph(escort: dict[str, int], research: dict) -> float:
    spec = get_spec()
    bonus, cap = F.research_metric(research, "caravan_speed")
    if cap is not None:
        bonus = min(bonus, cap)
    base = float(_cfg()["base_speed_tph"])
    if escort:
        base = min(base, min(float(spec.units_by_name[u]["speed_tph"]) for u in escort))
    return base * (1 + bonus)


def search_radius(research: dict, world: dict | None = None) -> int:
    """Bible radius (base 5, research up to 12) — a realm may widen it (`world.caravan_search_radius`, e.g. 50 tiles:
    "Carovane nei dintorni" requested by the game owner) so passing convoys of other players stay visible/raidable."""
    c = _cfg()
    l1 = F.rget(research, "intelligence.caravan_search_1")
    l2 = F.rget(research, "intelligence.caravan_search_2")
    lookup = [0, 0, 1, 1, 2, 2]
    r = int(c["search_base_radius_tiles"]) + lookup[min(l1, 5)] + int(c["search_bonus"]["intelligence.caravan_search_2_per_level"]) * l2
    bible = min(int(c["search_max_radius_tiles"]), r)
    return max(bible, int((world or {}).get("caravan_search_radius") or 0))


def info(origin: dict, world: dict | None = None) -> dict:
    """Composer data for the UI: unlock state, slots, capacity per slot, speed."""
    research = origin.get("research", {})
    lvl = int(origin["buildings"].get(BUILDING, 0))
    per = caravans_per_march(lvl)
    pyr = bonus_pct(origin)["caravan_capacity_pct"]
    return {
        "unlocked": F.rget(research, UNLOCK_RESEARCH) >= 1,
        "research_unlock_key": UNLOCK_RESEARCH,
        "caravanserai_level": lvl,
        "caravans_per_march": per,
        "capacity_per_caravan": capacity(lvl, 1, research, pyr) if lvl else 0,
        "max_capacity": capacity(lvl, per, research, pyr) if lvl else 0,
        "pyramid_capacity_bonus_pct": pyr,
        "unescorted_speed_tph": round(speed_tph({}, research), 3),
        "max_outgoing": int(get_spec().marches["caravan_outgoing_max_per_settlement"]),
        "interception_unlocked": F.rget(research, INTERCEPT_RESEARCH) >= 1,
        "search_radius": search_radius(research, world),
    }


async def send(world: dict, player: dict, origin: dict, target_id: str, cargo: dict[str, int], assigned: int, escort: dict[str, int], idempotency_key: str | None) -> dict:
    spec = get_spec()
    if idempotency_key:
        existing = await db().marches.find_one({"world_id": world["_id"], "player_id": player["_id"], "idempotency_key": idempotency_key})
        if existing:
            return existing
    research = dict(origin.get("research", {}))
    if F.rget(research, UNLOCK_RESEARCH) < 1:
        raise ApiError("CARAVANS_LOCKED", "Research Carovane I required", 409, {"research_key": UNLOCK_RESEARCH})
    lvl = int(origin["buildings"].get(BUILDING, 0))
    if lvl < 1:
        raise ApiError("CARAVANSERAI_REQUIRED", "Build a Caravanserraglio first", 409)
    per = caravans_per_march(lvl)
    assigned = int(assigned)
    if assigned < 1 or assigned > per:
        raise ApiError("CARAVAN_SLOTS", "Invalid number of caravans for this Caravanserraglio", 400, {"max": per})
    cargo = {r: int(v) for r, v in (cargo or {}).items() if r in F.RES and int(v) > 0}
    total = sum(cargo.values())
    if total <= 0:
        raise ApiError("EMPTY_CARGO", "Load at least one resource", 400)
    cap = capacity(lvl, assigned, research, bonus_pct(origin)["caravan_capacity_pct"])
    if total > cap:
        raise ApiError("CARAVAN_CAPACITY_EXCEEDED", "Cargo exceeds convoy capacity", 409, {"capacity": cap, "cargo": total})
    escort = {u: int(c) for u, c in (escort or {}).items() if int(c) > 0}
    for u in escort:
        if u not in spec.units_by_name:
            raise ApiError("UNKNOWN_UNIT", "Unknown unit", 400, {"unit": u})
    target = await db().settlements.find_one({"_id": target_id, "world_id": world["_id"]})
    if not target or target["kind"] == "PLAYER_SLOT":
        raise ApiError("TARGET_NOT_FOUND", "Target settlement not found", 404)
    if target["_id"] == origin["_id"]:
        raise ApiError("INVALID_TARGET", "Cannot send a caravan to the origin", 400)
    if target.get("owner_player_id") != player["_id"] and not await alliances.is_ally(player, target.get("owner_player_id")):
        raise ApiError("INVALID_TARGET", "Caravans travel to own or allied settlements", 409)
    if await db().marches.count_documents({"world_id": world["_id"], "origin_settlement_id": origin["_id"], "mission": "CARAVAN", "status": "OUTBOUND"}) >= int(spec.marches["caravan_outgoing_max_per_settlement"]):
        raise ApiError("CARAVAN_OUTGOING_MAX", "Only one outgoing caravan per settlement", 409)
    grande_mondo.check_target(world, (origin["x"], origin["y"]), (target["x"], target["y"]))  # fog wall (Bibbia GM)
    grid = await load_terrain(world["_id"])
    own_tiles = await territory.player_tiles(world["_id"], player["_id"], await alliances.ally_player_ids(player))
    result = await astar_async(grid, (origin["x"], origin["y"]), (target["x"], target["y"]), naval=False, territory=own_tiles, factor=float(spec.marches["own_or_ally_territory_path_cost_factor"]), allowed=grande_mondo.movement_mask(world, (origin["x"], origin["y"])))
    if result is None:
        raise ApiError("NO_LAND_PATH", "No terrestrial path to target", 409)
    path, cost = result
    speed = speed_tph(escort, research)
    eta = F.march_eta_seconds(cost, speed, spec)
    # atomic debit: resources + escort + outgoing cap (caravans count against the 5 outgoing)
    origin = await economy.accrue(origin)
    outgoing_cap = int(spec.marches["outgoing_per_settlement"])
    flt: dict = {"_id": origin["_id"], "outgoing_active": {"$not": {"$gte": outgoing_cap}}}
    inc: dict = {"outgoing_active": 1}
    for r, v in cargo.items():
        flt[f"resources.{r}"] = {"$gte": v}
        inc[f"resources.{r}"] = -v
    for u, c in escort.items():
        flt[f"army.{u}"] = {"$gte": c}
        inc[f"army.{u}"] = -c
    res = await db().settlements.find_one_and_update(flt, {"$inc": inc})
    if res is None:
        fresh = await db().settlements.find_one({"_id": origin["_id"]})
        if int(fresh.get("outgoing_active", 0)) >= outgoing_cap:
            raise ApiError("OUTGOING_CAP_REACHED", "Max 5 outgoing marches per settlement", 409)
        if any(int(fresh.get("army", {}).get(u, 0)) < c for u, c in escort.items()):
            raise ApiError("NOT_ENOUGH_UNITS", "Not enough escort units", 409)
        raise ApiError("INSUFFICIENT_RESOURCES", "Not enough resources in the Warehouse", 409)
    now = clock.now()
    arrival = now + timedelta(seconds=eta)
    doc = {
        "_id": f"crv_{uuid.uuid4().hex[:16]}",
        "world_id": world["_id"],
        "player_id": player["_id"],
        "house_name": player.get("house_name"),
        "house_crest": player.get("house_crest"),
        "origin_settlement_id": origin["_id"],
        "origin_xy": [origin["x"], origin["y"]],
        "target_settlement_id": target["_id"],
        "target_xy": [target["x"], target["y"]],
        "target_name": target.get("name"),
        "target_terrain": target["terrain"],
        "mission": "CARAVAN",
        "units": escort,
        "cargo": cargo,
        "caravans_assigned": assigned,
        "capacity": cap,
        "ships": 0,
        "naval": False,
        "path": [[x, y] for x, y in path],
        "path_cost": cost,
        "speed_tph": speed,
        "eta_seconds": eta,
        "departed_at": now,
        "arrival_at": arrival,
        "status": "OUTBOUND",
        "research_snapshot": research,
        "specialization": player.get("specialization"),
        "idempotency_key": idempotency_key,
        "spec_version": spec.version,
    }
    await db().marches.insert_one(doc)
    await scheduler.schedule(world["_id"], "BATTLE_OR_FLEET_ARRIVAL", arrival, doc["_id"], f"march_arrival:{doc['_id']}", {"march_id": doc["_id"]})
    await notifications.notify(world["_id"], player["_id"], "CARAVAN_STATE", {"caravan_id": doc["_id"], "state": "OUTBOUND", "eta": clock.iso(arrival), "delivered": None, "intercepted": False, "capacity": cap, "cargo": cargo, "target_name": target.get("name")}, dedupe_key=f"caravan_out:{doc['_id']}", deep_link="caravans")
    return doc


async def on_arrival(march: dict) -> None:
    """Delivery at an own (or allied) settlement: credit only the free Warehouse space; the excess STAYS on the convoy
    and travels back to the sender (Bible §13 "eccedenza resta sulla Carovana e ritorna al mittente"), escort returns."""
    from app.domain import marches as M

    target = await db().settlements.find_one({"_id": march["target_settlement_id"]})
    cargo = {r: int(v) for r, v in (march.get("cargo") or {}).items() if int(v) > 0}
    escort = {u: int(c) for u, c in (march.get("units") or {}).items() if int(c) > 0}
    sender = await db().players.find_one({"_id": march["player_id"]}) or {"_id": march["player_id"]}
    if not target or (target.get("owner_player_id") != march["player_id"] and not await alliances.is_ally(sender, target.get("owner_player_id"))):
        # target lost / no longer allied meanwhile: convoy turns around with its cargo (credited to the origin on return)
        await M._start_return(march, escort, "TARGET_INVALID")
        return
    already = await db().audit.find_one({"type": "caravan_delivery", "march_id": march["_id"]})
    overflow: dict = {}
    if not already:
        await db().audit.insert_one({"world_id": march["world_id"], "type": "caravan_delivery", "march_id": march["_id"], "at": clock.now(), "cargo": cargo})
        overflow = {r: int(v) for r, v in (await economy.credit(target["_id"], cargo, "caravan_delivery")).items() if int(v) > 0}
    delivered = {r: v - int(overflow.get(r, 0)) for r, v in cargo.items()}
    await db().marches.update_one({"_id": march["_id"]}, {"$set": {"delivered": delivered, "overflow": overflow, "cargo": overflow}})
    if escort or overflow:
        await M._start_return(march, escort, "DELIVERED" if not overflow else "DELIVERED_PARTIAL")
    else:
        await M._complete(march, "DELIVERED")
    await notifications.notify(march["world_id"], march["player_id"], "CARAVAN_STATE", {"caravan_id": march["_id"], "state": "DELIVERED", "eta": None, "delivered": delivered, "overflow": overflow, "intercepted": False, "capacity": march.get("capacity"), "target_name": target.get("name")}, dedupe_key=f"caravan_delivered:{march['_id']}", deep_link="caravans")


async def on_returned(march: dict, dest: dict | None) -> None:
    """Undelivered cargo (interception remainder / turn-around) comes home with the convoy — Warehouse cap applies."""
    cargo = {r: int(v) for r, v in (march.get("cargo") or {}).items() if int(v) > 0}
    if not cargo or not dest:
        return
    already = await db().audit.find_one({"type": "caravan_return_credit", "march_id": march["_id"]})
    if already:
        return
    await db().audit.insert_one({"world_id": march["world_id"], "type": "caravan_return_credit", "march_id": march["_id"], "at": clock.now(), "cargo": cargo})
    await economy.credit(dest["_id"], cargo, "caravan_return")


# ------------------------------------------------------------------------------------------- detection / intercept
def _progress(m: dict, now) -> float:
    dep = clock.aware(m["departed_at"])
    arr = clock.aware(m["arrival_at"])
    if arr <= dep:
        return 1.0
    return max(0.0, min(1.0, (now - dep).total_seconds() / (arr - dep).total_seconds()))


def _position(m: dict, now) -> tuple[int, int, int]:
    path = m["path"]
    idx = int(round(_progress(m, now) * (len(path) - 1)))
    return int(path[idx][0]), int(path[idx][1]), idx


async def search(world_id: str, observer: dict, player: dict) -> dict:
    """Foreign OUTBOUND caravans whose current position lies within the observer settlement's search radius (Chebyshev),
    nearest first."""
    research = observer.get("research", {})
    world = await db().worlds.find_one({"_id": world_id})
    radius = search_radius(research, world)
    now = clock.now()
    out = []
    allies = set(await alliances.ally_player_ids(player))
    fog_zones = grande_mondo.visible_zones(world, [(observer["x"], observer["y"])])  # fog wall: nothing is seen across it
    zone = grande_mondo.zone_grid(world) if fog_zones is not None else None
    async for m in db().marches.find({"world_id": world_id, "mission": "CARAVAN", "status": "OUTBOUND", "player_id": {"$nin": list(allies | {player["_id"]})}}):
        x, y, idx = _position(m, now)
        dist = max(abs(x - observer["x"]), abs(y - observer["y"]))
        if dist > radius:
            continue
        if zone is not None and int(zone[y, x]) not in fog_zones:
            continue
        origin = await db().settlements.find_one({"_id": m["origin_settlement_id"]}, {"research": 1})
        s = intel.score(research, (origin or {}).get("research", {}), None) + 2 * F.rget(research, "intelligence.caravan_search_2")
        tier = intel.tier_of(min(100, s))
        cargo_total = sum(int(v) for v in (m.get("cargo") or {}).values())
        out.append(
            {
                "caravan_id": m["_id"],
                "house_name": m.get("house_name"),
                "house_crest": m.get("house_crest"),
                "position": [x, y],
                "heading": intel.heading(m["path"], idx, coarse=tier.get("eta_error_pct") is None),
                "escorted": bool(m.get("units")),
                "escort_band": intel.band(sum(int(c) for c in (m.get("units") or {}).values()), tier.get("troop_count_error_pct")) if m.get("units") else None,
                "cargo_band": intel.band(cargo_total, tier.get("troop_count_error_pct")),  # undisclosed below tier 3
                "arrival_at": clock.iso(m["arrival_at"]),
                "remaining_path": m["path"][idx:],
                "intel_score": s,
                "distance": dist,
                "target_xy": [m["path"][-1][0], m["path"][-1][1]] if m.get("path") else None,
            }
        )
    out.sort(key=lambda c: c["distance"])
    return {"radius": radius, "interception_unlocked": F.rget(research, INTERCEPT_RESEARCH) >= 1, "caravans": out}


async def intercept(world: dict, player: dict, origin: dict, caravan_id: str, units: dict[str, int], idempotency_key: str | None) -> dict:
    """Server-selected first reachable intercept point on the caravan's remaining route (Bible §34.9 / STC-31)."""
    spec = get_spec()
    if idempotency_key:
        existing = await db().marches.find_one({"world_id": world["_id"], "player_id": player["_id"], "idempotency_key": idempotency_key})
        if existing:
            return existing
    research = dict(origin.get("research", {}))
    if F.rget(research, INTERCEPT_RESEARCH) < 1:
        raise ApiError("INTERCEPTION_LOCKED", "Research Intercettazione Carovane required", 409, {"research_key": INTERCEPT_RESEARCH})
    units = {u: int(c) for u, c in units.items() if int(c) > 0}
    if not units or not any(spec.units_by_name[u]["atk"] > 0 for u in units if u in spec.units_by_name):
        raise ApiError("OFFENSIVE_NO_COMBAT_UNITS", "Interception needs at least one unit with ATK > 0", 409)
    for u in units:
        if u not in spec.units_by_name:
            raise ApiError("UNKNOWN_UNIT", "Unknown unit", 400, {"unit": u})
    caravan = await db().marches.find_one({"_id": caravan_id, "world_id": world["_id"], "mission": "CARAVAN", "status": "OUTBOUND"})
    if not caravan or caravan["player_id"] == player["_id"]:
        raise ApiError("CARAVAN_NOT_FOUND", "Caravan not found or not interceptable", 404)
    await alliances.check_hostile_launch(world["_id"], player, caravan["player_id"])
    now = clock.now()
    cx, cy, cidx = _position(caravan, now)
    if max(abs(cx - origin["x"]), abs(cy - origin["y"])) > search_radius(research, world):
        raise ApiError("CARAVAN_NOT_DETECTED", "Caravan outside the search radius of this settlement", 409)
    grande_mondo.check_target(world, (origin["x"], origin["y"]), (cx, cy))  # fog wall (Bibbia GM)
    allowed = grande_mondo.movement_mask(world, (origin["x"], origin["y"]))
    wh = int(origin["buildings"].get("Sala di Guerra", 0))
    cap = F.war_hall_cap(wh, research, "ATTACK", spec)
    if sum(units.values()) > cap:
        raise ApiError("MARCH_CAPACITY_EXCEEDED", "Formation exceeds War Hall capacity", 409, {"cap": cap})
    grid = await load_terrain(world["_id"])
    own_tiles = await territory.player_tiles(world["_id"], player["_id"])
    speed = F.formation_speed_tph(units, research, spec)
    dep = clock.aware(caravan["departed_at"])
    total = float(caravan["eta_seconds"])
    n = len(caravan["path"])
    chosen = None
    # first future waypoint the interceptor can reach before the convoy passes it (coarse stride keeps A* count bounded)
    stride = max(1, (n - cidx) // 24)
    for i in list(range(cidx + 1, n, stride)) + [n - 1]:
        px, py = int(caravan["path"][i][0]), int(caravan["path"][i][1])
        t_caravan = dep + timedelta(seconds=total * (i / max(1, n - 1)))
        if t_caravan <= now:
            continue
        r = await astar_async(grid, (origin["x"], origin["y"]), (px, py), naval=False, territory=own_tiles, factor=float(spec.marches["own_or_ally_territory_path_cost_factor"]), allowed=allowed)
        if r is None:
            continue
        path, cost = r
        eta = F.march_eta_seconds(cost, speed, spec)
        if now + timedelta(seconds=eta) <= t_caravan:
            chosen = (i, path, cost, eta, t_caravan)
            break
    if chosen is None:
        raise ApiError("INTERCEPT_UNREACHABLE", "No reachable intercept point before delivery", 409)
    i, path, cost, eta, t_caravan = chosen
    outgoing_cap = int(spec.marches["outgoing_per_settlement"])
    flt: dict = {"_id": origin["_id"], "outgoing_active": {"$not": {"$gte": outgoing_cap}}}
    inc: dict = {"outgoing_active": 1}
    for u, c in units.items():
        flt[f"army.{u}"] = {"$gte": c}
        inc[f"army.{u}"] = -c
    res = await db().settlements.find_one_and_update(flt, {"$inc": inc})
    if res is None:
        fresh = await db().settlements.find_one({"_id": origin["_id"]})
        if int(fresh.get("outgoing_active", 0)) >= outgoing_cap:
            raise ApiError("OUTGOING_CAP_REACHED", "Max 5 outgoing marches per settlement", 409)
        raise ApiError("NOT_ENOUGH_UNITS", "Not enough units in the origin settlement", 409)
    tx, ty = int(caravan["path"][i][0]), int(caravan["path"][i][1])
    doc = {
        "_id": f"mar_{uuid.uuid4().hex[:16]}",
        "world_id": world["_id"],
        "player_id": player["_id"],
        "house_name": player.get("house_name"),
        "house_crest": player.get("house_crest"),
        "origin_settlement_id": origin["_id"],
        "origin_xy": [origin["x"], origin["y"]],
        "target_settlement_id": None,
        "target_caravan_id": caravan["_id"],
        "target_xy": [tx, ty],
        "target_name": f"Carovana {caravan.get('house_name') or ''}".strip(),
        "target_terrain": spec.terrain_name(int(grid[ty, tx])),
        "mission": "INTERCEPT",
        "units": units,
        "ships": 0,
        "naval": False,
        "path": [[x, y] for x, y in path],
        "path_cost": cost,
        "speed_tph": speed,
        "eta_seconds": eta,
        "departed_at": now,
        "arrival_at": t_caravan,  # the ambush springs when the convoy reaches the intercept point
        "status": "OUTBOUND",
        "research_snapshot": research,
        "specialization": player.get("specialization"),
        "idempotency_key": idempotency_key,
        "spec_version": spec.version,
    }
    await db().marches.insert_one(doc)
    await scheduler.schedule(world["_id"], "BATTLE_OR_FLEET_ARRIVAL", t_caravan, doc["_id"], f"march_arrival:{doc['_id']}", {"march_id": doc["_id"]})
    await notifications.notify(world["_id"], player["_id"], "MARCH_DEPARTED", {"march_id": doc["_id"], "mission_type": "INTERCEPT", "target_id": caravan["_id"], "target_name": doc["target_name"], "eta": clock.iso(t_caravan), "own_composition": units}, dedupe_key=f"march_departed:{doc['_id']}", deep_link="map/march")
    return doc


async def on_intercept_arrival(march: dict) -> None:
    """Interceptor meets the convoy: escort vs interceptor, loot capped by survivor cargo, remainder returns to sender."""
    from app.domain import marches as M

    units = {u: int(c) for u, c in march["units"].items() if int(c) > 0}
    caravan = await db().marches.find_one({"_id": march["target_caravan_id"]})
    if not caravan or caravan["status"] != "OUTBOUND":
        await M._start_return(march, units, "TARGET_MISSING")
        return
    sender = await db().players.find_one({"_id": caravan["player_id"]})
    escort = {u: int(c) for u, c in (caravan.get("units") or {}).items() if int(c) > 0}
    battle_id = f"btl_{march['_id']}"
    report = combat.resolve_battle(battle_id, "ATTACK", units, march.get("research_snapshot", {}), march.get("specialization"), escort, caravan.get("research_snapshot", {}), (sender or {}).get("specialization"), march.get("target_terrain", "plain"), None, defender_kind="CARAVAN")
    cargo = {r: int(v) for r, v in (caravan.get("cargo") or {}).items() if int(v) > 0}
    loot: dict = {}
    if report["winner"] == "ATTACKER":
        loot = M._compute_loot(report["attacker_survivors"], march.get("research_snapshot", {}), {"resources": cargo})
        remaining = {r: v - int(loot.get(r, 0)) for r, v in cargo.items()}
        remaining = {r: v for r, v in remaining.items() if v > 0}
        await db().marches.update_one({"_id": caravan["_id"], "status": "OUTBOUND"}, {"$set": {"cargo": remaining, "intercepted_by": march["_id"], "units": {}}})
        await scheduler.cancel(f"march_arrival:{caravan['_id']}")
        fresh = await db().marches.find_one({"_id": caravan["_id"]})
        await M._start_return(fresh, {}, "INTERCEPTED")  # convoy turns around with what is left
        await progress.track_add(march["world_id"], march["player_id"], "caravans_intercepted", 1, ref=battle_id)
        await notifications.notify(caravan["world_id"], caravan["player_id"], "CARAVAN_STATE", {"caravan_id": caravan["_id"], "state": "INTERCEPTED", "eta": None, "delivered": None, "intercepted": True, "capacity": caravan.get("capacity"), "lost": loot, "returning": remaining}, dedupe_key=f"caravan_intercepted:{caravan['_id']}", deep_link="caravans")
    else:
        survivors_escort = report["defender_survivors"]
        await db().marches.update_one({"_id": caravan["_id"]}, {"$set": {"units": survivors_escort}})
    doc = {
        "_id": battle_id,
        "world_id": march["world_id"],
        "march_id": march["_id"],
        "attacker_player_id": march["player_id"],
        "defender_player_id": caravan["player_id"],
        "target_settlement_id": None,
        "target_sentinel_id": None,
        "target_caravan_id": caravan["_id"],
        "origin_settlement_id": march.get("origin_settlement_id"),
        "target_name": march.get("target_name"),
        "target_xy": march["target_xy"],
        "mission": "INTERCEPT",
        "report": report,
        "loot": loot or None,
        "ownership_result": None,
        "loyalty": None,
        "participants": [march["player_id"], caravan["player_id"]],
        "created_at": clock.now(),
    }
    try:
        await db().battles.insert_one(doc)
    except Exception:
        pass
    await db().marches.update_one({"_id": march["_id"]}, {"$set": {"battle_id": battle_id}})
    await progress.on_battle(doc)
    for pid in doc["participants"]:
        await notifications.notify(march["world_id"], pid, "BATTLE_RESOLVED", {"battle_id": battle_id, "march_id": march["_id"], "winner": report["winner"], "mission": "INTERCEPT", "loot": loot}, dedupe_key=f"battle:{battle_id}:{pid}", deep_link=f"battle/{battle_id}")
    survivors = report["attacker_survivors"]
    if survivors:
        await M._start_return(march, survivors, report["winner"], loot=loot or None)
    else:
        await M._complete(march, "ANNIHILATED")
