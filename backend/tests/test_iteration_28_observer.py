"""Iteration 28 — LIGHT observer verification of Pyramids on gm_1.

Non-destructive read-only checks + minimal admin round-trip (set regional first_open_day 60 → restore 90).
Leaves gm_1 in ISOLATION, next_war FR+IT ×5, regional_first_open_day=90.
"""
from __future__ import annotations

import pytest
import requests
from dotenv import load_dotenv
from tests.paths import FRONTEND_ENV

load_dotenv(FRONTEND_ENV)
from tests.e2e_base import ADMIN_HEADERS, BASE_URL, DEMO_EMAIL, DEMO_PASSWORD, OBSERVER_EMAIL, OBSERVER_PASSWORD  # QA backend only
WORLD = "gm_1"
GRAND = WORLD
IT = f"{WORLD}:IT"
FR = f"{WORLD}:FR"
OBS = (OBSERVER_EMAIL, OBSERVER_PASSWORD)
DEMO = (DEMO_EMAIL, DEMO_PASSWORD)


def _url(p): return f"{BASE_URL}/api{p}"


def auth(email, password):
    r = requests.post(_url("/auth/login"), json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def obs():
    return auth(*OBS)


@pytest.fixture(scope="module")
def demo():
    return auth(*DEMO)


class TestPyramidsList:
    def test_list_10_and_shape(self, obs):
        r = requests.get(_url(f"/worlds/{WORLD}/pyramids"), headers=obs, timeout=30)
        assert r.status_code == 200, r.text
        lst = r.json()["pyramids"]
        assert len(lst) == 10
        grand = lst[0]
        assert grand["kind"] == "GRAND"
        assert grand["id"] == GRAND
        assert grand["anchor"] == [1088, 1088]
        assert grand["footprint"] == [41, 41]
        assert grand["manual_open"] is True
        regional = [p for p in lst if p["kind"] == "REGIONAL"]
        assert len(regional) == 9
        it = next(p for p in regional if p["region_code"] == "IT")
        assert it["id"] == IT
        assert it["mine"] is True
        assert it["anchor"] == [1088, 583]
        assert it["footprint"] == [15, 15]


class TestPyramidDetails:
    def test_obs_default_is_own_region(self, obs):
        r = requests.get(_url(f"/worlds/{WORLD}/pyramid"), headers=obs, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["id"] == IT
        assert d["kind"] == "REGIONAL"
        assert d["name"] == "Piccola Piramide IT"
        assert d["config"]["first_open_day"] == 90
        # guardian is exposed via QA endpoint when DORMANT_INITIAL (not in player endpoint)
        qa = requests.get(_url("/qa/pyramid/config"), params={"world_id": WORLD, "pyramid_id": IT},
                          headers=ADMIN_HEADERS, timeout=30).json()
        assert qa["config"]["guardian"]["min_power"] == 250000

    def test_grand_config(self, obs):
        r = requests.get(_url(f"/worlds/{WORLD}/pyramid"), headers=obs, params={"id": GRAND}, timeout=30)
        assert r.status_code == 200
        g = r.json()
        assert g["kind"] == "GRAND"
        assert g["config"]["manual_open"] is True
        assert g["config"]["reward_scope"] == "REGION"
        assert g["config"]["reward_days"] == 7
        reward = g["config"]["reward"]
        assert reward["production_pct"] == 10
        assert reward["research_pct"] == 5
        assert reward["training_pct"] == 10

    def test_unknown_pyramid_404(self, obs):
        r = requests.get(_url(f"/worlds/{WORLD}/pyramid"), headers=obs, params={"id": "gm_1:XX"}, timeout=30)
        assert r.status_code == 404
        assert r.json().get("code") == "PYRAMID_NOT_FOUND"

    def test_demo_default_and_cross_region(self, demo):
        r = requests.get(_url(f"/worlds/{WORLD}/pyramid"), headers=demo, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == FR
        r2 = requests.get(_url(f"/worlds/{WORLD}/pyramid"), headers=demo, params={"id": IT}, timeout=30)
        assert r2.status_code == 200
        assert r2.json()["me"]["in_region"] is False


class TestGrandeMondoAggregate:
    def test_gm_shape(self, obs):
        r = requests.get(_url(f"/worlds/{WORLD}/grande-mondo"), headers=obs, timeout=30)
        assert r.status_code == 200
        gm = r.json()
        assert "pyramids" in gm and len(gm["pyramids"]) == 10
        assert gm["grand_pyramid"]["kind"] == "GRAND"
        assert gm["my_pyramid"]["id"] == IT
        assert gm["regional_first_open_day"] == 90
        assert "grand_wins" in gm and isinstance(gm["grand_wins"], list)


class TestAdmin:
    def test_open_grand_needs_war(self, obs):
        r = requests.post(_url(f"/worlds/{WORLD}/grande-mondo/admin/grand-pyramid"), headers=obs,
                          json={"action": "OPEN"}, timeout=30)
        assert r.status_code == 409, r.text
        assert r.json().get("code") == "GRAND_PYRAMID_NEEDS_WAR"

    def test_open_grand_demo_forbidden(self, demo):
        r = requests.post(_url(f"/worlds/{WORLD}/grande-mondo/admin/grand-pyramid"), headers=demo,
                          json={"action": "OPEN"}, timeout=30)
        assert r.status_code == 403

    def test_regional_config_roundtrip(self, obs):
        # set 60 for ALL regions
        r = requests.post(_url(f"/worlds/{WORLD}/grande-mondo/admin/regional-pyramid-config"), headers=obs,
                          json={"region": None, "config": {"first_open_day": 60}}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["regional_first_open_day"] == 60
        # restore 90
        r2 = requests.post(_url(f"/worlds/{WORLD}/grande-mondo/admin/regional-pyramid-config"), headers=obs,
                           json={"region": None, "config": {"first_open_day": 90}}, timeout=30)
        assert r2.status_code == 200
        assert r2.json()["regional_first_open_day"] == 90


class TestFinalState:
    def test_isolation_and_config(self, obs):
        r = requests.get(_url(f"/worlds/{WORLD}/grande-mondo"), headers=obs, timeout=30)
        gm = r.json()
        assert gm["phase"] == "ISOLATION"
        assert gm["regional_first_open_day"] == 90
        nw = gm.get("next_war") or {}
        assert set(nw.get("regions", [])) == {"FR", "IT"}
        assert nw.get("speed_multiplier") == 5
