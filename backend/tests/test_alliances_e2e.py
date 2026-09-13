"""Alliance flows against the PUBLIC deployment (Bible §19 / §34.7 / §40) — fixture + verification.

Run: cd /app/backend && pytest tests/test_alliances_e2e.py -o addopts='' -v
Accounts: demo (leader of the STRUCTURED alliance), rival (leader of a MERCENARY alliance), ally (fresh account joining
demo's alliance), third (fresh account: leader of a second STRUCTURED alliance used as war/contract target).
Leaves the world with: demo alliance [DEMO] STRUCTURED (demo LEADER, ally VICE), rival [MERC] MERCENARY,
third [TRZ] STRUCTURED; an ACTIVE mercenary contract (MERC vs TRZ, hired by DEMO) and chat history.
"""
from __future__ import annotations

import time
import uuid

import pytest
import requests

from tests.e2e_base import BASE_URL  # QA backend only
ADMIN_HEADERS = {"X-Admin-Key": "eld-admin-7f3c9a1d2b4e", "Content-Type": "application/json"}
WORLD = "qa_1"
DEMO = ("demo@empirelords.com", "Demo12345!", None, None)
RIVAL = ("rival@empirelords.com", "Rival12345!", "RivalLord", "Casa Rivale")
ALLY = ("ally@empirelords.com", "Ally12345!", "AllyLord", "Casa Alleata")
THIRD = ("third@empirelords.com", "Third12345!", "ThirdLord", "Casa Terza")


def url(p: str) -> str:
    return f"{BASE_URL}/api{p}"


