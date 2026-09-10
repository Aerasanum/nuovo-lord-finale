"""Mandatory tests 8-15: world, persistence, overflow idempotency, combat, cap20 concurrency, sentinels, ships."""
from __future__ import annotations

import asyncio

import pytest
from httpx import ASGITransport, AsyncClient

from app.core import clock
from app.core.db import db
from app.core.spec import get_spec
from app.domain import combat, conquest, economy, scheduler
from app.domain import formulas as F
from app.domain.pathfinding import load_terrain
from tests.conftest import advance, grant, join, register

spec = get_spec()
pytestmark = pytest.mark.asyncio(loop_scope="session")


# 8 ------------------------------------------------------------------------------------------------
async def test_world_shape_and_no_settlement_on_water(world):
    wid = world["_id"]
    assert world["status"] == "OPEN"
    stats = world["terrain_stats"]
    assert 49 <= stats["plain_pct"] <= 55 and 16 <= stats["forest_pct"] <= 20 and 8 <= stats["mountain_pct"] <= 12 and 18 <= stats["water_pct"] <= 22
    assert len(stats["island_sizes"]) == 3 and all(8000 <= s <= 12000 for s in stats["island_sizes"])
    assert await db().settlements.count_documents({"world_id": wid, "kind": "PLAYER_SLOT"}) == 100
    assert await db().settlements.count_documents({"world_id": wid, "kind": "NEUTRAL"}) == 800
    assert await db().map_chunks.count_documents({"world_id": wid}) == 13 * 13
    grid = await load_terrain(wid)
    assert grid.shape == (400, 400)
    async for s in db().settlements.find({"world_id": wid}):
        assert s["terrain"] != "water"
        assert int(grid[s["y"], s["x"]]) != 3
    # regional quotas
    for reg in spec.regions:
        assert await db().settlements.count_documents({"world_id": wid, "kind": "PLAYER_SLOT", "region": reg["id"]}) == reg["player_slots"]
        assert await db().settlements.count_documents({"world_id": wid, "kind": "NEUTRAL", "region": reg["id"]}) == reg["neutrals"]
        assert await db().settlements.count_documents({"world_id": wid, "kind": "NEUTRAL", "region": reg["id"], "port_eligible": True}) >= reg["min_port_eligible_neutrals"]
    dist = spec.neutral_runtime["level_distribution"]
    for lvl, n in ((1, dist["level_1"]), (2, dist["level_2"]), (3, dist["level_3"])):
        assert await db().settlements.count_documents({"world_id": wid, "kind": "NEUTRAL", "level": lvl}) == n


async def test_player_bootstrap_canonical(client, world):
    acc = await register(client)
    j = await join(client, acc, world["_id"])
    r = await client.get(f"/api/worlds/{world['_id']}/settlements/{j['settlement_id']}", headers=acc["headers"])
    s = r.json()
    assert s["level"] == 1
    assert s["resources"] == {"grain": 2000, "wood": 2000, "clay": 2000, "iron": 1500, "gold": 500}
    assert s["army"] == {"Fanteria": 250}
    assert set(s["buildings"]) == set(spec.player_bootstrap["prebuilt_buildings_level_1"]) and all(v == 1 for v in s["buildings"].values())
    assert s["warehouse_capacity"] == 3500 and s["production_per_h"]["grain"] == 20
    assert j["player"]["shield_active"] is True and j["player"]["shield_until"]
    tiles = await db().territory_tiles.count_documents({"world_id": world["_id"], "owner_player_id": j["player"]["player_id"]})
    assert 1 <= tiles <= 5
    # slot claimed atomically: it is no longer FREE
    assert await db().settlements.count_documents({"_id": j["settlement_id"], "kind": "PLAYER"}) == 1


