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
