"""Quick smoke for the new endpoints (daily / chat / mercenaries) against the public URL."""
import json
import os
import sys

import requests

from tests.e2e_base import API as BASE, DEMO_EMAIL, DEMO_PASSWORD  # QA backend only

EMAIL = sys.argv[1] if len(sys.argv) > 1 else DEMO_EMAIL
PW = sys.argv[2] if len(sys.argv) > 2 else DEMO_PASSWORD

r = requests.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PW}, timeout=20)
r.raise_for_status()
tok = r.json()["access_token"]
H = {"Authorization": f"Bearer {tok}"}
me = requests.get(f"{BASE}/auth/me", headers=H, timeout=20).json()
print("me:", json.dumps(me)[:200])
w = "qa_1"
for path in [f"/worlds/{w}/daily", f"/worlds/{w}/chat/summary", f"/worlds/{w}/mercenaries", f"/worlds/{w}/house"]:
    rr = requests.get(f"{BASE}{path}", headers=H, timeout=20)
    print(path, rr.status_code, json.dumps(rr.json())[:400])
