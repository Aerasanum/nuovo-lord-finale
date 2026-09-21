"""Iteration 34 — Negozio: Ruby packs (Google Play via RevenueCat webhook, server grant), premium castle skins for
Rubies, first-purchase ×10 on the 49.99 € pack, 200 Orsi pending reward claimed in a world, idempotency.

Run: cd /app/backend && pytest tests/test_iteration_34_store.py -o addopts='' -v
"""
from __future__ import annotations

import os
import uuid

import requests
from dotenv import load_dotenv
from tests.paths import BACKEND_ENV, FRONTEND_ENV

load_dotenv(FRONTEND_ENV)
load_dotenv(BACKEND_ENV)
from tests.e2e_base import ADMIN_HEADERS, BASE_URL, track_player  # QA backend only
RC_AUTH = {"Authorization": f"Bearer {os.environ['RC_WEBHOOK_AUTH']}", "Content-Type": "application/json"}
WORLD = "qa_1"


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
    r = requests.post(url(p), json=body or {}, headers=ADMIN_HEADERS, timeout=60)
    assert r.status_code == 200, r.text
    return r.json()


def fresh_account():
    tag = uuid.uuid4().hex[:8]
    email = f"qa-store-{tag}@example.com"
    r = requests.post(url("/auth/register"), json={"email": email, "password": "Qa12345!x", "display_name": f"QA {tag}"}, timeout=30)
    assert r.status_code in (200, 201), r.text
    h = {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}
    post(h, f"/worlds/{WORLD}/join", {"house_name": f"Casa Store {tag}"})
    me = get(h, f"/worlds/{WORLD}/me")
    track_player(me["player"]["player_id"])
    return {"h": h, "email": email, "account_id": r.json()["account"]["account_id"], "player_id": me["player"]["player_id"], "mother": me["player"]["mother_settlement_id"]}


def rc_event(app_user_id: str, product_id: str, tx: str, **over):
    ev = {"id": f"evt_{tx}", "type": "NON_RENEWING_PURCHASE", "app_user_id": app_user_id, "product_id": product_id, "transaction_id": tx, "original_transaction_id": tx, "store": "PLAY_STORE", "environment": "SANDBOX"}
    ev.update(over)
    return {"api_version": "1.0", "event": ev}


def test_catalog_shape():
    acc = fresh_account()
    o = get(acc["h"], "/store")
    packs = {p["product_id"]: p for p in o["packs"]}
    assert packs["eld_rubies_199"]["price_eur"] == 1.99 and packs["eld_rubies_199"]["bonus"] == {"type": "CASTLE_SKIN", "tier": 300}
    assert packs["eld_rubies_499"]["bonus"]["units"] == {"Orso": 200}
    assert packs["eld_rubies_4999"]["bonus"] == {"type": "FIRST_PURCHASE_MULTIPLIER", "mult": 10, "available": True}
    skins = {s["id"]: s for s in o["skins"]}
    assert len(skins) == 9 and skins["frost"]["price_rubies"] == 300 and skins["light"]["price_rubies"] == 600 and skins["dragon"]["price_rubies"] == 900
    assert all(not s["owned"] for s in o["skins"]) and o["billing"]["channel"] == "GOOGLE_PLAY"


def test_buy_skin_with_rubies_and_apply_to_castle():
    acc = fresh_account()
    r = requests.post(url("/store/skins/dragon/buy"), json={"idempotency_key": "k1"}, headers=acc["h"], timeout=30)
    assert r.status_code == 409 and r.json()["code"] == "INSUFFICIENT_RUBIES", r.text
    qa("/qa/rubies", {"email": acc["email"], "amount": 1000})
    o = get(acc["h"], "/store")
    assert o["rubies"] == 1000
    key = uuid.uuid4().hex
    d = post(acc["h"], "/store/skins/dragon/buy", {"idempotency_key": key, "world_id": WORLD})
    assert d["bought"] == "dragon" and d["price_rubies"] == 900 and d["replayed"] is False and d["rubies"] == o["rubies"] - 900
    assert {s["id"]: s["owned"] for s in d["skins"]}["dragon"] is True
    # replay with the same key → no second debit
    d2 = post(acc["h"], "/store/skins/dragon/buy", {"idempotency_key": key, "world_id": WORLD})
    assert d2["replayed"] is True and d2["rubies"] == d["rubies"]
    r = requests.post(url("/store/skins/dragon/buy"), json={"idempotency_key": uuid.uuid4().hex}, headers=acc["h"], timeout=30)
    assert r.status_code == 409 and r.json()["code"] == "SKIN_ALREADY_OWNED"
    # settlement skin catalogue: premium entries, dragon unlocked, demon locked with price
    cat = get(acc["h"], f"/worlds/{WORLD}/settlements/{acc['mother']}/skins")
    by = {s["id"]: s for s in cat["skins"]}
    assert by["dragon"]["premium"] and by["dragon"]["unlocked"] and by["demon"]["unlocked"] is False and by["demon"]["price_rubies"] == 900 and by["classic"]["unlocked"]
    r = requests.put(url(f"/worlds/{WORLD}/settlements/{acc['mother']}/skin"), json={"skin": "demon"}, headers=acc["h"], timeout=30)
    assert r.status_code == 409 and r.json()["code"] == "SKIN_NOT_OWNED"
    r = requests.put(url(f"/worlds/{WORLD}/settlements/{acc['mother']}/skin"), json={"skin": "dragon"}, headers=acc["h"], timeout=30)
    assert r.status_code == 200 and r.json()["current"] == "dragon", r.text
    w = get(acc["h"], "/wallet")
    assert w["transactions"][0]["kind"] == "CASTLE_SKIN_PURCHASE" and w["transactions"][0]["amount"] == -900


