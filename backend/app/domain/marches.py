"""Marches: land marches (ATTACK / RAID / CONQUEST / REINFORCE / GARRISON_SENTINEL) and Port-to-Port fleets.
Snapshot at launch (research, speed, path); arrival revalidation; battle -> persisted report; real return march."""
from __future__ import annotations

import math
from datetime import timedelta

from app.core import clock
from app.core.db import db
from app.core.errors import ApiError
from app.core.spec import get_spec
from app.domain import alliances, combat, conquest, progress, economy, intel, navy, notifications, scheduler, sentinels, territory
from app.domain import formulas as F
from app.domain.pathfinding import astar, load_terrain
from app.domain.settlements import catch_up_neutral, new_id

ACTIVE = ("OUTBOUND", "RESOLVING", "RETURNING")
OFFENSIVE = ("ATTACK", "RAID", "CONQUEST")


def dto(m: dict) -> dict:
    return {
        "cargo": m.get("cargo") or None,
        "caravans_assigned": m.get("caravans_assigned"),
        "capacity": m.get("capacity"),
        "delivered": m.get("delivered"),
        "target_caravan_id": m.get("target_caravan_id"),
        "bonuses": m.get("bonuses"),
        "march_id": m["_id"],
        "world_id": m["world_id"],
        "player_id": m["player_id"],
        "house_name": m.get("house_name"),
        "house_crest": m.get("house_crest"),
        "origin_settlement_id": m["origin_settlement_id"],
        "target_settlement_id": m.get("target_settlement_id"),
        "target_sentinel_id": m.get("target_sentinel_id"),
        "target_pyramid": bool(m.get("target_pyramid")),
        "target_name": m.get("target_name"),
        "target_xy": m.get("target_xy"),
        "mission": m["mission"],
        "units": {k: int(v) for k, v in m.get("units", {}).items() if int(v) > 0},
        "ships": int(m.get("ships", 0)),
        "naval": bool(m.get("naval")),
        "path": m.get("path", []),
        "departed_at": clock.iso(m["departed_at"]),
        "arrival_at": clock.iso(m.get("arrival_at")),
        "return_at": clock.iso(m.get("return_at")),
        "recalled_at": clock.iso(m.get("recalled_at")) if m.get("recalled_at") else None,
        "eta_seconds": m.get("eta_seconds"),
        "speed_tph": m.get("speed_tph"),
        "status": m["status"],
        "battle_id": m.get("battle_id"),
        "loot": m.get("loot"),
        "result": m.get("result"),
        "hostile": False,
        "intel": None,
        "server_time": clock.iso(clock.now()),
    }


async def _defender_context(world_id: str, defender_player_id: str) -> tuple[set[tuple[int, int]], dict[str, dict], set[str]]:
    """Surveilled zone, settlements by id and sentinel ids of a defender.

    Surveilled zone = territory tiles ∪ the Sentinel ring footprint around each anchor (Bible §14: inner ring radius 3
    baseline, outer ring radius 5 once outer Sentinels exist). Without a ring the base territory alone (anchor + 4
    cardinals) would only detect an attacker on arrival, so the inner-ring baseline is the minimum surveillance."""
    tiles = await territory.player_tiles(world_id, defender_player_id)
    settlements = {s["_id"]: s async for s in db().settlements.find({"world_id": world_id, "owner_player_id": defender_player_id})}
    sentinel_docs = [s async for s in db().sentinels.find({"world_id": world_id, "owner_player_id": defender_player_id, "state": {"$ne": "REMOVED"}}, {"_id": 1, "settlement_id": 1, "ring": 1})]
    outer_by_settlement = {s["settlement_id"] for s in sentinel_docs if s.get("ring") == "OUTER"}
    for sid, s in settlements.items():
        r = 5 if sid in outer_by_settlement else 3
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                tiles.add((int(s["x"]) + dx, int(s["y"]) + dy))
    return tiles, settlements, {s["_id"] for s in sentinel_docs}


async def _hostile_public_dto(m: dict, defender_player_id: str, tiles: set[tuple[int, int]], settlements: dict[str, dict]) -> dict | None:
    """Defender's view of an OUTBOUND hostile march: only after detection, only what the intel tier reveals."""
    path = m.get("path") or []
    idx = intel.entry_index(path, tiles)
    if clock.now() < intel.detection_time(m["departed_at"], m.get("eta_seconds", 0), len(path), idx):
        return None  # not yet across the surveilled border
    target = settlements.get(m.get("target_settlement_id") or "")
    if target is None and m.get("target_sentinel_id"):
        sen = await db().sentinels.find_one({"_id": m["target_sentinel_id"]})
        target = settlements.get((sen or {}).get("settlement_id") or "")
    observer_research = (target or {}).get("research", {}) or {}
    guarded = target is not None and await db().sentinels.count_documents({"settlement_id": target["_id"], "state": "GUARDED"}) > 0
    disclosure = intel.disclose(m, observer_research, observer_research if guarded else None, tiles)
    d = dto(m)
    idx = disclosure["entry_index"]
    d.update(
        {
            "hostile": True,
            "units": {},
            "ships": 0,
            "origin_settlement_id": None,
            "departed_at": disclosure["detected_at"],
            "arrival_at": None,
            "eta_seconds": None,
            "speed_tph": None,
            "path": m.get("path", [])[idx:],
            "intel": disclosure,
        }
    )
    return d


