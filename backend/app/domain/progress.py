"""Progression ledger (Bible §20 / §22 / §31.8 / §39): Prestige events, achievement tracks (cosmetic tiers only),
World Chronicle and the world-scoped one-shot / record challenges that hang off existing gameplay events.

Everything here is *derived* from authoritative gameplay outcomes and never feeds back into ATK/DEF/economy
(spec.achievements.gameplay_power_reward = false).
"""
from __future__ import annotations

import uuid
from datetime import timedelta

from app.core import clock
from app.core.db import db
from app.core.spec import get_spec
from app.domain import notifications

# Prestige values: spec.house.prestige_sources + Bible §20 table (neutral conquest +5, PvP battle victory +2).
PRESTIGE = {
    "pvp_defense_win": 10,
    "pvp_settlement_conquest": 25,
    "neutral_conquest": 5,
    "pvp_battle_win": 2,
    "mercenary_contract_success_provider": 10,
}

TRACKS = ("kills", "successful_defenses", "conquests", "supports", "territory_tiles", "caravans_intercepted")
HISTORY_CAP = 200


# ----------------------------------------------------------------------------------------------- prestige
async def award_prestige(world_id: str, player_id: str | None, points: int, reason: str, ref: str | None = None) -> None:
    """Append-only house history + counter; idempotent per (reason, ref) so replayed events never double-award."""
    if not player_id or points <= 0:
        return
    key = f"{reason}:{ref}" if ref else f"{reason}:{uuid.uuid4().hex}"
    before = await db().players.find_one_and_update(
        {"_id": player_id, "prestige_keys": {"$ne": key}},
        {
            "$inc": {"prestige": int(points)},
            "$push": {"prestige_keys": {"$each": [key], "$slice": -1000}, "house_history": {"$each": [{"at": clock.now(), "kind": "PRESTIGE", "reason": reason, "points": int(points), "ref": ref}], "$slice": -HISTORY_CAP}},
        },
        projection={"prestige": 1},
    )
    if before is not None:
        await db().audit.insert_one({"world_id": world_id, "type": "prestige", "player_id": player_id, "reason": reason, "points": int(points), "ref": ref, "at": clock.now()})
        from app.domain import house  # local import: march-skin Prestige rewards (Bible §41.3)

        await house.prestige_skin_unlocks(world_id, player_id, int(before.get("prestige", 0)), int(before.get("prestige", 0)) + int(points))


# -------------------------------------------------------------------------------------------- achievements
def tier_of(track: str, value: int) -> int:
    th = get_spec().achievements["tracks"][track]["thresholds"]
    return sum(1 for t in th if value >= int(t))


async def track_add(world_id: str, player_id: str | None, track: str, amount: int, ref: str | None = None) -> None:
    """Increment an achievement counter (idempotent per ref) and unlock heraldic tiers when thresholds are crossed."""
    if not player_id or amount <= 0 or track not in TRACKS:
        return
    flt: dict = {"_id": player_id}
    upd: dict = {"$inc": {f"achievements.{track}": int(amount)}}
    if ref:
        key = f"{track}:{ref}"
        flt["achievement_keys"] = {"$ne": key}
        upd["$push"] = {"achievement_keys": {"$each": [key], "$slice": -2000}}
    doc = await db().players.find_one_and_update(flt, upd, return_document=True)
    if doc:
        await _check_tiers(world_id, doc, track)


async def track_set_max(world_id: str, player_id: str | None, track: str, value: int) -> None:
    """Tracks measured as a level (territory tiles): keep the maximum ever reached."""
    if not player_id or track not in TRACKS:
        return
    doc = await db().players.find_one_and_update({"_id": player_id}, {"$max": {f"achievements.{track}": int(value)}}, return_document=True)
    if doc:
        await _check_tiers(world_id, doc, track)


