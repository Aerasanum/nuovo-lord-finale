"""Castle skins (cosmetic, per settlement). Unlock is server-authoritative: by settlement level.

The visual definition of each skin lives in the client (frontend/src/map3d/castle.ts); the server only knows ids and
unlock thresholds so it can validate and persist the choice on `settlements.skin`.
"""
from __future__ import annotations

from app.core.db import db
from app.core.errors import ApiError

SKINS: list[dict] = [
    {"id": "classic", "min_level": 1},
    {"id": "sandstone", "min_level": 5},
    {"id": "royal", "min_level": 10},
    {"id": "obsidian", "min_level": 20},
]
DEFAULT_SKIN = "classic"


def catalog(doc: dict) -> dict:
    level = int(doc.get("level", 1))
    return {
        "current": doc.get("skin") or DEFAULT_SKIN,
        "level": level,
        "skins": [{**s, "unlocked": level >= int(s["min_level"])} for s in SKINS],
    }


async def set_skin(doc: dict, skin: str) -> dict:
    entry = next((s for s in SKINS if s["id"] == skin), None)
    if not entry:
        raise ApiError("INVALID_SKIN", "Unknown castle skin", 400, {"skins": [s["id"] for s in SKINS]})
    if int(doc.get("level", 1)) < int(entry["min_level"]):
        raise ApiError("SKIN_LOCKED", "Castle skin locked: settlement level too low", 409, {"required_level": entry["min_level"], "level": int(doc.get("level", 1))})
    await db().settlements.update_one({"_id": doc["_id"]}, {"$set": {"skin": skin}})
    doc["skin"] = skin
    return catalog(doc)