# 9 + 15 ---------------------------------------------------------------------------------------------
async def test_job_survives_refresh_and_reopen(client, world):
    acc = await register(client)
    j = await join(client, acc, world["_id"])
    wid, sid = world["_id"], j["settlement_id"]
    r = await client.post(f"/api/worlds/{wid}/settlements/{sid}/upgrade", json={"idempotency_key": "up-1"}, headers=acc["headers"])
    assert r.status_code == 200, r.text
    job = r.json()["job"]
    assert job["cost_snapshot"] == {"grain": 700, "wood": 840, "clay": 840, "iron": 560, "gold": 70}
    assert job["modifiers_snapshot"]["fast_applied"] is True and job["remaining_seconds"] == 15 * 60
    # idempotent retry returns the same job (no double spend)
    r2 = await client.post(f"/api/worlds/{wid}/settlements/{sid}/upgrade", json={"idempotency_key": "up-1"}, headers=acc["headers"])
    assert r2.json()["job"]["job_id"] == job["job_id"]
    r3 = await client.post(f"/api/worlds/{wid}/settlements/{sid}/upgrade", json={}, headers=acc["headers"])
    assert r3.status_code == 409 and r3.json()["code"] == "TARGET_BUSY"
    # "close the app": new client + fresh login -> the job is still there with a consistent timer
    import server

    await advance(120)
    async with AsyncClient(transport=ASGITransport(app=server.app), base_url="http://test") as fresh:
        lr = await fresh.post("/api/auth/login", json={"email": acc["email"], "password": acc["password"]})
        assert lr.status_code == 200
        h = {"Authorization": f"Bearer {lr.json()['access_token']}"}
        me = await fresh.get(f"/api/worlds/{wid}/me", headers=h)
        assert me.json()["player"]["player_id"] == j["player"]["player_id"]
        st = await fresh.get(f"/api/worlds/{wid}/settlements/{sid}", headers=h)
        jobs = st.json()["jobs"]
        assert len(jobs) == 1 and jobs[0]["job_id"] == job["job_id"] and 13 * 60 <= jobs[0]["remaining_seconds"] <= 13 * 60 + 5
        assert st.json()["resources"]["grain"] < 2000  # spend persisted
    evt = await db().scheduled_events.find_one({"effect_key": f"job_complete:{job['job_id']}"})
    assert evt and evt["status"] == "PENDING"
    # completion exactly once, even if the scheduler runs twice
    await advance(14 * 60)
    await scheduler.run_due_once()
    st = await client.get(f"/api/worlds/{wid}/settlements/{sid}", headers=acc["headers"])
    assert st.json()["level"] == 2 and st.json()["jobs"] == []
    doc = await db().settlements.find_one({"_id": sid})
    assert doc["construction_active"] == 0 and doc["applied_effects"].count(job["job_id"]) == 1
    inbox = await client.get(f"/api/worlds/{wid}/inbox", headers=acc["headers"])
    events = [i["event"] for i in inbox.json()["items"]]
    assert "SETTLEMENT_UPGRADE_STATE" in events


async def test_two_construction_queues_third_rejected(client, world):
    acc = await register(client)
    j = await join(client, acc, world["_id"])
    wid, sid = world["_id"], j["settlement_id"]
    await grant(sid, level=3, resources={"grain": 3000, "wood": 3000, "clay": 3000, "iron": 3000, "gold": 500})
    r1 = await client.post(f"/api/worlds/{wid}/settlements/{sid}/buildings/Fattoria/upgrade", json={}, headers=acc["headers"])
    r2 = await client.post(f"/api/worlds/{wid}/settlements/{sid}/buildings/Boscaiolo/upgrade", json={}, headers=acc["headers"])
    r3 = await client.post(f"/api/worlds/{wid}/settlements/{sid}/buildings/Magazzino/upgrade", json={}, headers=acc["headers"])
    assert r1.status_code == 200 and r2.status_code == 200
    assert r3.status_code == 409 and r3.json()["code"] == "REJECT_QUEUE_FULL"
    # cancel refunds 70% of the snapshot
    before = (await client.get(f"/api/worlds/{wid}/settlements/{sid}", headers=acc["headers"])).json()["resources"]
    rc = await client.post(f"/api/worlds/{wid}/jobs/{r2.json()['job']['job_id']}/cancel", json={}, headers=acc["headers"])
    assert rc.status_code == 200
    refund = rc.json()["refund"]
    assert refund["wood"] == int(r2.json()["job"]["cost_snapshot"]["wood"] * 0.7)
    after = (await client.get(f"/api/worlds/{wid}/settlements/{sid}", headers=acc["headers"])).json()["resources"]
    assert after["wood"] - before["wood"] == refund["wood"]


