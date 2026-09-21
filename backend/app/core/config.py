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
# Defaults to the spec committed next to the backend, so a plain checkout (CI, a developer clone) boots without
# knowing the deployment layout; production keeps overriding it from the environment.
SPEC_PATH = os.environ.get("SPEC_PATH") or str(ROOT_DIR.parent / "spec" / "02_CANONICAL_SPEC.json")
SPEC_EXPECTED_HASH = os.environ.get("SPEC_EXPECTED_HASH")
QA_ENDPOINTS_ENABLED = os.environ.get("QA_ENDPOINTS_ENABLED", "false").lower() == "true"
ADMIN_API_KEY = os.environ.get("ADMIN_API_KEY", "")
if ADMIN_API_KEY and len(ADMIN_API_KEY) < 16:
    raise RuntimeError("ADMIN_API_KEY must be at least 16 characters")
if QA_ENDPOINTS_ENABLED and not ADMIN_API_KEY:
    raise RuntimeError("QA_ENDPOINTS_ENABLED requires ADMIN_API_KEY (the QA router rewrites worlds and wallets)")
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()]
# Browsers reject `Access-Control-Allow-Credentials: true` together with a wildcard origin, and the client
# authenticates with a bearer token anyway: only send credentials when the origins are an explicit allowlist.
CORS_ALLOW_CREDENTIALS = "*" not in CORS_ORIGINS
WORLD_AUTO_CREATE = os.environ.get("WORLD_AUTO_CREATE", "true").lower() == "true"
SCHEDULER_ENABLED = os.environ.get("SCHEDULER_ENABLED", "true").lower() == "true"
EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

# Negozio / RevenueCat (Google Play): webhook bearer secret (configure the same value in RevenueCat → Integrations →
# Webhooks), accepted purchase environment (SANDBOX while testing, PRODUCTION at launch) and the billing switch the
# client reads to enable real purchases (flip to true once the Play products exist and the RC key is in the app).
RC_WEBHOOK_AUTH = os.environ.get("RC_WEBHOOK_AUTH", "")
STORE_ENVIRONMENT = os.environ.get("STORE_ENVIRONMENT", "SANDBOX").upper()
STORE_BILLING_LIVE = os.environ.get("STORE_BILLING_LIVE", "false").lower() == "true"

# Rate limiting (app/core/ratelimit.py). 0 disables the bucket — the QA backend turns registration off because the
# e2e suite creates hundreds of throwaway accounts from one address.
RATE_LIMIT_LOGIN_FAILURES = int(os.environ.get("RATE_LIMIT_LOGIN_FAILURES", "10"))
RATE_LIMIT_LOGIN_WINDOW_SECONDS = int(os.environ.get("RATE_LIMIT_LOGIN_WINDOW_SECONDS", "900"))
RATE_LIMIT_REGISTER_PER_HOUR = int(os.environ.get("RATE_LIMIT_REGISTER_PER_HOUR", "20"))
