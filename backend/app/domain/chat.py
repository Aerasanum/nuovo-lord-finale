"""
Realm chat channels (world-scoped, Bible §19 communication):
  world:{world_id}                      — every Player of the World (rate-limited, 1 message / 3 s per Player)
  nego:{alliance_a}:{alliance_b}        — private negotiation room between two Alliances (authorized roles only):
                                          Mercenary contracts are planned here before/while a commission runs.
Alliance chat keeps its own collection (alliances.py). Messages are append-only; clients poll with an `after` cursor.
"""
import uuid

from app.core import clock
from app.core.db import db
from app.core.errors import ApiError
from app.domain import alliances

WORLD_RATE_SECONDS = 3
NEGO_ROLES = ("LEADER", "VICE", "DIPLOMAT")


def dto(m: dict) -> dict:
    return {"message_id": m["_id"], "channel": m["channel"], "player_id": m.get("player_id"), "house_name": m.get("house_name"), "alliance_tag": m.get("alliance_tag"), "alliance_id": m.get("alliance_id"), "role": m.get("role"), "text": m["text"], "at": clock.iso(m["at"])}


def _clean(text: str) -> str:
    text = (text or "").strip()
    if not 1 <= len(text) <= 500:
        raise ApiError("INVALID_MESSAGE", "Message must be 1–500 characters", 400)
    return text


async def history(channel: str, after: str | None, limit: int = 50) -> list[dict]:
    flt: dict = {"channel": channel}
    if after:
        flt["at"] = {"$gt": clock.parse(after)}
    cur = db().chat_messages.find(flt).sort([("at", -1), ("_id", -1)]).limit(max(1, min(200, limit)))
    rows = [dto(m) async for m in cur]
    rows.reverse()
    return rows


async def _post(channel: str, player: dict, text: str, role: str | None) -> dict:
    doc = {"_id": f"msg_{uuid.uuid4().hex[:12]}", "world_id": player["world_id"], "channel": channel, "player_id": player["_id"], "house_name": player["house_name"], "alliance_tag": player.get("alliance_tag"), "alliance_id": player.get("alliance_id"), "role": role, "text": text, "at": clock.now()}
    await db().chat_messages.insert_one(doc)
    return dto(doc)


# ------------------------------------------------------------------------------------------------ world
def world_channel(world_id: str) -> str:
    return f"world:{world_id}"


async def post_world(player: dict, text: str) -> dict:
    text = _clean(text)
    last = await db().chat_messages.find_one({"channel": world_channel(player["world_id"]), "player_id": player["_id"]}, sort=[("at", -1)])
    if last and (clock.now() - clock.aware(last["at"])).total_seconds() < WORLD_RATE_SECONDS:
        raise ApiError("RATE_LIMITED", "One message every 3 seconds", 429, {"retry_seconds": WORLD_RATE_SECONDS})
    return await _post(world_channel(player["world_id"]), player, text, None)


# ------------------------------------------------------------------------------------------------ negotiations
def nego_channel(a: str, b: str) -> str:
    x, y = sorted([a, b])
    return f"nego:{x}:{y}"


async def _nego_context(player: dict, other_alliance_id: str) -> tuple[dict, dict, str]:
    mine = await alliances.require_mine(player)
    m = alliances.member_of(mine, player["_id"])
    if not m or m["role"] not in NEGO_ROLES:
        raise ApiError("FORBIDDEN_ROLE", "Only Leader, Vice or Diplomat negotiate for the Alliance", 403)
    if other_alliance_id == mine["_id"]:
        raise ApiError("INVALID_TARGET", "Use the Alliance chat for your own Alliance", 400)
    other = await alliances.get(player["world_id"], other_alliance_id)
    return mine, other, nego_channel(mine["_id"], other["_id"])


async def nego_history(player: dict, other_alliance_id: str, after: str | None, limit: int = 50) -> dict:
    mine, other, ch = await _nego_context(player, other_alliance_id)
    return {"channel": ch, "alliance": alliances.public_dto(other), "messages": await history(ch, after, limit)}


async def post_nego(player: dict, other_alliance_id: str, text: str) -> dict:
    text = _clean(text)
    mine, other, ch = await _nego_context(player, other_alliance_id)
    m = alliances.member_of(mine, player["_id"])
    msg = await _post(ch, player, text, m["role"] if m else None)
    await alliances._notify_alliance(other, "NEGOTIATION_MESSAGE", {"from_alliance_id": mine["_id"], "from_alliance": mine["name"], "from_tag": mine["tag"], "house_name": player["house_name"], "preview": text[:80]}, f"nego:{msg['message_id']}", f"alliance/mercenary?chat={mine['_id']}", roles=list(NEGO_ROLES))
    return msg


async def nego_rooms(player: dict) -> list[dict]:
    """Every negotiation room my Alliance takes part in, newest first, with the other Alliance and the last message."""
    if not player.get("alliance_id"):
        return []
    mine_id = player["alliance_id"]
    rows: list[dict] = []
    async for m in db().chat_messages.aggregate([{"$match": {"world_id": player["world_id"], "channel": {"$regex": f"^nego:.*{mine_id}"}}}, {"$sort": {"at": -1}}, {"$group": {"_id": "$channel", "last": {"$first": "$$ROOT"}}}, {"$sort": {"last.at": -1}}, {"$limit": 30}]):
        parts = m["_id"].split(":")
        other_id = parts[2] if parts[1] == mine_id else parts[1]
        other = await db().alliances.find_one({"_id": other_id}, {"name": 1, "tag": 1, "kind": 1})
        rows.append({"channel": m["_id"], "alliance_id": other_id, "name": (other or {}).get("name"), "tag": (other or {}).get("tag"), "kind": (other or {}).get("kind"), "last": dto(m["last"])})
    return rows


async def summary(player: dict) -> dict:
    """Dock summary: last message of every channel the Player can read (world, own alliance, negotiations)."""
    world_last = await db().chat_messages.find_one({"channel": world_channel(player["world_id"])}, sort=[("at", -1)])
    out: dict = {"world": {"channel": world_channel(player["world_id"]), "last": dto(world_last) if world_last else None}, "alliance": None, "negotiations": []}
    if player.get("alliance_id"):
        al_last = await db().alliance_chat.find_one({"alliance_id": player["alliance_id"]}, sort=[("at", -1)])
        out["alliance"] = {"channel": f"alliance:{player['alliance_id']}", "last": alliances.chat_dto(al_last) if al_last else None}
        out["negotiations"] = await nego_rooms(player)
    return out
