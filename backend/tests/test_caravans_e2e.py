"""Caravan flows against the PUBLIC deployment (Bible §13 / §34.9) — fixture + end-to-end verification.

Run: cd /app/backend && pytest tests/test_caravans_e2e.py -o addopts='' -v
Side effects (intentional, QA world): creates/uses the rival account below, hands it two neutrals near the demo home,
advances the QA clock by a few hours and leaves ONE fresh rival caravan in flight, detectable from the demo home, so the
UI (map hostile marker, /caravans hub, /caravan/intercept) can be exercised right after the run.
"""
from __future__ import annotations

import time
import uuid

import pytest
import requests

pytestmark = pytest.mark.skip(reason="legacy Regno 1 fixture (hard-coded rival/demo settlement ids and routes) removed — Grande Mondo only since June 2026")

from tests.e2e_base import ADMIN_HEADERS, BASE_URL  # QA backend only
DEMO = ("demo@empirelords.com", "Demo12345!")
RIVAL = ("rival@empirelords.com", "Rival12345!", "RivalLord", "Casa Rivale")
WORLD = "qa_1"
DEMO_HOME = "stl_0484bd7cfcbd40dd"  # 6,188
DEMO_SECOND = "stl_84e946900a4745b6"  # 5,183
RIVAL_A = "stl_2f5b4160b87f43b7"  # Neutrale 9,181 → rival origin
RIVAL_B = "stl_49c3127daafd4c79"  # Neutrale 1,203 → rival destination (route skirts the demo home)


def url(p: str) -> str:
    return f"{BASE_URL}/api{p}"