def _weighted_count(units: dict[str, int], research: dict[str, int]) -> int:
    spec = get_spec()
    lvl = F.rget(research, "logistics.siege_1")
    total = 0
    for u, c in units.items():
        cat = spec.units_by_name[u]["category"]
        if lvl > 0 and cat in ("siege", "special"):
            total += math.ceil(c / (1 + 0.04 * lvl))
        else:
            total += c
    return total


async def preview(world: dict, origin: dict, target: dict, units: dict[str, int], mission: str, player: dict) -> dict:
    spec = get_spec()
    research = origin.get("research", {})
    naval = False
    grid = await load_terrain(world["_id"])
    own_tiles = await territory.player_tiles(world["_id"], player["_id"])
    result = astar(grid, (origin["x"], origin["y"]), (target["x"], target["y"]), naval=False, territory=own_tiles, factor=float(spec.marches["own_or_ally_territory_path_cost_factor"]))
    if result is None:
        raise ApiError("NO_LAND_PATH", "No terrestrial path to target (islands require Port-to-Port navigation)", 409)
    path, cost = result
    speed = F.formation_speed_tph(units, research, spec) if units else 0.0
    eta = F.march_eta_seconds(cost, speed, spec) if units else None
    wh = int(origin["buildings"].get("Sala di Guerra", 0))
    return {
        "path": [[x, y] for x, y in path],
        "path_cost": round(cost, 4),
        "speed_tph": round(speed, 4),
        "eta_seconds": eta,
        "naval": naval,
        "march_capacity": F.war_hall_cap(wh, research, mission, spec),
        "weighted_units": _weighted_count(units, research),
        "terrain_defender_bonus_pct": spec.terrain[target["terrain"]]["defender_bonus_pct"],
    }