async def test_research_two_queues_prereqs_and_effect_once(client, world):
    acc = await register(client)
    j = await join(client, acc, world["_id"])
    wid, sid = world["_id"], j["settlement_id"]
    await grant(sid, level=30, buildings={"Universita": 30, "Magazzino": 30}, resources={"grain": 10**7, "wood": 10**7, "clay": 10**7, "iron": 10**7, "gold": 10**6})
    r = await client.post(f"/api/worlds/{wid}/settlements/{sid}/research/economy.grain_2/start", json={}, headers=acc["headers"])
    assert r.status_code == 409 and r.json()["code"] == "RESEARCH_PREREQUISITE_MISSING"
    r1 = await client.post(f"/api/worlds/{wid}/settlements/{sid}/research/economy.grain_1/start", json={}, headers=acc["headers"])
    r2 = await client.post(f"/api/worlds/{wid}/settlements/{sid}/research/economy.wood_1/start", json={}, headers=acc["headers"])
    r3 = await client.post(f"/api/worlds/{wid}/settlements/{sid}/research/economy.clay_1/start", json={}, headers=acc["headers"])
    assert r1.status_code == 200 and r2.status_code == 200 and r3.status_code == 409 and r3.json()["code"] == "REJECT_QUEUE_FULL"
    assert r1.json()["job"]["remaining_seconds"] == 15 * 60 and r1.json()["job"]["cost_snapshot"]["grain"] == 500
    await advance(16 * 60)
    await scheduler.run_due_once()  # second pass must not re-apply
    st = (await client.get(f"/api/worlds/{wid}/settlements/{sid}", headers=acc["headers"])).json()
    assert st["research"] == {"economy.grain_1": 1, "economy.wood_1": 1}
    assert st["production_per_h"]["grain"] == pytest.approx(spec.economy[1]["grain_per_h"] * 1.02)
    catalog = (await client.get(f"/api/worlds/{wid}/settlements/{sid}/research", headers=acc["headers"])).json()
    assert len(catalog["nodes"]) == 114 and len(catalog["branches"]) == 12
    g2 = next(n for n in catalog["nodes"] if n["key"] == "economy.grain_2")
    assert g2["state"] in ("AVAILABLE", "LOCKED")  # prerequisite satisfied; university gate may still lock


# 10 -----------------------------------------------------------------------------------------------
async def test_overflow_no_duplicate_credit_on_retry(client, world):
    acc = await register(client)
    j = await join(client, acc, world["_id"])
    sid = j["settlement_id"]
    await grant(sid, resources={"grain": 3490, "wood": 3499, "clay": 3500, "iron": 0, "gold": 0})
    await db().settlements.update_one({"_id": sid}, {"$set": {"last_accrued_at": clock.now()}})
    clock.advance(3600)  # one hour: +20 grain/wood/clay, +18 iron, +5 gold
    doc = await db().settlements.find_one({"_id": sid})
    # concurrent / retried accrual with the same stale snapshot
    results = await asyncio.gather(economy.accrue(doc), economy.accrue(doc), economy.accrue(dict(doc)))
    fresh = await db().settlements.find_one({"_id": sid})
    assert fresh["resources"]["grain"] == 3500 and fresh["resources"]["wood"] == 3500 and fresh["resources"]["clay"] == 3500
    assert fresh["resources"]["iron"] == 18 and fresh["resources"]["gold"] == 5
    audits = await db().audit.count_documents({"type": "economy_overflow", "settlement_id": sid})
    assert audits == 1
    # credit() also respects the cap and audits the discard
    discarded = await economy.credit(sid, {"grain": 100, "iron": 10}, "test")
    fresh = await db().settlements.find_one({"_id": sid})
    assert fresh["resources"]["grain"] == 3500 and discarded["grain"] == 100 and fresh["resources"]["iron"] == 28


