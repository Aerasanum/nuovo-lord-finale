"""Max account (scripts/max_account.py) must be fully readable through the public API — no 500s at the caps."""
import json
import os

import requests

BASE = os.environ.get("BASE", "https://empire-lords-dragon.preview.emergentagent.com/api")
r = requests.post(f"{BASE}/auth/login", json={"email": "max@empirelords.com", "password": "Max12345!"}, timeout=20)
r.raise_for_status()
H = {"Authorization": f"Bearer {r.json()['access_token']}"}
me = requests.get(f"{BASE}/worlds/world_1/me", headers=H, timeout=20)
print("me", me.status_code)
d = me.json()
sid = d["settlements"][0]["settlement_id"]
print("player", d["player"].get("house", {}).get("prestige"), "rubies", d.get("rubies"), "settlement", sid)
for path in [f"/worlds/world_1/settlements/{sid}", f"/worlds/world_1/settlements/{sid}/buildings", f"/worlds/world_1/settlements/{sid}/army", f"/worlds/world_1/settlements/{sid}/research", f"/worlds/world_1/settlements/{sid}/sentinels", f"/worlds/world_1/settlements/{sid}/caravans/info", f"/worlds/world_1/settlements/{sid}/skins", f"/worlds/world_1/house", f"/worlds/world_1/daily", f"/worlds/world_1/missions", f"/worlds/world_1/specialization", f"/worlds/world_1/settlements/{sid}/public"]:
    rr = requests.get(f"{BASE}{path}", headers=H, timeout=30)
    body = rr.json()
    extra = ""
    if path.endswith(sid):
        extra = f" level={body['level']} cap={body['warehouse_capacity']} march_cap={body['march_capacity']} dev={body['development_score']} wall={body['wall']['level']}"
    if path.endswith("/buildings"):
        extra = f" maxed={sum(1 for b in body['buildings'] if b['state'] in ('MAXED', 'SETTLEMENT_CORE'))}/{len(body['buildings'])} states={sorted(set(b['state'] for b in body['buildings']))}"
    if path.endswith("/army"):
        extra = f" legendary={[ (u['name'], u['count']) for u in body['units'] if u['category']=='legendary']} states={sorted(set(u['state'] for u in body['units']))}"
    if path.endswith("/research"):
        extra = f" maxed={sum(1 for n in body['nodes'] if n['level'] >= n['max_level'])}/{len(body['nodes'])} states={sorted(set(n['state'] for n in body['nodes']))}"
    if path.endswith("/house"):
        extra = f" unlocks={body.get('march_skin_unlocks')}"
    print(path.split("world_1")[1], rr.status_code, extra or json.dumps(body)[:160])
# a march preview with a legendary at the cap must be accepted by the server rules
prev = requests.post(f"{BASE}/worlds/world_1/marches/preview", headers=H, json={"origin_settlement_id": sid, "target_settlement_id": None, "mission": "ATTACK", "units": {"Fanteria": 1000, "Drago": 1}}, timeout=30)
print("preview", prev.status_code, json.dumps(prev.json())[:200])
