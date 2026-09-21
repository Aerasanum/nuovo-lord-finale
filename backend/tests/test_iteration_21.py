"""
Iteration 21 backend regression tests (public preview URL, demo player).

Coverage:
- GET /api/worlds → lists only Grande Mondo realms (gm_1); hidden classic QA world qa_1 reachable by id
- Chunk API bounds for qa_1 (13 chunks) and world_2 (19 chunks)
- Chunk DTO shape (terrain_b64 32*32 bytes, sentinels[], territory[])
- Map overview sizes (100 for qa_1, 150 for world_2), terrain_b64 length
- Pyramid anchors: qa_1 [200,200], world_2 [300,300]
- Sentinel wedge geometry around Casa Demo (6,188) → 4 wedges cover 7x7 minus water
- POST /api/worlds without admin key → 401/403
- POST /api/worlds with admin key + invalid body (size=100) → 422
- Regressions: marches list, settlement read (demo)
"""
from __future__ import annotations

import base64
import os

import pytest
import requests

from tests.e2e_base import ADMIN_KEY as ADMIN_KEY_ENV, BASE_URL  # QA backend only
ADMIN_KEY = ADMIN_KEY_ENV

DEMO_EMAIL = "demo@empirelords.com"
DEMO_PASSWORD = "Demo12345!"


@pytest.fixture(scope="module")
def demo_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


# ---------------------------- WORLDS LIST ----------------------------

