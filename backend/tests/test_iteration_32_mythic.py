"""Iteration 32 — Santuario Mitico + Unicorno / Ponte Arcobaleno (Bible §12) and the inactivity Inbox warning.

Run: cd /app/backend && pytest tests/test_iteration_32_mythic.py -o addopts='' -v
Uses lord@ (Casa Lord, Metropolis L30 on qa_1) as the mythic Player and a throwaway account on qa_1 as the bridge
target. Advances the QA clock (~17 days) to run the Sanctuary upgrade, the 7-day ritual and the 10 s rainbow event.
"""
from __future__ import annotations

import os
import time
import uuid

import requests
from dotenv import load_dotenv
from tests.paths import FRONTEND_ENV

load_dotenv(FRONTEND_ENV)
from tests.e2e_base import ADMIN_HEADERS, BASE_URL  # QA backend only
WORLD = "qa_1"
LORD = ("lord@empirelords.com", "Lord12345!")


def url(p: str) -> str:
    return f"{BASE_URL}/api{p}"


def get(h, p, code=200):
    r = requests.get(url(p), headers=h, timeout=60)
    assert r.status_code == code, f"{p} → {r.status_code} {r.text}"
    return r.json()


def post(h, p, body=None, code=200):
    r = requests.post(url(p), json=body or {}, headers=h, timeout=90)
    assert r.status_code == code, f"{p} → {r.status_code} {r.text}"
    return r.json()


def qa(p, body=None):
    r = requests.post(url(p), json=body or {}, headers=ADMIN_HEADERS, timeout=90)
    assert r.status_code == 200, r.text
    return r.json()


def advance(seconds: int):
    qa("/qa/clock/advance", {"seconds": int(seconds)})
    for _ in range(6):  # drain due events (scheduler pages)
        if not qa("/qa/scheduler/run").get("events_processed"):
            break


