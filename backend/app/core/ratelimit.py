"""Fixed-window rate limiting backed by Mongo.

Shared across API replicas (the counter lives in the database, not in process memory) and self-cleaning through the
TTL index on `rate_limits.expires_at`. Windows use wall-clock time, never the simulated game clock: a QA clock jump
must not hand out a fresh quota.

Limits are configured in `app.core.config`; a limit of 0 disables that bucket (used by the QA backend, which registers
hundreds of throwaway accounts from a single address).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.core.db import db
from app.core.errors import ApiError


async def hit(bucket: str, key: str, limit: int, window_seconds: int) -> None:
    """Count one attempt; raise 429 once `key` goes over `limit` inside the current window."""
    if limit <= 0:
        return
    now = datetime.now(timezone.utc)
    window = int(now.timestamp()) // window_seconds
    doc = await db().rate_limits.find_one_and_update(
        {"_id": f"{bucket}:{key}:{window}"},
        {"$inc": {"n": 1}, "$setOnInsert": {"expires_at": now + timedelta(seconds=window_seconds * 2)}},
        upsert=True,
        return_document=True,
    )
    if int(doc.get("n", 0)) > limit:
        retry_after = (window + 1) * window_seconds - int(now.timestamp())
        raise ApiError(
            "TOO_MANY_REQUESTS",
            "Too many attempts, please try again later",
            429,
            {"retry_after_seconds": max(1, retry_after)},
            retryable=True,
        )


async def reset(bucket: str, key: str, window_seconds: int) -> None:
    """Clear the current window (called after a success so a legitimate user is never locked out by past typos)."""
    window = int(datetime.now(timezone.utc).timestamp()) // window_seconds
    await db().rate_limits.delete_one({"_id": f"{bucket}:{key}:{window}"})
