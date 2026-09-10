"""Authentication: JWT (email+password, bcrypt) + Emergent Google session tokens.

Both credential types are accepted as `Authorization: Bearer <token>`:
  * our JWT access token (type=access) -> account_id in `sub`
  * Emergent session_token (7d, stored in user_sessions) -> account_id
"""
from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import httpx
import jwt
from fastapi import Depends, Header
from jwt.exceptions import InvalidTokenError
from pymongo.errors import DuplicateKeyError

from app.core import clock, config
from app.core.db import db
from app.core.errors import ApiError, unauthorized


def hash_password(password: str) -> str:
    raw = password.encode("utf-8")
    if len(raw) > 72:
        raise ApiError("PASSWORD_TOO_LONG", "Password too long (max 72 bytes)", 400)
    return bcrypt.hashpw(raw, bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, UnicodeEncodeError):
        return False


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def make_access_token(account_id: str) -> str:
    now = datetime.now(timezone.utc)  # token validity uses wall-clock time, never the simulated game clock
    claims = {
        "sub": account_id,
        "type": "access",
        "jti": secrets.token_hex(16),
        "iat": now,
        "exp": now + timedelta(minutes=config.ACCESS_TOKEN_MINUTES),
    }
    return jwt.encode(claims, config.JWT_SECRET, algorithm=config.JWT_ALGORITHM)


async def create_token_pair(account_id: str) -> dict:
    refresh = secrets.token_urlsafe(48)
    now = clock.now()
    await db().refresh_sessions.insert_one(
        {
            "account_id": account_id,
            "token_hash": _token_hash(refresh),
            "created_at": now,
            "expires_at": now + timedelta(days=config.REFRESH_TOKEN_DAYS),
        }
    )
    return {
        "access_token": make_access_token(account_id),
        "refresh_token": refresh,
        "token_type": "bearer",
        "expires_in": config.ACCESS_TOKEN_MINUTES * 60,
    }


async def register(email: str, password: str, display_name: str | None) -> dict:
    email = email.lower().strip()
    if len(password) < 8:
        raise ApiError("PASSWORD_TOO_SHORT", "Password must be at least 8 characters", 400)
    account_id = f"acc_{uuid.uuid4().hex[:12]}"
    try:
        await db().accounts.insert_one(
            {
                "_id": account_id,
                "email": email,
                "password_hash": hash_password(password),
                "display_name": display_name or email.split("@")[0],
                "provider": "password",
                "created_at": clock.now(),
            }
        )
    except DuplicateKeyError:
        raise ApiError("EMAIL_ALREADY_REGISTERED", "Email is already registered", 409)
    tokens = await create_token_pair(account_id)
    return {**tokens, "account": await public_account(account_id)}


async def login(email: str, password: str) -> dict:
    acc = await db().accounts.find_one({"email": email.lower().strip()})
    if not acc or not acc.get("password_hash") or not verify_password(password, acc["password_hash"]):
        raise ApiError("INVALID_CREDENTIALS", "Invalid email or password", 401)
    tokens = await create_token_pair(acc["_id"])
    return {**tokens, "account": await public_account(acc["_id"])}


async def refresh(refresh_token: str) -> dict:
    session = await db().refresh_sessions.find_one_and_delete(
        {"token_hash": _token_hash(refresh_token), "expires_at": {"$gt": clock.now()}}
    )
    if not session:
        raise ApiError("INVALID_REFRESH_TOKEN", "Invalid or expired refresh token", 401)
    tokens = await create_token_pair(session["account_id"])
    return {**tokens, "account": await public_account(session["account_id"])}


async def logout(refresh_token: str | None, bearer: str | None) -> None:
    if refresh_token:
        await db().refresh_sessions.delete_one({"token_hash": _token_hash(refresh_token)})
    if bearer:
        await db().user_sessions.delete_one({"session_token": bearer})


async def exchange_emergent_session(session_id: str) -> dict:
    """Exchange a one-time Emergent session_id for our account + session_token (7 days)."""
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(config.EMERGENT_SESSION_URL, headers={"X-Session-ID": session_id})
    if r.status_code != 200:
        raise ApiError("INVALID_SESSION_ID", "Invalid or expired session", 401)
    data = r.json()
    email = (data.get("email") or "").lower().strip()
    if not email:
        raise ApiError("INVALID_SESSION_ID", "Session has no email", 401)
    acc = await db().accounts.find_one({"email": email})
    now = clock.now()
    if acc is None:
        account_id = f"acc_{uuid.uuid4().hex[:12]}"
        try:
            await db().accounts.insert_one(
                {
                    "_id": account_id,
                    "email": email,
                    "display_name": data.get("name") or email.split("@")[0],
                    "picture": data.get("picture"),
                    "provider": "google",
                    "created_at": now,
                }
            )
        except DuplicateKeyError:
            acc = await db().accounts.find_one({"email": email})
            account_id = acc["_id"]
    else:
        account_id = acc["_id"]
        await db().accounts.update_one(
            {"_id": account_id}, {"$set": {"picture": data.get("picture") or acc.get("picture")}}
        )
    session_token = data.get("session_token") or secrets.token_urlsafe(48)
    await db().user_sessions.insert_one(
        {
            "session_token": session_token,
            "account_id": account_id,
            "created_at": now,
            "expires_at": now + timedelta(days=7),
        }
    )
    return {"session_token": session_token, "account": await public_account(account_id)}


async def public_account(account_id: str) -> dict:
    acc = await db().accounts.find_one({"_id": account_id})
    if not acc:
        raise unauthorized()
    return {
        "account_id": acc["_id"],
        "email": acc["email"],
        "display_name": acc.get("display_name"),
        "picture": acc.get("picture"),
        "provider": acc.get("provider", "password"),
    }


async def resolve_bearer(token: str) -> str:
    """Return account_id for a bearer token (JWT access or Emergent session token)."""
    # 1) our JWT
    try:
        payload = jwt.decode(
            token,
            config.JWT_SECRET,
            algorithms=[config.JWT_ALGORITHM],
            options={"require": ["sub", "exp", "iat", "type"]},
        )
        if payload.get("type") == "access":
            acc = await db().accounts.find_one({"_id": payload["sub"]}, {"_id": 1})
            if acc:
                return acc["_id"]
        raise unauthorized()
    except InvalidTokenError:
        pass
    # 2) emergent session
    sess = await db().user_sessions.find_one({"session_token": token})
    if sess:
        exp = clock.aware(sess.get("expires_at"))
        if exp and exp > clock.now():
            return sess["account_id"]
    raise unauthorized("Invalid or expired token")


async def current_account_id(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise unauthorized("Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    return await resolve_bearer(token)


def require_admin(x_admin_key: str | None = Header(default=None)) -> None:
    if not config.ADMIN_API_KEY or x_admin_key != config.ADMIN_API_KEY:
        raise ApiError("FORBIDDEN", "Admin key required", 403)


CurrentAccount = Depends(current_account_id)