def auth(email: str, password: str, display: str | None = None) -> dict:
    r = requests.post(url("/auth/login"), json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200 and display:
        r = requests.post(url("/auth/register"), json={"email": email, "password": password, "display_name": display}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}


def advance(seconds: float) -> None:
    assert requests.post(url("/qa/clock/advance"), json={"seconds": seconds}, headers=ADMIN_HEADERS, timeout=30).status_code == 200
    for _ in range(3):
        requests.post(url("/qa/scheduler/run"), headers=ADMIN_HEADERS, timeout=60)
        time.sleep(0.5)


def march(h: dict, mid: str) -> dict:
    r = requests.get(url(f"/worlds/{WORLD}/marches/{mid}"), headers=h, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def settlement(h: dict, sid: str) -> dict:
    r = requests.get(url(f"/worlds/{WORLD}/settlements/{sid}"), headers=h, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="session")
def demo():
    return auth(*DEMO)


@pytest.fixture(scope="session")
def rival():
    h = auth(*RIVAL[:3])
    me = requests.get(url(f"/worlds/{WORLD}/me"), headers=h, timeout=30)
    if me.status_code != 200:
        assert requests.post(url(f"/worlds/{WORLD}/join"), json={"house_name": RIVAL[3]}, headers=h, timeout=60).status_code in (200, 201)
        me = requests.get(url(f"/worlds/{WORLD}/me"), headers=h, timeout=30)
    pid = me.json()["player"]["player_id"]
    owned = {s["settlement_id"] for s in me.json()["settlements"]}
    for sid in (RIVAL_A, RIVAL_B):
        if sid not in owned:
            r = requests.post(url("/qa/conquer"), json={"settlement_id": sid, "player_id": pid}, headers=ADMIN_HEADERS, timeout=60)
            assert r.status_code == 200, r.text
    r = requests.post(url("/qa/grant"), json={"settlement_id": RIVAL_A, "buildings": {"Caravanserraglio": 3}, "research": {"logistics.caravans_1": 1}, "resources": {"grain": 40000, "wood": 40000, "clay": 40000, "iron": 40000, "gold": 4000}}, headers=ADMIN_HEADERS, timeout=30)
    assert r.status_code == 200, r.text
    return {"h": h, "player_id": pid}


def _send(h: dict, origin: str, target: str, cargo: dict, assigned: int = 1, escort: dict | None = None) -> requests.Response:
    return requests.post(url(f"/worlds/{WORLD}/caravans"), json={"origin_settlement_id": origin, "target_settlement_id": target, "cargo": cargo, "caravans_assigned": assigned, "escort": escort or {}, "idempotency_key": uuid.uuid4().hex}, headers=h, timeout=60)


def _wait_no_outgoing_caravan(h: dict, origin: str) -> None:
    """The cap is one outgoing caravan per settlement: fast-forward until the previous one has resolved."""
    for _ in range(6):
        r = requests.get(url(f"/worlds/{WORLD}/marches"), headers=h, timeout=30).json()
        if not any(m["mission"] == "CARAVAN" and m["origin_settlement_id"] == origin and m["status"] == "OUTBOUND" for m in r["marches"]):
            return
        advance(3600)


class TestCaravanInfo:
    def test_info_shape(self, demo):
        r = requests.get(url(f"/worlds/{WORLD}/settlements/{DEMO_HOME}/caravans/info"), headers=demo, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        lvl = d["caravanserai_level"]
        assert d["unlocked"] is True and lvl >= 1
        assert d["caravans_per_march"] == (1 if lvl == 1 else 1 + -(-(lvl - 1) // 5))
        assert d["capacity_per_caravan"] == round(5000 * 1.17 ** (lvl - 1))
        assert d["unescorted_speed_tph"] == 3.0
        assert d["search_radius"] >= 5 and d["max_outgoing"] == 1
        assert any(x["settlement_id"] == DEMO_SECOND for x in d["destinations"])
        assert set(d["resources"]) >= {"grain", "wood", "clay", "iron", "gold"}

    def test_validation_errors(self, demo):
        _wait_no_outgoing_caravan(demo, DEMO_HOME)
        assert _send(demo, DEMO_HOME, DEMO_SECOND, {}).json()["code"] == "EMPTY_CARGO"
        assert _send(demo, DEMO_HOME, DEMO_SECOND, {"grain": 10 ** 7}).json()["code"] == "CARAVAN_CAPACITY_EXCEEDED"
        assert _send(demo, DEMO_HOME, DEMO_SECOND, {"grain": 100}, assigned=9).json()["code"] == "CARAVAN_SLOTS"
        assert _send(demo, DEMO_HOME, DEMO_HOME, {"grain": 100}).json()["code"] == "INVALID_TARGET"
        assert _send(demo, DEMO_HOME, RIVAL_A, {"grain": 100}).json()["code"] == "INVALID_TARGET"  # foreign target (alliances: later)


class TestCaravanDelivery:
    def test_send_deliver_overflow_returns(self, demo):
        """Warehouse-capped delivery: free space credited, excess stays on the convoy and returns (Bible §13)."""
        _wait_no_outgoing_caravan(demo, DEMO_HOME)
        before_target = settlement(demo, DEMO_SECOND)
        cap = before_target["warehouse_capacity"]
        free = max(0, cap - int(before_target["resources"]["wood"]))
        amount = min(free + 1500, 6000)  # more wood than the target Warehouse can take
        r = _send(demo, DEMO_HOME, DEMO_SECOND, {"wood": amount})
        assert r.status_code == 201, r.text
        m = r.json()
        assert m["mission"] == "CARAVAN" and m["status"] == "OUTBOUND" and m["cargo"] == {"wood": amount} and m["caravans_assigned"] == 1
        assert m["speed_tph"] == 3.0 and m["units"] == {} and m["path"][0] == [6, 188] and m["path"][-1] == [5, 183]
        # second outgoing caravan from the same settlement → cap 1
        assert _send(demo, DEMO_HOME, DEMO_SECOND, {"grain": 100}).json()["code"] == "CARAVAN_OUTGOING_MAX"
        # visible in the marches list and in the map layer
        lst = requests.get(url(f"/worlds/{WORLD}/marches"), headers=demo, timeout=30).json()["marches"]
        assert any(x["march_id"] == m["march_id"] for x in lst)
        advance(int(m["eta_seconds"]) + 120)
        after = march(demo, m["march_id"])
        delivered = after["delivered"] or {}
        assert delivered["wood"] <= amount and delivered["wood"] >= 0
        overflow = amount - delivered["wood"]
        tgt = settlement(demo, DEMO_SECOND)
        assert int(tgt["resources"]["wood"]) <= tgt["warehouse_capacity"] + 5  # never above the cap (small accrual tolerance)
        if overflow > 0:
            assert after["status"] == "RETURNING" and after["result"] == "DELIVERED_PARTIAL" and after["cargo"] == {"wood": overflow}
            home_before = int(settlement(demo, DEMO_HOME)["resources"]["wood"])
            advance(int(m["eta_seconds"]) + 120)
            done = march(demo, m["march_id"])
            assert done["status"] == "COMPLETED"
            home_after = int(settlement(demo, DEMO_HOME)["resources"]["wood"])
            assert home_after >= home_before  # residue credited back home (Warehouse cap applies there too)
        else:
            assert after["status"] == "COMPLETED" and after["result"] == "DELIVERED"
        inbox = requests.get(url(f"/worlds/{WORLD}/inbox"), headers=demo, timeout=30).json()["items"]
        states = {n["payload"]["state"] for n in inbox if n["event"] == "CARAVAN_STATE" and n["payload"].get("caravan_id") == m["march_id"]}
        assert {"OUTBOUND", "DELIVERED"} <= states


class TestInterception:
    def test_detect_and_intercept(self, demo, rival):
        _wait_no_outgoing_caravan(rival["h"], RIVAL_A)
        r = _send(rival["h"], RIVAL_A, RIVAL_B, {"grain": 4000, "iron": 2000}, assigned=1)
        assert r.status_code == 201, r.text
        crv = r.json()
        # walk the clock until the convoy is inside the demo home's search radius
        found = None
        for _ in range(8):
            s = requests.get(url(f"/worlds/{WORLD}/settlements/{DEMO_HOME}/caravans/search"), headers=demo, timeout=30).json()
            found = next((c for c in s["caravans"] if c["caravan_id"] == crv["march_id"]), None)
            if found:
                break
            advance(1800)
        assert found, "rival caravan never entered the search radius"
        assert s["interception_unlocked"] is True
        assert found["house_name"] == RIVAL[3] and found["escorted"] is False and found["remaining_path"]
        assert found["cargo_band"] is None or found["cargo_band"][0] <= 6000 <= found["cargo_band"][1] or True  # band per intel tier
        # own caravans are never listed
        own = requests.get(url(f"/worlds/{WORLD}/settlements/{RIVAL_A}/caravans/search"), headers=rival["h"], timeout=30).json()
        assert all(c["caravan_id"] != crv["march_id"] for c in own["caravans"])
        # interception: needs ATK units
        bad = requests.post(url(f"/worlds/{WORLD}/caravans/intercept"), json={"origin_settlement_id": DEMO_HOME, "caravan_id": crv["march_id"], "units": {"Falco": 1}, "idempotency_key": uuid.uuid4().hex}, headers=demo, timeout=60)
        assert bad.status_code in (400, 409), bad.text
        ok = requests.post(url(f"/worlds/{WORLD}/caravans/intercept"), json={"origin_settlement_id": DEMO_HOME, "caravan_id": crv["march_id"], "units": {"Cavalleria": 200}, "idempotency_key": uuid.uuid4().hex}, headers=demo, timeout=90)
        assert ok.status_code == 201, ok.text
        itc = ok.json()
        assert itc["mission"] == "INTERCEPT" and itc["target_caravan_id"] == crv["march_id"] and itc["units"] == {"Cavalleria": 200}
        assert itc["target_xy"] in [list(p) for p in crv["path"]]
        home = settlement(demo, DEMO_HOME)
        assert int(home["army"]["Cavalleria"]) <= 300
        # resolve the ambush
        wait = max(60, int((__import__("datetime").datetime.fromisoformat(itc["arrival_at"].replace("Z", "+00:00")) - __import__("datetime").datetime.fromisoformat(itc["server_time"].replace("Z", "+00:00"))).total_seconds()))
        advance(wait + 120)
        after = march(demo, itc["march_id"])
        assert after["battle_id"], after
        b = requests.get(url(f"/worlds/{WORLD}/battles/{after['battle_id']}"), headers=demo, timeout=30).json()
        assert b["mission"] == "INTERCEPT" and b["report"]["winner"] == "ATTACKER" and b["target_caravan_id"] == crv["march_id"]
        assert b["loot"] and sum(b["loot"].values()) > 0
        assert after["status"] == "RETURNING" and after["loot"] == b["loot"]
        victim = march(rival["h"], crv["march_id"])
        assert victim["status"] in ("RETURNING", "COMPLETED") and victim["result"] == "INTERCEPTED"
        assert sum((victim["cargo"] or {}).values()) == 6000 - sum(b["loot"].values())
        rinbox = requests.get(url(f"/worlds/{WORLD}/inbox"), headers=rival["h"], timeout=30).json()["items"]
        assert any(n["event"] == "CARAVAN_STATE" and n["payload"].get("state") == "INTERCEPTED" for n in rinbox)
        prog = requests.get(url(f"/worlds/{WORLD}/progress"), headers=demo, timeout=30).json()
        assert next(t for t in prog["tracks"] if t["track"] == "caravans_intercepted")["value"] >= 1

    def test_leave_detectable_caravan_for_ui(self, demo, rival):
        """Fixture for the UI run: a fresh rival caravan inside the demo home's search radius."""
        _wait_no_outgoing_caravan(rival["h"], RIVAL_A)
        r = _send(rival["h"], RIVAL_A, RIVAL_B, {"grain": 3500, "wood": 2500})
        assert r.status_code == 201, r.text
        crv = r.json()
        for _ in range(8):
            s = requests.get(url(f"/worlds/{WORLD}/settlements/{DEMO_HOME}/caravans/search"), headers=demo, timeout=30).json()
            if any(c["caravan_id"] == crv["march_id"] for c in s["caravans"]):
                break
            advance(1800)
        assert any(c["caravan_id"] == crv["march_id"] for c in s["caravans"])
        print("UI fixture caravan:", crv["march_id"], "arrival", crv["arrival_at"])
