"""QA / simulator endpoints — env-gated (QA_ENDPOINTS_ENABLED) and admin-key protected.
They never edit production timestamps: the injectable clock offset is advanced and due events are processed."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core import clock, config
from app.core.auth import require_admin
from app.core.db import db
from app.core.errors import ApiError
from app.domain import scheduler

router = APIRouter(prefix="/api/qa", tags=["qa"], dependencies=[Depends(require_admin)])


def _gate() -> None:
    if not config.QA_ENDPOINTS_ENABLED:
        raise ApiError("QA_DISABLED", "QA endpoints are disabled", 403)


class AdvanceIn(BaseModel):
    seconds: float = Field(gt=0, le=90 * 86400)


@router.get("/clock")
async def get_clock():
    _gate()
    return {"now": clock.iso(clock.now()), "offset_seconds": clock.get_offset_seconds()}


@router.post("/clock/advance")
async def advance(body: AdvanceIn):
    _gate()
    clock.advance(body.seconds)
    await clock.persist_offset()
    processed = await scheduler.run_due_once(limit=5000)
    return {"now": clock.iso(clock.now()), "offset_seconds": clock.get_offset_seconds(), "events_processed": processed}


@router.post("/scheduler/run")
async def run_scheduler():
    _gate()
    return {"events_processed": await scheduler.run_due_once(limit=5000), "metrics": scheduler.metrics()}


class GrantIn(BaseModel):
    settlement_id: str
    resources: dict[str, int] | None = None
    army: dict[str, int] | None = None
    buildings: dict[str, int] | None = None
    research: dict[str, int] | None = None
    level: int | None = None
    end_pvp_shield: bool = False


@router.post("/grant")
async def grant(body: GrantIn):
    """Test fixture helper (QA only): set state directly so long canonical timers can be exercised."""
    _gate()
    sets: dict = {}
    for r, v in (body.resources or {}).items():
        sets[f"resources.{r}"] = int(v)
    for u, v in (body.army or {}).items():
        sets[f"army.{u}"] = int(v)
    for b, v in (body.buildings or {}).items():
        sets[f"buildings.{b}"] = int(v)
    for k, v in (body.research or {}).items():
        sets[f"research.{k.replace(chr(46), chr(95) * 2)}"] = int(v)
    if body.level is not None:
        sets["level"] = int(body.level)
        sets["buildings.Castello / Fortezza"] = int(body.level)
    if body.end_pvp_shield:
        s = await db().settlements.find_one({"_id": body.settlement_id}, {"owner_player_id": 1})
        if not s or not s.get("owner_player_id"):
            raise ApiError("SETTLEMENT_NOT_FOUND", "Settlement not found or unowned", 404)
        await db().players.update_one({"_id": s["owner_player_id"], "shield_ended_at": None}, {"$set": {"shield_ended_at": clock.now(), "shield_end_reason": "QA"}})
        sets["_shield_ended"] = True
    if not sets:
        raise ApiError("NOTHING_TO_GRANT", "Empty grant", 400)
    sets.pop("_shield_ended", None)
    if sets:
        res = await db().settlements.update_one({"_id": body.settlement_id}, {"$set": sets})
        if res.matched_count == 0:
            raise ApiError("SETTLEMENT_NOT_FOUND", "Settlement not found", 404)
    return {"ok": True, "set": sets, "pvp_shield_ended": body.end_pvp_shield}


class ConquerIn(BaseModel):
    settlement_id: str
    player_id: str


@router.post("/conquer")
async def qa_conquer(body: ConquerIn):
    """Test fixture: hand a NEUTRAL settlement to a player through the real ownership state machine (cap20, retention, territory)."""
    _gate()
    from app.domain import conquest

    target = await db().settlements.find_one({"_id": body.settlement_id})
    player = await db().players.find_one({"_id": body.player_id})
    if not target or not player:
        raise ApiError("NOT_FOUND", "Settlement or player not found", 404)
    if not await conquest.reserve_slot(player["_id"]):
        raise ApiError("CAP20_REACHED", "Player already owns 20 settlements", 409)
    res = await conquest.transfer_ownership(target, player, {}, f"qa_{clock.now().timestamp():.0f}")
    return {"ok": res.get("changed", False), **res}


class EmeraldsIn(BaseModel):
    alliance_id: str
    amount: int = Field(gt=0, le=10_000_000)


@router.post("/alliance/emeralds")
async def qa_emeralds(body: EmeraldsIn):
    """Test fixture: credit an alliance treasury through the real append-only ledger (mercenary escrow needs ≥1.000)."""
    _gate()
    from app.domain import alliances

    a = await db().alliances.find_one({"_id": body.alliance_id, "status": "ACTIVE"})
    if not a:
        raise ApiError("ALLIANCE_NOT_FOUND", "Alliance not found", 404)
    ok = await alliances.credit_emeralds(a["world_id"], a["_id"], body.amount, "qa_grant", f"qa_{clock.now().timestamp():.3f}")
    fresh = await db().alliances.find_one({"_id": a["_id"]}, {"emeralds": 1})
    return {"ok": ok, "emeralds": int(fresh.get("emeralds", 0))}


class RubiesIn(BaseModel):
    email: str
    amount: int = Field(gt=0, le=10_000_000)


@router.post("/rubies")
async def qa_rubies(body: RubiesIn):
    """Test fixture (Play Billing catalog is empty by spec): credit an account wallet through the real ledger."""
    _gate()
    from app.domain import premium

    acc = await db().accounts.find_one({"email": body.email.lower().strip()})
    if not acc:
        raise ApiError("ACCOUNT_NOT_FOUND", "Account not found", 404)
    tx = await premium.grant(acc["_id"], body.amount, "QA_GRANT", {"note": "qa"}, f"qa_{clock.now().timestamp():.3f}")
    return {"ok": True, "rubies": int(tx["balance_after"])}