def test_webhook_grants_once_and_first_purchase_x10():
    acc = fresh_account()
    bad = requests.post(url("/webhooks/revenuecat"), json=rc_event(acc["account_id"], "eld_rubies_4999", "GPA.1"), headers={"Authorization": "Bearer wrong"}, timeout=30)
    assert bad.status_code == 401
    tx = f"GPA.{uuid.uuid4().hex[:10]}"
    r = requests.post(url("/webhooks/revenuecat"), json=rc_event(acc["account_id"], "eld_rubies_4999", tx), headers=RC_AUTH, timeout=30)
    assert r.status_code == 200 and r.json()["rubies_granted"] == 65000 and r.json()["bonus_result"]["applied"] is True and r.json()["replayed"] is False, r.text
    # RevenueCat retry → same transaction, no double grant
    r2 = requests.post(url("/webhooks/revenuecat"), json=rc_event(acc["account_id"], "eld_rubies_4999", tx), headers=RC_AUTH, timeout=30)
    assert r2.status_code == 200 and r2.json()["replayed"] is True
    o = get(acc["h"], "/store")
    assert o["rubies"] == 65000 and o["purchases"] == 1
    assert {p["product_id"]: p for p in o["packs"]}["eld_rubies_4999"]["bonus"]["available"] is False
    # second purchase of the same pack → base amount
    r3 = requests.post(url("/webhooks/revenuecat"), json=rc_event(acc["account_id"], "eld_rubies_4999", f"GPA.{uuid.uuid4().hex[:10]}"), headers=RC_AUTH, timeout=30)
    assert r3.json()["rubies_granted"] == 6500 and r3.json()["bonus_result"]["applied"] is False
    assert get(acc["h"], "/store")["rubies"] == 71500
    # ignored events never fail (RevenueCat must stop retrying)
    ig = requests.post(url("/webhooks/revenuecat"), json=rc_event(acc["account_id"], "eld_rubies_4999", "GPA.x", environment="PRODUCTION"), headers=RC_AUTH, timeout=30)
    assert ig.status_code == 200 and ig.json()["ignored"] and ig.json()["reason"] == "wrong_environment"
    un = requests.post(url("/webhooks/revenuecat"), json=rc_event("acc_nobody", "eld_rubies_199", "GPA.y"), headers=RC_AUTH, timeout=30)
    assert un.status_code == 200 and un.json()["unmatched"] is True
    inbox = get(acc["h"], f"/worlds/{WORLD}/inbox")
    hits = [n for n in inbox["items"] if n["event"] == "STORE_PURCHASE"]
    assert len(hits) == 2 and hits[0]["payload"]["product_id"] == "eld_rubies_4999"


def test_pack_bonuses_skin_and_bears_claim():
    acc = fresh_account()
    # 1.99 € → 200 Rubies + first unowned 300-tier skin (frost), then sylvan, then ocean, then Rubies instead
    got = []
    for _ in range(4):
        res = qa("/qa/store/purchase", {"email": acc["email"], "product_id": "eld_rubies_199"})
        got.append(res["bonus_result"])
    assert [g.get("skin") for g in got] == ["frost", "sylvan", "ocean", None] and got[3]["rubies_instead"] == 300
    o = get(acc["h"], "/store")
    assert o["rubies"] == 4 * 200 + 300 and {s["id"] for s in o["skins"] if s["owned"]} == {"frost", "sylvan", "ocean"}
    # 4.99 € → 500 Rubies + 200 Orsi pending, claimed into the Mother of this world
    res = qa("/qa/store/purchase", {"account_id": acc["account_id"], "product_id": "eld_rubies_499"})
    assert res["bonus_result"]["units"] == {"Orso": 200}
    o = get(acc["h"], "/store")
    assert len(o["pending_rewards"]) == 1 and o["pending_rewards"][0]["units"] == {"Orso": 200}
    c = post(acc["h"], f"/worlds/{WORLD}/store/claim")
    assert c["delivered"][0]["units"] == {"Orso": 200} and c["settlement_id"] == acc["mother"] and c["pending_rewards"] == []
    army = get(acc["h"], f"/worlds/{WORLD}/settlements/{acc['mother']}/army")
    assert army["army"].get("Orso") == 200
    r = requests.post(url(f"/worlds/{WORLD}/store/claim"), headers=acc["h"], timeout=30)
    assert r.status_code == 409 and r.json()["code"] == "NOTHING_TO_CLAIM"
    inbox = get(acc["h"], f"/worlds/{WORLD}/inbox")
    assert any(n["event"] == "STORE_REWARD_DELIVERED" and n["payload"]["units"] == {"Orso": 200} for n in inbox["items"])
    # unknown product is rejected by the QA path (server catalog is authoritative)
    r = requests.post(url("/qa/store/purchase"), json={"account_id": acc["account_id"], "product_id": "eld_rubies_777"}, headers=ADMIN_HEADERS, timeout=30)
    assert r.status_code == 400 and r.json()["code"] == "UNKNOWN_PRODUCT"