async def launch(world: dict, player: dict, origin: dict, mission: str, units: dict[str, int], target_settlement_id: str | None, target_sentinel_id: str | None, idempotency_key: str | None, naval: bool = False, ships: int = 0, target_pyramid: bool = False) -> dict:
    spec = get_spec()
    if idempotency_key:
        existing = await db().marches.find_one({"world_id": world["_id"], "player_id": player["_id"], "idempotency_key": idempotency_key})
        if existing:
            return existing
    if mission not in OFFENSIVE + ("REINFORCE", "GARRISON_SENTINEL"):
        raise ApiError("INVALID_MISSION", "Unknown mission type", 400)
    units = {u: int(c) for u, c in units.items() if int(c) > 0}
    if not units:
        raise ApiError("NO_UNITS", "Select at least one unit", 400)
    for u in units:
        if u not in spec.units_by_name:
            raise ApiError("UNKNOWN_UNIT", "Unknown unit", 400, {"unit": u})
    if mission in OFFENSIVE and not any(spec.units_by_name[u]["atk"] > 0 for u in units):
        raise ApiError(spec.combat_resolution["offensive_no_combat_error"], "Offensive marches need at least one unit with ATK > 0", 409)
    if sum(1 for u, c in units.items() if spec.units_by_name[u]["category"] == "legendary" for _ in range(c)) > 1:
        raise ApiError("LEGENDARY_LIMIT", "Max 1 legendary per march", 409)
    research = dict(origin.get("research", {}))
    wh = int(origin["buildings"].get("Sala di Guerra", 0))
    cap = F.war_hall_cap(wh, research, mission, spec)

    # ---- target resolution + revalidation at launch ----
    target_doc = None
    sentinel_doc = None
    if target_pyramid:
        # Pyramid endgame (Bible §21): legality (OPEN, Structured Alliance, mission vs owner) is validated in its domain
        from app.domain import pyramid

        pyr_doc, _ = await pyramid.validate_launch(world, player, mission)
        tx, ty = (pyr_doc.get("config_snapshot") or pyramid.config(world))["anchor"]
        target_terrain = spec.terrain_name(int((await load_terrain(world["_id"]))[ty, tx]))
        target_name = pyramid.NAME
        if naval:
            raise ApiError("INVALID_TARGET", "The Pyramid is a land target", 400)
    elif target_sentinel_id:
        sentinel_doc = await db().sentinels.find_one({"_id": target_sentinel_id, "world_id": world["_id"], "state": {"$ne": "REMOVED"}})
        if not sentinel_doc:
            raise ApiError("SENTINEL_NOT_FOUND", "Sentinel not found", 404)
        tx, ty = sentinel_doc["x"], sentinel_doc["y"]
        target_terrain = spec.terrain_name(int((await load_terrain(world["_id"]))[ty, tx]))
        if mission == "GARRISON_SENTINEL" and sentinel_doc["owner_player_id"] != player["_id"]:
            raise ApiError("NOT_OWNER", "Can only garrison your own sentinels", 403)
        if mission in ("RAID", "CONQUEST", "REINFORCE"):
            raise ApiError("INVALID_MISSION", "Sentinels accept ATTACK or GARRISON_SENTINEL only", 400)
        if mission == "ATTACK" and sentinel_doc["owner_player_id"] == player["_id"]:
            raise ApiError("CANNOT_ATTACK_OWN", "Cannot attack your own sentinel", 409)
        if mission == "ATTACK":
            await alliances.check_hostile_launch(world["_id"], player, sentinel_doc.get("owner_player_id"))
        target_name = f"Sentinella {sentinel_doc['direction']}"
    else:
        target_doc = await db().settlements.find_one({"_id": target_settlement_id, "world_id": world["_id"]})
        if not target_doc:
            raise ApiError("TARGET_NOT_FOUND", "Target settlement not found", 404)
        if target_doc["_id"] == origin["_id"]:
            raise ApiError("INVALID_TARGET", "Cannot march on the origin", 400)
        if target_doc["kind"] == "PLAYER_SLOT":
            raise ApiError("INVALID_TARGET", "Reserved player slot cannot be targeted", 409)
        tx, ty = target_doc["x"], target_doc["y"]
        target_terrain = target_doc["terrain"]
        target_name = target_doc.get("name") or "Neutrale"
        if mission == "GARRISON_SENTINEL":
            raise ApiError("INVALID_MISSION", "GARRISON_SENTINEL needs a sentinel target", 400)
        if mission == "REINFORCE" and target_doc.get("owner_player_id") != player["_id"] and not await alliances.is_ally(player, target_doc.get("owner_player_id")):
            raise ApiError("INVALID_TARGET", "REINFORCE targets own or allied settlements", 409)
        if mission in OFFENSIVE:
            if target_doc.get("owner_player_id") == player["_id"]:
                raise ApiError("CANNOT_ATTACK_OWN", "Cannot attack your own settlement", 409)
            if target_doc["kind"] == "PLAYER":
                other = await db().players.find_one({"_id": target_doc["owner_player_id"]})
                if conquest.shield_active(player) or (other and conquest.shield_active(other)):
                    raise ApiError("PVP_SHIELD_ACTIVE", "Both players must be unshielded for PvP", 409)
                await alliances.check_hostile_launch(world["_id"], player, target_doc.get("owner_player_id"))
                if mission == "CONQUEST" and units.get("Carro di Conquista", 0) < 1:
                    raise ApiError("CONQUEST_CART_REQUIRED", "PvP conquest requires a Conquest Cart", 409)
        if naval:
            if int(origin["buildings"].get("Porto", 0)) < 1 or int(target_doc["buildings"].get("Porto", 0)) < 1:
                raise ApiError("PORT_REQUIRED", "Port-to-Port only: both origin and target need a Porto", 409)
            if int(origin.get("ships", 0)) < ships or ships <= 0:
                raise ApiError("NOT_ENOUGH_SHIPS", "Not enough ships", 409)
            capacity = ships * navy.port_capacity_per_ship(int(origin["level"]), research)
            if sum(units.values()) > capacity:
                raise ApiError("FLEET_CAPACITY_EXCEEDED", "Fleet capacity exceeded", 409, {"capacity": capacity})

    # ---- War Hall cap (mercenary contract: +5% single-march cap vs the contract target, snapshot now — Bible §19.1) ----
    defender_id = (target_doc or {}).get("owner_player_id") if target_doc else (sentinel_doc or {}).get("owner_player_id")
    bonuses = await alliances.contract_bonuses(player, defender_id) if mission in OFFENSIVE else None
    if bonuses:
        cap = int(math.floor(cap * (1 + bonuses["single_march_capacity_pct"] / 100.0)))
    if _weighted_count(units, research) > cap:
        raise ApiError("MARCH_CAPACITY_EXCEEDED", "Formation exceeds War Hall capacity", 409, {"cap": cap})

    # ---- path & ETA snapshot ----
    grid = await load_terrain(world["_id"])
    if naval:
        starts = _adjacent_water(grid, origin["x"], origin["y"])
        goals = _adjacent_water(grid, tx, ty)
        if not starts or not goals:
            raise ApiError("NO_NAVAL_PATH", "No water access", 409)
        result = astar(grid, starts[0], goals[0], naval=True, starts=starts, goals=set(goals))
        if result is None:
            raise ApiError("NO_NAVAL_PATH", "No naval route between the two ports", 409)
        path, cost = result
        path = [(origin["x"], origin["y"])] + path + [(tx, ty)]
        speed = navy.fleet_speed_tph(research)
    else:
        own_tiles = await territory.player_tiles(world["_id"], player["_id"], await alliances.ally_player_ids(player))
        result = astar(grid, (origin["x"], origin["y"]), (tx, ty), naval=False, territory=own_tiles, factor=float(spec.marches["own_or_ally_territory_path_cost_factor"]))
        if result is None:
            raise ApiError("NO_LAND_PATH", "No terrestrial path to target (islands require Port-to-Port navigation)", 409)
        path, cost = result
        speed = F.formation_speed_tph(units, research, spec)
    eta = F.march_eta_seconds(cost, speed, spec)

    # ---- cap20 reservation for CONQUEST ----
    reserved = False
    if mission == "CONQUEST":
        if not await conquest.reserve_slot(player["_id"]):
            raise ApiError("SETTLEMENT_CAP_REACHED", "Owned + reserved settlements would exceed 20", 409)
        reserved = True

    # ---- atomic: outgoing cap + troops (+ ships) leave the origin ----
    outgoing_cap = int(spec.marches["outgoing_per_settlement"])
    flt: dict = {"_id": origin["_id"], "outgoing_active": {"$not": {"$gte": outgoing_cap}}}
    inc: dict = {"outgoing_active": 1}
    for u, c in units.items():
        flt[f"army.{u}"] = {"$gte": c}
        inc[f"army.{u}"] = -c
    if naval:
        flt["ships"] = {"$gte": ships}
        inc["ships"] = -ships
    res = await db().settlements.find_one_and_update(flt, {"$inc": inc})
    if res is None:
        if reserved:
            await conquest.release_slot(player["_id"])
        fresh = await db().settlements.find_one({"_id": origin["_id"]})
        if int(fresh.get("outgoing_active", 0)) >= outgoing_cap:
            raise ApiError("OUTGOING_CAP_REACHED", "Max 5 outgoing marches per settlement", 409)
        raise ApiError("NOT_ENOUGH_UNITS", "Not enough units in the origin settlement", 409)
    now = clock.now()
    arrival = now + timedelta(seconds=eta)
    march = {
        "_id": new_id("mar"),
        "world_id": world["_id"],
        "player_id": player["_id"],
        "house_name": player.get("house_name"),
        "house_crest": player.get("house_crest"),
        "origin_settlement_id": origin["_id"],
        "origin_xy": [origin["x"], origin["y"]],
        "target_settlement_id": target_doc["_id"] if target_doc else None,
        "target_sentinel_id": sentinel_doc["_id"] if sentinel_doc else None,
        "target_pyramid": bool(target_pyramid),
        "target_xy": [tx, ty],
        "target_name": target_name,
        "target_terrain": target_terrain,
        "mission": mission,
        "units": units,
        "ships": ships if naval else 0,
        "naval": naval,
        "path": [[x, y] for x, y in path],
        "path_cost": cost,
        "speed_tph": speed,
        "eta_seconds": eta,
        "departed_at": now,
        "arrival_at": arrival,
        "status": "OUTBOUND",
        "research_snapshot": research,
        "specialization": player.get("specialization"),
        "bonuses": bonuses,
        "reservation": reserved,
        "idempotency_key": idempotency_key,
        "spec_version": spec.version,
    }
    await db().marches.insert_one(march)
    await scheduler.schedule(world["_id"], "BATTLE_OR_FLEET_ARRIVAL", arrival, march["_id"], f"march_arrival:{march['_id']}", {"march_id": march["_id"]})
    # PvP: the defender's surveillance detects the march when it crosses its territory border (Bible §34.10 entry tile)
    if mission in OFFENSIVE and defender_id and defender_id != player["_id"]:
        tiles, _, _ = await _defender_context(world["_id"], defender_id)
        idx = intel.entry_index(march["path"], tiles)
        detect_at = intel.detection_time(now, eta, len(march["path"]), idx)
        await scheduler.schedule(world["_id"], "NOTIFICATION_ONLY", detect_at, march["_id"], f"hostile_detected:{march['_id']}", {"kind": "HOSTILE_MARCH_DETECTED", "march_id": march["_id"], "defender_player_id": defender_id})
    await notifications.notify(world["_id"], player["_id"], "MARCH_DEPARTED", {"march_id": march["_id"], "mission_type": mission, "target_id": target_doc["_id"] if target_doc else (sentinel_doc["_id"] if sentinel_doc else "pyramid"), "target_name": target_name, "eta": clock.iso(arrival), "own_composition": units}, dedupe_key=f"march_departed:{march['_id']}", deep_link="map/march")
    return march


