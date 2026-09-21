#!/usr/bin/env bash
# QA backend for the automated e2e suite — a second uvicorn on :8002 bound to its OWN database (eld_qa).
#
#   bash backend/scripts/qa_backend.sh          # install (idempotent) + start + wait for /api/health
#
# Why: the e2e tests jump the QA clock by weeks/months and create hundreds of throwaway players. Running them against
# the live backend (:8001, DB eld) once advanced the real Grande Mondo by 99 days and eliminated real players through
# the inactivity sweep (13/09/2026). The live DB must never be touched by tests again → see scripts/e2e.sh.
#
# Registration throttling is switched off here (RATE_LIMIT_REGISTER_PER_HOUR=0): the suite signs up hundreds of
# throwaway accounts from one address. The limiter itself is covered by tests/test_hardening.py.
#
# Without supervisor (CI, a plain clone) the script falls back to running uvicorn directly in the background.
set -euo pipefail
BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QA_ENV='DB_NAME="eld_qa",QA_ENDPOINTS_ENABLED="true",SCHEDULER_ENABLED="true",WORLD_AUTO_CREATE="false",STORE_BILLING_LIVE="false",RATE_LIMIT_REGISTER_PER_HOUR="0"'

wait_healthy() {
  for _ in $(seq 1 60); do
    if curl -sf http://localhost:8002/api/health >/dev/null 2>&1; then
      echo "backend_qa ready on :8002 (DB eld_qa)"
      exit 0
    fi
    sleep 1
  done
  return 1
}

if command -v supervisorctl >/dev/null 2>&1; then
  CONF=/etc/supervisor/conf.d/backend_qa.conf
  if [ ! -f "$CONF" ]; then
    sudo tee "$CONF" >/dev/null <<EOF
[program:backend_qa]
command=/root/.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8002 --workers 1
directory=${BACKEND_DIR}
autostart=true
autorestart=true
environment=${QA_ENV}
stderr_logfile=/var/log/supervisor/backend_qa.err.log
stdout_logfile=/var/log/supervisor/backend_qa.out.log
stopsignal=TERM
stopwaitsecs=20
stopasgroup=true
killasgroup=true
EOF
    sudo supervisorctl reread >/dev/null
    sudo supervisorctl update >/dev/null
  fi
  sudo supervisorctl start backend_qa >/dev/null 2>&1 || true
  wait_healthy || { echo "backend_qa did not become healthy — see /var/log/supervisor/backend_qa.err.log" >&2; exit 1; }
fi

# Fallback: no supervisor available (CI or a developer clone).
if curl -sf http://localhost:8002/api/health >/dev/null 2>&1; then
  echo "backend_qa already running on :8002"
  exit 0
fi
cd "$BACKEND_DIR"
DB_NAME=eld_qa QA_ENDPOINTS_ENABLED=true SCHEDULER_ENABLED=true WORLD_AUTO_CREATE=false STORE_BILLING_LIVE=false \
  RATE_LIMIT_REGISTER_PER_HOUR=0 \
  nohup python -m uvicorn server:app --host 0.0.0.0 --port 8002 --workers 1 >/tmp/backend_qa.log 2>&1 &
wait_healthy || { echo "backend_qa did not become healthy — see /tmp/backend_qa.log" >&2; tail -30 /tmp/backend_qa.log >&2; exit 1; }
