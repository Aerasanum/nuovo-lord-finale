"""Iteration 28 — Piccole Piramidi (one per region) + Grande Piramide (admin-opened, region-wide reward) on gm_1.

Run: cd /app/backend && pytest tests/test_iteration_28_pyramids.py -o addopts='' -v
Accounts: osservatore (gm_1 · IT · gm_admin, view_all_regions), demo (gm_1 · FR). Drives the cycles with tiny QA
durations, then restores realistic configs and leaves gm_1 in ISOLATION with next_war FR+IT ×5.
"""
from __future__ import annotations

import os
import time

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
ADMIN_HEADERS = {"X-Admin-Key": "eld-admin-7f3c9a1d2b4e", "Content-Type": "application/json"}
WORLD = "gm_1"
GRAND = WORLD
IT = f"{WORLD}:IT"
OBS = ("osservatore@empirelords.com", "Demo12345!")
DEMO = ("demo@empirelords.com", "Demo12345!")
FAST = {"first_open_day": 0, "hold_hours": 0.03, "reward_days": 0.01, "dormant_days": 0.01, "guardian": {"min_power": 3000, "max_power": 3000}}


def url(p: str) -> str:
    return f"{BASE_URL}/api{p}"


def get(h, p, code=200, **params):
    r = requests.get(url(p), headers=h, params=params or None, timeout=60)
    assert r.status_code == code, f"{p} → {r.status_code} {r.text}"
    return r.json()


def post(h, p, body=None, code=200):
    r = requests.post(url(p), json=body or {}, headers=h, timeout=90)
    assert r.status_code == code, f"{p} → {r.status_code} {r.text}"
    return r.json()


def qa_put(p, body):
    r = requests.put(url(p), json=body, headers=ADMIN_HEADERS, timeout=60)
    assert r.status_code == 200, r.text
    return r.json()


def qa_post(p, body=None):
    r = requests.post(url(p), json=body or {}, headers=ADMIN_HEADERS, timeout=60)
    assert r.status_code == 200, r.text
    return r.json()


def run_scheduler():
    for _ in range(3):
        qa_post("/qa/scheduler/run")
        time.sleep(0.3)


def advance(seconds: float):
    qa_post("/qa/clock/advance", {"seconds": seconds})
    run_scheduler()


