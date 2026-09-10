"""Persistent inbox (notification_policy). DB is the source of truth; realtime push is delivery only."""
from __future__ import annotations

import uuid

from app.core import clock
from app.core.db import db
from app.core.spec import get_spec


def _catalog(event: str) -> dict:
    for e in get_spec().notification_event_catalog:
        if e["event"] == event:
            return e
    return {"severity": "INFO", "deep_link": "inbox"}


async def notify(world_id: str, player_id: str | None, event: str, payload: dict, dedupe_key: str | None = None, deep_link: str | None = None) -> None:
    if not player_id:
        return
    cat = _catalog(event)
    doc = {
        "_id": f"ntf_{uuid.uuid4().hex[:16]}",
        "event_id": dedupe_key or f"{event}:{uuid.uuid4().hex}",
        "world_id": world_id,
        "player_id": player_id,
        "event": event,
        "severity": cat.get("severity", "INFO"),
        "payload": payload,
        "deep_link": deep_link or cat.get("deep_link", "inbox"),
        "created_at_utc": clock.now(),
        "read_at": None,
    }
    try:
        await db().inbox.insert_one(doc)
    except Exception:  # duplicate event_id => already delivered (idempotent)
        pass


def dto(n: dict) -> dict:
    return {
        "notification_id": n["_id"],
        "event_id": n["event_id"],
        "world_id": n["world_id"],
        "player_id": n["player_id"],
        "event": n["event"],
        "severity": n["severity"],
        "payload": n.get("payload", {}),
        "deep_link": n.get("deep_link"),
        "created_at_utc": clock.iso(n["created_at_utc"]),
        "read_at": clock.iso(n.get("read_at")),
    }