def _adjacent_water(grid, x: int, y: int) -> list[tuple[int, int]]:
    out = []
    for dx, dy in ((0, -1), (1, 0), (0, 1), (-1, 0)):
        nx, ny = x + dx, y + dy
        if 0 <= nx < 400 and 0 <= ny < 400 and int(grid[ny, nx]) == 3:
            out.append((nx, ny))
    return out


async def recall(march: dict, player_id: str) -> dict:
    if march["player_id"] != player_id:
        raise ApiError("NOT_OWNER", "Not your march", 403)
    now = clock.now()
    updated = await db().marches.find_one_and_update({"_id": march["_id"], "status": "OUTBOUND"}, {"$set": {"status": "RETURNING", "recalled_at": now}}, return_document=True)
    if not updated:
        raise ApiError("MARCH_NOT_RECALLABLE", "March cannot be recalled in its current state", 409)
    await scheduler.cancel(f"march_arrival:{march['_id']}")
    if march.get("reservation"):
        await conquest.release_slot(player_id)
    elapsed = max(1.0, (now - clock.aware(march["departed_at"])).total_seconds())
    return_at = now + timedelta(seconds=math.ceil(elapsed))
    await db().marches.update_one({"_id": march["_id"]}, {"$set": {"return_at": return_at, "result": "RECALLED"}})
    await scheduler.schedule(march["world_id"], "MARCH_RETURN_OR_RECALL", return_at, march["_id"], f"march_return:{march['_id']}", {"march_id": march["_id"]})
    return await db().marches.find_one({"_id": march["_id"]})


