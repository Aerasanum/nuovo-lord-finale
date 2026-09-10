"""Pyramid endgame cycle (Bible §21 / §31.7 / §34.8 / §39.2, spec.pyramid).

One state document per world (collection `pyramid`, _id = world_id):

  DORMANT_INITIAL --(opened_at + first_open_day)--> OPEN --(hold_hours of continuous control by ONE Structured
  Alliance)--> REWARD_LOCK --(reward_days)--> DORMANT --(dormant_days)--> OPEN (cycle_id + 1) ... forever.

* Every deadline is a persisted `scheduled_at` (scheduler event `PYRAMID_STATE_DEADLINE`, priority 10): a late worker
  never drifts the calendar. The current pending event is tracked in `deadline_key`; stale events are ignored.
* OPEN has no timeout. A new Guardian snapshot (top-10 development_score → median max legal march power → clamp) is
  created at every OPEN; the Guardian composition is 45/35/20 Fanteria/Arciere/Cavalleria (spec formula).
* Only members of a STRUCTURED Alliance may attack (ATTACK) or reinforce (REINFORCE, own Alliance holds it, cap
  garrison_cap_units alliance-wide). Winning survivors become the garrison; owner change resets the hold timer;
  Alliance dissolution neutralises the Pyramid (timer 0, troops go home by real marches).
* Hold completion snapshots the membership: reward window on every member (kept even if they leave later; new members
  do not inherit), title + heraldic seal, Prestige, Emeralds to the treasury, Chronicle entry.

CONFIGURATION — `config(world)` merges spec.pyramid defaults with the per-world admin override
`worlds.pyramid_config` (QA endpoint `PUT /api/qa/pyramid/config`). Durations, first-open day, garrison cap, reward
percentages, Emeralds and Prestige can therefore be tuned per world without code changes; `set_config()` re-derives
the pending deadline from the persisted anchor timestamps.
"""
from __future__ import annotations

import math
import re
import statistics
import uuid
from datetime import timedelta

from pymongo.errors import DuplicateKeyError

from app.core import clock
from app.core.db import db
from app.core.errors import ApiError
from app.core.spec import get_spec
from app.domain import alliances, combat, notifications, progress, scheduler
from app.domain import formulas as F
from app.domain import pyramid_reward
from app.domain.settlements import new_id

NAME = "Piramide"
STATES = ("DORMANT_INITIAL", "OPEN", "REWARD_LOCK", "DORMANT")
EVENT = "PYRAMID_STATE_DEADLINE"
# Bible §20 Prestige table ("Piramide: partecipazione ciclo +50", "Alleanza vincitrice +250") and §31.8 seals — these
# live only in the prose Bible, hence they are defaults here (overridable per world like everything else).
PRESTIGE_DEFAULTS = {"participation": 50, "victory": 250}
TITLE_DEFAULT = "Signore della Piramide"
HERALDIC_DEFAULTS = {"participation": "sigillo_bronzo_piramide", "victory": "sigillo_oro_piramide"}
OVERRIDABLE = {"first_open_day", "hold_hours", "reward_days", "dormant_days", "garrison_cap_units", "reward", "guardian", "emeralds", "prestige", "title", "heraldic"}


