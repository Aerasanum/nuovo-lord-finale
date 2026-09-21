"""Iteration 33 — march skins as Prestige rewards (500/2000/5000 or owning the creature), the «Riepilogo rientro»
digest (armed after ≥ 6 h between sessions) and the Inbox skin-unlock reward.

Run: cd /app/backend && pytest tests/test_iteration_33_return_skins.py -o addopts='' -v
"""
from __future__ import annotations

import uuid

import requests
from dotenv import load_dotenv
from tests.paths import FRONTEND_DIR, FRONTEND_ENV

load_dotenv(FRONTEND_ENV)
from tests.e2e_base import ADMIN_HEADERS, BASE_URL, track_player  # QA backend only
WORLD = "qa_1"


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


def qa(p, body=None):
    r = requests.post(url(p), json=body or {}, headers=ADMIN_HEADERS, timeout=60)
    assert r.status_code == 200, r.text
    return r.json()


def fresh_account():
    tag = uuid.uuid4().hex[:8]
    r = requests.post(url("/auth/register"), json={"email": f"qa-skin-{tag}@example.com", "password": "Qa12345!x", "display_name": f"QA {tag}"}, timeout=30)
    assert r.status_code in (200, 201), r.text
    h = {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}
    post(h, f"/worlds/{WORLD}/join", {"house_name": f"Casa Skin {tag}"})
    me = get(h, f"/worlds/{WORLD}/me")
    track_player(me["player"]["player_id"])
    return {"h": h, "player_id": me["player"]["player_id"], "mother": me["player"]["mother_settlement_id"], "me": me}


def test_skin_catalog_exposes_prestige_thresholds_and_locks():
    acc = fresh_account()
    hs = get(acc["h"], f"/worlds/{WORLD}/house")
    skins = {s["key"]: s for s in hs["catalog"]["march_skins"]}
    assert skins["falcon"]["prestige_required"] == 500 and skins["elephant"]["prestige_required"] == 2000 and skins["dragon"]["prestige_required"] == 5000
    assert skins["classic"]["prestige_required"] is None
    assert hs["march_skin_unlocks"] == {"classic": True, "dragon": False, "elephant": False, "falcon": False}
    r = requests.put(url(f"/worlds/{WORLD}/house"), json={"march_skin": "falcon"}, headers=acc["h"], timeout=30)
    assert r.status_code == 409 and r.json()["code"] == "MARCH_SKIN_LOCKED" and r.json()["details"]["prestige_required"] == 500, r.text


def test_prestige_unlocks_skins_and_rewards_inbox():
    acc = fresh_account()
    # +600 Prestige in one grant crosses the Falco threshold (500): unlock + Inbox reward
    res = qa("/qa/prestige", {"player_id": acc["player_id"], "points": 600})
    assert res["prestige"] >= 600
    hs = get(acc["h"], f"/worlds/{WORLD}/house")
    assert hs["house"]["prestige"] >= 600
    assert hs["march_skin_unlocks"]["falcon"] is True and hs["march_skin_unlocks"]["elephant"] is False
    hs2 = requests.put(url(f"/worlds/{WORLD}/house"), json={"march_skin": "falcon"}, headers=acc["h"], timeout=30)
    assert hs2.status_code == 200 and hs2.json()["house"]["march_skin"] == "falcon", hs2.text
    inbox = get(acc["h"], f"/worlds/{WORLD}/inbox")
    hits = [n for n in inbox["items"] if n["event"] == "MARCH_SKIN_UNLOCKED"]
    assert len(hits) == 1 and hits[0]["payload"]["skin"] == "falcon" and hits[0]["payload"]["prestige_required"] == 500


def test_owning_the_creature_still_unlocks():
    acc = fresh_account()
    qa("/qa/grant", {"settlement_id": acc["mother"], "army": {"Falco": 1}})
    hs = get(acc["h"], f"/worlds/{WORLD}/house")
    assert hs["march_skin_unlocks"]["falcon"] is True and hs["march_skin_unlocks"]["dragon"] is False


def test_return_summary_armed_and_digest():
    acc = fresh_account()
    assert acc["me"]["player"]["return_pending"] is False
    r = requests.get(url(f"/worlds/{WORLD}/return-summary"), headers=acc["h"], timeout=30)
    assert r.status_code == 404 and r.json()["code"] == "NO_RETURN_WINDOW"
    qa("/qa/return-summary/arm", {"player_id": acc["player_id"], "hours_ago": 9})
    me = get(acc["h"], f"/worlds/{WORLD}/me")
    assert me["player"]["return_pending"] is True and me["player"]["return_since"]
    d = get(acc["h"], f"/worlds/{WORLD}/return-summary")
    assert 8.9 <= d["hours_away"] <= 9.2 and d["pending"] is True
    assert d["battles"]["total"] == 0 and d["marches"]["completed"] == 0 and d["settlements"] == 1
    assert set(d["resources_produced"]) >= {"grain", "wood", "clay", "iron", "gold"}
    assert d["resources_produced"]["grain"] > 0  # Fattoria 1 × 9 h, capped by the warehouse
    assert isinstance(d["alerts"], list) and isinstance(d["jobs"]["counts"], dict)
    post(acc["h"], f"/worlds/{WORLD}/return-summary/seen")
    me = get(acc["h"], f"/worlds/{WORLD}/me")
    assert me["player"]["return_pending"] is False
    # QA override window still works after dismissal
    d2 = get(acc["h"], f"/worlds/{WORLD}/return-summary", since="2020-01-01T00:00:00Z")
    assert d2["pending"] is False and d2["hours_away"] > 1000


def test_touch_arms_return_after_long_gap():
    acc = fresh_account()
    # pretend the last activity was 7 h ago; the next authenticated request arms the digest
    qa("/qa/inactivity/touch", {"player_id": acc["player_id"], "days_ago": 7 / 24})
    me = get(acc["h"], f"/worlds/{WORLD}/me")
    assert me["player"]["return_pending"] is True
    since = me["player"]["return_since"]
    d = get(acc["h"], f"/worlds/{WORLD}/return-summary")
    assert 6.9 <= d["hours_away"] <= 7.2 and d["since"] == since
    # a short gap (2 h) does not re-arm after dismissal
    post(acc["h"], f"/worlds/{WORLD}/return-summary/seen")
    qa("/qa/inactivity/touch", {"player_id": acc["player_id"], "days_ago": 2 / 24})
    me = get(acc["h"], f"/worlds/{WORLD}/me")
    assert me["player"]["return_pending"] is False


def test_rainbow_flag_in_march_dto_and_gallery_assets():
    for name in ("rainbow_0.jpg", "rainbow_1.jpg", "rainbow_conquest_0.jpg", "rainbow_conquest_1.jpg"):
        assert (FRONTEND_DIR / "assets" / "cinematics" / name).exists(), name
