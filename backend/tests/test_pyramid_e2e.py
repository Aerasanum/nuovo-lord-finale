"""Pyramid endgame cycle against the PUBLIC deployment (Bible §21 / §31.7 / §34.8 / §39.2, spec.pyramid).

Run: cd /app/backend && pytest tests/test_pyramid_e2e.py -o addopts='' -v
Uses the alliance fixtures of test_alliances_e2e.py: demo (LEADER [DEMO] STRUCTURED), ally (VICE of [DEMO]),
rival (LEADER [MERC] MERCENARY), third (LEADER [TRZ] STRUCTURED).

The cycle is driven through the admin override (`PUT /api/qa/pyramid/config`): tiny durations + small Guardian so a
whole cycle (OPEN → capture → hold → REWARD_LOCK → DORMANT → OPEN) runs in minutes of QA clock. The last test restores
a realistic configuration and leaves world_1 with the Pyramid OPEN (spec Guardian) for the demo.
"""
from __future__ import annotations

import time

import pytest
import requests

BASE_URL = "https://empire-lords-dragon.preview.emergentagent.com"
ADMIN_HEADERS = {"X-Admin-Key": "eld-admin-7f3c9a1d2b4e", "Content-Type": "application/json"}
WORLD = "world_1"
DEMO = ("demo@empirelords.com", "Demo12345!")
ALLY = ("ally@empirelords.com", "Ally12345!")
RIVAL = ("rival@empirelords.com", "Rival12345!")
THIRD = ("third@empirelords.com", "Third12345!")
TEST_CFG = {"first_open_day": 0, "hold_hours": 400, "reward_days": 0.01, "dormant_days": 0.01, "guardian": {"min_power": 5000, "max_power": 5000}}


def url(p: str) -> str:
    return f"{BASE_URL}/api{p}"


