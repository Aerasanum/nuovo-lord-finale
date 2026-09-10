"""Alliances (Bible §19 / §34.7 / §40; spec.alliance_policy, diplomacy, mercenary_contract, emeralds).

Two strictly separated kinds (user requirement):
  STRUCTURED  — cap 100, chat/support/roles/treasury/PNA/wars (12h vote)/shared siege/Pyramid.
  MERCENARY   — cap 5, no Pyramid, no war votes: wars only as the effect of an accepted contract; accepts contracts
                offered by other alliances, escrow → own Emerald treasury on success.
Lone wolves (no alliance) keep personal PvE/PvP and trade.

Collections: alliances (members embedded, ≤100), alliance_invites, alliance_relations (one doc per unordered pair),
war_votes, alliance_chat, emerald_ledger (append-only), mercenary_contracts. Timers are scheduler events
(ALLIANCE_LEAVE_EFFECTIVE, WAR_VOTE_CLOSE, DIPLOMACY_TIMER, MERCENARY_CONTRACT_END) — idempotent handlers.
"""
from __future__ import annotations

import re
import uuid
from datetime import timedelta

from app.core import clock
from app.core.db import db
from app.core.errors import ApiError
from app.core.spec import get_spec
from app.domain import notifications, progress, scheduler

STRUCTURED = "STRUCTURED"
MERCENARY = "MERCENARY"
KINDS = (STRUCTURED, MERCENARY)
ROLE_ORDER = ["LEADER", "VICE", "DIPLOMAT", "MEMBER"]
BLOCKING_STATES = ("PNA", "PNA_NOTICE", "PEACE_PENDING")  # no new hostile launches (Bible §19 / STC-29)
ACTIVE_MARCH = ("OUTBOUND", "RESOLVING", "RETURNING")
TAG_RE = re.compile(r"^[A-Z0-9]{2,5}$")


def _policy() -> dict:
    return get_spec().alliance_policy


def _diplo() -> dict:
    return get_spec().diplomacy


def _merc() -> dict:
    return get_spec().mercenary_contract


def cap_of(kind: str) -> int:
    return int(_policy()["caps"]["MERCENARY_ALLIANCE" if kind == MERCENARY else "STRUCTURED_ALLIANCE"])


def member_of(a: dict, pid: str) -> dict | None:
    return next((m for m in a.get("members", []) if m["player_id"] == pid), None)


def permissions(role: str) -> list[str]:
    return list(_diplo()["role_permissions"].get(role, []))


def has_perm(a: dict, pid: str, perm: str) -> bool:
    m = member_of(a, pid)
    if not m:
        return False
    perms = permissions(m["role"])
    if perm in perms:
        return True
    # VICE variants (explicit in CANONICAL_SPEC, STC-30): remove/roles except on the leader
    if perm == "remove_member" and "remove_member_except_leader" in perms:
        return True
    if perm == "roles" and "roles_except_leader" in perms:
        return True
    if perm == "peace_proposal" and "peace" in perms:
        return True
    # chat / support / shared siege / pyramid are floor permissions of every member
    return perm in _diplo()["role_permissions"]["MEMBER"]


def require(a: dict, pid: str, perm: str) -> dict:
    if not has_perm(a, pid, perm):
        raise ApiError("ALLIANCE_FORBIDDEN", f"Your role lacks the '{perm}' permission", 403, {"permission": perm})
    return member_of(a, pid)  # type: ignore[return-value]


async def get(world_id: str, alliance_id: str) -> dict:
    a = await db().alliances.find_one({"_id": alliance_id, "world_id": world_id, "status": "ACTIVE"})
    if not a:
        raise ApiError("ALLIANCE_NOT_FOUND", "Alliance not found", 404)
    return a


async def mine(player: dict) -> dict | None:
    if not player.get("alliance_id"):
        return None
    return await db().alliances.find_one({"_id": player["alliance_id"], "status": "ACTIVE"})


async def require_mine(player: dict) -> dict:
    a = await mine(player)
    if not a:
        raise ApiError("NOT_IN_ALLIANCE", "You are not in an alliance", 409)
    return a


# ------------------------------------------------------------------------------------------------ membership
async def _set_player_alliance(world_id: str, pid: str, a: dict | None, role: str | None) -> None:
    sets = {"alliance_id": a["_id"] if a else None, "alliance_role": role, "alliance_tag": a["tag"] if a else None, "alliance_name": a["name"] if a else None, "alliance_kind": a["kind"] if a else None}
    await db().players.update_one({"_id": pid}, {"$set": sets})
    await db().settlements.update_many({"world_id": world_id, "owner_player_id": pid}, {"$set": {"owner_alliance_id": sets["alliance_id"], "owner_alliance_tag": sets["alliance_tag"]}})


async def create(world: dict, player: dict, name: str, tag: str, kind: str, description: str | None) -> dict:
    now = clock.now()
    if player.get("alliance_id"):
        raise ApiError("ALREADY_IN_ALLIANCE", "Leave your current alliance first", 409)
    cd = clock.aware(player.get("alliance_join_cooldown_until"))
    if cd and cd > now:
        raise ApiError("ALLIANCE_JOIN_COOLDOWN", "Join cooldown active", 409, {"until": clock.iso(cd)})
    if kind not in KINDS:
        raise ApiError("INVALID_ALLIANCE_KIND", "kind must be STRUCTURED or MERCENARY", 400)
    name = (name or "").strip()
    tag = (tag or "").strip().upper()
    if not 3 <= len(name) <= 24:
        raise ApiError("INVALID_ALLIANCE_NAME", "Name must be 3–24 characters", 400)
    if not TAG_RE.match(tag):
        raise ApiError("INVALID_ALLIANCE_TAG", "Tag must be 2–5 letters/digits", 400)
    if await db().alliances.find_one({"world_id": world["_id"], "status": "ACTIVE", "$or": [{"name_lc": name.lower()}, {"tag": tag}]}):
        raise ApiError("ALLIANCE_NAME_TAKEN", "Name or tag already used in this world", 409)
    doc = {
        "_id": f"aln_{uuid.uuid4().hex[:12]}",
        "world_id": world["_id"],
        "name": name,
        "name_lc": name.lower(),
        "tag": tag,
        "kind": kind,
        "description": (description or "").strip()[:200],
        "leader_player_id": player["_id"],
        "members": [{"player_id": player["_id"], "house_name": player["house_name"], "role": "LEADER", "joined_at": now}],
        "emeralds": 0,
        "mercenary_prestige": 0,
        "contracts_completed": 0,
        "status": "ACTIVE",
        "created_at": now,
    }
    await db().alliances.insert_one(doc)
    await _set_player_alliance(world["_id"], player["_id"], doc, "LEADER")
    return doc


async def list_public(world_id: str) -> list[dict]:
    cur = db().alliances.find({"world_id": world_id, "status": "ACTIVE"}).sort([("kind", 1), ("created_at", 1)])
    return [public_dto(a) async for a in cur]


