"""Casata (Bible §20 / §40.4): world-scoped 1:1 identity of a Player — name, motto, layered crest, prestige, history.
Crest layers: shield base, primary symbol, secondary mark, border, color scheme. Cosmetic only (0 gameplay power).
The default crest is deterministic from the house name so every Casata is recognisable from day one."""
from __future__ import annotations

import hashlib

from app.core import clock
from app.core.db import db
from app.core.errors import ApiError

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
        "crest": p.get("house_crest") or default_crest(p["house_name"]),
        "prestige": int(p.get("prestige", 0)),
        "history": p.get("house_history", []),
    }


async def update(player: dict, motto: str | None, crest: dict | None) -> dict:
    sets: dict = {"house_updated_at": clock.now()}
    if motto is not None:
        motto = motto.strip()
        if len(motto) > 60:
            raise ApiError("INVALID_MOTTO", "Motto max 60 characters", 400)
        sets["house_motto"] = motto or None
    if crest is not None:
        sets["house_crest"] = validate_crest(crest)
    await db().players.update_one({"_id": player["_id"]}, {"$set": sets})
    if crest is not None:
        # denormalised copies used by public map DTOs and in-flight marches
        await db().settlements.update_many({"owner_player_id": player["_id"]}, {"$set": {"owner_house_crest": sets["house_crest"]}})
        await db().marches.update_many({"player_id": player["_id"], "status": {"$in": ["OUTBOUND", "RESOLVING", "RETURNING"]}}, {"$set": {"house_crest": sets["house_crest"]}})
    fresh = await db().players.find_one({"_id": player["_id"]})
    return dto(fresh)
