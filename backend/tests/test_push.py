"""Push delivery (spec.notification_event_catalog channel PUSH + spec.notification_policy).

What we hold the implementation to: only the events the catalog marks PUSH leave the building, the inbox stays the
source of truth, a CRITICAL alert is never collapsed away, and no outbound HTTP ever happens in a test — `_send` is
replaced, so a test that starts talking to Expo fails loudly instead of silently passing offline.

In-process suite (no live server): `cd backend && pytest tests/test_push.py -o addopts=''`.
"""
from __future__ import annotations

import uuid

import pytest

from app.core import config, tasks
from app.core.db import db
from app.core.spec import get_spec
from app.domain import notifications, push, push_text
from tests.conftest import join, register

pytestmark = pytest.mark.asyncio(loop_scope="session")

TOKEN = "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"


@pytest.fixture
def sent(monkeypatch):
    """Capture the batches instead of posting them, and keep the collections clean between tests."""
    batches: list[list[dict]] = []

    async def fake_send(messages):
        batches.append(messages)

    monkeypatch.setattr(push, "_send", fake_send)
    return batches


@pytest.fixture(autouse=True)
async def clean_devices():
    yield
    await db().device_tokens.delete_many({})
    await db().push_window.delete_many({})


async def _player(client, world) -> dict:
    acc = await register(client)
    joined = await join(client, acc, world["_id"])
    return {**acc, "player_id": joined["player"]["player_id"]}


def _inbox_doc(player_id: str, event: str, severity: str, payload: dict | None = None, world_id: str = "w") -> dict:
    return {
        "_id": f"ntf_{uuid.uuid4().hex[:16]}",
        "event_id": f"{event}:{uuid.uuid4().hex}",
        "world_id": world_id,
        "player_id": player_id,
        "event": event,
        "severity": severity,
        "payload": payload or {},
        "deep_link": "map/sentinel",
        "created_at_utc": None,
        "read_at": None,
    }


async def test_a_device_registers_and_the_token_is_bound_to_the_account(client, world):
    acc = await register(client)
    r = await client.post("/api/push/register", json={"token": TOKEN, "platform": "android", "lang": "it"}, headers=acc["headers"])
    assert r.status_code == 200, r.text
    assert r.json() == {"registered": True}
    doc = await db().device_tokens.find_one({"_id": TOKEN})
    assert doc["account_id"] == acc["account"]["account_id"]
    assert doc["platform"] == "android" and doc["lang"] == "it"
    # Every launch re-registers: the same phone must stay one row.
    await client.post("/api/push/register", json={"token": TOKEN, "platform": "android", "lang": "it"}, headers=acc["headers"])
    assert await db().device_tokens.count_documents({"_id": TOKEN}) == 1


async def test_a_device_that_changes_hands_stops_hearing_the_previous_account(client, world):
    first, second = await register(client), await register(client)
    await client.post("/api/push/register", json={"token": TOKEN, "platform": "ios", "lang": "en"}, headers=first["headers"])
    await client.post("/api/push/register", json={"token": TOKEN, "platform": "ios", "lang": "en"}, headers=second["headers"])
    assert await db().device_tokens.count_documents({"account_id": first["account"]["account_id"]}) == 0
    assert (await db().device_tokens.find_one({"_id": TOKEN}))["account_id"] == second["account"]["account_id"]


async def test_junk_cannot_be_stored_as_a_token(client, world):
    acc = await register(client)
    for token in ["not-a-token", "ExponentPushToken[]", "https://evil.example/hook", ""]:
        r = await client.post("/api/push/register", json={"token": token, "platform": "android", "lang": "en"}, headers=acc["headers"])
        assert r.status_code == 400 and r.json()["code"] == "INVALID_PUSH_TOKEN", token
    r = await client.post("/api/push/register", json={"token": TOKEN, "platform": "symbian", "lang": "en"}, headers=acc["headers"])
    assert r.status_code == 400 and r.json()["code"] == "INVALID_PLATFORM"
    assert await db().device_tokens.count_documents({}) == 0