async def invite(world: dict, a: dict, actor: dict, house_name: str, role: str) -> dict:
    require(a, actor["_id"], "invite")
    role = (role or "MEMBER").upper()
    if role not in ROLE_ORDER or role == "LEADER":
        raise ApiError("INVALID_ROLE", "Invite role must be VICE, DIPLOMAT or MEMBER", 400)
    target = await db().players.find_one({"world_id": world["_id"], "house_name_lc": (house_name or "").strip().lower(), "status": {"$ne": "ELIMINATED"}})
    if not target:
        raise ApiError("PLAYER_NOT_FOUND", "No House with this name in the world", 404)
    if target.get("alliance_id"):
        raise ApiError("PLAYER_IN_ALLIANCE", "This Player already belongs to an alliance", 409)
    if len(a["members"]) >= cap_of(a["kind"]):
        raise ApiError("ALLIANCE_FULL", f"Alliance cap reached ({cap_of(a['kind'])})", 409, {"cap": cap_of(a["kind"])})
    now = clock.now()
    dup = await db().alliance_invites.find_one({"alliance_id": a["_id"], "player_id": target["_id"], "status": "PENDING", "expires_at": {"$gt": now}})
    if dup:
        raise ApiError("INVITE_PENDING", "An invitation is already pending", 409)
    doc = {"_id": f"inv_{uuid.uuid4().hex[:12]}", "world_id": world["_id"], "alliance_id": a["_id"], "alliance_name": a["name"], "alliance_tag": a["tag"], "alliance_kind": a["kind"], "player_id": target["_id"], "house_name": target["house_name"], "sender_id": actor["_id"], "sender_house": actor["house_name"], "role": role, "status": "PENDING", "created_at": now, "expires_at": now + timedelta(hours=72)}
    await db().alliance_invites.insert_one(doc)
    await notifications.notify(world["_id"], target["_id"], "ALLIANCE_INVITE", {"alliance_id": a["_id"], "alliance_name": a["name"], "tag": a["tag"], "kind": a["kind"], "sender_id": actor["_id"], "sender_house": actor["house_name"], "expires_at": clock.iso(doc["expires_at"]), "role": role, "invite_id": doc["_id"]}, dedupe_key=f"invite:{doc['_id']}", deep_link="alliance")
    return invite_dto(doc)


async def my_invites(player: dict) -> list[dict]:
    now = clock.now()
    cur = db().alliance_invites.find({"player_id": player["_id"], "status": "PENDING", "expires_at": {"$gt": now}}).sort("created_at", -1)
    return [invite_dto(i) async for i in cur]


async def respond_invite(world: dict, player: dict, invite_id: str, accept: bool) -> dict:
    now = clock.now()
    inv = await db().alliance_invites.find_one({"_id": invite_id, "player_id": player["_id"], "status": "PENDING"})
    if not inv or clock.aware(inv["expires_at"]) <= now:
        raise ApiError("INVITE_NOT_FOUND", "Invitation not found or expired", 404)
    if not accept:
        await db().alliance_invites.update_one({"_id": invite_id}, {"$set": {"status": "DECLINED", "responded_at": now}})
        return {"ok": True, "status": "DECLINED"}
    if player.get("alliance_id"):
        raise ApiError("ALREADY_IN_ALLIANCE", "Leave your current alliance first", 409)
    cd = clock.aware(player.get("alliance_join_cooldown_until"))
    if cd and cd > now:
        raise ApiError("ALLIANCE_JOIN_COOLDOWN", "Join cooldown active", 409, {"until": clock.iso(cd)})
    a = await get(world["_id"], inv["alliance_id"])
    cap = cap_of(a["kind"])
    member = {"player_id": player["_id"], "house_name": player["house_name"], "role": inv["role"], "joined_at": now}
    res = await db().alliances.update_one({"_id": a["_id"], "status": "ACTIVE", "members.player_id": {"$ne": player["_id"]}, f"members.{cap - 1}": {"$exists": False}}, {"$push": {"members": member}})
    if res.modified_count != 1:
        raise ApiError("ALLIANCE_FULL", "Alliance cap reached", 409, {"cap": cap})
    await db().alliance_invites.update_one({"_id": invite_id}, {"$set": {"status": "ACCEPTED", "responded_at": now}})
    await db().alliance_invites.update_many({"player_id": player["_id"], "status": "PENDING"}, {"$set": {"status": "SUPERSEDED"}})
    await _set_player_alliance(world["_id"], player["_id"], a, inv["role"])
    await _chat_system(a, f"{player['house_name']} si è unito all'alleanza")
    return {"ok": True, "status": "ACCEPTED", "alliance_id": a["_id"]}


async def request_leave(world: dict, a: dict, player: dict) -> dict:
    m = member_of(a, player["_id"])
    if not m:
        raise ApiError("NOT_IN_ALLIANCE", "Not a member", 409)
    if m.get("leaving_at"):
        raise ApiError("LEAVE_PENDING", "Leave already requested", 409, {"leaving_at": clock.iso(m["leaving_at"])})
    at = clock.now() + timedelta(hours=float(_policy()["leave"]["effective_delay_hours"]))
    await db().alliances.update_one({"_id": a["_id"], "members.player_id": player["_id"]}, {"$set": {"members.$.leaving_at": at}})
    await scheduler.schedule(world["_id"], "ALLIANCE_LEAVE_EFFECTIVE", at, a["_id"], f"alliance_leave:{a['_id']}:{player['_id']}:{int(at.timestamp())}", {"alliance_id": a["_id"], "player_id": player["_id"]})
    return {"ok": True, "leaving_at": clock.iso(at)}


async def cancel_leave(a: dict, player: dict) -> dict:
    m = member_of(a, player["_id"])
    if not m or not m.get("leaving_at"):
        raise ApiError("NO_LEAVE_PENDING", "No leave request pending", 409)
    await db().alliances.update_one({"_id": a["_id"], "members.player_id": player["_id"]}, {"$unset": {"members.$.leaving_at": ""}})
    at = clock.aware(m["leaving_at"])
    await scheduler.cancel(f"alliance_leave:{a['_id']}:{player['_id']}:{int(at.timestamp())}")
    return {"ok": True}


async def _at_war(world_id: str, alliance_id: str) -> bool:
    return await db().alliance_relations.count_documents({"world_id": world_id, "alliances": alliance_id, "state": {"$in": ["WAR", "PEACE_PENDING"]}}) > 0


async def _remove_member(a: dict, pid: str, reason: str) -> None:
    """Shared exit path (leave effective / kicked / dissolved): cooldowns per Bible §19, succession, dissolve if empty."""
    m = member_of(a, pid)
    if not m:
        return
    now = clock.now()
    lv = _policy()["leave"]
    at_war = await _at_war(a["world_id"], a["_id"])
    cooldown_h = float(lv["if_alliance_at_war_join_cooldown_hours"] if at_war else lv["normal_join_cooldown_hours"])
    sets: dict = {"alliance_join_cooldown_until": now + timedelta(hours=cooldown_h)}
    if at_war:
        sets["war_involved_until"] = now + timedelta(hours=float(lv["if_alliance_at_war_war_involved_hours"]))
    await db().players.update_one({"_id": pid}, {"$set": sets})
    await db().alliances.update_one({"_id": a["_id"]}, {"$pull": {"members": {"player_id": pid}}})
    await _set_player_alliance(a["world_id"], pid, None, None)
    fresh = await db().alliances.find_one({"_id": a["_id"]})
    if not fresh or fresh["status"] != "ACTIVE":
        return
    if not fresh["members"]:
        await _dissolve(fresh, "EMPTY")
        return
    if fresh["leader_player_id"] == pid:
        # succession: most senior VICE, else most senior member (Bible §19)
        vices = sorted([x for x in fresh["members"] if x["role"] == "VICE"], key=lambda x: clock.aware(x["joined_at"]))
        pool = vices or sorted(fresh["members"], key=lambda x: clock.aware(x["joined_at"]))
        heir = pool[0]
        await db().alliances.update_one({"_id": a["_id"], "members.player_id": heir["player_id"]}, {"$set": {"leader_player_id": heir["player_id"], "members.$.role": "LEADER"}})
        await db().players.update_one({"_id": heir["player_id"]}, {"$set": {"alliance_role": "LEADER"}})
        await _chat_system(fresh, f"{heir['house_name']} è il nuovo Leader")
    await _chat_system(fresh, f"{m['house_name']} ha lasciato l'alleanza" if reason == "LEFT" else f"{m['house_name']} è stato rimosso")


@scheduler.handler("ALLIANCE_LEAVE_EFFECTIVE")
async def on_leave_effective(evt: dict) -> None:
    p = evt["payload"]
    a = await db().alliances.find_one({"_id": p["alliance_id"], "status": "ACTIVE"})
    if not a:
        return
    m = member_of(a, p["player_id"])
    if not m or not m.get("leaving_at"):
        return
    await _remove_member(a, p["player_id"], "LEFT")