# ------------------------------------------------------------------------------------------------ configuration
def _deep_merge(base: dict, patch: dict) -> dict:
    out = dict(base)
    for k, v in (patch or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def defaults() -> dict:
    p = get_spec().pyramid
    g = p["guardian_sampling"]
    nums = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", g["formula"])]  # "clamp(250000, 10 * median(...), 1500000)"
    mha = p["mission_hook_absorption"]
    return {
        "anchor": [int(p["anchor"][0]), int(p["anchor"][1])],
        "footprint": [int(p["visual_footprint_tiles"][0]), int(p["visual_footprint_tiles"][1])],
        "first_open_day": float(p["first_open_day"]),
        "hold_hours": float(p["hold_hours"]),
        "reward_days": float(p["reward_days"]),
        "dormant_days": float(p["dormant_days_after_reward"]),
        "garrison_cap_units": int(p["garrison_cap_units"]),
        "reward": {k: float(p["reward"][k]) for k in pyramid_reward.KEYS},
        "guardian": {
            "min_power": nums[0],
            "median_multiplier": nums[1],
            "max_power": nums[2],
            "top_n": int(g["top_n"]),
            "reference_power_per_unit": float(g["composition_reference_power_per_unit"]),
            "infantry_share": 0.45,
            "archers_share": 0.35,
        },
        "emeralds": {"participation": int(mha["alliance_first_valid_participation_per_cycle_emeralds"]), "victory": int(mha["alliance_cycle_victory_additional_emeralds"])},
        "prestige": dict(PRESTIGE_DEFAULTS),
        "title": TITLE_DEFAULT,
        "heraldic": dict(HERALDIC_DEFAULTS),
    }


def config(world: dict | None) -> dict:
    return _deep_merge(defaults(), (world or {}).get("pyramid_config") or {})


def validate_patch(patch: dict) -> dict:
    """Whitelist + type/positivity checks for an admin override (nested dicts are merged, not replaced)."""
    if not isinstance(patch, dict) or not patch:
        raise ApiError("INVALID_CONFIG", "Empty or invalid pyramid config patch", 400)
    unknown = set(patch) - OVERRIDABLE
    if unknown:
        raise ApiError("INVALID_CONFIG", "Unknown pyramid config keys", 400, {"unknown": sorted(unknown)})
    for k in ("first_open_day", "hold_hours", "reward_days", "dormant_days"):
        if k in patch and (not isinstance(patch[k], (int, float)) or patch[k] < 0):
            raise ApiError("INVALID_CONFIG", f"{k} must be a non-negative number", 400)
    if "garrison_cap_units" in patch and (not isinstance(patch["garrison_cap_units"], int) or patch["garrison_cap_units"] < 1):
        raise ApiError("INVALID_CONFIG", "garrison_cap_units must be a positive integer", 400)
    for k in ("reward", "guardian", "emeralds", "prestige", "heraldic"):
        if k in patch and not isinstance(patch[k], dict):
            raise ApiError("INVALID_CONFIG", f"{k} must be an object", 400)
    if "reward" in patch and set(patch["reward"]) - set(pyramid_reward.KEYS):
        raise ApiError("INVALID_CONFIG", "reward keys", 400, {"allowed": list(pyramid_reward.KEYS)})
    return patch


# ------------------------------------------------------------------------------------------------ state document
async def ensure_state(world: dict) -> dict:
    doc = await db().pyramid.find_one({"_id": world["_id"]})
    if doc:
        return doc
    cfg = config(world)
    now = clock.now()
    opened = clock.aware(world.get("opened_at")) or now
    opens_at = opened + timedelta(days=cfg["first_open_day"])
    epoch = uuid.uuid4().hex[:8]
    key = f"pyramid:{world['_id']}:{epoch}:open:1"
    doc = {
        "_id": world["_id"],
        "world_id": world["_id"],
        "epoch": epoch,  # part of every effect/dedupe key → QA resets never collide with earlier cycles
        "state": "DORMANT_INITIAL",
        "cycle_id": 0,
        "state_since": now,
        "deadline": opens_at,
        "deadline_key": key,
        "owner_alliance_id": None,
        "owner_tag": None,
        "owner_name": None,
        "hold_started_at": None,
        "hold_deadline": None,
        "hold_completed_at": None,
        "lock_until": None,
        "dormant_until": None,
        "garrison": {},
        "garrison_by_player": {},
        "guardian": None,
        "participants": [],
        "history": [],
        "applied": [],
        "config_snapshot": cfg,
    }
    try:
        await db().pyramid.insert_one(doc)
    except DuplicateKeyError:
        return await db().pyramid.find_one({"_id": world["_id"]})
    await scheduler.schedule(world["_id"], EVENT, opens_at, world["_id"], key, {"to": "OPEN", "cycle_id": 1})
    return doc


async def bootstrap() -> None:
    """Make sure every OPEN world has a Pyramid state + pending deadline (server start / new worlds)."""
    async for w in db().worlds.find({"status": "OPEN"}):
        await ensure_state(w)


def _key(doc: dict, *parts) -> str:
    return ":".join(["pyramid", str(doc["_id"]), str(doc.get("epoch", "0")), *[str(p) for p in parts]])


def _units_total(units: dict) -> int:
    return int(sum(int(v) for v in (units or {}).values()))


async def _reschedule(doc: dict, cfg: dict) -> dict:
    """Re-derive the pending deadline from the persisted anchors after a config change."""
    world = await db().worlds.find_one({"_id": doc["_id"]}, {"opened_at": 1})
    now = clock.now()
    sets: dict = {"config_snapshot": cfg}
    to = None
    when = None
    cycle = int(doc["cycle_id"])
    if doc["state"] == "DORMANT_INITIAL":
        when = (clock.aware((world or {}).get("opened_at")) or now) + timedelta(days=cfg["first_open_day"])
        to, payload_cycle = "OPEN", cycle + 1
    elif doc["state"] == "OPEN" and doc.get("owner_alliance_id") and doc.get("hold_started_at"):
        when = clock.aware(doc["hold_started_at"]) + timedelta(hours=cfg["hold_hours"])
        sets["hold_deadline"] = when
        to, payload_cycle = "REWARD_LOCK", cycle
    elif doc["state"] == "REWARD_LOCK" and doc.get("hold_completed_at"):
        when = clock.aware(doc["hold_completed_at"]) + timedelta(days=cfg["reward_days"])
        sets["lock_until"] = when
        sets["dormant_until"] = when + timedelta(days=cfg["dormant_days"])
        to, payload_cycle = "DORMANT", cycle
    elif doc["state"] == "DORMANT" and doc.get("lock_until"):
        when = clock.aware(doc["lock_until"]) + timedelta(days=cfg["dormant_days"])
        sets["dormant_until"] = when
        to, payload_cycle = "OPEN", cycle + 1
    if doc.get("deadline_key"):
        await scheduler.cancel(doc["deadline_key"])
    if to and when:
        key = _key(doc, to.lower(), payload_cycle, f"r{uuid.uuid4().hex[:6]}")
        sets["deadline"] = when
        sets["deadline_key"] = key
        await db().pyramid.update_one({"_id": doc["_id"]}, {"$set": sets})
        await scheduler.schedule(doc["_id"], EVENT, when, doc["_id"], key, {"to": to, "cycle_id": payload_cycle})
    else:
        sets["deadline"] = None
        sets["deadline_key"] = None
        await db().pyramid.update_one({"_id": doc["_id"]}, {"$set": sets})
    return await db().pyramid.find_one({"_id": doc["_id"]})


async def set_config(world_id: str, patch: dict) -> dict:
    """Admin override: deep-merge into worlds.pyramid_config, then re-derive the pending deadline."""
    validate_patch(patch)
    world = await db().worlds.find_one({"_id": world_id})
    if not world:
        raise ApiError("WORLD_NOT_FOUND", "World not found", 404)
    merged = _deep_merge(world.get("pyramid_config") or {}, patch)
    await db().worlds.update_one({"_id": world_id}, {"$set": {"pyramid_config": merged}})
    world["pyramid_config"] = merged
    cfg = config(world)
    doc = await ensure_state(world)
    doc = await _reschedule(doc, cfg)
    return {"config": cfg, "override": merged, "state": doc["state"], "deadline": clock.iso(doc.get("deadline"))}


async def reset(world_id: str, clear_config: bool = False, config_patch: dict | None = None) -> dict:
    """QA: drop the state doc and every pending Pyramid event, then re-create DORMANT_INITIAL from the config
    (optionally dropping the per-world override first and/or applying a new override before scheduling)."""
    await db().scheduled_events.update_many({"world_id": world_id, "type": EVENT, "status": "PENDING"}, {"$set": {"status": "CANCELLED"}})
    await db().pyramid.delete_one({"_id": world_id})
    if clear_config:
        await db().worlds.update_one({"_id": world_id}, {"$unset": {"pyramid_config": ""}})
    if config_patch:
        validate_patch(config_patch)
        w = await db().worlds.find_one({"_id": world_id}, {"pyramid_config": 1})
        if not w:
            raise ApiError("WORLD_NOT_FOUND", "World not found", 404)
        await db().worlds.update_one({"_id": world_id}, {"$set": {"pyramid_config": _deep_merge(w.get("pyramid_config") or {}, config_patch)}})
    world = await db().worlds.find_one({"_id": world_id})
    if not world:
        raise ApiError("WORLD_NOT_FOUND", "World not found", 404)
    return await ensure_state(world)


# ------------------------------------------------------------------------------------------------ guardian
async def guardian_snapshot(world_id: str, cfg: dict) -> dict:
    """spec.pyramid.guardian_sampling: top-N ACTIVE players by development_score (sum over owned settlements);
    max_legal_march_power(player) = max over settlements of War-Hall march cap × reference power per unit
    (SPEC NOTE: the spec gives no other per-unit reference; 11.35 is the Guardian's own composition reference)."""
    g = cfg["guardian"]
    per_player: dict[str, list[float]] = {}
    async for s in db().settlements.find({"world_id": world_id, "kind": "PLAYER", "owner_player_id": {"$ne": None}}, {"owner_player_id": 1, "level": 1, "buildings": 1, "research": 1}):
        pid = s["owner_player_id"]
        research = s.get("research", {}) or {}
        ds = F.development_score(int(s.get("level", 1)), s.get("buildings", {}) or {}, research)
        cap = F.war_hall_cap(int((s.get("buildings") or {}).get("Sala di Guerra", 0)), research, "ATTACK")
        cur = per_player.setdefault(pid, [0.0, 0.0])
        cur[0] += ds
        cur[1] = max(cur[1], cap * g["reference_power_per_unit"])
    active = {p["_id"] async for p in db().players.find({"world_id": world_id, "status": {"$ne": "ELIMINATED"}}, {"_id": 1})}
    sample = sorted([(v[0], v[1], pid) for pid, v in per_player.items() if pid in active], key=lambda t: (-t[0], t[2]))[: int(g["top_n"])]
    if sample:
        median = float(statistics.median([t[1] for t in sample]))
        target = min(g["max_power"], max(g["min_power"], g["median_multiplier"] * median))
    else:
        median, target = 0.0, float(g["min_power"])
    n = int(math.ceil(target / g["reference_power_per_unit"]))
    inf = int(math.floor(g["infantry_share"] * n))
    arc = int(math.floor(g["archers_share"] * n))
    cav = n - inf - arc
    return {"target_power": round(target, 2), "sample_size": len(sample), "median_max_march_power": round(median, 2), "unit_count": n, "units": {"Fanteria": inf, "Arciere": arc, "Cavalleria": cav}, "snapshot_at": clock.now()}


# ------------------------------------------------------------------------------------------------ notifications
async def _broadcast(world_id: str, state: str, doc_after: dict, extra: str) -> None:
    payload = {"state": state, "owner_alliance_id": doc_after.get("owner_alliance_id"), "owner_tag": doc_after.get("owner_tag"), "owner_name": doc_after.get("owner_name"), "deadline": clock.iso(doc_after.get("deadline")), "cycle_id": int(doc_after.get("cycle_id", 0))}
    async for p in db().players.find({"world_id": world_id, "status": {"$ne": "ELIMINATED"}}, {"_id": 1}):
        await notifications.notify(world_id, p["_id"], "PYRAMID_STATE_CHANGED", payload, dedupe_key=_key(doc_after, "ntf", payload["cycle_id"], state, extra, p["_id"]), deep_link="pyramid")


# ------------------------------------------------------------------------------------------------ transitions
@scheduler.handler(EVENT)
async def on_deadline(evt: dict) -> None:
    doc = await db().pyramid.find_one({"_id": evt["world_id"]})
    if not doc or doc.get("deadline_key") != evt["effect_key"]:
        return  # rescheduled / already applied
    to = evt["payload"].get("to")
    if to == "OPEN":
        await _open(doc)
    elif to == "REWARD_LOCK":
        await _complete_hold(doc)
    elif to == "DORMANT":
        await _to_dormant(doc)


async def _open(doc: dict) -> None:
    world = await db().worlds.find_one({"_id": doc["_id"]})
    cfg = config(world)
    guardian = await guardian_snapshot(doc["_id"], cfg)
    cycle = int(doc["cycle_id"]) + 1
    now = clock.now()
    res = await db().pyramid.update_one(
        {"_id": doc["_id"], "state": {"$in": ["DORMANT_INITIAL", "DORMANT"]}},
        {
            "$set": {
                "state": "OPEN",
                "cycle_id": cycle,
                "state_since": now,
                "deadline": None,
                "deadline_key": None,
                "owner_alliance_id": None,
                "owner_tag": None,
                "owner_name": None,
                "hold_started_at": None,
                "hold_deadline": None,
                "hold_completed_at": None,
                "garrison": guardian["units"],
                "garrison_by_player": {},
                "guardian": guardian,
                "participants": [],
                "config_snapshot": cfg,
            }
        },
    )
    if res.modified_count != 1:
        return
    fresh = await db().pyramid.find_one({"_id": doc["_id"]})
    await progress.chronicle(doc["_id"], "PYRAMID_OPEN", {"cycle_id": cycle, "guardian_power": guardian["target_power"], "guardian_units": guardian["unit_count"]}, [], ref=_key(doc, "chr_open", cycle))
    await _broadcast(doc["_id"], "OPEN", fresh, "open")


async def _complete_hold(doc: dict) -> None:
    """168h continuous control → REWARD_LOCK: membership snapshot, rewards, Chronicle."""
    if doc["state"] != "OPEN" or not doc.get("owner_alliance_id"):
        return
    a = await db().alliances.find_one({"_id": doc["owner_alliance_id"], "status": "ACTIVE"})
    if not a:
        await _neutralize(doc, "OWNER_DISSOLVED")
        return
    cfg = doc.get("config_snapshot") or config(await db().worlds.find_one({"_id": doc["_id"]}))
    now = clock.now()
    cycle = int(doc["cycle_id"])
    lock_until = now + timedelta(days=cfg["reward_days"])
    dormant_until = lock_until + timedelta(days=cfg["dormant_days"])
    key = _key(doc, "dormant", cycle)
    members = [m["player_id"] for m in a.get("members", [])]
    winner = {"cycle_id": cycle, "alliance_id": a["_id"], "tag": a["tag"], "name": a["name"], "won_at": now, "reward_until": lock_until, "members": members, "member_count": len(members), "hold_started_at": doc.get("hold_started_at")}
    res = await db().pyramid.update_one(
        {"_id": doc["_id"], "state": "OPEN", "owner_alliance_id": a["_id"]},
        {"$set": {"state": "REWARD_LOCK", "state_since": now, "hold_completed_at": now, "lock_until": lock_until, "dormant_until": dormant_until, "deadline": lock_until, "deadline_key": key, "winner": winner}, "$push": {"history": {"$each": [winner], "$slice": -50}}},
    )
    if res.modified_count != 1:
        return
    await scheduler.schedule(doc["_id"], EVENT, lock_until, doc["_id"], key, {"to": "DORMANT", "cycle_id": cycle})
    reward = {"cycle_id": cycle, "alliance_id": a["_id"], "tag": a["tag"], "until": lock_until, "granted_at": now, **cfg["reward"]}
    ref = _key(doc, "victory", cycle)
    for pid in members:
        await db().players.update_one({"_id": pid}, {"$set": {"pyramid_reward": reward}, "$addToSet": {"titles": cfg["title"], "cosmetics": cfg["heraldic"]["victory"]}, "$push": {"house_history": {"$each": [{"at": now, "kind": "PYRAMID_VICTORY", "cycle_id": cycle, "alliance": a["tag"]}], "$slice": -progress.HISTORY_CAP}}})
        await db().settlements.update_many({"world_id": doc["_id"], "owner_player_id": pid}, {"$set": {"pyramid_reward": reward}})
        await progress.award_prestige(doc["_id"], pid, int(cfg["prestige"]["victory"]), "pyramid_victory", ref)
    await alliances.credit_emeralds(doc["_id"], a["_id"], int(cfg["emeralds"]["victory"]), "pyramid_victory", ref)
    await db().alliances.update_one({"_id": a["_id"]}, {"$inc": {"pyramid_victories": 1}, "$push": {"pyramid_titles": {"$each": [{"cycle_id": cycle, "at": now}], "$slice": -50}}})
    await progress.chronicle(doc["_id"], "PYRAMID_WON", {"cycle_id": cycle, "alliance_id": a["_id"], "tag": a["tag"], "name": a["name"], "members": len(members), "reward_until": clock.iso(lock_until)}, members, ref=f"chr_won:{ref}")
    fresh = await db().pyramid.find_one({"_id": doc["_id"]})
    await _broadcast(doc["_id"], "REWARD_LOCK", fresh, "lock")


async def _to_dormant(doc: dict) -> None:
    if doc["state"] != "REWARD_LOCK":
        return
    cfg = doc.get("config_snapshot") or defaults()
    cycle = int(doc["cycle_id"])
    dormant_until = clock.aware(doc.get("dormant_until")) or (clock.aware(doc.get("lock_until")) or clock.now()) + timedelta(days=cfg["dormant_days"])
    key = _key(doc, "open", cycle + 1)
    res = await db().pyramid.update_one(
        {"_id": doc["_id"], "state": "REWARD_LOCK"},
        {"$set": {"state": "DORMANT", "state_since": clock.now(), "deadline": dormant_until, "deadline_key": key, "dormant_until": dormant_until, "garrison": {}, "garrison_by_player": {}, "hold_started_at": None, "hold_deadline": None, "owner_alliance_id": None, "owner_tag": None, "owner_name": None}},
    )
    if res.modified_count != 1:
        return
    await scheduler.schedule(doc["_id"], EVENT, dormant_until, doc["_id"], key, {"to": "OPEN", "cycle_id": cycle + 1})
    await _return_garrison(doc, f"lock_end:{cycle}")
    fresh = await db().pyramid.find_one({"_id": doc["_id"]})
    await _broadcast(doc["_id"], "DORMANT", fresh, "dormant")


async def _neutralize(doc: dict, reason: str) -> None:
    """Owner Alliance gone while holding: Pyramid neutral, hold timer 0, living troops go home (Bible §21)."""
    if doc.get("deadline_key"):
        await scheduler.cancel(doc["deadline_key"])
    res = await db().pyramid.update_one(
        {"_id": doc["_id"], "state": "OPEN", "owner_alliance_id": doc.get("owner_alliance_id")},
        {"$set": {"owner_alliance_id": None, "owner_tag": None, "owner_name": None, "hold_started_at": None, "hold_deadline": None, "deadline": None, "deadline_key": None, "garrison": {}, "garrison_by_player": {}, "neutralized_reason": reason}},
    )
    if res.modified_count != 1:
        return
    await _return_garrison(doc, f"neutralized:{doc['cycle_id']}:{doc.get('owner_alliance_id')}")
    fresh = await db().pyramid.find_one({"_id": doc["_id"]})
    await progress.chronicle(doc["_id"], "PYRAMID_NEUTRALIZED", {"cycle_id": doc["cycle_id"], "alliance_id": doc.get("owner_alliance_id"), "tag": doc.get("owner_tag"), "reason": reason}, [], ref=_key(doc, "chr_neutral", doc["cycle_id"], doc.get("owner_alliance_id")))
    await _broadcast(doc["_id"], "OPEN", fresh, f"neutral:{doc.get('owner_alliance_id')}")


async def on_alliance_dissolved(a: dict) -> None:
    doc = await db().pyramid.find_one({"_id": a["world_id"]})
    if not doc or doc.get("owner_alliance_id") != a["_id"]:
        return
    if doc["state"] == "OPEN":
        await _neutralize(doc, "ALLIANCE_DISSOLVED")
    elif doc["state"] == "REWARD_LOCK":
        # snapshot members keep their personal reward; the Alliance title is archived (history already holds it);
        # the garrison no longer has an owner → troops go home now
        await db().pyramid.update_one({"_id": doc["_id"], "state": "REWARD_LOCK"}, {"$set": {"garrison": {}, "garrison_by_player": {}, "owner_dissolved_at": clock.now()}})
        await _return_garrison(doc, f"winner_dissolved:{doc['cycle_id']}")


async def _return_garrison(doc: dict, ref: str) -> None:
    """Living garrison troops return to their owners by REAL marches (spec.pyramid.garrison_lifecycle.on_reward_lock)."""
    from app.domain.pathfinding import astar, load_terrain  # local: keeps this module import-light

    cfg = doc.get("config_snapshot") or defaults()
    ax, ay = cfg["anchor"]
    spec = get_spec()
    grid = None
    for pid, units in (doc.get("garrison_by_player") or {}).items():
        units = {u: int(c) for u, c in (units or {}).items() if int(c) > 0}
        if not units:
            continue
        effect = _key(doc, "return", ref, pid)
        if await db().marches.find_one({"effect_key": effect}):
            continue
        p = await db().players.find_one({"_id": pid})
        dest = await db().settlements.find_one({"_id": (p or {}).get("mother_settlement_id"), "owner_player_id": pid}) if p else None
        if not dest:
            dest = await db().settlements.find_one({"world_id": doc["_id"], "owner_player_id": pid, "kind": "PLAYER"})
        if not dest:
            continue  # eliminated player: troops disband
        grid = grid if grid is not None else await load_terrain(doc["_id"])
        result = astar(grid, (dest["x"], dest["y"]), (ax, ay), naval=False)
        path = [[x, y] for x, y in result[0]] if result else [[dest["x"], dest["y"]], [ax, ay]]
        cost = result[1] if result else max(abs(dest["x"] - ax), abs(dest["y"] - ay))
        speed = F.formation_speed_tph(units, {}, spec)
        eta = F.march_eta_seconds(cost, speed, spec)
        now = clock.now()
        march = {
            "_id": new_id("mar"),
            "effect_key": effect,
            "world_id": doc["_id"],
            "player_id": pid,
            "house_name": (p or {}).get("house_name"),
            "house_crest": (p or {}).get("house_crest"),
            "origin_settlement_id": dest["_id"],
            "origin_xy": [dest["x"], dest["y"]],
            "target_settlement_id": None,
            "target_sentinel_id": None,
            "target_pyramid": True,
            "target_xy": [ax, ay],
            "target_name": NAME,
            "target_terrain": "plain",
            "mission": "REINFORCE",
            "units": units,
            "ships": 0,
            "naval": False,
            "path": path,
            "path_cost": cost,
            "speed_tph": speed,
            "eta_seconds": eta,
            "departed_at": now,
            "arrival_at": now,
            "return_at": now + timedelta(seconds=eta),
            "status": "RETURNING",
            "result": "PYRAMID_RELEASED",
            "research_snapshot": {},
            "spec_version": spec.version,
        }
        await db().marches.insert_one(march)
        await db().settlements.update_one({"_id": dest["_id"]}, {"$inc": {"outgoing_active": 1}})  # released by marches._complete
        await scheduler.schedule(doc["_id"], "MARCH_RETURN_OR_RECALL", march["return_at"], march["_id"], f"march_return:{march['_id']}", {"march_id": march["_id"]})
        await notifications.notify(doc["_id"], pid, "MARCH_RETURNED", {"march_id": march["_id"], "eta_or_completed": clock.iso(march["return_at"]), "destination": dest["_id"], "units": units, "reason": "PYRAMID_RELEASED"}, dedupe_key=f"pyr_release:{march['_id']}", deep_link="map/march")


# ------------------------------------------------------------------------------------------------ marches
async def validate_launch(world: dict, player: dict, mission: str) -> tuple[dict, dict]:
    """Launch-time legality of a Pyramid march: OPEN state, Structured Alliance, mission vs current owner."""
    doc = await ensure_state(world)
    if mission not in ("ATTACK", "REINFORCE"):
        raise ApiError("INVALID_MISSION", "The Pyramid accepts ATTACK or REINFORCE only", 400)
    if doc["state"] != "OPEN":
        raise ApiError("PYRAMID_NOT_OPEN", "The Pyramid is not contestable now", 409, {"state": doc["state"], "deadline": clock.iso(doc.get("deadline"))})
    a = await alliances.mine(player)
    if not a or a["kind"] != alliances.STRUCTURED:
        raise ApiError("PYRAMID_NOT_ELIGIBLE", "Only members of a Structured Alliance can contest the Pyramid", 409)
    owner = doc.get("owner_alliance_id")
    if mission == "ATTACK" and owner == a["_id"]:
        raise ApiError("CANNOT_ATTACK_OWN", "Your Alliance already holds the Pyramid — send REINFORCE", 409)
    if mission == "REINFORCE" and owner != a["_id"]:
        raise ApiError("INVALID_TARGET", "REINFORCE the Pyramid only while your Alliance holds it", 409)
    if mission == "REINFORCE" and _units_total(doc.get("garrison")) >= int((doc.get("config_snapshot") or config(world))["garrison_cap_units"]):
        raise ApiError("PYRAMID_GARRISON_CAP", "Pyramid garrison cap reached", 409, {"cap": (doc.get("config_snapshot") or config(world))["garrison_cap_units"]})
    return doc, a


def _split_losses(by_player: dict[str, dict], losses: dict[str, int]) -> dict[str, dict]:
    """Distribute garrison losses per unit proportionally across contributors (largest remainder)."""
    out = {pid: {u: int(c) for u, c in (units or {}).items()} for pid, units in by_player.items()}
    for u, lost in losses.items():
        lost = int(lost)
        if lost <= 0:
            continue
        pids = [pid for pid in out if int(out[pid].get(u, 0)) > 0]
        if not pids:
            continue
        alloc = F.largest_remainder(lost, [float(out[pid][u]) for pid in pids])
        for pid, n in zip(pids, alloc):
            out[pid][u] = max(0, int(out[pid][u]) - int(n))
    return {pid: {u: c for u, c in units.items() if c > 0} for pid, units in out.items() if any(c > 0 for c in units.values())}


async def on_arrival(march: dict) -> None:
    """BATTLE_OR_FLEET_ARRIVAL for a Pyramid-targeted march (called by marches.on_arrival)."""
    from app.domain import marches  # local: marches imports this module

    units = {u: int(c) for u, c in (march.get("units") or {}).items() if int(c) > 0}
    world = await db().worlds.find_one({"_id": march["world_id"]})
    doc = await ensure_state(world)
    player = await db().players.find_one({"_id": march["player_id"]})
    a = await alliances.mine(player) if player else None
    if doc["state"] != "OPEN":
        await marches._start_return(march, units, "PYRAMID_CLOSED")
        return
    if not a or a["kind"] != alliances.STRUCTURED:
        await marches._start_return(march, units, "TARGET_INVALID")
        return
    cfg = doc.get("config_snapshot") or config(world)
    owner = doc.get("owner_alliance_id")
    now = clock.now()

    if march["mission"] == "REINFORCE":
        if owner != a["_id"]:
            await marches._start_return(march, units, "TARGET_INVALID")
            return
        effect = f"reinforce:{march['_id']}"
        room = max(0, int(cfg["garrison_cap_units"]) - _units_total(doc.get("garrison")))
        accepted: dict[str, int] = {}
        for u, c in units.items():
            take = min(c, room)
            if take > 0:
                accepted[u] = take
                room -= take
        excess = {u: c - accepted.get(u, 0) for u, c in units.items() if c - accepted.get(u, 0) > 0}
        if accepted:
            inc = {f"garrison.{u}": c for u, c in accepted.items()}
            inc.update({f"garrison_by_player.{march['player_id']}.{u}": c for u, c in accepted.items()})
            await db().pyramid.update_one({"_id": doc["_id"], "state": "OPEN", "owner_alliance_id": a["_id"], "applied": {"$ne": effect}}, {"$inc": inc, "$push": {"applied": {"$each": [effect], "$slice": -500}}})
        if excess:
            await marches._start_return(march, excess, "PYRAMID_GARRISON_CAP")
        else:
            await marches._complete(march, "PYRAMID_REINFORCED")
        await notifications.notify(march["world_id"], march["player_id"], "MARCH_ARRIVED", {"march_id": march["_id"], "result": "PYRAMID_REINFORCED", "accepted": accepted, "returned": excess, "new_position_or_return_state": "pyramid"}, dedupe_key=f"arrived:{march['_id']}", deep_link="pyramid")
        return

    # ---- ATTACK ----
    if owner == a["_id"]:
        await marches._start_return(march, units, "TARGET_NOW_OWN")
        return
    battle_id = f"btl_{march['_id']}"
    existing = await db().battles.find_one({"_id": battle_id})
    garrison = {u: int(c) for u, c in (doc.get("garrison") or {}).items() if int(c) > 0}
    if existing:
        report = existing["report"]
    else:
        report = combat.resolve_battle(battle_id, "ATTACK", units, march.get("research_snapshot", {}), march.get("specialization"), garrison, {}, None, "plain", None, defender_kind="PYRAMID", attacker_bonus_atk_pct=0.0)
    survivors = report["attacker_survivors"]
    contributors = list((doc.get("garrison_by_player") or {}).keys())
    cycle = int(doc["cycle_id"])
    ref = _key(doc, "participation", cycle)

    # participation (first valid attack of the Alliance in this cycle → Emeralds; player → Prestige + bronze seal)
    await db().pyramid.update_one({"_id": doc["_id"], "cycle_id": cycle}, {"$addToSet": {"participants": a["_id"]}})
    await alliances.credit_emeralds(doc["_id"], a["_id"], int(cfg["emeralds"]["participation"]), "pyramid_participation", ref)
    await progress.award_prestige(doc["_id"], march["player_id"], int(cfg["prestige"]["participation"]), "pyramid_participation", ref)
    await db().players.update_one({"_id": march["player_id"]}, {"$addToSet": {"cosmetics": cfg["heraldic"]["participation"]}})

    captured = False
    if report["winner"] == "ATTACKER":
        hold_deadline = now + timedelta(hours=float(cfg["hold_hours"]))
        key = _key(doc, "reward_lock", cycle, battle_id)
        if doc.get("deadline_key"):
            await scheduler.cancel(doc["deadline_key"])
        res = await db().pyramid.update_one(
            {"_id": doc["_id"], "state": "OPEN", "applied": {"$ne": battle_id}},
            {
                "$set": {"owner_alliance_id": a["_id"], "owner_tag": a["tag"], "owner_name": a["name"], "hold_started_at": now, "hold_deadline": hold_deadline, "deadline": hold_deadline, "deadline_key": key, "garrison": survivors, "garrison_by_player": {march["player_id"]: survivors} if survivors else {}, "captured_by_player_id": march["player_id"]},
                "$push": {"applied": {"$each": [battle_id], "$slice": -500}},
            },
        )
        captured = res.modified_count == 1
        if captured:
            await scheduler.schedule(doc["_id"], EVENT, hold_deadline, doc["_id"], key, {"to": "REWARD_LOCK", "cycle_id": cycle})
            await progress.chronicle(doc["_id"], "PYRAMID_CAPTURED", {"cycle_id": cycle, "alliance_id": a["_id"], "tag": a["tag"], "name": a["name"], "player_id": march["player_id"], "previous_alliance_id": owner, "previous_tag": doc.get("owner_tag"), "hold_deadline": clock.iso(hold_deadline)}, [march["player_id"]], ref=f"pyr_cap:{battle_id}")
    else:
        by_player = _split_losses(doc.get("garrison_by_player") or {}, report["defender_losses"])
        new_garrison = {u: int(c) for u, c in report["defender_survivors"].items() if int(c) > 0}
        await db().pyramid.update_one({"_id": doc["_id"], "state": "OPEN", "applied": {"$ne": battle_id}}, {"$set": {"garrison": new_garrison, "garrison_by_player": by_player}, "$push": {"applied": {"$each": [battle_id], "$slice": -500}}})

    # battle report (participants: attacker + every garrison contributor of the defending Alliance)
    participants = sorted({march["player_id"], *contributors})
    bdoc = {
        "_id": battle_id,
        "world_id": march["world_id"],
        "march_id": march["_id"],
        "attacker_player_id": march["player_id"],
        "attacker_alliance_id": a["_id"],
        "attacker_alliance_tag": a["tag"],
        "attacker_house_name": march.get("house_name"),
        "defender_player_id": None,
        "defender_alliance_id": owner,
        "defender_alliance_tag": doc.get("owner_tag"),
        "participants": participants,
        "target_settlement_id": None,
        "target_sentinel_id": None,
        "target_pyramid": True,
        "pyramid_epoch": doc.get("epoch"),
        "pyramid_cycle_id": cycle,
        "origin_settlement_id": march.get("origin_settlement_id"),
        "target_name": NAME,
        "target_xy": march.get("target_xy"),
        "mission": "ATTACK",
        "report": report,
        "loot": None,
        "ownership_result": {"changed": captured, "pyramid": True, "cycle_id": cycle, "new_owner_alliance_id": a["_id"] if captured else owner},
        "loyalty": None,
        "attacker_research_snapshot": march.get("research_snapshot", {}),
        "ships_excluded": 0,
        "created_at": now,
    }
    try:
        await db().battles.insert_one(bdoc)
    except Exception:  # replay: report already persisted
        pass
    await db().marches.update_one({"_id": march["_id"]}, {"$set": {"battle_id": battle_id}})
    await progress.on_battle(bdoc)
    for pid in participants:
        mine_att = pid == march["player_id"]
        await notifications.notify(march["world_id"], pid, "BATTLE_REPORT_READY", {"battle_id": battle_id, "seed": report["seed"], "winner": report["winner"], "mission": "ATTACK", "target_name": NAME, "losses": report["attacker_losses"] if mine_att else report["defender_losses"], "survivors": report["attacker_survivors"] if mine_att else report["defender_survivors"], "counter_summary": None, "loot": None, "ownership_changed": captured}, dedupe_key=f"battle_ready:{battle_id}:{pid}", deep_link="battle-reports")

    if captured:
        await marches._complete(march, "PYRAMID_CAPTURED")  # survivors stay as garrison
        fresh = await db().pyramid.find_one({"_id": doc["_id"]})
        await _broadcast(doc["_id"], "OPEN", fresh, f"owner:{battle_id}")
    elif survivors:
        await marches._start_return(march, survivors, report["winner"])
    else:
        await marches._complete(march, "ANNIHILATED")


# ------------------------------------------------------------------------------------------------ DTO
def _pct(a, b) -> float:
    return 0.0 if not b else max(0.0, min(1.0, a / b))


async def status(world: dict, player: dict) -> dict:
    doc = await ensure_state(world)
    cfg = config(world)
    now = clock.now()
    a = await alliances.mine(player)
    my_aid = a["_id"] if a else None
    eligible = bool(a and a["kind"] == alliances.STRUCTURED)
    owner = doc.get("owner_alliance_id")
    is_owner = bool(my_aid and owner == my_aid)
    garrison = {u: int(c) for u, c in (doc.get("garrison") or {}).items() if int(c) > 0}
    hold_started = clock.aware(doc.get("hold_started_at"))
    hold_deadline = clock.aware(doc.get("hold_deadline"))
    reward = pyramid_reward.active(player)
    battles = []
    async for b in db().battles.find({"world_id": world["_id"], "target_pyramid": True, "pyramid_epoch": doc.get("epoch")}).sort("created_at", -1).limit(8):
        rep = b.get("report") or {}
        battles.append(
            {
                "battle_id": b["_id"],
                "at": clock.iso(b["created_at"]),
                "attacker_house_name": b.get("attacker_house_name"),
                "attacker_alliance_tag": b.get("attacker_alliance_tag"),
                "defender_alliance_tag": b.get("defender_alliance_tag"),
                "winner": rep.get("winner"),
                "captured": bool((b.get("ownership_result") or {}).get("changed")),
                "attacker_losses": _units_total(rep.get("attacker_losses")),
                "defender_losses": _units_total(rep.get("defender_losses")),
                "mine": player["_id"] in (b.get("participants") or []),
            }
        )
    incoming = []
    if is_owner:
        async for m in db().marches.find({"world_id": world["_id"], "target_pyramid": True, "mission": "ATTACK", "status": "OUTBOUND"}).sort("arrival_at", 1).limit(20):
            incoming.append({"march_id": m["_id"], "house_name": m.get("house_name"), "arrival_at": clock.iso(m.get("arrival_at")), "units_total": _units_total(m.get("units"))})
    my_garrison = {u: int(c) for u, c in ((doc.get("garrison_by_player") or {}).get(player["_id"]) or {}).items() if int(c) > 0}
    show_composition = owner is None or is_owner
    return {
        "world_id": world["_id"],
        "name": NAME,
        "anchor": cfg["anchor"],
        "footprint": cfg["footprint"],
        "state": doc["state"],
        "cycle_id": int(doc["cycle_id"]),
        "state_since": clock.iso(doc.get("state_since")),
        "deadline": clock.iso(doc.get("deadline")),
        "opens_at": clock.iso(doc.get("deadline")) if doc["state"] in ("DORMANT_INITIAL", "DORMANT") else None,
        "lock_until": clock.iso(doc.get("lock_until")),
        "dormant_until": clock.iso(doc.get("dormant_until")),
        "owner": {"alliance_id": owner, "tag": doc.get("owner_tag"), "name": doc.get("owner_name")} if owner else None,
        "faction": "OWN" if is_owner else ("ENEMY" if owner else "NEUTRAL"),
        "hold": {"started_at": clock.iso(hold_started), "deadline": clock.iso(hold_deadline), "hours": cfg["hold_hours"], "progress": _pct((now - hold_started).total_seconds(), (hold_deadline - hold_started).total_seconds()) if hold_started and hold_deadline else 0.0} if owner and doc["state"] == "OPEN" else None,
        "garrison_total": _units_total(garrison),
        "garrison": garrison if show_composition else None,
        "garrison_cap": int(cfg["garrison_cap_units"]),
        "guardian": {"target_power": (doc.get("guardian") or {}).get("target_power"), "unit_count": (doc.get("guardian") or {}).get("unit_count"), "sample_size": (doc.get("guardian") or {}).get("sample_size")} if doc.get("guardian") else None,
        "participants": len(doc.get("participants") or []),
        "winner": {**{k: doc["winner"][k] for k in ("cycle_id", "alliance_id", "tag", "name", "member_count")}, "won_at": clock.iso(doc["winner"].get("won_at")), "reward_until": clock.iso(doc["winner"].get("reward_until"))} if doc.get("winner") and doc["state"] in ("REWARD_LOCK", "DORMANT") else None,
        "history": [{"cycle_id": h["cycle_id"], "alliance_id": h["alliance_id"], "tag": h["tag"], "name": h["name"], "member_count": h.get("member_count", len(h.get("members", []))), "won_at": clock.iso(h.get("won_at")), "reward_until": clock.iso(h.get("reward_until"))} for h in reversed(doc.get("history") or [])][:10],
        "recent_battles": battles,
        "incoming": incoming,
        "me": {
            "alliance_id": my_aid,
            "alliance_kind": a["kind"] if a else None,
            "eligible": eligible,
            "is_owner": is_owner,
            "can_attack": eligible and doc["state"] == "OPEN" and not is_owner,
            "can_reinforce": eligible and doc["state"] == "OPEN" and is_owner and _units_total(garrison) < int(cfg["garrison_cap_units"]),
            "participated": bool(my_aid and my_aid in (doc.get("participants") or [])),
            "my_garrison": my_garrison,
            "reward": {**{k: reward[k] for k in pyramid_reward.KEYS}, "until": clock.iso(reward.get("until")), "cycle_id": reward.get("cycle_id"), "tag": reward.get("tag")} if reward else None,
        },
        "config": {"first_open_day": cfg["first_open_day"], "hold_hours": cfg["hold_hours"], "reward_days": cfg["reward_days"], "dormant_days": cfg["dormant_days"], "garrison_cap_units": cfg["garrison_cap_units"], "reward": cfg["reward"], "emeralds": cfg["emeralds"], "prestige": cfg["prestige"], "title": cfg["title"]},
        "server_time": clock.iso(now),
    }