def login(email, password):
    r = requests.post(url("/auth/login"), json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    h = {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}
    me = get(h, f"/worlds/{WORLD}/me")
    return {"h": h, "me": me, "player_id": me["player"]["player_id"], "mother": me["player"]["mother_settlement_id"]}


def fresh_target():
    tag = uuid.uuid4().hex[:8]
    r = requests.post(url("/auth/register"), json={"email": f"qa-bridge-{tag}@example.com", "password": "Qa12345!x", "display_name": f"QA {tag}"}, timeout=30)
    assert r.status_code in (200, 201), r.text
    h = {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}
    post(h, f"/worlds/{WORLD}/join", {"house_name": f"Casa Ponte {tag}"})
    me = get(h, f"/worlds/{WORLD}/me")
    return {"h": h, "player_id": me["player"]["player_id"], "mother": me["player"]["mother_settlement_id"]}


BIG = {"grain": 50_000_000, "wood": 50_000_000, "clay": 50_000_000, "iron": 50_000_000, "gold": 10_000_000}


def test_sanctuary_catalog_and_upgrade_flow():
    lord = login(*LORD)
    qa("/qa/grant", {"settlement_id": lord["mother"], "buildings": {"Universita": 30, "Sala di Guerra": 30}, "research": {"mythic.mythic_studies": 1}, "resources": BIG})
    qa("/qa/mythic", {"player_id": lord["player_id"], "sanctuary_level": 4, "unicorn_state": "NONE"})
    my = get(lord["h"], f"/worlds/{WORLD}/mythic")
    assert my["sanctuary"]["unlocked"] and my["sanctuary"]["level"] == 4 and len(my["sanctuary"]["levels"]) == 5
    assert my["sanctuary"]["levels"][4]["cost"]["gold"] == 650_000 and my["sanctuary"]["levels"][4]["duration_min"] == 10 * 24 * 60
    assert my["unicorn"]["state"] == "NONE" and my["unicorn"]["can_summon"] is False
    cat = get(lord["h"], f"/worlds/{WORLD}/settlements/{lord['mother']}/buildings")
    row = next(b for b in cat["buildings"] if b["name"] == "Santuario Mitico")
    assert row["level"] == 4 and row["max_level"] == 5 and row["state"] == "AVAILABLE" and row["next"]["level"] == 5, row
    assert row["mythic"]["is_mother"] is True and row["mythic"]["unicorn"]["state"] == "NONE"
    # a secondary castle only shows the player-wide level: MOTHER_ONLY
    other_sid = next(s["settlement_id"] for s in lord["me"]["settlements"] if s["settlement_id"] != lord["mother"])
    cat2 = get(lord["h"], f"/worlds/{WORLD}/settlements/{other_sid}/buildings")
    row2 = next(b for b in cat2["buildings"] if b["name"] == "Santuario Mitico")
    assert row2["state"] == "MOTHER_ONLY" and row2["level"] == 4
    r = requests.post(url(f"/worlds/{WORLD}/settlements/{other_sid}/buildings/Santuario Mitico/upgrade"), json={}, headers=lord["h"], timeout=30)
    assert r.status_code == 409 and r.json()["code"] == "MOTHER_ONLY", r.text
    # upgrade 4 → 5 in the Mother: dedicated table, 10 days, no rubies
    job = post(lord["h"], f"/worlds/{WORLD}/settlements/{lord['mother']}/buildings/Santuario Mitico/upgrade", {"idempotency_key": f"sanct-{uuid.uuid4().hex[:6]}"})["job"]
    assert job["target"] == "Santuario Mitico" and job["target_level"] == 5
    assert job["cost_snapshot"]["gold"] == 650_000
    q = get(lord["h"], f"/worlds/{WORLD}/jobs/{job['job_id']}/finish")
    assert q["allowed"] is False and q["reason"] == "FORBIDDEN_MYTHIC", q
    r = requests.post(url(f"/worlds/{WORLD}/settlements/{lord['mother']}/buildings/Santuario Mitico/upgrade"), json={}, headers=lord["h"], timeout=30)
    assert r.status_code == 409 and r.json()["code"] == "TARGET_BUSY", r.text
    advance(10 * 24 * 3600 + 60)
    my = get(lord["h"], f"/worlds/{WORLD}/mythic")
    assert my["sanctuary"]["level"] == 5 and my["sanctuary"]["job"] is None and my["unicorn"]["can_summon"] is True
    r = requests.post(url(f"/worlds/{WORLD}/settlements/{lord['mother']}/buildings/Santuario Mitico/upgrade"), json={}, headers=lord["h"], timeout=30)
    assert r.status_code == 409 and r.json()["code"] == "MAX_LEVEL", r.text


def test_unicorn_ritual_and_rainbow_bridge():
    lord = login(*LORD)
    qa("/qa/grant", {"settlement_id": lord["mother"], "resources": BIG, "army": {"Cavalleria": 400, "Fanteria": 400}})
    qa("/qa/mythic", {"player_id": lord["player_id"], "sanctuary_level": 5, "unicorn_state": "NONE"})
    # ritual: 7 fixed days, one per player
    u = post(lord["h"], f"/worlds/{WORLD}/unicorn/summon")["unicorn"]
    assert u["state"] == "QUEUED" and u["ready_at"]
    r = requests.post(url(f"/worlds/{WORLD}/unicorn/summon"), json={}, headers=lord["h"], timeout=30)
    assert r.status_code == 409 and r.json()["code"] == "UNICORN_ACTIVE", r.text
    # bridge before READY → 409
    target = fresh_target()
    qa("/qa/grant", {"settlement_id": target["mother"], "end_pvp_shield": True, "army": {"Fanteria": 5}})
    body = {"origin_settlement_id": lord["mother"], "target_settlement_id": target["mother"], "mission": "RAINBOW_BRIDGE", "units": {"Cavalleria": 200}}
    r = requests.post(url(f"/worlds/{WORLD}/marches"), json=body, headers=lord["h"], timeout=30)
    assert r.status_code == 409 and r.json()["code"] == "UNICORN_NOT_READY", r.text
    advance(7 * 24 * 3600 + 60)
    u = get(lord["h"], f"/worlds/{WORLD}/mythic")["unicorn"]
    assert u["state"] == "READY", u
    # preview: straight rainbow, 10 s event
    pv = post(lord["h"], f"/worlds/{WORLD}/marches/preview", body)
    assert pv["rainbow"] is True and pv["eta_seconds"] == 10 and len(pv["path"]) == 2
    # launch: 10 s, target alerted at once, Unicorn IN_FLIGHT
    m = post(lord["h"], f"/worlds/{WORLD}/marches", body)["march"]
    assert m["mission"] == "RAINBOW_BRIDGE" and m["rainbow"] is True and m["eta_seconds"] == 10 and len(m["path"]) == 2
    assert get(lord["h"], f"/worlds/{WORLD}/mythic")["unicorn"]["state"] == "IN_FLIGHT"
    r = requests.post(url(f"/worlds/{WORLD}/marches"), json={**body, "units": {"Cavalleria": 50}}, headers=lord["h"], timeout=30)
    assert r.status_code == 409 and r.json()["code"] == "UNICORN_NOT_READY"  # one Unicorn, one bridge
    inbox = get(target["h"], f"/worlds/{WORLD}/inbox")
    assert any(n["event"] == "HOSTILE_MARCH_DETECTED" for n in inbox["items"]), "the target must be alerted immediately"
    advance(15)
    time.sleep(0.5)
    # victory → owner changes at once (no Loyalty, no Cart); the Unicorn is spent and the 720 h cooldown runs
    pub = get(lord["h"], f"/worlds/{WORLD}/settlements/{target['mother']}/public")
    assert pub["owner_player_id"] == lord["player_id"] and pub["kind"] == "PLAYER", pub
    u = get(lord["h"], f"/worlds/{WORLD}/mythic")["unicorn"]
    assert u["state"] == "COOLDOWN" and u["cooldown_until"], u
    r = requests.post(url(f"/worlds/{WORLD}/unicorn/summon"), json={}, headers=lord["h"], timeout=30)
    assert r.status_code == 409 and r.json()["code"] == "UNICORN_COOLDOWN", r.text
    # the target lost its only castle → eliminated
    r = requests.get(url(f"/worlds/{WORLD}/me"), headers=target["h"], timeout=30)
    assert r.status_code == 409 and r.json()["code"] == "PLAYER_ELIMINATED", r.text
    # battle report exists for the bridge
    hist = get(lord["h"], f"/worlds/{WORLD}/battles")
    assert any(b.get("mission") == "RAINBOW_BRIDGE" for b in hist["battles"]), [b.get("mission") for b in hist["battles"][:5]]
    # tidy: give the conquered castle back to neutral is not needed (lord keeps it); restore lord's unicorn for QA
    qa("/qa/mythic", {"player_id": lord["player_id"], "unicorn_state": "NONE"})


def test_inactivity_warning_lands_in_inbox():
    from tests.test_iteration_31_inactivity import fresh_account  # qa_1 helpers

    acc = fresh_account()
    put = requests.put(url("/qa/inactivity/config"), json={"world_id": "qa_1", "config": {"early_phase_days": 0, "timeout_days": 3, "only_player_ids": [acc["player_id"]]}}, headers=ADMIN_HEADERS, timeout=30)
    assert put.status_code == 200, put.text
    try:
        qa("/qa/inactivity/touch", {"player_id": acc["player_id"], "days_ago": 2.2})  # 0.8 days before the elimination
        qa("/qa/inactivity/sweep", {"world_id": "qa_1"})
        inbox = get(acc["h"], "/worlds/qa_1/inbox")
        warn = [n for n in inbox["items"] if n["event"] == "INACTIVITY_WARNING"]
        assert len(warn) == 1 and warn[0]["severity"] == "CRITICAL" and warn[0]["payload"]["timeout_days"] == 3, inbox["items"][:3]
        qa("/qa/inactivity/sweep", {"world_id": "qa_1"})  # same inactivity period → no duplicate
        inbox = get(acc["h"], "/worlds/qa_1/inbox")
        assert len([n for n in inbox["items"] if n["event"] == "INACTIVITY_WARNING"]) == 1
        # (reading the inbox touched last_active_at again: the player is safe now)
        me = get(acc["h"], "/worlds/qa_1/me")
        assert me["player"]["status"] == "ACTIVE"
    finally:
        requests.put(url("/qa/inactivity/config"), json={"world_id": "qa_1", "config": None}, headers=ADMIN_HEADERS, timeout=30)