async def kick(a: dict, actor: dict, pid: str) -> dict:
    require(a, actor["_id"], "remove_member")
    target = member_of(a, pid)
    if not target:
        raise ApiError("MEMBER_NOT_FOUND", "Member not found", 404)
    if pid == actor["_id"]:
        raise ApiError("INVALID_TARGET", "Use leave to exit the alliance", 400)
    if target["role"] == "LEADER":
        raise ApiError("ALLIANCE_FORBIDDEN", "The Leader cannot be removed", 403)
    await _remove_member(a, pid, "KICKED")
    return {"ok": True}


async def set_role(a: dict, actor: dict, pid: str, role: str) -> dict:
    role = (role or "").upper()
    if role not in ROLE_ORDER:
        raise ApiError("INVALID_ROLE", "Unknown role", 400)
    target = member_of(a, pid)
    if not target:
        raise ApiError("MEMBER_NOT_FOUND", "Member not found", 404)
    if role == "LEADER":
        return await transfer_leadership(a, actor, pid)
    require(a, actor["_id"], "roles")
    if target["role"] == "LEADER":
        raise ApiError("ALLIANCE_FORBIDDEN", "Transfer leadership instead of demoting the Leader", 403)
    await db().alliances.update_one({"_id": a["_id"], "members.player_id": pid}, {"$set": {"members.$.role": role}})
    await db().players.update_one({"_id": pid}, {"$set": {"alliance_role": role}})
    return {"ok": True, "role": role}


async def transfer_leadership(a: dict, actor: dict, pid: str) -> dict:
    require(a, actor["_id"], "transfer_leadership")
    if not member_of(a, pid) or pid == actor["_id"]:
        raise ApiError("MEMBER_NOT_FOUND", "Pick another member", 404)
    await db().alliances.update_one({"_id": a["_id"], "members.player_id": actor["_id"]}, {"$set": {"members.$.role": "VICE"}})
    await db().alliances.update_one({"_id": a["_id"], "members.player_id": pid}, {"$set": {"members.$.role": "LEADER", "leader_player_id": pid}})
    await db().players.update_one({"_id": actor["_id"]}, {"$set": {"alliance_role": "VICE"}})
    await db().players.update_one({"_id": pid}, {"$set": {"alliance_role": "LEADER"}})
    return {"ok": True, "role": "LEADER"}


async def update_settings(a: dict, actor: dict, description: str | None, name: str | None = None) -> dict:
    """Leader-only settings: description and (unique per world) name; the tag is the permanent identifier."""
    require(a, actor["_id"], "alliance_settings")
    sets: dict = {}
    if description is not None:
        sets["description"] = description.strip()[:200]
    if name is not None:
        name = name.strip()
        if not 3 <= len(name) <= 24:
            raise ApiError("INVALID_ALLIANCE_NAME", "Name must be 3–24 characters", 400)
        if name.lower() != a["name_lc"] and await db().alliances.find_one({"world_id": a["world_id"], "status": "ACTIVE", "name_lc": name.lower()}):
            raise ApiError("ALLIANCE_NAME_TAKEN", "Name already used in this world", 409)
        sets["name"] = name
        sets["name_lc"] = name.lower()
    if not sets:
        return {"ok": True}
    await db().alliances.update_one({"_id": a["_id"]}, {"$set": sets})
    if "name" in sets:
        await db().players.update_many({"alliance_id": a["_id"]}, {"$set": {"alliance_name": sets["name"]}})
        await db().alliance_invites.update_many({"alliance_id": a["_id"], "status": "PENDING"}, {"$set": {"alliance_name": sets["name"]}})
        await db().mercenary_contracts.update_many({"client_alliance_id": a["_id"]}, {"$set": {"client_name": sets["name"]}})
        await db().mercenary_contracts.update_many({"provider_alliance_id": a["_id"]}, {"$set": {"provider_name": sets["name"]}})
        await db().mercenary_contracts.update_many({"target_alliance_id": a["_id"]}, {"$set": {"target_name": sets["name"]}})
        await _chat_system(a, f"L'alleanza si chiama ora {sets['name']}")
    return {"ok": True, **sets}


async def dissolve(a: dict, actor: dict) -> dict:
    require(a, actor["_id"], "dissolve")
    await _dissolve(a, "DISSOLVED_BY_LEADER")
    return {"ok": True}


async def _dissolve(a: dict, reason: str) -> None:
    now = clock.now()
    res = await db().alliances.update_one({"_id": a["_id"], "status": "ACTIVE"}, {"$set": {"status": "DISSOLVED", "dissolved_at": now, "dissolve_reason": reason}})
    if res.modified_count != 1:
        return
    lv = _policy()["leave"]
    for m in a.get("members", []):
        await db().players.update_one({"_id": m["player_id"]}, {"$set": {"alliance_join_cooldown_until": now + timedelta(hours=float(lv["normal_join_cooldown_hours"]))}})
        await _set_player_alliance(a["world_id"], m["player_id"], None, None)
        await notifications.notify(a["world_id"], m["player_id"], "DIPLOMACY_STATE_CHANGED", {"relation": a["_id"], "state": "ALLIANCE_DISSOLVED", "alliance_name": a["name"], "vote_or_deadline": None}, dedupe_key=f"dissolved:{a['_id']}:{m['player_id']}", deep_link="alliance")
    await db().alliance_invites.update_many({"alliance_id": a["_id"], "status": "PENDING"}, {"$set": {"status": "CANCELLED"}})
    await db().alliance_relations.update_many({"alliances": a["_id"]}, {"$set": {"state": "NEUTRAL", "closed_at": now, "closed_reason": "DISSOLVED"}})
    await db().war_votes.update_many({"$or": [{"alliance_id": a["_id"]}, {"target_alliance_id": a["_id"]}], "status": "OPEN"}, {"$set": {"status": "FAILED", "closed_at": now, "reason": "DISSOLVED"}})
    # mercenary contracts (spec.mercenary_contract): provider dissolves → FAIL + refund; target dissolves → SUCCESS; client → continues
    async for c in db().mercenary_contracts.find({"world_id": a["world_id"], "status": {"$in": ["OFFERED", "ACTIVE"]}, "$or": [{"provider_alliance_id": a["_id"]}, {"target_alliance_id": a["_id"]}, {"client_alliance_id": a["_id"], "status": "OFFERED"}]}):
        if c["status"] == "OFFERED" and c["client_alliance_id"] == a["_id"]:
            await _refund_offer(c, "CLIENT_DISSOLVED")
        elif c["status"] == "OFFERED" and c["target_alliance_id"] == a["_id"]:
            await _refund_offer(c, "TARGET_DISSOLVED")
        elif c["status"] == "ACTIVE" and c.get("provider_alliance_id") == a["_id"]:
            await _end_contract(c, "FAILED_PROVIDER_DISSOLVED")
        elif c["status"] == "ACTIVE" and c["target_alliance_id"] == a["_id"]:
            await _end_contract(c, "SUCCESS_TARGET_DISSOLVED")
    # Pyramid (Bible §21): dissolution while holding → neutralised, timer 0, garrison goes home
    from app.domain import pyramid  # local import: pyramid depends on alliances

    await pyramid.on_alliance_dissolved(a)


# ------------------------------------------------------------------------------------------------ diplomacy
def _rel_id(a: str, b: str) -> str:
    x, y = sorted([a, b])
    return f"rel_{x}_{y}"


async def relation(world_id: str, a: str, b: str) -> dict:
    doc = await db().alliance_relations.find_one({"_id": _rel_id(a, b)})
    if doc:
        return doc
    return {"_id": _rel_id(a, b), "world_id": world_id, "alliances": sorted([a, b]), "state": "NEUTRAL"}


async def relations_of(world_id: str, alliance_id: str) -> list[dict]:
    return [r async for r in db().alliance_relations.find({"world_id": world_id, "alliances": alliance_id, "state": {"$ne": "NEUTRAL"}})]


async def _notify_alliance(a: dict, event: str, payload: dict, key: str, deep_link: str, roles: list[str] | None = None) -> None:
    for m in a.get("members", []):
        if roles and m["role"] not in roles:
            continue
        await notifications.notify(a["world_id"], m["player_id"], event, payload, dedupe_key=f"{key}:{m['player_id']}", deep_link=deep_link)


