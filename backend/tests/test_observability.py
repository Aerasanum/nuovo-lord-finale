"""Background tasks that cannot vanish, and the log fields spec.observability asks for.

In-process suite (no live server): `cd backend && pytest tests/test_observability.py -o addopts=''`.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from contextvars import copy_context
from datetime import timedelta

import pytest

from app.core import clock, reqlog, tasks
from app.core.db import db
from app.domain import scheduler
from tests.conftest import join, register

pytestmark = pytest.mark.asyncio(loop_scope="session")


# ------------------------------------------------------------------------------------------------ background tasks
async def test_spawned_task_is_held_until_it_finishes():
    """The event loop only weak-references a running task, so one nobody holds can be collected mid-await."""
    release = asyncio.Event()

    async def slow():
        await release.wait()

    before = tasks.pending()
    task = tasks.spawn(slow(), "test.slow")
    assert tasks.pending() == before + 1
    release.set()
    await task
    assert tasks.pending() == before


async def test_a_failing_task_says_so_instead_of_dying_quietly(caplog):
    async def boom():
        raise RuntimeError("bootstrap exploded")

    with caplog.at_level(logging.ERROR, logger="tasks"):
        task = tasks.spawn(boom(), "test.boom")
        with pytest.raises(RuntimeError):
            await task
        await asyncio.sleep(0)  # the done callback runs on the next loop pass

    assert any("test.boom" in r.getMessage() and r.exc_info for r in caplog.records), caplog.text


# ------------------------------------------------------------------------------------------------ structured fields
async def test_describe_leads_with_the_trace_id():
    def body():
        reqlog.bind(world_id="w1", player_id="p1")
        return reqlog.describe("abc123", "GET /api/worlds/{world_id}/me")

    out = copy_context().run(body)
    assert out.startswith("trace_id=abc123 "), out
    assert "world_id=w1" in out and "player_id=p1" in out and "action_type=GET /api/worlds/{world_id}/me" in out


async def test_describe_leaves_out_what_the_request_never_learned():
    def body():
        reqlog.bind(world_id="w1", player_id=None)
        return reqlog.describe("abc123", "POST /api/auth/login")

    assert "player_id" not in copy_context().run(body)


async def test_one_requests_fields_never_leak_into_another():
    """The whole design rests on this: Starlette runs each request in its own task with its own copy of the
    context, so a log line can never name the wrong player. Two concurrent tasks are the cheapest proof."""

    async def request(player_id: str) -> str:
        reqlog.bind(player_id=player_id)
        await asyncio.sleep(0)  # yield, so the two tasks interleave between bind and read
        return reqlog.describe("t", "GET /api/worlds/{world_id}/me")

    first, second = await asyncio.gather(request("p_alice"), request("p_bob"))
    assert "player_id=p_alice" in first and "p_bob" not in first
    assert "player_id=p_bob" in second and "p_alice" not in second


async def test_a_refused_action_is_logged_with_the_trace_id_the_client_is_shown(client, world, caplog):
    """The id in the response body is what a player reports; without it in the log the report leads nowhere."""
    acc = await register(client)
    joined = await join(client, acc, world["_id"])

    with caplog.at_level(logging.INFO, logger="server"):
        r = await client.get(f"/api/worlds/{world['_id']}/settlements/sett_does_not_exist", headers=acc["headers"])

    assert r.status_code == 404
    trace_id = r.json()["trace_id"]
    line = next((x.getMessage() for x in caplog.records if trace_id in x.getMessage()), None)
    assert line is not None, f"trace_id {trace_id} never reached the log:\n{caplog.text}"
    assert f"world_id={world['_id']}" in line, line
    assert f"player_id={joined['player']['player_id']}" in line, line
    assert "entity_id=sett_does_not_exist" in line, line
    assert "action_type=GET /api/worlds/{world_id}/settlements/{settlement_id}" in line, line


# ------------------------------------------------------------------------------------------------ scheduler health
async def test_health_reports_the_queue_the_database_actually_holds(client, world):
    """In-process counters reset with the process; these three answer whether the realm is running right now."""
    wid = world["_id"]
    tag = uuid.uuid4().hex[:8]
    late = clock.now() - timedelta(seconds=90)
    keys = [f"probe-due-{tag}", f"probe-dead-{tag}"]
    try:
        before = await scheduler.health()
        await scheduler.schedule(wid, "NOOP_PROBE", late, f"probe-{tag}", keys[0])
        await db().scheduled_events.insert_one(
            {"_id": f"evt_dead_{tag}", "world_id": wid, "type": "NOOP_PROBE", "scheduled_at": late, "priority": 100,
             "entity_id": f"probe-{tag}", "effect_key": keys[1], "status": "FAILED", "attempts": 5, "payload": {}}
        )

        after = await scheduler.health()
        assert after["queue_depth"] == before["queue_depth"] + 1
        assert after["dead_letter"] == before["dead_letter"] + 1, "an event out of retries is a lost player action and must be counted"
        assert after["lag_seconds"] >= 90, after
    finally:
        await db().scheduled_events.delete_many({"effect_key": {"$in": keys}})


async def test_health_reports_no_lag_when_nothing_is_overdue(monkeypatch):
    """An empty due queue is the healthy case and has to read as zero, not as a missing value."""

    async def no_oldest(*_args, **_kwargs):
        return None

    monkeypatch.setattr(db().scheduled_events, "find_one", no_oldest)
    assert (await scheduler.health())["lag_seconds"] == 0.0
