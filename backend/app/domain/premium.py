"""Rubies & premium (Bible §23, spec.premium / player_specialization / cancellation_policy).

Account-level Ruby wallet (`accounts.rubies`, server source of truth) + append-only `ruby_transactions` ledger keyed by
(account_id, idempotency_key). The Play Billing catalog is EMPTY (spec.premium.store_products.status) → the purchase UI is
hidden and no production grant exists; QA grants exist for testing only.

Allowed spends (spec.premium): instant completion of an ALREADY STARTED construction / research / recruitment job at a
cost proportional to the remaining minutes (with minimums), specialization change (2.500), cosmetics catalog (House rename).
Forbidden: Conquest Cart & legendary recruitment, Mythic/Unicorn, wall HP, loyalty, march speed-ups, Pyramid outcome,
and any completion while a siege is active or a hostile march arrives within 60 minutes (competitive lock).
"""
from __future__ import annotations

import math
import uuid
from datetime import timedelta

from pymongo.errors import DuplicateKeyError

from app.core import clock
from app.core.db import db
from app.core.errors import ApiError
from app.core.spec import get_spec
from app.domain import construction, house, scheduler
from app.domain.settlements import job_dto

COSMETICS_CATALOG = {"version": "cosmetics_v1", "items": {"house_rename": {"price_rubies": 500, "label": "Rinomina Casata"}}}
FINISH_RULES = {"BUILDING": "construction_completion", "SETTLEMENT_UPGRADE": "construction_completion", "RESEARCH": "research_completion", "RECRUIT": "recruitment_completion"}
FORBIDDEN_UNIT_CATEGORIES = {"special", "legendary"}  # Carro di Conquista, Drago/Angelo/Demone
OFFENSIVE = ("ATTACK", "RAID", "CONQUEST", "INTERCEPT")


def _premium() -> dict:
    return get_spec().premium


# ------------------------------------------------------------------------------------------------ wallet
async def balance(account_id: str) -> int:
    a = await db().accounts.find_one({"_id": account_id}, {"rubies": 1})
    return int((a or {}).get("rubies", 0))


async def wallet(account_id: str, limit: int = 30) -> dict:
    from app.domain.store import CHANNEL, RUBY_PACKS  # local import: store.py builds on this module

    cur = db().ruby_transactions.find({"account_id": account_id}).sort("at", -1).limit(limit)
    return {
        "rubies": await balance(account_id),
        "store": {"status": "ACTIVE", "products": [p["product_id"] for p in RUBY_PACKS], "channels": [CHANNEL]},
        "cosmetics": COSMETICS_CATALOG,
        "transactions": [tx_dto(t) async for t in cur],
        "server_time": clock.iso(clock.now()),
    }


def tx_dto(t: dict) -> dict:
    return {"transaction_id": t["_id"], "kind": t["kind"], "amount": int(t["amount"]), "balance_after": int(t.get("balance_after", 0)), "effect": t.get("effect"), "world_id": t.get("world_id"), "at": clock.iso(t["at"])}


async def _existing(account_id: str, key: str | None) -> dict | None:
    if not key:
        return None
    return await db().ruby_transactions.find_one({"account_id": account_id, "idempotency_key": key})


async def _move(account_id: str, amount: int, kind: str, effect: dict, key: str | None, world_id: str | None) -> dict:
    """Move Rubies exactly once per (account_id, idempotency_key).

    MongoDB gives us no multi-document transaction here, so the ledger row itself is the lock: it is written first
    (the unique partial index rejects any concurrent duplicate) and only the caller that flips it from PENDING to
    APPLIED touches the balance. A negative `amount` is a spend and carries a balance guard.
    """
    if key and (ex := await _existing(account_id, key)):
        return await _settle(ex["_id"], amount)
    tx = {
        "_id": f"rtx_{uuid.uuid4().hex[:12]}", "account_id": account_id, "world_id": world_id, "kind": kind,
        "amount": int(amount), "effect": effect, "idempotency_key": key, "status": "PENDING",
        "policy_version": get_spec().version, "at": clock.now(),
    }
    try:
        await db().ruby_transactions.insert_one(tx)
    except DuplicateKeyError:
        ex = await _existing(account_id, key)
        return await _settle(ex["_id"], amount)
    return await _settle(tx["_id"], amount)