async def _set_relation(world_id: str, a_id: str, b_id: str, state: str, extra: dict | None = None, unset: list[str] | None = None) -> dict:
    now = clock.now()
    upd: dict = {"$set": {"world_id": world_id, "alliances": sorted([a_id, b_id]), "state": state, "since": now, **(extra or {})}}
    if unset:
        upd["$unset"] = {k: "" for k in unset}
    await db().alliance_relations.update_one({"_id": _rel_id(a_id, b_id)}, upd, upsert=True)
    doc = await db().alliance_relations.find_one({"_id": _rel_id(a_id, b_id)})
    for aid in (a_id, b_id):
        al = await db().alliances.find_one({"_id": aid, "status": "ACTIVE"})
        other = await db().alliances.find_one({"_id": b_id if aid == a_id else a_id})
        if al:
            await _notify_alliance(al, "DIPLOMACY_STATE_CHANGED", {"relation": doc["_id"], "state": state, "other_alliance_id": other["_id"] if other else None, "other_name": (other or {}).get("name"), "other_tag": (other or {}).get("tag"), "vote_or_deadline": clock.iso(doc.get("until")) if doc.get("until") else None}, f"rel:{doc['_id']}:{state}:{int(now.timestamp())}", "alliance/diplomacy")
    return doc


async def propose_pna(world: dict, a: dict, actor: dict, other_id: str) -> dict:
    require(a, actor["_id"], "pna")
    other = await get(world["_id"], other_id)
    if other["_id"] == a["_id"]:
        raise ApiError("INVALID_TARGET", "Cannot sign a PNA with yourself", 400)
    rel = await relation(world["_id"], a["_id"], other["_id"])
    if rel["state"] != "NEUTRAL":
        raise ApiError("RELATION_STATE", f"Relation is {rel['state']}", 409, {"state": rel["state"]})
    if rel.get("pna_proposal"):
        if rel["pna_proposal"]["by"] == a["_id"]:
            raise ApiError("PROPOSAL_PENDING", "PNA proposal already pending", 409)
        return await accept_pna(world, a, actor, other_id)
    await db().alliance_relations.update_one({"_id": rel["_id"]}, {"$set": {"world_id": world["_id"], "alliances": sorted([a["_id"], other["_id"]]), "state": "NEUTRAL", "pna_proposal": {"by": a["_id"], "by_name": a["name"], "at": clock.now()}}}, upsert=True)
    await _notify_alliance(other, "DIPLOMACY_STATE_CHANGED", {"relation": rel["_id"], "state": "PNA_PROPOSED", "other_alliance_id": a["_id"], "other_name": a["name"], "other_tag": a["tag"], "vote_or_deadline": None}, f"pna_prop:{rel['_id']}:{int(clock.now().timestamp())}", "alliance/diplomacy", roles=["LEADER", "VICE", "DIPLOMAT"])
    return await relation(world["_id"], a["_id"], other["_id"])


async def accept_pna(world: dict, a: dict, actor: dict, other_id: str) -> dict:
    require(a, actor["_id"], "pna")
    rel = await relation(world["_id"], a["_id"], other_id)
    prop = rel.get("pna_proposal")
    if rel["state"] != "NEUTRAL" or not prop or prop["by"] == a["_id"]:
        raise ApiError("NO_PROPOSAL", "No PNA proposal from the other alliance", 409)
    return await _set_relation(world["_id"], a["_id"], other_id, "PNA", unset=["pna_proposal", "until"])


async def decline_pna(world: dict, a: dict, actor: dict, other_id: str) -> dict:
    require(a, actor["_id"], "pna")
    rel = await relation(world["_id"], a["_id"], other_id)
    if not rel.get("pna_proposal"):
        raise ApiError("NO_PROPOSAL", "No PNA proposal pending", 409)
    await db().alliance_relations.update_one({"_id": rel["_id"]}, {"$unset": {"pna_proposal": ""}})
    return await relation(world["_id"], a["_id"], other_id)


async def terminate_pna(world: dict, a: dict, actor: dict, other_id: str) -> dict:
    """Normal PNA termination: 12h notice during which no hostile launch is allowed (Bible §19)."""
    require(a, actor["_id"], "pna")
    rel = await relation(world["_id"], a["_id"], other_id)
    if rel["state"] != "PNA":
        raise ApiError("RELATION_STATE", "No active PNA", 409, {"state": rel["state"]})
    until = clock.now() + timedelta(hours=float(_policy()["pna"]["normal_termination_notice_hours"]))
    doc = await _set_relation(world["_id"], a["_id"], other_id, "PNA_NOTICE", {"until": until, "notice_by": a["_id"]})
    await scheduler.schedule(world["_id"], "DIPLOMACY_TIMER", until, rel["_id"], f"rel_timer:{rel['_id']}:PNA_NOTICE:{int(until.timestamp())}", {"relation_id": rel["_id"], "expect": "PNA_NOTICE", "next": "NEUTRAL"})
    return doc


@scheduler.handler("DIPLOMACY_TIMER")
async def on_diplomacy_timer(evt: dict) -> None:
    p = evt["payload"]
    rel = await db().alliance_relations.find_one({"_id": p["relation_id"]})
    if not rel or rel["state"] != p["expect"]:
        return
    if rel.get("until") and clock.aware(rel["until"]) > clock.now() + timedelta(seconds=5):
        return
    a, b = rel["alliances"]
    await _set_relation(rel["world_id"], a, b, p["next"], unset=["until", "notice_by", "peace_proposal", "locked_by_contract_id"])


async def propose_war(world: dict, a: dict, actor: dict, other_id: str) -> dict:
    """Opens a 12h vote among Leader/Vice/Diplomats; war starts as soon as the mathematical majority is reached."""
    require(a, actor["_id"], "war_proposal")
    if a["kind"] != STRUCTURED:
        raise ApiError("MERCENARY_NO_WAR_VOTE", "Mercenary alliances go to war only through accepted contracts", 409)
    other = await get(world["_id"], other_id)
    if other["_id"] == a["_id"]:
        raise ApiError("INVALID_TARGET", "Cannot declare war on yourself", 400)
    rel = await relation(world["_id"], a["_id"], other["_id"])
    if rel["state"] in ("WAR", "PEACE_PENDING"):
        raise ApiError("RELATION_STATE", f"Relation is {rel['state']}", 409, {"state": rel["state"]})
    if await db().war_votes.find_one({"alliance_id": a["_id"], "target_alliance_id": other["_id"], "status": "OPEN"}):
        raise ApiError("VOTE_OPEN", "A war vote against this alliance is already open", 409)
    wv = _policy()["war_vote"]
    eligible = [m["player_id"] for m in a["members"] if m["role"] in wv["eligible_roles"]]
    now = clock.now()
    closes = now + timedelta(hours=float(wv["window_hours"]))
    doc = {"_id": f"wv_{uuid.uuid4().hex[:12]}", "world_id": world["_id"], "alliance_id": a["_id"], "target_alliance_id": other["_id"], "target_name": other["name"], "target_tag": other["tag"], "proposed_by": actor["_id"], "proposed_by_house": actor["house_name"], "opened_at": now, "closes_at": closes, "eligible": eligible, "votes": {actor["_id"]: True}, "status": "OPEN"}
    await db().war_votes.insert_one(doc)
    await scheduler.schedule(world["_id"], "WAR_VOTE_CLOSE", closes, doc["_id"], f"war_vote_close:{doc['_id']}", {"vote_id": doc["_id"]})
    await _notify_alliance(a, "DIPLOMACY_STATE_CHANGED", {"relation": rel["_id"], "state": "WAR_VOTE_OPEN", "other_alliance_id": other["_id"], "other_name": other["name"], "other_tag": other["tag"], "vote_or_deadline": clock.iso(closes), "vote_id": doc["_id"]}, f"wv_open:{doc['_id']}", "alliance/diplomacy", roles=list(wv["eligible_roles"]))
    return await _evaluate_vote(doc)


