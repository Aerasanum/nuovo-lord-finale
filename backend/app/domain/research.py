"""Research runtime: 114 nodes / 12 branches, 2 queues per settlement, settlement-local effects applied once."""
from __future__ import annotations

from datetime import timedelta

from app.core import clock
from app.core.db import db
from app.core.errors import ApiError, insufficient_resources, queue_full
from app.core.spec import get_spec
from app.domain import economy, notifications, scheduler
from app.domain import formulas as F
from app.domain.pyramid_reward import bonus_pct
from app.domain.settlements import new_id


def validate_dag() -> dict:
    """Every prerequisite resolves and the DAG has no cycles (mandatory test 7)."""
    spec = get_spec()
    graph = {k: spec.research_prereqs(k) for k in spec.research_by_key}
    for k, ps in graph.items():
        for p in ps:
            if p not in graph:
                raise RuntimeError(f"BLOCKED_SPEC_DIVERGENCE unresolved prerequisite {p} for {k}")
    color: dict[str, int] = {}

    def visit(n: str) -> None:
        if color.get(n) == 1:
            raise RuntimeError(f"BLOCKED_SPEC_DIVERGENCE cycle at {n}")
        if color.get(n) == 2:
            return
        color[n] = 1
        for p in graph[n]:
            visit(p)
        color[n] = 2

    for k in graph:
        visit(k)
    return {"nodes": len(graph), "branches": len(spec.research_branches), "acyclic": True}


async def start_research(doc: dict, player: dict, key: str, idempotency_key: str | None) -> dict:
    spec = get_spec()
    node = spec.research_by_key.get(key)
    if not node:
        raise ApiError("UNKNOWN_RESEARCH", "Unknown research key", 404, {"key": key})
    if idempotency_key:
        existing = await db().jobs.find_one({"world_id": doc["world_id"], "player_id": player["_id"], "idempotency_key": idempotency_key})
        if existing:
            return existing
    research = doc.get("research", {})
    cur = F.rget(research, key)
    if cur >= int(node["max_level"]):
        raise ApiError("RESEARCH_MAXED", "Research already at max level", 409)
    uni = int(doc["buildings"].get("Universita", 0))
    if uni < int(node["required_university_level"]) or int(doc["level"]) < int(node["required_settlement_level"]):
        raise ApiError("RESEARCH_LOCKED", "University / settlement level too low", 409, {"required_university_level": node["required_university_level"], "required_settlement_level": node["required_settlement_level"]})
    for p in spec.research_prereqs(key):
        if F.rget(research, p) < 1:
            raise ApiError("RESEARCH_PREREQUISITE_MISSING", "Prerequisite research missing", 409, {"prerequisite": p})
    quote = F.research_cost_time(node["cost_class"], cur + 1, research, spec, speed_bonus_pct=bonus_pct(doc)["research_pct"])
    cost = quote["cost"]
    queues = int(spec.research_scope["queues_per_settlement"])
    flt: dict = {"_id": doc["_id"], "research_active": {"$not": {"$gte": queues}}, "busy_research": {"$ne": key}}
    inc: dict = {"research_active": 1}
    for r, v in cost.items():
        if v > 0:
            flt[f"resources.{r}"] = {"$gte": int(v)}
            inc[f"resources.{r}"] = -int(v)
    res = await db().settlements.find_one_and_update(flt, {"$inc": inc, "$addToSet": {"busy_research": key}})
    if res is None:
        fresh = await db().settlements.find_one({"_id": doc["_id"]})
        if int(fresh.get("research_active", 0)) >= queues:
            raise queue_full()
        if key in fresh.get("busy_research", []):
            raise ApiError("TARGET_BUSY", "This research is already in progress", 409)
        raise insufficient_resources(economy.missing_for(fresh, cost))
    now = clock.now()
    ends = now + timedelta(minutes=int(quote["duration_min"]))
    job = {
        "_id": new_id("job"),
        "world_id": doc["world_id"],
        "player_id": player["_id"],
        "settlement_id": doc["_id"],
        "kind": "RESEARCH",
        "queue": "research",
        "target": key,
        "target_level": cur + 1,
        "started_at": now,
        "ends_at": ends,
        "status": "RUNNING",
        "cost_snapshot": cost,
        "modifiers_snapshot": {"research_time_reduction": quote["research_time_reduction"], "base_time_min": quote["base_time_min"], "cost_class": node["cost_class"], "spec_version": spec.version},
        "idempotency_key": idempotency_key,
    }
    await db().jobs.insert_one(job)
    await scheduler.schedule(doc["world_id"], "BUILD_RESEARCH_RECRUIT_COMPLETE", ends, doc["_id"], f"job_complete:{job['_id']}", {"job_id": job["_id"]})
    await notifications.notify(doc["world_id"], player["_id"], "RESEARCH_JOB_STATE",
                               {"research_key": key, "level": cur + 1, "state": "STARTED", "eta": clock.iso(ends), "effect": node["effect"], "unlocks": None, "settlement_id": doc["_id"]},
                               dedupe_key=f"job_started:{job['_id']}", deep_link="research")
    return job


async def apply_complete(job: dict) -> None:
    doc = await db().settlements.find_one({"_id": job["settlement_id"]})
    if not doc or job["_id"] in doc.get("applied_effects", []):
        return
    key = job["target"]
    new_level = int(job["target_level"])
    research = dict(doc.get("research", {}))
    research[F.enc(key)] = new_level
    sets = {f"research.{F.enc(key)}": new_level}
    # research affecting wall HP recomputes max_hp while preserving missing HP
    if key.startswith("defense.wall_engineering"):
        from app.domain.construction import _wall_update_fields

        sets.update(_wall_update_fields(doc, int(doc["buildings"].get("Mura", 0)), research))
    await db().settlements.update_one(
        {"_id": doc["_id"], "applied_effects": {"$ne": job["_id"]}},
        {"$set": sets, "$inc": {"research_active": -1}, "$pull": {"busy_research": key}, "$push": {"applied_effects": {"$each": [job["_id"]], "$slice": -500}}},
    )
    node = get_spec().research_by_key[key]
    await notifications.notify(doc["world_id"], doc.get("owner_player_id"), "RESEARCH_JOB_STATE",
                               {"research_key": key, "level": new_level, "state": "COMPLETED", "eta": None, "effect": node["effect"], "unlocks": None, "settlement_id": doc["_id"]},
                               dedupe_key=f"job_done:{job['_id']}", deep_link="research")
