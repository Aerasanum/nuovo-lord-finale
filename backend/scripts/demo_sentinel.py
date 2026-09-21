"""QA helper: make the demo home settlement build + garrison a Sentinel so the feature is visible on the map.

Steps (public API + QA endpoints, spec rules untouched):
  1. qa/grant  → Comando Sentinelle L3 (+ a few Fanteria) on the demo home
  2. POST .../sentinels {direction}            → BUILD job (18 min canonical)
  3. qa/clock/advance 19 min + qa/scheduler/run → sentinel completes (UNGUARDED_GRACE)
  4. POST .../marches GARRISON_SENTINEL          → advance until arrival → GUARDED (sector tiles claimed)

Usage: python scripts/demo_sentinel.py [N|E|S|W] [--no-garrison]
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.fixture_creds import cred  # noqa: E402

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
BASE = os.environ.get("PUBLIC_BASE_URL", "https://empire-lords-dragon.preview.emergentagent.com").rstrip("/") + "/api"
ADMIN = {"X-Admin-Key": os.environ["ADMIN_API_KEY"]}
EMAIL, PASSWORD = "demo@empirelords.com", cred("DEMO_PASSWORD", "Demo12345!")


def main() -> None:
    direction = next((a for a in sys.argv[1:] if a in ("N", "E", "S", "W")), "N")
    garrison = "--no-garrison" not in sys.argv
    tok = requests.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30).json()["access_token"]
    H = {"Authorization": f"Bearer {tok}"}
    me = requests.get(f"{BASE}/worlds/world_1/me", headers=H, timeout=30).json()
    home = next(s["settlement_id"] for s in me["settlements"] if s.get("is_mother"))
    print("home", home)
    r = requests.post(f"{BASE}/qa/grant", json={"settlement_id": home, "buildings": {"Comando Sentinelle": 3}, "army": {"Fanteria": 300}}, headers=ADMIN, timeout=30)
    print("grant", r.status_code, r.json().get("set"))
    r = requests.post(f"{BASE}/worlds/world_1/settlements/{home}/sentinels", json={"direction": direction, "idempotency_key": f"demo-sen-{direction}-{int(time.time())}"}, headers=H, timeout=30)
    print("build", r.status_code, r.text[:300])
    if r.status_code >= 400 and r.json().get("code") != "SENTINEL_SLOT_TAKEN":
        return
    requests.post(f"{BASE}/qa/clock/advance", json={"seconds": 19 * 60}, headers=ADMIN, timeout=30)
    requests.post(f"{BASE}/qa/scheduler/run", json={}, headers=ADMIN, timeout=60)
    lst = requests.get(f"{BASE}/worlds/world_1/settlements/{home}/sentinels", headers=H, timeout=30).json()
    print("sentinels", [(s["direction"], s["state"], s["x"], s["y"]) for s in lst["sentinels"]])
    sen = next((s for s in lst["sentinels"] if s["direction"] == direction), None)
    if not sen or not garrison:
        return
    r = requests.post(f"{BASE}/worlds/world_1/marches", json={"origin_settlement_id": home, "mission": "GARRISON_SENTINEL", "target_sentinel_id": sen["sentinel_id"], "units": {"Fanteria": 120}, "idempotency_key": f"demo-gar-{sen['sentinel_id']}-{int(time.time())}"}, headers=H, timeout=30)
    print("garrison march", r.status_code, r.text[:200])
    for _ in range(6):
        requests.post(f"{BASE}/qa/clock/advance", json={"seconds": 30 * 60}, headers=ADMIN, timeout=30)
        requests.post(f"{BASE}/qa/scheduler/run", json={}, headers=ADMIN, timeout=60)
        lst = requests.get(f"{BASE}/worlds/world_1/settlements/{home}/sentinels", headers=H, timeout=30).json()
        sen = next(s for s in lst["sentinels"] if s["direction"] == direction)
        print("state", sen["state"], sen.get("garrison"))
        if sen["state"] == "GUARDED":
            break


if __name__ == "__main__":
    main()
