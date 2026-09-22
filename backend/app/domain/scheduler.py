"""Persistent, idempotent scheduler (Bible §24/§24.1, spec.event_ordering).

scheduled_events: {_id, world_id, type, scheduled_at, priority, entity_id, effect_key(unique), status,
lease_until, attempts, payload}. Worker: atomic claim (PENDING -> CLAIMED with lease) ordered by
(scheduled_at, priority, _id); handler applies an idempotent domain effect; then DONE. Expired leases are
re-claimable, so a crash between effect and DONE leads to a harmless re-application (handlers are
idempotent by construction: conditional updates keyed by job/effect id)."""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta
from typing import Awaitable, Callable

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.core import clock
from app.core.db import db
from app.core.spec import get_spec

log = logging.getLogger("scheduler")
Handler = Callable[[dict], Awaitable[None]]
_handlers: dict[str, Handler] = {}
LEASE_SECONDS = 30
_metrics = {"executed": 0, "retries": 0, "duplicate_effect_prevented": 0, "failed": 0}


def handler(event_type: str):
    def deco(fn: Handler) -> Handler:
        _handlers[event_type] = fn
        return fn

    return deco


def priority_of(event_type: str) -> int:
    return int(get_spec().event_ordering["priorities"].get(event_type, 100))


async def schedule(world_id: str, event_type: str, scheduled_at: datetime, entity_id: str, effect_key: str, payload: dict | None = None) -> str | None:
    """Insert a scheduled event; duplicate effect_key => no-op (exactly-once at the scheduling layer)."""
    doc = {
        "_id": f"evt_{uuid.uuid4().hex[:16]}",
        "world_id": world_id,
        "type": event_type,
        "scheduled_at": scheduled_at,
        "priority": priority_of(event_type),
        "entity_id": entity_id,
        "effect_key": effect_key,
        "status": "PENDING",
        "lease_until": None,
        "attempts": 0,
        "payload": payload or {},
        "created_at": clock.now(),
    }
    try:
        await db().scheduled_events.insert_one(doc)
        return doc["_id"]
    except DuplicateKeyError:
        _metrics["duplicate_effect_prevented"] += 1
        return None


async def cancel(effect_key: str) -> bool:
    res = await db().scheduled_events.update_one({"effect_key": effect_key, "status": "PENDING"}, {"$set": {"status": "CANCELLED"}})
    return res.modified_count == 1


async def claim_next(now: datetime) -> dict | None:
    return await db().scheduled_events.find_one_and_update(
        {
            "scheduled_at": {"$lte": now},
            "$or": [
                {"status": "PENDING"},
                {"status": "CLAIMED", "lease_until": {"$lt": now}},
            ],
        },
        {"$set": {"status": "CLAIMED", "lease_until": now + timedelta(seconds=LEASE_SECONDS)}, "$inc": {"attempts": 1}},
        sort=[("scheduled_at", 1), ("priority", 1), ("_id", 1)],
        return_document=ReturnDocument.AFTER,
    )


async def run_due_once(limit: int = 500) -> int:
    """Process every due event (used by the worker loop, tests and QA clock advance)."""
    processed = 0
    while processed < limit:
        now = clock.now()
        evt = await claim_next(now)
        if evt is None:
            break
        processed += 1
        fn = _handlers.get(evt["type"])
        if fn is None:
            await db().scheduled_events.update_one({"_id": evt["_id"]}, {"$set": {"status": "FAILED", "error": "NO_HANDLER"}})
            _metrics["failed"] += 1
            continue
        try:
            if evt["attempts"] > 1:
                _metrics["retries"] += 1
            await fn(evt)
            await db().scheduled_events.update_one({"_id": evt["_id"]}, {"$set": {"status": "DONE", "done_at": clock.now()}})
            _metrics["executed"] += 1
        except Exception as e:  # noqa: BLE001
            log.exception("event %s failed", evt["_id"])
            if evt["attempts"] >= 5:
                await db().scheduled_events.update_one({"_id": evt["_id"]}, {"$set": {"status": "FAILED", "error": str(e)[:500]}})
                _metrics["failed"] += 1
            else:
                await db().scheduled_events.update_one(
                    {"_id": evt["_id"]},
                    {"$set": {"status": "PENDING", "lease_until": None, "scheduled_at": clock.now() + timedelta(seconds=2), "error": str(e)[:500]}},
                )
    return processed


async def worker_loop(stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            await run_due_once()
        except Exception:  # noqa: BLE001
            log.exception("scheduler loop error")
        try:
            await asyncio.wait_for(stop.wait(), timeout=1.0)
        except asyncio.TimeoutError:
            pass


def metrics() -> dict:
    return dict(_metrics)


async def health() -> dict:
    """Queue state as the database has it (spec.observability.required_metrics).

    The counters above live in the process and reset with it, which makes them useless for the two questions that
    actually matter: is the scheduler keeping up, and has anything been dropped. `lag_seconds` is how long the
    oldest due event has been waiting — a march arrives late by exactly that much — and `dead_letter` counts the
    events that exhausted their retries, each one a player action that will never happen. Nothing surfaced those
    before, so a permanently lost march looked identical to a healthy realm.
    """
    now = clock.now()
    pending, dead_letter, oldest = await asyncio.gather(
        db().scheduled_events.count_documents({"status": "PENDING"}),
        db().scheduled_events.count_documents({"status": "FAILED"}),
        db().scheduled_events.find_one({"status": "PENDING", "scheduled_at": {"$lte": now}}, {"scheduled_at": 1}, sort=[("scheduled_at", 1)]),
    )
    lag = (now - clock.aware(oldest["scheduled_at"])).total_seconds() if oldest else 0.0
    return {**metrics(), "queue_depth": pending, "dead_letter": dead_letter, "lag_seconds": round(max(0.0, lag), 3)}