async def _settle(tx_id: str, amount: int) -> dict:
    """Apply a PENDING ledger row's balance movement. The status transition is what makes it exactly-once."""
    row = await db().ruby_transactions.find_one_and_update({"_id": tx_id, "status": "PENDING"}, {"$set": {"status": "APPLIED"}}, return_document=True)
    if row is None:  # another caller already applied this row — replay its result
        done = await db().ruby_transactions.find_one({"_id": tx_id})
        if done is not None and "balance_after" not in done:
            done = {**done, "balance_after": await balance(done["account_id"])}
        return done
    account_id, delta = row["account_id"], int(row["amount"])
    flt: dict = {"_id": account_id}
    if delta < 0:
        flt["rubies"] = {"$gte": -delta}
    acc = await db().accounts.find_one_and_update(flt, {"$inc": {"rubies": delta}}, return_document=True)
    if acc is None:
        await db().ruby_transactions.delete_one({"_id": tx_id})  # nothing moved: drop the claim so a retry can work
        if await db().accounts.count_documents({"_id": account_id}, limit=1) == 0:
            raise ApiError("ACCOUNT_NOT_FOUND", "Account not found", 404)
        raise ApiError("INSUFFICIENT_RUBIES", "Not enough Rubies", 409, {"price_rubies": -delta, "rubies": await balance(account_id)})
    await db().ruby_transactions.update_one({"_id": tx_id}, {"$set": {"balance_after": int(acc["rubies"])}})
    return {**row, "balance_after": int(acc["rubies"])}


async def _debit(account_id: str, amount: int, kind: str, effect: dict, key: str | None, world_id: str | None) -> dict:
    """Atomic spend: balance guard + ledger row (Bible §23: no double spend, idempotent per key)."""
    return await _move(account_id, -int(amount), kind, effect, key, world_id)


async def refund(account_id: str, amount: int, kind: str, effect: dict, key: str | None = None) -> dict:
    """Give Rubies back when the effect a debit paid for could not be applied. Idempotent on `key`."""
    return await grant(account_id, int(amount), kind, effect, key)


async def grant(account_id: str, amount: int, kind: str, effect: dict, key: str | None = None) -> dict:
    """Credit path (QA grants now; validated store purchases later — spec: production grant requires catalog match)."""
    return await _move(account_id, int(amount), kind, effect, key, None)


# ------------------------------------------------------------------------------------------------ instant completion
def remaining_minutes(job: dict) -> int:
    return max(0, math.ceil((clock.aware(job["ends_at"]) - clock.now()).total_seconds() / 60.0))


def finish_price(job: dict) -> dict:
    rule = FINISH_RULES[job["kind"]]
    cfg = _premium()[rule]
    mins = remaining_minutes(job)
    price = max(int(cfg["min_cost"]), math.ceil(mins * float(cfg["rubies_per_remaining_minute"])))
    return {"rule": rule, "remaining_minutes": mins, "price_rubies": int(price), "min_cost": int(cfg["min_cost"]), "rubies_per_minute": float(cfg["rubies_per_remaining_minute"])}


def siege_active(settlement: dict) -> bool:
    """A settlement is under siege while its Loyalty is below start and the recovery delay since the last hit is running."""
    c = get_spec().conquest
    hit = clock.aware(settlement.get("last_conquest_hit_at"))
    return int(settlement.get("loyalty", c["loyalty_start"])) < int(c["loyalty_start"]) and bool(hit) and hit + timedelta(hours=float(c["loyalty_recovery_delay_hours"])) > clock.now()


async def competitive_lock(settlement: dict) -> dict | None:
    if siege_active(settlement):
        return {"reason": "SIEGE_ACTIVE"}
    horizon = clock.now() + timedelta(minutes=float(_premium()["competitive_lock_incoming_hostile_eta_minutes"]))
    m = await db().marches.find_one({"world_id": settlement["world_id"], "target_settlement_id": settlement["_id"], "status": "OUTBOUND", "mission": {"$in": list(OFFENSIVE)}, "player_id": {"$ne": settlement.get("owner_player_id")}, "arrival_at": {"$lte": horizon}})
    if m:
        return {"reason": "INCOMING_HOSTILE", "arrival_at": clock.iso(m["arrival_at"])}
    return None


