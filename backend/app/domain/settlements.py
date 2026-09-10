"""Settlement domain: bootstrap, neutral runtime catch-up, DTOs, catalogs with UX states."""
from __future__ import annotations

import hashlib
import math
import uuid
from datetime import timedelta

from app.core import clock
from app.core.db import db
from app.core.errors import ApiError, not_found
from app.core.spec import get_spec
from app.domain import formulas as F
from app.domain.pyramid_reward import bonus_pct

CHUNK = 32


def chunk_of(x: int, y: int) -> tuple[int, int]:
    return x // CHUNK, y // CHUNK


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


# --------------------------------------------------------------------------- neutral runtime
def neutral_offset_hours(settlement_id: str) -> int:
    lo, hi = get_spec().neutral_runtime["deterministic_offset_hours_range"]
    h = int(hashlib.sha256(settlement_id.encode()).hexdigest(), 16)
    return lo + h % (hi - lo + 1)


def build_neutral_state(level: int, port_eligible: bool) -> dict:
    spec = get_spec()
    tpl = F.neutral_template(level, port_eligible, spec)
    wall = F.wall_stats(tpl["buildings"].get("Mura", 0), {}, spec)
    return {
        "level": level,
        "buildings": tpl["buildings"],
        "army": tpl["army"],
        "wall": {"level": wall["level"], "current_hp": wall["max_hp"], "max_hp": wall["max_hp"]},
    }


async def catch_up_neutral(doc: dict, world: dict) -> dict:
    """Apply missed 72h growth ticks deterministically (idempotent: state is a pure function of time)."""
    if doc.get("kind") != "NEUTRAL":
        return doc
    spec = get_spec()
    now = clock.now()
    opened = clock.aware(world["opened_at"])
    tick_h = int(spec.neutral_runtime["growth_tick_hours"])
    first = opened + timedelta(hours=tick_h + neutral_offset_hours(doc["_id"]))
    next_tick = clock.aware(doc.get("next_growth_at")) or first
    if next_tick > now:
        if doc.get("next_growth_at") is None:
            await db().settlements.update_one({"_id": doc["_id"]}, {"$set": {"next_growth_at": next_tick}})
            doc["next_growth_at"] = next_tick
        return doc
    level = int(doc["level"])
    ticks = 0
    while next_tick <= now:
        age_days = (next_tick - opened).total_seconds() / 86400.0
        cap = F.neutral_level_cap(age_days, spec)
        if level < cap:
            level += 1
        next_tick += timedelta(hours=tick_h)
        ticks += 1
    state = build_neutral_state(level, bool(doc.get("port_eligible")))
    # restore garrison to 100*L^2 and walls to max HP on each tick (STC-25)
    updated = await db().settlements.find_one_and_update(
        {"_id": doc["_id"], "next_growth_at": doc.get("next_growth_at"), "kind": "NEUTRAL"},
        {
            "$set": {
                "level": state["level"],
                "buildings": state["buildings"],
                "army": state["army"],
                "wall": state["wall"],
                "next_growth_at": next_tick,
                "last_accrued_at": now,
            },
            "$inc": {"growth_ticks": ticks},
        },
        return_document=True,
    )
    return updated or await db().settlements.find_one({"_id": doc["_id"]})


# --------------------------------------------------------------------------- bootstrap
def bootstrap_player_settlement(slot: dict, player_id: str, house_name: str) -> dict:
    spec = get_spec()
    pb = spec.player_bootstrap
    buildings = {name: 1 for name in pb["prebuilt_buildings_level_1"]}
    wall = F.wall_stats(1, {}, spec)
    now = clock.now()
    return {
        "kind": "PLAYER",
        "owner_player_id": player_id,
        "name": f"{house_name}",
        "level": int(pb["mother_settlement_level"]),
        "buildings": buildings,
        "resources": {r: int(pb["resources"][r]) for r in F.RES},
        "carry": {r: 0.0 for r in F.RES},
        "last_accrued_at": now,
        "army": dict(pb["army"]),
        "research": {},
        "wall": {"level": 1, "current_hp": wall["max_hp"], "max_hp": wall["max_hp"]},
        "loyalty": int(spec.conquest["loyalty_start"]),
        "is_mother": True,
        "founded_at": now,
        "slot_status": "CLAIMED",
        "ships": 0,
        "applied_effects": [],
        "version": 1,
    }


