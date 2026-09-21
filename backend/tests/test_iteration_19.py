"""
Iteration 19 backend tests — Daily login RESOURCES ONLY (speed-ups removed),
speedup endpoint removed (404), inbox items shape.
"""
from __future__ import annotations

import os
import pytest
import requests

from tests.e2e_base import ADMIN_HEADERS, BASE_URL as BASE, DEMO_EMAIL, DEMO_PASSWORD# QA backend only

WORLD_ID = "qa_1"
DEMO = {"email": DEMO_EMAIL, "password": DEMO_PASSWORD}

EXPECTED_MULTS = {1, 1.25, 1.5, 1.75, 2, 2.5, 4}


def _login(creds: dict) -> dict:
    r = requests.post(f"{BASE}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login {creds['email']} failed: {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def demo_hdr():
    return _login(DEMO)


# ---------------------------------------------------------------- DAILY (resources only)
class TestDailyResourcesOnly:
    def test_daily_status_shape(self, demo_hdr):
        r = requests.get(f"{BASE}/api/worlds/{WORLD_ID}/daily", headers=demo_hdr, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        # No speedup_minutes anywhere at the top level
        assert "speedup_minutes" not in d, f"speedup_minutes still present at top-level: {list(d.keys())}"
        assert isinstance(d.get("day"), int) and 1 <= d["day"] <= 7
        assert isinstance(d.get("claimable"), bool)
        assert isinstance(d.get("streak"), int)
        assert d.get("next_reset_at")
        rewards = d.get("rewards")
        assert isinstance(rewards, list) and len(rewards) == 7, f"expected 7 rewards, got {len(rewards or [])}"

        found_mults = []
        for i, rw in enumerate(rewards):
            assert rw["day"] == i + 1
            kind = rw.get("kind")
            assert kind in ("RESOURCES", "CHEST"), f"day {i+1} kind={kind} (SPEEDUP must be removed)"
            # No speedup_minutes anywhere
            assert "speedup_minutes" not in rw, f"speedup_minutes in reward day {i+1}: {rw}"
            mult = rw.get("mult")
            assert isinstance(mult, (int, float)) and mult > 0, f"day {i+1} bad mult: {rw}"
            found_mults.append(float(mult))
            res = rw.get("resources")
            assert isinstance(res, dict), f"day {i+1} missing resources dict"
            assert set(res.keys()) == {"grain", "wood", "clay", "iron", "gold"}, (
                f"day {i+1} resources keys={list(res.keys())}"
            )
        # Sequence expected 1,1.25,1.5,1.75,2,2.5,4
        assert set(found_mults) == EXPECTED_MULTS, f"mult sequence {found_mults}"

    def test_daily_claim_200_or_409(self, demo_hdr):
        r = requests.post(f"{BASE}/api/worlds/{WORLD_ID}/daily/claim", headers=demo_hdr, timeout=30)
        assert r.status_code in (200, 409), f"unexpected status {r.status_code}: {r.text}"
        body = r.json()
        if r.status_code == 200:
            granted = body.get("granted") or {}
            # RESOURCES only – no speedup_minutes on granted
            assert "speedup_minutes" not in granted, f"speedup_minutes leaked in granted: {granted}"
            assert granted.get("kind") in ("RESOURCES", "CHEST")
            res = granted.get("resources")
            assert isinstance(res, dict) and set(res.keys()) == {"grain", "wood", "clay", "iron", "gold"}
        else:
            # 409 ALREADY_CLAIMED
            code = body.get("code") or (body.get("detail") or {}).get("code")
            assert code == "ALREADY_CLAIMED" or "ALREADY_CLAIMED" in r.text, f"unexpected 409 body: {body}"


# ---------------------------------------------------------------- SPEEDUP endpoint REMOVED
class TestSpeedupRemoved:
    def test_speedup_endpoint_returns_404_not_500(self, demo_hdr):
        r = requests.post(
            f"{BASE}/api/worlds/{WORLD_ID}/jobs/anything/speedup",
            json={"minutes": 10},
            headers=demo_hdr,
            timeout=30,
        )
        # Route must be gone (404) — never 500
        assert r.status_code == 404, f"expected 404 (route removed), got {r.status_code}: {r.text[:300]}"

    def test_speedup_endpoint_no_body_also_404(self, demo_hdr):
        r = requests.post(
            f"{BASE}/api/worlds/{WORLD_ID}/jobs/anything/speedup",
            headers=demo_hdr,
            timeout=30,
        )
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:300]}"


# ---------------------------------------------------------------- INBOX
class TestInbox:
    def test_inbox_list(self, demo_hdr):
        r = requests.get(f"{BASE}/api/worlds/{WORLD_ID}/inbox?limit=200", headers=demo_hdr, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        items = body.get("items")
        assert isinstance(items, list), f"items not list: {type(items)}"
        assert len(items) <= 200
        unread = body.get("unread")
        assert isinstance(unread, int), f"unread not int: {unread}"
        # Each item should have a type/kind field usable for filter chips
        if items:
            keys0 = set(items[0].keys())
            # Inbox items are notification records — must have event + notification_id + severity
            assert "event" in keys0, f"inbox item lacks event: {keys0}"
            assert "notification_id" in keys0, f"inbox item lacks notification_id: {keys0}"