async def test_registration_needs_an_account(client, world):
    assert (await client.post("/api/push/register", json={"token": TOKEN, "platform": "android", "lang": "en"})).status_code == 401


async def test_unregistering_only_touches_your_own_device(client, world):
    mine, other = await register(client), await register(client)
    await client.post("/api/push/register", json={"token": TOKEN, "platform": "android", "lang": "en"}, headers=mine["headers"])
    r = await client.post("/api/push/unregister", json={"token": TOKEN}, headers=other["headers"])
    assert r.status_code == 200 and r.json() == {"unregistered": False}
    assert await db().device_tokens.count_documents({"_id": TOKEN}) == 1
    r = await client.post("/api/push/unregister", json={"token": TOKEN}, headers=mine["headers"])
    assert r.json() == {"unregistered": True}
    assert await db().device_tokens.count_documents({"_id": TOKEN}) == 0


async def test_an_account_cannot_grow_the_collection_without_end(client, world):
    acc = await register(client)
    for i in range(config.PUSH_MAX_DEVICES_PER_ACCOUNT + 5):
        token = f"ExponentPushToken[device{i:04d}]"
        r = await client.post("/api/push/register", json={"token": token, "platform": "android", "lang": "en"}, headers=acc["headers"])
        assert r.status_code == 200, r.text
    assert await db().device_tokens.count_documents({"account_id": acc["account"]["account_id"]}) == config.PUSH_MAX_DEVICES_PER_ACCOUNT


async def test_only_the_events_the_catalog_marks_push_are_sent(client, world):
    """The spec decides, not us: an INFO queue update must never reach a locked phone."""
    declared = {e["event"] for e in get_spec().notification_event_catalog if "PUSH" in e["channels"]}
    assert declared <= push.push_events()
    for event in declared:
        assert push.eligible({"event": event, "payload": {}}), event
    for event in ["BUILD_JOB_STATE", "MARCH_DEPARTED", "MISSION_COMPLETED", "EMERALD_TREASURY_MOVEMENT", "RUBY_TRANSACTION"]:
        assert not push.eligible({"event": event, "payload": {}}), event


async def test_every_push_event_has_a_title_in_every_language(client, world):
    """A notification the OS draws cannot be translated later: a missing title would ship as a raw event name."""
    missing = []
    for event in sorted(push.push_events()):
        for key in {push_text.title_key(event, {}), push_text.title_key(event, {"lost": True})}:
            for lang in push_text.LANGS:
                if not (push_text.TITLES.get(key, {}).get(lang) or "").strip():
                    missing.append(f"{key}/{lang}")
    assert missing == []


async def test_a_push_carries_the_realm_the_title_and_the_unread_count(client, world, sent):
    acc = await _player(client, world)
    await client.post("/api/push/register", json={"token": TOKEN, "platform": "android", "lang": "it"}, headers=acc["headers"])
    await notifications.notify(world["_id"], acc["player_id"], "SENTINEL_LOST", {"sentinel_id": "s1", "sector": "N"}, dedupe_key=f"t:{uuid.uuid4().hex}")
    await tasks.drain()

    assert len(sent) == 1 and len(sent[0]) == 1
    msg = sent[0][0]
    assert msg["to"] == TOKEN
    assert msg["title"] == push_text.TITLES["SENTINEL_LOST"]["it"]
    assert msg["body"].startswith(world["name"]) and msg["body"].endswith("N")
    assert msg["data"]["event"] == "SENTINEL_LOST" and msg["data"]["deep_link"] == "map/sentinel" and msg["data"]["world_id"] == world["_id"]
    assert (await db().inbox.find_one({"_id": msg["data"]["notification_id"]})) is not None
    assert msg["badge"] >= 1


async def test_the_title_follows_the_language_of_each_device(client, world, sent):
    acc = await _player(client, world)
    for lang, token in [("de", "ExponentPushToken[de0000000000]"), ("zh", "ExponentPushToken[zh0000000000]")]:
        await client.post("/api/push/register", json={"token": token, "platform": "android", "lang": lang}, headers=acc["headers"])
    await notifications.notify(world["_id"], acc["player_id"], "SENTINEL_LOST", {"sector": "S"}, dedupe_key=f"t:{uuid.uuid4().hex}")
    await tasks.drain()
    titles = {m["title"] for m in sent[0]}
    assert titles == {push_text.TITLES["SENTINEL_LOST"]["de"], push_text.TITLES["SENTINEL_LOST"]["zh"]}


