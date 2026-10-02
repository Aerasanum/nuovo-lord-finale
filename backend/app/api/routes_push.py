from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.auth import CurrentAccount
from app.domain import push

router = APIRouter(prefix="/api/push", tags=["push"])


class DeviceIn(BaseModel):
    token: str = Field(max_length=200)
    platform: str = Field(max_length=16)
    # Which of the eight shipped languages the phone is reading the game in: the push text is drawn by the OS, so
    # the server has to know the language at send time.
    lang: str = Field(default="en", max_length=8)


class ForgetIn(BaseModel):
    token: str = Field(max_length=200)


@router.post("/register")
async def register(body: DeviceIn, account_id: str = CurrentAccount):
    """Claim this device for the signed-in account. Idempotent: the same token re-registers on every launch."""
    return await push.register(account_id, body.token.strip(), body.platform.lower(), body.lang.lower())


@router.post("/unregister")
async def unregister(body: ForgetIn, account_id: str = CurrentAccount):
    """Stop pushing to this device — the player turned notifications off, or is signing out."""
    return await push.unregister(account_id, body.token.strip())
