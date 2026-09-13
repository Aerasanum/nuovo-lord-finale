"""QA clock reset: bring the game clock back to real (wall) time WITHOUT breaking a single timer.

Every QA `clock/advance` adds to the persisted offset; after many test runs the realm lives months in the future (dates in
Cronaca/Impostazioni look wrong). Resetting the offset alone would freeze every job/march for that long, so we shift
EVERY datetime stored in the database by −offset (documents keep the same relative timing) and then zero the offset.

Safe order: 1) offset → 0 first (now() jumps back, nothing is due, the scheduler idles) 2) shift all datetimes 3) persist.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from pymongo import UpdateOne

from app.core import clock
from app.core.db import db

SKIP_COLLECTIONS = {"qa_state"}


def _shifted(value, delta: timedelta):
    """Return (changed, new_value) for any BSON value; lists/dicts are rebuilt only when they contain a datetime."""
    if isinstance(value, datetime):
        return True, value + delta
    if isinstance(value, dict):
        out = {}
        changed = False
        for k, v in value.items():
            c, nv = _shifted(v, delta)
            changed = changed or c
            out[k] = nv
        return changed, out
    if isinstance(value, list):
        out = []
        changed = False
        for v in value:
            c, nv = _shifted(v, delta)
            changed = changed or c
            out.append(nv)
        return changed, out
    return False, value


def _sets_for(doc: dict, delta: timedelta) -> dict:
    """Top-level-field granularity keeps $set paths safe whatever the nested key names are."""
    sets: dict = {}
    for k, v in doc.items():
        if k == "_id":
            continue
        changed, nv = _shifted(v, delta)
        if changed:
            sets[k] = nv
    return sets


async def shift_all_datetimes(delta: timedelta) -> dict[str, int]:
    counts: dict[str, int] = {}
    for name in await db().list_collection_names():
        if name in SKIP_COLLECTIONS or name.startswith("system."):
            continue
        coll = db()[name]
        ops: list[UpdateOne] = []
        n = 0
        async for doc in coll.find({}):
            sets = _sets_for(doc, delta)
            if sets:
                ops.append(UpdateOne({"_id": doc["_id"]}, {"$set": sets}))
            if len(ops) >= 500:
                res = await coll.bulk_write(ops, ordered=False)
                n += res.modified_count
                ops = []
        if ops:
            res = await coll.bulk_write(ops, ordered=False)
            n += res.modified_count
        if n:
            counts[name] = n
    return counts


async def reset_to_real_time() -> dict:
    offset = clock.get_offset_seconds()
    if abs(offset) < 1:
        return {"offset_seconds_before": offset, "shifted": {}, "now": clock.iso(clock.now())}
    clock.set_offset_seconds(0.0)  # 1) nothing is due while we move the data
    counts = await shift_all_datetimes(timedelta(seconds=-offset))  # 2)
    await clock.persist_offset()  # 3)
    return {"offset_seconds_before": offset, "shifted": counts, "now": clock.iso(clock.now())}