async def _start_return(march: dict, survivors: dict[str, int], result: str, loot: dict | None = None, ships: int | None = None) -> None:
    now = clock.now()
    return_at = now + timedelta(seconds=int(march["eta_seconds"]))
    sets = {"status": "RETURNING", "units": survivors, "return_at": return_at, "result": result}
    if loot is not None:
        sets["loot"] = loot
    if ships is not None:
        sets["ships"] = ships
    await db().marches.update_one({"_id": march["_id"], "status": {"$in": ["OUTBOUND", "RESOLVING"]}}, {"$set": sets})
    await scheduler.schedule(march["world_id"], "MARCH_RETURN_OR_RECALL", return_at, march["_id"], f"march_return:{march['_id']}", {"march_id": march["_id"]})


async def _complete(march: dict, result: str) -> None:
    await db().marches.update_one({"_id": march["_id"], "status": {"$in": ["OUTBOUND", "RESOLVING", "RETURNING"]}}, {"$set": {"status": "COMPLETED", "result": result, "completed_at": clock.now()}})
    await db().settlements.update_one({"_id": march["origin_settlement_id"], "applied_effects": {"$ne": f"outgoing_release:{march['_id']}"}}, {"$inc": {"outgoing_active": -1}, "$push": {"applied_effects": {"$each": [f"outgoing_release:{march['_id']}"], "$slice": -500}}})


