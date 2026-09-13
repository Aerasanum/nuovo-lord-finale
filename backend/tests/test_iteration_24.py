"""Iteration 24 backend regression tests.

Focus:
- Lord (world_2, home stl_aaf827bc3a0340cc): caravans/info + caravans/search shape, radius=50.
- Send an escorted caravan from a Lord village to home; expect 201; second POST → 409 CARAVAN_OUTGOING_MAX.
- Demo (world_2) caravans/search: interception_unlocked True, entries within radius=50, sorted by distance asc.

Runs against the public URL.
"""
from __future__ import annotations

import os
import uuid

import pytest
import requests

pytestmark = pytest.mark.skip(reason="legacy Regno 2 fixture (hard-coded Lord settlement ids) removed — Grande Mondo only since June 2026; caravans covered by test_iteration_34/scripts")

from tests.e2e_base import BASE_URL  # QA backend only
API = f"{BASE_URL}/api"

WORLD_ID = "world_2"
LORD_EMAIL = "lord@empirelords.com"
LORD_PASSWORD = "Lord12345!"
DEMO_EMAIL = "demo@empirelords.com"
DEMO_PASSWORD = "Demo12345!"

LORD_HOME = "stl_aaf827bc3a0340cc"
LORD_VILLAGE_L14 = "stl_0de020b9adfa4fd7"  # 500,533
LORD_VILLAGE_L10 = "stl_20ab7c21e5674eff"  # 480,553


def _login(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def lord_auth() -> dict:
    return {"Authorization": f"Bearer {_login(LORD_EMAIL, LORD_PASSWORD)}"}


@pytest.fixture(scope="module")
def demo_auth() -> dict:
    return {"Authorization": f"Bearer {_login(DEMO_EMAIL, DEMO_PASSWORD)}"}


# ---------------------------------------------------------------------------
# Lord caravans/info + caravans/search
# ---------------------------------------------------------------------------
class TestLordCaravansSearch:
    def test_info_radius_50(self, lord_auth):
        r = requests.get(
            f"{API}/worlds/{WORLD_ID}/settlements/{LORD_HOME}/caravans/info",
            headers=lord_auth,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("search_radius") == 50, f"expected search_radius=50, got {data.get('search_radius')}"

    def test_search_shape(self, lord_auth):
        r = requests.get(
            f"{API}/worlds/{WORLD_ID}/settlements/{LORD_HOME}/caravans/search",
            headers=lord_auth,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("radius") == 50, f"radius = {data.get('radius')}"
        caravans = data.get("caravans", [])
        assert isinstance(caravans, list)
        # If entries exist, check distance is int and sorted asc + target_xy present.
        distances = [c.get("distance") for c in caravans]
        for d in distances:
            assert isinstance(d, int), f"distance not int: {d}"
        assert distances == sorted(distances), f"not sorted asc: {distances}"
        for c in caravans:
            assert "target_xy" in c, f"missing target_xy in {c}"


# ---------------------------------------------------------------------------
# Lord: send escorted caravan; second POST → 409 CARAVAN_OUTGOING_MAX
# ---------------------------------------------------------------------------
class TestLordCaravanEscort:
    def _try_send(self, headers: dict, origin: str) -> requests.Response:
        body = {
            "origin_settlement_id": origin,
            "target_settlement_id": LORD_HOME,
            "cargo": {"grain": 300},
            "caravans_assigned": 1,
            "escort": {"Fanteria": 20},
            "idempotency_key": str(uuid.uuid4()),
        }
        return requests.post(
            f"{API}/worlds/{WORLD_ID}/caravans",
            json=body,
            headers=headers,
            timeout=30,
        )

    def test_send_escorted_caravan_and_then_409(self, lord_auth):
        # Try village L14 first; if 409 CARAVAN_OUTGOING_MAX try village L10.
        used_origin = None
        r = self._try_send(lord_auth, LORD_VILLAGE_L14)
        if r.status_code == 409 and r.json().get("code") == "CARAVAN_OUTGOING_MAX":
            r = self._try_send(lord_auth, LORD_VILLAGE_L10)
            used_origin = LORD_VILLAGE_L10
        else:
            used_origin = LORD_VILLAGE_L14
        assert r.status_code == 201, (
            f"expected 201 escorted caravan from either village; last used={used_origin}; "
            f"status={r.status_code} body={r.text[:400]}"
        )
        data = r.json()
        # Response must contain escort_units/escort/units with Fanteria 20
        escort_containers = []
        for k in ("escort_units", "escort", "units"):
            v = data.get(k)
            if isinstance(v, dict):
                escort_containers.append((k, v))
        assert escort_containers, f"no escort/units field in response: keys={list(data.keys())}"
        fanteria_ok = any(v.get("Fanteria") == 20 for _, v in escort_containers)
        assert fanteria_ok, f"Fanteria 20 not found in escort containers: {escort_containers}"

        # Second POST from same origin must fail with CARAVAN_OUTGOING_MAX
        r2 = self._try_send(lord_auth, used_origin)
        assert r2.status_code == 409, f"expected 409, got {r2.status_code}: {r2.text[:400]}"
        assert r2.json().get("code") == "CARAVAN_OUTGOING_MAX", r2.text


# ---------------------------------------------------------------------------
# Demo caravans/search: interception_unlocked true; entries within 50; sorted asc
# ---------------------------------------------------------------------------
class TestDemoCaravansSearch:
    def test_demo_world2_search(self, demo_auth):
        r = requests.get(f"{API}/worlds/{WORLD_ID}/me", headers=demo_auth, timeout=30)
        assert r.status_code == 200, r.text
        stls = r.json().get("settlements", [])
        assert stls, "demo has no settlements in world_2"
        sid = stls[0]["settlement_id"]

        # info
        r0 = requests.get(
            f"{API}/worlds/{WORLD_ID}/settlements/{sid}/caravans/info",
            headers=demo_auth,
            timeout=30,
        )
        assert r0.status_code == 200, r0.text
        assert r0.json().get("search_radius") == 50

        # search
        r1 = requests.get(
            f"{API}/worlds/{WORLD_ID}/settlements/{sid}/caravans/search",
            headers=demo_auth,
            timeout=30,
        )
        assert r1.status_code == 200, r1.text
        data = r1.json()
        assert data.get("radius") == 50
        assert data.get("interception_unlocked") is True, (
            f"interception_unlocked = {data.get('interception_unlocked')}"
        )
        caravans = data.get("caravans", [])
        assert isinstance(caravans, list)
        distances = [c["distance"] for c in caravans]
        assert distances == sorted(distances), f"not sorted asc: {distances}"
        for c in caravans:
            assert c["distance"] <= 50, f"distance > 50: {c}"
        # Expect Casa Lord convoys visible (world_2 has Lord + Demo neighbours).
        # Non-strict — only assert if any caravans exist.
        if caravans:
            owners = {c.get("owner_house") or c.get("house_name") for c in caravans}
            assert any(("Lord" in (o or "")) for o in owners), (
                f"expected at least one Casa Lord convoy; got owners={owners}"
            )
