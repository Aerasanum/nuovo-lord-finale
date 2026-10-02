"""Crash reports from the app.

A release build gives us nothing: the only way a player's crash reaches us today is if they describe it, and what
they describe is "it closed". This keeps the little that is actually actionable — what threw, on which screen, in
which version — grouped so that one broken screen reads as one problem with a count rather than as noise.

Deliberately not a profile of anyone:
  * no address is stored. The caller's IP is used to throttle and then dropped, because a crash list is not a log
    of where people play from;
  * the account id is attached only when the request happened to carry a token. A crash can happen before a sign-in
    and still has to be reportable, so the endpoint accepts anonymous reports;
  * reports expire. CRASH_REPORT_RETENTION_DAYS is a diagnosis window, not an archive.

Grouping is computed here and never taken from the client: a fingerprint a client can choose is a fingerprint an
attacker can use to bury a real crash under a thousand fake groups.
"""
from __future__ import annotations

import hashlib
import logging
import re
import uuid
from datetime import timedelta

from app.core import clock, config
from app.core.db import db

log = logging.getLogger("telemetry")

KINDS = {"render", "screen", "unhandled", "rejection"}
# Hermes release stacks are byte offsets into a bundle with no symbols, so the digits in a frame carry no meaning
# across builds and would split one crash into a new group per release.
_NOISE = re.compile(r"\d+")


async def record(report: dict, account_id: str | None) -> dict:
    now = clock.now()
    kind = report["kind"] if report["kind"] in KINDS else "unhandled"
    message = report["message"].strip()[:500]
    stack = (report.get("stack") or "").strip()[:4000] or None
    fingerprint = _fingerprint(kind, message, stack)
    doc = {
        "_id": f"crash_{uuid.uuid4().hex[:16]}",
        "fingerprint": fingerprint,
        "kind": kind,
        "message": message,
        "stack": stack,
        "route": (report.get("route") or "")[:200] or None,
        "app_version": (report.get("app_version") or "")[:32] or None,
        "platform": (report.get("platform") or "")[:16] or None,
        "os_version": (report.get("os_version") or "")[:32] or None,
        "fatal": bool(report.get("fatal")),
        "account_id": account_id,
        "at": now,
        "expires_at": now + timedelta(days=config.CRASH_REPORT_RETENTION_DAYS),
    }
    await db().crash_reports.insert_one(doc)
    log.warning("client crash %s kind=%s route=%s version=%s: %s", fingerprint, kind, doc["route"], doc["app_version"], message)
    return {"received": True, "fingerprint": fingerprint}


def _fingerprint(kind: str, message: str, stack: str | None) -> str:
    """One group per (kind, message, innermost frame) — the same crash from two players has to land in one row."""
    frame = ""
    for line in (stack or "").splitlines():
        line = line.strip()
        if line and not line.startswith(message[:40]):  # the first line of a JS stack is the message again
            frame = _NOISE.sub("", line)
            break
    return hashlib.sha256(f"{kind}|{message}|{frame}".encode("utf-8")).hexdigest()[:16]


async def groups(limit: int = 50) -> dict:
    """Crashes worth looking at, most recent first within each group. For the admin endpoint."""
    pipeline = [
        {"$sort": {"at": -1}},
        {
            "$group": {
                "_id": "$fingerprint",
                "count": {"$sum": 1},
                "last_seen": {"$first": "$at"},
                "first_seen": {"$last": "$at"},
                "kind": {"$first": "$kind"},
                "message": {"$first": "$message"},
                "route": {"$first": "$route"},
                "app_version": {"$first": "$app_version"},
                "platform": {"$first": "$platform"},
                "fatal": {"$first": "$fatal"},
                "stack": {"$first": "$stack"},
                "accounts": {"$addToSet": "$account_id"},
            }
        },
        {"$sort": {"count": -1, "last_seen": -1}},
        {"$limit": max(1, min(limit, 200))},
    ]
    rows = await db().crash_reports.aggregate(pipeline).to_list(length=None)
    return {
        "groups": [
            {
                "fingerprint": r["_id"],
                "count": r["count"],
                "players": len([a for a in r["accounts"] if a]),
                "first_seen": clock.iso(r["first_seen"]),
                "last_seen": clock.iso(r["last_seen"]),
                "kind": r["kind"],
                "message": r["message"],
                "route": r["route"],
                "app_version": r["app_version"],
                "platform": r["platform"],
                "fatal": r["fatal"],
                "stack": r["stack"],
            }
            for r in rows
        ]
    }
