#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
user_problem_statement: "Empire Lords Dragon — gioco mobile Android persistente, multiplayer, server-authoritative. Frontend React Native + Expo + TS; backend FastAPI + MongoDB. Spec JSON (/app/spec/02_CANONICAL_SPEC.json) è l'unica autorità runtime. Vertical slice: mappa 3D isometrica (three.js + expo-gl, chunk streaming), economia (risorse, magazzino, 21 edifici, code), ricerca (114 nodi, 12 rami), esercito/combattimento (13 unità, marce, pathfinding, target neutrali), auth bilingue IT/EN JWT + Google Auth (Emergent), UI: mappa, insediamento, code, report battaglie."

backend:
  - task: "Auth: register/login/refresh/me/logout (JWT) + Emergent Google session exchange"
    implemented: true
    working: "NA"
    file: "backend/app/api/routes_auth.py, backend/app/core/auth.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Curl verified register+login works. Full validation pending testing agent."
  - task: "Worlds: list, join (creates mother settlement), /me"
    implemented: true
    working: "NA"
    file: "backend/app/api/routes_game.py, backend/app/domain/worlds.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Curl verified join+me for demo user."
  - task: "Settlement: buildings catalog, upgrade building, upgrade settlement, jobs, cancel"
    implemented: true
    working: "NA"
    file: "backend/app/api/routes_game.py, backend/app/domain/construction.py, settlements.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Pytest passes; E2E over HTTP pending."
  - task: "Research: catalog (114 nodes/12 branches), start research"
    implemented: true
    working: "NA"
    file: "backend/app/domain/research.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Pytest passes; E2E pending."
  - task: "Army: catalog, recruit, ships"
    implemented: true
    working: "NA"
    file: "backend/app/domain/recruitment.py, navy.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Pytest passes; E2E pending."
  - task: "Map: chunk fetch (terrain_b64 + settlements + sentinels + territory), marches visible"
    implemented: true
    working: "NA"
    file: "backend/app/api/routes_game.py, backend/app/domain/worldgen.py, pathfinding.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Frontend renders chunks; E2E pending."
  - task: "Marches: preview, launch (ATTACK/RAID vs NEUTRAL), list, get, recall; battle resolution + report + inbox"
    implemented: true
    working: "NA"
    file: "backend/app/domain/marches.py, combat.py, scheduler.py, notifications.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Use QA /api/qa/clock/advance (X-Admin-Key) to fast-forward timers and resolve marches/jobs."
  - task: "Scheduler idempotent job completion (BUILD/RESEARCH/RECRUIT/MARCH)"
    implemented: true
    working: "NA"
    file: "backend/app/domain/scheduler.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "QA endpoint /api/qa/scheduler/run and /api/qa/clock/advance available."

frontend:
  - task: "Login/Register screen (IT/EN toggle, JWT, Google button)"
    implemented: true
    working: "NA"
    file: "frontend/app/login.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Screenshot smoke test OK."
  - task: "Worlds screen: list, join sheet, enter"
    implemented: true
    working: "NA"
    file: "frontend/app/worlds.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Screenshot smoke test OK."
  - task: "Map tab: 3D map render, HUD resources, zoom/rotate/center, tile selection card, target/march actions"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/map.tsx, frontend/src/map3d/engine.ts, MapView.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Screenshot smoke: 3D terrain renders on web."
  - task: "Settlement tab: buildings list, building detail modal, upgrade, queues screen, research screen"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/settlement.tsx, frontend/app/building/[name].tsx, queues.tsx, research.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Not yet E2E tested."
  - task: "Army tab: recruit units, ships, sentinels screen"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/army.tsx, sentinels.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Not yet E2E tested."
  - task: "March new modal: preview + launch; marches list; target detail"
    implemented: true
    working: "NA"
    file: "frontend/app/march/new.tsx, marches.tsx, target/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Not yet E2E tested."
  - task: "Inbox tab + battle report screen"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/inbox.tsx, battle/[id].tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Not yet E2E tested."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 1
  run_ui: true

test_plan:
  current_focus:
    - "Full vertical slice E2E (backend + frontend)"
  stuck_tasks: []
  test_all: true
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: "First full E2E run. Credentials in /app/memory/test_credentials.md (demo@empirelords.com / Demo12345!). Admin QA header X-Admin-Key: eld-admin-7f3c9a1d2b4e. Use /api/qa/clock/advance {seconds} to fast-forward timers. Do NOT change spec values — they come from /app/spec/02_CANONICAL_SPEC.json."

# ---- iteration 2 (main agent) ----
backend:
  - task: "Map overview endpoint GET /api/worlds/{w}/map/overview (downsampled terrain 100x100 + player settlements)"
    implemented: true
    working: "NA"
    file: "backend/app/api/routes_game.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "New endpoint; factor=4, size=100, terrain_b64 decodes to 10000 bytes with codes 0..3; settlements = all PLAYER kind with faction relative to viewer."
frontend:
  - task: "3D map upgrade: terrain LOD (step1/step2), world overview far-LOD, animated water plane, instanced castles/props, RN label overlay (map-labels), labels toggle button (map-labels-button), pan inertia, focal pinch zoom, double-tap zoom, eased centerOn"
    implemented: true
    working: "NA"
    file: "frontend/src/map3d/engine.ts, terrain.ts, entities.ts, water.ts, MapLabels.tsx, MapView.tsx, app/(tabs)/map.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Visual smoke via screenshots OK on web. Need regression: controls, selection card via canvas tap, labels appear (map-label-<settlement_id>), LOD indicator text '3D · LOD n' changes with zoom, no console errors."
  - task: "Google Auth flow hardening (session_id parsed from launch URL in AuthProvider, callback route gates, login screen auto-redirects when account set)"
    implemented: true
    working: "NA"
    file: "frontend/src/state/AuthContext.tsx, app/auth/callback.tsx, app/login.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Cannot complete real Google login in automation; verify JWT login/register still navigate to /worlds (now via account effect), and that /auth/callback without session_id redirects to /login. Google button on web should navigate to auth.emergentagent.com with redirect=origin/."
agent_communication:
  - agent: "main"
    message: "Iteration 2: 3D map engine upgrade + overview endpoint + auth hardening. Please regression-test map tab flows and the overview endpoint; backend suite from iteration 1 should still pass (run pytest tests/test_public_e2e.py -o addopts='')."
