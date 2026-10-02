"""Account erasure (Google Play User Data policy).

What we hold the implementation to: the person disappears, the realm does not break, and the money trail survives.

In-process suite (no live server): `cd backend && pytest tests/test_account_deletion.py -o addopts=''`.
"""
from __future__ import annotations

import uuid

import pytest

from app.core.db import db
from app.domain import account
from tests.conftest import join, register

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_the_account_and_every_session_are_gone(client, world):
    acc = await register(client)
    account_id = acc["account"]["account_id"]
    # A second device: two live refresh sessions, so we see that erasure is not just "the caller's own token".
    second = await client.post("/api/auth/login", json={"email": acc["email"], "password": acc["password"]})
    assert second.status_code == 200
    assert await db().refresh_sessions.count_documents({"account_id": account_id}) == 2

    r = await client.post("/api/auth/account/delete", json={"password": acc["password"]}, headers=acc["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["deleted"] is True

    assert await db().accounts.find_one({"_id": account_id}) is None
    assert await db().accounts.find_one({"email": acc["email"]}) is None
    assert await db().refresh_sessions.count_documents({"account_id": account_id}) == 0
    assert await db().user_sessions.count_documents({"account_id": account_id}) == 0
    # The token in hand stops working the moment the account does.
    assert (await client.get("/api/auth/me", headers=acc["headers"])).status_code == 401
    # And the other device's refresh token cannot resurrect it.
    assert (await client.post("/api/auth/refresh", json={"refresh_token": second.json()["refresh_token"]})).status_code == 401


async def test_the_email_can_be_used_again(client, world):
    """Erasure that leaves the address unusable is not erasure: the unique index must be free again."""
    acc = await register(client)
    await client.post("/api/auth/account/delete", json={"password": acc["password"]}, headers=acc["headers"])
    again = await client.post("/api/auth/register", json={"email": acc["email"], "password": "Password123!", "display_name": "again"})
    assert again.status_code == 200, again.text
    assert again.json()["account"]["account_id"] != acc["account"]["account_id"]


async def test_the_wrong_password_erases_nothing(client, world):
    acc = await register(client)
    r = await client.post("/api/auth/account/delete", json={"password": "not-the-password"}, headers=acc["headers"])
    assert r.status_code == 401 and r.json()["code"] == "INVALID_CREDENTIALS"
    assert await db().accounts.find_one({"_id": acc["account"]["account_id"]}) is not None
    assert (await client.get("/api/auth/me", headers=acc["headers"])).status_code == 200


async def test_a_password_account_must_say_the_password(client, world):
    acc = await register(client)
    r = await client.post("/api/auth/account/delete", json={}, headers=acc["headers"])
    assert r.status_code == 400 and r.json()["code"] == "PASSWORD_REQUIRED"
    assert await db().accounts.find_one({"_id": acc["account"]["account_id"]}) is not None


async def test_an_anonymous_caller_cannot_erase_anybody(client, world):
    assert (await client.post("/api/auth/account/delete", json={"password": "x"})).status_code == 401


async def test_the_lord_retires_and_the_house_loses_its_name(client, world):
    acc = await register(client)
    house = f"Casa {uuid.uuid4().hex[:6]}"
    joined = await join(client, acc, world["_id"], house)
    pid = joined["player"]["player_id"]
    # Say something in the world chat: the name is denormalised into the message and must not outlive the account.
    said = await client.post(f"/api/worlds/{world['_id']}/chat/world", json={"text": "Addio a tutti"}, headers=acc["headers"])
    assert said.status_code == 201, said.text

    r = await client.post("/api/auth/account/delete", json={"password": acc["password"]}, headers=acc["headers"])
    assert r.status_code == 200 and r.json()["realms"] == 1

    player = await db().players.find_one({"_id": pid})
    assert player is not None, "the row other documents point at must survive"
    assert player["status"] == "ELIMINATED"
    assert player["account_id"] == f"deleted:{pid}"
    assert player["house_name"].startswith(account.DISSOLVED_HOUSE)
    assert house not in player["house_name"]
    message = await db().chat_messages.find_one({"player_id": pid})
    assert message["house_name"] == player["house_name"]
    # Nothing in the realm still claims a castle for the retired Lord.
    assert await db().settlements.count_documents({"owner_player_id": pid}) == 0


async def test_the_house_name_is_free_for_the_next_lord(client, world):
    """`(world_id, house_name_lc)` is unique, and the dissolved names must not squat on it or on each other."""
    house = f"Casa {uuid.uuid4().hex[:6]}"
    first = await register(client)
    await join(client, first, world["_id"], house)
    await client.post("/api/auth/account/delete", json={"password": first["password"]}, headers=first["headers"])

    second = await register(client)
    joined = await join(client, second, world["_id"], house)
    assert joined["player"]["house_name"] == house
    await client.post("/api/auth/account/delete", json={"password": second["password"]}, headers=second["headers"])

    dissolved = [p async for p in db().players.find({"world_id": world["_id"], "account_id": {"$regex": "^deleted:"}})]
    names = [p["house_name_lc"] for p in dissolved]
    assert len(names) == len(set(names)), f"two dissolved houses collided: {names}"


async def test_purchases_outlive_the_account(client, world):
    """Google can refund months later and the books have to answer: the receipt stays, pointing at nobody."""
    acc = await register(client)
    account_id = acc["account"]["account_id"]
    await db().store_purchases.insert_one(
        {"transaction_id": f"tx_{uuid.uuid4().hex[:10]}", "account_id": account_id, "product_id": "eld_rubies_199", "source": "TEST"}
    )
    r = await client.post("/api/auth/account/delete", json={"password": acc["password"]}, headers=acc["headers"])
    assert r.status_code == 200 and r.json()["purchases_retained"] == 1
    assert await db().store_purchases.count_documents({"account_id": account_id}) == 1


async def test_the_audit_trail_records_the_erasure_without_undoing_it(client, world):
    acc = await register(client)
    account_id = acc["account"]["account_id"]
    await client.post("/api/auth/account/delete", json={"password": acc["password"]}, headers=acc["headers"])
    entry = await db().audit.find_one({"type": "account_deleted", "account_id": account_id})
    assert entry is not None
    assert acc["email"] not in str(entry), "an erasure that keeps the address on file is not an erasure"