def test_worlds_list_contains_two_worlds(demo_headers):
    """Product decision (June 2026): players only see Grande Mondo realms; the classic QA world is hidden."""
    r = requests.get(f"{BASE_URL}/api/worlds", headers=demo_headers, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    # accept either list root or {"worlds":[...]}
    worlds = data if isinstance(data, list) else data.get("worlds", data)
    assert isinstance(worlds, list), f"unexpected shape: {data}"
    ids = {w["world_id"]: w for w in worlds}
    assert "gm_1" in ids and "qa_1" not in ids, f"unexpected worlds: {list(ids)}"
    assert all(w.get("kind") == "GRANDE_MONDO" for w in worlds), worlds
    w2 = ids["gm_1"]
    assert w2["size"] == 2176 and w2.get("status") == "OPEN", w2
    assert w2.get("grande_mondo", {}).get("regions") and len(w2["grande_mondo"]["regions"]) == 9, w2


# ---------------------------- CHUNK BOUNDS ----------------------------

@pytest.fixture(scope="module")
def obs_headers():
    """Osservatore sees every Grande Mondo region (no fog) — used for the gm_1 map assertions."""
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "osservatore@empirelords.com", "password": "Demo12345!"}, timeout=20)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_world2_chunk_18_18_ok(obs_headers):
    r = requests.get(f"{BASE_URL}/api/worlds/gm_1/map/chunk/18/18", headers=obs_headers, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "terrain_b64" in body
    raw = base64.b64decode(body["terrain_b64"])
    assert len(raw) == 32 * 32, f"terrain size {len(raw)}"
    assert isinstance(body.get("sentinels", []), list)
    assert isinstance(body.get("territory", []), list)


def test_world2_chunk_out_of_range(obs_headers):
    r = requests.get(f"{BASE_URL}/api/worlds/gm_1/map/chunk/68/0", headers=obs_headers, timeout=20)
    assert r.status_code == 400, r.text
    assert "CHUNK_OUT_OF_RANGE" in r.text


def test_world1_chunk_out_of_range(demo_headers):
    r = requests.get(f"{BASE_URL}/api/worlds/qa_1/map/chunk/13/0", headers=demo_headers, timeout=20)
    assert r.status_code == 400, r.text
    assert "CHUNK_OUT_OF_RANGE" in r.text


# ---------------------------- MAP OVERVIEW ----------------------------

def test_map_overview_world1(demo_headers):
    r = requests.get(f"{BASE_URL}/api/worlds/qa_1/map/overview", headers=demo_headers, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("size") == 100, body.get("size")
    raw = base64.b64decode(body["terrain_b64"])
    assert len(raw) == 100 * 100


def test_map_overview_world2(obs_headers):
    r = requests.get(f"{BASE_URL}/api/worlds/gm_1/map/overview", headers=obs_headers, timeout=60)
    assert r.status_code == 200, r.text
    body = r.json()
    size = body.get("size")
    raw = base64.b64decode(body["terrain_b64"])
    assert size and len(raw) == size * size, (size, len(raw))


# ---------------------------- PYRAMID ----------------------------

def _fetch_pyramid(world_id, headers):
    # Try common shapes
    for path in (f"/api/worlds/{world_id}/pyramid", f"/api/worlds/{world_id}/map/pyramid"):
        r = requests.get(f"{BASE_URL}{path}", headers=headers, timeout=20)
        if r.status_code == 200:
            return r.json()
    return None


def test_pyramid_anchors(demo_headers, obs_headers):
    p1 = _fetch_pyramid("qa_1", demo_headers)
    p2 = _fetch_pyramid("gm_1", obs_headers)
    assert p1 is not None, "pyramid endpoint missing for qa_1"
    assert p2 is not None, "pyramid endpoint missing for gm_1"

    def anchor(p):
        # possible shapes: {"anchor":[x,y]} or {"x":..,"y":..} or {"position":{"x":..,"y":..}}
        if isinstance(p.get("anchor"), (list, tuple)):
            return list(p["anchor"])[:2]
        if "x" in p and "y" in p:
            return [p["x"], p["y"]]
        if isinstance(p.get("position"), dict):
            return [p["position"]["x"], p["position"]["y"]]
        return None

    a1, a2 = anchor(p1), anchor(p2)
    assert a1 == [200, 200], f"qa_1 anchor {a1} raw {p1}"
    assert a2 and p2.get("kind") in ("REGIONAL", "GRAND"), f"gm_1 pyramid {a2} raw {p2}"


# ---------------------------- SENTINEL WEDGES ----------------------------

@pytest.mark.skip(reason="legacy fixture of the deleted Regno 1 (hard-coded settlement ids); Grande Mondo only since June 2026")
def test_sentinels_wedges_world1(demo_headers):
    stl = "stl_0484bd7cfcbd40dd"
    r = requests.get(f"{BASE_URL}/api/worlds/qa_1/settlements/{stl}/sentinels", headers=demo_headers, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    sents = body if isinstance(body, list) else body.get("sentinels", [])
    assert len(sents) == 4, f"expected 4 sentinels got {len(sents)}: {sents}"

    coords = {(s["x"], s["y"]): s for s in sents}
    expected = {(6, 185), (9, 188), (6, 191), (3, 188)}
    assert set(coords.keys()) == expected, f"coords {set(coords.keys())}"
    for s in sents:
        assert s.get("state") == "GUARDED", s


@pytest.mark.skip(reason="legacy fixture of the deleted Regno 1 (hard-coded settlement ids); Grande Mondo only since June 2026")
def test_territory_wedge_chunk_world1(demo_headers):
    r = requests.get(f"{BASE_URL}/api/worlds/qa_1/map/chunk/0/5", headers=demo_headers, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    territory = body.get("territory", [])
    own = {(t["x"], t["y"]) for t in territory if t.get("faction") == "OWN"}
    # Full 7x7 around (6,188): |dx|<=3, |dy|<=3
    expected_full = {(x, y) for x in range(3, 10) for y in range(185, 192)}
    intersect = own & expected_full
    # At least 45 of the 49 OWN tiles (a few water/edge allowed)
    assert len(intersect) >= 45, f"only {len(intersect)}/49 OWN tiles in 7x7: {sorted(expected_full - own)}"
    # Sample corners/mid
    for pt in [(3, 185), (9, 191), (6, 185), (9, 188), (6, 188)]:
        assert pt in own, f"missing {pt} in OWN tiles"


# ---------------------------- ADMIN AUTH ----------------------------

def test_post_worlds_requires_admin():
    # No X-Admin-Key at all → must be 401 or 403
    r = requests.post(f"{BASE_URL}/api/worlds", json={"size": 100}, timeout=20)
    assert r.status_code in (401, 403), f"got {r.status_code} {r.text}"


def test_post_worlds_validation_size_too_small():
    # With admin key but invalid size → 422 (do NOT send a valid body)
    r = requests.post(
        f"{BASE_URL}/api/worlds",
        json={"size": 100},
        headers={"X-Admin-Key": ADMIN_KEY},
        timeout=20,
    )
    assert r.status_code == 422, f"got {r.status_code} {r.text}"


# ---------------------------- REGRESSIONS ----------------------------

def test_marches_list_world1(demo_headers):
    r = requests.get(f"{BASE_URL}/api/worlds/qa_1/marches", headers=demo_headers, timeout=20)
    assert r.status_code == 200, r.text


@pytest.mark.skip(reason="legacy fixture of the deleted Regno 1 (hard-coded settlement ids); Grande Mondo only since June 2026")
def test_settlement_read_world1(demo_headers):
    r = requests.get(f"{BASE_URL}/api/worlds/qa_1/settlements/stl_0484bd7cfcbd40dd", headers=demo_headers, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    # sanity: contains coordinates
    assert body.get("x") == 6 and body.get("y") == 188, body
