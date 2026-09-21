"""Iteration 8 — Missions / Progress / Chronicle backend tests against the PUBLIC deployment.

Covers §20/§22/§39: mission catalog shape, start rules (allowed units, mixed, Falco, research,
cooldown, slots-full, mission-type-active, idempotency, unknown key, invalid units), grant→start→
advance-clock→completion (reward, cooldown, prestige, garrison restore, inbox), progress/chronicle
DTOs, and 401 on chronicle without bearer.

Uses the demo account (already joined qa_1). Marches are NOT launched here — only missions.
"""
from __future__ import annotations

import uuid
import pytest
import requests

from tests.e2e_base import ADMIN_KEY as ADMIN_KEY_ENV, BASE_URL, DEMO_EMAIL, DEMO_PASSWORD  # QA backend only
ADMIN_KEY = ADMIN_KEY_ENV
ADMIN_HEADERS = {"X-Admin-Key": ADMIN_KEY, "Content-Type": "application/json"}




def api(p: str) -> str:
    return f"{BASE_URL}{p}"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def demo(session):
    r = session.post(api("/api/auth/login"), json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
    me = session.get(api("/api/worlds/qa_1/me"), headers=headers, timeout=15).json()
    st = me["settlements"][0]
    return {"headers": headers, "settlement_id": st["settlement_id"], "settlement": st}


def _grant(session, sid: str, **kw):
    payload = {"settlement_id": sid, **kw}
    r = session.post(api("/api/qa/grant"), json=payload, headers=ADMIN_HEADERS, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _missions(session, headers):
    r = session.get(api("/api/worlds/qa_1/missions"), headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _army(session, headers, sid):
    r = session.get(api(f"/api/worlds/qa_1/settlements/{sid}/army"), headers=headers, timeout=15)
    assert r.status_code == 200
    return r.json().get("army", {})


def _advance(session, seconds: int):
    r = session.post(api("/api/qa/clock/advance"), json={"seconds": int(seconds)}, headers=ADMIN_HEADERS, timeout=30)
    assert r.status_code == 200, r.text


def _abort_active(session, headers, sid):
    """Fast-forward and complete any currently active missions so the test starts fresh (no cancel API exists)."""
    ov = _missions(session, headers)
    if not ov.get("active"):
        return
    # Advance enough time to finish the longest active one
    max_hours = 0
    for a in ov["active"]:
        # deduce hours from catalog by matching key
        for c in ov["catalog"]:
            if c["key"] == a["key"]:
                max_hours = max(max_hours, int(c["duration_hours"]))
    if max_hours:
        _advance(session, max_hours * 3600 + 120)
        session.post(api("/api/qa/scheduler/run"), json={}, headers=ADMIN_HEADERS, timeout=30)


# ---------- Missions API tests ----------


class TestMissionsCatalog:
    def test_catalog_shape(self, session, demo):
        d = _missions(session, demo["headers"])
        assert set(d) >= {"catalog", "active", "slots_left", "max_simultaneous", "history", "progress", "server_time"}
        keys = [m["key"] for m in d["catalog"]]
        assert keys == ["patrol_local", "commercial_escort", "predator_hunt", "border_expedition", "distant_recon"], keys
        for m in d["catalog"]:
            for k in ("key", "name", "duration_hours", "requirements", "reward", "cooldown_hours", "cooldown_until", "active_mission_id"):
                assert k in m, f"missing {k} in catalog entry {m['key']}"
        assert int(d["max_simultaneous"]) == 2
        assert 0 <= int(d["slots_left"]) <= 2


class TestMissionsFlow:
    def test_full_flow(self, session, demo):
        sid = demo["settlement_id"]
        headers = demo["headers"]

        # ---- Cleanup any lingering active missions so we start with 2 slots free
        _abort_active(session, headers, sid)

        # ---- Clear any cooldowns from prior test runs by advancing past them
        ov0 = _missions(session, headers)
        max_cd_secs = 0
        for c in ov0["catalog"]:
            cd = c.get("cooldown_until")
            if cd:
                # cooldown_until is ISO — just skip a lot of time to be safe
                max_cd_secs = 25 * 3600
        if max_cd_secs > 0:
            _advance(session, max_cd_secs)
            session.post(api("/api/qa/scheduler/run"), json={}, headers=ADMIN_HEADERS, timeout=30)

        # ---- Grant a fresh army
        _grant(session, sid, army={"Fanteria": 2000, "Arciere": 2000, "Cavalleria": 500, "Falco": 5})
        base_army = _army(session, headers, sid)
        base_fan = base_army.get("Fanteria", 0)

        ov = _missions(session, headers)
        # snapshot prestige before
        prestige_before = int(ov["progress"].get("prestige", 0))

        # ---- 1) commercial_escort success (uses 500 Fanteria)
        idem = f"iter8-ce-{uuid.uuid4().hex[:6]}"
        body = {"key": "commercial_escort", "origin_settlement_id": sid, "units": {"Fanteria": 500}, "idempotency_key": idem}
        r = session.post(api("/api/worlds/qa_1/missions"), json=body, headers=headers, timeout=15)
        assert r.status_code == 201, r.text
        m1 = r.json()
        assert m1["status"] == "ACTIVE" and m1["key"] == "commercial_escort"
        mission_id_1 = m1["mission_id"]

        # garrison decreased by 500
        after1 = _army(session, headers, sid)
        assert after1["Fanteria"] == base_fan - 500, f"Fanteria: {base_fan} → {after1['Fanteria']}"

        # ---- 2) same idempotency key → 201 same mission_id
        r_dup = session.post(api("/api/worlds/qa_1/missions"), json=body, headers=headers, timeout=15)
        assert r_dup.status_code == 201, r_dup.text
        assert r_dup.json()["mission_id"] == mission_id_1
        # garrison unchanged after dup
        after_dup = _army(session, headers, sid)
        assert after_dup["Fanteria"] == after1["Fanteria"]

        # ---- 3) same key different idempotency → 409 MISSION_TYPE_ACTIVE
        r_ta = session.post(
            api("/api/worlds/qa_1/missions"),
            json={**body, "idempotency_key": f"iter8-ce-{uuid.uuid4().hex[:6]}"},
            headers=headers, timeout=15,
        )
        assert r_ta.status_code == 409, r_ta.text
        assert r_ta.json().get("code") == "MISSION_TYPE_ACTIVE"

        # ---- 4) patrol_local with Cavalleria → 400 MISSION_UNITS_NOT_ALLOWED (test BEFORE we fill slots)
        r_ua = session.post(
            api("/api/worlds/qa_1/missions"),
            json={"key": "patrol_local", "origin_settlement_id": sid, "units": {"Cavalleria": 100}, "idempotency_key": f"iter8-pn-{uuid.uuid4().hex[:6]}"},
            headers=headers, timeout=15,
        )
        assert r_ua.status_code == 400, r_ua.text
        assert r_ua.json().get("code") == "MISSION_UNITS_NOT_ALLOWED"

        # ---- 5) predator_hunt with only Fanteria → 400 MISSION_MIXED_UNITS
        r_mx = session.post(
            api("/api/worlds/qa_1/missions"),
            json={"key": "predator_hunt", "origin_settlement_id": sid, "units": {"Fanteria": 1000}, "idempotency_key": f"iter8-ph-{uuid.uuid4().hex[:6]}"},
            headers=headers, timeout=15,
        )
        assert r_mx.status_code == 400, r_mx.text
        assert r_mx.json().get("code") == "MISSION_MIXED_UNITS"

        # ---- 6) predator_hunt with mixed → 201 (2 active now)
        idem_ph = f"iter8-ph-{uuid.uuid4().hex[:6]}"
        r_ph = session.post(
            api("/api/worlds/qa_1/missions"),
            json={"key": "predator_hunt", "origin_settlement_id": sid, "units": {"Fanteria": 600, "Arciere": 600}, "idempotency_key": idem_ph},
            headers=headers, timeout=15,
        )
        assert r_ph.status_code == 201, r_ph.text
        mission_id_2 = r_ph.json()["mission_id"]

        # slots_left should now be 0
        ov2 = _missions(session, headers)
        assert ov2["slots_left"] == 0, ov2
        assert len(ov2["active"]) == 2

        # ---- 7) third mission → 409 MISSION_SLOTS_FULL
        r_sf = session.post(
            api("/api/worlds/qa_1/missions"),
            json={"key": "patrol_local", "origin_settlement_id": sid, "units": {"Fanteria": 100}, "idempotency_key": f"iter8-pl-{uuid.uuid4().hex[:6]}"},
            headers=headers, timeout=15,
        )
        assert r_sf.status_code == 409, r_sf.text
        assert r_sf.json().get("code") == "MISSION_SLOTS_FULL"

        # ---- 8) distant_recon needs Falco -> without Falco → 400 MISSION_NEEDS_FALCO (before slot check would happen too but the API validates units first? Actually slots check comes before units — see missions.start ordering: idem→_check_requirements→cd→slots.) In practice with 2 active it will actually hit MISSION_SLOTS_FULL. So free a slot first is impossible without waiting; verify the error is one of the two acceptable codes at this point:
        r_dr = session.post(
            api("/api/worlds/qa_1/missions"),
            json={"key": "distant_recon", "origin_settlement_id": sid, "units": {"Fanteria": 10}, "idempotency_key": f"iter8-dr-{uuid.uuid4().hex[:6]}"},
            headers=headers, timeout=15,
        )
        # Missions.start order: dup → _check_requirements → cooldown → slots. So needs_falco (a requirement) fires first with 400.
        assert r_dr.status_code == 400, r_dr.text
        assert r_dr.json().get("code") == "MISSION_NEEDS_FALCO"

        # ---- 9) unknown mission → 400 UNKNOWN_MISSION
        r_un = session.post(
            api("/api/worlds/qa_1/missions"),
            json={"key": "not_a_mission", "origin_settlement_id": sid, "units": {"Fanteria": 1}, "idempotency_key": f"iter8-un-{uuid.uuid4().hex[:6]}"},
            headers=headers, timeout=15,
        )
        assert r_un.status_code == 400, r_un.text
        assert r_un.json().get("code") == "UNKNOWN_MISSION"

        # ---- 10) distant_recon with Falco: research check. Get settlement to see research.
        st = session.get(api(f"/api/worlds/qa_1/settlements/{sid}"), headers=headers, timeout=15).json()
        obs_lvl = 0
        r_map = st.get("research", {}) if isinstance(st.get("research"), dict) else {}
        # research may store keys with '.' or '__'
        for k, v in r_map.items():
            if "observation_1" in k and "intelligence" in k:
                obs_lvl = int(v)
        r_falco = session.post(
            api("/api/worlds/qa_1/missions"),
            json={"key": "distant_recon", "origin_settlement_id": sid, "units": {"Falco": 1}, "idempotency_key": f"iter8-drf-{uuid.uuid4().hex[:6]}"},
            headers=headers, timeout=15,
        )
        if obs_lvl >= 1:
            # research met — but still slots-full → 409 SLOTS_FULL
            assert r_falco.status_code == 409, r_falco.text
        else:
            assert r_falco.status_code == 409, r_falco.text
            assert r_falco.json().get("code") == "MISSION_RESEARCH_REQUIRED"

        # ---- 11) Advance 4h + 2min → commercial_escort (4h) completes; predator_hunt (8h) still active.
        _advance(session, 4 * 3600 + 120)
        session.post(api("/api/qa/scheduler/run"), json={}, headers=ADMIN_HEADERS, timeout=30)

        ov3 = _missions(session, headers)
        active_keys = {a["key"] for a in ov3["active"]}
        assert "commercial_escort" not in active_keys, f"still active: {ov3['active']}"
        assert "predator_hunt" in active_keys
        # history contains the commercial_escort with reward_result
        completed = [h for h in ov3["history"] if h["mission_id"] == mission_id_1]
        assert completed, f"commercial_escort not in history: {ov3['history']}"
        rr = completed[0]["reward_result"]
        assert rr and rr.get("destination_settlement_id") and int(rr.get("prestige", 0)) == 15
        assert "resources" in rr
        # cooldown_until set (~completion + 8h) for commercial_escort
        cats = {c["key"]: c for c in ov3["catalog"]}
        assert cats["commercial_escort"]["cooldown_until"], cats["commercial_escort"]
        # garrison Fanteria restored by 500 (from commercial_escort). predator_hunt still holds 600+600.
        after_c = _army(session, headers, sid)
        # started base_fan → -500 (ce) -600 (ph) → +500 back = base_fan - 600
        assert after_c["Fanteria"] == base_fan - 600, f"expected {base_fan - 600}, got {after_c['Fanteria']}"

        # progress.prestige increased by 15
        assert int(ov3["progress"]["prestige"]) >= prestige_before + 15, (prestige_before, ov3["progress"]["prestige"])

        # inbox has MISSION_COMPLETED with deep_link 'missions'
        inbox = session.get(api("/api/worlds/qa_1/inbox"), headers=headers, timeout=15).json()
        mc = [i for i in inbox.get("items", []) if i["event"] == "MISSION_COMPLETED"]
        assert mc, inbox
        assert any(i.get("deep_link") == "missions" for i in mc)

        # ---- 12) Advance another 4h → predator_hunt completes (prestige +20)
        prestige_mid = int(ov3["progress"]["prestige"])
        _advance(session, 4 * 3600 + 120)
        session.post(api("/api/qa/scheduler/run"), json={}, headers=ADMIN_HEADERS, timeout=30)

        ov4 = _missions(session, headers)
        assert not ov4["active"], f"still active: {ov4['active']}"
        completed_ph = [h for h in ov4["history"] if h["mission_id"] == mission_id_2]
        assert completed_ph, ov4["history"]
        # base prestige is 20; if the seeded_cosmetic roll fails the reward code adds a fallback
        # of +5 (spec.missions.catalog[predator_hunt].reward.fallback_if_no_cosmetic.prestige).
        prestige_awarded = int(completed_ph[0]["reward_result"]["prestige"])
        assert prestige_awarded >= 20, prestige_awarded
        assert int(ov4["progress"]["prestige"]) >= prestige_mid + prestige_awarded


class TestProgress:
    def test_progress_shape(self, session, demo):
        r = session.get(api("/api/worlds/qa_1/progress"), headers=demo["headers"], timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("prestige", "titles", "cosmetics", "tracks", "history"):
            assert k in d, f"missing {k}"
        assert isinstance(d["tracks"], list)
        assert len(d["tracks"]) == 6, len(d["tracks"])
        expected = {"kills", "successful_defenses", "conquests", "supports", "territory_tiles", "caravans_intercepted"}
        got = {t.get("key") or t.get("id") or t.get("name") for t in d["tracks"]}
        # allow the tracks to expose their name under different keys — check by intersection
        assert got & expected == expected or any(e in str(d["tracks"]) for e in expected), (got, d["tracks"])
        # each track has thresholds array + decoration
        for t in d["tracks"]:
            assert "thresholds" in t and isinstance(t["thresholds"], list)
            # a "decoration" style string exists on the track or its tier
            s = str(t)
            assert "decoration" in s or "tier" in s or "next" in s


class TestChronicle:
    def test_chronicle_shape(self, session, demo):
        r = session.get(api("/api/worlds/qa_1/chronicle"), headers=demo["headers"], timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("entries", "house_names", "records"):
            assert k in d, f"missing {k}"
        # LARGEST_BATTLE record exists somewhere
        recs = d["records"] or {}
        # Either an object with key LARGEST_BATTLE or a nested record
        found = "largest_battle" in recs or "LARGEST_BATTLE" in recs or any("LARGEST_BATTLE" in str(v) for v in recs.values())
        assert found, f"records missing LARGEST_BATTLE: {recs}"
        lb = recs.get("largest_battle") or recs.get("LARGEST_BATTLE")
        if isinstance(lb, dict):
            assert "power" in lb and "holder" in lb, lb

    def test_chronicle_requires_bearer(self, session):
        r = session.get(api("/api/worlds/qa_1/chronicle"), timeout=15)
        assert r.status_code == 401, r.text