# --------------------------------------------------------------------------- unlock / states
def building_unlocked(name: str, level: int, research: dict[str, int]) -> tuple[bool, dict]:
    reg = get_spec().unlock_registry["buildings"][name]
    lvl_ok = level >= int(reg["minimum_settlement_level"])
    rk = reg.get("required_research_key")
    res_ok = True if not rk else F.rget(research, rk) >= 1
    return (lvl_ok and res_ok), {"min_settlement_level": reg["minimum_settlement_level"], "required_research_key": rk, "level_ok": lvl_ok, "research_ok": res_ok}


def unit_unlocked(name: str, doc: dict) -> tuple[bool, dict]:
    reg = get_spec().unlock_registry["units"][name]
    level = int(doc["level"])
    research = doc.get("research", {})
    producer = reg["producer_building"]
    lvl_ok = level >= int(reg["minimum_settlement_level"])
    rk = reg.get("required_research_key")
    res_ok = True if not rk else F.rget(research, rk) >= 1
    prod_ok = int(doc.get("buildings", {}).get(producer, 0)) >= 1
    return (lvl_ok and res_ok and prod_ok), {
        "min_settlement_level": reg["minimum_settlement_level"],
        "required_research_key": rk,
        "producer_building": producer,
        "level_ok": lvl_ok,
        "research_ok": res_ok,
        "producer_ok": prod_ok,
    }


async def owned_count(world_id: str, player_id: str) -> int:
    p = await db().players.find_one({"_id": player_id}, {"settlement_count": 1})
    return int(p.get("settlement_count", 1)) if p else 1


async def running_jobs(settlement_id: str) -> list[dict]:
    cur = db().jobs.find({"settlement_id": settlement_id, "status": "RUNNING"}).sort("started_at", 1)
    return [j async for j in cur]


def job_dto(j: dict) -> dict:
    now = clock.now()
    ends = clock.aware(j["ends_at"])
    started = clock.aware(j["started_at"])
    total = max(1.0, (ends - started).total_seconds())
    remaining = max(0.0, (ends - now).total_seconds())
    return {
        "job_id": j["_id"],
        "kind": j["kind"],
        "queue": j.get("queue", "construction"),
        "target": j.get("target"),
        "target_level": j.get("target_level"),
        "count": j.get("count"),
        "produced_so_far": j.get("produced_so_far", 0),
        "started_at": clock.iso(started),
        "ends_at": clock.iso(ends),
        "remaining_seconds": int(math.ceil(remaining)),
        "progress": min(1.0, max(0.0, 1.0 - remaining / total)),
        "status": j["status"],
        "cost_snapshot": j.get("cost_snapshot", {}),
        "modifiers_snapshot": j.get("modifiers_snapshot", {}),
    }


