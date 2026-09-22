"""Background tasks that survive long enough to finish.

The event loop only keeps a weak reference to a running task, so one that nobody else holds can be collected
mid-await and disappear with no trace at all — the documented reason `asyncio.create_task` tells callers to keep
the result. On top of that, an exception raised inside a task nobody awaits surfaces at best as an unrelated
"Task exception was never retrieved" whenever the garbage collector gets to it.

Both failure modes are silent, and the work spawned here is not: a lost `pyramid.bootstrap()` leaves a realm with
no Pyramid deadline and nothing anywhere says so. `spawn()` holds the reference until the task is done and logs
whatever it raised, so the worst case becomes a visible error instead of a missing feature.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Coroutine

log = logging.getLogger("tasks")

_running: set[asyncio.Task] = set()


def spawn(coro: Coroutine[Any, Any, Any], name: str) -> asyncio.Task:
    task = asyncio.create_task(coro, name=name)
    _running.add(task)
    task.add_done_callback(_forget)
    return task


def pending() -> int:
    return len(_running)


def _forget(task: asyncio.Task) -> None:
    _running.discard(task)
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        log.error("background task %s failed", task.get_name(), exc_info=exc)