async def _check_tiers(world_id: str, player: dict, track: str) -> None:
    value = int((player.get("achievements") or {}).get(track, 0))
    have = int((player.get("achievement_tiers") or {}).get(track, 0))
    tier = tier_of(track, value)
    if tier <= have:
        return
    deco = get_spec().achievements["tracks"][track]["decoration"]
    unlock = f"{track}_tier_{tier}"
    await db().players.update_one(
        {"_id": player["_id"]},
        {"$set": {f"achievement_tiers.{track}": tier}, "$addToSet": {"cosmetics": unlock}, "$push": {"house_history": {"$each": [{"at": clock.now(), "kind": "ACHIEVEMENT", "track": track, "tier": tier, "decoration": deco}], "$slice": -HISTORY_CAP}}},
    )
    await notifications.notify(world_id, player["_id"], "MISSION_COMPLETED", {"mission_key": f"achievement:{track}", "reward": {"cosmetic_unlock": unlock, "decoration": deco, "tier": tier}, "completion_id": f"ach:{player['_id']}:{track}:{tier}"}, dedupe_key=f"ach:{player['_id']}:{track}:{tier}", deep_link="missions")


async def refresh_territory_track(world_id: str, player_id: str | None) -> None:
    if not player_id:
        return
    n = await db().territory_tiles.count_documents({"world_id": world_id, "owner_player_id": player_id})
    await track_set_max(world_id, player_id, "territory_tiles", n)


# ------------------------------------------------------------------------------------------------ chronicle
async def chronicle(world_id: str, kind: str, params: dict, actors: list[str], ref: str | None = None) -> None:
    """Permanent World narrative log (Bible §22) — never a gameplay source of truth."""
    doc = {"_id": f"chr_{uuid.uuid4().hex[:16]}", "world_id": world_id, "kind": kind, "params": params, "actors": actors, "ref": ref, "at": clock.now()}
    if ref and await db().chronicle.find_one({"world_id": world_id, "kind": kind, "ref": ref}):
        return
    await db().chronicle.insert_one(doc)


def chronicle_dto(c: dict) -> dict:
    return {"chronicle_id": c["_id"], "kind": c["kind"], "params": c.get("params", {}), "actors": c.get("actors", []), "at": clock.iso(c["at"])}


# ----------------------------------------------------------------------------------- world one-shots / records
async def _grant_title(world_id: str, player_id: str, key: str, title: str | None, heraldic: str | None, prestige: int, ref: str) -> None:
    sets: dict = {}
    add: dict = {"cosmetics": {"$each": [x for x in [heraldic, key] if x]}}
    if title:
        add["titles"] = title
    await db().players.update_one({"_id": player_id}, {"$addToSet": add, **({"$set": sets} if sets else {})})
    await award_prestige(world_id, player_id, prestige, key, ref)
    await notifications.notify(world_id, player_id, "MISSION_COMPLETED", {"mission_key": key, "reward": {"prestige": prestige, "title": title, "heraldic_unlock": heraldic}, "completion_id": f"{key}:{player_id}"}, dedupe_key=f"{key}:{player_id}", deep_link="missions")