async def building_catalog(doc: dict, jobs: list[dict], owned: int) -> list[dict]:
    spec = get_spec()
    level = int(doc["level"])
    research = doc.get("research", {})
    buildings = doc.get("buildings", {})
    construction_jobs = [j for j in jobs if j["kind"] in ("BUILDING", "SETTLEMENT_UPGRADE", "SENTINEL_BUILD")]
    queue_full = len(construction_jobs) >= int(spec.construction_runtime["queues_per_settlement"])
    in_progress = {j["target"]: j for j in construction_jobs if j["kind"] == "BUILDING"}
    out = []
    for b in spec.buildings:
        name = b["name"]
        cur = int(buildings.get(name, 0))
        unlocked, gate = building_unlocked(name, level, research)
        target = cur + 1
        entry: dict = {
            "name": name,
            "category": b["category"],
            "purpose": b["purpose"],
            "level": cur,
            "unlock": gate,
            "max_level": 30 if name != "Santuario Mitico" else 5,
        }
        if name == "Castello / Fortezza":
            entry["state"] = "SETTLEMENT_CORE"
            out.append(entry)
            continue
        if name in in_progress:
            entry["state"] = "IN_PROGRESS"
            entry["job"] = job_dto(in_progress[name])
        elif not unlocked:
            entry["state"] = "LOCKED"
        elif cur >= 30:
            entry["state"] = "MAXED"
        elif name == "Santuario Mitico":
            entry["state"] = "LOCKED"  # dedicated 5-level table; outside the vertical slice
        elif target > level and name != "Castello / Fortezza":
            entry["state"] = "BLOCKED_SETTLEMENT_LEVEL"
        else:
            entry["state"] = "AVAILABLE"
        if name != "Santuario Mitico" and target <= 30:
            q = F.construction_cost_time(name, target, owned, research, spec)
            entry["next"] = {"level": target, **q}
            missing = {r: q["cost"][r] - int(doc["resources"].get(r, 0)) for r in F.RES if int(doc["resources"].get(r, 0)) < q["cost"][r]}
            if entry["state"] == "AVAILABLE":
                if queue_full:
                    entry["state"] = "BLOCKED_QUEUE"
                elif missing:
                    entry["state"] = "BLOCKED_RESOURCES"
            entry["missing"] = missing
        out.append(entry)
    return out


def settlement_upgrade_info(doc: dict, jobs: list[dict], owned: int) -> dict:
    spec = get_spec()
    level = int(doc["level"])
    target = level + 1
    construction_jobs = [j for j in jobs if j["kind"] in ("BUILDING", "SETTLEMENT_UPGRADE", "SENTINEL_BUILD")]
    running = next((j for j in construction_jobs if j["kind"] == "SETTLEMENT_UPGRADE"), None)
    if target > 30:
        return {"state": "MAXED", "level": level}
    reqs = spec.settlement_requirements(target)
    req_rows = []
    all_ok = True
    for name, lvl in reqs:
        if name == "__PRODUCERS__":
            have = min(int(doc["buildings"].get(p, 0)) for p in spec.PRODUCERS)
            label = "Produttori (min)"
        else:
            have = int(doc["buildings"].get(name, 0))
            label = name
        ok = have >= lvl
        all_ok &= ok
        req_rows.append({"building": label, "required": lvl, "have": have, "ok": ok})
    q = F.construction_cost_time("Castello / Fortezza", target, owned, doc.get("research", {}), spec)
    missing = {r: q["cost"][r] - int(doc["resources"].get(r, 0)) for r in F.RES if int(doc["resources"].get(r, 0)) < q["cost"][r]}
    if running:
        state = "IN_PROGRESS"
    elif not all_ok:
        state = "BLOCKED_REQUIREMENTS"
    elif len(construction_jobs) >= int(spec.construction_runtime["queues_per_settlement"]):
        state = "BLOCKED_QUEUE"
    elif missing:
        state = "BLOCKED_RESOURCES"
    else:
        state = "AVAILABLE"
    prog = spec.settlement_progression[target]
    return {
        "state": state,
        "level": level,
        "next": {"level": target, "stage": prog["stage"], "unlocks": prog["unlocks"], **q},
        "requirements": req_rows,
        "missing": missing,
        "job": job_dto(running) if running else None,
    }


