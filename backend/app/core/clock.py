"""Injectable clock. Production timestamps are never edited; QA/simulator may add an offset
(clock x1/x10 semantics) which is persisted so worker + API share the same view."""
from datetime import datetime, timedelta, timezone

_offset = timedelta(0)


def now() -> datetime:
    return datetime.now(timezone.utc) + _offset


def get_offset_seconds() -> float:
    return _offset.total_seconds()


def set_offset_seconds(seconds: float) -> None:
    global _offset
    _offset = timedelta(seconds=seconds)


def advance(seconds: float) -> None:
    global _offset
    _offset += timedelta(seconds=seconds)


async def persist_offset() -> None:
    """Store the QA offset so a backend restart keeps every timer consistent with what players saw."""
    from app.core.db import db  # local import: clock is imported by db-agnostic modules

    await db().qa_state.update_one({"_id": "clock"}, {"$set": {"offset_seconds": get_offset_seconds()}}, upsert=True)


async def load_offset() -> None:
    from app.core.db import db

    doc = await db().qa_state.find_one({"_id": "clock"})
    if doc:
        set_offset_seconds(float(doc.get("offset_seconds", 0.0)))


def aware(dt: datetime | None) -> datetime | None:
    """Mongo may return naive datetimes; normalise to UTC-aware."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def iso(dt: datetime | None) -> str | None:
    dt = aware(dt)
    return dt.isoformat().replace("+00:00", "Z") if dt else None


def parse(s: str) -> datetime:
    """Inverse of iso(): accepts '...Z' or an explicit offset; naive input is taken as UTC."""
    return aware(datetime.fromisoformat(s.replace("Z", "+00:00")))  # type: ignore[return-value]
