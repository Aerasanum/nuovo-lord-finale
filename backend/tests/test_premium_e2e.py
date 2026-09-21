"""Rubies / premium flows against the PUBLIC deployment (Bible §23, spec.premium, player_specialization).

Run: cd /app/backend && pytest tests/test_premium_e2e.py -o addopts='' -v
Uses the demo account (qa_1, home stl_0484bd7cfcbd40dd). Grants Rubies through the QA endpoint (store catalog is empty).
"""
from __future__ import annotations

import math
import time
import uuid

import requests

from tests.e2e_base import ADMIN_HEADERS, BASE_URL  # QA backend only
ADMIN = ADMIN_HEADERS
WORLD = "qa_1"
HOME = None  # resolved from /me at runtime
DEMO = ("demo@empirelords.com", "Demo12345!")


def url(p: str) -> str:
    return f"{BASE_URL}/api{p}"


def login(email, pw):
    r = requests.post(url("/auth/login"), json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, r.text
    h = {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}
    global HOME
    if HOME is None:
        me = requests.get(url(f"/worlds/{WORLD}/me"), headers=h, timeout=30)
        if me.status_code == 200:
            HOME = me.json()["player"]["mother_settlement_id"]
    return h


def advance(seconds: float) -> None:
    assert requests.post(url("/qa/clock/advance"), json={"seconds": seconds}, headers=ADMIN, timeout=30).status_code == 200
    for _ in range(2):
        requests.post(url("/qa/scheduler/run"), headers=ADMIN, timeout=60)
        time.sleep(0.3)


def settlement(h):
    r = requests.get(url(f"/worlds/{WORLD}/settlements/{HOME}"), headers=h, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def wait_free_queue(h):
    for _ in range(6):
        s = settlement(h)
        if not any(j["kind"] in ("BUILDING", "SETTLEMENT_UPGRADE") for j in s["jobs"]):
            return s
        advance(3600)
    return settlement(h)


class TestWallet:
    def test_wallet_and_qa_grant(self):
        h = login(*DEMO)
        w0 = requests.get(url("/wallet"), headers=h, timeout=30).json()
        assert w0["store"]["status"] == "ACTIVE" and "eld_rubies_4999" in w0["store"]["products"]  # Negozio live since iteration 34
        assert w0["cosmetics"]["items"]["house_rename"]["price_rubies"] == 500
        g = requests.post(url("/qa/rubies"), json={"email": DEMO[0], "amount": 5000}, headers=ADMIN, timeout=30).json()
        assert g["ok"] and g["rubies"] == w0["rubies"] + 5000
        w1 = requests.get(url("/wallet"), headers=h, timeout=30).json()
        assert w1["rubies"] == g["rubies"] and w1["transactions"][0]["kind"] == "QA_GRANT" and w1["transactions"][0]["amount"] == 5000
        me = requests.get(url(f"/worlds/{WORLD}/me"), headers=h, timeout=30).json()
        assert me["rubies"] == w1["rubies"]


class TestInstantFinish:
    def test_construction_finish_quote_and_pay(self):
        h = login(*DEMO)
        s = wait_free_queue(h)
        requests.post(url("/qa/grant"), json={"settlement_id": HOME, "resources": {"grain": 50000, "wood": 50000, "clay": 50000, "iron": 50000, "gold": 5000}}, headers=ADMIN, timeout=30)
        # start a cheap building upgrade (Magazzino / Boscaiolo / whichever is upgradable)
        started = None
        for name in ("Boscaiolo", "Cava di Argilla", "Miniera di Ferro", "Fattoria", "Magazzino"):
            r = requests.post(url(f"/worlds/{WORLD}/settlements/{HOME}/buildings/{name}/upgrade"), json={"idempotency_key": uuid.uuid4().hex}, headers=h, timeout=30)
            if r.status_code in (200, 201):
                started = r.json()
                break
        assert started, "no building could be upgraded"
        job = started["job"] if "job" in started else started
        jid = job["job_id"]
        q = requests.get(url(f"/worlds/{WORLD}/jobs/{jid}/finish"), headers=h, timeout=30).json()
        assert q["allowed"] is True and q["rule"] == "construction_completion"
        assert q["price_rubies"] == max(100, math.ceil(q["remaining_minutes"] * 3.0)) and q["remaining_minutes"] > 0
        before = requests.get(url("/wallet"), headers=h, timeout=30).json()["rubies"]
        assert before >= q["price_rubies"]
        key = uuid.uuid4().hex
        r = requests.post(url(f"/worlds/{WORLD}/jobs/{jid}/finish"), json={"idempotency_key": key}, headers=h, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["job"]["status"] == "COMPLETED" and d["price_rubies"] <= q["price_rubies"] and d["rubies"] == before - d["price_rubies"]
        # effect applied: building level increased
        s2 = settlement(h)
        assert s2["buildings"][job["target"]] == job["target_level"]
        # idempotent replay: same key → no second charge
        r2 = requests.post(url(f"/worlds/{WORLD}/jobs/{jid}/finish"), json={"idempotency_key": key}, headers=h, timeout=30).json()
        assert r2["replayed"] is True and r2["rubies"] == d["rubies"]
        # finished job cannot be paid again
        r3 = requests.post(url(f"/worlds/{WORLD}/jobs/{jid}/finish"), json={"idempotency_key": uuid.uuid4().hex}, headers=h, timeout=30)
        assert r3.status_code == 409 and r3.json()["code"] == "JOB_NOT_RUNNING"
        tx = requests.get(url("/wallet"), headers=h, timeout=30).json()["transactions"][0]
        assert tx["kind"] == "FINISH_JOB" and tx["amount"] == -d["price_rubies"] and tx["effect"]["job_id"] == jid

    def test_recruit_forbidden_units_and_allowed(self):
        h = login(*DEMO)
        requests.post(url("/qa/grant"), json={"settlement_id": HOME, "resources": {"grain": 90000, "wood": 90000, "clay": 90000, "iron": 90000, "gold": 9000}, "buildings": {"Caserma": 3, "Officina": 3}}, headers=ADMIN, timeout=30)
        # allowed: Fanteria
        r = requests.post(url(f"/worlds/{WORLD}/settlements/{HOME}/recruit"), json={"unit": "Fanteria", "count": 5, "idempotency_key": uuid.uuid4().hex}, headers=h, timeout=30)
        assert r.status_code in (200, 201), r.text
        jid = (r.json().get("job") or r.json())["job_id"]
        q = requests.get(url(f"/worlds/{WORLD}/jobs/{jid}/finish"), headers=h, timeout=30).json()
        assert q["allowed"] is True and q["rule"] == "recruitment_completion" and q["price_rubies"] == max(100, math.ceil(q["remaining_minutes"] * 2.5))
        army_before = int(settlement(h)["army"].get("Fanteria", 0))
        d = requests.post(url(f"/worlds/{WORLD}/jobs/{jid}/finish"), json={"idempotency_key": uuid.uuid4().hex}, headers=h, timeout=30).json()
        assert d["job"]["status"] == "COMPLETED"
        assert int(settlement(h)["army"]["Fanteria"]) == army_before + 5
        # forbidden: Carro di Conquista (special) — quote refuses, POST 409 FORBIDDEN_UNIT
        r = requests.post(url(f"/worlds/{WORLD}/settlements/{HOME}/recruit"), json={"unit": "Carro di Conquista", "count": 1, "idempotency_key": uuid.uuid4().hex}, headers=h, timeout=30)
        if r.status_code in (200, 201):
            jid2 = (r.json().get("job") or r.json())["job_id"]
            q2 = requests.get(url(f"/worlds/{WORLD}/jobs/{jid2}/finish"), headers=h, timeout=30).json()
            assert q2["allowed"] is False and q2["reason"] == "FORBIDDEN_UNIT"
            r2 = requests.post(url(f"/worlds/{WORLD}/jobs/{jid2}/finish"), json={"idempotency_key": uuid.uuid4().hex}, headers=h, timeout=30)
            assert r2.status_code == 409 and r2.json()["code"] == "FORBIDDEN_UNIT"
            requests.post(url(f"/worlds/{WORLD}/jobs/{jid2}/cancel"), headers=h, timeout=30)

    def test_insufficient_rubies(self):
        h = login(*DEMO)
        # drain: spend on a rename to a random name is expensive to undo; instead compute a job pricier than wallet by asserting error path with a huge job is impractical →
        # emulate: check that 409 INSUFFICIENT_RUBIES is returned when wallet < price using a fresh account
        email = f"poor_{uuid.uuid4().hex[:6]}@empirelords.com"
        r = requests.post(url("/auth/register"), json={"email": email, "password": "Poor12345!", "display_name": "Poor"}, timeout=30)
        hp = {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}
        assert requests.post(url(f"/worlds/{WORLD}/join"), json={"house_name": f"Casa Povera {uuid.uuid4().hex[:4]}"}, headers=hp, timeout=60).status_code in (200, 201)
        me = requests.get(url(f"/worlds/{WORLD}/me"), headers=hp, timeout=30).json()
        sid = me["settlements"][0]["settlement_id"]
        requests.post(url("/qa/grant"), json={"settlement_id": sid, "resources": {"grain": 5000, "wood": 5000, "clay": 5000, "iron": 5000, "gold": 500}}, headers=ADMIN, timeout=30)
        started = None
        for name in ("Magazzino", "Boscaiolo", "Fattoria", "Cava di Argilla", "Miniera di Ferro"):
            r = requests.post(url(f"/worlds/{WORLD}/settlements/{sid}/buildings/{name}/upgrade"), json={"idempotency_key": uuid.uuid4().hex}, headers=hp, timeout=30)
            if r.status_code in (200, 201):
                started = r.json()
                break
        if not started:  # fresh L1 settlement: upgrade the settlement itself instead
            r = requests.post(url(f"/worlds/{WORLD}/settlements/{sid}/upgrade"), json={"idempotency_key": uuid.uuid4().hex}, headers=hp, timeout=30)
            assert r.status_code in (200, 201), r.text
            started = r.json()
        jid = (started.get("job") or started)["job_id"]
        r = requests.post(url(f"/worlds/{WORLD}/jobs/{jid}/finish"), json={"idempotency_key": uuid.uuid4().hex}, headers=hp, timeout=30)
        assert r.status_code == 409 and r.json()["code"] == "INSUFFICIENT_RUBIES", r.text
        # job still running with original ETA (rollback)
        s = requests.get(url(f"/worlds/{WORLD}/settlements/{sid}"), headers=hp, timeout=30).json()
        assert any(j["job_id"] == jid and j["status"] == "RUNNING" for j in s["jobs"])


class TestCosmeticsAndSpecialization:
    def test_house_rename_costs_rubies(self):
        h = login(*DEMO)
        me = requests.get(url(f"/worlds/{WORLD}/me"), headers=h, timeout=30).json()
        old = me["player"]["house_name"]
        before = me["rubies"]
        r = requests.post(url(f"/worlds/{WORLD}/house/rename"), json={"house_name": "Casa Rivale", "idempotency_key": uuid.uuid4().hex}, headers=h, timeout=30)
        assert r.status_code == 409 and r.json()["code"] == "HOUSE_NAME_TAKEN"
        r = requests.post(url(f"/worlds/{WORLD}/house/rename"), json={"house_name": "Casa Demo Rinominata", "idempotency_key": uuid.uuid4().hex}, headers=h, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["house"]["house_name"] == "Casa Demo Rinominata" and d["price_rubies"] == 500 and d["rubies"] == before - 500
        me2 = requests.get(url(f"/worlds/{WORLD}/me"), headers=h, timeout=30).json()
        assert me2["player"]["house_name"] == "Casa Demo Rinominata" and me2["settlements"][0]["owner_house_name"] == "Casa Demo Rinominata"
        al = requests.get(url(f"/worlds/{WORLD}/alliance"), headers=h, timeout=30).json()["alliance"]
        assert any(m["is_me"] and m["house_name"] == "Casa Demo Rinominata" for m in al["members"])
        # rename back (keeps fixtures stable)
        r = requests.post(url(f"/worlds/{WORLD}/house/rename"), json={"house_name": old, "idempotency_key": uuid.uuid4().hex}, headers=h, timeout=30)
        assert r.status_code == 200 and r.json()["house"]["house_name"] == old
        hist = requests.get(url(f"/worlds/{WORLD}/house"), headers=h, timeout=30).json()["house"]["history"]
        assert any(x.get("kind") == "RENAMED" for x in hist)

    def test_house_description(self):
        h = login(*DEMO)
        r = requests.put(url(f"/worlds/{WORLD}/house"), json={"description": "La Casata dei Lord del Drago, fondata sulle rive occidentali."}, headers=h, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["house"]["description"].startswith("La Casata dei Lord")
        r = requests.put(url(f"/worlds/{WORLD}/house"), json={"description": "x" * 301}, headers=h, timeout=30)
        assert r.status_code == 400 and r.json()["code"] == "INVALID_DESCRIPTION"

    def test_alliance_rename(self):
        h = login(*DEMO)
        r = requests.put(url(f"/worlds/{WORLD}/alliance/settings"), json={"name": "Terza Via", "description": "x"}, headers=h, timeout=30)
        assert r.status_code == 409 and r.json()["code"] == "ALLIANCE_NAME_TAKEN"
        r = requests.put(url(f"/worlds/{WORLD}/alliance/settings"), json={"name": "Lords Demo Rinnovati", "description": "Alleanza di test rinominata"}, headers=h, timeout=30)
        assert r.status_code == 200, r.text
        a = requests.get(url(f"/worlds/{WORLD}/alliance"), headers=h, timeout=30).json()["alliance"]
        assert a["name"] == "Lords Demo Rinnovati" and a["description"] == "Alleanza di test rinominata"
        me = requests.get(url(f"/worlds/{WORLD}/me"), headers=h, timeout=30).json()
        assert me["player"]["alliance"]["name"] == "Lords Demo Rinnovati"
        assert requests.put(url(f"/worlds/{WORLD}/alliance/settings"), json={"name": "Lords Demo", "description": "Alleanza di test"}, headers=h, timeout=30).status_code == 200

    def test_specialization_first_free_then_paid(self):
        h = login(*DEMO)
        st = requests.get(url(f"/worlds/{WORLD}/specialization"), headers=h, timeout=30).json()
        assert set(st["choices"]) == {"ATTACKER", "DEFENDER"} and st["required_settlements"] == 3
        if not st["available"]:
            r = requests.post(url(f"/worlds/{WORLD}/specialization"), json={"choice": "ATTACKER", "idempotency_key": uuid.uuid4().hex}, headers=h, timeout=30)
            assert r.status_code == 409 and r.json()["code"] == "SPECIALIZATION_LOCKED"
            return
        r = requests.post(url(f"/worlds/{WORLD}/specialization"), json={"choice": "BANANA", "idempotency_key": uuid.uuid4().hex}, headers=h, timeout=30)
        assert r.status_code == 400
        target = "DEFENDER" if st["current"] == "ATTACKER" else "ATTACKER"
        expect_price = 0 if st["current"] is None else 2500
        r = requests.post(url(f"/worlds/{WORLD}/specialization"), json={"choice": target, "idempotency_key": uuid.uuid4().hex}, headers=h, timeout=30)
        if r.status_code == 409:
            assert r.json()["code"] in ("COOLDOWN", "AT_WAR", "ACTIVE_SIEGE", "ACTIVE_MILITARY_MARCH"), r.text
            return
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["current"] == target and d["price_rubies"] == 2500 and d["cooldown_until"]
        if expect_price:
            assert d["rubies"] == st["rubies"] - 2500
        # immediate second change → COOLDOWN
        r = requests.post(url(f"/worlds/{WORLD}/specialization"), json={"choice": "DEFENDER" if target == "ATTACKER" else "ATTACKER", "idempotency_key": uuid.uuid4().hex}, headers=h, timeout=30)
        assert r.status_code == 409 and r.json()["code"] in ("COOLDOWN", "AT_WAR", "ACTIVE_MILITARY_MARCH")
