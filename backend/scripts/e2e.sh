#!/usr/bin/env bash
# Run the e2e suite against the QA backend (:8002, DB eld_qa) — NEVER against the live realm.
#
#   bash backend/scripts/e2e.sh                       # whole live-server suite
#   bash backend/scripts/e2e.sh tests/test_iteration_34_store.py -k skin
#
# First time: bash scripts/qa_backend.sh && DB_NAME=eld_qa python scripts/seed_qa_db.py
#
# The suite mutates shared fixtures (players join realms, skins unlock, Rubies are spent). `--reseed` rebuilds the QA
# database first, which is what CI does and what to use locally when a module starts failing on state it did not create.
set -euo pipefail
BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$BACKEND_DIR"

RESEED=0
ARGS=()
for arg in "$@"; do
  if [ "$arg" = "--reseed" ]; then RESEED=1; else ARGS+=("$arg"); fi
done

if [ "$RESEED" = "1" ]; then
  DB_NAME=eld_qa python scripts/seed_qa_db.py --drop
fi

bash scripts/qa_backend.sh >/dev/null
export E2E_BASE_URL=http://localhost:8002
if [ ${#ARGS[@]} -eq 0 ]; then
  ARGS=(tests/test_iteration_*.py tests/test_*_e2e.py)
fi
exec python -m pytest "${ARGS[@]}" -q -o addopts='' -p no:cacheprovider
