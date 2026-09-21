"""End-to-end tests against the PUBLIC deployment (EXPO_PUBLIC_BACKEND_URL).

Covers auth, worlds, settlements, buildings, research, army, map chunk, marches,
QA fast-forward, spec catalog and health. Uses admin QA key for grants and clock.
"""
from __future__ import annotations

import uuid
import pytest
import requests

from tests.e2e_base import ADMIN_KEY as ADMIN_KEY_ENV, BASE_URL, DEMO_EMAIL, DEMO_PASSWORD, track_player  # QA backend only
ADMIN_KEY = ADMIN_KEY_ENV
ADMIN_HEADERS = {"X-Admin-Key": ADMIN_KEY, "Content-Type": "application/json"}


def api_url(path: str) -> str:
    return f"{BASE_URL}{path}"


# ---------- Session-scoped fixtures ----------


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def demo_auth(session):
    r = session.post(api_url("/api/auth/login"), json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"demo login failed {r.status_code} {r.text}"
    data = r.json()
    headers = {"Authorization": f"Bearer {data['access_token']}", "Content-Type": "application/json"}
    me = requests.get(api_url("/api/worlds/qa_1/me"), headers=headers, timeout=15)
    assert me.status_code == 200, me.text
    settlements = me.json().get("settlements", [])
    assert settlements, "demo has no settlement"
    st = settlements[0]
    return {"headers": headers, "token": data["access_token"], "account": data.get("account"), "raw": data, "settlement_id": st["settlement_id"], "settlement": st}


@pytest.fixture(scope="session")
def new_account(session):
    """Register a fresh account (not joined yet)."""
    email = f"e2e_{uuid.uuid4().hex[:8]}@empirelords.com"
    password = "Password123!"
    display = f"E2E{uuid.uuid4().hex[:4]}"
    r = session.post(api_url("/api/auth/register"), json={"email": email, "password": password, "display_name": display}, timeout=30)
    assert r.status_code == 200, f"register {r.status_code} {r.text}"
    data = r.json()
    return {"email": email, "password": password, "display_name": display, "token": data["access_token"], "refresh_token": data.get("refresh_token"), "headers": {"Authorization": f"Bearer {data['access_token']}", "Content-Type": "application/json"}, "raw": data}


# ============= AUTH =============


class TestAuth:
    def test_health(self, session):
        r = session.get(api_url("/api/health"), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "ok" and "spec" in d

    def test_spec_catalog_counts(self, session):
        r = session.get(api_url("/api/spec/catalog"), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert len(d["buildings"]) == 21
        assert len(d["units"]) == 13
        assert len(d["research_nodes"]) == 114
        assert len(d["research_branches"]) == 12

    def test_register_and_login(self, session, new_account):
        # already registered via fixture, now login
        r = session.post(api_url("/api/auth/login"), json={"email": new_account["email"], "password": new_account["password"]}, timeout=15)
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_me_requires_bearer(self, session):
        r = session.get(api_url("/api/auth/me"), timeout=15)
        assert r.status_code == 401
        body = r.json()
        assert set(body) >= {"code", "message", "details"}

    def test_me_with_token(self, session, new_account):
        r = session.get(api_url("/api/auth/me"), headers=new_account["headers"], timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d.get("email") == new_account["email"] or d.get("account", {}).get("email") == new_account["email"]

    def test_refresh_token(self, session, new_account):
        rt = new_account.get("refresh_token")
        if not rt:
            pytest.skip("no refresh_token in register response")
        r = session.post(api_url("/api/auth/refresh"), json={"refresh_token": rt}, timeout=15)
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_logout(self, session, new_account):
        # logout wants body with refresh_token
        r = session.post(api_url("/api/auth/logout"), json={"refresh_token": new_account.get("refresh_token", "")}, headers=new_account["headers"], timeout=15)
        assert r.status_code in (200, 204), r.text


# ============= WORLDS + JOIN =============


class TestWorlds:
    def test_list_worlds(self, session, demo_auth):
        r = session.get(api_url("/api/worlds"), headers=demo_auth["headers"], timeout=15)
        assert r.status_code == 200
        worlds = r.json().get("worlds", [])
        assert len(worlds) >= 1
        assert all(w.get("kind") == "GRANDE_MONDO" for w in worlds), worlds  # only Grande Mondo realms are listed (June 2026)

    def test_join_new_account(self, session, new_account):
        house = f"Casa{uuid.uuid4().hex[:5]}"
        r = session.post(api_url("/api/worlds/qa_1/join"), json={"house_name": house}, headers=new_account["headers"], timeout=30)
        assert r.status_code == 200, r.text
        assert "player" in r.json()
        # verify me shows settlements
        me = session.get(api_url("/api/worlds/qa_1/me"), headers=new_account["headers"], timeout=15)
        assert me.status_code == 200
        d = me.json()
        track_player(d["player"]["player_id"])
        assert len(d["settlements"]) == 1
        st = d["settlements"][0]
        assert "resources" in st and "settlement_id" in st
        new_account["settlement_id"] = st["settlement_id"]
        new_account["settlement"] = st

    def test_demo_me(self, session, demo_auth):
        r = session.get(api_url("/api/worlds/qa_1/me"), headers=demo_auth["headers"], timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert len(d["settlements"]) >= 1
        demo_auth["settlement_id"] = d["settlements"][0]["settlement_id"]
        demo_auth["settlement"] = d["settlements"][0]


# ============= BUILDINGS / JOBS / UPGRADE =============


class TestBuildings:
    def test_buildings_catalog(self, session, demo_auth):
        sid = demo_auth["settlement_id"]
        r = session.get(api_url(f"/api/worlds/qa_1/settlements/{sid}/buildings"), headers=demo_auth["headers"], timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert len(d["buildings"]) == 21

    def test_upgrade_idempotency(self, session, demo_auth):
        sid = demo_auth["settlement_id"]
        # grant plenty of resources + settlement level 8 so the Fattoria upgrade is never capped by the settlement level
        gr = session.post(api_url("/api/qa/grant"), json={"settlement_id": sid, "level": 8, "resources": {"grain": 500000, "wood": 500000, "clay": 500000, "iron": 500000, "gold": 50000}}, headers=ADMIN_HEADERS, timeout=15)
        assert gr.status_code == 200, gr.text

        idem = f"e2e-fat-{uuid.uuid4().hex[:6]}"
        body = {"idempotency_key": idem}
        r1 = session.post(api_url(f"/api/worlds/qa_1/settlements/{sid}/buildings/Fattoria/upgrade"), json=body, headers=demo_auth["headers"], timeout=15)
        assert r1.status_code == 200, r1.text
        job1 = r1.json()["job"]
        r2 = session.post(api_url(f"/api/worlds/qa_1/settlements/{sid}/buildings/Fattoria/upgrade"), json=body, headers=demo_auth["headers"], timeout=15)
        assert r2.status_code == 200, r2.text
        assert r2.json()["job"]["job_id"] == job1["job_id"]  # idempotency preserved
        # jobs endpoint
        jr = session.get(api_url(f"/api/worlds/qa_1/settlements/{sid}/jobs"), headers=demo_auth["headers"], timeout=15)
        # some backends put jobs on settlement doc; endpoint may or may not exist -> try both
        if jr.status_code == 404:
            jr = session.get(api_url(f"/api/worlds/qa_1/settlements/{sid}"), headers=demo_auth["headers"], timeout=15)
            assert jr.status_code == 200
            jobs = jr.json().get("jobs", [])
        else:
            assert jr.status_code == 200
            jobs = jr.json().get("jobs", [])
        assert any(j["job_id"] == job1["job_id"] for j in jobs)
        # cancel
        cr = session.post(api_url(f"/api/worlds/qa_1/jobs/{job1['job_id']}/cancel"), json={}, headers=demo_auth["headers"], timeout=15)
        assert cr.status_code == 200

    def test_settlement_upgrade_error_shape(self, session, new_account):
        """A fresh account should fail to upgrade settlement due to requirements (Fabbro L2 etc.) or insufficient resources."""
        sid = new_account.get("settlement_id")
        if not sid:
            pytest.skip("new account not joined")
        # try a settlement upgrade with likely insufficient/requirements gap - just check error structure
        r = session.post(api_url(f"/api/worlds/qa_1/settlements/{sid}/upgrade"), json={}, headers=new_account["headers"], timeout=15)
        # could be 200 (level 2 unlock available) or 4xx; if 4xx must be structured
        if r.status_code >= 400:
            body = r.json()
            assert set(body) >= {"code", "message"}


# ============= RESEARCH =============


class TestResearch:
    def test_research_catalog(self, session, demo_auth):
        sid = demo_auth["settlement_id"]
        r = session.get(api_url(f"/api/worlds/qa_1/settlements/{sid}/research"), headers=demo_auth["headers"], timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert len(d["nodes"]) == 114
        assert len(d["branches"]) == 12

    def test_research_prereq_error(self, session, demo_auth):
        sid = demo_auth["settlement_id"]
        # grant university high level + resources
        g = session.post(api_url("/api/qa/grant"), json={"settlement_id": sid, "buildings": {"Universita": 10}, "resources": {"grain": 999999, "wood": 999999, "clay": 999999, "iron": 999999, "gold": 99999}}, headers=ADMIN_HEADERS, timeout=15)
        assert g.status_code == 200
        # trying tier-2 without tier-1 should give a structured error
        r = session.post(api_url(f"/api/worlds/qa_1/settlements/{sid}/research/economy.grain_2/start"), json={}, headers=demo_auth["headers"], timeout=15)
        if r.status_code >= 400:
            assert set(r.json()) >= {"code", "message"}


# ============= ARMY =============


class TestArmy:
    def test_army_catalog(self, session, demo_auth):
        sid = demo_auth["settlement_id"]
        r = session.get(api_url(f"/api/worlds/qa_1/settlements/{sid}/army"), headers=demo_auth["headers"], timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert len(d["units"]) == 13

    def test_recruit_and_finish(self, session, demo_auth):
        sid = demo_auth["settlement_id"]
        # ensure resources
        session.post(api_url("/api/qa/grant"), json={"settlement_id": sid, "resources": {"grain": 500000, "wood": 500000, "clay": 500000, "iron": 500000, "gold": 50000}}, headers=ADMIN_HEADERS, timeout=15)
        # baseline
        before = session.get(api_url(f"/api/worlds/qa_1/settlements/{sid}/army"), headers=demo_auth["headers"], timeout=15).json()
        base_count = before["army"].get("Fanteria", 0)
        r = session.post(api_url(f"/api/worlds/qa_1/settlements/{sid}/recruit"), json={"unit": "Fanteria", "count": 5}, headers=demo_auth["headers"], timeout=15)
        assert r.status_code == 200, r.text
        job = r.json()["job"]
        # fast-forward
        adv = session.post(api_url("/api/qa/clock/advance"), json={"seconds": job["remaining_seconds"] + 30}, headers=ADMIN_HEADERS, timeout=30)
        assert adv.status_code == 200
        # run scheduler explicitly (idempotent)
        session.post(api_url("/api/qa/scheduler/run"), json={}, headers=ADMIN_HEADERS, timeout=30)
        session.post(api_url("/api/qa/scheduler/run"), json={}, headers=ADMIN_HEADERS, timeout=30)
        after = session.get(api_url(f"/api/worlds/qa_1/settlements/{sid}/army"), headers=demo_auth["headers"], timeout=15).json()
        assert after["army"].get("Fanteria", 0) == base_count + 5, f"expected +5, got {after['army'].get('Fanteria')} from {base_count}"


# ============= MAP =============


class TestMap:
    def test_chunk_home(self, session, demo_auth):
        s = demo_auth["settlement"]
        cx, cy = s["x"] // 32, s["y"] // 32
        r = session.get(api_url(f"/api/worlds/qa_1/map/chunk/{cx}/{cy}"), headers=demo_auth["headers"], timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "terrain_b64" in d and len(d["terrain_b64"]) > 100
        assert "settlements" in d

    def test_chunk_out_of_range(self, session, demo_auth):
        r = session.get(api_url("/api/worlds/qa_1/map/chunk/999/999"), headers=demo_auth["headers"], timeout=15)
        assert r.status_code in (400, 404)
        body = r.json()
        assert body.get("code") in ("CHUNK_OUT_OF_RANGE", "NOT_FOUND") or "code" in body

    def test_overview_without_bearer(self, session):
        r = session.get(api_url("/api/worlds/qa_1/map/overview"), timeout=15)
        assert r.status_code == 401
        body = r.json()
        assert set(body) >= {"code", "message"}

    def test_overview_with_bearer(self, session, demo_auth):
        import base64
        r = session.get(api_url("/api/worlds/qa_1/map/overview"), headers=demo_auth["headers"], timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("factor") == 4
        assert d.get("size") == 100
        terrain = base64.b64decode(d["terrain_b64"])
        assert len(terrain) == 10000, f"expected 10000 bytes, got {len(terrain)}"
        # values only in 0..3
        assert all(0 <= b <= 3 for b in terrain[:2000]) and all(0 <= b <= 3 for b in terrain[-2000:])
        # settlements list
        sts = d.get("settlements")
        assert isinstance(sts, list) and len(sts) >= 1
        for s in sts:
            assert s.get("kind") == "PLAYER"
            for k in ("settlement_id", "name", "x", "y", "level", "faction"):
                assert k in s, f"missing {k} in settlement {s}"


# ============= MARCH -> BATTLE =============


class TestMarch:
    def _find_neutral(self, session, headers, sx, sy):
        cx, cy = sx // 32, sy // 32
        cands = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                r = session.get(api_url(f"/api/worlds/qa_1/map/chunk/{cx+dx}/{cy+dy}"), headers=headers, timeout=15)
                if r.status_code == 200:
                    cands += [e for e in r.json().get("settlements", []) if e.get("kind") == "NEUTRAL"]
        cands.sort(key=lambda e: max(abs(e["x"] - sx), abs(e["y"] - sy)))
        return cands[0] if cands else None

    def test_attack_neutral_full_flow(self, session, demo_auth):
        sid = demo_auth["settlement_id"]
        s = demo_auth["settlement"]
        target = self._find_neutral(session, demo_auth["headers"], s["x"], s["y"])
        assert target is not None, "no neutral found near home"
        # grant fresh army & resources
        session.post(api_url("/api/qa/grant"), json={"settlement_id": sid, "army": {"Fanteria": 500}, "resources": {"grain": 500000, "wood": 500000, "clay": 500000, "iron": 500000, "gold": 50000}}, headers=ADMIN_HEADERS, timeout=15)
        idem = f"march-e2e-{uuid.uuid4().hex[:6]}"
        body = {"origin_settlement_id": sid, "target_settlement_id": target["settlement_id"], "mission": "ATTACK", "units": {"Fanteria": 200}, "idempotency_key": idem}
        pv = session.post(api_url("/api/worlds/qa_1/marches/preview"), json=body, headers=demo_auth["headers"], timeout=15)
        assert pv.status_code == 200, pv.text
        assert "eta_seconds" in pv.json()
        r = session.post(api_url("/api/worlds/qa_1/marches"), json=body, headers=demo_auth["headers"], timeout=15)
        assert r.status_code == 200, r.text
        m = r.json()["march"]
        march_id = m["march_id"]
        # idempotent retry
        r2 = session.post(api_url("/api/worlds/qa_1/marches"), json=body, headers=demo_auth["headers"], timeout=15)
        assert r2.status_code == 200 and r2.json()["march"]["march_id"] == march_id
        # baseline battles count
        b_before = session.get(api_url("/api/worlds/qa_1/battles"), headers=demo_auth["headers"], timeout=15).json().get("battles", [])
        before_ids = {b["battle_id"] for b in b_before} if b_before else set()
        # fast-forward past ETA
        session.post(api_url("/api/qa/clock/advance"), json={"seconds": m["eta_seconds"] + 30}, headers=ADMIN_HEADERS, timeout=30)
        session.post(api_url("/api/qa/scheduler/run"), json={}, headers=ADMIN_HEADERS, timeout=30)
        b_after = session.get(api_url("/api/worlds/qa_1/battles"), headers=demo_auth["headers"], timeout=15).json().get("battles", [])
        new_battles = [b for b in b_after if b["battle_id"] not in before_ids]
        assert len(new_battles) >= 1, f"no new battle after arrival; battles={b_after}"
        # verify no duplicate on rerun
        session.post(api_url("/api/qa/scheduler/run"), json={}, headers=ADMIN_HEADERS, timeout=30)
        b_after2 = session.get(api_url("/api/worlds/qa_1/battles"), headers=demo_auth["headers"], timeout=15).json().get("battles", [])
        assert len(b_after2) == len(b_after), "duplicate battle created on scheduler re-run"
        # inbox has a notification
        inbox = session.get(api_url("/api/worlds/qa_1/inbox"), headers=demo_auth["headers"], timeout=15).json()
        events = {i["event"] for i in inbox.get("items", [])}
        assert "BATTLE_REPORT_READY" in events or "MARCH_DEPARTED" in events