async def vote_war(world: dict, a: dict, actor: dict, vote_id: str, yes: bool) -> dict:
    require(a, actor["_id"], "war_vote")
    v = await db().war_votes.find_one({"_id": vote_id, "alliance_id": a["_id"]})
    if not v or v["status"] != "OPEN":
        raise ApiError("VOTE_CLOSED", "Vote not open", 409)
    if actor["_id"] not in v["eligible"]:
        raise ApiError("ALLIANCE_FORBIDDEN", "Not eligible for this vote", 403)
    await db().war_votes.update_one({"_id": vote_id, "status": "OPEN"}, {"$set": {f"votes.{actor['_id']}": bool(yes)}})
    return await _evaluate_vote(await db().war_votes.find_one({"_id": vote_id}))


async def _evaluate_vote(v: dict) -> dict:
    if v["status"] != "OPEN":
        return vote_dto(v)
    n = len(v["eligible"])
    yes = sum(1 for pid, ok in v["votes"].items() if ok and pid in v["eligible"])
    no = sum(1 for pid, ok in v["votes"].items() if not ok and pid in v["eligible"])
    needed = n // 2 + 1  # simple majority of eligible
    if yes >= needed:
        res = await db().war_votes.update_one({"_id": v["_id"], "status": "OPEN"}, {"$set": {"status": "PASSED", "closed_at": clock.now()}})
        if res.modified_count:
            await scheduler.cancel(f"war_vote_close:{v['_id']}")
            await _start_war(v["world_id"], v["alliance_id"], v["target_alliance_id"], "VOTE", None)
    elif no > n - needed:  # majority mathematically unreachable
        await db().war_votes.update_one({"_id": v["_id"], "status": "OPEN"}, {"$set": {"status": "FAILED", "closed_at": clock.now(), "reason": "REJECTED"}})
        await scheduler.cancel(f"war_vote_close:{v['_id']}")
    return vote_dto(await db().war_votes.find_one({"_id": v["_id"]}))


@scheduler.handler("WAR_VOTE_CLOSE")
async def on_vote_close(evt: dict) -> None:
    v = await db().war_votes.find_one({"_id": evt["payload"]["vote_id"]})
    if not v or v["status"] != "OPEN":
        return
    await db().war_votes.update_one({"_id": v["_id"], "status": "OPEN"}, {"$set": {"status": "FAILED", "closed_at": clock.now(), "reason": "TIE_OR_TIMEOUT"}})


async def _start_war(world_id: str, a_id: str, b_id: str, reason: str, contract_id: str | None) -> dict:
    extra: dict = {"war_started_at": clock.now(), "war_reason": reason}
    if contract_id:
        extra["locked_by_contract_id"] = contract_id
    # a mercenary acceptance breaks an existing PNA immediately and without penalty (spec.alliance_policy.pna)
    return await _set_relation(world_id, a_id, b_id, "WAR", extra, unset=["until", "notice_by", "pna_proposal", "peace_proposal"])


async def propose_peace(world: dict, a: dict, actor: dict, other_id: str) -> dict:
    require(a, actor["_id"], "peace_proposal")
    rel = await relation(world["_id"], a["_id"], other_id)
    if rel["state"] != "WAR":
        raise ApiError("RELATION_STATE", "Not at war", 409, {"state": rel["state"]})
    if rel.get("locked_by_contract_id") and await db().mercenary_contracts.find_one({"_id": rel["locked_by_contract_id"], "status": "ACTIVE"}):
        raise ApiError("PEACE_LOCKED_BY_CONTRACT", "Peace is locked until the mercenary contract ends", 409, {"contract_id": rel["locked_by_contract_id"]})
    now = clock.now()
    exp = now + timedelta(hours=float(_diplo()["peace_proposal_expiry_hours"]))
    await db().alliance_relations.update_one({"_id": rel["_id"]}, {"$set": {"peace_proposal": {"by": a["_id"], "by_name": a["name"], "at": now, "expires_at": exp}}})
    other = await get(world["_id"], other_id)
    await _notify_alliance(other, "DIPLOMACY_STATE_CHANGED", {"relation": rel["_id"], "state": "PEACE_PROPOSED", "other_alliance_id": a["_id"], "other_name": a["name"], "other_tag": a["tag"], "vote_or_deadline": clock.iso(exp)}, f"peace_prop:{rel['_id']}:{int(now.timestamp())}", "alliance/diplomacy", roles=list(_diplo()["peace_accept_roles"]))
    return await relation(world["_id"], a["_id"], other_id)


async def accept_peace(world: dict, a: dict, actor: dict, other_id: str) -> dict:
    """STC-29: accepted peace → PEACE_PENDING 12h (no new hostile launches, in-flight marches resolve) → NEUTRAL."""
    m = member_of(a, actor["_id"])
    if not m or m["role"] not in _diplo()["peace_accept_roles"]:
        raise ApiError("ALLIANCE_FORBIDDEN", "Only Leader/Vice can accept peace", 403)
    rel = await relation(world["_id"], a["_id"], other_id)
    prop = rel.get("peace_proposal")
    if rel["state"] != "WAR" or not prop or prop["by"] == a["_id"] or clock.aware(prop["expires_at"]) <= clock.now():
        raise ApiError("NO_PROPOSAL", "No valid peace proposal from the other alliance", 409)
    if rel.get("locked_by_contract_id") and await db().mercenary_contracts.find_one({"_id": rel["locked_by_contract_id"], "status": "ACTIVE"}):
        raise ApiError("PEACE_LOCKED_BY_CONTRACT", "Peace is locked until the mercenary contract ends", 409)
    until = clock.now() + timedelta(hours=float(_diplo()["peace_pending_hours"]))
    doc = await _set_relation(world["_id"], a["_id"], other_id, "PEACE_PENDING", {"until": until}, unset=["peace_proposal", "locked_by_contract_id"])
    await scheduler.schedule(world["_id"], "DIPLOMACY_TIMER", until, rel["_id"], f"rel_timer:{rel['_id']}:PEACE_PENDING:{int(until.timestamp())}", {"relation_id": rel["_id"], "expect": "PEACE_PENDING", "next": "NEUTRAL"})
    return doc


async def check_hostile_launch(world_id: str, attacker: dict, defender_player_id: str | None) -> None:
    """Launch-time diplomacy gate for offensive marches / interceptions against a Player target."""
    if not defender_player_id or defender_player_id == attacker["_id"]:
        return
    a_id = attacker.get("alliance_id")
    if not a_id:
        return
    d = await db().players.find_one({"_id": defender_player_id}, {"alliance_id": 1})
    d_id = (d or {}).get("alliance_id")
    if not d_id:
        return
    if d_id == a_id:
        raise ApiError("CANNOT_ATTACK_ALLY", "Cannot attack a member of your own alliance", 409)
    rel = await relation(world_id, a_id, d_id)
    if rel["state"] in BLOCKING_STATES:
        raise ApiError("DIPLOMACY_BLOCKS_ATTACK", f"Relation {rel['state']} forbids new hostile launches", 409, {"state": rel["state"], "until": clock.iso(rel.get("until"))})


async def is_ally(player: dict, other_player_id: str | None) -> bool:
    if not other_player_id or not player.get("alliance_id"):
        return False
    if other_player_id == player["_id"]:
        return True
    o = await db().players.find_one({"_id": other_player_id}, {"alliance_id": 1})
    return bool(o) and o.get("alliance_id") == player["alliance_id"]


async def ally_player_ids(player: dict) -> list[str]:
    a = await mine(player)
    return [m["player_id"] for m in a["members"]] if a else [player["_id"]]


# ------------------------------------------------------------------------------------------------ chat
async def _chat_system(a: dict, text: str) -> None:
    await db().alliance_chat.insert_one({"_id": f"msg_{uuid.uuid4().hex[:12]}", "world_id": a["world_id"], "alliance_id": a["_id"], "player_id": None, "house_name": None, "role": "SYSTEM", "text": text, "at": clock.now()})


