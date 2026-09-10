"""MongoDB access + indexes matching domain invariants."""
from __future__ import annotations

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING

from app.core import config

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


def db() -> AsyncIOMotorDatabase:
    global _client, _db
    if _db is None:
        _client = AsyncIOMotorClient(config.MONGO_URL)
        _db = _client[config.DB_NAME]
    return _db


def close() -> None:
    global _client, _db
    if _client is not None:
        _client.close()
    _client = None
    _db = None


async def ensure_indexes() -> None:
    d = db()
    await d.accounts.create_index("email", unique=True)
    await d.refresh_sessions.create_index("token_hash", unique=True)
    await d.refresh_sessions.create_index("expires_at", expireAfterSeconds=0)
    await d.user_sessions.create_index("session_token", unique=True)
    await d.user_sessions.create_index("expires_at", expireAfterSeconds=0)

    await d.worlds.create_index("status")
    await d.map_chunks.create_index([("world_id", ASCENDING), ("cx", ASCENDING), ("cy", ASCENDING)], unique=True)

    await d.players.create_index([("world_id", ASCENDING), ("account_id", ASCENDING)], unique=True)
    await d.players.create_index([("world_id", ASCENDING), ("house_name_lc", ASCENDING)], unique=True)

    await d.settlements.create_index([("world_id", ASCENDING), ("x", ASCENDING), ("y", ASCENDING)], unique=True)
    await d.settlements.create_index([("world_id", ASCENDING), ("owner_player_id", ASCENDING)])
    await d.settlements.create_index([("world_id", ASCENDING), ("kind", ASCENDING), ("slot_status", ASCENDING)])
    await d.settlements.create_index([("world_id", ASCENDING), ("chunk_cx", ASCENDING), ("chunk_cy", ASCENDING)])

    await d.jobs.create_index([("world_id", ASCENDING), ("settlement_id", ASCENDING), ("status", ASCENDING)])
    await d.jobs.create_index(
        [("world_id", ASCENDING), ("player_id", ASCENDING), ("idempotency_key", ASCENDING)],
        unique=True,
        partialFilterExpression={"idempotency_key": {"$type": "string"}},
    )

    await d.scheduled_events.create_index("effect_key", unique=True)
    await d.scheduled_events.create_index([("status", ASCENDING), ("scheduled_at", ASCENDING), ("priority", ASCENDING), ("_id", ASCENDING)])
    await d.scheduled_events.create_index([("world_id", ASCENDING), ("entity_id", ASCENDING)])

    await d.marches.create_index([("world_id", ASCENDING), ("player_id", ASCENDING), ("status", ASCENDING)])
    await d.marches.create_index([("world_id", ASCENDING), ("status", ASCENDING)])
    await d.marches.create_index(
        [("world_id", ASCENDING), ("player_id", ASCENDING), ("idempotency_key", ASCENDING)],
        unique=True,
        partialFilterExpression={"idempotency_key": {"$type": "string"}},
    )

    await d.battles.create_index([("world_id", ASCENDING), ("participants", ASCENDING), ("created_at", DESCENDING)])
    await d.inbox.create_index([("world_id", ASCENDING), ("player_id", ASCENDING), ("created_at_utc", DESCENDING)])
    await d.inbox.create_index("event_id", unique=True)

    await d.territory_tiles.create_index([("world_id", ASCENDING), ("x", ASCENDING), ("y", ASCENDING)], unique=True)
    await d.territory_tiles.create_index([("world_id", ASCENDING), ("owner_player_id", ASCENDING)])
    await d.territory_tiles.create_index([("world_id", ASCENDING), ("chunk_cx", ASCENDING), ("chunk_cy", ASCENDING)])

    await d.sentinels.create_index([("world_id", ASCENDING), ("settlement_id", ASCENDING)])
    await d.sentinels.create_index([("world_id", ASCENDING), ("x", ASCENDING), ("y", ASCENDING)])
    await d.audit.create_index([("world_id", ASCENDING), ("type", ASCENDING), ("at", DESCENDING)])
    await d.missions.create_index([("world_id", ASCENDING), ("player_id", ASCENDING), ("status", ASCENDING)])
    await d.chronicle.create_index([("world_id", ASCENDING), ("at", DESCENDING)])
    # alliances (Bible §19 / §40)
    await d.alliances.create_index([("world_id", ASCENDING), ("status", ASCENDING), ("name_lc", ASCENDING)])
    await d.alliances.create_index([("world_id", ASCENDING), ("members.player_id", ASCENDING)])
    await d.alliance_invites.create_index([("player_id", ASCENDING), ("status", ASCENDING), ("expires_at", DESCENDING)])
    await d.alliance_relations.create_index([("world_id", ASCENDING), ("alliances", ASCENDING), ("state", ASCENDING)])
    await d.alliance_chat.create_index([("alliance_id", ASCENDING), ("at", DESCENDING)])
    await d.emerald_ledger.create_index([("alliance_id", ASCENDING), ("at", DESCENDING)])
    await d.mercenary_contracts.create_index([("world_id", ASCENDING), ("status", ASCENDING), ("provider_alliance_id", ASCENDING)])
    await d.war_votes.create_index([("alliance_id", ASCENDING), ("status", ASCENDING)])

