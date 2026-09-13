"""Iteration 27 — Grande Mondo Phase 2 (pie-sector layout).
Updated for new geometry: size=2176, center=(1088,1088), regions use bbox/center/pyramid_anchor
(no more x0/y0/size), war_days=30, isolation_days=120, admin war-config, selective war.
Runs against deployed backend (EXPO_PUBLIC_BACKEND_URL) using real accounts.
"""
from __future__ import annotations

import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://empire-lords-dragon.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_HEADERS = {"X-Admin-Key": "eld-admin-7f3c9a1d2b4e"}

DEMO_EMAIL = "demo@empirelords.com"
OBS_EMAIL = "osservatore@empirelords.com"
PW = "Demo12345!"

STATE: dict = {}


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _login(s, email, password=PW):
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    return r.json()


def _bearer(tok):
    return {"Authorization": f"Bearer {tok}"}


def _worlds_list(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict) and isinstance(payload.get("worlds"), list):
        return payload["worlds"]
    raise AssertionError(f"unexpected worlds payload shape: {type(payload)} {str(payload)[:200]}")


def _err_code(resp):
    try:
        j = resp.json()
    except Exception:
        return None
    return j.get("code") or (j.get("detail") or {}).get("code") or j.get("error")


# ============================================================================ shape
class TestGrandeMondoShape:
    def test_01_logins(self, s):
        STATE["demo"] = _login(s, DEMO_EMAIL)["access_token"]
        STATE["obs"] = _login(s, OBS_EMAIL)["access_token"]

    def test_02_worlds_new_geometry(self, s):
        r = s.get(f"{API}/worlds", headers=_bearer(STATE["obs"]), timeout=30)
        assert r.status_code == 200, r.text
        gm = next((w for w in _worlds_list(r.json()) if w.get("world_id") == "gm_1"), None)
        assert gm is not None, "gm_1 missing"
        assert gm["kind"] == "GRANDE_MONDO"
        assert int(gm["size"]) == 2176, f"size={gm['size']}"
        info = gm["grande_mondo"]
        assert info, gm
        c = info["center"]
        assert c == {"x": 1088, "y": 1088, "radius": 130, "pyramid_anchor": [1088, 1088]}, c
        regs = info["regions"]
        assert len(regs) == 9
        codes = [r["code"] for r in regs]
        for expected in ("IT", "FR", "ES", "DE", "AT", "RU", "CN", "UK", "PT"):
            assert expected in codes, codes
        # New geometry fields per region + no old x0/y0/size
        needed = {"index", "code", "mid_deg", "half_deg", "r_in", "r_land", "r_out",
                  "bbox", "center", "pyramid_anchor", "player_slots", "player_count",
                  "free", "full", "at_war"}
        for r0 in regs:
            missing = needed - set(r0.keys())
            assert not missing, f"{r0['code']}: missing {missing}"
            assert "x0" not in r0 and "y0" not in r0 and "size" not in r0, r0
            assert int(r0["r_in"]) == 130
            assert int(r0["r_land"]) == 880
            assert int(r0["r_out"]) == 1030
            bx0, by0, bx1, by1 = r0["bbox"]
            assert bx0 < bx1 and by0 < by1
            cx, cy = r0["center"]
            assert bx0 <= cx <= bx1 and by0 <= cy <= by1
        STATE["gm"] = info
        STATE["IT"] = next(r for r in regs if r["code"] == "IT")
        STATE["FR"] = next(r for r in regs if r["code"] == "FR")
        STATE["ES"] = next(r for r in regs if r["code"] == "ES")

    def test_03_grande_mondo_endpoint_observer(self, s):
        r = s.get(f"{API}/worlds/gm_1/grande-mondo", headers=_bearer(STATE["obs"]), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["phase"] == "ISOLATION"
        assert 0 < int(d["seconds_left"]) <= 120 * 86400
        assert int(d["war_days"]) == 30
        assert int(d["isolation_days"]) == 120
        assert d["speed_multipliers"] == [1, 2, 3, 5]
        assert d["view_all"] is True
        assert d["is_admin"] is True
        nw = d.get("next_war") or {}
        assert set(nw.get("regions") or []) == {"FR", "IT"}, nw
        assert int(nw.get("speed_multiplier")) == 5, nw

    def test_04_overview_new_size(self, s):
        r = s.get(f"{API}/worlds/gm_1/map/overview", headers=_bearer(STATE["obs"]), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert int(d.get("size", 0)) == 272, d.get("size")
        assert int(d.get("factor", 0)) == 8, d.get("factor")


# ============================================================================ admin war-config
class TestAdminWarConfig:
    def test_05_single_region_400(self, s):
        r = s.post(f"{API}/worlds/gm_1/grande-mondo/admin/war-config",
                   headers=_bearer(STATE["obs"]), json={"regions": ["IT"], "speed_multiplier": 5}, timeout=30)
        assert r.status_code == 400, r.text
        assert _err_code(r) == "WAR_CONFIG_INVALID"

    def test_06_invalid_multiplier_400(self, s):
        r = s.post(f"{API}/worlds/gm_1/grande-mondo/admin/war-config",
                   headers=_bearer(STATE["obs"]), json={"regions": ["IT", "FR"], "speed_multiplier": 4}, timeout=30)
        assert r.status_code == 400, r.text
        assert _err_code(r) == "WAR_CONFIG_INVALID"

    def test_07_valid_it_fr_x3(self, s):
        r = s.post(f"{API}/worlds/gm_1/grande-mondo/admin/war-config",
                   headers=_bearer(STATE["obs"]), json={"regions": ["IT", "FR"], "speed_multiplier": 3}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        nw = d.get("next_war") or {}
        assert set(nw["regions"]) == {"IT", "FR"}
        assert int(nw["speed_multiplier"]) == 3

    def test_08_demo_forbidden(self, s):
        r = s.post(f"{API}/worlds/gm_1/grande-mondo/admin/war-config",
                   headers=_bearer(STATE["demo"]), json={"regions": ["IT", "FR"], "speed_multiplier": 3}, timeout=30)
        assert r.status_code == 403, r.text
        assert _err_code(r) == "FORBIDDEN"

    def test_09_restore_fr_it_x5(self, s):
        r = s.post(f"{API}/worlds/gm_1/grande-mondo/admin/war-config",
                   headers=_bearer(STATE["obs"]), json={"regions": ["FR", "IT"], "speed_multiplier": 5}, timeout=30)
        assert r.status_code == 200, r.text
        nw = r.json().get("next_war") or {}
        assert set(nw["regions"]) == {"FR", "IT"} and int(nw["speed_multiplier"]) == 5, nw


# ============================================================================ selective war + march speed
class TestSelectiveWar:
    def test_10_obs_home_it_region(self, s):
        me = s.get(f"{API}/worlds/gm_1/me", headers=_bearer(STATE["obs"]), timeout=30).json()
        assert me["player"]["region_code"] == "IT"
        mother = next(x for x in me["settlements"] if x.get("is_mother"))
        STATE["obs_home"] = mother

    def _find_neutral_around(self, s, headers, cxy):
        cx, cy = cxy[0] // 32, cxy[1] // 32
        for dx in range(-3, 4):
            for dy in range(-3, 4):
                rc = s.get(f"{API}/worlds/gm_1/map/chunk/{cx+dx}/{cy+dy}", headers=headers, timeout=15)
                if rc.status_code != 200:
                    continue
                for s0 in rc.json().get("settlements") or []:
                    if (s0.get("kind") or s0.get("type")) == "NEUTRAL":
                        return s0
        return None

    def test_11_transition_war(self, s):
        r = s.post(f"{API}/worlds/gm_1/grande-mondo/admin/phase",
                   headers=_bearer(STATE["obs"]), json={"to": "WAR"}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["phase"] == "WAR"
        war = d.get("war") or {}
        assert set(war.get("regions") or []) == {"FR", "IT"}, war
        assert int(war.get("speed_multiplier")) == 5, war
        by_code = {r["code"]: r for r in d["regions"]}
        assert by_code["IT"]["at_war"] is True
        assert by_code["FR"]["at_war"] is True
        assert by_code["ES"]["at_war"] is False

    def test_12_march_preview_fr_neutral_x5(self, s):
        fr = STATE["FR"]
        neutral = self._find_neutral_around(s, _bearer(STATE["obs"]), fr["center"])
        assert neutral, "no FR neutral found"
        home = STATE["obs_home"]
        payload = {
            "origin_settlement_id": home["settlement_id"],
            "target_settlement_id": neutral.get("settlement_id") or neutral.get("id") or neutral.get("_id"),
            "mission": "ATTACK",
            "units": {"Cavalleria": 10},
        }
        r = s.post(f"{API}/worlds/gm_1/marches/preview", headers=_bearer(STATE["obs"]), json=payload, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert float(d.get("speed_multiplier", 0)) == 5.0, d
        STATE["fr_neutral"] = neutral

    def test_13_march_preview_es_neutral_fog_wall(self, s):
        es = STATE["ES"]
        neutral = self._find_neutral_around(s, _bearer(STATE["obs"]), es["center"])
        assert neutral, "no ES neutral found"
        home = STATE["obs_home"]
        payload = {
            "origin_settlement_id": home["settlement_id"],
            "target_settlement_id": neutral.get("settlement_id") or neutral.get("id") or neutral.get("_id"),
            "mission": "ATTACK",
            "units": {"Cavalleria": 10},
        }
        r = s.post(f"{API}/worlds/gm_1/marches/preview", headers=_bearer(STATE["obs"]), json=payload, timeout=30)
        assert r.status_code == 409, r.text
        assert _err_code(r) == "FOG_WALL"

    def test_14_transition_isolation_and_fog_up(self, s):
        r = s.post(f"{API}/worlds/gm_1/grande-mondo/admin/phase",
                   headers=_bearer(STATE["obs"]), json={"to": "ISOLATION"}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["phase"] == "ISOLATION"
        assert int(d["cycle"]) >= 2

    def test_15_after_isolation_fr_preview_fog_wall(self, s):
        neutral = STATE["fr_neutral"]
        home = STATE["obs_home"]
        payload = {
            "origin_settlement_id": home["settlement_id"],
            "target_settlement_id": neutral.get("settlement_id") or neutral.get("id") or neutral.get("_id"),
            "mission": "ATTACK",
            "units": {"Cavalleria": 10},
        }
        r = s.post(f"{API}/worlds/gm_1/marches/preview", headers=_bearer(STATE["obs"]), json=payload, timeout=30)
        assert r.status_code == 409, r.text
        assert _err_code(r) == "FOG_WALL"


# ============================================================================ fog chunk view_all
class TestFogChunk:
    def test_16_demo_it_chunk_fogged(self, s):
        # IT home ~ (1067, 337) → chunk 33,10
        cx, cy = 1067 // 32, 337 // 32
        r_demo = s.get(f"{API}/worlds/gm_1/map/chunk/{cx}/{cy}", headers=_bearer(STATE["demo"]), timeout=30)
        assert r_demo.status_code == 200
        b = r_demo.json()
        assert b.get("fogged") is True, f"demo (FR) should see IT fogged, got {b.get('fogged')}"
        assert (b.get("settlements") or []) == []
        # obs sees settlements
        r_obs = s.get(f"{API}/worlds/gm_1/map/chunk/{cx}/{cy}", headers=_bearer(STATE["obs"]), timeout=30)
        b_obs = r_obs.json()
        assert not b_obs.get("fogged"), b_obs.get("fogged")
        assert len(b_obs.get("settlements") or []) >= 1


# ============================================================================ final safety: leave state clean
class TestZFinalRestore:
    def test_17_final_war_config_is_fr_it_x5(self, s):
        r = s.get(f"{API}/worlds/gm_1/grande-mondo", headers=_bearer(STATE["obs"]), timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["phase"] == "ISOLATION"
        nw = d.get("next_war") or {}
        assert set(nw.get("regions") or []) == {"FR", "IT"}
        assert int(nw.get("speed_multiplier")) == 5