async def post_chat(a: dict, player: dict, text: str) -> dict:
    require(a, player["_id"], "chat")
    text = (text or "").strip()
    if not 1 <= len(text) <= 500:
        raise ApiError("INVALID_MESSAGE", "Message must be 1–500 characters", 400)
    m = member_of(a, player["_id"])
    doc = {"_id": f"msg_{uuid.uuid4().hex[:12]}", "world_id": a["world_id"], "alliance_id": a["_id"], "player_id": player["_id"], "house_name": player["house_name"], "role": m["role"] if m else "MEMBER", "text": text, "at": clock.now()}
    await db().alliance_chat.insert_one(doc)
    return chat_dto(doc)


async def chat(a: dict, after: str | None, limit: int = 50) -> list[dict]:
    """Newest `limit` messages in chronological order; `after` = ISO timestamp cursor (only strictly newer messages)."""
    flt: dict = {"alliance_id": a["_id"]}
    if after:
        flt["at"] = {"$gt": clock.parse(after)}
    cur = db().alliance_chat.find(flt).sort([("at", -1), ("_id", -1)]).limit(max(1, min(200, limit)))
    rows = [chat_dto(m) async for m in cur]
    rows.reverse()
    return rows


def chat_dto(m: dict) -> dict:
    return {"message_id": m["_id"], "player_id": m.get("player_id"), "house_name": m.get("house_name"), "role": m.get("role"), "text": m["text"], "at": clock.iso(m["at"])}


# ------------------------------------------------------------------------------------------------ treasury
async def _ledger(a_id: str, world_id: str, amount: int, reason: str, ref: str | None, balance_after: int) -> None:
    await db().emerald_ledger.insert_one({"_id": f"led_{uuid.uuid4().hex[:12]}", "world_id": world_id, "alliance_id": a_id, "amount": int(amount), "reason": reason, "ref": ref, "balance_after": int(balance_after), "at": clock.now()})


async def credit_emeralds(world_id: str, alliance_id: str | None, amount: int, reason: str, ref: str | None) -> bool:
    """Idempotent per (reason, ref); append-only ledger; audit notification to authorized members."""
    if not alliance_id or amount <= 0:
        return False
    key = f"{reason}:{ref}" if ref else f"{reason}:{uuid.uuid4().hex}"
    a = await db().alliances.find_one_and_update({"_id": alliance_id, "status": "ACTIVE", "emerald_keys": {"$ne": key}}, {"$inc": {"emeralds": int(amount)}, "$push": {"emerald_keys": {"$each": [key], "$slice": -2000}}}, return_document=True)
    if not a:
        return False
    await _ledger(alliance_id, world_id, amount, reason, ref, int(a["emeralds"]))
    await _notify_alliance(a, "EMERALD_TREASURY_MOVEMENT", {"amount": int(amount), "reason": reason, "balance_after": int(a["emeralds"]), "contract_id_or_source": ref}, f"led:{key}", "alliance/treasury", roles=[r for r in ROLE_ORDER if "treasury" in permissions(r)])
    return True


async def _debit_emeralds(world_id: str, alliance_id: str, amount: int, reason: str, ref: str | None) -> dict:
    a = await db().alliances.find_one_and_update({"_id": alliance_id, "status": "ACTIVE", "emeralds": {"$gte": int(amount)}}, {"$inc": {"emeralds": -int(amount)}}, return_document=True)
    if not a:
        raise ApiError("INSUFFICIENT_EMERALDS", "Treasury cannot cover this amount", 409, {"amount": amount})
    await _ledger(alliance_id, world_id, -int(amount), reason, ref, int(a["emeralds"]))
    await _notify_alliance(a, "EMERALD_TREASURY_MOVEMENT", {"amount": -int(amount), "reason": reason, "balance_after": int(a["emeralds"]), "contract_id_or_source": ref}, f"led:{reason}:{ref}:{int(clock.now().timestamp())}", "alliance/treasury", roles=[r for r in ROLE_ORDER if "treasury" in permissions(r)])
    return a


async def ledger(a: dict, actor: dict, limit: int = 50) -> dict:
    require(a, actor["_id"], "treasury")
    cur = db().emerald_ledger.find({"alliance_id": a["_id"]}).sort("at", -1).limit(limit)
    fresh = await db().alliances.find_one({"_id": a["_id"]}, {"emeralds": 1})
    return {"emeralds": int((fresh or a).get("emeralds", 0)), "entries": [{"ledger_id": e["_id"], "amount": e["amount"], "reason": e["reason"], "ref": e.get("ref"), "balance_after": e["balance_after"], "at": clock.iso(e["at"])} async for e in cur]}


# emerald sources (spec.emeralds.sources) — called from progress / missions hooks
async def on_mission_completed(world_id: str, player_id: str, mission_id: str) -> None:
    p = await db().players.find_one({"_id": player_id}, {"alliance_id": 1})
    if not p or not p.get("alliance_id"):
        return
    src = get_spec().emeralds["sources"]["first_personal_mission_per_member_per_utc_day"]
    day = clock.now().strftime("%Y-%m-%d")
    a = await db().alliances.find_one_and_update(
        {"_id": p["alliance_id"], "status": "ACTIVE", "kind": src["eligible_alliance_type"], f"emerald_daily.{day}.members": {"$ne": player_id}, "$or": [{f"emerald_daily.{day}.total": {"$exists": False}}, {f"emerald_daily.{day}.total": {"$lt": int(src["alliance_daily_cap"])}}]},
        {"$addToSet": {f"emerald_daily.{day}.members": player_id}, "$inc": {f"emerald_daily.{day}.total": int(src["amount"])}},
    )
    if a:
        await credit_emeralds(world_id, a["_id"], int(src["amount"]), "first_mission_of_day", f"{day}:{player_id}")


async def on_pvp_defense_win(world_id: str, defender_id: str, attacker_id: str, battle_id: str) -> None:
    p = await db().players.find_one({"_id": defender_id}, {"alliance_id": 1})
    if not p or not p.get("alliance_id"):
        return
    src = get_spec().emeralds["sources"]["valid_pvp_defense_win"]
    now = clock.now()
    pair = f"{attacker_id}:{defender_id}"
    a = await db().alliances.find_one_and_update(
        {"_id": p["alliance_id"], "status": "ACTIVE", "$or": [{f"emerald_pairs.{pair}": {"$exists": False}}, {f"emerald_pairs.{pair}": {"$lt": now - timedelta(hours=float(src["same_attacker_defender_pair_reward_cooldown_hours"]))}}]},
        {"$set": {f"emerald_pairs.{pair}": now}},
    )
    if a:
        await credit_emeralds(world_id, a["_id"], int(src["amount"]), "pvp_defense_win", battle_id)


async def on_pvp_conquest(world_id: str, new_owner_id: str, battle_id: str) -> None:
    p = await db().players.find_one({"_id": new_owner_id}, {"alliance_id": 1})
    if p and p.get("alliance_id"):
        await credit_emeralds(world_id, p["alliance_id"], int(get_spec().emeralds["sources"]["pvp_settlement_conquest"]["amount"]), "pvp_conquest", battle_id)


