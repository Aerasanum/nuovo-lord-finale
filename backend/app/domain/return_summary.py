"""«Riepilogo rientro» — what happened while the Player was away.

`inactivity.touch` notices a gap ≥ RETURN_GAP_H hours between two authenticated requests and stores the previous
activity timestamp in `players.return_since` (+ `return_pending`). The client then asks for the digest of that window
(battles, castles lost/won, finished queues, marches back home, missions, resources produced, important alerts) and
dismisses it once (`/return-summary/seen`). Everything is read from existing collections — no new event stream.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from app.core import clock
from app.core.db import db
from app.domain import economy
from app.domain import formulas as F

RETURN_GAP_H = 6.0


def _iso(d) -> str | None:
    return clock.iso(d) if d else None


async def build(world: dict, player: dict, since: datetime) -> dict:
    pid = player["_id"]
    wid = world["_id"]
    now = clock.now()
    hours = max(0.0, (now - since).total_seconds() / 3600.0)

    # ---- battles (attacker or defender) ----
    battles = {"total": 0, "won": 0, "lost": 0, "as_attacker": 0, "as_defender": 0, "castles_won": [], "castles_lost": [], "recent": []}
    async for b in db().battles.find({"world_id": wid, "created_at": {"$gte": since}, "$or": [{"attacker_player_id": pid}, {"defender_player_id": pid}]}).sort("created_at", -1).limit(200):
        attacker = b.get("attacker_player_id") == pid
        winner = (b.get("report") or {}).get("winner")
        won = (winner == "ATTACKER") == attacker
        battles["total"] += 1
        battles["won" if won else "lost"] += 1
        battles["as_attacker" if attacker else "as_defender"] += 1
        own = (b.get("ownership_result") or {}).get("changed")
        if own:
            (battles["castles_won"] if attacker else battles["castles_lost"]).append({"settlement_id": b.get("target_settlement_id"), "name": b.get("target_name"), "xy": b.get("target_xy"), "battle_id": b["_id"]})
        if len(battles["recent"]) < 5:
            battles["recent"].append({"battle_id": b["_id"], "mission": b.get("mission"), "attacker": attacker, "won": won, "target_name": b.get("target_name"), "at": _iso(b.get("created_at"))})

    # ---- finished queues ----
    jobs = {"BUILDING": [], "RESEARCH": [], "RECRUIT": [], "SETTLEMENT": []}
    async for j in db().jobs.find({"player_id": pid, "status": "COMPLETED", "completed_at": {"$gte": since}}).sort("completed_at", -1).limit(300):
        kind = j.get("kind")
        if kind in jobs and len(jobs[kind]) < 8:
            jobs[kind].append({"target": j.get("target"), "level": j.get("target_level"), "count": j.get("count"), "settlement_id": j.get("settlement_id")})
    job_counts = {k: await db().jobs.count_documents({"player_id": pid, "status": "COMPLETED", "completed_at": {"$gte": since}, "kind": k}) for k in jobs}

    # ---- marches back home / arrived ----
    marches = {"completed": 0, "results": {}}
    async for m in db().marches.find({"player_id": pid, "status": "COMPLETED", "completed_at": {"$gte": since}}, {"result": 1, "mission": 1}):
        marches["completed"] += 1
        r = m.get("result") or "RETURNED"
        marches["results"][r] = marches["results"].get(r, 0) + 1
    marches["active"] = await db().marches.count_documents({"player_id": pid, "status": {"$in": ["OUTBOUND", "RESOLVING", "RETURNING"]}})
    incoming = await db().marches.count_documents({"world_id": wid, "status": {"$in": ["OUTBOUND", "RESOLVING"]}, "mission": {"$in": ["ATTACK", "RAID", "CONQUEST", "RAINBOW_BRIDGE"]}, "target_settlement_id": {"$in": [s["_id"] async for s in db().settlements.find({"owner_player_id": pid}, {"_id": 1})]}})

    # ---- missions / notifications ----
    missions = await db().notifications.count_documents({"player_id": pid, "event": "MISSION_COMPLETED", "created_at_utc": {"$gte": since}})
    alerts = []
    async for n in db().notifications.find({"player_id": pid, "created_at_utc": {"$gte": since}, "severity": {"$in": ["HIGH", "CRITICAL"]}}).sort("created_at_utc", -1).limit(6):
        alerts.append({"event": n["event"], "severity": n["severity"], "payload": n.get("payload", {}), "deep_link": n.get("deep_link"), "at": _iso(n.get("created_at_utc"))})
    unread = await db().notifications.count_documents({"player_id": pid, "read_at": None})

    # ---- resources produced (lazy accrual: estimate rates × hours, capped by the warehouse) ----
    produced = {k: 0 for k in F.RES}
    settlements = 0
    async for s in db().settlements.find({"owner_player_id": pid}):
        settlements += 1
        rates = economy.snapshot_rates(s)
        cap = int(rates["warehouse_capacity"])
        for r, per_h in rates["production_per_h"].items():
            if r in produced:
                produced[r] += int(min(cap, float(per_h) * hours))

    return {
        "since": clock.iso(since),
        "until": clock.iso(now),
        "hours_away": round(hours, 1),
        "battles": battles,
        "jobs": {"done": jobs, "counts": job_counts},
        "marches": {**marches, "incoming_hostile": incoming},
        "missions_completed": missions,
        "alerts": alerts,
        "unread": unread,
        "resources_produced": produced,
        "settlements": settlements,
        "prestige": int(player.get("prestige", 0)),
    }
