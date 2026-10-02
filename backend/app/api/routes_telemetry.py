from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel, Field

from app.core import auth, config, ratelimit
from app.core.errors import ApiError
from app.domain import telemetry

router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])


class CrashIn(BaseModel):
    # Caps on every field: this endpoint is open, so the body is the attack surface. The server re-truncates anyway.
    kind: str = Field(max_length=24)
    message: str = Field(min_length=1, max_length=500)
    stack: str | None = Field(default=None, max_length=4000)
    route: str | None = Field(default=None, max_length=200)
    app_version: str | None = Field(default=None, max_length=32)
    platform: str | None = Field(default=None, max_length=16)
    os_version: str | None = Field(default=None, max_length=32)
    fatal: bool = False


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/crash", status_code=202)
async def crash(body: CrashIn, request: Request, authorization: str | None = Header(default=None)):
    """Report a crash. No account required — the app can die on the login screen, and that crash matters too.

    The account id is attached when the request happens to carry a working token, and a bad one is ignored rather
    than refused: a crash report is not the place to argue about authentication.
    """
    if not config.CRASH_REPORTS_ENABLED:
        raise ApiError("TELEMETRY_DISABLED", "Crash reporting is disabled", 404)
    await ratelimit.hit("crash", _client_ip(request), config.RATE_LIMIT_CRASHES_PER_HOUR, 3600)
    account_id = None
    if authorization and authorization.lower().startswith("bearer "):
        try:
            account_id = await auth.resolve_bearer(authorization.split(" ", 1)[1].strip())
        except Exception:
            account_id = None
    return await telemetry.record(body.model_dump(), account_id)


@router.get("/crashes", dependencies=[Depends(auth.require_admin)])
async def crashes(limit: int = 50):
    """What is actually breaking, grouped. Admin key only — the messages are ours, not the players'."""
    return await telemetry.groups(limit)