async def test_an_event_the_catalog_does_not_push_sends_nothing(client, world, sent):
    acc = await _player(client, world)
    await client.post("/api/push/register", json={"token": TOKEN, "platform": "android", "lang": "en"}, headers=acc["headers"])
    await notifications.notify(world["_id"], acc["player_id"], "BUILD_JOB_STATE", {"state": "QUEUED"}, dedupe_key=f"t:{uuid.uuid4().hex}")
    await tasks.drain()
    assert sent == []
    # ...and the inbox still has it: push is delivery, the inbox is the record.
    assert await db().inbox.count_documents({"player_id": acc["player_id"], "event": "BUILD_JOB_STATE"}) == 1


async def test_a_player_with_no_device_still_gets_the_inbox_entry(client, world, sent):
    acc = await _player(client, world)
    await notifications.notify(world["_id"], acc["player_id"], "SENTINEL_LOST", {"sector": "E"}, dedupe_key=f"t:{uuid.uuid4().hex}")
    await tasks.drain()
    assert sent == []
    assert await db().inbox.count_documents({"player_id": acc["player_id"], "event": "SENTINEL_LOST"}) == 1


async def test_the_same_notification_twice_pushes_once(client, world, sent):
    """The inbox dedupes on event_id; the second insert must not produce a second knock on the door."""
    acc = await _player(client, world)
    await client.post("/api/push/register", json={"token": TOKEN, "platform": "android", "lang": "en"}, headers=acc["headers"])
    key = f"sentinel_grace:{uuid.uuid4().hex}"
    await notifications.notify(world["_id"], acc["player_id"], "SENTINEL_LOST", {"sector": "W"}, dedupe_key=key)
    await notifications.notify(world["_id"], acc["player_id"], "SENTINEL_LOST", {"sector": "W"}, dedupe_key=key)
    await tasks.drain()
    assert len(sent) == 1


async def test_noncritical_duplicates_collapse_but_critical_ones_never_do(client, world, sent):
    """spec.notification_policy.anti_spam: aggregation is allowed for noncritical duplicates, and only for those."""
    acc = await _player(client, world)
    await client.post("/api/push/register", json={"token": TOKEN, "platform": "android", "lang": "en"}, headers=acc["headers"])

    for _ in range(3):
        await push.deliver(_inbox_doc(acc["player_id"], "DIPLOMACY_STATE_CHANGED", "HIGH", {"other_tag": "AAA", "other_name": "Alleanza"}, world["_id"]))
    assert len(sent) == 1, "three HIGH duplicates inside the window should wake the phone once"

    sent.clear()
    for _ in range(3):
        await push.deliver(_inbox_doc(acc["player_id"], "SENTINEL_LOST", "CRITICAL", {"sector": "N"}, world["_id"]))
    assert len(sent) == 3, "a CRITICAL event may not be dropped"


async def test_different_events_do_not_collapse_into_each_other(client, world, sent):
    acc = await _player(client, world)
    await client.post("/api/push/register", json={"token": TOKEN, "platform": "android", "lang": "en"}, headers=acc["headers"])
    await push.deliver(_inbox_doc(acc["player_id"], "DIPLOMACY_STATE_CHANGED", "HIGH", {"other_name": "A"}, world["_id"]))
    await push.deliver(_inbox_doc(acc["player_id"], "HOSTILE_MARCH_DETECTED", "HIGH", {"target_name": "Castello"}, world["_id"]))
    assert len(sent) == 2


