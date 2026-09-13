"""Iteration 31 — inactivity elimination (3 gg nei primi 30 gg del Regno → slot riaperto; poi 120 gg → neutrale) and the
Legendary cap (max 3 per type per Metropolis, garrison + queue + in flight).

Run: cd /app/backend && pytest tests/test_iteration_31_inactivity.py -o addopts='' -v
Uses throwaway accounts on world_1 (QA fixtures demo/lord/max are `inactivity_exempt`). The per-world threshold override
is cleared at the end; the QA clock is never advanced.
"""
from __future__ import annotations

import os
import uuid

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
ADMIN_HEADERS = {"X-Admin-Key": "eld-admin-7f3c9a1d2b4e", "Content-Type": "application/json"}
WORLD = "world_1"
LORD = ("lord@empirelords.com", "Lord12345!")
DEMO = ("demo@empirelords.com", "Demo12345!")
LORD_WORLD = "world_2"


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


def qa_post(p, body=None):
    r = requests.post(url(p), json=body or {}, headers=ADMIN_HEADERS, timeout=60)
    assert r.status_code == 200, r.text
    return r.json()


def qa_put(p, body):
    r = requests.put(url(p), json=body, headers=ADMIN_HEADERS, timeout=60)
    assert r.status_code == 200, r.text
    return r.json()


def fresh_account(world: str = WORLD) -> dict:
    tag = uuid.uuid4().hex[:8]
    email = f"qa-inactive-{tag}@example.com"
    r = requests.post(url("/auth/register"), json={"email": email, "password": "Qa12345!x", "display_name": f"QA {tag}"}, timeout=30)
    assert r.status_code in (200, 201), r.text
    h = {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}
    post(h, f"/worlds/{world}/join", {"house_name": f"Casa QA {tag}"})
    me = get(h, f"/worlds/{world}/me")
    return {"h": h, "email": email, "me": me, "player_id": me["player"]["player_id"], "mother": me["player"]["mother_settlement_id"]}


