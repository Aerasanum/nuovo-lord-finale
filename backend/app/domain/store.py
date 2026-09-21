"""Negozio (owner decision, June 2026 — supersedes the «store DISABLED» clause of Bible §23).

Two shelves:
  • Ruby packs sold in € through Google Play. The client starts the purchase with RevenueCat (`appUserID` = account_id);
    Google validates it, RevenueCat posts a NON_RENEWING_PURCHASE webhook and ONLY THEN the server grants the pack
    (`grant_purchase`, idempotent per transaction_id). Nothing is ever credited from a client callback.
    Bonuses: the 1.99 € pack includes one castle skin of the 300-tier (first not yet owned; all owned → the tier value
    in Rubies instead), the 4.99 € pack includes 200 Orsi delivered to the Mother of the world where the Lord claims
    them (`pending_rewards`, account-level until claimed), the 49.99 € pack pays ×10 Rubies on its first purchase.
  • Premium castle skins bought with Rubies — account-level ownership (`accounts.castle_skins`), usable in every world.

Everything commercial (prices, pack sizes) is channel data, not competitive gameplay canon (spec.premium.store_products).
"""
from __future__ import annotations

import uuid

from pymongo.errors import DuplicateKeyError

from app.core import clock, config
from app.core.db import db
from app.core.errors import ApiError
from app.domain import notifications, premium

RUBY_PACKS: list[dict] = [
    {"product_id": "eld_rubies_199", "key": "s", "price_eur": 1.99, "rubies": 200, "bonus": {"type": "CASTLE_SKIN", "tier": 300}},
    {"product_id": "eld_rubies_499", "key": "m", "price_eur": 4.99, "rubies": 500, "bonus": {"type": "UNITS", "units": {"Orso": 200}}},
    {"product_id": "eld_rubies_999", "key": "l", "price_eur": 9.99, "rubies": 1100, "bonus": None},
    {"product_id": "eld_rubies_1999", "key": "xl", "price_eur": 19.99, "rubies": 2400, "bonus": None},
    {"product_id": "eld_rubies_4999", "key": "xxl", "price_eur": 49.99, "rubies": 6500, "bonus": {"type": "FIRST_PURCHASE_MULTIPLIER", "mult": 10}},
]
PACK_BY_ID = {p["product_id"]: p for p in RUBY_PACKS}

# Premium castle skins (visual definition in frontend/src/map3d/castle.ts). Tiers decided by the owner: 300 / 600 / 900.
PREMIUM_SKINS: list[dict] = [
    {"id": "frost", "tier": 300},
    {"id": "sylvan", "tier": 300},
    {"id": "ocean", "tier": 300},
    {"id": "light", "tier": 600},
    {"id": "sun", "tier": 600},
    {"id": "night", "tier": 600},
    {"id": "dragon", "tier": 900},
    {"id": "demon", "tier": 900},
    {"id": "volcano", "tier": 900},
]
SKIN_BY_ID = {s["id"]: s for s in PREMIUM_SKINS}
CHANNEL = "GOOGLE_PLAY"


def owned_skins(account: dict | None) -> set[str]:
    return set((account or {}).get("castle_skins") or [])


async def account(account_id: str) -> dict:
    a = await db().accounts.find_one({"_id": account_id})
    if not a:
        raise ApiError("ACCOUNT_NOT_FOUND", "Account not found", 404)
    return a


def pack_dto(p: dict, acc: dict) -> dict:
    bonus = dict(p["bonus"]) if p["bonus"] else None
    if bonus and bonus["type"] == "FIRST_PURCHASE_MULTIPLIER":
        bonus["available"] = p["product_id"] not in (acc.get("store_first_purchases") or [])
    return {"product_id": p["product_id"], "key": p["key"], "price_eur": p["price_eur"], "currency": "EUR", "rubies": p["rubies"], "bonus": bonus}


def reward_dto(r: dict) -> dict:
    return {"reward_id": r["reward_id"], "product_id": r["product_id"], "units": r["units"], "at": clock.iso(r["at"])}


async def overview(account_id: str) -> dict:
    acc = await account(account_id)
    owned = owned_skins(acc)
    return {
        "rubies": int(acc.get("rubies", 0)),
        "billing": {"channel": CHANNEL, "status": "LIVE" if config.STORE_BILLING_LIVE else "COMING_SOON", "environment": config.STORE_ENVIRONMENT},
        "packs": [pack_dto(p, acc) for p in RUBY_PACKS],
        "skins": [{**s, "price_rubies": s["tier"], "owned": s["id"] in owned} for s in PREMIUM_SKINS],
        "pending_rewards": [reward_dto(r) for r in (acc.get("pending_rewards") or [])],
        "purchases": await db().store_purchases.count_documents({"account_id": account_id}),
        "server_time": clock.iso(clock.now()),
    }


