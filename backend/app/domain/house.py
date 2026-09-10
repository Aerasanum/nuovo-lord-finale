"""Casata (Bible §20 / §40.4): world-scoped 1:1 identity of a Player — name, motto, layered crest, prestige, history.
Crest layers: shield base, primary symbol, secondary mark, border, color scheme. Cosmetic only (0 gameplay power).
The default crest is deterministic from the house name so every Casata is recognisable from day one."""
from __future__ import annotations

import hashlib

from app.core import clock
from app.core.db import db
from app.core.errors import ApiError
from app.core.spec import get_spec

SHIELD_BASES = ["heater", "round", "kite", "square"]
SYMBOLS = ["circle", "diamond", "cross", "star", "chevron", "tower", "crescent", "triangle"]
MARKS = ["none", "dot", "stripe", "bar"]
BORDERS = ["none", "thin", "thick"]
# heraldic tinctures (content palette, not UI theme): or, argent, gules, azure, vert, sable, purpure, tenné
PALETTE = ["#D4AF37", "#C9CDD3", "#9E2B25", "#2F5D9E", "#3F7A3A", "#1E1B18", "#6B2D7A", "#C46A1F"]


def default_crest(house_name: str) -> dict:
    h = hashlib.sha256(house_name.strip().lower().encode()).digest()
    base_color = h[0] % len(PALETTE)
    primary = (base_color + 1 + h[1] % (len(PALETTE) - 1)) % len(PALETTE)  # never equal to the base
    return {
        "shield_base": SHIELD_BASES[h[2] % len(SHIELD_BASES)],
        "primary_symbol": SYMBOLS[h[3] % len(SYMBOLS)],
        "secondary_mark": MARKS[h[4] % len(MARKS)],
        "border": BORDERS[h[5] % len(BORDERS)],
        "colors": {"base": PALETTE[base_color], "primary": PALETTE[primary], "secondary": PALETTE[h[6] % len(PALETTE)], "border": PALETTE[h[7] % len(PALETTE)]},
    }


def validate_crest(c: dict) -> dict:
    try:
        colors = c["colors"]
        out = {
            "shield_base": c["shield_base"],
            "primary_symbol": c["primary_symbol"],
            "secondary_mark": c.get("secondary_mark", "none"),
            "border": c.get("border", "none"),
            "colors": {k: str(colors[k]).upper() for k in ("base", "primary", "secondary", "border")},
        }
    except (KeyError, TypeError):
        raise ApiError("INVALID_CREST", "Crest needs shield_base, primary_symbol, secondary_mark, border and colors{base,primary,secondary,border}", 400)
    if out["shield_base"] not in SHIELD_BASES or out["primary_symbol"] not in SYMBOLS or out["secondary_mark"] not in MARKS or out["border"] not in BORDERS:
        raise ApiError("INVALID_CREST", "Unknown crest layer value", 400, {"shield_bases": SHIELD_BASES, "symbols": SYMBOLS, "marks": MARKS, "borders": BORDERS})
    pal = {p.upper() for p in PALETTE}
    if any(v not in pal for v in out["colors"].values()):
        raise ApiError("INVALID_CREST", "Colors must come from the heraldic palette", 400, {"palette": PALETTE})
    if out["colors"]["base"] == out["colors"]["primary"]:
        raise ApiError("INVALID_CREST", "Primary symbol colour must differ from the shield base", 400)
    return out


def catalog() -> dict:
    return {"shield_bases": SHIELD_BASES, "symbols": SYMBOLS, "marks": MARKS, "borders": BORDERS, "palette": PALETTE}


def dto(p: dict) -> dict:
    return {
        "house_name": p["house_name"],
        "motto": p.get("house_motto"),
        "description": p.get("house_description"),
        "crest": p.get("house_crest") or default_crest(p["house_name"]),
        "prestige": int(p.get("prestige", 0)),
        "history": [{**h, "at": clock.iso(h.get("at"))} for h in (p.get("house_history") or [])[-30:]][::-1],
    }