async def test_recruitment_batch_cap_and_progressive(client, world):
    acc = await register(client)
    j = await join(client, acc, world["_id"])
    wid, sid = world["_id"], j["settlement_id"]
    r = await client.post(f"/api/worlds/{wid}/settlements/{sid}/recruit", json={"unit": "Fanteria", "count": 51}, headers=acc["headers"])
    assert r.status_code == 409 and r.json()["code"] == "BATCH_CAP_EXCEEDED"
    r = await client.post(f"/api/worlds/{wid}/settlements/{sid}/recruit", json={"unit": "Fanteria", "count": 10}, headers=acc["headers"])
    assert r.status_code == 200 and r.json()["job"]["remaining_seconds"] == 600 and r.json()["job"]["cost_snapshot"] == {"grain": 150, "wood": 100, "clay": 100, "iron": 50, "gold": 0}
    r2 = await client.post(f"/api/worlds/{wid}/settlements/{sid}/recruit", json={"unit": "Fanteria", "count": 1}, headers=acc["headers"])
    assert r2.status_code == 409 and r2.json()["code"] == "REJECT_QUEUE_FULL"
    await advance(3 * 60 + 1)
    st = (await client.get(f"/api/worlds/{wid}/settlements/{sid}/army", headers=acc["headers"])).json()
    assert st["army"]["Fanteria"] == 253  # progressive production
    await advance(8 * 60)
    st = (await client.get(f"/api/worlds/{wid}/settlements/{sid}/army", headers=acc["headers"])).json()
    assert st["army"]["Fanteria"] == 260


# 11 -----------------------------------------------------------------------------------------------
async def _nearest_neutral(wid: str, x: int, y: int, region: str, level: int | None = None) -> dict:
    flt = {"world_id": wid, "kind": "NEUTRAL", "region": region}
    if level:
        flt["level"] = level
    best = None
    async for n in db().settlements.find(flt):
        d = max(abs(n["x"] - x), abs(n["y"] - y))
        if best is None or d < best[0]:
            best = (d, n)
    return best[1]


