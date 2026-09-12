"""Iteration 25 — Grande Mondo Phase 1 (Bibbia GM v0.2)
Public URL end-to-end: worlds listing, join with region_code, fog-wall enforcement, phase QA, DTO shape, regression on classic realms.
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://empire-lords-dragon.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_HEADERS = {"X-Admin-Key": "eld-admin-7f3c9a1d2b4e"}
DEMO_EMAIL = "demo@empirelords.com"
DEMO_PASSWORD = "Demo12345!"

# Shared state across tests (kept intentionally simple; order matters, pytest keeps discovery order)
STATE: dict = {}


# ------------------------------------------------------------------ fixtures
@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _login(s, email, password):
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


# ------------------------------------------------------------------ auth + worlds listing
class TestGrandeMondoBackend:
    def test_01_demo_login(self, s):
        data = _login(s, DEMO_EMAIL, DEMO_PASSWORD)
        assert "access_token" in data or "token" in data, f"unexpected login payload: {data}"
        STATE["demo_token"] = data.get("access_token") or data.get("token")
        assert STATE["demo_token"]

    def test_02_worlds_listing_has_grande_mondo(self, s):
        r = s.get(f"{API}/worlds", headers=_bearer(STATE["demo_token"]), timeout=30)
        assert r.status_code == 200, r.text
        worlds = _worlds_list(r.json())
        gm = next((w for w in worlds if w.get("world_id") == "gm_1"), None)
        assert gm, f"gm_1 not present. Got: {[w.get('world_id') for w in worlds]}"
        assert gm["kind"] == "GRANDE_MONDO"
        assert int(gm["size"]) == 3232, gm
        info = gm.get("grande_mondo") or {}
        assert info, f"grande_mondo DTO missing: {gm}"
        regs = info["regions"]
        assert len(regs) == 9, [r["code"] for r in regs]
        codes = [r["code"] for r in regs]
        for c in ["IT", "FR", "ES", "DE", "AT", "RU", "CN", "UK", "PT"]:
            assert c in codes, codes
        for r0 in regs:
            for k in ("lang", "x0", "y0", "size", "player_slots", "player_count", "free", "full"):
                assert k in r0, (r0.keys(), k)
            assert int(r0["size"]) == 600
            assert int(r0["player_slots"]) == 100
        assert info["phase"] in ("ISOLATION", "WAR")
        assert int(info["seconds_left"]) > 0
        assert info.get("my_region") == "IT", info.get("my_region")
        # save FR region and IT region rect for later
        STATE["FR"] = next(r0 for r0 in regs if r0["code"] == "FR")
        STATE["IT"] = next(r0 for r0 in regs if r0["code"] == "IT")
        STATE["initial_gm"] = info
        STATE["initial_FR_count"] = int(STATE["FR"]["player_count"])
        STATE["initial_world_player_count"] = int(gm.get("player_count", 0))

    # -------------------------------------------------------------- register + join with region
    def test_03_register_new_account_and_join_flows(self, s):
        # Fresh account to avoid state pollution
        suffix = uuid.uuid4().hex[:10]
        email = f"gmtest_{suffix}@empirelords.com"
        pwd = "TestPass12345!"
        r = s.post(f"{API}/auth/register", json={"email": email, "password": pwd, "display_name": f"GmTest{suffix[:4]}"}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        token = data.get("access_token") or data.get("token")
        assert token, data
        STATE["fr_token"] = token
        STATE["fr_email"] = email

        # 1. no region_code → 400 REGION_REQUIRED
        r1 = s.post(f"{API}/worlds/gm_1/join", headers=_bearer(token), json={"house_name": f"CasaFR_{suffix[:4]}"}, timeout=30)
        assert r1.status_code == 400, r1.text
        assert (r1.json().get("code") or r1.json().get("detail", {}).get("code")) == "REGION_REQUIRED", r1.json()

        # 2. bogus region 'XX' → 400 REGION_REQUIRED
        r2 = s.post(f"{API}/worlds/gm_1/join", headers=_bearer(token), json={"house_name": f"CasaFR_{suffix[:4]}", "region_code": "XX"}, timeout=30)
        assert r2.status_code == 400, r2.text
        assert (r2.json().get("code") or r2.json().get("detail", {}).get("code")) == "REGION_REQUIRED", r2.json()

        # 3. valid 'FR' → 200
        r3 = s.post(f"{API}/worlds/gm_1/join", headers=_bearer(token), json={"house_name": f"CasaFR_{suffix[:4]}", "region_code": "FR"}, timeout=30)
        assert r3.status_code == 200, r3.text
        body = r3.json()
        player = body.get("player") or body
        assert player.get("region_code") == "FR", body
        world_dto = body.get("world") or {}
        gm_info = world_dto.get("grande_mondo") or {}
        assert gm_info.get("my_region") == "FR", gm_info

        # 4. GET /api/worlds → FR player_count incremented
        r4 = s.get(f"{API}/worlds", headers=_bearer(token), timeout=30)
        assert r4.status_code == 200
        gm = next(w for w in _worlds_list(r4.json()) if w.get("world_id") == "gm_1")
        fr = next(r0 for r0 in gm["grande_mondo"]["regions"] if r0["code"] == "FR")
        assert int(fr["player_count"]) == STATE["initial_FR_count"] + 1, (fr, STATE["initial_FR_count"])
        assert int(gm.get("player_count", 0)) == STATE["initial_world_player_count"] + 1

        # 5. Idempotent re-join with same region
        r5 = s.post(f"{API}/worlds/gm_1/join", headers=_bearer(token), json={"house_name": f"CasaFR_{suffix[:4]}", "region_code": "FR"}, timeout=30)
        assert r5.status_code == 200, r5.text

        # Save FR player home settlement for later
        me = s.get(f"{API}/worlds/gm_1/me", headers=_bearer(token), timeout=30).json()
        stl = me["settlements"][0]
        STATE["fr_home"] = stl
        assert STATE["FR"]["x0"] <= stl["x"] < STATE["FR"]["x0"] + 600, stl
        assert STATE["FR"]["y0"] <= stl["y"] < STATE["FR"]["y0"] + 600, stl

    # -------------------------------------------------------------- me + grande-mondo endpoint
    def test_04_worlds_me_shape(self, s):
        r = s.get(f"{API}/worlds/gm_1/me", headers=_bearer(STATE["demo_token"]), timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        world = body.get("world") or {}
        gm = world.get("grande_mondo") or {}
        assert gm, body
        assert "phase" in gm and "fog_up" in gm and "regions" in gm
        assert gm["fog_up"] is True
        center = gm.get("center")
        assert center, gm
        # pyramid_anchor at [1616, 1616] (world center) — Bibbia GM: neutral central land Grande Piramide at world midpoint
        anchor = center.get("pyramid_anchor") if isinstance(center, dict) else center
        assert anchor == [1616, 1616], center
        stl0 = body["settlements"][0]
        assert STATE["IT"]["x0"] <= stl0["x"] < STATE["IT"]["x0"] + 600, stl0
        STATE["demo_home"] = stl0

    def test_05_grande_mondo_endpoint(self, s):
        r = s.get(f"{API}/worlds/gm_1/grande-mondo", headers=_bearer(STATE["demo_token"]), timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "server_time" in body, body
        assert "phase" in body and "regions" in body
        assert len(body["regions"]) == 9

    # -------------------------------------------------------------- fog wall on map chunks
    def test_06_fog_wall_chunks(self, s):
        FR = STATE["FR"]
        cx = (FR["x0"] + 300) // 32
        cy = (FR["y0"] + 300) // 32
        # demo (IT) → FR chunk fogged
        r_demo = s.get(f"{API}/worlds/gm_1/map/chunk/{cx}/{cy}", headers=_bearer(STATE["demo_token"]), timeout=30)
        assert r_demo.status_code == 200, r_demo.text
        body_demo = r_demo.json()
        assert body_demo.get("fogged") is True, body_demo
        assert body_demo.get("settlements") == [], body_demo.get("settlements")
        assert body_demo.get("sentinels") in ([], None), body_demo.get("sentinels")
        assert body_demo.get("territory") in ([], None), body_demo.get("territory")
        assert body_demo.get("terrain_b64"), "terrain_b64 must be present even when fogged"
        # FR account → same chunk NOT fogged, settlements present
        r_fr = s.get(f"{API}/worlds/gm_1/map/chunk/{cx}/{cy}", headers=_bearer(STATE["fr_token"]), timeout=30)
        assert r_fr.status_code == 200, r_fr.text
        body_fr = r_fr.json()
        assert not body_fr.get("fogged"), body_fr.get("fogged")
        settlements_fr = body_fr.get("settlements") or []
        # save a NEUTRAL settlement in FR for later fog march test
        neutral_fr = next((s0 for s0 in settlements_fr if not s0.get("owner_player_id")), None)
        # if not found in this chunk, scan neighbors
        if not neutral_fr:
            for dcx in (-1, 0, 1):
                for dcy in (-1, 0, 1):
                    r2 = s.get(f"{API}/worlds/gm_1/map/chunk/{cx+dcx}/{cy+dcy}", headers=_bearer(STATE["fr_token"]), timeout=15)
                    for s0 in (r2.json().get("settlements") or []):
                        if not s0.get("owner_player_id"):
                            neutral_fr = s0
                            break
                    if neutral_fr:
                        break
                if neutral_fr:
                    break
        assert neutral_fr, "No neutral settlement found in FR region"
        STATE["fr_neutral"] = neutral_fr

        # demo's own home chunk → settlements present (owner IT), not fogged
        home = STATE["demo_home"]
        hcx, hcy = home["x"] // 32, home["y"] // 32
        r_home = s.get(f"{API}/worlds/gm_1/map/chunk/{hcx}/{hcy}", headers=_bearer(STATE["demo_token"]), timeout=30)
        assert r_home.status_code == 200
        b_home = r_home.json()
        assert not b_home.get("fogged"), b_home.get("fogged")
        assert len(b_home.get("settlements") or []) >= 1

    def test_07_fog_overview_hides_foreign(self, s):
        r = s.get(f"{API}/worlds/gm_1/map/overview", headers=_bearer(STATE["demo_token"]), timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert int(body.get("factor", 0)) == 8, body
        assert int(body.get("size", 0)) == 404, body
        FR = STATE["FR"]
        for s0 in body.get("settlements") or []:
            if s0.get("owner_player_id"):
                x, y = s0["x"], s0["y"]
                assert not (FR["x0"] <= x < FR["x0"] + 600 and FR["y0"] <= y < FR["y0"] + 600), f"FR player leaked in overview: {s0}"

    def test_08_fog_wall_marches_preview(self, s):
        # demo → FR neutral → 409 FOG_WALL
        neutral = STATE["fr_neutral"]
        demo_home_id = STATE["demo_home"].get("settlement_id") or STATE["demo_home"].get("_id") or STATE["demo_home"].get("id")
        target_id = neutral.get("settlement_id") or neutral.get("id") or neutral.get("_id")
        payload = {
            "origin_settlement_id": demo_home_id,
            "target_settlement_id": target_id,
            "mission": "ATTACK",
            "units": {"Fanteria": 10},
        }
        r = s.post(f"{API}/worlds/gm_1/marches/preview", headers=_bearer(STATE["demo_token"]), json=payload, timeout=30)
        assert r.status_code == 409, r.text
        code = (r.json().get("code") or r.json().get("detail", {}).get("code"))
        assert code == "FOG_WALL", r.json()

        # demo target_pyramid=true during ISOLATION → 409 FOG_WALL
        payload_p = {
            "origin_settlement_id": demo_home_id,
            "target_pyramid": True,
            "mission": "ATTACK",
            "units": {"Fanteria": 10},
        }
        r2 = s.post(f"{API}/worlds/gm_1/marches/preview", headers=_bearer(STATE["demo_token"]), json=payload_p, timeout=30)
        assert r2.status_code == 409, r2.text
        code2 = (r2.json().get("code") or r2.json().get("detail", {}).get("code"))
        assert code2 == "FOG_WALL", r2.json()

    # -------------------------------------------------------------- QA phase machine
    def test_09_qa_transition_to_war(self, s):
        h = {**ADMIN_HEADERS}
        r = s.post(f"{API}/qa/grande-mondo/phase", headers=h, json={"world_id": "gm_1", "to": "WAR"}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["phase"] == "WAR", body
        assert body["fog_up"] is False, body
        assert 15 * 86400 <= int(body["seconds_left"]) <= 22 * 86400, body["seconds_left"]

        # FR chunk as demo → not fogged now
        FR = STATE["FR"]
        cx = (FR["x0"] + 300) // 32
        cy = (FR["y0"] + 300) // 32
        r2 = s.get(f"{API}/worlds/gm_1/map/chunk/{cx}/{cy}", headers=_bearer(STATE["demo_token"]), timeout=30)
        b2 = r2.json()
        assert not b2.get("fogged"), b2.get("fogged")

        # demo marches/preview to FR neutral → not FOG_WALL
        neutral = STATE["fr_neutral"]
        demo_home_id = STATE["demo_home"].get("settlement_id") or STATE["demo_home"].get("_id") or STATE["demo_home"].get("id")
        target_id = neutral.get("settlement_id") or neutral.get("id") or neutral.get("_id")
        payload = {
            "origin_settlement_id": demo_home_id,
            "target_settlement_id": target_id,
            "mission": "ATTACK",
            "units": {"Fanteria": 10},
        }
        r3 = s.post(f"{API}/worlds/gm_1/marches/preview", headers=_bearer(STATE["demo_token"]), json=payload, timeout=30)
        # 200 or NO_LAND_PATH acceptable; FOG_WALL not acceptable
        if r3.status_code >= 400:
            code = r3.json().get("code") or r3.json().get("detail", {}).get("code")
            assert code != "FOG_WALL", f"Fog should have fallen: {r3.text}"

        # inbox contains GRANDE_MONDO_PHASE WAR
        rin = s.get(f"{API}/worlds/gm_1/inbox", headers=_bearer(STATE["demo_token"]), timeout=30)
        assert rin.status_code == 200
        items = rin.json() if isinstance(rin.json(), list) else rin.json().get("items") or []
        gm_items = [i for i in items if (i.get("event") == "GRANDE_MONDO_PHASE") and (i.get("payload", {}).get("phase") == "WAR")]
        assert gm_items, f"No GRANDE_MONDO_PHASE WAR item in inbox. Sample: {items[:2]}"

        # chronicle contains GM_FOG_FALLEN
        rch = s.get(f"{API}/worlds/gm_1/chronicle", headers=_bearer(STATE["demo_token"]), timeout=30)
        assert rch.status_code == 200
        entries = rch.json() if isinstance(rch.json(), list) else rch.json().get("entries") or []
        assert any(e.get("kind") == "GM_FOG_FALLEN" for e in entries), f"No GM_FOG_FALLEN entry. Sample: {entries[:2]}"

    def test_10_qa_transition_back_to_isolation(self, s):
        r = s.post(f"{API}/qa/grande-mondo/phase", headers=ADMIN_HEADERS, json={"world_id": "gm_1", "to": "ISOLATION"}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["phase"] == "ISOLATION", body
        assert int(body["cycle"]) >= 2, body
        assert body["fog_up"] is True, body
        # idempotent: repeating same phase returns current (no 4xx)
        r2 = s.post(f"{API}/qa/grande-mondo/phase", headers=ADMIN_HEADERS, json={"world_id": "gm_1", "to": "ISOLATION"}, timeout=30)
        assert r2.status_code == 200, r2.text
        # FR chunk as demo → fogged again
        FR = STATE["FR"]
        cx = (FR["x0"] + 300) // 32
        cy = (FR["y0"] + 300) // 32
        r3 = s.get(f"{API}/worlds/gm_1/map/chunk/{cx}/{cy}", headers=_bearer(STATE["demo_token"]), timeout=30)
        assert r3.json().get("fogged") is True, r3.json()

    # -------------------------------------------------------------- classic realm regression
    def test_11_classic_realm_regression(self, s):
        r = s.get(f"{API}/worlds", headers=_bearer(STATE["demo_token"]), timeout=30)
        worlds = _worlds_list(r.json())
        classic_ids = [w["world_id"] for w in worlds if w.get("kind") == "REALM"]
        assert "world_1" in classic_ids and "world_2" in classic_ids, classic_ids
        for wid in ("world_1", "world_2"):
            w = next(w for w in worlds if w["world_id"] == wid)
            assert w.get("grande_mondo") is None, (wid, w.get("grande_mondo"))

        rme = s.get(f"{API}/worlds/world_1/me", headers=_bearer(STATE["demo_token"]), timeout=30)
        assert rme.status_code == 200, rme.text
        body = rme.json()
        home = body["settlements"][0]
        # Find a neutral nearby via map chunk
        hcx, hcy = home["x"] // 32, home["y"] // 32
        neutral = None
        for dcx in range(-2, 3):
            for dcy in range(-2, 3):
                rc = s.get(f"{API}/worlds/world_1/map/chunk/{hcx+dcx}/{hcy+dcy}", headers=_bearer(STATE["demo_token"]), timeout=15)
                for s0 in (rc.json().get("settlements") or []):
                    if not s0.get("owner_player_id"):
                        neutral = s0
                        break
                if neutral:
                    break
            if neutral:
                break
        assert neutral, "no neutral near demo home in world_1"
        payload = {
            "origin_settlement_id": home.get("settlement_id") or home.get("_id") or home.get("id"),
            "target_settlement_id": neutral.get("settlement_id") or neutral.get("id") or neutral.get("_id"),
            "mission": "ATTACK",
            "units": {"Fanteria": 10},
        }
        r = s.post(f"{API}/worlds/world_1/marches/preview", headers=_bearer(STATE["demo_token"]), json=payload, timeout=30)
        # Must NOT be FOG_WALL. Either 200 or some other 4xx (NO_LAND_PATH etc.) is fine.
        if r.status_code >= 400:
            code = r.json().get("code") or r.json().get("detail", {}).get("code")
            assert code != "FOG_WALL", r.text