# ------------------------------------------------------------------------------------------------ skins for Rubies
async def buy_skin(account_id: str, skin_id: str, idempotency_key: str | None, world_id: str | None) -> dict:
    skin = SKIN_BY_ID.get(skin_id)
    if not skin:
        raise ApiError("INVALID_SKIN", "Unknown premium castle skin", 400, {"skins": list(SKIN_BY_ID)})
    ex = await premium._existing(account_id, idempotency_key)
    if ex:
        return {**(await overview(account_id)), "bought": skin_id, "price_rubies": -int(ex["amount"]), "replayed": True}
    acc = await account(account_id)
    if skin_id in owned_skins(acc):
        raise ApiError("SKIN_ALREADY_OWNED", "You already own this castle skin", 409, {"skin": skin_id})
    tx = await premium._debit(account_id, int(skin["tier"]), "CASTLE_SKIN_PURCHASE", {"skin": skin_id, "tier": skin["tier"]}, idempotency_key, world_id)
    try:
        await db().accounts.update_one({"_id": account_id}, {"$addToSet": {"castle_skins": skin_id}})
    except Exception:
        await premium.refund(account_id, int(skin["tier"]), "CASTLE_SKIN_PURCHASE_REFUND", {"skin": skin_id, "reversed_tx": tx["_id"]}, f"{tx['_id']}:refund")
        raise
    await db().audit.insert_one({"type": "store_skin", "account_id": account_id, "skin": skin_id, "price_rubies": int(skin["tier"]), "tx": tx["_id"], "at": clock.now()})
    return {**(await overview(account_id)), "bought": skin_id, "price_rubies": int(skin["tier"]), "replayed": False}


# ------------------------------------------------------------------------------------------------ validated pack grants
async def _notify_account(account_id: str, event: str, payload: dict, dedupe: str) -> None:
    async for p in db().players.find({"account_id": account_id, "status": {"$ne": "ELIMINATED"}}, {"world_id": 1}):
        await notifications.notify(p["world_id"], p["_id"], event, payload, dedupe_key=f"{dedupe}:{p['_id']}", deep_link="store")


async def grant_purchase(account_id: str, product_id: str, transaction_id: str, source: str, environment: str, event_id: str | None = None, raw: dict | None = None) -> dict:
    """Server-side grant of a store-validated purchase. Idempotent on transaction_id (RevenueCat retries webhooks)."""
    pack = PACK_BY_ID.get(product_id)
    if not pack:
        raise ApiError("UNKNOWN_PRODUCT", "Product not in the server catalog", 400, {"product_id": product_id})
    acc = await account(account_id)
    doc = {"_id": f"spu_{uuid.uuid4().hex[:12]}", "account_id": account_id, "product_id": product_id, "transaction_id": transaction_id, "event_id": event_id, "source": source, "environment": environment, "status": "GRANTING", "raw": raw, "at": clock.now()}
    try:
        await db().store_purchases.insert_one(doc)
    except DuplicateKeyError:
        ex = await db().store_purchases.find_one({"transaction_id": transaction_id})
        return {"purchase_id": ex["_id"], "product_id": ex["product_id"], "rubies_granted": int(ex.get("rubies_granted", 0)), "bonus_result": ex.get("bonus_result"), "replayed": True}

    bonus = pack["bonus"]
    rubies = int(pack["rubies"])
    mult = 1
    bonus_result: dict | None = None
    if bonus and bonus["type"] == "FIRST_PURCHASE_MULTIPLIER":
        first = await db().accounts.find_one_and_update({"_id": account_id, "store_first_purchases": {"$ne": product_id}}, {"$addToSet": {"store_first_purchases": product_id}})
        if first is not None:
            mult = int(bonus["mult"])
            rubies *= mult
        bonus_result = {"type": bonus["type"], "applied": first is not None, "mult": mult}
    await premium.grant(account_id, rubies, "STORE_PACK", {"product_id": product_id, "price_eur": pack["price_eur"], "base_rubies": pack["rubies"], "multiplier": mult, "transaction_id": transaction_id, "source": source}, key=f"store:{transaction_id}")

    if bonus and bonus["type"] == "CASTLE_SKIN":
        owned = owned_skins(acc)
        pick = next((s["id"] for s in PREMIUM_SKINS if s["tier"] == bonus["tier"] and s["id"] not in owned), None)
        if pick:
            await db().accounts.update_one({"_id": account_id}, {"$addToSet": {"castle_skins": pick}})
            bonus_result = {"type": "CASTLE_SKIN", "skin": pick}
        else:  # every skin of the tier already owned → the tier value in Rubies instead
            await premium.grant(account_id, int(bonus["tier"]), "STORE_PACK", {"product_id": product_id, "bonus": "CASTLE_SKIN_FALLBACK", "transaction_id": transaction_id}, key=f"store:{transaction_id}:skin")
            bonus_result = {"type": "CASTLE_SKIN", "skin": None, "rubies_instead": int(bonus["tier"])}
    elif bonus and bonus["type"] == "UNITS":
        reward = {"reward_id": f"srw_{uuid.uuid4().hex[:10]}", "product_id": product_id, "units": dict(bonus["units"]), "transaction_id": transaction_id, "at": clock.now()}
        await db().accounts.update_one({"_id": account_id}, {"$push": {"pending_rewards": reward}})
        bonus_result = {"type": "UNITS", "units": dict(bonus["units"]), "reward_id": reward["reward_id"]}

    await db().store_purchases.update_one({"_id": doc["_id"]}, {"$set": {"status": "GRANTED", "rubies_granted": rubies, "bonus_result": bonus_result, "granted_at": clock.now()}})
    await db().audit.insert_one({"type": "store_purchase", "account_id": account_id, "product_id": product_id, "transaction_id": transaction_id, "source": source, "rubies": rubies, "bonus": bonus_result, "at": clock.now()})
    await _notify_account(account_id, "STORE_PURCHASE", {"product_id": product_id, "price_eur": pack["price_eur"], "rubies": rubies, "multiplier": mult, "bonus": bonus_result}, f"store:{transaction_id}")
    return {"purchase_id": doc["_id"], "product_id": product_id, "rubies_granted": rubies, "bonus_result": bonus_result, "replayed": False}