# ------------------------------------------------------------------------------------------------ mercenary contracts
async def offer_contract(world: dict, a: dict, actor: dict, target_alliance_id: str, emeralds: int, duration_hours: int) -> dict:
    """Client alliance posts an offer: escrow debited atomically from its treasury (spec.mercenary_contract)."""
    require(a, actor["_id"], "mercenary")  # DIPLOMAT holds only mercenary_proposal_no_treasury_spend → cannot escrow
    mc = _merc()
    target = await get(world["_id"], target_alliance_id)
    if target["_id"] == a["_id"]:
        raise ApiError("INVALID_TARGET", "Cannot hire against yourself", 400)
    emeralds = int(emeralds)
    if not int(mc["escrow_offer_min_emeralds"]) <= emeralds <= int(mc["escrow_offer_max_emeralds"]):
        raise ApiError("INVALID_ESCROW", "Escrow out of range", 400, {"min": mc["escrow_offer_min_emeralds"], "max": mc["escrow_offer_max_emeralds"]})
    if int(duration_hours) not in [int(d) for d in mc["durations_hours"]]:
        raise ApiError("INVALID_DURATION", "Duration not allowed", 400, {"allowed": mc["durations_hours"]})
    cid = f"ctr_{uuid.uuid4().hex[:12]}"
    await _debit_emeralds(world["_id"], a["_id"], emeralds, "mercenary_escrow", cid)
    now = clock.now()
    doc = {"_id": cid, "world_id": world["_id"], "client_alliance_id": a["_id"], "client_name": a["name"], "client_tag": a["tag"], "target_alliance_id": target["_id"], "target_name": target["name"], "target_tag": target["tag"], "provider_alliance_id": None, "provider_name": None, "provider_tag": None, "emeralds": emeralds, "duration_hours": int(duration_hours), "status": "OFFERED", "offered_by": actor["_id"], "offered_at": now}
    await db().mercenary_contracts.insert_one(doc)
    async for merc in db().alliances.find({"world_id": world["_id"], "status": "ACTIVE", "kind": MERCENARY, "_id": {"$ne": target["_id"]}}):
        await _notify_alliance(merc, "MERCENARY_OFFER", {"contract_id": cid, "target_alliance_id": target["_id"], "target_name": target["name"], "client_name": a["name"], "emerald_offer": emeralds, "duration_hours": int(duration_hours)}, f"offer:{cid}", "alliance/mercenary", roles=["LEADER", "VICE", "DIPLOMAT"])
    return contract_dto(doc)


async def withdraw_offer(a: dict, actor: dict, contract_id: str) -> dict:
    require(a, actor["_id"], "mercenary")
    c = await db().mercenary_contracts.find_one({"_id": contract_id, "client_alliance_id": a["_id"]})
    if not c or c["status"] != "OFFERED":
        raise ApiError("CONTRACT_STATE", "Only open offers can be withdrawn", 409)
    await _refund_offer(c, "WITHDRAWN")
    return contract_dto(await db().mercenary_contracts.find_one({"_id": contract_id}))


async def _refund_offer(c: dict, reason: str) -> None:
    res = await db().mercenary_contracts.update_one({"_id": c["_id"], "status": "OFFERED"}, {"$set": {"status": "CANCELLED", "result": reason, "ended_at": clock.now()}})
    if res.modified_count:
        await credit_emeralds(c["world_id"], c["client_alliance_id"], int(c["emeralds"]), "mercenary_escrow_refund", c["_id"])


async def accept_contract(world: dict, a: dict, actor: dict, contract_id: str) -> dict:
    """Provider (MERCENARY only, ≤3 active) accepts: auto-war on the target, PNA broken without penalty, timer set."""
    require(a, actor["_id"], "mercenary")
    if a["kind"] != MERCENARY:
        raise ApiError("NOT_MERCENARY", "Only Mercenary alliances accept contracts", 409)
    mc = _merc()
    if await db().mercenary_contracts.count_documents({"provider_alliance_id": a["_id"], "status": "ACTIVE"}) >= int(mc["max_active_contracts_per_mercenary_alliance"]):
        raise ApiError("CONTRACTS_FULL", "Max 3 active contracts", 409)
    c = await db().mercenary_contracts.find_one({"_id": contract_id, "world_id": world["_id"]})
    if not c or c["status"] != "OFFERED":
        raise ApiError("CONTRACT_STATE", "Offer no longer available", 409)
    if a["_id"] in (c["client_alliance_id"], c["target_alliance_id"]):
        raise ApiError("INVALID_TARGET", "Cannot accept a contract involving your own alliance", 409)
    target = await get(world["_id"], c["target_alliance_id"])
    now = clock.now()
    ends = now + timedelta(hours=float(c["duration_hours"]))
    res = await db().mercenary_contracts.update_one({"_id": c["_id"], "status": "OFFERED"}, {"$set": {"status": "ACTIVE", "provider_alliance_id": a["_id"], "provider_name": a["name"], "provider_tag": a["tag"], "accepted_by": actor["_id"], "accepted_at": now, "ends_at": ends}})
    if res.modified_count != 1:
        raise ApiError("CONTRACT_STATE", "Offer no longer available", 409)
    await _start_war(world["_id"], a["_id"], target["_id"], "MERCENARY_CONTRACT", c["_id"])
    await scheduler.schedule(world["_id"], "MERCENARY_CONTRACT_END", ends, c["_id"], f"contract_end:{c['_id']}", {"contract_id": c["_id"]})
    payload = {"contract_id": c["_id"], "escrow": int(c["emeralds"]), "duration_hours": int(c["duration_hours"]), "auto_war": True, "bonuses": mc["target_only_bonuses"], "provider_name": a["name"], "target_name": target["name"], "client_name": c["client_name"], "ends_at": clock.iso(ends)}
    for aid in (c["client_alliance_id"], a["_id"], target["_id"]):
        al = await db().alliances.find_one({"_id": aid, "status": "ACTIVE"})
        if al:
            await _notify_alliance(al, "MERCENARY_CONTRACT_ACTIVE", payload, f"ctr_active:{c['_id']}", "alliance/mercenary")
    return contract_dto(await db().mercenary_contracts.find_one({"_id": c["_id"]}))


@scheduler.handler("MERCENARY_CONTRACT_END")
async def on_contract_end(evt: dict) -> None:
    c = await db().mercenary_contracts.find_one({"_id": evt["payload"]["contract_id"]})
    if c and c["status"] == "ACTIVE":
        await _end_contract(c, "SUCCESS_EXPIRY")


async def _end_contract(c: dict, result: str) -> None:
    """STC-31: natural expiry / target dissolution = success (100% escrow → provider treasury, +10 prestige);
    provider dissolution = failure (escrow back to client)."""
    now = clock.now()
    success = result.startswith("SUCCESS")
    res = await db().mercenary_contracts.update_one({"_id": c["_id"], "status": "ACTIVE"}, {"$set": {"status": "COMPLETED" if success else "FAILED", "result": result, "ended_at": now}})
    if res.modified_count != 1:
        return
    await scheduler.cancel(f"contract_end:{c['_id']}")
    await db().alliance_relations.update_many({"locked_by_contract_id": c["_id"]}, {"$unset": {"locked_by_contract_id": ""}})
    prestige = 0
    if success:
        await credit_emeralds(c["world_id"], c["provider_alliance_id"], int(c["emeralds"]), "mercenary_contract_success", c["_id"])
        prestige = int(progress.PRESTIGE["mercenary_contract_success_provider"])
        prov = await db().alliances.find_one_and_update({"_id": c["provider_alliance_id"]}, {"$inc": {"mercenary_prestige": prestige, "contracts_completed": 1}}, return_document=True)
        for m in (prov or {}).get("members", []):
            await progress.award_prestige(c["world_id"], m["player_id"], prestige, "mercenary_contract", c["_id"])
    else:
        await credit_emeralds(c["world_id"], c["client_alliance_id"], int(c["emeralds"]), "mercenary_escrow_refund", c["_id"])
    payload = {"contract_id": c["_id"], "result": result, "prestige_delta": prestige, "feedback_available": success, "escrow": int(c["emeralds"]), "provider_name": c.get("provider_name"), "target_name": c.get("target_name")}
    for aid in (c["client_alliance_id"], c.get("provider_alliance_id")):
        al = await db().alliances.find_one({"_id": aid, "status": "ACTIVE"}) if aid else None
        if al:
            await _notify_alliance(al, "MERCENARY_CONTRACT_ENDED", payload, f"ctr_end:{c['_id']}", "alliance/mercenary")