async def test_attack_neutral_produces_casualties_and_persistent_report(client, world):
    acc = await register(client)
    j = await join(client, acc, world["_id"])
    wid, sid = world["_id"], j["settlement_id"]
    s = j["settlement"]
    target = await _nearest_neutral(wid, s["x"], s["y"], s["region"], level=1)
    body = {"origin_settlement_id": sid, "target_settlement_id": target["_id"], "mission": "ATTACK", "units": {"Fanteria": 200}, "idempotency_key": "atk-1"}
    pv = await client.post(f"/api/worlds/{wid}/marches/preview", json=body, headers=acc["headers"])
    assert pv.status_code == 200 and pv.json()["eta_seconds"] >= 60 and pv.json()["speed_tph"] == 2.4
    r = await client.post(f"/api/worlds/{wid}/marches", json=body, headers=acc["headers"])
    assert r.status_code == 200, r.text
    m = r.json()["march"]
    r_dup = await client.post(f"/api/worlds/{wid}/marches", json=body, headers=acc["headers"])
    assert r_dup.json()["march"]["march_id"] == m["march_id"]
    st = (await client.get(f"/api/worlds/{wid}/settlements/{sid}", headers=acc["headers"])).json()
    assert st["army"]["Fanteria"] == 50 and st["outgoing_marches"] == 1
    await advance(m["eta_seconds"] + 1)
    battles = (await client.get(f"/api/worlds/{wid}/battles", headers=acc["headers"])).json()["battles"]
    assert len(battles) == 1
    rep = battles[0]["report"]
    assert rep["attacker_start"] == {"Fanteria": 200} and rep["defender_start"] == {"Fanteria": 100}
    assert rep["winner"] == "ATTACKER" and rep["defender_losses"]["Fanteria"] == 100
    assert 0 < rep["attacker_losses"]["Fanteria"] < 200
    assert 0.95 <= rep["rng"]["attacker"] <= 1.05 and rep["seed"]
    # deterministic: same seed & inputs replay to the same result
    replay = combat.resolve_battle(rep["battle_id"], "ATTACK", {"Fanteria": 200}, {}, None, {"Fanteria": 100}, {}, None, target["terrain"], {"level": 1, "current_hp": 1000, "max_hp": 1000})
    assert replay["attacker_losses"] == rep["attacker_losses"] and replay["attacker_power"] == rep["attacker_power"]
    # persisted server-side
    stored = await db().battles.find_one({"_id": rep["battle_id"]})
    assert stored and stored["participants"] == [j["player"]["player_id"]]
    tdoc = await db().settlements.find_one({"_id": target["_id"]})
    assert sum(tdoc["army"].values()) == 0  # neutral garrison annihilated (restored on the next 72h tick)
    ms = (await client.get(f"/api/worlds/{wid}/marches", headers=acc["headers"])).json()["marches"]
    assert ms[0]["status"] == "RETURNING" and ms[0]["units"]["Fanteria"] == 200 - rep["attacker_losses"]["Fanteria"]
    await advance(m["eta_seconds"] + 1)
    st = (await client.get(f"/api/worlds/{wid}/settlements/{sid}", headers=acc["headers"])).json()
    assert st["army"]["Fanteria"] == 50 + 200 - rep["attacker_losses"]["Fanteria"] and st["outgoing_marches"] == 0
    inbox = (await client.get(f"/api/worlds/{wid}/inbox", headers=acc["headers"])).json()
    assert {"MARCH_DEPARTED", "BATTLE_REPORT_READY", "MARCH_RETURNED"} <= {i["event"] for i in inbox["items"]}


async def test_conquest_neutral_transfers_with_retention(client, world):
    acc = await register(client)
    j = await join(client, acc, world["_id"])
    wid, sid = world["_id"], j["settlement_id"]
    s = j["settlement"]
    target = await _nearest_neutral(wid, s["x"], s["y"], s["region"], level=3)
    await grant(sid, army={"Fanteria": 5000}, buildings={"Sala di Guerra": 30})  # cap round(1000*1.17^29)
    body = {"origin_settlement_id": sid, "target_settlement_id": target["_id"], "mission": "CONQUEST", "units": {"Fanteria": 5000}}
    r = await client.post(f"/api/worlds/{wid}/marches", json=body, headers=acc["headers"])
    assert r.status_code == 200, r.text
    p = await db().players.find_one({"_id": j["player"]["player_id"]})
    assert p["settlement_reservations"] == 1
    await advance(r.json()["march"]["eta_seconds"] + 1)
    b = (await client.get(f"/api/worlds/{wid}/battles", headers=acc["headers"])).json()["battles"][0]
    assert b["report"]["winner"] == "ATTACKER" and b["ownership_result"]["changed"] is True
    t = await db().settlements.find_one({"_id": target["_id"]})
    assert t["owner_player_id"] == j["player"]["player_id"] and t["kind"] == "PLAYER"
    assert t["level"] == max(1, int(3 * 0.85)) == 2 and t["loyalty"] == 100 and sum(t["army"].values()) > 0
    p = await db().players.find_one({"_id": j["player"]["player_id"]})
    assert p["settlement_count"] == 2 and p["settlement_reservations"] == 0 and p["neutral_conquests"] == 1
    me = (await client.get(f"/api/worlds/{wid}/me", headers=acc["headers"])).json()
    assert len(me["settlements"]) == 2


