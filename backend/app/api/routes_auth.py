from fastapi import APIRouter, Header, Request
from pydantic import BaseModel, EmailStr, Field

from app.core import auth
from app.core.auth import CurrentAccount

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    display_name: str | None = Field(default=None, max_length=40)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class SessionIn(BaseModel):
    session_id: str


class LogoutIn(BaseModel):
    refresh_token: str | None = None


def _client_ip(request: Request) -> str:
    """Caller address for rate limiting. Behind a proxy the first X-Forwarded-For hop is the real client."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/register")
async def register(body: RegisterIn, request: Request):
    return await auth.register(body.email, body.password, body.display_name, client_ip=_client_ip(request))


@router.post("/login")
async def login(body: LoginIn):
    return await auth.login(body.email, body.password)


@router.post("/refresh")
async def refresh(body: RefreshIn):
    return await auth.refresh(body.refresh_token)


@router.post("/session")
async def session(body: SessionIn):
    """Exchange an Emergent Google session_id for a 7-day session_token."""
    return await auth.exchange_emergent_session(body.session_id)


@router.post("/logout")
async def logout(body: LogoutIn, authorization: str | None = Header(default=None)):
    bearer = authorization.split(" ", 1)[1] if authorization and " " in authorization else None
    await auth.logout(body.refresh_token, bearer)
    return {"ok": True}


@router.get("/me")
async def me(account_id: str = CurrentAccount):
    return await auth.public_account(account_id)