async def update(player: dict, motto: str | None, crest: dict | None, description: str | None = None) -> dict:
    sets: dict = {"house_updated_at": clock.now()}
    if motto is not None:
        motto = motto.strip()
        if len(motto) > 60:
            raise ApiError("INVALID_MOTTO", "Motto max 60 characters", 400)
        sets["house_motto"] = motto or None
    if description is not None:
        description = description.strip()
        if len(description) > 300:
            raise ApiError("INVALID_DESCRIPTION", "Description max 300 characters", 400)
        sets["house_description"] = description or None
    if crest is not None:
        sets["house_crest"] = validate_crest(crest)
    await db().players.update_one({"_id": player["_id"]}, {"$set": sets})
    if crest is not None:
        # denormalised copies used by public map DTOs and in-flight marches
        await db().settlements.update_many({"owner_player_id": player["_id"]}, {"$set": {"owner_house_crest": sets["house_crest"]}})
        await db().marches.update_many({"player_id": player["_id"], "status": {"$in": ["OUTBOUND", "RESOLVING", "RETURNING"]}}, {"$set": {"house_crest": sets["house_crest"]}})
        await _first_banner(player, sets["house_crest"])
    fresh = await db().players.find_one({"_id": player["_id"]})
    return dto(fresh)


def crest_layers_changed(house_name: str, crest: dict) -> int:
    """Number of the 5 canonical layers (shield_base, primary_symbol, secondary_mark, border, color_scheme) differing from the default."""
    d = default_crest(house_name)
    n = sum(1 for k in ("shield_base", "primary_symbol", "secondary_mark", "border") if crest.get(k) != d[k])
    if {k: v.upper() for k, v in crest["colors"].items()} != {k: v.upper() for k, v in d["colors"].items()}:
        n += 1
    return n


async def _first_banner(player: dict, crest: dict) -> None:
    """Prima Bandiera (spec.missions first_banner): one-shot per World — save a valid crest with ≥3 layers changed."""
    from app.domain import notifications, progress  # local import (progress → notifications)

    cat = next(m for m in get_spec().missions["catalog"] if m["key"] == "first_banner")
    if crest_layers_changed(player["house_name"], crest) < int(cat["requirements"]["crest_layers_changed_from_default_min"]):
        return
    res = await db().players.update_one({"_id": player["_id"], "cosmetics": {"$ne": cat["reward"]["cosmetic_unlock"]}}, {"$addToSet": {"cosmetics": {"$each": [cat["reward"]["cosmetic_unlock"], "first_banner"]}}})
    if not res.modified_count:
        return
    await progress.award_prestige(player["world_id"], player["_id"], int(cat["reward"]["prestige"]), "first_banner", player["_id"])
    await notifications.notify(player["world_id"], player["_id"], "MISSION_COMPLETED", {"mission_key": "first_banner", "name": cat["name"], "reward": cat["reward"], "completion_id": f"fb:{player['_id']}"}, dedupe_key=f"fb:{player['_id']}", deep_link="missions")


async def rename(player: dict, new_name: str) -> dict:
    """Unique-per-world House rename (Bible §20 / §23 cosmetic). Denormalised copies (settlements, marches, alliance
    members, invites, chat) follow the Player document."""
    new_name = (new_name or "").strip()
    if not 3 <= len(new_name) <= 40:
        raise ApiError("INVALID_HOUSE_NAME", "House name must be 3–40 characters", 400)
    if new_name.lower() != player["house_name"].lower() and await db().players.find_one({"world_id": player["world_id"], "house_name_lc": new_name.lower()}):
        raise ApiError("HOUSE_NAME_TAKEN", "House name already used in this world", 409)
    now = clock.now()
    await db().players.update_one({"_id": player["_id"]}, {"$set": {"house_name": new_name, "house_name_lc": new_name.lower(), "house_updated_at": now}, "$push": {"house_history": {"$each": [{"kind": "RENAMED", "from": player["house_name"], "to": new_name, "at": now}], "$slice": -200}}})
    await db().settlements.update_many({"owner_player_id": player["_id"]}, {"$set": {"owner_house_name": new_name}})
    await db().marches.update_many({"player_id": player["_id"], "status": {"$in": ["OUTBOUND", "RESOLVING", "RETURNING"]}}, {"$set": {"house_name": new_name}})
    await db().alliances.update_many({"members.player_id": player["_id"]}, {"$set": {"members.$.house_name": new_name}})
    await db().alliance_chat.update_many({"player_id": player["_id"]}, {"$set": {"house_name": new_name}})
    fresh = await db().players.find_one({"_id": player["_id"]})
    return dto(fresh)