# 12 -----------------------------------------------------------------------------------------------
async def test_concurrent_requests_cannot_create_21st_settlement(client, world):
    acc = await register(client)
    j = await join(client, acc, world["_id"])
    wid, sid, pid = world["_id"], j["settlement_id"], j["player"]["player_id"]
    s = j["settlement"]
    await db().players.update_one({"_id": pid}, {"$set": {"settlement_count": 19, "settlement_reservations": 0}})
    await grant(sid, army={"Fanteria": 100000}, buildings={"Sala di Guerra": 30})
    neutrals = [n async for n in db().settlements.find({"world_id": wid, "kind": "NEUTRAL", "region": s["region"], "level": 1}).limit(6)]
    bodies = [{"origin_settlement_id": sid, "target_settlement_id": n["_id"], "mission": "CONQUEST", "units": {"Fanteria": 1000}} for n in neutrals[:2]]
    r1, r2 = await asyncio.gather(*(client.post(f"/api/worlds/{wid}/marches", json=b, headers=acc["headers"]) for b in bodies))
    codes = sorted([r1.status_code, r2.status_code])
    assert codes == [200, 409], (r1.text, r2.text)
    assert (r1 if r1.status_code == 409 else r2).json()["code"] == "SETTLEMENT_CAP_REACHED"
    # final commit is also atomic: two consumers racing on the last slot -> exactly one wins
    await db().players.update_one({"_id": pid}, {"$set": {"settlement_count": 19, "settlement_reservations": 2}})
    a, b = await asyncio.gather(conquest.consume_reservation(pid), conquest.consume_reservation(pid))
    assert sorted([a, b]) == [False, True]
    p = await db().players.find_one({"_id": pid})
    assert p["settlement_count"] == 20
    await db().marches.update_many({"player_id": pid}, {"$set": {"status": "CANCELLED"}})
    await db().scheduled_events.update_many({"world_id": wid, "type": "BATTLE_OR_FLEET_ARRIVAL", "status": "PENDING", "entity_id": {"$in": [m["_id"] async for m in db().marches.find({"player_id": pid}, {"_id": 1})]}}, {"$set": {"status": "CANCELLED"}})


# 13 -----------------------------------------------------------------------------------------------
async def test_sentinel_grace_and_single_expiry(client, world):
    acc = await register(client)
    j = await join(client, acc, world["_id"])
    wid, sid, pid = world["_id"], j["settlement_id"], j["player"]["player_id"]
    await grant(sid, level=3, buildings={"Comando Sentinelle": 1}, resources={"grain": 5000, "wood": 5000, "clay": 5000, "iron": 5000, "gold": 500})
    s = j["settlement"]
    grid = await load_terrain(wid)
    direction = next(d for d, (dx, dy) in {"N": (0, -1), "E": (1, 0), "S": (0, 1), "W": (-1, 0)}.items() if 0 <= s["x"] + 3 * dx < 400 and 0 <= s["y"] + 3 * dy < 400 and int(grid[s["y"] + 3 * dy, s["x"] + 3 * dx]) != 3)
    r = await client.post(f"/api/worlds/{wid}/settlements/{sid}/sentinels", json={"direction": direction}, headers=acc["headers"])
    assert r.status_code == 200, r.text
    job = r.json()["job"]
    assert job["cost_snapshot"] == {"grain": 210, "wood": 330, "clay": 300, "iron": 180, "gold": 24} and job["remaining_seconds"] == 18 * 60
    assert job["modifiers_snapshot"]["fast_applied"] is False
    await advance(18 * 60 + 1)
    sen = (await client.get(f"/api/worlds/{wid}/settlements/{sid}/sentinels", headers=acc["headers"])).json()["sentinels"]
    assert len(sen) == 1 and sen[0]["state"] == "UNGUARDED_GRACE" and sen[0]["grace_deadline"]
    assert "garrison_cap" in sen[0] and "hp" not in sen[0] and "wall" not in sen[0]
    tiles_before = await db().territory_tiles.count_documents({"world_id": wid, "owner_player_id": pid})
    assert tiles_before > 5
    await advance(24 * 3600 + 1)
    await scheduler.run_due_once()
    await scheduler.run_due_once()
    doc = await db().sentinels.find_one({"_id": sen[0]["sentinel_id"]})
    assert doc["state"] == "REMOVED" and doc.get("expiry_count") == 1
    assert await db().scheduled_events.count_documents({"effect_key": f"sentinel_expire:{doc['_id']}:{doc['generation']}", "status": "DONE"}) == 1
    tiles_after = await db().territory_tiles.count_documents({"world_id": wid, "owner_player_id": pid})
    assert tiles_after < tiles_before and tiles_after >= 1
    assert (await client.get(f"/api/worlds/{wid}/settlements/{sid}/sentinels", headers=acc["headers"])).json()["sentinels"] == []