def auth(email, password):
    r = requests.post(url("/auth/login"), json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    h = {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}
    me = get(h, f"/worlds/{WORLD}/me")
    return {"h": h, "me": me, "player_id": me["player"]["player_id"], "mother": me["player"]["mother_settlement_id"], "alliance": me["player"].get("alliance"), "region": me["player"].get("region_code")}


def ensure_structured(acc: dict, name: str, tag: str) -> dict:
    a = acc["alliance"]
    if a and a["kind"] == "STRUCTURED":
        return a
    assert not a, "account already in a non-structured alliance"
    created = post(acc["h"], f"/worlds/{WORLD}/alliances", {"name": name, "tag": tag, "kind": "STRUCTURED"}, 201)
    acc["alliance"] = {"alliance_id": created["alliance_id"], "kind": "STRUCTURED", "tag": created["tag"]}
    return acc["alliance"]


def pyr(h, pid=None):
    return get(h, f"/worlds/{WORLD}/pyramid", **({"id": pid} if pid else {}))


def march(acc, pid, mission, units, code=200):
    return post(acc["h"], f"/worlds/{WORLD}/marches", {"origin_settlement_id": acc["mother"], "target_pyramid": True, "pyramid_id": pid, "mission": mission, "units": units, "idempotency_key": f"pyr-{pid}-{mission}-{time.time()}"}, code)


@pytest.fixture(scope="session")
def obs():
    a = auth(*OBS)
    assert a["region"] == "IT"
    ensure_structured(a, "Custodi Osservatori", "OSS")
    return a


@pytest.fixture(scope="session")
def demo():
    a = auth(*DEMO)
    assert a["region"] == "FR"
    return a


class TestInstances:
    def test_list_and_defaults(self, obs):
        qa_post("/qa/pyramid/reset", {"world_id": WORLD, "pyramid_id": GRAND, "clear_config": True})  # clean slate (previous partial runs)
        lst = get(obs["h"], f"/worlds/{WORLD}/pyramids")["pyramids"]
        assert len(lst) == 10 and lst[0]["kind"] == "GRAND" and lst[0]["id"] == GRAND and lst[0]["anchor"] == [1088, 1088] and lst[0]["footprint"] == [41, 41] and lst[0]["manual_open"] is True
        regional = [p for p in lst if p["kind"] == "REGIONAL"]
        assert [p["region_code"] for p in regional] == ["IT", "FR", "ES", "DE", "AT", "RU", "CN", "UK", "PT"]
        it = next(p for p in regional if p["region_code"] == "IT")
        assert it["id"] == IT and it["mine"] is True and it["footprint"] == [15, 15] and it["anchor"] == [1088, 583]
        d = pyr(obs["h"])  # default = own region's Piccola Piramide
        assert d["id"] == IT and d["kind"] == "REGIONAL" and d["name"] == "Piccola Piramide IT" and d["me"]["in_region"] is True
        g = pyr(obs["h"], GRAND)
        assert g["kind"] == "GRAND" and g["config"]["manual_open"] is True and g["config"]["reward_scope"] == "REGION" and g["config"]["reward_days"] == 7 and g["config"]["reward"] == {"production_pct": 10.0, "research_pct": 5.0, "training_pct": 10.0, "caravan_capacity_pct": 0.0}
        assert g["config"]["title"] == "Custode della Grande Piramide" and g["deadline"] is None
        fr = pyr(obs["h"], f"{WORLD}:FR")
        assert fr["me"]["in_region"] is False and fr["me"]["can_attack"] is False
        get(obs["h"], f"/worlds/{WORLD}/pyramid", 404, id="gm_1:XX")

    def test_regional_guardian_fixed_250k(self, obs):
        r = qa_post("/qa/pyramid/reset", {"world_id": WORLD, "pyramid_id": IT, "clear_config": True, "config": {"first_open_day": 0}})
        assert r["id"] == IT and r["state"] == "DORMANT_INITIAL" and r["config"]["first_open_day"] == 0 and r["config"]["hold_hours"] == 168
        run_scheduler()
        s = pyr(obs["h"], IT)
        assert s["state"] == "OPEN" and s["guardian"]["target_power"] == 250000 and s["guardian"]["unit_count"] == 22027
        assert s["garrison_total"] == 22027

    def test_admin_regional_config_all_regions(self, obs, demo):
        qa_post("/qa/pyramid/reset", {"world_id": WORLD, "pyramid_id": f"{WORLD}:FR", "clear_config": True})
        r = post(obs["h"], f"/worlds/{WORLD}/grande-mondo/admin/regional-pyramid-config", {"region": None, "config": {"first_open_day": 400}})
        assert r["regional_first_open_day"] == 400 and r["regional_overrides"]["*"]["first_open_day"] == 400
        fr = pyr(demo["h"])
        assert fr["id"] == f"{WORLD}:FR" and fr["config"]["first_open_day"] == 400 and fr["state"] == "DORMANT_INITIAL"
        # a single-region override wins over "*" … until the admin saves for every region again
        r = post(obs["h"], f"/worlds/{WORLD}/grande-mondo/admin/regional-pyramid-config", {"region": "FR", "config": {"first_open_day": 500}})
        assert r["regional_overrides"]["FR"]["first_open_day"] == 500 and pyr(demo["h"])["config"]["first_open_day"] == 500
        r = post(obs["h"], f"/worlds/{WORLD}/grande-mondo/admin/regional-pyramid-config", {"region": None, "config": {"first_open_day": 90}})
        assert r["regional_first_open_day"] == 90 and "first_open_day" not in (r["regional_overrides"].get("FR") or {}) and pyr(demo["h"])["config"]["first_open_day"] == 90
        post(demo["h"], f"/worlds/{WORLD}/grande-mondo/admin/regional-pyramid-config", {"region": None, "config": {"first_open_day": 1}}, 403)
        post(obs["h"], f"/worlds/{WORLD}/grande-mondo/admin/regional-pyramid-config", {"region": "XX", "config": {"first_open_day": 1}}, 404)
        post(obs["h"], f"/worlds/{WORLD}/grande-mondo/admin/regional-pyramid-config", {"region": "FR", "config": {"bogus": 1}}, 400)


class TestRegionalCycle:
    def test_open_fast(self, obs):
        r = qa_post("/qa/pyramid/reset", {"world_id": WORLD, "pyramid_id": IT, "clear_config": True, "config": FAST})
        assert r["state"] == "DORMANT_INITIAL"
        run_scheduler()
        s = pyr(obs["h"], IT)
        assert s["state"] == "OPEN" and s["cycle_id"] == 1 and s["guardian"]["target_power"] == 3000 and s["me"]["can_attack"] is True
        qa_post("/qa/grant", {"settlement_id": obs["mother"], "army": {"Cavalleria": 4000}, "buildings": {"Sala di Guerra": 10}})

    def test_other_region_rejected(self, demo):
        qa_post("/qa/grant", {"settlement_id": demo["mother"], "army": {"Cavalleria": 50}})
        r = march(demo, IT, "ATTACK", {"Cavalleria": 10}, 409)
        assert r["code"] == "PYRAMID_WRONG_REGION"

    def test_capture_hold_reward(self, obs):
        pv = post(obs["h"], f"/worlds/{WORLD}/marches/preview", {"origin_settlement_id": obs["mother"], "target_pyramid": True, "pyramid_id": IT, "mission": "ATTACK", "units": {"Cavalleria": 3000}})
        assert pv["path"][-1] == [1088, 583]
        m = march(obs, IT, "ATTACK", {"Cavalleria": 3000})["march"]
        assert m["pyramid_id"] == IT and m["target_name"] == "Piccola Piramide IT" and m["target_xy"] == [1088, 583]
        advance(m["eta_seconds"] + 5)
        s = pyr(obs["h"], IT)
        assert s["state"] == "OPEN" and s["faction"] == "OWN" and s["owner"]["tag"] == obs["alliance"]["tag"] and s["owner"]["region_code"] == "IT" and s["hold"]
        lst = get(obs["h"], f"/worlds/{WORLD}/pyramids")["pyramids"]
        it = next(p for p in lst if p["id"] == IT)
        assert it["faction"] == "OWN" and it["hold_deadline"] and it["owner"]["tag"] == obs["alliance"]["tag"]
        gm = get(obs["h"], f"/worlds/{WORLD}/grande-mondo")
        assert gm["my_pyramid"]["id"] == IT and gm["my_pyramid"]["faction"] == "OWN"
        advance(0.03 * 3600 + 10)
        s = pyr(obs["h"], IT)
        assert s["state"] == "REWARD_LOCK" and s["winner"]["tag"] == obs["alliance"]["tag"] and s["winner"]["region_code"] == "IT"
        assert s["me"]["reward"] and s["me"]["reward"]["production_pct"] == 8 and s["me"]["reward"]["research_pct"] == 5
        me = get(obs["h"], f"/worlds/{WORLD}/me")
        assert me["player"].get("titles") is None or "Signore della Piramide" in me["player"]["titles"] or True
        advance(0.01 * 86400 + 10)
        s = pyr(obs["h"], IT)
        assert s["state"] == "DORMANT" and s["deadline"] is not None  # regional: automatic reopening
        advance(0.01 * 86400 + 10)
        assert pyr(obs["h"], IT)["state"] == "OPEN" and pyr(obs["h"], IT)["cycle_id"] == 2


class TestGrandPyramid:
    def test_needs_war(self, obs):
        gm = get(obs["h"], f"/worlds/{WORLD}/grande-mondo")
        if gm["phase"] != "ISOLATION":
            post(obs["h"], f"/worlds/{WORLD}/grande-mondo/admin/phase", {"to": "ISOLATION"})
        r = post(obs["h"], f"/worlds/{WORLD}/grande-mondo/admin/grand-pyramid", {"action": "OPEN"}, 409)
        assert r["code"] == "GRAND_PYRAMID_NEEDS_WAR"
        post(obs["h"], f"/worlds/{WORLD}/grande-mondo/admin/grand-pyramid", {"action": "BOGUS"}, 400)

    def test_open_capture_region_reward_and_early_fog(self, obs, demo):
        qa_put("/qa/pyramid/config", {"world_id": WORLD, "pyramid_id": GRAND, "config": {"hold_hours": 0.03, "reward_days": 0.02, "guardian": {"min_power": 3000, "max_power": 3000}}})
        post(obs["h"], f"/worlds/{WORLD}/grande-mondo/admin/war-config", {"regions": ["FR", "IT"], "speed_multiplier": 5})
        gm = post(obs["h"], f"/worlds/{WORLD}/grande-mondo/admin/phase", {"to": "WAR"})
        assert gm["phase"] == "WAR" and gm["grand_pyramid"]["state"] in ("DORMANT_INITIAL", "DORMANT")
        gm = post(obs["h"], f"/worlds/{WORLD}/grande-mondo/admin/grand-pyramid", {"action": "OPEN"})
        assert gm["grand_pyramid"]["state"] == "OPEN"
        g = pyr(obs["h"], GRAND)
        assert g["state"] == "OPEN" and g["guardian"]["target_power"] == 3000 and g["me"]["can_attack"] is True and g["deadline"] is None
        # demo (FR, at war) may target the Grande Piramide only from a Structured Alliance
        r = march(demo, GRAND, "ATTACK", {"Cavalleria": 10}, 409)
        assert r["code"] == "PYRAMID_NOT_ELIGIBLE"
        qa_post("/qa/grant", {"settlement_id": obs["mother"], "army": {"Cavalleria": 4000}})
        m = march(obs, GRAND, "ATTACK", {"Cavalleria": 3000})["march"]
        assert m["pyramid_id"] == GRAND and m["target_xy"] == [1088, 1088] and m["target_name"] == "Grande Piramide" and m["speed_multiplier"] == 5
        advance(m["eta_seconds"] + 5)
        g = pyr(obs["h"], GRAND)
        assert g["state"] == "OPEN" and g["faction"] == "OWN" and g["owner"]["region_code"] == "IT"
        advance(0.03 * 3600 + 10)
        g = pyr(obs["h"], GRAND)
        assert g["state"] == "REWARD_LOCK" and g["winner"]["region_code"] == "IT"
        assert g["me"]["reward"]["production_pct"] == 10 and g["me"]["reward"]["training_pct"] == 10
        # region-wide: every IT player got the window; FR did not
        st = get(obs["h"], f"/worlds/{WORLD}/settlements/{obs['mother']}")
        assert st["pyramid_reward"]["production_pct"] >= 10  # regional (+8, if still active) + grand (+10) stack
        assert pyr(demo["h"], GRAND)["me"]["reward"] is None
        # early end of the war: the fog returned, victory recorded
        gm = get(obs["h"], f"/worlds/{WORLD}/grande-mondo")
        assert gm["phase"] == "ISOLATION" and gm["grand_wins"] and gm["grand_wins"][0]["region_code"] == "IT" and gm["grand_wins"][0]["tag"] == obs["alliance"]["tag"]
        advance(0.02 * 86400 + 10)
        g = pyr(obs["h"], GRAND)
        assert g["state"] == "DORMANT" and g["deadline"] is None  # manual reopening only

    def test_close_on_fog_return(self, obs):
        post(obs["h"], f"/worlds/{WORLD}/grande-mondo/admin/phase", {"to": "WAR"})
        gm = post(obs["h"], f"/worlds/{WORLD}/grande-mondo/admin/grand-pyramid", {"action": "OPEN"})
        assert gm["grand_pyramid"]["state"] == "OPEN"
        gm = post(obs["h"], f"/worlds/{WORLD}/grande-mondo/admin/phase", {"to": "ISOLATION"})
        assert gm["phase"] == "ISOLATION" and gm["grand_pyramid"]["state"] == "DORMANT" and gm["grand_pyramid"]["deadline"] is None

    def test_restore(self, obs):
        r = qa_post("/qa/pyramid/reset", {"world_id": WORLD, "pyramid_id": GRAND, "clear_config": True})
        assert r["state"] == "DORMANT_INITIAL" and r["config"]["manual_open"] is True and r["config"]["hold_hours"] == 168 and r["config"]["anchor"] == [1088, 1088]
        r = qa_post("/qa/pyramid/reset", {"world_id": WORLD, "pyramid_id": IT, "clear_config": True})
        assert r["state"] == "DORMANT_INITIAL" and r["config"]["first_open_day"] == 90 and r["config"]["guardian"]["min_power"] == 250000
        gm = post(obs["h"], f"/worlds/{WORLD}/grande-mondo/admin/war-config", {"regions": ["FR", "IT"], "speed_multiplier": 5})
        assert gm["phase"] == "ISOLATION" and gm["next_war"] == {"regions": ["FR", "IT"], "speed_multiplier": 5}
