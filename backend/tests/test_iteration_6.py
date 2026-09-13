"""Iteration 6 tests: house/crest catalog + updates, chunk owner_house_crest & skin, hostile intel scenario.
Runs against the public deployment. Uses admin key for QA grants and clock/scheduler.
"""
from __future__ import annotations

import os
import uuid
import pytest
import requests

from tests.e2e_base import BASE_URL  # QA backend only
ADMIN_KEY = "eld-admin-7f3c9a1d2b4e"
ADMIN_HEADERS = {"X-Admin-Key": ADMIN_KEY, "Content-Type": "application/json"}
DEMO_EMAIL = "demo@empirelords.com"
DEMO_PASSWORD = "Demo12345!"


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
    sid = me["settlements"][0]["settlement_id"]
    return {"headers": h, "settlement_id": sid, "settlement": me["settlements"][0], "player_id": me.get("player", {}).get("player_id"), "me": me}


def _register(s, tag):
    email = f"iter6_{tag}_{uuid.uuid4().hex[:6]}@empirelords.com"
    r = s.post(api("/api/auth/register"), json={"email": email, "password": "Password123!", "display_name": f"Iter6{tag}{uuid.uuid4().hex[:3]}"}, timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    return {"email": email, "headers": {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}}


# =============================== HOUSE / CREST ==================================

class TestHouseCrest:
    def test_house_get_demo(self, s, demo):
        r = s.get(api("/api/worlds/qa_1/house"), headers=demo["headers"], timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "house" in d and "catalog" in d
        cat = d["catalog"]
        for k in ("shield_bases", "symbols", "marks", "borders", "palette"):
            assert k in cat and isinstance(cat[k], list) and cat[k]
        crest = d["house"]["crest"]
        for k in ("shield_base", "primary_symbol", "secondary_mark", "border", "colors"):
            assert k in crest
        for k in ("base", "primary", "secondary", "border"):
            assert k in crest["colors"]

    def test_house_put_valid_updates(self, s, demo):
        # get catalog first
        cat = s.get(api("/api/worlds/qa_1/house"), headers=demo["headers"], timeout=15).json()["catalog"]
        palette = cat["palette"]
        body = {
            "motto": "Per aspera ad astra",
            "crest": {
                "shield_base": cat["shield_bases"][0],
                "primary_symbol": cat["symbols"][0],
                "secondary_mark": cat["marks"][1] if len(cat["marks"]) > 1 else cat["marks"][0],
                "border": cat["borders"][1] if len(cat["borders"]) > 1 else cat["borders"][0],
                "colors": {
                    "base": palette[0],
                    "primary": palette[2],
                    "secondary": palette[3],
                    "border": palette[5],
                },
            },
        }
        r = s.put(api("/api/worlds/qa_1/house"), json=body, headers=demo["headers"], timeout=15)
        assert r.status_code == 200, r.text
        h = r.json()["house"]
        assert h["motto"] == "Per aspera ad astra"
        assert h["crest"]["shield_base"] == body["crest"]["shield_base"]
        assert h["crest"]["primary_symbol"] == body["crest"]["primary_symbol"]
        # colours are normalised to uppercase
        assert h["crest"]["colors"]["base"].upper() == body["crest"]["colors"]["base"].upper()

    def test_house_denormalised_on_chunk(self, s, demo):
        st = demo["settlement"]
        cx, cy = st["x"] // 32, st["y"] // 32
        r = s.get(api(f"/api/worlds/qa_1/map/chunk/{cx}/{cy}"), headers=demo["headers"], timeout=15)
        assert r.status_code == 200
        sts = r.json().get("settlements", [])
        mine = [x for x in sts if x.get("settlement_id") == demo["settlement_id"]]
        assert mine, "own settlement not in chunk"
        mine = mine[0]
        # spec: owner_house_crest for player settlements + skin key (null for demo)
        assert "skin" in mine, f"skin key missing on player settlement: {mine.keys()}"
        assert mine.get("owner_house_crest") is not None, "owner_house_crest missing on own settlement"
        for k in ("shield_base", "primary_symbol", "colors"):
            assert k in mine["owner_house_crest"]

    def test_house_invalid_color(self, s, demo):
        body = {"crest": {
            "shield_base": "heater", "primary_symbol": "circle", "secondary_mark": "none", "border": "none",
            "colors": {"base": "#FF00FF", "primary": "#00FF00", "secondary": "#0000FF", "border": "#FFFFFF"},
        }}
        r = s.put(api("/api/worlds/qa_1/house"), json=body, headers=demo["headers"], timeout=15)
        assert 400 <= r.status_code < 500, f"expected 4xx got {r.status_code}: {r.text}"
        body = r.json()
        assert body.get("code") == "INVALID_CREST", body

    def test_house_invalid_symbol(self, s, demo):
        cat = s.get(api("/api/worlds/qa_1/house"), headers=demo["headers"], timeout=15).json()["catalog"]
        pal = cat["palette"]
        body = {"crest": {
            "shield_base": "heater", "primary_symbol": "unicorn", "secondary_mark": "none", "border": "none",
            "colors": {"base": pal[0], "primary": pal[1], "secondary": pal[2], "border": pal[3]},
        }}
        r = s.put(api("/api/worlds/qa_1/house"), json=body, headers=demo["headers"], timeout=15)
        assert 400 <= r.status_code < 500
        assert r.json().get("code") == "INVALID_CREST"


# =============================== HOSTILE INTEL SCENARIO ==================================

class TestHostileIntel:
    """Two fresh accounts. Attacker launches ATTACK on defender's mother. Advance clock, then
    verify defender's GET /marches -> incoming[] eventually contains a hostile-flagged march
    with private fields redacted."""

    @pytest.fixture(scope="class")
    def duo(self, s):
        # Retry until both accounts have a land path (island placements sometimes prevent this).
        for attempt in range(6):
            atk = _register(s, "atk")
            dfd = _register(s, "dfd")
            for who in (atk, dfd):
                r = s.post(api("/api/worlds/qa_1/join"), json={"house_name": f"Casa{uuid.uuid4().hex[:5]}"}, headers=who["headers"], timeout=30)
                assert r.status_code == 200, r.text
                me = s.get(api("/api/worlds/qa_1/me"), headers=who["headers"], timeout=15).json()
                who["settlement"] = me["settlements"][0]
                who["settlement_id"] = who["settlement"]["settlement_id"]
            # end shields + army so preview succeeds
            grant_base = {"resources": {"grain": 500000, "wood": 500000, "clay": 500000, "iron": 500000, "gold": 50000}, "end_pvp_shield": True}
            s.post(api("/api/qa/grant"), json={**grant_base, "settlement_id": atk["settlement_id"], "army": {"Fanteria": 500}}, headers=ADMIN_HEADERS, timeout=15)
            s.post(api("/api/qa/grant"), json={**grant_base, "settlement_id": dfd["settlement_id"], "army": {"Fanteria": 200}}, headers=ADMIN_HEADERS, timeout=15)
            # test land path
            probe = {"origin_settlement_id": atk["settlement_id"], "target_settlement_id": dfd["settlement_id"], "mission": "ATTACK", "units": {"Fanteria": 1}, "idempotency_key": f"probe-{uuid.uuid4().hex[:6]}"}
            pv = s.post(api("/api/worlds/qa_1/marches/preview"), json=probe, headers=atk["headers"], timeout=15)
            if pv.status_code == 200:
                return {"atk": atk, "dfd": dfd}
        pytest.skip(f"could not find land-connected pair after retries; last preview={pv.status_code} {pv.text}")

    def test_attack_and_intel_flow(self, s, duo):
        atk, dfd = duo["atk"], duo["dfd"]
        # preview
        body = {
            "origin_settlement_id": atk["settlement_id"],
            "target_settlement_id": dfd["settlement_id"],
            "mission": "ATTACK",
            "units": {"Fanteria": 100},
            "idempotency_key": f"iter6-{uuid.uuid4().hex[:6]}",
        }
        pv = s.post(api("/api/worlds/qa_1/marches/preview"), json=body, headers=atk["headers"], timeout=15)
        assert pv.status_code == 200, pv.text
        preview = pv.json()
        eta = preview["eta_seconds"]
        path = preview["path"]
        assert eta > 0 and path
        # launch
        r = s.post(api("/api/worlds/qa_1/marches"), json=body, headers=atk["headers"], timeout=15)
        assert r.status_code == 200, r.text
        m = r.json()["march"]
        march_id = m["march_id"]

        # Compute entry fraction: first path idx within defender radius 3 (Bible §14 inner-ring baseline).
        dx, dy = dfd["settlement"]["x"], dfd["settlement"]["y"]
        entry_idx = next((i for i, p in enumerate(path) if i > 0 and max(abs(p[0] - dx), abs(p[1] - dy)) <= 3), len(path) - 1)
        detect_frac = entry_idx / max(1, len(path) - 1)

        # defender sees own outgoing/incoming, initially incoming may be empty
        dr = s.get(api("/api/worlds/qa_1/marches"), headers=dfd["headers"], timeout=15)
        assert dr.status_code == 200 and dr.json().get("incoming", []) == [], "expected no detection before advance"

        detected = None
        cumulative_advance = 0.0
        # Advance just past detection fraction (small headroom), then keep pushing until arrival - 5s.
        targets = [eta * (detect_frac + 0.005), eta * (detect_frac + 0.015), eta - 30.0, eta - 5.0]
        for target_seconds in targets:
            delta = target_seconds - cumulative_advance
            if delta <= 0:
                continue
            adv = s.post(api("/api/qa/clock/advance"), json={"seconds": delta}, headers=ADMIN_HEADERS, timeout=30)
            assert adv.status_code == 200, adv.text
            cumulative_advance += delta
            s.post(api("/api/qa/scheduler/run"), json={}, headers=ADMIN_HEADERS, timeout=30)
            dr = s.get(api("/api/worlds/qa_1/marches"), headers=dfd["headers"], timeout=15)
            incoming = dr.json().get("incoming", [])
            hostile = [x for x in incoming if x.get("hostile") or x.get("march_id") == march_id]
            if hostile:
                detected = hostile[0]
                break
        assert detected is not None, (
            f"Hostile march never detected in incoming[]; detect_frac={detect_frac:.4f} "
            f"cumulative_advance={cumulative_advance:.1f}s eta={eta:.1f}s last={dr.json().get('incoming')}"
        )
        # Contract: hostile=True, units redacted (empty), origin_settlement_id null, intel present
        assert detected.get("hostile") is True, f"hostile flag missing: {detected}"
        assert not detected.get("units"), f"units must be redacted, got {detected.get('units')}"
        assert detected.get("origin_settlement_id") in (None, "",), f"origin leaked: {detected.get('origin_settlement_id')}"
        intel = detected.get("intel")
        assert intel and isinstance(intel, dict), f"intel missing: {detected}"
        # Truncated path from entry index
        path = detected.get("path")
        if path is not None:
            assert isinstance(path, list), path
        # Intel shape sanity
        for k in ("tier", "heading"):
            assert k in intel, f"intel.{k} missing: {intel}"
        # eta_range may or may not be present depending on tier
        assert "eta_range" in intel  # may be None
        # verify attacker's own view still exposes units & origin (private to himself)
        ar = s.get(api("/api/worlds/qa_1/marches"), headers=atk["headers"], timeout=15).json()
        own = [x for x in ar.get("outgoing", []) + ar.get("marches", []) if x.get("march_id") == march_id]
        if own:
            own = own[0]
            assert own.get("units"), "attacker's own march units should be visible"