@scheduler.handler("BATTLE_OR_FLEET_ARRIVAL")
async def on_arrival(evt: dict) -> None:
    march = await db().marches.find_one({"_id": evt["payload"]["march_id"]})
    if not march or march["status"] not in ("OUTBOUND", "RESOLVING"):
        return
    await db().marches.update_one({"_id": march["_id"], "status": "OUTBOUND"}, {"$set": {"status": "RESOLVING"}})
    player = await db().players.find_one({"_id": march["player_id"]})
    world = await db().worlds.find_one({"_id": march["world_id"]})
    mission = march["mission"]
    units = {u: int(c) for u, c in march["units"].items() if int(c) > 0}

    # ---- logistics (Bible §13): caravans and interceptors live in this collection but resolve in their own domain ----
    if mission == "CARAVAN":
        from app.domain import caravans

        await caravans.on_arrival(march)
        return
    if mission == "INTERCEPT":
        from app.domain import caravans

        await caravans.on_intercept_arrival(march)
        return
    if march.get("target_pyramid"):
        from app.domain import pyramid

        await pyramid.on_arrival(march)
        return

    # ---- sentinel targets ----
    if march.get("target_sentinel_id"):
        s = await db().sentinels.find_one({"_id": march["target_sentinel_id"]})
        if not s or s["state"] == "REMOVED":
            await _start_return(march, units, "TARGET_MISSING")
            return
        if mission == "GARRISON_SENTINEL":
            if s["owner_player_id"] != march["player_id"]:
                await _start_return(march, units, "TARGET_INVALID")
                return
            await sentinels.add_garrison(s["_id"], units)
            await _complete(march, "GARRISONED")
            await notifications.notify(march["world_id"], march["player_id"], "MARCH_ARRIVED", {"march_id": march["_id"], "result": "GARRISONED", "new_position_or_return_state": s["_id"]}, dedupe_key=f"arrived:{march['_id']}", deep_link="map/sentinel")
            return
        # ATTACK on a sentinel: troop resolver without wall phase
        defender_owner = await db().players.find_one({"_id": s["owner_player_id"]})
        if conquest.shield_active(player) or (defender_owner and conquest.shield_active(defender_owner)):
            await _start_return(march, units, "PVP_SHIELD_ACTIVE")
            return
        home = await db().settlements.find_one({"_id": s["settlement_id"]})
        report = combat.resolve_battle(f"btl_{march['_id']}", "ATTACK", units, march.get("research_snapshot", {}), march.get("specialization"), dict(s.get("garrison") or {}), (home or {}).get("research", {}), (defender_owner or {}).get("specialization"), march.get("target_terrain", "plain"), None, defender_kind="SENTINEL", attacker_bonus_atk_pct=float((march.get("bonuses") or {}).get("attack_pct", 0)))
        await _persist_battle(march, report, None, s)
        if report["winner"] == "ATTACKER":
            await sentinels.remove_garrison(s["_id"], None, "GARRISON_ANNIHILATED")
        else:
            await sentinels.remove_garrison(s["_id"], report["defender_losses"], "CASUALTIES")
        survivors = report["attacker_survivors"]
        if survivors:
            await _start_return(march, survivors, report["winner"])
        else:
            await _complete(march, "ANNIHILATED")
        return

    # ---- settlement targets ----
    target = await db().settlements.find_one({"_id": march["target_settlement_id"]})
    if not target:
        await _start_return(march, units, "TARGET_MISSING")
        return
    target = await catch_up_neutral(target, world)
    target = await economy.accrue(target) if target["kind"] != "PLAYER_SLOT" else target

    if mission == "REINFORCE":
        if target.get("owner_player_id") != march["player_id"]:
            await _start_return(march, units, "TARGET_INVALID")
            return
        inc = {f"army.{u}": c for u, c in units.items()}
        await db().settlements.update_one({"_id": target["_id"], "applied_effects": {"$ne": f"reinforce:{march['_id']}"}}, {"$inc": inc, "$push": {"applied_effects": {"$each": [f"reinforce:{march['_id']}"], "$slice": -500}}})
        if march.get("naval"):
            await _start_return(march, {}, "REINFORCED", ships=int(march.get("ships", 0)))  # ships return empty
        else:
            await _complete(march, "REINFORCED")
        await notifications.notify(march["world_id"], march["player_id"], "MARCH_ARRIVED", {"march_id": march["_id"], "result": "REINFORCED", "new_position_or_return_state": target["_id"]}, dedupe_key=f"arrived:{march['_id']}", deep_link="settlement")
        return

    # revalidation: owner/diplomacy/legality at arrival, never a phantom battle
    if target.get("owner_player_id") == march["player_id"]:
        await _start_return(march, units, "TARGET_NOW_OWN", ships=int(march.get("ships", 0)) or None)
        return
    if target["kind"] == "PLAYER":
        other = await db().players.find_one({"_id": target["owner_player_id"]})
        if conquest.shield_active(player) or (other and conquest.shield_active(other)):
            await _start_return(march, units, "PVP_SHIELD_ACTIVE", ships=int(march.get("ships", 0)) or None)
            return
    if march.get("naval") and int(target["buildings"].get("Porto", 0)) < 1:
        await _start_return(march, units, "TURNAROUND_WITHOUT_BATTLE", ships=int(march.get("ships", 0)))
        return

    defender_owner = await db().players.find_one({"_id": target["owner_player_id"]}) if target.get("owner_player_id") else None
    battle_id = f"btl_{march['_id']}"
    existing = await db().battles.find_one({"_id": battle_id})
    if existing:
        report = existing["report"]
    else:
        report = combat.resolve_battle(battle_id, mission, units, march.get("research_snapshot", {}), march.get("specialization"), {u: int(c) for u, c in (target.get("army") or {}).items()}, target.get("research", {}), (defender_owner or {}).get("specialization"), target["terrain"], dict(target.get("wall") or {}) or None, defender_kind="SETTLEMENT", attacker_bonus_atk_pct=float((march.get("bonuses") or {}).get("attack_pct", 0)))
    # apply defender casualties + wall state (idempotent via applied_effects)
    def_inc = {f"army.{u}": -int(c) for u, c in report["defender_losses"].items() if int(c) > 0}
    upd: dict = {"$push": {"applied_effects": {"$each": [battle_id], "$slice": -500}}}
    sets: dict = {}
    if report.get("wall", {}).get("after"):
        sets["wall.current_hp"] = int(report["wall"]["after"]["current_hp"])
    if def_inc:
        upd["$inc"] = def_inc
    if sets:
        upd["$set"] = sets
    await db().settlements.update_one({"_id": target["_id"], "applied_effects": {"$ne": battle_id}}, upd)

    survivors = report["attacker_survivors"]
    loot = None
    ownership = {"changed": False}
    loyalty_change = None
    if report["winner"] == "ATTACKER":
        if mission == "RAID":
            loot = _compute_loot(survivors, march.get("research_snapshot", {}), target)
            if loot:
                await db().settlements.update_one({"_id": target["_id"], "applied_effects": {"$ne": f"loot:{battle_id}"}}, {"$inc": {f"resources.{r}": -v for r, v in loot.items() if v}, "$push": {"applied_effects": {"$each": [f"loot:{battle_id}"], "$slice": -500}}})
        elif mission == "CONQUEST":
            if target["kind"] == "NEUTRAL":
                fresh_target = await db().settlements.find_one({"_id": target["_id"]})
                ownership = await conquest.transfer_ownership(fresh_target, player, survivors, battle_id)
            else:
                loyalty_change = await _apply_loyalty(target, march, survivors, battle_id, player)
                ownership = loyalty_change.get("ownership", {"changed": False})
    await _persist_battle(march, report, target, None, loot=loot, ownership=ownership, loyalty=loyalty_change)
    if march.get("reservation") and not ownership.get("changed"):
        await conquest.release_slot(march["player_id"])
        await db().marches.update_one({"_id": march["_id"]}, {"$set": {"reservation": False}})
    if ownership.get("changed"):
        # survivors stay in the conquered settlement; ships (if any) return empty
        if march.get("naval"):
            await _start_return(march, {}, "CONQUERED", ships=int(march.get("ships", 0)))
        else:
            await _complete(march, "CONQUERED")
    elif survivors:
        await _start_return(march, survivors, report["winner"], loot=loot, ships=int(march.get("ships", 0)) if march.get("naval") else None)
    else:
        if march.get("naval"):
            await _start_return(march, {}, "ANNIHILATED", ships=int(march.get("ships", 0)))  # ships never die, return empty
        else:
            await _complete(march, "ANNIHILATED")


