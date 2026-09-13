"""Castle skins (cosmetic, per settlement). Unlock is server-authoritative: by settlement level (free skins) or by
account-level ownership (premium skins bought in the Negozio / included in Ruby packs — store.py).

The visual definition of each skin lives in the client (frontend/src/map3d/castle.ts); the server only knows ids and
unlock rules so it can validate and persist the choice on `settlements.skin`.
"""
from __future__ import annotations

from app.core.db import db
from app.core.errors import ApiError
from app.domain.store import PREMIUM_SKINS, SKIN_BY_ID

SKINS: list[dict] = [
    {"id": "classic", "min_level": 1},
    {"id": "sandstone", "min_level": 5},
    {"id": "royal", "min_level": 10},
    {"id": "obsidian", "min_level": 20},
]
DEFAULT_SKIN = "classic"


def catalog(doc: dict, owned: set[str]) -> dict:
    level = int(doc.get("level", 1))
    return {
        "current": doc.get("skin") or DEFAULT_SKIN,
        "level": level,
        "skins": [{**s, "premium": False, "price_rubies": None, "unlocked": level >= int(s["min_level"])} for s in SKINS]
        + [{"id": s["id"], "min_level": None, "premium": True, "price_rubies": s["tier"], "tier": s["tier"], "unlocked": s["id"] in owned} for s in PREMIUM_SKINS],
    }


async def set_skin(doc: dict, skin: str, owned: set[str]) -> dict:
    entry = next((s for s in SKINS if s["id"] == skin), None)
    if entry:
        if int(doc.get("level", 1)) < int(entry["min_level"]):
            raise ApiError("SKIN_LOCKED", "Castle skin locked: settlement level too low", 409, {"required_level": entry["min_level"], "level": int(doc.get("level", 1))})
    elif skin in SKIN_BY_ID:
        if skin not in owned:
            raise ApiError("SKIN_NOT_OWNED", "Premium castle skin not owned: buy it in the Negozio", 409, {"skin": skin, "price_rubies": SKIN_BY_ID[skin]["tier"]})
    else:
        raise ApiError("INVALID_SKIN", "Unknown castle skin", 400, {"skins": [s["id"] for s in SKINS] + list(SKIN_BY_ID)})
    await db().settlements.update_one({"_id": doc["_id"]}, {"$set": {"skin": skin}})
    doc["skin"] = skin
    return catalog(doc, owned)
