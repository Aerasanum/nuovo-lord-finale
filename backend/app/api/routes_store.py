"""Negozio API: catalog (Ruby packs + premium castle skins), skin purchase with Rubies, world-bound reward claim and the
RevenueCat webhook that is the ONLY production path crediting a Ruby pack (store.py)."""
from __future__ import annotations

import hmac

from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel

from app.api.routes_game import Ctx, ctx
from app.core import config
from app.core.auth import CurrentAccount
from app.core.errors import ApiError
from app.domain import store

router = APIRouter(prefix="/api", tags=["store"])


class BuySkinIn(BaseModel):
    idempotency_key: str | None = None
    world_id: str | None = None


@router.get("/store")
async def store_overview(account_id: str = CurrentAccount):
    return await store.overview(account_id)


@router.post("/store/skins/{skin_id}/buy")
async def store_buy_skin(skin_id: str, body: BuySkinIn, account_id: str = CurrentAccount):
    return await store.buy_skin(account_id, skin_id, body.idempotency_key, body.world_id)


@router.post("/worlds/{world_id}/store/claim")
async def store_claim(world_id: str, c: Ctx = Depends(ctx)):
    return await store.claim_rewards(c.world, c.player, c.account_id)


@router.post("/webhooks/revenuecat")
async def revenuecat_webhook(request: Request, authorization: str | None = Header(default=None)):
    """RevenueCat → server. Bearer secret shared with the RevenueCat dashboard; idempotent per transaction_id."""
    if not config.RC_WEBHOOK_AUTH:
        raise ApiError("WEBHOOK_NOT_CONFIGURED", "RC_WEBHOOK_AUTH is not set", 503)
    if not authorization or not hmac.compare_digest(authorization, f"Bearer {config.RC_WEBHOOK_AUTH}"):
        raise ApiError("UNAUTHORIZED", "Invalid webhook authorization", 401)
    payload = await request.json()
    if not isinstance(payload, dict):
        raise ApiError("INVALID_PAYLOAD", "Expected a JSON object", 400)
    return await store.revenuecat_event(payload)