async def quote_finish(job: dict, player: dict, account_id: str) -> dict:
    out: dict = {"job_id": job["_id"], "kind": job["kind"], "target": job.get("target"), "allowed": False, "reason": None, "rubies": await balance(account_id)}
    if job["player_id"] != player["_id"]:
        return {**out, "reason": "NOT_OWNER"}
    if job["status"] != "RUNNING":
        return {**out, "reason": "JOB_NOT_RUNNING"}
    if job["kind"] not in FINISH_RULES:
        return {**out, "reason": "FORBIDDEN_JOB_KIND"}
    if job.get("player_wide"):
        return {**out, "reason": "FORBIDDEN_MYTHIC"}  # Bible §12: rubies never complete the Santuario Mitico
    if job["kind"] == "RECRUIT":
        unit = get_spec().units_by_name.get(job["target"], {})
        if unit.get("category") in FORBIDDEN_UNIT_CATEGORIES:
            return {**out, "reason": "FORBIDDEN_UNIT"}
    settlement = await db().settlements.find_one({"_id": job["settlement_id"]})
    if not settlement:
        return {**out, "reason": "SETTLEMENT_NOT_FOUND"}
    lock = await competitive_lock(settlement)
    if lock:
        return {**out, **finish_price(job), "reason": lock["reason"], "lock": lock}
    price = finish_price(job)
    return {**out, **price, "allowed": True, "affordable": out["rubies"] >= price["price_rubies"]}


async def finish_job(job: dict, player: dict, account_id: str, idempotency_key: str | None) -> dict:
    """Instant completion: debit, then run the SAME completion handler the scheduler would run (idempotent)."""
    ex = await _existing(account_id, idempotency_key)
    if ex:
        fresh = await db().jobs.find_one({"_id": job["_id"]})
        return {"job": job_dto(fresh) if fresh else None, "price_rubies": -int(ex["amount"]), "rubies": await balance(account_id), "replayed": True}
    q = await quote_finish(job, player, account_id)
    if not q["allowed"]:
        raise ApiError(q["reason"], "Instant completion not allowed for this job", 409, {k: v for k, v in q.items() if k in ("lock", "kind", "target")})
    price = int(q["price_rubies"])
    now = clock.now()
    claimed = await db().jobs.find_one_and_update({"_id": job["_id"], "status": "RUNNING"}, {"$set": {"ends_at": now, "premium_finished_at": now}}, return_document=True)
    if not claimed:
        raise ApiError("JOB_NOT_RUNNING", "Job already finished", 409)
    try:
        tx = await _debit(account_id, price, "FINISH_JOB", {"job_id": job["_id"], "kind": job["kind"], "target": job.get("target"), "target_level": job.get("target_level"), "count": job.get("count"), "remaining_minutes": q["remaining_minutes"]}, idempotency_key, job["world_id"])
    except ApiError:
        await db().jobs.update_one({"_id": job["_id"], "status": "RUNNING"}, {"$set": {"ends_at": job["ends_at"]}, "$unset": {"premium_finished_at": ""}})
        raise
    await scheduler.cancel(f"job_complete:{job['_id']}")
    await construction.on_job_complete({"payload": {"job_id": job["_id"]}})
    fresh = await db().jobs.find_one({"_id": job["_id"]})
    return {"job": job_dto(fresh), "price_rubies": price, "rubies": int(tx["balance_after"]), "replayed": False}


