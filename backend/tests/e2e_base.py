"""Single source of truth for the live-server e2e suite's target.

The suite jumps the QA clock by weeks and creates hundreds of throwaway players, so it must ONLY ever talk to the QA
backend (scripts/qa_backend.sh → :8002, DB eld_qa). `E2E_BASE_URL` is exported by scripts/e2e.sh; the preview /
production hosts are refused outright.
"""
from __future__ import annotations

import os

BASE_URL = (os.environ.get("E2E_BASE_URL") or "http://localhost:8002").rstrip("/")
if "emergentagent.com" in BASE_URL or "emergent.host" in BASE_URL:
    raise RuntimeError("e2e suite must target the QA backend (scripts/e2e.sh), never the live realm")
API = f"{BASE_URL}/api"