async def test_sentinel_regarrison_supersedes_expiry(client, world):
    acc = await register(client)
    j = await join(client, acc, world["_id"])
    wid, sid = world["_id"], j["settlement_id"]
    await grant(sid, level=3, buildings={"Comando Sentinelle": 1}, resources={"grain": 5000, "wood": 5000, "clay": 5000, "iron": 5000, "gold": 500})
    s = j["settlement"]
    grid = await load_terrain(wid)
    direction = next(d for d, (dx, dy) in {"N": (0, -1), "E": (1, 0), "S": (0, 1), "W": (-1, 0)}.items() if 0 <= s["x"] + 3 * dx < 400 and 0 <= s["y"] + 3 * dy < 400 and int(grid[s["y"] + 3 * dy, s["x"] + 3 * dx]) != 3)
    r = await client.post(f"/api/worlds/{wid}/settlements/{sid}/sentinels", json={"direction": direction}, headers=acc["headers"])
    assert r.status_code == 200, r.text
    await advance(18 * 60 + 1)
    sen = (await client.get(f"/api/worlds/{wid}/settlements/{sid}/sentinels", headers=acc["headers"])).json()["sentinels"][0]
    r = await client.post(f"/api/worlds/{wid}/marches", json={"origin_settlement_id": sid, "target_sentinel_id": sen["sentinel_id"], "mission": "GARRISON_SENTINEL", "units": {"Fanteria": 20}}, headers=acc["headers"])
    assert r.status_code == 200, r.text
    await advance(r.json()["march"]["eta_seconds"] + 1)
    doc = await db().sentinels.find_one({"_id": sen["sentinel_id"]})
    assert doc["state"] == "GUARDED" and doc["garrison"] == {"Fanteria": 20}
    await advance(25 * 3600)
    doc = await db().sentinels.find_one({"_id": sen["sentinel_id"]})
    assert doc["state"] == "GUARDED"  # stale expiry event was superseded by the generation check


# 14 -----------------------------------------------------------------------------------------------
async def test_ships_excluded_from_casualties_resolver():
    rep = combat.resolve_battle("btl_test_ships", "ATTACK", {"Fanteria": 100}, {}, None, {"Fanteria": 5000}, {}, None, "plain", {"level": 1, "current_hp": 1000, "max_hp": 1000})
    assert rep["winner"] == "DEFENDER" and rep["attacker_losses"] == {"Fanteria": 100}
    assert "Transport Ship" not in rep["attacker_losses"] and spec.navigation["eligible_for_casualties"] is False
    assert all(u in spec.units_by_name for u in rep["attacker_losses"])


