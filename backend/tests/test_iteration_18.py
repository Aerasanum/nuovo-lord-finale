"""
Iteration 18 backend tests — Daily login vault, Speed-up job, Realm chat + Mercenary directory + Negotiations.
Runs against the PUBLIC preview URL (EXPO_PUBLIC_BACKEND_URL).

Isolated from conftest fixtures (which point to an in-process ASGI + test DB) by using standalone requests-based
functions and a per-test session. Reads seeded accounts from /app/memory/test_credentials.md.
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
import requests

from tests.e2e_base import ADMIN_HEADERS, BASE_URL as BASE, DEMO_EMAIL, DEMO_PASSWORD, MAX_EMAIL, MAX_PASSWORD# QA backend only

WORLD_ID = "qa_1"

DEMO = {"email": DEMO_EMAIL, "password": DEMO_PASSWORD}
MAX = {"email": MAX_EMAIL, "password": MAX_PASSWORD}
RIVAL = {"email": "rival@empirelords.com", "password": "Rival12345!"}


def _login(creds: dict) -> dict:
    r = requests.post(f"{BASE}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login {creds['email']} failed: {r.status_code} {r.text}"
    tok = r.json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def demo_hdr():
    return _login(DEMO)


@pytest.fixture(scope="module")
def max_hdr():
    return _login(MAX)


@pytest.fixture(scope="module")
def rival_hdr():
    return _login(RIVAL)


# ==================================================================== DAILY LOGIN VAULT
class TestDaily:
    @pytest.mark.skip(reason="legacy: daily speed-up minutes removed — the Tesoro del Regno pays resources only (iteration 30+)")
    def test_max_daily_status_shape(self, max_hdr):
        r = requests.get(f"{BASE}/api/worlds/{WORLD_ID}/daily", headers=max_hdr, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        # shape
        assert isinstance(d.get("day"), int) and 1 <= d["day"] <= 7
        assert isinstance(d.get("claimable"), bool)
        assert isinstance(d.get("streak"), int)
        assert d.get("next_reset_at")
        assert isinstance(d.get("rewards"), list) and len(d["rewards"]) == 7
        assert isinstance(d.get("speedup_minutes"), int)
        # Each reward preview has day/kind
        for i, rw in enumerate(d["rewards"]):
            assert rw["day"] == i + 1
            assert rw["kind"] in ("RESOURCES", "SPEEDUP", "CHEST")

    def test_max_claim_and_second_claim_conflict(self, max_hdr):
        # Get pre-status; if already claimed, advance clock 1 realm-day to re-enable
        r0 = requests.get(f"{BASE}/api/worlds/{WORLD_ID}/daily", headers=max_hdr, timeout=30)
        d0 = r0.json()
        if not d0["claimable"]:
            adv = requests.post(f"{BASE}/api/qa/clock/advance", json={"seconds": 86400}, headers=ADMIN_HEADERS, timeout=30)
            assert adv.status_code == 200, adv.text
            r0 = requests.get(f"{BASE}/api/worlds/{WORLD_ID}/daily", headers=max_hdr, timeout=30)
            d0 = r0.json()
            assert d0["claimable"], f"still not claimable after clock advance: {d0}"

        pre_speedup = int(d0.get("speedup_minutes", 0))
        pre_day = d0["day"]

        r1 = requests.post(f"{BASE}/api/worlds/{WORLD_ID}/daily/claim", headers=max_hdr, timeout=30)
        assert r1.status_code == 200, r1.text
        body1 = r1.json()
        assert body1["granted"]["day"] == pre_day
        # Day 1 grants resources (5 keys). If day==2 it's speedup, etc — follow CYCLE
        kind = body1["granted"]["kind"]
        if kind in ("RESOURCES", "CHEST"):
            res = body1["granted"]["resources"]
            assert isinstance(res, dict) and set(res.keys()) == {"grain", "wood", "clay", "iron", "gold"}
        if kind in ("SPEEDUP", "CHEST"):
            assert body1["granted"]["speedup_minutes"] and body1["granted"]["speedup_minutes"] > 0

        # Second claim → 409 ALREADY_CLAIMED, clean ApiError
        r2 = requests.post(f"{BASE}/api/worlds/{WORLD_ID}/daily/claim", headers=max_hdr, timeout=30)
        assert r2.status_code == 409, r2.text
        err = r2.json()
        assert (err.get("code") or err.get("detail", {}).get("code")) in ("ALREADY_CLAIMED",) or "ALREADY_CLAIMED" in r2.text

        # GET after claim → claimable=false, streak advanced, next_reset in future
        r3 = requests.get(f"{BASE}/api/worlds/{WORLD_ID}/daily", headers=max_hdr, timeout=30)
        d3 = r3.json()
        assert d3["claimable"] is False
        assert d3["streak"] >= 1
        assert d3["next_reset_at"]  # ISO string

    def test_demo_daily_status(self, demo_hdr):
        r = requests.get(f"{BASE}/api/worlds/{WORLD_ID}/daily", headers=demo_hdr, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("rewards") and len(d["rewards"]) == 7


# ==================================================================== SPEED-UP
class TestSpeedup:
    @pytest.mark.skip(reason="legacy: daily speed-up minutes removed — the Tesoro del Regno pays resources only (iteration 30+)")
    def test_speedup_nonexistent_job_returns_clean_404(self, max_hdr):
        fake = f"job_{uuid.uuid4().hex[:12]}"
        r = requests.post(
            f"{BASE}/api/worlds/{WORLD_ID}/jobs/{fake}/speedup",
            json={"minutes": 10}, headers=max_hdr, timeout=30
        )
        assert r.status_code == 404, f"expected 404 got {r.status_code}: {r.text}"
        # Must be JSON, never a 500 raw stacktrace
        try:
            body = r.json()
        except Exception:
            pytest.fail(f"non-JSON error body: {r.text[:200]}")
        assert body, "empty body"
        # ApiError shape: either {code,message} or {detail:{code,...}}
        code = body.get("code") or (body.get("detail") or {}).get("code")
        assert code == "JOB_NOT_FOUND" or "JOB_NOT_FOUND" in r.text

    def test_speedup_demo_insufficient_or_notfound(self, demo_hdr):
        fake = f"job_{uuid.uuid4().hex[:12]}"
        r = requests.post(
            f"{BASE}/api/worlds/{WORLD_ID}/jobs/{fake}/speedup",
            json={"minutes": 10}, headers=demo_hdr, timeout=30
        )
        # Demo has speedup_minutes 0 → job lookup happens FIRST → 404 JOB_NOT_FOUND (per code order)
        assert r.status_code in (404, 409), r.text
        body = r.json()
        assert body  # clean JSON, never 500


# ==================================================================== REALM CHAT
class TestChat:
    def test_post_world_message_and_rate_limit(self, demo_hdr):
        text = f"test iter18 {int(time.time())}"
        r1 = requests.post(f"{BASE}/api/worlds/{WORLD_ID}/chat/world", json={"text": text}, headers=demo_hdr, timeout=30)
        assert r1.status_code in (200, 201), r1.text
        # Immediate second → 429 RATE_LIMITED
        r2 = requests.post(f"{BASE}/api/worlds/{WORLD_ID}/chat/world", json={"text": text + " b"}, headers=demo_hdr, timeout=30)
        assert r2.status_code == 429, f"expected 429 got {r2.status_code}: {r2.text}"

        # Wait to bypass rate limit for subsequent tests
        time.sleep(4)

        # History contains message
        h = requests.get(f"{BASE}/api/worlds/{WORLD_ID}/chat/world?limit=100", headers=demo_hdr, timeout=30)
        assert h.status_code == 200
        msgs = h.json().get("messages", [])
        assert any(text in (m.get("text") or "") for m in msgs), f"posted message not found in history"

    def test_chat_summary_has_world_alliance_negotiations(self, demo_hdr):
        r = requests.get(f"{BASE}/api/worlds/{WORLD_ID}/chat/summary", headers=demo_hdr, timeout=30)
        assert r.status_code == 200, r.text
        s = r.json()
        assert "world" in s
        # last field on world
        world_sec = s["world"] if isinstance(s["world"], dict) else {}
        assert "last" in world_sec or "messages" in world_sec or "unread" in world_sec
        # Demo is LEADER of [DEMO] → alliance present
        assert "alliance" in s
        # negotiations list
        assert "negotiations" in s
        assert isinstance(s["negotiations"], list)

    def test_mercenary_directory_shape(self, demo_hdr):
        r = requests.get(f"{BASE}/api/worlds/{WORLD_ID}/mercenaries", headers=demo_hdr, timeout=30)
        assert r.status_code == 200, r.text
        arr = r.json().get("mercenaries") or []
        assert isinstance(arr, list)
        # Optional but expected: [MERC] tag exists after alliance seed fixture
        tags = [m.get("tag") for m in arr]
        merc = next((m for m in arr if m.get("tag") == "MERC"), None)
        if merc is None:
            pytest.skip(f"[MERC] alliance not seeded in this env. Tags: {tags}")
        # Should have availability / max_active surface
        keys = set(merc.keys())
        assert "available" in keys or "free_slots" in keys or "max_active" in keys or "active" in keys, f"merc keys: {keys}"

    def test_negotiation_post_and_read(self, demo_hdr):
        # Find [MERC] alliance_id via directory
        r = requests.get(f"{BASE}/api/worlds/{WORLD_ID}/mercenaries", headers=demo_hdr, timeout=30)
        arr = r.json().get("mercenaries") or []
        merc = next((m for m in arr if m.get("tag") == "MERC"), None)
        if not merc:
            pytest.skip("[MERC] not present in mercenary directory")
        merc_id = merc.get("alliance_id") or merc.get("_id") or merc.get("id")
        assert merc_id, f"no alliance_id on merc: {merc}"

        # Small delay to avoid rate-limit collision with previous world-chat post
        time.sleep(4)
        text = f"nego iter18 {int(time.time())}"
        r1 = requests.post(
            f"{BASE}/api/worlds/{WORLD_ID}/chat/negotiations/{merc_id}",
            json={"text": text}, headers=demo_hdr, timeout=30
        )
        assert r1.status_code in (200, 201), r1.text

        r2 = requests.get(f"{BASE}/api/worlds/{WORLD_ID}/chat/negotiations/{merc_id}", headers=demo_hdr, timeout=30)
        assert r2.status_code == 200, r2.text
        body = r2.json()
        # Must include channel identifier + messages list
        assert "messages" in body
        msgs = body["messages"]
        assert isinstance(msgs, list)
        assert any(text in (m.get("text") or "") for m in msgs), f"nego msg not found. keys={list(body.keys())}"