async def market(world_id: str, a: dict) -> dict:
    """Open offers (for Mercenary alliances, excluding contracts against themselves) + every contract involving `a`."""
    offers = []
    if a["kind"] == MERCENARY:
        offers = [contract_dto(c) async for c in db().mercenary_contracts.find({"world_id": world_id, "status": "OFFERED", "target_alliance_id": {"$ne": a["_id"]}, "client_alliance_id": {"$ne": a["_id"]}}).sort("offered_at", -1)]
    involved = [contract_dto(c) async for c in db().mercenary_contracts.find({"world_id": world_id, "$or": [{"client_alliance_id": a["_id"]}, {"provider_alliance_id": a["_id"]}, {"target_alliance_id": a["_id"], "status": {"$in": ["ACTIVE", "COMPLETED", "FAILED"]}}]}).sort("offered_at", -1).limit(30)]
    return {"offers": offers, "contracts": involved, "durations_hours": _merc()["durations_hours"], "escrow_min": _merc()["escrow_offer_min_emeralds"], "escrow_max": _merc()["escrow_offer_max_emeralds"], "max_active": _merc()["max_active_contracts_per_mercenary_alliance"], "bonuses": _merc()["target_only_bonuses"]}


async def contract_bonuses(attacker: dict, defender_player_id: str | None) -> dict | None:
    """+5% single-march cap / +3% ATK for a provider member marching on the contract target (snapshot at march start)."""
    if not defender_player_id or not attacker.get("alliance_id"):
        return None
    d = await db().players.find_one({"_id": defender_player_id}, {"alliance_id": 1})
    if not d or not d.get("alliance_id"):
        return None
    c = await db().mercenary_contracts.find_one({"provider_alliance_id": attacker["alliance_id"], "target_alliance_id": d["alliance_id"], "status": "ACTIVE"})
    if not c:
        return None
    b = _merc()["target_only_bonuses"]
    return {"contract_id": c["_id"], "single_march_capacity_pct": int(b["single_march_capacity_pct"]), "attack_pct": int(b["attack_pct"])}


# ------------------------------------------------------------------------------------------------ DTOs
def public_dto(a: dict) -> dict:
    leader = next((m for m in a.get("members", []) if m["role"] == "LEADER"), None)
    return {
        "alliance_id": a["_id"],
        "name": a["name"],
        "tag": a["tag"],
        "kind": a["kind"],
        "description": a.get("description") or "",
        "member_count": len(a.get("members", [])),
        "cap": cap_of(a["kind"]),
        "leader_house": (leader or {}).get("house_name"),
        "mercenary_prestige": int(a.get("mercenary_prestige", 0)),
        "contracts_completed": int(a.get("contracts_completed", 0)),
        "created_at": clock.iso(a["created_at"]),
    }


def invite_dto(i: dict) -> dict:
    return {"invite_id": i["_id"], "alliance_id": i["alliance_id"], "alliance_name": i.get("alliance_name"), "alliance_tag": i.get("alliance_tag"), "alliance_kind": i.get("alliance_kind"), "player_id": i["player_id"], "house_name": i.get("house_name"), "sender_house": i.get("sender_house"), "role": i["role"], "status": i["status"], "expires_at": clock.iso(i["expires_at"])}


def vote_dto(v: dict) -> dict:
    n = len(v["eligible"])
    return {"vote_id": v["_id"], "target_alliance_id": v["target_alliance_id"], "target_name": v.get("target_name"), "target_tag": v.get("target_tag"), "proposed_by_house": v.get("proposed_by_house"), "opened_at": clock.iso(v["opened_at"]), "closes_at": clock.iso(v["closes_at"]), "eligible": n, "needed": n // 2 + 1, "yes": sum(1 for p, ok in v["votes"].items() if ok), "no": sum(1 for p, ok in v["votes"].items() if not ok), "votes": v["votes"], "status": v["status"]}


def contract_dto(c: dict) -> dict:
    return {k: c.get(k) for k in ("client_alliance_id", "client_name", "client_tag", "target_alliance_id", "target_name", "target_tag", "provider_alliance_id", "provider_name", "provider_tag", "emeralds", "duration_hours", "status", "result")} | {"contract_id": c["_id"], "offered_at": clock.iso(c.get("offered_at")), "accepted_at": clock.iso(c.get("accepted_at")), "ends_at": clock.iso(c.get("ends_at")), "ended_at": clock.iso(c.get("ended_at"))}


async def relation_dto(world_id: str, a: dict, r: dict) -> dict:
    other_id = next((x for x in r["alliances"] if x != a["_id"]), None)
    other = await db().alliances.find_one({"_id": other_id}, {"name": 1, "tag": 1, "kind": 1}) if other_id else None
    pp = r.get("pna_proposal")
    pe = r.get("peace_proposal")
    return {
        "relation_id": r["_id"],
        "alliance_id": other_id,
        "name": (other or {}).get("name"),
        "tag": (other or {}).get("tag"),
        "kind": (other or {}).get("kind"),
        "state": r["state"],
        "since": clock.iso(r.get("since")),
        "until": clock.iso(r.get("until")),
        "war_reason": r.get("war_reason"),
        "locked_by_contract_id": r.get("locked_by_contract_id"),
        "pna_proposal": {"by": pp["by"], "by_name": pp.get("by_name"), "mine": pp["by"] == a["_id"], "at": clock.iso(pp["at"])} if pp else None,
        "peace_proposal": {"by": pe["by"], "by_name": pe.get("by_name"), "mine": pe["by"] == a["_id"], "expires_at": clock.iso(pe["expires_at"])} if pe else None,
    }


async def full_dto(world_id: str, a: dict, viewer: dict) -> dict:
    m = member_of(a, viewer["_id"])
    role = m["role"] if m else None
    perms = sorted({p for p in ["alliance_settings", "invite", "remove_member", "roles", "pna", "war_proposal", "war_vote", "peace", "peace_proposal", "treasury", "mercenary", "dissolve", "transfer_leadership", "chat"] if has_perm(a, viewer["_id"], p)}) if m else []
    rels = [r async for r in db().alliance_relations.find({"world_id": world_id, "alliances": a["_id"], "$or": [{"state": {"$ne": "NEUTRAL"}}, {"pna_proposal": {"$exists": True}}, {"peace_proposal": {"$exists": True}}]})]
    votes = [vote_dto(v) async for v in db().war_votes.find({"alliance_id": a["_id"], "status": "OPEN"})]
    crests = {p["_id"]: p.get("house_crest") async for p in db().players.find({"_id": {"$in": [x["player_id"] for x in a["members"]]}}, {"house_crest": 1})}
    contracts_active = await db().mercenary_contracts.count_documents({"status": "ACTIVE", "$or": [{"provider_alliance_id": a["_id"]}, {"client_alliance_id": a["_id"]}, {"target_alliance_id": a["_id"]}]})
    return {
        **public_dto(a),
        "my_role": role,
        "permissions": perms,
        "members": sorted(
            [{"player_id": x["player_id"], "house_name": x["house_name"], "house_crest": crests.get(x["player_id"]), "role": x["role"], "joined_at": clock.iso(x["joined_at"]), "leaving_at": clock.iso(x.get("leaving_at")), "is_me": x["player_id"] == viewer["_id"]} for x in a["members"]],
            key=lambda x: (ROLE_ORDER.index(x["role"]), x["joined_at"]),
        ),
        "emeralds": int(a.get("emeralds", 0)) if "treasury" in perms else None,
        "relations": [await relation_dto(world_id, a, r) for r in rels],
        "open_votes": votes,
        "pending_invites": [invite_dto(i) async for i in db().alliance_invites.find({"alliance_id": a["_id"], "status": "PENDING", "expires_at": {"$gt": clock.now()}})] if "invite" in perms else [],
        "contracts_active": contracts_active,
        "at_war": any(r["state"] in ("WAR", "PEACE_PENDING") for r in rels),
        "pyramid_eligible": a["kind"] == STRUCTURED,
        "war_vote_roles": _policy()["war_vote"]["eligible_roles"],
        "server_time": clock.iso(clock.now()),
    }


def player_alliance_dto(p: dict, a: dict | None) -> dict | None:
    if not a:
        return None
    return {"alliance_id": a["_id"], "name": a["name"], "tag": a["tag"], "kind": a["kind"], "role": p.get("alliance_role")}

