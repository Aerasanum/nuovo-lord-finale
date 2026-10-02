"""Push delivery for the events whose catalog entry lists the PUSH channel (spec.notification_event_catalog).

The inbox stays the source of truth (spec.notification_policy.realtime_push_source_of_truth = false): a push is a
knock on the door, never the message itself. Everything here therefore fails quietly — a player must not lose a
march because Expo's push service was slow — and `notifications.notify` hands delivery to a background task so no
request ever waits on an outbound HTTP call.

Delivery goes through Expo's push service, which fans out to FCM and APNs from one token per device. That is the
only route available to an Expo app that is not shipping its own FCM credentials, and it is the one the client's
`getExpoPushTokenAsync` produces.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone

import httpx

from app.core import clock, config
from app.core.db import db
from app.core.errors import ApiError
from app.core.spec import get_spec
from app.domain import push_text

log = logging.getLogger("push")

# What Expo hands the client. Anything else is junk an authenticated client should not be able to store.
TOKEN_RE = re.compile(r"^Expo(nent)?PushToken\[[A-Za-z0-9_\-]{1,100}\]$")
PLATFORMS = {"ios", "android"}
# Expo accepts at most 100 messages per request.
BATCH = 100

# Events the game emits that the spec's catalog does not name, pushed for the same reason their spec counterparts
# are: they are the ones you need to hear about while the app is closed.
#   OWNERSHIP_CHANGED       the emitted name of the catalog's SETTLEMENT_CONQUERED (pushed only when you lose one)
#   HOSTILE_MARCH_DETECTED  the land analogue of NAVAL_FLEET_DETECTED, which is PUSH and DISABLED in v3.7
#   PYRAMID_ATTACK_INCOMING the Pyramid alert the holding Alliance is owed (Bible §21)
#   INACTIVITY_WARNING      the one day of notice before the realm takes the House away
LOCAL_PUSH_EVENTS = {"OWNERSHIP_CHANGED", "HOSTILE_MARCH_DETECTED", "PYRAMID_ATTACK_INCOMING", "INACTIVITY_WARNING"}


def _spec_push_events() -> set[str]:
    return {e["event"] for e in get_spec().notification_event_catalog if "PUSH" in e.get("channels", [])}


def push_events() -> set[str]:
    return _spec_push_events() | LOCAL_PUSH_EVENTS


def eligible(doc: dict) -> bool:
    """Synchronous, DB-free: `notify` asks before spawning anything, so a non-push event costs nothing."""
    if not config.PUSH_ENABLED:
        return False
    event = doc.get("event", "")
    if event not in push_events():
        return False
    # Taking a settlement is something you did on purpose, with the app open; losing one is what has to reach you.
    if event == "OWNERSHIP_CHANGED" and not (doc.get("payload") or {}).get("lost"):
        return False
    return True


async def register(account_id: str, token: str, platform: str, lang: str) -> dict:
    if not TOKEN_RE.match(token):
        raise ApiError("INVALID_PUSH_TOKEN", "Not an Expo push token", 400)
    if platform not in PLATFORMS:
        raise ApiError("INVALID_PLATFORM", "Unknown device platform", 400)
    now = clock.now()
    # The token is the _id: a device that reinstalls gets a new one, and one that moves to another account must stop
    # receiving the previous account's alerts, so the row is replaced rather than duplicated.
    await db().device_tokens.update_one(
        {"_id": token},
        {
            "$set": {"account_id": account_id, "platform": platform, "lang": lang if lang in push_text.LANGS else push_text.FALLBACK_LANG, "last_seen_at": now},
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )
    await _trim(account_id)
    return {"registered": True}


async def unregister(account_id: str, token: str) -> dict:
    deleted = (await db().device_tokens.delete_one({"_id": token, "account_id": account_id})).deleted_count
    return {"unregistered": bool(deleted)}


async def forget_account(account_id: str) -> int:
    """Called when the account is erased: a token left behind would keep ringing a phone with no account."""
    return (await db().device_tokens.delete_many({"account_id": account_id})).deleted_count


async def _trim(account_id: str) -> None:
    """Keep the newest devices only, so a client that invents tokens cannot grow the collection without end."""
    limit = config.PUSH_MAX_DEVICES_PER_ACCOUNT
    if limit <= 0:
        return
    stale = (
        await db()
        .device_tokens.find({"account_id": account_id}, {"_id": 1})
        .sort("last_seen_at", -1)
        .skip(limit)
        .to_list(length=None)
    )
    if stale:
        await db().device_tokens.delete_many({"_id": {"$in": [d["_id"] for d in stale]}})


async def deliver(doc: dict) -> None:
    """Send one inbox notification to every device of the player it belongs to. Never raises."""
    try:
        if not eligible(doc):
            return
        player = await db().players.find_one({"_id": doc["player_id"]}, {"account_id": 1, "world_id": 1})
        if not player:
            return
        account_id = str(player.get("account_id") or "")
        # An erased account keeps its House so the realm stays coherent (domain/account.py), but nobody to notify.
        if not account_id or account_id.startswith("deleted:"):
            return
        tokens = await db().device_tokens.find({"account_id": account_id}).to_list(length=BATCH)
        if not tokens:
            return
        if not await _allow(doc):
            return
        world = await db().worlds.find_one({"_id": doc.get("world_id")}, {"name": 1})
        world_name = str((world or {}).get("name") or "")
        badge = await db().inbox.count_documents({"player_id": doc["player_id"], "read_at": None})
        messages = [_message(doc, t, world_name, badge) for t in tokens]
        for i in range(0, len(messages), BATCH):
            await _send(messages[i : i + BATCH])
    except Exception as exc:  # delivery is best effort; the inbox already holds the truth
        log.warning("push delivery failed for %s: %s", doc.get("_id"), exc)


def _message(doc: dict, token: dict, world_name: str, badge: int) -> dict:
    event = doc["event"]
    payload = doc.get("payload") or {}
    lang = str(token.get("lang") or push_text.FALLBACK_LANG)
    return {
        "to": token["_id"],
        "title": push_text.title(event, payload, lang),
        "body": push_text.body(event, payload, world_name),
        # Enough for the client to open the right screen without a round trip; the detail is fetched from the inbox.
        "data": {
            "event": event,
            "deep_link": doc.get("deep_link") or "inbox",
            "world_id": doc.get("world_id"),
            "notification_id": doc.get("_id"),
        },
        "priority": "high",
        "sound": "default",
        "badge": badge,
        "channelId": "alerts",
    }


async def _allow(doc: dict) -> bool:
    """spec.notification_policy.anti_spam: duplicates of a noncritical event collapse into one push per window.

    CRITICAL events are exempt — the policy says they may not be dropped — and the window is wall-clock, like the
    rate limiter, so a QA clock jump cannot hand out a fresh one.
    """
    if doc.get("severity") == "CRITICAL":
        return True
    window = config.PUSH_AGGREGATION_WINDOW_SECONDS
    if window <= 0:
        return True
    now = datetime.now(timezone.utc)
    bucket = int(now.timestamp()) // window
    seen = await db().push_window.find_one_and_update(
        {"_id": f"{doc['player_id']}:{doc['event']}:{bucket}"},
        {"$inc": {"n": 1}, "$setOnInsert": {"expires_at": now + timedelta(seconds=window * 2)}},
        upsert=True,
        return_document=True,
    )
    return int(seen.get("n", 0)) <= 1


async def _send(messages: list[dict]) -> None:
    headers = {"accept": "application/json", "content-type": "application/json"}
    if config.EXPO_ACCESS_TOKEN:
        headers["authorization"] = f"Bearer {config.EXPO_ACCESS_TOKEN}"
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(config.EXPO_PUSH_URL, json=messages, headers=headers)
    if response.status_code != 200:
        log.warning("expo push rejected the batch: %s %s", response.status_code, response.text[:400])
        return
    receipts = (response.json() or {}).get("data") or []
    for message, receipt in zip(messages, receipts):
        if not isinstance(receipt, dict) or receipt.get("status") == "ok":
            continue
        error = (receipt.get("details") or {}).get("error")
        # The phone uninstalled the app or revoked the permission: the token is dead for good, so stop carrying it.
        if error == "DeviceNotRegistered":
            await db().device_tokens.delete_one({"_id": message["to"]})
        else:
            log.warning("expo push error %s: %s", error, receipt.get("message"))
