"""Environment configuration. Fails fast on missing / weak secrets (production_hardening)."""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")


def _req(name: str) -> str:
    v = os.environ.get(name)
    if v is None or v == "":
        raise RuntimeError(f"Missing required environment variable: {name}")
    return v


MONGO_URL = _req("MONGO_URL")
DB_NAME = _req("DB_NAME")
JWT_SECRET = _req("JWT_SECRET")
if len(JWT_SECRET.encode("utf-8")) < 32:
    raise RuntimeError("JWT_SECRET must be at least 32 bytes")
if JWT_SECRET.lower() in {"secret", "changeme", "default", "placeholder"}:
    raise RuntimeError("Default JWT secret is forbidden")
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_MINUTES = int(os.environ.get("ACCESS_TOKEN_MINUTES", "120"))
REFRESH_TOKEN_DAYS = int(os.environ.get("REFRESH_TOKEN_DAYS", "30"))
SPEC_PATH = _req("SPEC_PATH")
SPEC_EXPECTED_HASH = os.environ.get("SPEC_EXPECTED_HASH")
QA_ENDPOINTS_ENABLED = os.environ.get("QA_ENDPOINTS_ENABLED", "false").lower() == "true"
ADMIN_API_KEY = os.environ.get("ADMIN_API_KEY", "")
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()]
WORLD_AUTO_CREATE = os.environ.get("WORLD_AUTO_CREATE", "true").lower() == "true"
SCHEDULER_ENABLED = os.environ.get("SCHEDULER_ENABLED", "true").lower() == "true"
EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
