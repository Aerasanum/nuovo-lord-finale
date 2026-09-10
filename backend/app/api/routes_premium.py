"""Premium API (Bible §23): Ruby wallet, instant completion quotes/finish, cosmetics (House rename), specialization."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.routes_game import Ctx, ctx
from app.core.auth import CurrentAccount
from app.core.db import db
from app.core.errors import ApiError
from app.domain import premium

router = APIRouter(prefix="/api", tags=["premium"])


class KeyIn(BaseModel):
    idempotency_key: str | None = None


class RenameIn(KeyIn):
    house_name: str = Field(min_length=3, max_length=40)


class SpecIn(KeyIn):
    choice: str


async def _job(world_id: str, job_id: str) -> dict:
    job = await db().jobs.find_one({"_id": job_id, "world_id": world_id})
    if not job:
        raise ApiError("JOB_NOT_FOUND", "Job not found", 404)
    return job


@router.get("/wallet")
async def wallet(account_id: str = CurrentAccount):
    return await premium.wallet(account_id)


@router.get("/worlds/{world_id}/jobs/{job_id}/finish")
async def finish_quote(world_id: str, job_id: str, c: Ctx = Depends(ctx)):
    return await premium.quote_finish(await _job(world_id, job_id), c.player, c.account_id)


@router.post("/worlds/{world_id}/jobs/{job_id}/finish")
async def finish(world_id: str, job_id: str, body: KeyIn, c: Ctx = Depends(ctx)):
    return await premium.finish_job(await _job(world_id, job_id), c.player, c.account_id, body.idempotency_key)


@router.post("/worlds/{world_id}/house/rename")
async def rename_house(world_id: str, body: RenameIn, c: Ctx = Depends(ctx)):
    return await premium.rename_house(c.player, c.account_id, body.house_name, body.idempotency_key)


@router.get("/worlds/{world_id}/specialization")
async def specialization(world_id: str, c: Ctx = Depends(ctx)):
    return await premium.specialization_state(c.player, c.account_id)


@router.post("/worlds/{world_id}/specialization")
async def set_specialization(world_id: str, body: SpecIn, c: Ctx = Depends(ctx)):
    return await premium.set_specialization(c.player, c.account_id, body.choice, body.idempotency_key)