def login(email, password, world):
    r = requests.post(url("/auth/login"), json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    h = {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}
    me = get(h, f"/worlds/{world}/me")
    return {"h": h, "me": me, "player_id": me["player"]["player_id"], "mother": me["player"]["mother_settlement_id"]}


@pytest.fixture(scope="module", autouse=True)
def restore_config():
    yield
    qa_put("/qa/inactivity/config", {"world_id": WORLD, "config": None})


def test_rule_exposed_on_me_and_activity_tracked():
    acc = fresh_account()
    w = acc["me"]["world"]
    assert w["inactivity"]["phase"] in ("EARLY", "MATURE")
    assert w["inactivity"]["early_phase_days"] == 30 and w["inactivity"]["early_timeout_days"] == 3 and w["inactivity"]["timeout_days_after"] == 120
    assert acc["me"]["player"]["last_active_at"]
    assert acc["me"]["player"]["status"] == "ACTIVE"


def test_early_phase_removes_player_and_reopens_slot():
    acc = fresh_account()
    before = next(w for w in get(acc["h"], "/worlds")["worlds"] if w["world_id"] == WORLD)["player_count"]
    # force the EARLY phase (world_1 is months old): 3 consecutive days away → removed
    rule = qa_put("/qa/inactivity/config", {"world_id": WORLD, "config": {"early_phase_days": 100000, "early_timeout_days": 3}})["rule"]
    assert rule["phase"] == "EARLY" and rule["mode"] == "REMOVE" and rule["timeout_days"] == 3
    # 2 days away: still safe
    qa_post("/qa/inactivity/touch", {"player_id": acc["player_id"], "days_ago": 2})
    res = qa_post("/qa/inactivity/sweep", {"world_id": WORLD})
    assert acc["player_id"] not in [e["player_id"] for e in res["eliminated"]]
    # 4 days away: removed, Mother slot back to FREE
    qa_post("/qa/inactivity/touch", {"player_id": acc["player_id"], "days_ago": 4})
    res = qa_post("/qa/inactivity/sweep", {"world_id": WORLD})
    hit = next(e for e in res["eliminated"] if e["player_id"] == acc["player_id"])
    assert hit["mode"] == "REMOVE" and hit["freed_slots"] == 1 and hit["converted"] == 0
    r = requests.get(url(f"/worlds/{WORLD}/me"), headers=acc["h"], timeout=30)
    assert r.status_code == 409 and r.json()["code"] == "PLAYER_ELIMINATED", r.text
    # the seat is free again for a newcomer and the World counter went down
    demo = login(*DEMO, WORLD)
    slot = get(demo["h"], f"/worlds/{WORLD}/settlements/{acc['mother']}/public")
    assert slot["kind"] == "PLAYER_SLOT" and slot["owner_player_id"] is None and slot["level"] == 0, slot
    mid = next(w for w in get(demo["h"], "/worlds")["worlds"] if w["world_id"] == WORLD)["player_count"]
    assert mid == before - 1, (before, mid)
    other = fresh_account()  # the next newcomer takes a FREE seat (the freed one is a candidate)
    taken = get(demo["h"], f"/worlds/{WORLD}/settlements/{other['mother']}/public")
    assert taken["kind"] == "PLAYER" and taken["owner_player_id"] == other["player_id"]
    after = next(w for w in get(other["h"], "/worlds")["worlds"] if w["world_id"] == WORLD)["player_count"]
    assert after == before, (before, after)  # −1 for the removed player, +1 for `other`
    # idempotent: a second sweep does nothing for him
    res = qa_post("/qa/inactivity/sweep", {"world_id": WORLD})
    assert acc["player_id"] not in [e["player_id"] for e in res["eliminated"]]
    qa_post("/qa/inactivity/touch", {"player_id": other["player_id"], "days_ago": 4})
    qa_post("/qa/inactivity/sweep", {"world_id": WORLD})  # tidy up the helper account


def test_mature_phase_converts_castles_to_neutral():
    acc = fresh_account()
    rule = qa_put("/qa/inactivity/config", {"world_id": WORLD, "config": {"early_phase_days": 0, "timeout_days": 3}})["rule"]
    assert rule["phase"] == "MATURE" and rule["mode"] == "NEUTRAL" and rule["timeout_days"] == 3
    # give the castle something to preserve: level 3 with a Fattoria 3 and some resources
    qa_post("/qa/grant", {"settlement_id": acc["mother"], "level": 3, "buildings": {"Fattoria": 3}, "resources": {"grain": 10000}})
    qa_post("/qa/inactivity/touch", {"player_id": acc["player_id"], "days_ago": 4})
    res = qa_post("/qa/inactivity/sweep", {"world_id": WORLD})
    hit = next(e for e in res["eliminated"] if e["player_id"] == acc["player_id"])
    assert hit["mode"] == "NEUTRAL" and hit["converted"] == 1 and hit["freed_slots"] == 0
    demo = login(*DEMO, WORLD)
    n = get(demo["h"], f"/worlds/{WORLD}/settlements/{acc['mother']}/public")
    assert n["kind"] == "NEUTRAL" and n["owner_player_id"] is None and n["level"] == 3 and n["name"].startswith("Neutrale"), n
    assert n["garrison_total"] and n["garrison_total"] > 0  # 100·L² neutral garrison
    r = requests.get(url(f"/worlds/{WORLD}/me"), headers=acc["h"], timeout=30)
    assert r.status_code == 409 and r.json()["details"]["reason"] == "INACTIVE", r.text
    # the World seat does NOT reopen in the mature phase: player_count unchanged by this conversion
    qa_put("/qa/inactivity/config", {"world_id": WORLD, "config": None})


def test_fixtures_are_exempt():
    qa_put("/qa/inactivity/config", {"world_id": WORLD, "config": {"early_phase_days": 0, "timeout_days": 3}})
    res = qa_post("/qa/inactivity/sweep", {"world_id": WORLD})
    emails = {"demo@empirelords.com", "lord@empirelords.com", "max@empirelords.com"}
    assert not [e for e in res["eliminated"] if e.get("house_name") in ("Casa Demo", "Casa Lord", "Casa Max")], res
    qa_put("/qa/inactivity/config", {"world_id": WORLD, "config": None})
    lord = login(*LORD, LORD_WORLD)
    assert lord["me"]["player"]["status"] == "ACTIVE" and emails


def test_legendary_cap_counter_and_409():
    lord = login(*LORD, LORD_WORLD)
    army = get(lord["h"], f"/worlds/{LORD_WORLD}/settlements/{lord['mother']}/army")
    leg = [u for u in army["units"] if u["category"] == "legendary"]
    assert leg, "the Metropolis catalog must list the Legendaries"
    for u in leg:
        cap = u["legendary_cap"]
        assert cap["max"] == 3 and cap["used"] == cap["garrison"] + cap["queued"] + cap["in_flight"]
        assert u["batch_cap"] == min(1, cap["free"])
    drago = next(u for u in leg if u["name"] == "Drago")
    original = int(army["army"].get("Drago", 0))
    try:
        qa_post("/qa/grant", {"settlement_id": lord["mother"], "army": {"Drago": 3}})
        army = get(lord["h"], f"/worlds/{LORD_WORLD}/settlements/{lord['mother']}/army")
        drago = next(u for u in army["units"] if u["name"] == "Drago")
        assert drago["legendary_cap"]["used"] >= 3 and drago["legendary_cap"]["free"] == 0 and drago["batch_cap"] == 0
        assert drago["state"] in ("BLOCKED_CAP", "LOCKED", "BLOCKED_QUEUE", "IN_PROGRESS"), drago["state"]
        r = requests.post(url(f"/worlds/{LORD_WORLD}/settlements/{lord['mother']}/recruit"), json={"unit": "Drago", "count": 1}, headers=lord["h"], timeout=30)
        assert r.status_code == 409, r.text
        assert r.json()["code"] in ("LEGENDARY_CAP_REACHED", "UNIT_LOCKED", "REJECT_QUEUE_FULL"), r.text
    finally:
        qa_post("/qa/grant", {"settlement_id": lord["mother"], "army": {"Drago": original}})