def research_catalog(doc: dict, jobs: list[dict]) -> list[dict]:
    spec = get_spec()
    research = doc.get("research", {})
    uni = int(doc["buildings"].get("Universita", 0))
    level = int(doc["level"])
    rjobs = [j for j in jobs if j["kind"] == "RESEARCH"]
    in_progress = {j["target"]: j for j in rjobs}
    queue_full = len(rjobs) >= int(spec.research_scope["queues_per_settlement"])
    out = []
    for n in spec.research_nodes:
        key = n["key"]
        cur = F.rget(research, key)
        prereqs = spec.research_prereqs(key)
        prereq_rows = [{"key": p, "ok": F.rget(research, p) >= 1} for p in prereqs]
        gates_ok = uni >= int(n["required_university_level"]) and level >= int(n["required_settlement_level"]) and all(r["ok"] for r in prereq_rows)
        entry = {
            "key": key,
            "name": n["name"],
            "branch": n["branch"],
            "level": cur,
            "max_level": int(n["max_level"]),
            "required_university_level": n["required_university_level"],
            "required_settlement_level": n["required_settlement_level"],
            "prerequisites": prereq_rows,
            "cost_class": n["cost_class"],
            "effect": n["effect"],
            "effects": spec.research_effects[key]["effects"],
        }
        if key in in_progress:
            entry["state"] = "IN_PROGRESS"
            entry["job"] = job_dto(in_progress[key])
        elif cur >= int(n["max_level"]):
            entry["state"] = "MAXED"
        elif not gates_ok:
            entry["state"] = "LOCKED"
        else:
            entry["state"] = "AVAILABLE"
        if cur < int(n["max_level"]):
            q = F.research_cost_time(n["cost_class"], cur + 1, research, spec, speed_bonus_pct=bonus_pct(doc)["research_pct"])
            entry["next"] = {"level": cur + 1, **q}
            missing = {r: q["cost"][r] - int(doc["resources"].get(r, 0)) for r in F.RES if int(doc["resources"].get(r, 0)) < q["cost"][r]}
            entry["missing"] = missing
            if entry["state"] == "AVAILABLE":
                if queue_full:
                    entry["state"] = "BLOCKED_QUEUE"
                elif missing:
                    entry["state"] = "BLOCKED_RESOURCES"
        out.append(entry)
    return out


def unit_catalog(doc: dict, jobs: list[dict]) -> list[dict]:
    spec = get_spec()
    research = doc.get("research", {})
    rjobs = {j["producer"]: j for j in jobs if j["kind"] == "RECRUIT"}
    out = []
    for u in spec.units:
        name = u["name"]
        unlocked, gate = unit_unlocked(name, doc)
        producer = gate["producer_building"]
        plevel = int(doc["buildings"].get(producer, 0))
        entry = {
            "name": name,
            "category": u["category"],
            "producer_building": producer,
            "stats": {k: u[k] for k in ("atk", "def", "hp", "speed_tph", "cargo", "wall_damage")},
            "cost": spec.unit_cost(name),
            "base_time_s": spec.unit_base_time_seconds(name),
            "role": spec.unit_costs[name]["role"],
            "unlock": gate,
            "count": int(doc.get("army", {}).get(name, 0)),
        }
        if u["category"] == "legendary":
            entry["batch_cap"] = 1
            entry["effective_time_s"] = spec.unit_base_time_seconds(name)
        else:
            entry["batch_cap"] = F.batch_cap(plevel, spec) if plevel else 0
            entry["effective_time_s"] = F.unit_effective_time_seconds(name, plevel, research, spec, pyramid_training_bonus_pct=bonus_pct(doc)["training_pct"]) if plevel else None
        if producer in rjobs:
            entry["state"] = "IN_PROGRESS" if rjobs[producer]["target"] == name else "BLOCKED_QUEUE"
            entry["job"] = job_dto(rjobs[producer])
        elif not unlocked:
            entry["state"] = "LOCKED"
        else:
            entry["state"] = "AVAILABLE"
        out.append(entry)
    return out


