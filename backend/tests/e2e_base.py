"""Single source of truth for the live-server e2e suite's target and admin credentials.

The suite jumps the QA clock by weeks and creates hundreds of throwaway players, so it must ONLY ever talk to the QA
backend (scripts/qa_backend.sh → :8002, DB eld_qa). `E2E_BASE_URL` is exported by scripts/e2e.sh; the preview /
production hosts are refused outright.

The admin key is read from the environment — never committed. `scripts/e2e.sh` loads it from backend/.env; in CI it
comes from the job environment. Without it the QA router answers 403 and the suite is skipped rather than failing in
dozens of confusing ways.
"""
from __future__ import annotations

import os

from dotenv import load_dotenv

from tests.paths import BACKEND_ENV

load_dotenv(BACKEND_ENV)

BASE_URL = (os.environ.get("E2E_BASE_URL") or "http://localhost:8002").rstrip("/")
if "emergentagent.com" in BASE_URL or "emergent.host" in BASE_URL:
    raise RuntimeError("e2e suite must target the QA backend (scripts/e2e.sh), never the live realm")
API = f"{BASE_URL}/api"

ADMIN_KEY = os.environ.get("ADMIN_API_KEY", "")
ADMIN_HEADERS = {"X-Admin-Key": ADMIN_KEY, "Content-Type": "application/json"}


# Seeded QA fixtures (scripts/*_account.py). Same environment overrides as the seeders, same defaults.
DEMO_EMAIL = os.environ.get("DEMO_EMAIL", "demo@empirelords.com")
DEMO_PASSWORD = os.environ.get("DEMO_PASSWORD", "Demo12345!")
OBSERVER_EMAIL = os.environ.get("OBSERVER_EMAIL", "osservatore@empirelords.com")
OBSERVER_PASSWORD = os.environ.get("OBSERVER_PASSWORD", "Demo12345!")
LORD_EMAIL = os.environ.get("LORD_EMAIL", "lord@empirelords.com")
LORD_PASSWORD = os.environ.get("LORD_PASSWORD", "Lord12345!")
MAX_EMAIL = os.environ.get("MAX_EMAIL", "max@empirelords.com")
MAX_PASSWORD = os.environ.get("MAX_PASSWORD", "Max12345!")


def purge_players(player_ids) -> None:
    """Hand throwaway Players' spawn slots back (QA only). Use it in teardown: a realm has a fixed number of seats,
    and a suite that never gives them back eventually fails with WORLD_FULL on state no test created."""
    import requests

    ids = [p for p in (player_ids if isinstance(player_ids, (list, tuple, set)) else [player_ids]) if p]
    if not ids or not ADMIN_KEY:
        return
    try:
        requests.post(f"{API}/qa/players/purge", json={"player_ids": list(ids)}, headers=ADMIN_HEADERS, timeout=30)
    except requests.RequestException:
        pass  # teardown must never turn a passing test red


_THROWAWAY_PLAYERS: list[str] = []


def track_player(player_id: str | None) -> str | None:
    """Register a Player created by a test so its spawn slot goes back to the realm when the session ends."""
    if player_id:
        _THROWAWAY_PLAYERS.append(player_id)
    return player_id


def purge_tracked_players() -> None:
    purge_players(_THROWAWAY_PLAYERS)
    _THROWAWAY_PLAYERS.clear()


def require_admin_key() -> None:
    """Skip the module when no admin key is configured, instead of drowning the report in 403s."""
    if not ADMIN_KEY:
        import pytest

        pytest.skip("ADMIN_API_KEY is not set: the QA endpoints this module drives are unreachable", allow_module_level=True)