async def revenuecat_event(payload: dict) -> dict:
    """RevenueCat webhook body → grant. Returns 200-style dicts for ignored events so RevenueCat stops retrying."""
    ev = payload.get("event") or {}
    if ev.get("type") != "NON_RENEWING_PURCHASE":
        return {"ok": True, "ignored": True, "reason": "event_type"}
    if ev.get("store") not in ("PLAY_STORE", "STRIPE", "RC_BILLING"):
        return {"ok": True, "ignored": True, "reason": "wrong_store"}
    if (ev.get("environment") or "").upper() != config.STORE_ENVIRONMENT:
        return {"ok": True, "ignored": True, "reason": "wrong_environment"}
    product_id, app_user_id, transaction_id = ev.get("product_id"), ev.get("app_user_id"), ev.get("transaction_id")
    if not product_id or not app_user_id or not transaction_id:
        raise ApiError("INCOMPLETE_EVENT", "Missing product_id / app_user_id / transaction_id", 400)
    if product_id not in PACK_BY_ID:
        await db().store_unmatched.update_one({"event_id": ev.get("id") or transaction_id}, {"$setOnInsert": {"payload": payload, "reason": "unknown_product", "at": clock.now()}}, upsert=True)
        return {"ok": True, "ignored": True, "reason": "unknown_product"}
    acc = await db().accounts.find_one({"_id": app_user_id}, {"_id": 1})
    if not acc:
        await db().store_unmatched.update_one({"event_id": ev.get("id") or transaction_id}, {"$setOnInsert": {"payload": payload, "reason": "unmatched_account", "at": clock.now()}}, upsert=True)
        return {"ok": True, "unmatched": True}
    res = await grant_purchase(app_user_id, product_id, transaction_id, ev.get("store", "PLAY_STORE"), config.STORE_ENVIRONMENT, event_id=ev.get("id"), raw=ev)
    return {"ok": True, **res}


# ------------------------------------------------------------------------------------------------ world-bound rewards
async def claim_rewards(world: dict, player: dict, account_id: str) -> dict:
    """Deliver every pending unit reward to the Mother (or any owned castle) of THIS world. Each reward is pulled
    atomically before crediting, so a double tap or a retry can never deliver it twice."""
    acc = await account(account_id)
    pending = list(acc.get("pending_rewards") or [])
    if not pending:
        raise ApiError("NOTHING_TO_CLAIM", "No pending rewards", 409)
    target = await db().settlements.find_one({"_id": player.get("mother_settlement_id"), "owner_player_id": player["_id"]}) or await db().settlements.find_one({"world_id": world["_id"], "owner_player_id": player["_id"]})
    if not target:
        raise ApiError("NO_SETTLEMENT", "No castle in this world to receive the reward", 409)
    delivered: list[dict] = []
    for r in pending:
        claimed = await db().accounts.find_one_and_update({"_id": account_id, "pending_rewards.reward_id": r["reward_id"]}, {"$pull": {"pending_rewards": {"reward_id": r["reward_id"]}}})
        if claimed is None:
            continue
        await db().settlements.update_one({"_id": target["_id"]}, {"$inc": {f"army.{u}": int(n) for u, n in r["units"].items()}})
        await db().audit.insert_one({"world_id": world["_id"], "type": "store_reward_delivered", "account_id": account_id, "player_id": player["_id"], "settlement_id": target["_id"], "reward": r, "at": clock.now()})
        delivered.append({**reward_dto(r), "settlement_id": target["_id"], "settlement_name": target.get("name")})
    if delivered:
        units: dict[str, int] = {}
        for d in delivered:
            for u, n in d["units"].items():
                units[u] = units.get(u, 0) + int(n)
        await notifications.notify(world["_id"], player["_id"], "STORE_REWARD_DELIVERED", {"units": units, "settlement_id": target["_id"], "settlement_name": target.get("name"), "rewards": len(delivered)}, dedupe_key=f"store_claim:{':'.join(d['reward_id'] for d in delivered)}", deep_link="settlement")
    return {**(await overview(account_id)), "delivered": delivered, "settlement_id": target["_id"], "settlement_name": target.get("name")}
