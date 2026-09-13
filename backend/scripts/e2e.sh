#!/usr/bin/env bash
# Run the e2e suite against the QA backend (:8002, DB eld_qa) — NEVER against the live realm.
#
#   bash /app/backend/scripts/e2e.sh                       # whole live-server suite
#   bash /app/backend/scripts/e2e.sh tests/test_iteration_34_store.py -k skin
#
# First time: bash scripts/qa_backend.sh && DB_NAME=eld_qa python scripts/seed_qa_db.py
set -euo pipefail
cd /app/backend
bash scripts/qa_backend.sh >/dev/null
export E2E_BASE_URL=http://localhost:8002
if [ $# -eq 0 ]; then
  set -- tests/test_iteration_*.py tests/test_*_e2e.py
fi
exec python -m pytest "$@" -q -o addopts='' -p no:cacheprovider
