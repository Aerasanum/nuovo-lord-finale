"""Shared fixtures: isolated test DB, generated world, registered accounts, ASGI client, manual scheduler."""
from __future__ import annotations

import os
import uuid

os.environ["DB_NAME"] = f"eld_test_{os.environ.get('PYTEST_XDIST_WORKER', 'main')}"
os.environ["SCHEDULER_ENABLED"] = "false"
os.environ["WORLD_AUTO_CREATE"] = "false"
os.environ["QA_ENDPOINTS_ENABLED"] = "true"
os.environ.setdefault("ADMIN_API_KEY", "test-admin-key-0123456789")
# The suite registers dozens of throwaway accounts from one address and drives months of play in seconds, which is
# the traffic the action ceiling exists to stop. Both limiters are covered by tests/test_hardening.py, which sets
# its own threshold rather than relying on the default.
os.environ["RATE_LIMIT_REGISTER_PER_HOUR"] = "0"
os.environ["RATE_LIMIT_ACTIONS_PER_MINUTE"] = "0"

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from pymongo import MongoClient  # noqa: E402

from app.core import clock, config  # noqa: E402
from app.core.db import close, db, ensure_indexes  # noqa: E402
from app.domain import scheduler, worlds  # noqa: E402

ADMIN = {"X-Admin-Key": config.ADMIN_API_KEY}


@pytest.fixture(scope="session", autouse=True)
def release_throwaway_player_slots():
    """Hand back the spawn slots the live-server suite consumed (no-op for the in-process suite, which drops its DB).

    A realm has a fixed number of seats. Without this every e2e run eats a few until joins answer WORLD_FULL and
    modules start failing on state they never created.
    """
    yield
    from tests.e2e_base import purge_tracked_players

    purge_tracked_players()


@pytest_asyncio.fixture(scope="session")
async def world():
    MongoClient(config.MONGO_URL).drop_database(config.DB_NAME)
    close()
    await ensure_indexes()
    w = await worlds.create_world("Test World", seed=7)
    yield w
    close()


@pytest_asyncio.fixture(scope="session")
async def client(world):
    import server

    transport = ASGITransport(app=server.app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def register(client: AsyncClient, tag: str | None = None) -> dict:
    tag = tag or uuid.uuid4().hex[:8]
    r = await client.post("/api/auth/register", json={"email": f"{tag}@eldgame.it", "password": "Password123!", "display_name": tag})
    assert r.status_code == 200, r.text
    data = r.json()
    return {"headers": {"Authorization": f"Bearer {data['access_token']}"}, "email": f"{tag}@eldgame.it", "password": "Password123!", **data}


async def join(client: AsyncClient, acc: dict, world_id: str, house: str | None = None) -> dict:
    house = house or f"Casa {uuid.uuid4().hex[:6]}"
    r = await client.post(f"/api/worlds/{world_id}/join", json={"house_name": house}, headers=acc["headers"])
    assert r.status_code == 200, r.text
    me = await client.get(f"/api/worlds/{world_id}/me", headers=acc["headers"])
    assert me.status_code == 200
    data = me.json()
    return {"player": data["player"], "settlement_id": data["settlements"][0]["settlement_id"], "settlement": data["settlements"][0]}


async def advance(seconds: float) -> int:
    clock.advance(seconds)
    return await scheduler.run_due_once(limit=10000)


async def grant(settlement_id: str, **fields) -> None:
    sets = {}
    for r, v in (fields.get("resources") or {}).items():
        sets[f"resources.{r}"] = int(v)
    for u, v in (fields.get("army") or {}).items():
        sets[f"army.{u}"] = int(v)
    for b, v in (fields.get("buildings") or {}).items():
        sets[f"buildings.{b}"] = int(v)
    for k, v in (fields.get("research") or {}).items():
        sets[f"research.{k.replace('.', '__')}"] = int(v)
    if fields.get("level") is not None:
        sets["level"] = int(fields["level"])
        sets["buildings.Castello / Fortezza"] = int(fields["level"])
    await db().settlements.update_one({"_id": settlement_id}, {"$set": sets})
