"""Quick smoke run against the live backend (localhost:8001)."""
import json
import sys
import time
import uuid

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8001"
ADMIN = {"X-Admin-Key": "eld-admin-7f3c9a1d2b4e"}
c = httpx.Client(base_url=BASE, timeout=60)

email = f"smoke_{uuid.uuid4().hex[:6]}@test.it"
r = c.post("/api/auth/register", json={"email": email, "password": "Password123!", "display_name": "Smoke"})
print("register", r.status_code, r.json().get("account"))
tok = r.json()["access_token"]
H = {"Authorization": f"Bearer {tok}"}

r = c.get("/api/worlds", headers=H)
print("worlds", r.status_code, [(w["world_id"], w["status"], w["player_count"], w["terrain_stats"]) for w in r.json()["worlds"]])
wid = r.json()["worlds"][0]["world_id"]
r = c.post(f"/api/worlds/{wid}/join", json={"house_name": f"Casa {uuid.uuid4().hex[:4]}"}, headers=H)
print("join", r.status_code, r.json()["player"])
r = c.get(f"/api/worlds/{wid}/me", headers=H)
me = r.json()
sid = me["settlements"][0]["settlement_id"]
print("me", r.status_code, me["settlements"][0])
r = c.get(f"/api/worlds/{wid}/settlements/{sid}", headers=H)
s = r.json()
print("settlement", r.status_code, {k: s[k] for k in ("level", "resources", "production_per_h", "warehouse_capacity", "army", "wall", "march_capacity")})
print("upgrade info", s["settlement_upgrade"]["state"], s["settlement_upgrade"].get("next", {}).get("cost"), s["settlement_upgrade"].get("requirements"))

r = c.get(f"/api/worlds/{wid}/settlements/{sid}/buildings", headers=H)
b = r.json()
print("buildings", r.status_code, [(x["name"], x["level"], x["state"], (x.get("next") or {}).get("cost"), (x.get("next") or {}).get("duration_min")) for x in b["buildings"]][:8])

r = c.post(f"/api/worlds/{wid}/settlements/{sid}/upgrade", json={"idempotency_key": "up1"}, headers=H)
print("settlement upgrade", r.status_code, r.json())
r = c.post("/api/qa/clock/advance", json={"seconds": 16 * 60}, headers=ADMIN)
print("advance 16m", r.status_code, r.json())
r = c.get(f"/api/worlds/{wid}/settlements/{sid}", headers=H)
print("level now", r.json()["level"], r.json()["resources"])
r = c.post(f"/api/worlds/{wid}/settlements/{sid}/buildings/Fattoria/upgrade", json={"idempotency_key": "k1"}, headers=H)
print("upgrade Fattoria", r.status_code, r.json())
r2 = c.post(f"/api/worlds/{wid}/settlements/{sid}/buildings/Fattoria/upgrade", json={"idempotency_key": "k1"}, headers=H)
print("upgrade Fattoria retry idem", r2.status_code, r2.json()["job"]["job_id"] == r.json()["job"]["job_id"])
r = c.post(f"/api/worlds/{wid}/settlements/{sid}/buildings/Boscaiolo/upgrade", json={}, headers=H)
print("upgrade Boscaiolo", r.status_code, r.json().get("job", r.json()).get("ends_at"))
r = c.post(f"/api/worlds/{wid}/settlements/{sid}/buildings/Magazzino/upgrade", json={}, headers=H)
print("upgrade Magazzino (3rd) ->", r.status_code, r.json().get("code"))

r = c.get(f"/api/worlds/{wid}/settlements/{sid}/research", headers=H)
nodes = r.json()["nodes"]
print("research nodes", len(nodes), "branches", len(r.json()["branches"]), [(n["key"], n["state"]) for n in nodes[:3]])
r = c.post(f"/api/worlds/{wid}/settlements/{sid}/research/economy.grain_1/start", json={}, headers=H)
print("research start", r.status_code, r.json())

r = c.get(f"/api/worlds/{wid}/settlements/{sid}/army", headers=H)
print("army", r.status_code, r.json()["army"], [(u["name"], u["state"], u["batch_cap"], u["effective_time_s"]) for u in r.json()["units"][:3]])
r = c.post(f"/api/worlds/{wid}/settlements/{sid}/recruit", json={"unit": "Fanteria", "count": 5}, headers=H)
print("recruit", r.status_code, r.json())

# map chunk
cx, cy = s["x"] // 32, s["y"] // 32
r = c.get(f"/api/worlds/{wid}/map/chunk/{cx}/{cy}", headers=H)
ch = r.json()
print("chunk", r.status_code, len(ch["terrain_b64"]), len(ch["settlements"]), len(ch["territory"]))
neutrals = [e for e in ch["settlements"] if e["kind"] == "NEUTRAL"]
# find nearest neutral across neighbour chunks
cands = []
for dx in (-1, 0, 1):
    for dy in (-1, 0, 1):
        rr = c.get(f"/api/worlds/{wid}/map/chunk/{cx+dx}/{cy+dy}", headers=H)
        if rr.status_code == 200:
            cands += [e for e in rr.json()["settlements"] if e["kind"] == "NEUTRAL"]
cands.sort(key=lambda e: max(abs(e["x"] - s["x"]), abs(e["y"] - s["y"])))
target = cands[0]
print("nearest neutral", target)
r = c.get(f"/api/worlds/{wid}/settlements/{target['settlement_id']}/public", headers=H)
print("target public", r.status_code, r.json().get("garrison"), r.json().get("wall"))
body = {"origin_settlement_id": sid, "target_settlement_id": target["settlement_id"], "mission": "ATTACK", "units": {"Fanteria": 200}}
r = c.post(f"/api/worlds/{wid}/marches/preview", json=body, headers=H)
print("preview", r.status_code, {k: v for k, v in r.json().items() if k != "path"})
r = c.post(f"/api/worlds/{wid}/marches", json={**body, "idempotency_key": "m1"}, headers=H)
print("launch", r.status_code, {k: v for k, v in r.json().get("march", r.json()).items() if k != "path"})
eta = r.json()["march"]["eta_seconds"]
# advance clock
r = c.post("/api/qa/clock/advance", json={"seconds": eta + 5}, headers=ADMIN)
print("advance", r.status_code, r.json())
r = c.get(f"/api/worlds/{wid}/battles", headers=H)
print("battles", r.status_code, len(r.json()["battles"]))
if r.json()["battles"]:
    rep = r.json()["battles"][0]["report"]
    print(json.dumps({k: rep[k] for k in ("winner", "attacker_start", "defender_start", "attacker_losses", "defender_losses", "attacker_power", "defender_power", "rng", "wall_static_losses")}, ensure_ascii=False))
r = c.get(f"/api/worlds/{wid}/marches", headers=H)
print("marches", r.status_code, [(m["status"], m["result"], m["units"]) for m in r.json()["marches"]])
r = c.post("/api/qa/clock/advance", json={"seconds": eta + 5}, headers=ADMIN)
print("advance2", r.status_code, r.json())
r = c.get(f"/api/worlds/{wid}/settlements/{sid}", headers=H)
s = r.json()
print("after", {k: s[k] for k in ("level", "resources", "buildings", "army", "research")}, [(j["kind"], j["target"], j["remaining_seconds"]) for j in s["jobs"]])
r = c.get(f"/api/worlds/{wid}/inbox", headers=H)
print("inbox", r.status_code, r.json()["unread"], [(i["event"], i["payload"].get("state") or i["payload"].get("winner")) for i in r.json()["items"]][:12])
r = c.get("/api/health")
print("health", r.json()["scheduler"])