async def test_taking_a_settlement_is_quiet_and_losing_one_is_not(client, world, sent):
    acc = await _player(client, world)
    await client.post("/api/push/register", json={"token": TOKEN, "platform": "android", "lang": "it"}, headers=acc["headers"])
    await push.deliver(_inbox_doc(acc["player_id"], "OWNERSHIP_CHANGED", "HIGH", {"lost": False, "x": 10, "y": 12}, world["_id"]))
    assert sent == []
    await push.deliver(_inbox_doc(acc["player_id"], "OWNERSHIP_CHANGED", "HIGH", {"lost": True, "x": 10, "y": 12}, world["_id"]))
    assert len(sent) == 1
    assert sent[0][0]["title"] == push_text.TITLES["SETTLEMENT_LOST"]["it"]
    assert sent[0][0]["body"].endswith("10,12")


async def test_a_dead_token_is_dropped_and_a_live_one_is_kept(client, world, monkeypatch):
    """Expo answers per message: DeviceNotRegistered means the app is gone from that phone for good."""
    acc = await _player(client, world)
    dead, alive = "ExponentPushToken[dead00000000]", "ExponentPushToken[alive0000000]"
    for token in (dead, alive):
        await client.post("/api/push/register", json={"token": token, "platform": "android", "lang": "en"}, headers=acc["headers"])

    class Response:
        status_code = 200
        text = ""

        def __init__(self, messages):
            self._messages = messages

        def json(self):
            return {"data": [{"status": "error", "message": "gone", "details": {"error": "DeviceNotRegistered"}} if m["to"] == dead else {"status": "ok", "id": "r"} for m in self._messages]}

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, url, json, headers):
            assert url == config.EXPO_PUSH_URL
            return Response(json)

    monkeypatch.setattr(push.httpx, "AsyncClient", lambda **kwargs: FakeClient())
    await push.deliver(_inbox_doc(acc["player_id"], "SENTINEL_LOST", "CRITICAL", {"sector": "N"}, world["_id"]))
    assert await db().device_tokens.find_one({"_id": dead}) is None
    assert await db().device_tokens.find_one({"_id": alive}) is not None


async def test_expo_being_down_does_not_break_the_notification(client, world, monkeypatch):
    acc = await _player(client, world)
    await client.post("/api/push/register", json={"token": TOKEN, "platform": "android", "lang": "en"}, headers=acc["headers"])

    async def explode(messages):
        raise RuntimeError("exp.host unreachable")

    monkeypatch.setattr(push, "_send", explode)
    await notifications.notify(world["_id"], acc["player_id"], "SENTINEL_LOST", {"sector": "N"}, dedupe_key=f"t:{uuid.uuid4().hex}")
    await tasks.drain()
    assert await db().inbox.count_documents({"player_id": acc["player_id"], "event": "SENTINEL_LOST"}) == 1


async def test_erasing_the_account_forgets_the_devices(client, world, sent):
    """A token left behind would keep ringing a phone whose owner no longer has an account."""
    acc = await _player(client, world)
    await client.post("/api/push/register", json={"token": TOKEN, "platform": "android", "lang": "en"}, headers=acc["headers"])
    r = await client.post("/api/auth/account/delete", json={"password": acc["password"]}, headers=acc["headers"])
    assert r.status_code == 200 and r.json()["devices_forgotten"] == 1
    assert await db().device_tokens.count_documents({}) == 0
    # The House survives the erasure, so an event can still arrive for it — with nobody left to wake.
    await push.deliver(_inbox_doc(acc["player_id"], "SENTINEL_LOST", "CRITICAL", {"sector": "N"}, world["_id"]))
    assert sent == []


async def test_push_can_be_turned_off_for_a_whole_deployment(client, world, sent, monkeypatch):
    acc = await _player(client, world)
    await client.post("/api/push/register", json={"token": TOKEN, "platform": "android", "lang": "en"}, headers=acc["headers"])
    monkeypatch.setattr(config, "PUSH_ENABLED", False)
    await notifications.notify(world["_id"], acc["player_id"], "SENTINEL_LOST", {"sector": "N"}, dedupe_key=f"t:{uuid.uuid4().hex}")
    await tasks.drain()
    assert sent == []
    assert await db().inbox.count_documents({"player_id": acc["player_id"], "event": "SENTINEL_LOST"}) == 1