def _compute_loot(survivors: dict[str, int], research: dict[str, int], target: dict) -> dict[str, int]:
    spec = get_spec()
    cargo = sum(int(c) * int(spec.units_by_name[u]["cargo"]) for u, c in survivors.items())
    lvl = F.rget(research, spec.raid["loot_capacity_research_key"])
    effective = int(math.floor(cargo * (1 + float(spec.raid["loot_capacity_bonus_per_level_pct"]) / 100.0 * lvl)))
    balances = {r: int(target.get("resources", {}).get(r, 0)) for r in F.RES}
    total = min(effective, sum(balances.values()))
    if total <= 0:
        return {}
    alloc = F.largest_remainder(total, [float(balances[r]) for r in F.RES])
    return {r: min(balances[r], a) for r, a in zip(F.RES, alloc) if a > 0}


async def _apply_loyalty(target: dict, march: dict, survivors: dict[str, int], battle_id: str, player: dict) -> dict:
    spec = get_spec()
    c = spec.conquest
    pressure = F.rget(march.get("research_snapshot", {}), "siege.loyalty_pressure")
    reduction = min(int(c["max_reduction_per_valid_win"]), int(c["base_reduction_per_valid_win"]) + 2 * pressure)
    now = clock.now()
    updated = await db().settlements.find_one_and_update(
        {"_id": target["_id"], "applied_effects": {"$ne": f"loyalty:{battle_id}"}},
        {"$inc": {"loyalty": -reduction}, "$set": {"last_conquest_hit_at": now}, "$push": {"applied_effects": {"$each": [f"loyalty:{battle_id}"], "$slice": -500}}},
        return_document=True,
    )
    doc = updated or await db().settlements.find_one({"_id": target["_id"]})
    out = {"reduction": reduction, "loyalty_after": int(doc.get("loyalty", 100)), "ownership": {"changed": False}}
    if int(doc.get("loyalty", 100)) <= 0 and survivors.get("Carro di Conquista", 0) >= 1:
        out["ownership"] = await conquest.transfer_ownership(doc, player, survivors, battle_id)
    await notifications.notify(target["world_id"], target.get("owner_player_id"), "LOYALTY_CHANGED", {"settlement_id": target["_id"], "loyalty": out["loyalty_after"], "reduction": reduction}, dedupe_key=f"loyalty:{battle_id}")
    return out


async def _persist_battle(march: dict, report: dict, target: dict | None, sentinel: dict | None, loot: dict | None = None, ownership: dict | None = None, loyalty: dict | None = None) -> None:
    defender_player = (target or sentinel or {}).get("owner_player_id")
    participants = [p for p in {march["player_id"], defender_player} if p]
    doc = {
        "_id": report["battle_id"],
        "world_id": march["world_id"],
        "march_id": march["_id"],
        "attacker_player_id": march["player_id"],
        "defender_player_id": defender_player,
        "participants": participants,
        "target_settlement_id": (target or {}).get("_id"),
        "target_sentinel_id": (sentinel or {}).get("_id"),
        "origin_settlement_id": march.get("origin_settlement_id"),
        "target_name": march.get("target_name"),
        "target_xy": march.get("target_xy"),
        "mission": march["mission"],
        "report": report,
        "loot": loot,
        "ownership_result": ownership or {"changed": False},
        "loyalty": loyalty,
        "attacker_research_snapshot": march.get("research_snapshot", {}),
        "ships_excluded": int(march.get("ships", 0)),
        "created_at": clock.now(),
    }
    try:
        await db().battles.insert_one(doc)
    except Exception:
        await db().battles.update_one({"_id": doc["_id"]}, {"$set": {"loot": loot, "ownership_result": doc["ownership_result"], "loyalty": loyalty}})
    await db().marches.update_one({"_id": march["_id"]}, {"$set": {"battle_id": report["battle_id"]}})
    await progress.on_battle(doc)  # kills / defenses / prestige / world record (idempotent per battle_id)
    for pid in participants:
        await notifications.notify(march["world_id"], pid, "BATTLE_REPORT_READY", {"battle_id": report["battle_id"], "seed": report["seed"], "winner": report["winner"], "mission": march["mission"], "target_name": march.get("target_name"), "losses": report["attacker_losses"] if pid == march["player_id"] else report["defender_losses"], "survivors": report["attacker_survivors"] if pid == march["player_id"] else report["defender_survivors"], "counter_summary": None, "loot": loot, "ownership_changed": (ownership or {}).get("changed", False)}, dedupe_key=f"battle_ready:{report['battle_id']}:{pid}", deep_link="battle-reports")