async def on_battle(battle: dict) -> None:
    """Kills / defenses / prestige / largest-battle record for a persisted battle document."""
    world_id = battle["world_id"]
    rep = battle.get("report") or {}
    bid = battle["_id"]
    att = battle.get("attacker_player_id")
    dfd = battle.get("defender_player_id")
    att_kills = sum(int(v) for v in (rep.get("defender_losses") or {}).values())
    def_kills = sum(int(v) for v in (rep.get("attacker_losses") or {}).values())
    await track_add(world_id, att, "kills", att_kills, ref=bid)
    await track_add(world_id, dfd, "kills", def_kills, ref=bid)
    if not (att and dfd and att != dfd):
        return  # PvP-only rules below
    pvp_power = float(rep.get("attacker_power", 0)) + float(rep.get("defender_power", 0))
    if rep.get("winner") == "DEFENDER":
        await award_prestige(world_id, dfd, PRESTIGE["pvp_defense_win"], "pvp_defense_win", bid)
        await track_add(world_id, dfd, "successful_defenses", 1, ref=bid)
        await _window_defense(world_id, dfd, battle)
        from app.domain import alliances  # local import: alliances depends on progress

        await alliances.on_pvp_defense_win(world_id, dfd, att, bid)
    elif rep.get("winner") == "ATTACKER":
        await award_prestige(world_id, att, PRESTIGE["pvp_battle_win"], "pvp_battle_win", bid)
    # Battaglia più grande — permanent World record on total_prebattle_power (title/cosmetic only)
    w = await db().worlds.find_one_and_update({"_id": world_id, "$or": [{"records.largest_battle.power": {"$exists": False}}, {"records.largest_battle.power": {"$lt": pvp_power}}]}, {"$set": {"records.largest_battle": {"power": pvp_power, "battle_id": bid, "attacker": att, "defender": dfd, "at": clock.now()}}}, return_document=False)
    if w is not None:
        prev = ((w.get("records") or {}).get("largest_battle") or {})
        holder = att if rep.get("winner") == "ATTACKER" else dfd
        if prev.get("holder") and prev["holder"] != holder:
            await db().players.update_one({"_id": prev["holder"]}, {"$pull": {"titles": "Signore della Battaglia"}})
        await db().worlds.update_one({"_id": world_id}, {"$set": {"records.largest_battle.holder": holder}})
        await db().players.update_one({"_id": holder}, {"$addToSet": {"titles": "Signore della Battaglia", "cosmetics": "emblema_battaglia_record"}})
        await chronicle(world_id, "LARGEST_BATTLE", {"battle_id": bid, "power": round(pvp_power, 1), "attacker": att, "defender": dfd, "holder": holder}, [att, dfd], ref=bid)


async def _window_defense(world_id: str, defender: str, battle: dict) -> None:
    """Guardiani del Confine (WINDOW_CHALLENGE 168h): 3 valid PvP defense wins, ≥2 distinct attackers, attacker power ≥25% defender power."""
    cat = next(m for m in get_spec().missions["catalog"] if m["key"] == "border_guardians")
    rep = battle["report"]
    if float(rep.get("attacker_power", 0)) < float(rep.get("defender_power", 0)) * cat["requirements"]["attacker_power_min_pct_of_defender_power"] / 100.0:
        return
    now = clock.now()
    p = await db().players.find_one({"_id": defender})
    if not p:
        return
    cd = clock.aware((p.get("challenge_cooldowns") or {}).get("border_guardians"))
    if cd and cd > now:
        return
    win = [e for e in (p.get("border_guardians_window") or []) if (now - clock.aware(e["at"])).total_seconds() < cat["window_hours"] * 3600]
    win.append({"at": now, "attacker": battle["attacker_player_id"], "battle_id": battle["_id"]})
    req = cat["requirements"]
    if len(win) >= req["valid_pvp_defense_wins"] and len({e["attacker"] for e in win}) >= req["distinct_attackers_min"]:
        await db().players.update_one({"_id": defender}, {"$set": {"border_guardians_window": [], "challenge_cooldowns.border_guardians": now + timedelta(hours=cat["cooldown_hours"])}, "$addToSet": {"cosmetics": cat["reward"]["cosmetic_unlock"]}})
        await award_prestige(world_id, defender, cat["reward"]["prestige"], "border_guardians", battle["_id"])
        await notifications.notify(world_id, defender, "MISSION_COMPLETED", {"mission_key": "border_guardians", "reward": cat["reward"], "completion_id": f"bg:{battle['_id']}"}, dedupe_key=f"bg:{battle['_id']}", deep_link="missions")
    else:
        await db().players.update_one({"_id": defender}, {"$set": {"border_guardians_window": win}})


