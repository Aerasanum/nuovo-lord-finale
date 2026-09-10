"""Alliance API (Bible §19 / §40): membership, roles, invites, diplomacy (PNA / war vote / peace), chat, Emerald treasury,
mercenary contract market. All routes are world-scoped and require the caller to be a Player of the world."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.api.routes_game import Ctx, ctx
from app.core import clock
from app.core.errors import ApiError
from app.domain import alliances

router = APIRouter(prefix="/api", tags=["alliances"])


class CreateIn(BaseModel):
    name: str = Field(min_length=3, max_length=24)
    tag: str = Field(min_length=2, max_length=5)
    kind: str = Field(pattern="^(STRUCTURED|MERCENARY)$")
    description: str | None = Field(default=None, max_length=200)


class InviteIn(BaseModel):
    house_name: str = Field(min_length=1, max_length=40)
    role: str = "MEMBER"


class RoleIn(BaseModel):
    role: str


class SettingsIn(BaseModel):
    description: str | None = Field(default=None, max_length=200)


class ChatIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)


class VoteIn(BaseModel):
    yes: bool


class OfferIn(BaseModel):
    target_alliance_id: str
    emeralds: int = Field(ge=1)
    duration_hours: int


class RespondIn(BaseModel):
    accept: bool


# ------------------------------------------------------------------------------------------- directory / mine
@router.get("/worlds/{world_id}/alliances")
async def list_alliances(world_id: str, c: Ctx = Depends(ctx)):
    return {"alliances": await alliances.list_public(world_id), "caps": alliances._policy()["caps"], "server_time": clock.iso(clock.now())}


@router.post("/worlds/{world_id}/alliances", status_code=201)
async def create_alliance(world_id: str, body: CreateIn, c: Ctx = Depends(ctx)):
    a = await alliances.create(c.world, c.player, body.name, body.tag, body.kind, body.description)
    fresh = await alliances.get(world_id, a["_id"])
    return await alliances.full_dto(world_id, fresh, {**c.player, "alliance_id": a["_id"]})


@router.get("/worlds/{world_id}/alliances/{alliance_id}")
async def alliance_public(world_id: str, alliance_id: str, c: Ctx = Depends(ctx)):
    a = await alliances.get(world_id, alliance_id)
    d = alliances.public_dto(a)
    mine = await alliances.mine(c.player)
    d["relation"] = (await alliances.relation_dto(world_id, mine, await alliances.relation(world_id, mine["_id"], a["_id"])))["state"] if mine and mine["_id"] != a["_id"] else None
    d["members"] = [{"house_name": m["house_name"], "role": m["role"]} for m in a["members"]]
    return d


@router.get("/worlds/{world_id}/alliance")
async def my_alliance(world_id: str, c: Ctx = Depends(ctx)):
    a = await alliances.mine(c.player)
    invites = await alliances.my_invites(c.player)
    cd = clock.aware(c.player.get("alliance_join_cooldown_until"))
    base = {"invites": invites, "join_cooldown_until": clock.iso(cd) if cd and cd > clock.now() else None, "server_time": clock.iso(clock.now())}
    if not a:
        return {"alliance": None, **base}
    return {"alliance": await alliances.full_dto(world_id, a, c.player), **base}


@router.post("/worlds/{world_id}/alliance/invites")
async def invite(world_id: str, body: InviteIn, c: Ctx = Depends(ctx)):
    a = await alliances.require_mine(c.player)
    return await alliances.invite(c.world, a, c.player, body.house_name, body.role)


@router.post("/worlds/{world_id}/alliance/invites/{invite_id}/respond")
async def respond_invite(world_id: str, invite_id: str, body: RespondIn, c: Ctx = Depends(ctx)):
    return await alliances.respond_invite(c.world, c.player, invite_id, body.accept)


@router.post("/worlds/{world_id}/alliance/leave")
async def leave(world_id: str, c: Ctx = Depends(ctx)):
    a = await alliances.require_mine(c.player)
    return await alliances.request_leave(c.world, a, c.player)


@router.post("/worlds/{world_id}/alliance/leave/cancel")
async def cancel_leave(world_id: str, c: Ctx = Depends(ctx)):
    a = await alliances.require_mine(c.player)
    return await alliances.cancel_leave(a, c.player)


@router.post("/worlds/{world_id}/alliance/members/{player_id}/role")
async def set_role(world_id: str, player_id: str, body: RoleIn, c: Ctx = Depends(ctx)):
    a = await alliances.require_mine(c.player)
    return await alliances.set_role(a, c.player, player_id, body.role)


@router.delete("/worlds/{world_id}/alliance/members/{player_id}")
async def kick(world_id: str, player_id: str, c: Ctx = Depends(ctx)):
    a = await alliances.require_mine(c.player)
    return await alliances.kick(a, c.player, player_id)


@router.put("/worlds/{world_id}/alliance/settings")
async def settings(world_id: str, body: SettingsIn, c: Ctx = Depends(ctx)):
    a = await alliances.require_mine(c.player)
    return await alliances.update_settings(a, c.player, body.description)


@router.post("/worlds/{world_id}/alliance/dissolve")
async def dissolve(world_id: str, c: Ctx = Depends(ctx)):
    a = await alliances.require_mine(c.player)
    return await alliances.dissolve(a, c.player)


# ------------------------------------------------------------------------------------------- diplomacy
@router.post("/worlds/{world_id}/alliance/diplomacy/{other_id}/{action}")
async def diplomacy(world_id: str, other_id: str, action: str, c: Ctx = Depends(ctx)):
    """action ∈ pna_propose | pna_accept | pna_decline | pna_terminate | war_propose | peace_propose | peace_accept"""
    a = await alliances.require_mine(c.player)
    fn = {
        "pna_propose": alliances.propose_pna,
        "pna_accept": alliances.accept_pna,
        "pna_decline": alliances.decline_pna,
        "pna_terminate": alliances.terminate_pna,
        "war_propose": alliances.propose_war,
        "peace_propose": alliances.propose_peace,
        "peace_accept": alliances.accept_peace,
    }.get(action)
    if fn is None:
        raise ApiError("INVALID_ACTION", "Unknown diplomacy action", 400)
    res = await fn(c.world, a, c.player, other_id)
    if action == "war_propose":
        return res
    return await alliances.relation_dto(world_id, a, res)


@router.post("/worlds/{world_id}/alliance/votes/{vote_id}")
async def vote(world_id: str, vote_id: str, body: VoteIn, c: Ctx = Depends(ctx)):
    a = await alliances.require_mine(c.player)
    return await alliances.vote_war(c.world, a, c.player, vote_id, body.yes)


# ------------------------------------------------------------------------------------------- chat / treasury
@router.get("/worlds/{world_id}/alliance/chat")
async def chat(world_id: str, after: str | None = Query(default=None), limit: int = Query(default=50, le=200), c: Ctx = Depends(ctx)):
    a = await alliances.require_mine(c.player)
    return {"messages": await alliances.chat(a, after, limit), "server_time": clock.iso(clock.now())}


@router.post("/worlds/{world_id}/alliance/chat", status_code=201)
async def post_chat(world_id: str, body: ChatIn, c: Ctx = Depends(ctx)):
    a = await alliances.require_mine(c.player)
    return await alliances.post_chat(a, c.player, body.text)


@router.get("/worlds/{world_id}/alliance/treasury")
async def treasury(world_id: str, c: Ctx = Depends(ctx)):
    a = await alliances.require_mine(c.player)
    return await alliances.ledger(a, c.player)


# ------------------------------------------------------------------------------------------- mercenary market
@router.get("/worlds/{world_id}/alliance/mercenary")
async def mercenary_market(world_id: str, c: Ctx = Depends(ctx)):
    a = await alliances.require_mine(c.player)
    return await alliances.market(world_id, a)


@router.post("/worlds/{world_id}/alliance/mercenary/offers", status_code=201)
async def offer(world_id: str, body: OfferIn, c: Ctx = Depends(ctx)):
    a = await alliances.require_mine(c.player)
    return await alliances.offer_contract(c.world, a, c.player, body.target_alliance_id, body.emeralds, body.duration_hours)


@router.post("/worlds/{world_id}/alliance/mercenary/offers/{contract_id}/accept")
async def accept_offer(world_id: str, contract_id: str, c: Ctx = Depends(ctx)):
    a = await alliances.require_mine(c.player)
    return await alliances.accept_contract(c.world, a, c.player, contract_id)


@router.post("/worlds/{world_id}/alliance/mercenary/offers/{contract_id}/withdraw")
async def withdraw_offer(world_id: str, contract_id: str, c: Ctx = Depends(ctx)):
    a = await alliances.require_mine(c.player)
    return await alliances.withdraw_offer(a, c.player, contract_id)