@scheduler.handler("MARCH_RETURN_OR_RECALL")
async def on_return(evt: dict) -> None:
    march = await db().marches.find_one({"_id": evt["payload"]["march_id"]})
    if not march or march["status"] != "RETURNING":
        return
    units = {u: int(c) for u, c in (march.get("units") or {}).items() if int(c) > 0}
    origin = await db().settlements.find_one({"_id": march["origin_settlement_id"]})
    dest = origin
    if not origin or origin.get("owner_player_id") != march["player_id"]:
        # origin lost: reroute to current Mother, else nearest own settlement
        p = await db().players.find_one({"_id": march["player_id"]})
        dest = await db().settlements.find_one({"_id": (p or {}).get("mother_settlement_id"), "owner_player_id": march["player_id"]}) if p else None
        if not dest:
            dest = await db().settlements.find_one({"world_id": march["world_id"], "owner_player_id": march["player_id"], "kind": "PLAYER"})
    effect = f"return:{march['_id']}"
    if dest:
        inc = {f"army.{u}": c for u, c in units.items()}
        if march.get("naval") and int(march.get("ships", 0)) > 0 and int(dest["buildings"].get("Porto", 0)) >= 1:
            inc["ships"] = int(march["ships"])
        if inc:
            await db().settlements.update_one({"_id": dest["_id"], "applied_effects": {"$ne": effect}}, {"$inc": inc, "$push": {"applied_effects": {"$each": [effect], "$slice": -500}}})
        loot = march.get("loot") or {}
        if loot:
            already = await db().audit.find_one({"type": "loot_credit", "march_id": march["_id"]})
            if not already:
                await db().audit.insert_one({"world_id": march["world_id"], "type": "loot_credit", "march_id": march["_id"], "at": clock.now()})
                await economy.credit(dest["_id"], loot, "raid_loot")
        if march.get("mission") == "CARAVAN":
            from app.domain import caravans

            await caravans.on_returned(march, dest)
    await _complete(march, march.get("result") or "RETURNED")
    await notifications.notify(march["world_id"], march["player_id"], "MARCH_RETURNED", {"march_id": march["_id"], "eta_or_completed": "COMPLETED", "destination": (dest or {}).get("_id"), "units": units, "loot": march.get("loot")}, dedupe_key=f"returned:{march['_id']}", deep_link="map/march")


async def active_for_player(world_id: str, player_id: str) -> list[dict]:
    cur = db().marches.find({"world_id": world_id, "player_id": player_id, "status": {"$in": list(ACTIVE)}}).sort("departed_at", -1)
    return [dto(m) async for m in cur]


async def incoming_for_player(world_id: str, player_id: str) -> list[dict]:
    """Detected hostile OUTBOUND marches heading for this player's settlements/sentinels, with intel disclosure."""
    tiles, settlements, sentinel_ids = await _defender_context(world_id, player_id)
    if not settlements:
        return []
    cur = db().marches.find(
        {
            "world_id": world_id,
            "status": "OUTBOUND",
            "player_id": {"$ne": player_id},
            "mission": {"$in": list(OFFENSIVE)},
            "$or": [{"target_settlement_id": {"$in": list(settlements.keys())}}, {"target_sentinel_id": {"$in": list(sentinel_ids)}}],
        }
    ).sort("arrival_at", 1)
    out = []
    async for m in cur:
        d = await _hostile_public_dto(m, player_id, tiles, settlements)
        if d:
            out.append(d)
    return out


@scheduler.handler("NOTIFICATION_ONLY")
async def on_notification_only(evt: dict) -> None:
    p = evt.get("payload", {})
    if p.get("kind") != "HOSTILE_MARCH_DETECTED":
        return
    m = await db().marches.find_one({"_id": p["march_id"]})
    if not m or m["status"] != "OUTBOUND":
        return
    defender = p["defender_player_id"]
    tiles, settlements, _ = await _defender_context(m["world_id"], defender)
    d = await _hostile_public_dto(m, defender, tiles, settlements)
    if not d:
        return
    it = d["intel"]
    await notifications.notify(
        m["world_id"],
        defender,
        "HOSTILE_MARCH_DETECTED",
        {"march_id": m["_id"], "target_id": m.get("target_settlement_id") or m.get("target_sentinel_id"), "target_name": m.get("target_name"), "entry_tile": it["entry_tile"], "heading": it["heading"], "intel_disclosure": it},
        dedupe_key=f"hostile_detected:{m['_id']}",
        deep_link="map/march",
    )


async def visible_in_chunks(world_id: str, viewer_player_id: str, chunks: list[tuple[int, int]]) -> list[dict]:
    """Marches whose path crosses any of the requested chunks: own marches + detected hostiles (intel-disclosed)."""
    chunk_set = set(chunks)
    out = []
    async for m in db().marches.find({"world_id": world_id, "status": {"$in": list(ACTIVE)}, "player_id": viewer_player_id}):
        if any((x // 32, y // 32) in chunk_set for x, y in m.get("path", [])):
            out.append(dto(m))
    for d in await incoming_for_player(world_id, viewer_player_id):
        if any((x // 32, y // 32) in chunk_set for x, y in d["path"]):
            out.append(d)
    return out
