"""Iteration 7 tests: castle skins (unlock by level) + settlement battle history endpoint.

- GET /api/worlds/{w}/settlements/{s}/skins → catalog with current/level/skins[]
- PUT /api/worlds/{w}/settlements/{s}/skin → sets skin or returns 409 SKIN_LOCKED / 400 INVALID_SKIN / 401 / 403|404
- GET /api/worlds/{w}/settlements/{s}/battles?limit=<=20 → up to 5 last battles (newest first),
  each with battle_id/report.winner/loot/created_at + origin_settlement_id key.
- GET /api/qa/clock offset_seconds is persisted (~+10.6d expected pre-run).
"""
from __future__ import annotations

import uuid

import pytest
import requests

from tests.e2e_base import ADMIN_KEY as ADMIN_KEY_ENV, BASE_URL  # QA backend only
ADMIN_KEY = ADMIN_KEY_ENV
ADMIN_HEADERS = {"X-Admin-Key": ADMIN_KEY, "Content-Type": "application/json"}
DEMO_EMAIL = "demo@empirelords.com"
DEMO_PASSWORD = "Demo12345!"
DEMO_SETTLEMENT = None  # resolved from /me at runtime (fixture ids change with every world reset)


def api(path: str) -> str:
    return f"{BASE_URL}{path}"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def demo(s):
    r = s.post(api("/api/auth/login"), json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
    me = s.get(api("/api/worlds/qa_1/me"), headers=h, timeout=15).json()
    global DEMO_SETTLEMENT
    DEMO_SETTLEMENT = me["player"]["mother_settlement_id"]
    return {"headers": h, "me": me}


# =============================== SKINS ==================================
class TestSkins:
    def test_skins_catalog_shape(self, s, demo):
        r = s.get(api(f"/api/worlds/qa_1/settlements/{DEMO_SETTLEMENT}/skins"), headers=demo["headers"], timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("current") in ("classic", "sandstone", "royal", "obsidian"), d
        assert isinstance(d.get("level"), int) and d["level"] >= 1
        base = [x for x in d["skins"] if not x.get("premium")]  # premium (Negozio) skins appended since iteration 34
        assert isinstance(d.get("skins"), list) and len(base) == 4
        ids = [x["id"] for x in base]
        assert ids == ["classic", "sandstone", "royal", "obsidian"]
        thresholds = {x["id"]: x["min_level"] for x in base}
        assert thresholds == {"classic": 1, "sandstone": 5, "royal": 10, "obsidian": 20}
        # classic must be unlocked; higher tiers gated by level (demo mother is L5)
        for x in base:
            assert x["unlocked"] == (d["level"] >= x["min_level"])

    def test_skin_put_locked_returns_409_with_required_level(self, s, demo):
        # demo is level 3 → royal (min 10) must be locked
        r = s.put(api(f"/api/worlds/qa_1/settlements/{DEMO_SETTLEMENT}/skin"), json={"skin": "royal"}, headers=demo["headers"], timeout=15)
        assert r.status_code == 409, r.text
        body = r.json()
        assert body.get("code") == "SKIN_LOCKED", body
        details = body.get("details") or {}
        assert details.get("required_level") == 10, body

    def test_skin_put_invalid_returns_400(self, s, demo):
        r = s.put(api(f"/api/worlds/qa_1/settlements/{DEMO_SETTLEMENT}/skin"), json={"skin": "zzz"}, headers=demo["headers"], timeout=15)
        assert r.status_code == 400, r.text
        assert r.json().get("code") == "INVALID_SKIN"

    def test_skin_put_classic_ok(self, s, demo):
        r = s.put(api(f"/api/worlds/qa_1/settlements/{DEMO_SETTLEMENT}/skin"), json={"skin": "classic"}, headers=demo["headers"], timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["current"] == "classic"
        # verify persistence via GET
        g = s.get(api(f"/api/worlds/qa_1/settlements/{DEMO_SETTLEMENT}/skins"), headers=demo["headers"], timeout=15).json()
        assert g["current"] == "classic"

    def test_skin_get_unauthenticated_401(self, s):
        r = s.get(api(f"/api/worlds/qa_1/settlements/{DEMO_SETTLEMENT}/skins"), timeout=15)
        assert r.status_code == 401, r.text

    def test_skin_put_unauthenticated_401(self, s):
        r = s.put(api(f"/api/worlds/qa_1/settlements/{DEMO_SETTLEMENT}/skin"), json={"skin": "classic"}, timeout=15)
        assert r.status_code == 401, r.text

    def test_skin_foreign_settlement_forbidden(self, s, demo):
        # find some other player-owned or neutral settlement id via the battles list target
        br = s.get(api("/api/worlds/qa_1/battles?limit=30"), headers=demo["headers"], timeout=15).json()
        target_id = None
        for b in br.get("battles", []):
            tid = b.get("target_settlement_id")
            if tid and tid != DEMO_SETTLEMENT:
                target_id = tid
                break
        if not target_id:
            pytest.skip("no foreign settlement available in demo's battle history")
        r = s.get(api(f"/api/worlds/qa_1/settlements/{target_id}/skins"), headers=demo["headers"], timeout=15)
        assert r.status_code in (403, 404), r.text
        r2 = s.put(api(f"/api/worlds/qa_1/settlements/{target_id}/skin"), json={"skin": "classic"}, headers=demo["headers"], timeout=15)
        assert r2.status_code in (403, 404), r2.text


# =============================== BATTLES BY SETTLEMENT ==================================
class TestBattleHistory:
    @pytest.fixture(scope="class")
    def target_settlement(self, s, demo):
        br = s.get(api("/api/worlds/qa_1/battles?limit=30"), headers=demo["headers"], timeout=15).json()
        for b in br.get("battles", []):
            tid = b.get("target_settlement_id")
            if tid and tid != DEMO_SETTLEMENT:
                return tid
        pytest.skip("no non-own target settlement in demo's history")

    def test_battles_by_settlement_shape(self, s, demo, target_settlement):
        r = s.get(api(f"/api/worlds/qa_1/settlements/{target_settlement}/battles?limit=5"), headers=demo["headers"], timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d.get("battles"), list)
        assert len(d["battles"]) <= 5
        # Newest first
        created = [b["created_at"] for b in d["battles"]]
        assert created == sorted(created, reverse=True), created
        for b in d["battles"]:
            assert "battle_id" in b and b["battle_id"]
            assert "report" in b and "winner" in b["report"], b
            assert "loot" in b  # may be None for defence
            assert "created_at" in b and b["created_at"]
            assert "origin_settlement_id" in b  # key must be present (may be null)

    def test_battles_by_settlement_limit_upper_bound_422(self, s, demo, target_settlement):
        r = s.get(api(f"/api/worlds/qa_1/settlements/{target_settlement}/battles?limit=21"), headers=demo["headers"], timeout=15)
        assert r.status_code == 422, r.text

    def test_battles_by_own_settlement_ok(self, s, demo):
        r = s.get(api(f"/api/worlds/qa_1/settlements/{DEMO_SETTLEMENT}/battles?limit=5"), headers=demo["headers"], timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json().get("battles"), list)


# =============================== QA CLOCK PERSISTENCE ==================================
class TestQaClock:
    def test_clock_persisted_offset(self, s):
        r = s.get(api("/api/qa/clock"), headers=ADMIN_HEADERS, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        offset = d.get("offset_seconds")
        assert isinstance(offset, (int, float)), d
        # test_iteration_6 advanced the clock further; we only assert it is significantly positive
        assert offset > 300000, f"expected clock advanced beyond 300k, got {offset}"
        print(f"[iter7] QA clock offset_seconds = {offset:.1f}")
