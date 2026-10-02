"""Crash reports from the app (app/domain/telemetry.py).

What we hold the implementation to: the same crash from two players is one row to look at, the endpoint works
without an account because a crash can precede the sign-in, it stores nothing about where anyone is, and an open
endpoint cannot be used to fill the database.

In-process suite (no live server): `cd backend && pytest tests/test_telemetry.py -o addopts=''`.
"""
from __future__ import annotations

import pytest

from app.core import config
from app.core.db import db
from app.domain import telemetry
from tests.conftest import ADMIN, register

pytestmark = pytest.mark.asyncio(loop_scope="session")

CRASH = {
    "kind": "screen",
    "message": "Cannot read property 'x' of undefined",
    "stack": "TypeError: Cannot read property 'x' of undefined\n  at MapScreen (app:///index.bundle:41203:17)\n  at renderWithHooks",
    "route": "/(tabs)/map",
    "app_version": "1.0.0",
    "platform": "android",
    "os_version": "14",
    "fatal": False,
}


@pytest.fixture(autouse=True)
async def clean_reports():
    await db().crash_reports.delete_many({})
    yield
    await db().crash_reports.delete_many({})


async def test_a_crash_is_accepted_without_an_account(client, world):
    """The app can die on the login screen, and that is exactly the crash we must hear about."""
    r = await client.post("/api/telemetry/crash", json=CRASH)
    assert r.status_code == 202, r.text
    assert r.json()["received"] is True
    doc = await db().crash_reports.find_one({"fingerprint": r.json()["fingerprint"]})
    assert doc["message"] == CRASH["message"]
    assert doc["route"] == "/(tabs)/map" and doc["app_version"] == "1.0.0"
    assert doc["account_id"] is None


async def test_a_signed_in_crash_carries_the_account_and_nothing_about_the_address(client, world):
    acc = await register(client)
    r = await client.post("/api/telemetry/crash", json=CRASH, headers={**acc["headers"], "X-Forwarded-For": "203.0.113.9"})
    assert r.status_code == 202
    doc = await db().crash_reports.find_one({"fingerprint": r.json()["fingerprint"]})
    assert doc["account_id"] == acc["account"]["account_id"]
    # A crash list is not a record of where people play from.
    assert "203.0.113.9" not in repr(doc)
    assert not any(k for k in doc if "ip" == k or k.endswith("_ip"))


async def test_a_token_that_no_longer_works_is_ignored_rather_than_refused(client, world):
    r = await client.post("/api/telemetry/crash", json=CRASH, headers={"Authorization": "Bearer not-a-real-token"})
    assert r.status_code == 202
    assert (await db().crash_reports.find_one({"fingerprint": r.json()["fingerprint"]}))["account_id"] is None


async def test_the_same_crash_from_two_players_is_one_group(client, world):
    first, second = await register(client), await register(client)
    for acc in (first, second):
        await client.post("/api/telemetry/crash", json=CRASH, headers=acc["headers"])
    groups = (await telemetry.groups())["groups"]
    assert len(groups) == 1
    assert groups[0]["count"] == 2 and groups[0]["players"] == 2
    assert groups[0]["route"] == "/(tabs)/map"


async def test_a_new_release_does_not_split_a_crash_into_a_new_group(client, world):
    """Hermes frames are byte offsets into an unsymbolicated bundle: they move with every build and mean nothing."""
    await client.post("/api/telemetry/crash", json=CRASH)
    moved = {**CRASH, "app_version": "1.0.1", "stack": CRASH["stack"].replace("41203:17", "58871:9")}
    await client.post("/api/telemetry/crash", json=moved)
    assert len((await telemetry.groups())["groups"]) == 1


async def test_two_different_crashes_stay_apart(client, world):
    await client.post("/api/telemetry/crash", json=CRASH)
    await client.post("/api/telemetry/crash", json={**CRASH, "message": "Network request failed", "stack": "Error: Network request failed\n  at fetch"})
    assert len((await telemetry.groups())["groups"]) == 2


async def test_a_report_cannot_choose_its_own_group(client, world):
    """Grouping a client controls is grouping an attacker controls: a real crash could be buried under fake ones."""
    r = await client.post("/api/telemetry/crash", json={**CRASH, "fingerprint": "0000000000000000"})
    assert r.status_code == 202
    assert r.json()["fingerprint"] != "0000000000000000"
    assert await db().crash_reports.count_documents({"fingerprint": "0000000000000000"}) == 0


async def test_an_oversized_report_never_reaches_the_database(client, world):
    """The caps are declared on the fields, so an open endpoint cannot be fed a megabyte of anything."""
    assert (await client.post("/api/telemetry/crash", json={**CRASH, "message": "x" * 5000})).status_code == 422
    assert (await client.post("/api/telemetry/crash", json={**CRASH, "stack": "line\n" * 2000})).status_code == 422
    assert (await client.post("/api/telemetry/crash", json={**CRASH, "route": "/" + "r" * 300})).status_code == 422
    assert await db().crash_reports.count_documents({}) == 0


async def test_an_empty_message_says_nothing_and_is_refused(client, world):
    assert (await client.post("/api/telemetry/crash", json={**CRASH, "message": ""})).status_code == 422


async def test_an_unknown_kind_is_filed_rather_than_trusted(client, world):
    r = await client.post("/api/telemetry/crash", json={**CRASH, "kind": "whatever"})
    assert r.status_code == 202
    assert (await db().crash_reports.find_one({"fingerprint": r.json()["fingerprint"]}))["kind"] == "unhandled"


async def test_reports_expire_on_their_own(client, world):
    r = await client.post("/api/telemetry/crash", json=CRASH)
    doc = await db().crash_reports.find_one({"fingerprint": r.json()["fingerprint"]})
    assert (doc["expires_at"] - doc["at"]).days == config.CRASH_REPORT_RETENTION_DAYS


async def test_the_crash_list_is_admin_only(client, world):
    await client.post("/api/telemetry/crash", json=CRASH)
    acc = await register(client)
    assert (await client.get("/api/telemetry/crashes")).status_code == 403
    assert (await client.get("/api/telemetry/crashes", headers=acc["headers"])).status_code == 403
    allowed = await client.get("/api/telemetry/crashes", headers=ADMIN)
    assert allowed.status_code == 200
    assert allowed.json()["groups"][0]["message"] == CRASH["message"]


async def test_a_crash_loop_cannot_fill_the_database(client, world, monkeypatch):
    """The endpoint is open by necessity, so the ceiling per address is the only thing standing in the way."""
    monkeypatch.setattr(config, "RATE_LIMIT_CRASHES_PER_HOUR", 3)
    codes = [(await client.post("/api/telemetry/crash", json=CRASH, headers={"X-Forwarded-For": "198.51.100.7"})).status_code for _ in range(5)]
    assert codes == [202, 202, 202, 429, 429]
    assert await db().crash_reports.count_documents({}) == 3


async def test_crash_reporting_can_be_turned_off(client, world, monkeypatch):
    monkeypatch.setattr(config, "CRASH_REPORTS_ENABLED", False)
    r = await client.post("/api/telemetry/crash", json=CRASH)
    assert r.status_code == 404 and r.json()["code"] == "TELEMETRY_DISABLED"
    assert await db().crash_reports.count_documents({}) == 0
