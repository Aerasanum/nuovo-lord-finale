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
    if not sets:
        raise ApiError("NOTHING_TO_GRANT", "Empty grant", 400)
    res = await db().settlements.update_one({"_id": body.settlement_id}, {"$set": sets})
    if res.matched_count == 0:
        raise ApiError("SETTLEMENT_NOT_FOUND", "Settlement not found", 404)
    return {"ok": True, "set": sets}
