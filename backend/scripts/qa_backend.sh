#!/usr/bin/env bash
# QA backend for the automated e2e suite — a second uvicorn on :8002 bound to its OWN database (eld_qa).
#
#   bash /app/backend/scripts/qa_backend.sh          # install (idempotent) + start + wait for /api/health
#
# Why: the e2e tests jump the QA clock by weeks/months and create hundreds of throwaway players. Running them against
# the live backend (:8001, DB eld) once advanced the real Grande Mondo by 99 days and eliminated real players through
# the inactivity sweep (13/09/2026). The live DB must never be touched by tests again → see scripts/e2e.sh.
set -euo pipefail
CONF=/etc/supervisor/conf.d/backend_qa.conf
if [ ! -f "$CONF" ]; then
  sudo tee "$CONF" >/dev/null <<'EOF'
[program:backend_qa]
command=/root/.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8002 --workers 1
directory=/app/backend
autostart=true
autorestart=true
environment=DB_NAME="eld_qa",QA_ENDPOINTS_ENABLED="true",SCHEDULER_ENABLED="true",WORLD_AUTO_CREATE="false",STORE_BILLING_LIVE="false"
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
for _ in $(seq 1 60); do
  if curl -sf http://localhost:8002/api/health >/dev/null 2>&1; then echo "backend_qa ready on :8002 (DB eld_qa)"; exit 0; fi
  sleep 1
done
echo "backend_qa did not become healthy — see /var/log/supervisor/backend_qa.err.log" >&2
exit 1
