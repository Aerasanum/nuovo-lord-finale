"""Account erasure — Google Play requires that an account a user can create, a user can also delete.

The identity goes, the realm stays coherent:
  * the account document, every refresh session, every Google session token and every registered device are
    removed, so the email, the password hash, the provider link and the push tokens stop existing;
  * in each realm the Lord retires exactly the way that realm already retires an absent Lord (the inactivity rule it
    declares), then the player row is stripped of its house and re-keyed to a dead account, so battles, chronicles
    and alliance logs keep pointing at something instead of dangling;
  * purchase records survive. Google can refund or charge back a transaction months after the fact and the books
    have to answer for it; what is left carries the dead account id and no longer names a person.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from app.core import auth, clock
from app.core.db import db
from app.core.errors import ApiError, unauthorized
from app.domain import inactivity, push

log = logging.getLogger("account")

DISSOLVED_HOUSE = "Casa dissolta"


async def delete(account_id: str, password: str | None) -> dict:
    """Erase the account and retire its Lords. Returns what was touched, never anything about the person."""
    acc = await db().accounts.find_one({"_id": account_id})
    if acc is None:
        raise unauthorized()
    # A borrowed phone must not be able to wipe a realm. A password account re-types the password; a Google account
    # has nothing to re-type, so the double confirmation in the client is the whole gate there.
    if acc.get("password_hash"):
        if not password:
            raise ApiError("PASSWORD_REQUIRED", "Confirm with your password", 400)
        if not await asyncio.to_thread(auth.verify_password, password, acc["password_hash"]):
            raise ApiError("INVALID_CREDENTIALS", "Wrong password", 401)

    now = clock.now()
    realms = 0
    async for player in db().players.find({"account_id": account_id}):
        world = await db().worlds.find_one({"_id": player["world_id"]})
        if world is None:  # realm already deleted: nothing to retire from, the row still needs anonymising
            await _dissolve_house(player, now)
            realms += 1
            continue
        if player.get("status") != "ELIMINATED":
            rule = inactivity.rule(world)
            await inactivity.eliminate(world, player, rule["mode"] if rule else "REMOVE")
        await _dissolve_house(player, now)
        realms += 1

    revoked = (await db().refresh_sessions.delete_many({"account_id": account_id})).deleted_count
    revoked += (await db().user_sessions.delete_many({"account_id": account_id})).deleted_count
    # A device token left behind would keep ringing a phone about a realm its owner no longer has an account in.
    devices = await push.forget_account(account_id)
    purchases = await db().store_purchases.count_documents({"account_id": account_id})
    await db().accounts.delete_one({"_id": account_id})
    # Counts only: a trail that proved the erasure by storing the email would not be an erasure.
    await db().audit.insert_one(
        {"type": "account_deleted", "account_id": account_id, "realms": realms, "sessions_revoked": revoked, "devices_forgotten": devices, "purchases_retained": purchases, "at": now}
    )
    log.info("account %s erased (%d realm(s), %d session(s) revoked, %d device(s) forgotten)", account_id, realms, revoked, devices)
    return {"deleted": True, "realms": realms, "sessions_revoked": revoked, "devices_forgotten": devices, "purchases_retained": purchases}


async def _dissolve_house(player: dict, now: datetime) -> None:
    """Strip the Lord's identity but keep the row the rest of the realm points at.

    `(world_id, account_id)` and `(world_id, house_name_lc)` are both unique, so the replacements carry the player
    id: a realm can lose a hundred Lords without the second erasure colliding with the first.
    """
    pid = player["_id"]
    name = f"{DISSOLVED_HOUSE} {pid.rsplit('_', 1)[-1][:6]}"
    await db().players.update_one(
        {"_id": pid},
        {"$set": {"account_id": f"deleted:{pid}", "house_name": name, "house_name_lc": name.lower(), "house_motto": None, "account_deleted_at": now}},
    )
    # The old name is quoted all over the realm's talk. Leave the sentences, replace the speaker.
    await db().chat_messages.update_many({"player_id": pid}, {"$set": {"house_name": name}})
    await db().alliance_chat.update_many({"player_id": pid}, {"$set": {"house_name": name}})