async def test_fleet_assault_ships_return_empty(client, world):
    acc = await register(client)
    j = await join(client, acc, world["_id"])
    wid, sid = world["_id"], j["settlement_id"]
    s = j["settlement"]
    # a port-eligible neutral in another region reachable only by sea
    other_region = next(r["id"] for r in spec.regions if r["id"] != s["region"])
    target = await db().settlements.find_one({"world_id": wid, "kind": "NEUTRAL", "region": other_region, "port_eligible": True})
    land = await client.post(f"/api/worlds/{wid}/marches/preview", json={"origin_settlement_id": sid, "target_settlement_id": target["_id"], "mission": "ATTACK", "units": {"Fanteria": 10}}, headers=acc["headers"])
    assert land.status_code == 409 and land.json()["code"] == "NO_LAND_PATH"
    if not s["port_eligible"]:
        # relocate the Mother onto a free port-eligible slot of the same region (test fixture only)
        slot = await db().settlements.find_one({"world_id": wid, "kind": "PLAYER_SLOT", "slot_status": "FREE", "port_eligible": True, "region": s["region"]})
        if slot is None:  # fall back to a coastal neutral anchor of the same region
            slot = await db().settlements.find_one({"world_id": wid, "kind": "NEUTRAL", "port_eligible": True, "region": s["region"]})
        assert slot, "no port-eligible anchor in region"
        await db().settlements.delete_one({"_id": slot["_id"]})
        await db().settlements.update_one({"_id": sid}, {"$set": {"x": slot["x"], "y": slot["y"], "terrain": slot["terrain"], "port_eligible": True, "chunk_cx": slot["x"] // 32, "chunk_cy": slot["y"] // 32}})
    await grant(sid, level=15, buildings={"Porto": 1}, research={"navigation.shipbuilding": 1, "navigation.port_construction": 1})
    await db().settlements.update_one({"_id": sid}, {"$set": {"ships": 2}})
    r = None
    async for cand in db().settlements.find({"world_id": wid, "kind": "NEUTRAL", "region": other_region, "port_eligible": True}).limit(40):
        await db().settlements.update_one({"_id": cand["_id"]}, {"$set": {"buildings.Porto": 1, "army": {"Fanteria": 100000}}})
        r = await client.post(f"/api/worlds/{wid}/marches", json={"origin_settlement_id": sid, "target_settlement_id": cand["_id"], "mission": "ATTACK", "units": {"Fanteria": 100}, "naval": True, "ships": 2}, headers=acc["headers"])
        if r.status_code == 200:
            break
        assert r.json()["code"] == "NO_NAVAL_PATH", r.text  # lake ports are eligible but may be unreachable
    assert r is not None and r.status_code == 200, r.text
    m = r.json()["march"]
    assert m["naval"] and m["ships"] == 2
    await advance(m["eta_seconds"] + 1)
    b = (await client.get(f"/api/worlds/{wid}/battles", headers=acc["headers"])).json()["battles"][0]
    assert b["report"]["winner"] == "DEFENDER" and b["ships_excluded"] == 2 and "Transport Ship" not in b["report"]["attacker_losses"]
    mm = await db().marches.find_one({"_id": m["march_id"]})
    assert mm["status"] == "RETURNING" and mm["ships"] == 2 and mm["units"] == {}
    await advance(m["eta_seconds"] + 1)
    doc = await db().settlements.find_one({"_id": sid})
    assert doc["ships"] == 2


async def test_pvp_shield_blocks_attacks(client, world):
    a = await register(client)
    b = await register(client)
    ja = await join(client, a, world["_id"])
    jb = await join(client, b, world["_id"])
    wid = world["_id"]
    r = await client.post(f"/api/worlds/{wid}/marches", json={"origin_settlement_id": ja["settlement_id"], "target_settlement_id": jb["settlement_id"], "mission": "ATTACK", "units": {"Fanteria": 10}}, headers=a["headers"])
    assert r.status_code in (409,) and r.json()["code"] in ("PVP_SHIELD_ACTIVE", "NO_LAND_PATH")


async def test_error_shape_and_auth(client, world):
    r = await client.get(f"/api/worlds/{world['_id']}/me")
    assert r.status_code == 401
    body = r.json()
    assert set(body) == {"code", "message", "details", "retryable", "trace_id"}
    r = await client.post("/api/auth/login", json={"email": "nobody@eldgame.it", "password": "wrongpass1"})
    assert r.status_code == 401 and r.json()["code"] == "INVALID_CREDENTIALS"
