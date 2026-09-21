"""Iteration 17 backend E2E — Intro cinematic (player.intro_seen + POST /intro/seen) and March skins
(GET/PUT house.march_skin, unlocks, catalog.march_skins, marches update)."""
from __future__ import annotations

import uuid

import pytest
import requests

from tests.e2e_base import ADMIN_HEADERS, API as BASE, DEMO_EMAIL, DEMO_PASSWORD, track_player  # QA backend only


def _login(email: str, password: str) -> str:
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} → {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def demo_headers() -> dict:
    return {"Authorization": f"Bearer {_login(DEMO_EMAIL, DEMO_PASSWORD)}"}


@pytest.fixture(scope="module")
def rookie() -> dict:
    """A Player with no Prestige yet: march-skin locks are asserted against a known state, not against how much
    Prestige the shared demo fixture happens to have accumulated over previous suite runs."""
    tag = uuid.uuid4().hex[:8]
    r = requests.post(f"{BASE}/auth/register", json={"email": f"qa-skin17-{tag}@example.com", "password": "Qa12345!x", "display_name": f"QA {tag}"}, timeout=30)
    assert r.status_code in (200, 201), r.text
    h = {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}
    assert requests.post(f"{BASE}/worlds/qa_1/join", json={"house_name": f"Casa Skin17 {tag}"}, headers=h, timeout=60).status_code in (200, 201)
    me = requests.get(f"{BASE}/worlds/qa_1/me", headers=h, timeout=30).json()
    return {"h": h, "player_id": track_player(me["player"]["player_id"])}


def _award_prestige(player_id: str, points: int) -> None:
    r = requests.post(f"{BASE}/qa/prestige", json={"player_id": player_id, "points": points}, headers=ADMIN_HEADERS, timeout=30)
    assert r.status_code == 200, r.text


@pytest.fixture(scope="module")
def ally_headers() -> dict:
    return {"Authorization": f"Bearer {_login('ally@empirelords.com', 'Ally12345!')}"}


# --- House / march skins --------------------------------------------------

class TestMarchSkins:
    def test_get_house_reveals_skin_and_unlocks(self, rookie):
        r = requests.get(f"{BASE}/worlds/qa_1/house", headers=rookie["h"], timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "march_skin" in body["house"], body
        unlocks = body.get("march_skin_unlocks")
        assert isinstance(unlocks, dict), body
        assert unlocks == {"classic": True, "dragon": False, "elephant": False, "falcon": False}, body
        # catalog
        catalog = body.get("catalog") or {}
        skins = catalog.get("march_skins")
        assert isinstance(skins, list) and len(skins) == 4, catalog
        keys = {s["key"] for s in skins}
        assert keys == {"classic", "dragon", "elephant", "falcon"}
        for s in skins:
            assert "requires_unit" in s

    def test_put_falcon_ok(self, rookie):
        _award_prestige(rookie["player_id"], 500)  # falcon threshold
        r = requests.put(f"{BASE}/worlds/qa_1/house", headers=rookie["h"], json={"march_skin": "falcon"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["house"]["march_skin"] == "falcon"

    def test_put_elephant_locked(self, rookie):
        """500 Prestige from the previous test is below the elephant threshold (2000)."""
        r = requests.put(f"{BASE}/worlds/qa_1/house", headers=rookie["h"], json={"march_skin": "elephant"}, timeout=15)
        assert r.status_code == 409, r.text
        assert r.json().get("code") == "MARCH_SKIN_LOCKED"

    def test_put_invalid_skin(self, rookie):
        r = requests.put(f"{BASE}/worlds/qa_1/house", headers=rookie["h"], json={"march_skin": "unicorn"}, timeout=15)
        assert r.status_code == 400, r.text
        assert r.json().get("code") == "INVALID_MARCH_SKIN"

    def test_put_dragon_and_marches_reflect(self, demo_headers):
        r = requests.put(f"{BASE}/worlds/qa_1/house", headers=demo_headers, json={"march_skin": "dragon"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["house"]["march_skin"] == "dragon"
        # GET house verifies persistence
        r2 = requests.get(f"{BASE}/worlds/qa_1/house", headers=demo_headers, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["house"]["march_skin"] == "dragon"
        # Marches map: check own marches skin field
        r3 = requests.get(f"{BASE}/worlds/qa_1/map/marches", headers=demo_headers, timeout=15)
        assert r3.status_code == 200, r3.text
        payload = r3.json()
        marches = payload.get("marches") if isinstance(payload, dict) else payload
        own = [m for m in marches if m.get("is_own") or m.get("mine") or m.get("own")]
        # Some deployments return all — filter by house_name if flag missing
        if not own:
            own = [m for m in marches if m.get("house_name") == r2.json()["house"]["house_name"]]
        if own:
            for m in own:
                assert m.get("skin") == "dragon", m
        else:
            # No in-flight marches; the PUT still writes the field to future marches — accepted
            pytest.skip("No own in-flight marches to verify skin propagation")


# --- Intro seen (ally to avoid touching demo's flag before frontend test) --

class TestIntroSeen:
    def test_ally_intro_flag_is_boolean_and_toggleable(self, ally_headers):
        r = requests.get(f"{BASE}/worlds/qa_1/me", headers=ally_headers, timeout=15)
        assert r.status_code == 200, r.text
        player = r.json().get("player") or r.json()
        intro_seen = player.get("intro_seen")
        assert isinstance(intro_seen, bool), player
        # POST /intro/seen
        r2 = requests.post(f"{BASE}/worlds/qa_1/intro/seen", headers=ally_headers, timeout=15)
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert body.get("intro_seen") is True, body
        # GET me again should be True
        r3 = requests.get(f"{BASE}/worlds/qa_1/me", headers=ally_headers, timeout=15)
        assert r3.status_code == 200
        p3 = r3.json().get("player") or r3.json()
        assert p3.get("intro_seen") is True