async def on_conquest(world_id: str, new_owner: str, old_owner: str | None, settlement: dict, battle_id: str) -> None:
    """Prestige + conquests track + Chronicle + Via dei Conquistatori for a completed ownership transfer."""
    pvp = bool(old_owner)
    await award_prestige(world_id, new_owner, PRESTIGE["pvp_settlement_conquest" if pvp else "neutral_conquest"], "pvp_conquest" if pvp else "neutral_conquest", battle_id)
    await track_add(world_id, new_owner, "conquests", 1, ref=battle_id)
    await chronicle(world_id, "SETTLEMENT_CONQUERED", {"settlement_id": settlement["_id"], "x": settlement["x"], "y": settlement["y"], "new_owner": new_owner, "old_owner": old_owner, "pvp": pvp}, [p for p in (new_owner, old_owner) if p], ref=battle_id)
    if pvp:
        from app.domain import alliances  # local import: alliances depends on progress

        await alliances.on_pvp_conquest(world_id, new_owner, battle_id)
        doc = await db().players.find_one_and_update({"_id": new_owner}, {"$addToSet": {"pvp_conquered_players": old_owner}}, return_document=True)
        cat = next(m for m in get_spec().missions["catalog"] if m["key"] == "path_of_conquerors")
        if doc and len(doc.get("pvp_conquered_players") or []) >= cat["requirements"]["distinct_defeated_players"] and "path_of_conquerors" not in (doc.get("cosmetics") or []):
            await _grant_title(world_id, new_owner, "path_of_conquerors", cat["reward"]["title"], cat["reward"]["heraldic_unlock"], int(cat["reward"]["additional_prestige"]), battle_id)
            await chronicle(world_id, "PATH_OF_CONQUERORS", {"player_id": new_owner, "title": cat["reward"]["title"]}, [new_owner], ref=f"poc:{new_owner}")
    await refresh_territory_track(world_id, new_owner)
    if old_owner:
        await refresh_territory_track(world_id, old_owner)


async def on_settlement_level(world_id: str, player_id: str | None, settlement: dict, new_level: int, event_id: str) -> None:
    """Prima Metropoli — first Settlement L30 of the World (atomic first-writer wins)."""
    cat = next(m for m in get_spec().missions["catalog"] if m["key"] == "first_metropolis")
    if not player_id or new_level < int(cat["requirements"]["first_player_to_upgrade_owned_settlement_to_level"]):
        return
    w = await db().worlds.find_one_and_update({"_id": world_id, "records.first_metropolis": {"$exists": False}}, {"$set": {"records.first_metropolis": {"player_id": player_id, "settlement_id": settlement["_id"], "event_id": event_id, "at": clock.now()}}})
    if w is None:
        return
    await _grant_title(world_id, player_id, "first_metropolis", cat["reward"]["title"], cat["reward"]["heraldic_unlock"], int(cat["reward"]["prestige"]), event_id)
    await chronicle(world_id, "FIRST_METROPOLIS", {"player_id": player_id, "settlement_id": settlement["_id"], "x": settlement["x"], "y": settlement["y"]}, [player_id], ref=event_id)


def progress_dto(p: dict) -> dict:
    spec = get_spec()
    ach = p.get("achievements") or {}
    tracks = []
    for t in TRACKS:
        th = spec.achievements["tracks"][t]["thresholds"]
        v = int(ach.get(t, 0))
        tier = tier_of(t, v)
        tracks.append({"track": t, "value": v, "tier": tier, "thresholds": th, "next_threshold": next((x for x in th if v < x), None), "decoration": spec.achievements["tracks"][t]["decoration"]})
    return {
        "prestige": int(p.get("prestige", 0)),
        "titles": p.get("titles", []),
        "cosmetics": p.get("cosmetics", []),
        "tracks": tracks,
        "history": [{**h, "at": clock.iso(h["at"])} for h in (p.get("house_history") or [])[-30:]][::-1],
    }