def auth(email: str, password: str) -> dict:
    r = requests.post(url("/auth/login"), json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    h = {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}
    me = requests.get(url(f"/worlds/{WORLD}/me"), headers=h, timeout=30)
    assert me.status_code == 200, me.text
    j = me.json()
    return {"h": h, "me": j, "player_id": j["player"]["player_id"], "mother": j["player"]["mother_settlement_id"], "alliance": j["player"]["alliance"]}


def get(h, p, code=200):
    r = requests.get(url(p), headers=h, timeout=60)
    assert r.status_code == code, f"{p} → {r.status_code} {r.text}"
    return r.json()


def post(h, p, body=None, code=200):
    r = requests.post(url(p), json=body or {}, headers=h, timeout=60)
    assert r.status_code == code, f"{p} → {r.status_code} {r.text}"
    return r.json()


def advance(seconds: float) -> None:
    assert requests.post(url("/qa/clock/advance"), json={"seconds": seconds}, headers=ADMIN_HEADERS, timeout=60).status_code == 200
    for _ in range(3):
        requests.post(url("/qa/scheduler/run"), headers=ADMIN_HEADERS, timeout=60)
        time.sleep(0.4)


def run_scheduler() -> None:
    for _ in range(3):
        requests.post(url("/qa/scheduler/run"), headers=ADMIN_HEADERS, timeout=60)
        time.sleep(0.3)


def status(h) -> dict:
    return get(h, f"/worlds/{WORLD}/pyramid")


def grant(settlement_id: str, **kw) -> None:
    r = requests.post(url("/qa/grant"), json={"settlement_id": settlement_id, **kw}, headers=ADMIN_HEADERS, timeout=30)
    assert r.status_code == 200, r.text


def set_cfg(cfg: dict) -> dict:
    r = requests.put(url("/qa/pyramid/config"), json={"world_id": WORLD, "config": cfg}, headers=ADMIN_HEADERS, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="session")
def demo():
    return auth(*DEMO)


@pytest.fixture(scope="session")
def ally():
    return auth(*ALLY)


@pytest.fixture(scope="session")
def rival():
    return auth(*RIVAL)


@pytest.fixture(scope="session")
def third():
    return auth(*THIRD)


@pytest.fixture(scope="session", autouse=True)
def fixtures_ok(demo, ally, rival, third):
    assert demo["alliance"] and demo["alliance"]["kind"] == "STRUCTURED", "run tests/test_alliances_e2e.py first"
    assert ally["alliance"] and ally["alliance"]["alliance_id"] == demo["alliance"]["alliance_id"]
    assert rival["alliance"] and rival["alliance"]["kind"] == "MERCENARY"
    assert third["alliance"] and third["alliance"]["kind"] == "STRUCTURED" and third["alliance"]["alliance_id"] != demo["alliance"]["alliance_id"]


def march_to_pyramid(acc: dict, mission: str, units: dict, code=200):
    return post(acc["h"], f"/worlds/{WORLD}/marches", {"origin_settlement_id": acc["mother"], "target_pyramid": True, "mission": mission, "units": units, "idempotency_key": f"pyr-{mission}-{time.time()}"}, code)


class TestCycleOpen:
    def test_config_override_and_open(self, demo):
        # spec defaults (override cleared): day 90 / 168h / 14d / 30d / +8% production
        r = requests.post(url("/qa/pyramid/reset"), json={"world_id": WORLD, "clear_config": True}, headers=ADMIN_HEADERS, timeout=30)
        assert r.status_code == 200 and r.json()["state"] == "DORMANT_INITIAL"
        c = r.json()["config"]
        assert c["first_open_day"] == 90 and c["hold_hours"] == 168 and c["reward_days"] == 14 and c["dormant_days"] == 30 and c["reward"]["production_pct"] == 8 and c["garrison_cap_units"] == 1_000_000
        s = status(demo["h"])
        assert s["anchor"] == [200, 200] and s["footprint"] == [15, 15] and s["config"]["hold_hours"] == 168
        # test cycle: tiny durations + small Guardian, applied atomically with the reset
        r = requests.post(url("/qa/pyramid/reset"), json={"world_id": WORLD, "clear_config": True, "config": TEST_CFG}, headers=ADMIN_HEADERS, timeout=30)
        assert r.status_code == 200 and r.json()["state"] == "DORMANT_INITIAL" and r.json()["config"]["hold_hours"] == 400
        out = set_cfg({"guardian": {"min_power": 5000}})
        assert out["config"]["hold_hours"] == 400 and out["override"]["guardian"]["min_power"] == 5000
        run_scheduler()
        s = status(demo["h"])
        assert s["state"] == "OPEN" and s["cycle_id"] == 1 and s["owner"] is None and s["deadline"] is None
        # Guardian: clamp(5000, ..., 5000) → ceil(5000/11.35) = 441 units, 45/35/20
        assert s["guardian"]["target_power"] == 5000 and s["guardian"]["unit_count"] == 441
        assert s["garrison"] == {"Fanteria": 198, "Arciere": 154, "Cavalleria": 89} and s["garrison_total"] == 441
        assert s["me"]["eligible"] is True and s["me"]["can_attack"] is True and s["me"]["can_reinforce"] is False
        cfg = requests.get(url("/qa/pyramid/config"), params={"world_id": WORLD}, headers=ADMIN_HEADERS, timeout=30).json()
        assert cfg["state"] == "OPEN" and cfg["config"]["first_open_day"] == 0

    def test_launch_gates(self, demo, rival):
        grant(rival["mother"], army={"Cavalleria": 50})
        r = march_to_pyramid(rival, "ATTACK", {"Cavalleria": 10}, 409)
        assert r["code"] == "PYRAMID_NOT_ELIGIBLE"
        assert status(rival["h"])["me"]["eligible"] is False
        grant(demo["mother"], army={"Cavalleria": 3000}, buildings={"Sala di Guerra": 10})
        assert march_to_pyramid(demo, "REINFORCE", {"Cavalleria": 10}, 409)["code"] == "INVALID_TARGET"
        assert march_to_pyramid(demo, "RAID", {"Cavalleria": 10}, 400)["code"] == "INVALID_MISSION"

    def test_preview_and_capture(self, demo):
        pv = post(demo["h"], f"/worlds/{WORLD}/marches/preview", {"origin_settlement_id": demo["mother"], "target_pyramid": True, "mission": "ATTACK", "units": {"Cavalleria": 3000}})
        assert pv["path"][-1] == [200, 200] and pv["eta_seconds"] > 0
        m = march_to_pyramid(demo, "ATTACK", {"Cavalleria": 3000})["march"]
        assert m["target_pyramid"] is True and m["target_name"] == "Piramide" and m["target_xy"] == [200, 200] and m["status"] == "OUTBOUND"
        advance(m["eta_seconds"] + 5)
        s = status(demo["h"])
        assert s["state"] == "OPEN" and s["owner"]["alliance_id"] == demo["alliance"]["alliance_id"] and s["faction"] == "OWN"
        assert s["hold"] and s["hold"]["deadline"] and s["hold"]["hours"] == 400 and s["deadline"] == s["hold"]["deadline"]
        assert s["garrison_total"] > 0 and set(s["garrison"]) == {"Cavalleria"} and s["me"]["my_garrison"] == s["garrison"]
        assert s["me"]["is_owner"] and s["me"]["can_reinforce"] and not s["me"]["can_attack"] and s["me"]["participated"] is True
        assert s["participants"] == 1
        b = s["recent_battles"][0]
        assert b["winner"] == "ATTACKER" and b["captured"] is True and b["attacker_alliance_tag"] == "DEMO" and b["mine"] is True
        rep = get(demo["h"], f"/worlds/{WORLD}/battles/{b['battle_id']}")
        assert rep["target_pyramid"] is True and rep["report"]["defender_kind"] == "PYRAMID" and rep["ownership_result"]["changed"] is True
        mm = get(demo["h"], f"/worlds/{WORLD}/marches/{m['march_id']}")
        assert mm["status"] == "COMPLETED" and mm["result"] == "PYRAMID_CAPTURED"
        # participation: +500 Emeralds (once per Alliance per cycle) + Prestige +50 to the player
        led = get(demo["h"], f"/worlds/{WORLD}/alliance/treasury")
        assert any(e["reason"] == "pyramid_participation" and e["amount"] == 500 for e in led["entries"])
        prog = get(demo["h"], f"/worlds/{WORLD}/progress")
        assert any(h.get("reason") == "pyramid_participation" and h.get("points") == 50 for h in prog["history"])
        assert "sigillo_bronzo_piramide" in prog["cosmetics"]

    def test_ally_reinforce_and_enemy_attack(self, demo, ally, third):
        before = status(demo["h"])["garrison_total"]
        grant(ally["mother"], army={"Fanteria": 200})
        r = march_to_pyramid(ally, "REINFORCE", {"Fanteria": 100})["march"]
        assert r["mission"] == "REINFORCE" and r["target_pyramid"] is True
        advance(r["eta_seconds"] + 5)
        s = status(ally["h"])
        assert s["garrison_total"] == before + 100 and s["garrison"]["Fanteria"] == 100 and s["me"]["my_garrison"] == {"Fanteria": 100}
        # a rival Structured Alliance attacks with a token force and loses; garrison losses are split per contributor
        grant(third["mother"], army={"Fanteria": 60})
        r2 = march_to_pyramid(third, "ATTACK", {"Fanteria": 50})["march"]
        # Pyramid alert for the holders (tag + ETA only): status.incoming, Inbox PYRAMID_ATTACK_INCOMING, chat system line
        inc = status(demo["h"])["incoming"]
        assert inc and inc[0]["march_id"] == r2["march_id"] and inc[0]["attacker_alliance_tag"] == "TRZ" and inc[0]["arrival_at"][:19] == r2["arrival_at"][:19]
        assert "house_name" not in inc[0] and "units_total" not in inc[0]
        assert status(third["h"])["incoming"] == []  # the attacker's side sees nothing
        for acc in (demo, ally):
            inbox = get(acc["h"], f"/worlds/{WORLD}/inbox?limit=50")["items"]
            al = [n for n in inbox if n["event"] == "PYRAMID_ATTACK_INCOMING" and n["payload"].get("march_id") == r2["march_id"]]
            assert al and al[0]["payload"]["attacker_alliance_tag"] == "TRZ" and al[0]["payload"]["eta"][:19] == r2["arrival_at"][:19] and al[0]["deep_link"].startswith("pyramid") and al[0]["severity"] == "HIGH"
            assert "house_name" not in al[0]["payload"] and "units" not in al[0]["payload"]
        chat = get(demo["h"], f"/worlds/{WORLD}/alliance/chat")["messages"]
        assert any(m["role"] == "SYSTEM" and "Attacco alla Piramide" in m["text"] and "[TRZ]" in m["text"] for m in chat)
        advance(r2["eta_seconds"] + 5)
        s2 = status(demo["h"])
        assert s2["owner"]["alliance_id"] == demo["alliance"]["alliance_id"] and s2["participants"] == 2
        b = s2["recent_battles"][0]
        assert b["winner"] == "DEFENDER" and b["captured"] is False and b["attacker_alliance_tag"] == "TRZ" and b["defender_alliance_tag"] == "DEMO"
        assert s2["garrison_total"] <= s["garrison_total"]
        st = status(third["h"])
        assert st["faction"] == "ENEMY" and st["garrison"] is None and st["garrison_total"] > 0 and st["me"]["participated"] is True
        # the defenders (garrison contributors) received the battle report
        inbox = get(ally["h"], f"/worlds/{WORLD}/inbox?limit=100")["items"]
        assert any(n["event"] == "BATTLE_REPORT_READY" and n["payload"].get("target_name") == "Piramide" for n in inbox)


class TestHoldAndRewards:
    def test_hold_completion_rewards(self, demo, ally):
        s = status(demo["h"])
        assert s["state"] == "OPEN" and s["hold"]
        sett_before = get(demo["h"], f"/worlds/{WORLD}/settlements/{demo['mother']}")
        # configurable cycle: shortening hold_hours re-derives the pending deadline from the persisted hold_started_at
        out = set_cfg({"hold_hours": 0.05})
        assert out["state"] == "OPEN" and out["deadline"] <= s["hold"]["deadline"]
        advance(60)
        s = status(demo["h"])
        assert s["state"] == "REWARD_LOCK" and s["winner"]["tag"] == "DEMO" and s["winner"]["cycle_id"] == 1 and s["lock_until"] and s["deadline"] == s["lock_until"]
        assert s["me"]["reward"] and s["me"]["reward"]["production_pct"] == 8 and s["me"]["reward"]["research_pct"] == 5 and s["me"]["reward"]["training_pct"] == 5 and s["me"]["reward"]["caravan_capacity_pct"] == 10
        assert s["me"]["can_attack"] is False and s["me"]["can_reinforce"] is False
        # member snapshot: ally has the reward too; title + gold seal + Prestige 250; Alliance +2000 Emeralds
        sa = status(ally["h"])
        assert sa["me"]["reward"] and sa["me"]["reward"]["cycle_id"] == 1
        prog = get(demo["h"], f"/worlds/{WORLD}/progress")
        assert "Signore della Piramide" in prog["titles"] and "sigillo_oro_piramide" in prog["cosmetics"]
        assert any(h.get("reason") == "pyramid_victory" and h.get("points") == 250 for h in prog["history"])
        led = get(demo["h"], f"/worlds/{WORLD}/alliance/treasury")
        assert any(e["reason"] == "pyramid_victory" and e["amount"] == 2000 for e in led["entries"])
        # economic window applied to the settlement: +8% production vs the pre-award rates
        sett = get(demo["h"], f"/worlds/{WORLD}/settlements/{demo['mother']}")
        assert sett["pyramid_reward"] and sett["pyramid_reward"]["production_pct"] == 8
        for r, v in sett_before["production_per_h"].items():
            if v:
                assert abs(sett["production_per_h"][r] / v - 1.08) < 0.002, (r, v, sett["production_per_h"][r])
        # not attackable during REWARD_LOCK
        assert march_to_pyramid(demo, "ATTACK", {"Cavalleria": 10}, 409)["code"] == "PYRAMID_NOT_OPEN"
        chron = get(demo["h"], f"/worlds/{WORLD}/chronicle")["entries"]
        assert any(c["kind"] == "PYRAMID_WON" and c["params"]["tag"] == "DEMO" for c in chron)
        assert any(c["kind"] == "PYRAMID_CAPTURED" for c in chron) and any(c["kind"] == "PYRAMID_OPEN" for c in chron)

    def test_reward_lock_to_dormant_returns_garrison(self, demo, ally):
        advance(0.01 * 86400 + 30)
        s = status(demo["h"])
        assert s["state"] == "DORMANT" and s["owner"] is None and s["garrison_total"] == 0 and s["opens_at"] and s["winner"]["tag"] == "DEMO"
        # living garrison goes home by real marches (RETURNING, PYRAMID_RELEASED)
        for acc in (demo, ally):
            ms = get(acc["h"], f"/worlds/{WORLD}/marches")["marches"]
            rel = [m for m in ms if m["result"] == "PYRAMID_RELEASED"]
            assert rel and rel[0]["status"] == "RETURNING" and rel[0]["target_pyramid"] is True and rel[0]["target_name"] == "Piramide" and rel[0]["path"][-1] == [200, 200]
        assert s["me"]["reward"] is None  # window (0.01 d) already elapsed with the tiny test config
        inbox = get(demo["h"], f"/worlds/{WORLD}/inbox?limit=200")["items"]
        states = {n["payload"]["state"] for n in inbox if n["event"] == "PYRAMID_STATE_CHANGED"}
        assert {"OPEN", "REWARD_LOCK", "DORMANT"} <= states and all(n["deep_link"].startswith("pyramid") for n in inbox if n["event"] == "PYRAMID_STATE_CHANGED")

    def test_dormant_to_new_cycle(self, demo):
        advance(0.01 * 86400 + 30)
        s = status(demo["h"])
        assert s["state"] == "OPEN" and s["cycle_id"] == 2 and s["owner"] is None and s["garrison_total"] == 441 and s["participants"] == 0
        assert s["history"][0]["cycle_id"] == 1 and s["history"][0]["tag"] == "DEMO" and s["history"][0]["member_count"] >= 2
        assert s["me"]["can_attack"] is True


class TestRealisticDemoState:
    def test_restore_config_leaves_pyramid_open(self, demo):
        """Restore spec values; keep only first_open_day low so world_1 shows an OPEN Pyramid with the spec Guardian."""
        r = requests.post(url("/qa/pyramid/reset"), json={"world_id": WORLD, "clear_config": True, "config": {"first_open_day": 1}}, headers=ADMIN_HEADERS, timeout=30)
        assert r.status_code == 200 and r.json()["config"]["hold_hours"] == 168
        run_scheduler()
        s = status(demo["h"])
        assert s["state"] == "OPEN" and s["owner"] is None and s["guardian"]["target_power"] >= 250000 and s["garrison_total"] >= 22026
        assert s["config"]["hold_hours"] == 168 and s["config"]["reward_days"] == 14 and s["config"]["dormant_days"] == 30