# --------------------------------------------------------------------------- DTOs
def public_dto(doc: dict, viewer_player_id: str | None, viewer_alliance_id: str | None = None) -> dict:
    spec = get_spec()
    owner = doc.get("owner_player_id")
    if doc["kind"] == "NEUTRAL":
        faction = "NEUTRAL"
    elif doc["kind"] == "PLAYER_SLOT":
        faction = "RESERVED_SLOT"
    elif owner == viewer_player_id:
        faction = "OWN"
    elif viewer_alliance_id and doc.get("owner_alliance_id") == viewer_alliance_id:
        faction = "ALLY"
    else:
        faction = "ENEMY"
    return {
        "settlement_id": doc["_id"],
        "world_id": doc["world_id"],
        "kind": doc["kind"],
        "name": doc.get("name") or ("Neutrale" if doc["kind"] == "NEUTRAL" else "Slot libero"),
        "x": doc["x"],
        "y": doc["y"],
        "terrain": doc["terrain"],
        "terrain_defender_bonus_pct": spec.terrain[doc["terrain"]]["defender_bonus_pct"],
        "region": doc.get("region"),
        "port_eligible": bool(doc.get("port_eligible")),
        "level": int(doc.get("level", 0)),
        "owner_player_id": owner,
        "owner_house_name": doc.get("owner_house_name"),
        "owner_house_crest": doc.get("owner_house_crest"),
        "owner_alliance_tag": doc.get("owner_alliance_tag"),
        "owner_alliance_id": doc.get("owner_alliance_id"),
        "skin": doc.get("skin"),
        "faction": faction,
        "wall_level": int((doc.get("wall") or {}).get("level", 0)),
        "garrison_total": int(sum((doc.get("army") or {}).values())) if doc["kind"] == "NEUTRAL" else None,
    }


async def owner_dto(doc: dict, player: dict) -> dict:
    spec = get_spec()
    jobs = await running_jobs(doc["_id"])
    owned = int(player.get("settlement_count", 1))
    pyr = bonus_pct(doc)
    rates = {
        "production_per_h": F.production_per_hour(doc["buildings"], doc.get("research", {}), spec, extra_pct=pyr["production_pct"]),
        "warehouse_capacity": F.warehouse_capacity(doc["buildings"], doc.get("research", {}), spec),
    }
    wall = F.wall_stats(int(doc["buildings"].get("Mura", 0)), doc.get("research", {}), spec)
    wh = int(doc["buildings"].get("Sala di Guerra", 0))
    out_marches = await db().marches.count_documents({"origin_settlement_id": doc["_id"], "status": {"$in": ["OUTBOUND", "RETURNING", "ARRIVED"]}})
    return {
        **public_dto(doc, player["_id"], player.get("alliance_id")),
        "is_mother": bool(doc.get("is_mother")),
        "resources": {r: int(doc["resources"].get(r, 0)) for r in F.RES},
        "production_per_h": {r: round(v, 3) for r, v in rates["production_per_h"].items()},
        "warehouse_capacity": rates["warehouse_capacity"],
        "buildings": doc["buildings"],
        "research": F.decode_research(doc.get("research", {})),
        "army": {k: int(v) for k, v in doc.get("army", {}).items() if int(v) > 0},
        "ships": int(doc.get("ships", 0)),
        "wall": {**doc.get("wall", {}), "defense_bonus_pct": wall["defense_bonus_pct"], "static_damage": round(wall["static_damage"], 2)},
        "loyalty": int(doc.get("loyalty", 100)),
        "development_score": F.development_score(int(doc["level"]), doc["buildings"], doc.get("research", {})),
        "pyramid_reward": {**pyr, "until": clock.iso((doc.get("pyramid_reward") or {}).get("until"))} if any(pyr.values()) else None,
        "march_capacity": F.war_hall_cap(wh, doc.get("research", {}), "ATTACK", spec),
        "outgoing_marches": out_marches,
        "outgoing_cap": int(spec.marches["outgoing_per_settlement"]),
        "jobs": [job_dto(j) for j in jobs],
        "construction_queues": int(spec.construction_runtime["queues_per_settlement"]),
        "research_queues": int(spec.research_scope["queues_per_settlement"]),
        "settlement_upgrade": settlement_upgrade_info(doc, jobs, owned),
        "server_time": clock.iso(clock.now()),
    }


async def get_owned_settlement(world_id: str, settlement_id: str, player_id: str) -> dict:
    doc = await db().settlements.find_one({"_id": settlement_id, "world_id": world_id})
    if not doc:
        raise not_found("settlement", settlement_id)
    if doc.get("owner_player_id") != player_id:
        raise ApiError("NOT_OWNER", "Settlement is not owned by this player", 403)
    return doc