# ------------------------------------------------------------------------------------------------ cosmetics
async def rename_house(player: dict, account_id: str, new_name: str, idempotency_key: str | None) -> dict:
    ex = await _existing(account_id, idempotency_key)
    if ex:
        return {"house": house.dto(await db().players.find_one({"_id": player["_id"]})), "price_rubies": -int(ex["amount"]), "rubies": await balance(account_id), "replayed": True}
    new_name = (new_name or "").strip()
    if not 3 <= len(new_name) <= 40:
        raise ApiError("INVALID_HOUSE_NAME", "House name must be 3–40 characters", 400)
    if new_name.lower() != player["house_name"].lower() and await db().players.find_one({"world_id": player["world_id"], "house_name_lc": new_name.lower()}):
        raise ApiError("HOUSE_NAME_TAKEN", "House name already used in this world", 409)
    price = int(COSMETICS_CATALOG["items"]["house_rename"]["price_rubies"])
    tx = await _debit(account_id, price, "COSMETIC_HOUSE_RENAME", {"from": player["house_name"], "to": new_name, "catalog": COSMETICS_CATALOG["version"]}, idempotency_key, player["world_id"])
    d = await house.rename(player, new_name)
    return {"house": d, "price_rubies": price, "rubies": int(tx["balance_after"]), "replayed": False}


# ------------------------------------------------------------------------------------------------ specialization
async def specialization_state(player: dict, account_id: str) -> dict:
    ps = get_spec().player_specialization
    now = clock.now()
    changed = clock.aware(player.get("specialization_changed_at"))
    cooldown_until = changed + timedelta(hours=float(ps["change_cooldown_hours"])) if changed and player.get("specialization") else None
    blocked: list[str] = []
    if player.get("specialization"):
        if cooldown_until and cooldown_until > now:
            blocked.append("COOLDOWN")
        if player.get("alliance_id") and await db().alliance_relations.count_documents({"alliances": player["alliance_id"], "state": {"$in": ["WAR", "PEACE_PENDING"]}}):
            blocked.append("AT_WAR")
        async for s in db().settlements.find({"owner_player_id": player["_id"]}, {"loyalty": 1, "last_conquest_hit_at": 1}):
            if siege_active(s):
                blocked.append("ACTIVE_SIEGE")
                break
        if await db().marches.count_documents({"player_id": player["_id"], "status": {"$in": ["OUTBOUND", "RESOLVING", "RETURNING"]}, "mission": {"$in": list(OFFENSIVE)}}):
            blocked.append("ACTIVE_MILITARY_MARCH")
    first = not player.get("specialization")
    available = int(player.get("settlement_count", 0)) >= int(ps["available_at_owned_settlement_count"])
    return {
        "current": player.get("specialization"),
        "choices": {k: {"bonus_pct": v["bonus_pct"], "effect": v["effect"]} for k, v in ps["choices"].items()},
        "available": available,
        "required_settlements": int(ps["available_at_owned_settlement_count"]),
        "settlement_count": int(player.get("settlement_count", 0)),
        "price_rubies": 0 if first else int(ps["change_cost_rubies"]),
        "cooldown_until": clock.iso(cooldown_until) if cooldown_until and cooldown_until > now else None,
        "blocked": blocked,
        "rubies": await balance(account_id),
    }


async def set_specialization(player: dict, account_id: str, choice: str, idempotency_key: str | None) -> dict:
    ps = get_spec().player_specialization
    if choice not in ps["choices"]:
        raise ApiError("INVALID_SPECIALIZATION", "Unknown specialization", 400, {"choices": list(ps["choices"])})
    ex = await _existing(account_id, idempotency_key)
    if ex:
        return await specialization_state(await db().players.find_one({"_id": player["_id"]}), account_id)
    st = await specialization_state(player, account_id)
    if not st["available"]:
        raise ApiError("SPECIALIZATION_LOCKED", f"Requires {st['required_settlements']} owned settlements", 409, {"required": st["required_settlements"]})
    if player.get("specialization") == choice:
        raise ApiError("SPECIALIZATION_UNCHANGED", "Already your specialization", 409)
    if st["blocked"]:
        raise ApiError(st["blocked"][0], "Specialization change blocked", 409, {"blocked": st["blocked"], "cooldown_until": st["cooldown_until"]})
    now = clock.now()
    if st["price_rubies"] > 0:
        await _debit(account_id, st["price_rubies"], "SPECIALIZATION_CHANGE", {"from": player.get("specialization"), "to": choice}, idempotency_key, player["world_id"])
    await db().players.update_one({"_id": player["_id"]}, {"$set": {"specialization": choice, "specialization_changed_at": now}})
    return await specialization_state(await db().players.find_one({"_id": player["_id"]}), account_id)