def auth(email: str, password: str, display: str | None, house: str | None) -> dict:
    r = requests.post(url("/auth/login"), json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200 and display:
        r = requests.post(url("/auth/register"), json={"email": email, "password": password, "display_name": display}, timeout=30)
    assert r.status_code == 200, r.text
    h = {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}
    me = requests.get(url(f"/worlds/{WORLD}/me"), headers=h, timeout=30)
    if me.status_code != 200 and house:
        assert requests.post(url(f"/worlds/{WORLD}/join"), json={"house_name": house}, headers=h, timeout=60).status_code in (200, 201)
        me = requests.get(url(f"/worlds/{WORLD}/me"), headers=h, timeout=30)
    assert me.status_code == 200, me.text
    return {"h": h, "me": me.json(), "player_id": me.json()["player"]["player_id"], "house": me.json()["player"]["house_name"]}


def advance(seconds: float) -> None:
    assert requests.post(url("/qa/clock/advance"), json={"seconds": seconds}, headers=ADMIN_HEADERS, timeout=30).status_code == 200
    for _ in range(3):
        requests.post(url("/qa/scheduler/run"), headers=ADMIN_HEADERS, timeout=60)
        time.sleep(0.4)


def my_alliance(h: dict) -> dict:
    r = requests.get(url(f"/worlds/{WORLD}/alliance"), headers=h, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def leave_if_member(acc: dict) -> None:
    """Fixture hygiene: make the account a lone wolf (dissolve if leader, else leave immediately via 12h advance)."""
    a = my_alliance(acc["h"])["alliance"]
    if not a:
        return
    if a["my_role"] == "LEADER":
        requests.post(url(f"/worlds/{WORLD}/alliance/dissolve"), headers=acc["h"], timeout=30)
    else:
        requests.post(url(f"/worlds/{WORLD}/alliance/leave"), headers=acc["h"], timeout=30)
        advance(12 * 3600 + 60)
    # cooldown 24h (72h if at war)
    advance(73 * 3600)


@pytest.fixture(scope="session")
def demo():
    return auth(*DEMO)


@pytest.fixture(scope="session")
def rival():
    return auth(*RIVAL)


@pytest.fixture(scope="session")
def ally():
    return auth(*ALLY)


@pytest.fixture(scope="session")
def third():
    return auth(*THIRD)


@pytest.fixture(scope="session", autouse=True)
def clean_slate(demo, rival, ally, third):
    for acc in (ally, third, rival, demo):
        leave_if_member(acc)


def post(h, p, body=None, code=200):
    r = requests.post(url(p), json=body or {}, headers=h, timeout=60)
    assert r.status_code == code, f"{p} → {r.status_code} {r.text}"
    return r.json()


class TestMembership:
    def test_create_and_directory(self, demo, rival, third):
        a = post(demo["h"], f"/worlds/{WORLD}/alliances", {"name": "Lords Demo", "tag": "demo", "kind": "STRUCTURED", "description": "Alleanza di test"}, 201)
        assert a["kind"] == "STRUCTURED" and a["tag"] == "DEMO" and a["cap"] == 100 and a["my_role"] == "LEADER" and a["emeralds"] == 0
        assert set(a["permissions"]) >= {"invite", "pna", "war_proposal", "treasury", "mercenary", "dissolve", "transfer_leadership", "chat"}
        assert a["pyramid_eligible"] is True
        m = post(rival["h"], f"/worlds/{WORLD}/alliances", {"name": "Lame Assoldate", "tag": "MERC", "kind": "MERCENARY"}, 201)
        assert m["kind"] == "MERCENARY" and m["cap"] == 5 and m["pyramid_eligible"] is False
        t = post(third["h"], f"/worlds/{WORLD}/alliances", {"name": "Terza Via", "tag": "TRZ", "kind": "STRUCTURED"}, 201)
        assert t["kind"] == "STRUCTURED"
        # duplicates / validation
        r = requests.post(url(f"/worlds/{WORLD}/alliances"), json={"name": "Altra", "tag": "DEMO", "kind": "STRUCTURED"}, headers=third["h"], timeout=30)
        assert r.json()["code"] == "ALREADY_IN_ALLIANCE"
        lst = requests.get(url(f"/worlds/{WORLD}/alliances"), headers=demo["h"], timeout=30).json()
        tags = {x["tag"]: x for x in lst["alliances"]}
        assert {"DEMO", "MERC", "TRZ"} <= set(tags) and tags["MERC"]["kind"] == "MERCENARY" and lst["caps"]["MERCENARY_ALLIANCE"] == 5
        me = requests.get(url(f"/worlds/{WORLD}/me"), headers=demo["h"], timeout=30).json()["player"]
        assert me["alliance"]["tag"] == "DEMO" and me["alliance"]["role"] == "LEADER"

    def test_invite_accept_roles(self, demo, ally, rival):
        inv = post(demo["h"], f"/worlds/{WORLD}/alliance/invites", {"house_name": ally["house"], "role": "MEMBER"})
        assert inv["status"] == "PENDING" and inv["alliance_tag"] == "DEMO"
        r = requests.post(url(f"/worlds/{WORLD}/alliance/invites"), json={"house_name": ally["house"]}, headers=demo["h"], timeout=30)
        assert r.json()["code"] == "INVITE_PENDING"
        # invitee sees it in /alliance and in the inbox
        mine = my_alliance(ally["h"])
        assert mine["alliance"] is None and any(i["invite_id"] == inv["invite_id"] for i in mine["invites"])
        inbox = requests.get(url(f"/worlds/{WORLD}/inbox"), headers=ally["h"], timeout=30).json()["items"]
        assert any(n["event"] == "ALLIANCE_INVITE" and n["payload"]["invite_id"] == inv["invite_id"] for n in inbox)
        res = post(ally["h"], f"/worlds/{WORLD}/alliance/invites/{inv['invite_id']}/respond", {"accept": True})
        assert res["status"] == "ACCEPTED"
        a = my_alliance(ally["h"])["alliance"]
        assert a["my_role"] == "MEMBER" and a["member_count"] == 2 and a["emeralds"] is None and "treasury" not in a["permissions"] and "chat" in a["permissions"]
        # member cannot invite / promote
        r = requests.post(url(f"/worlds/{WORLD}/alliance/invites"), json={"house_name": rival["house"]}, headers=ally["h"], timeout=30)
        assert r.status_code == 403 and r.json()["code"] == "ALLIANCE_FORBIDDEN"
        # leader promotes to VICE → treasury visible
        post(demo["h"], f"/worlds/{WORLD}/alliance/members/{ally['player_id']}/role", {"role": "VICE"})
        a = my_alliance(ally["h"])["alliance"]
        assert a["my_role"] == "VICE" and a["emeralds"] == 0 and "treasury" in a["permissions"]
        # rival (in MERC) cannot be invited
        r = requests.post(url(f"/worlds/{WORLD}/alliance/invites"), json={"house_name": rival["house"]}, headers=demo["h"], timeout=30)
        assert r.json()["code"] == "PLAYER_IN_ALLIANCE"
        # settlements of the ally are ALLY faction for demo (map DTO) and carry the tag
        sid = ally["me"]["settlements"][0]["settlement_id"]
        pub = requests.get(url(f"/worlds/{WORLD}/settlements/{sid}/public"), headers=demo["h"], timeout=30)
        if pub.status_code == 200:
            assert pub.json()["faction"] == "ALLY" and pub.json()["owner_alliance_tag"] == "DEMO"

    def test_chat(self, demo, ally):
        m = post(demo["h"], f"/worlds/{WORLD}/alliance/chat", {"text": "Benvenuti nella Casa Demo!"}, 201)
        assert m["house_name"] == demo["house"] and m["role"] == "LEADER"
        post(ally["h"], f"/worlds/{WORLD}/alliance/chat", {"text": "Grazie, Leader."}, 201)
        msgs = requests.get(url(f"/worlds/{WORLD}/alliance/chat"), headers=ally["h"], timeout=30).json()["messages"]
        texts = [x["text"] for x in msgs]
        assert "Benvenuti nella Casa Demo!" in texts and "Grazie, Leader." in texts and texts.index("Benvenuti nella Casa Demo!") < texts.index("Grazie, Leader.")
        assert any(x["role"] == "SYSTEM" for x in msgs)  # join announcement
        after = requests.get(url(f"/worlds/{WORLD}/alliance/chat"), params={"after": msgs[-2]["at"]}, headers=ally["h"], timeout=30).json()["messages"]
        assert [x["text"] for x in after] == ["Grazie, Leader."]

    def test_leave_pending_and_cancel(self, demo, ally):
        lv = post(ally["h"], f"/worlds/{WORLD}/alliance/leave")
        assert lv["leaving_at"]
        a = my_alliance(ally["h"])["alliance"]
        assert next(x for x in a["members"] if x["is_me"])["leaving_at"]
        post(ally["h"], f"/worlds/{WORLD}/alliance/leave/cancel")
        a = my_alliance(ally["h"])["alliance"]
        assert next(x for x in a["members"] if x["is_me"])["leaving_at"] is None


class TestDiplomacy:
    def test_pna_and_hostile_gate(self, demo, third):
        trz = my_alliance(third["h"])["alliance"]["alliance_id"]
        rel = post(demo["h"], f"/worlds/{WORLD}/alliance/diplomacy/{trz}/pna_propose")
        assert rel["state"] == "NEUTRAL" and rel["pna_proposal"]["mine"] is True
        rel = post(third["h"], f"/worlds/{WORLD}/alliance/diplomacy/{my_alliance(demo['h'])['alliance']['alliance_id']}/pna_accept")
        assert rel["state"] == "PNA"
        # attack against a PNA partner is blocked at launch
        tgt = third["me"]["settlements"][0]["settlement_id"]
        origin = demo["me"]["settlements"][0]["settlement_id"]
        requests.post(url("/qa/grant"), json={"settlement_id": tgt, "end_pvp_shield": True}, headers=ADMIN_HEADERS, timeout=30)
        r = requests.post(url(f"/worlds/{WORLD}/marches"), json={"origin_settlement_id": origin, "target_settlement_id": tgt, "mission": "ATTACK", "units": {"Fanteria": 10}, "idempotency_key": uuid.uuid4().hex}, headers=demo["h"], timeout=60)
        assert r.status_code == 409 and r.json()["code"] in ("DIPLOMACY_BLOCKS_ATTACK", "PVP_SHIELD_ACTIVE"), r.text
        # termination → 12h notice, still blocked, then NEUTRAL
        rel = post(demo["h"], f"/worlds/{WORLD}/alliance/diplomacy/{trz}/pna_terminate")
        assert rel["state"] == "PNA_NOTICE" and rel["until"]
        advance(12 * 3600 + 120)
        a = my_alliance(demo["h"])["alliance"]
        assert not any(x["alliance_id"] == trz and x["state"] != "NEUTRAL" for x in a["relations"])

    def test_war_vote_and_peace(self, demo, ally, third):
        demo_id = my_alliance(demo["h"])["alliance"]["alliance_id"]
        trz = my_alliance(third["h"])["alliance"]["alliance_id"]
        # eligible: demo (LEADER) + ally (VICE) → needed 2; proposer auto-votes yes → still OPEN
        v = post(demo["h"], f"/worlds/{WORLD}/alliance/diplomacy/{trz}/war_propose")
        assert v["status"] == "OPEN" and v["eligible"] == 2 and v["needed"] == 2 and v["yes"] == 1
        a = my_alliance(ally["h"])["alliance"]
        assert any(x["vote_id"] == v["vote_id"] for x in a["open_votes"])
        v2 = post(ally["h"], f"/worlds/{WORLD}/alliance/votes/{v['vote_id']}", {"yes": True})
        assert v2["status"] == "PASSED"
        rel = next(x for x in my_alliance(third["h"])["alliance"]["relations"] if x["alliance_id"] == demo_id)
        assert rel["state"] == "WAR" and rel["war_reason"] == "VOTE"
        # peace: DIPLOMAT/LEADER proposes, LEADER/VICE accepts → PEACE_PENDING 12h → NEUTRAL
        rel = post(third["h"], f"/worlds/{WORLD}/alliance/diplomacy/{demo_id}/peace_propose")
        assert rel["state"] == "WAR" and rel["peace_proposal"]["mine"] is True
        rel = post(ally["h"], f"/worlds/{WORLD}/alliance/diplomacy/{trz}/peace_accept")
        assert rel["state"] == "PEACE_PENDING" and rel["until"]
        advance(12 * 3600 + 120)
        a = my_alliance(demo["h"])["alliance"]
        assert not any(x["alliance_id"] == trz and x["state"] != "NEUTRAL" for x in a["relations"])
        # a mercenary alliance cannot open war votes
        r = requests.post(url(f"/worlds/{WORLD}/alliance/diplomacy/{trz}/war_propose"), headers=auth(*RIVAL)["h"], timeout=30)
        assert r.json()["code"] == "MERCENARY_NO_WAR_VOTE"


class TestMercenary:
    def test_contract_lifecycle(self, demo, rival, third):
        demo_id = my_alliance(demo["h"])["alliance"]["alliance_id"]
        trz = my_alliance(third["h"])["alliance"]["alliance_id"]
        # treasury via QA (mercenary escrow needs ≥1000 Emeralds)
        g = requests.post(url("/qa/alliance/emeralds"), json={"alliance_id": demo_id, "amount": 5000}, headers=ADMIN_HEADERS, timeout=30).json()
        assert g["ok"] and g["emeralds"] >= 5000
        led = requests.get(url(f"/worlds/{WORLD}/alliance/treasury"), headers=demo["h"], timeout=30).json()
        assert led["emeralds"] >= 5000 and led["entries"][0]["reason"] == "qa_grant"
        r = requests.post(url(f"/worlds/{WORLD}/alliance/mercenary/offers"), json={"target_alliance_id": trz, "emeralds": 500, "duration_hours": 72}, headers=demo["h"], timeout=30)
        assert r.json()["code"] == "INVALID_ESCROW"
        r = requests.post(url(f"/worlds/{WORLD}/alliance/mercenary/offers"), json={"target_alliance_id": trz, "emeralds": 1000, "duration_hours": 50}, headers=demo["h"], timeout=30)
        assert r.json()["code"] == "INVALID_DURATION"
        offer = post(demo["h"], f"/worlds/{WORLD}/alliance/mercenary/offers", {"target_alliance_id": trz, "emeralds": 1500, "duration_hours": 72}, 201)
        assert offer["status"] == "OFFERED" and offer["provider_alliance_id"] is None
        assert requests.get(url(f"/worlds/{WORLD}/alliance/treasury"), headers=demo["h"], timeout=30).json()["emeralds"] == led["emeralds"] - 1500
        # withdraw → refund
        w = post(demo["h"], f"/worlds/{WORLD}/alliance/mercenary/offers/{offer['contract_id']}/withdraw")
        assert w["status"] == "CANCELLED"
        assert requests.get(url(f"/worlds/{WORLD}/alliance/treasury"), headers=demo["h"], timeout=30).json()["emeralds"] == led["emeralds"]
        # real offer → visible on the mercenary market (rival) and NOT to structured alliances
        offer = post(demo["h"], f"/worlds/{WORLD}/alliance/mercenary/offers", {"target_alliance_id": trz, "emeralds": 2000, "duration_hours": 96}, 201)
        mk = requests.get(url(f"/worlds/{WORLD}/alliance/mercenary"), headers=rival["h"], timeout=30).json()
        assert any(o["contract_id"] == offer["contract_id"] for o in mk["offers"]) and mk["max_active"] == 3
        mk3 = requests.get(url(f"/worlds/{WORLD}/alliance/mercenary"), headers=third["h"], timeout=30).json()
        assert mk3["offers"] == []
        # structured alliance cannot accept
        r = requests.post(url(f"/worlds/{WORLD}/alliance/mercenary/offers/{offer['contract_id']}/accept"), headers=third["h"], timeout=30)
        assert r.json()["code"] == "NOT_MERCENARY"
        c = post(rival["h"], f"/worlds/{WORLD}/alliance/mercenary/offers/{offer['contract_id']}/accept")
        assert c["status"] == "ACTIVE" and c["provider_tag"] == "MERC" and c["ends_at"]
        # auto-war MERC ↔ TRZ, peace locked
        rel = next(x for x in my_alliance(third["h"])["alliance"]["relations"] if x["tag"] == "MERC")
        assert rel["state"] == "WAR" and rel["war_reason"] == "MERCENARY_CONTRACT" and rel["locked_by_contract_id"] == c["contract_id"]
        merc_id = my_alliance(rival["h"])["alliance"]["alliance_id"]
        r = requests.post(url(f"/worlds/{WORLD}/alliance/diplomacy/{merc_id}/peace_propose"), headers=third["h"], timeout=30)
        assert r.json()["code"] == "PEACE_LOCKED_BY_CONTRACT"
        # notifications to the three alliances
        for acc in (demo, rival, third):
            inbox = requests.get(url(f"/worlds/{WORLD}/inbox"), headers=acc["h"], timeout=30).json()["items"]
            assert any(n["event"] == "MERCENARY_CONTRACT_ACTIVE" and n["payload"]["contract_id"] == c["contract_id"] for n in inbox), acc["house"]
        # provider bonus vs target: +5% cap / +3% ATK snapshot on an ATTACK march against a TRZ settlement
        tgt = third["me"]["settlements"][0]["settlement_id"]
        origin = rival["me"]["settlements"][0]["settlement_id"]
        requests.post(url("/qa/grant"), json={"settlement_id": origin, "army": {"Fanteria": 300}, "buildings": {"Sala di Guerra": 1}, "end_pvp_shield": True}, headers=ADMIN_HEADERS, timeout=30)
        requests.post(url("/qa/grant"), json={"settlement_id": tgt, "end_pvp_shield": True}, headers=ADMIN_HEADERS, timeout=30)
        r = requests.post(url(f"/worlds/{WORLD}/marches"), json={"origin_settlement_id": origin, "target_settlement_id": tgt, "mission": "ATTACK", "units": {"Fanteria": 50}, "idempotency_key": uuid.uuid4().hex}, headers=rival["h"], timeout=90)
        if r.status_code in (200, 201):
            m = r.json()["march"]
            assert m["mission"] == "ATTACK" and m["bonuses"] == {"contract_id": c["contract_id"], "single_march_capacity_pct": 5, "attack_pct": 3}
            requests.post(url(f"/worlds/{WORLD}/marches/{m['march_id']}/recall"), headers=rival["h"], timeout=30)
        else:
            assert r.json().get("code") in ("NO_LAND_PATH", "PVP_SHIELD_ACTIVE", "MARCH_CAPACITY_EXCEEDED"), f"{r.status_code} {r.text}"
        # natural expiry → success: escrow to MERC treasury, +10 mercenary prestige, war unlock
        advance(96 * 3600 + 300)
        mk = requests.get(url(f"/worlds/{WORLD}/alliance/mercenary"), headers=rival["h"], timeout=30).json()
        done = next(x for x in mk["contracts"] if x["contract_id"] == c["contract_id"])
        assert done["status"] == "COMPLETED" and done["result"] == "SUCCESS_EXPIRY"
        tre = requests.get(url(f"/worlds/{WORLD}/alliance/treasury"), headers=rival["h"], timeout=30).json()
        assert tre["emeralds"] >= 2000 and any(e["reason"] == "mercenary_contract_success" and e["amount"] == 2000 for e in tre["entries"])
        merc = requests.get(url(f"/worlds/{WORLD}/alliances/{merc_id}"), headers=demo["h"], timeout=30).json()
        assert merc["mercenary_prestige"] >= 10 and merc["contracts_completed"] >= 1
        rel = next(x for x in my_alliance(third["h"])["alliance"]["relations"] if x["tag"] == "MERC")
        assert rel["state"] == "WAR" and rel["locked_by_contract_id"] is None
        inbox = requests.get(url(f"/worlds/{WORLD}/inbox"), headers=rival["h"], timeout=30).json()["items"]
        assert any(n["event"] == "MERCENARY_CONTRACT_ENDED" and n["payload"]["prestige_delta"] == 10 for n in inbox)

    def test_leave_ui_fixture(self, demo, rival, third):
        """Leave one ACTIVE contract for the UI run (MERC hired by DEMO against TRZ, 168h)."""
        demo_id = my_alliance(demo["h"])["alliance"]["alliance_id"]
        trz = my_alliance(third["h"])["alliance"]["alliance_id"]
        requests.post(url("/qa/alliance/emeralds"), json={"alliance_id": demo_id, "amount": 3000}, headers=ADMIN_HEADERS, timeout=30)
        offer = post(demo["h"], f"/worlds/{WORLD}/alliance/mercenary/offers", {"target_alliance_id": trz, "emeralds": 1000, "duration_hours": 168}, 201)
        c = post(rival["h"], f"/worlds/{WORLD}/alliance/mercenary/offers/{offer['contract_id']}/accept")
        assert c["status"] == "ACTIVE"
        print("UI fixture contract:", c["contract_id"])
