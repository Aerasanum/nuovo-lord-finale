"""Security and concurrency hardening: auth throttling, admin key gate, idempotent Ruby wallet, spend rollback.

In-process suite (no live server): `cd backend && pytest tests/test_hardening.py -o addopts=''`.
"""
from __future__ import annotations

import asyncio
import uuid

import pytest

from app.core import config
from app.core.db import db
from app.domain import construction, premium
from tests.conftest import ADMIN, register

pytestmark = pytest.mark.asyncio(loop_scope="session")


def _db_with_failing_insert(collection: str):
    """Return a `db()` replacement whose `collection.insert_one` always fails; every other call hits the real DB."""

    class FailingCollection:
        def __init__(self, real):
            self._real = real

        def __getattr__(self, name):
            return getattr(self._real, name)

        async def insert_one(self, *_args, **_kwargs):
            raise RuntimeError("simulated write failure")

    class DbProxy:
        def __init__(self, real):
            self._real = real

        def __getattr__(self, name):
            real = getattr(self._real, name)
            return FailingCollection(real) if name == collection else real

    real_db = db()
    return lambda: DbProxy(real_db)


# ------------------------------------------------------------------------------------------------ auth throttling
async def test_repeated_failed_logins_are_locked_out(client, world, monkeypatch):
    acc = await register(client)
    monkeypatch.setattr(config, "RATE_LIMIT_LOGIN_FAILURES", 3)
    codes = []
    for _ in range(5):
        r = await client.post("/api/auth/login", json={"email": acc["email"], "password": "definitely-wrong"})
        codes.append(r.json()["code"])
    assert codes[:3] == ["INVALID_CREDENTIALS"] * 3, codes
    assert codes[-1] == "TOO_MANY_REQUESTS", codes
    r = await client.post("/api/auth/login", json={"email": acc["email"], "password": "definitely-wrong"})
    assert r.status_code == 429 and r.json()["details"]["retry_after_seconds"] > 0


async def test_successful_login_clears_the_failure_window(client, world, monkeypatch):
    acc = await register(client)
    monkeypatch.setattr(config, "RATE_LIMIT_LOGIN_FAILURES", 3)
    for _ in range(2):
        await client.post("/api/auth/login", json={"email": acc["email"], "password": "definitely-wrong"})
    ok = await client.post("/api/auth/login", json={"email": acc["email"], "password": acc["password"]})
    assert ok.status_code == 200
    # the window was reset, so the next two typos must not trip the limiter
    for _ in range(2):
        r = await client.post("/api/auth/login", json={"email": acc["email"], "password": "definitely-wrong"})
        assert r.json()["code"] == "INVALID_CREDENTIALS"


async def test_registration_is_rate_limited_per_address(client, world, monkeypatch):
    from app.api import routes_auth

    monkeypatch.setattr(config, "RATE_LIMIT_REGISTER_PER_HOUR", 2)
    tag = uuid.uuid4().hex[:8]
    monkeypatch.setattr(routes_auth, "_client_ip", lambda _request: f"10.0.0.{tag[:2]}")
    codes = []
    for i in range(4):
        r = await client.post("/api/auth/register", json={"email": f"{tag}-{i}@eldgame.it", "password": "Password123!", "display_name": f"{tag}{i}"})
        codes.append(r.status_code)
    assert codes[:2] == [200, 200], codes
    assert codes[-1] == 429, codes


# ------------------------------------------------------------------------------------------------ admin gate
async def test_admin_endpoints_reject_wrong_or_missing_key(client):
    assert (await client.get("/api/qa/clock")).status_code == 403
    assert (await client.get("/api/qa/clock", headers={"X-Admin-Key": "wrong-key-wrong-key"})).status_code == 403
    assert (await client.get("/api/qa/clock", headers=ADMIN)).status_code == 200


# ------------------------------------------------------------------------------------------------ Ruby wallet
async def test_parallel_grants_with_one_key_credit_once(client, world):
    acc = await register(client)
    account_id = acc["account"]["account_id"]
    key = f"test-grant-{uuid.uuid4().hex[:8]}"
    await asyncio.gather(*[premium.grant(account_id, 500, "QA_GRANT", {"note": "race"}, key) for _ in range(8)])
    assert await premium.balance(account_id) == 500
    assert await db().ruby_transactions.count_documents({"account_id": account_id, "idempotency_key": key}) == 1


async def test_parallel_debits_with_one_key_charge_once(client, world):
    acc = await register(client)
    account_id = acc["account"]["account_id"]
    await premium.grant(account_id, 1000, "QA_GRANT", {"note": "seed"}, f"seed-{uuid.uuid4().hex[:8]}")
    key = f"test-debit-{uuid.uuid4().hex[:8]}"
    await asyncio.gather(*[premium._debit(account_id, 300, "COSMETIC_HOUSE_RENAME", {"note": "race"}, key, None) for _ in range(6)])
    assert await premium.balance(account_id) == 700
    assert await db().ruby_transactions.count_documents({"account_id": account_id, "idempotency_key": key}) == 1


async def test_refund_restores_the_balance_once(client, world):
    acc = await register(client)
    account_id = acc["account"]["account_id"]
    await premium.grant(account_id, 400, "QA_GRANT", {"note": "seed"}, f"seed-{uuid.uuid4().hex[:8]}")
    await premium._debit(account_id, 400, "CASTLE_SKIN_PURCHASE", {"skin": "frost"}, f"buy-{uuid.uuid4().hex[:8]}", None)
    assert await premium.balance(account_id) == 0
    key = f"refund-{uuid.uuid4().hex[:8]}"
    await premium.refund(account_id, 400, "CASTLE_SKIN_PURCHASE_REFUND", {"skin": "frost"}, key)
    await premium.refund(account_id, 400, "CASTLE_SKIN_PURCHASE_REFUND", {"skin": "frost"}, key)
    assert await premium.balance(account_id) == 400


# ------------------------------------------------------------------------------------------------ spend rollback
async def test_failed_job_insert_gives_the_resources_back(client, world, monkeypatch):
    """No multi-document transactions here: a failing insert must not leave the Player charged for a missing job."""
    from tests.conftest import grant, join

    acc = await register(client)
    joined = await join(client, acc, world["_id"])
    sid = joined["settlement_id"]
    await grant(sid, level=5, resources={r: 500_000 for r in ("Grano", "Legno", "Argilla", "Ferro", "Oro")})
    before = await db().settlements.find_one({"_id": sid})
    player = await db().players.find_one({"_id": joined["player"]["player_id"]})

    monkeypatch.setattr(construction, "db", _db_with_failing_insert("jobs"))
    with pytest.raises(RuntimeError):
        await construction.start_building(before, player, "Magazzino", None)

    after = await db().settlements.find_one({"_id": sid})
    assert after["resources"] == before["resources"], "resources must be restored"
    assert int(after.get("construction_active", 0)) == int(before.get("construction_active", 0))
    assert "Magazzino" not in after.get("busy_targets", [])
