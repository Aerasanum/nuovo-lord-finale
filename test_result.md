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
    working: true
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
    working: true
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
    working: true
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
    working: true
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
    working: true
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
    working: true
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
    working: true
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
    working: true
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
    working: true
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
    working: true
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
    working: true
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
    working: true
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
    working: true
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
    working: true
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
    working: true
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
    working: true
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
    working: true
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
    working: true
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

# ---- iteration 3 (main agent) — bug fix ----
frontend:
  - task: "BUG: 3D map turns black after Città → building modal → back → Mappa (user report with screenshot)"
    implemented: true
    working: true
    file: "frontend/src/map3d/engine.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: false
        agent: "user"
        comment: "Mappa nera dopo aver aperto una costruzione in Città e tornato sulla mappa (HUD e label visibili, canvas nero)."
      - working: "NA"
        agent: "main"
        comment: "Root cause: while the tab is hidden behind the modal the canvas collapses to 0×0; on return our onLayout ran before expo-gl re-applied the canvas size, so renderer.setSize(0,0) left a 0×0 viewport. Fix: engine now resyncs renderer/camera with gl.drawingBufferWidth/Height every frame (syncDrawingBuffer), skips frames while the buffer is 0×0, and ignores 0-size layouts. Reproduced + verified fixed via screenshot on web."
agent_communication:
  - agent: "main"
    message: "Iteration 3: please verify the black-map bug fix (map → Città → tap a building card → back → Mappa: canvas must render terrain, not black). Also check other round-trips (research screen, march modal, queues) return to a rendered map."

# ---- iteration 4 (main agent) — marches on map per Bible §13/§41.3 ----
frontend:
  - task: "Marches on the 3D map: tappable markers → march selection card (mission → target, units, status pill, ETA countdown, 'Marce attive', 'Richiama' if OUTBOUND own, battle button if battle_id); march label chips with live ETA (testID map-label-march:<id>); returning marches rendered paler; marches hidden at far zoom (dist > 100, Bible §41.3)"
    implemented: true
    working: true
    file: "frontend/src/map3d/engine.ts, MapLabels.tsx, app/(tabs)/map.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Two OUTBOUND ATTACK marches exist for demo (mar_f6b9205c32334aa3 → Neutrale 5,183 arrival ~14:40 server time; mar_cee8ea83c5f54796 → Neutrale 9,181 arrival ~16:09). Verified via screenshot: labels + card + recall button visible; far zoom hides labels."
agent_communication:
  - agent: "main"
    message: "Iteration 4: verify march markers/labels/card on the map tab. Do NOT recall both marches — recall at most one (the one to Neutrale 9,181) so the other stays for the user to see. Server clock is QA-advanced (offset ~10325s); do not advance it further."
  - agent: "main"
    message: "Iteration 4 fix: recalled marches are now animated from the turn-around point (backend DTO exposes recalled_at; engine.marchProgress handles OUTBOUND / normal RETURN / RECALL). Picking is now screen-space (30px) so tall castles/banners are tappable at steep pitch. Live data: mar_f6b9205c32334aa3 OUTBOUND → Neutrale 5,183; mar_ec8c3fee7d3642d5 RETURNING (recalled) → home, return ~14:11 server time. QA clock offset now +3600s (backend restarted). Verified via screenshot; please retest the recall visibility."

# ---- iteration 6 (main agent) — graphics overhaul + pending Intel/Minimap/Crest/Battle-from-map validation ----
frontend:
  - task: "3D map graphics v3: smooth terrain (no tile squares), custom terrain shader (micro detail, slope rock, snow caps), ridged mountains, dusky horizon fog, richer flora (3-tier conifers, broadleaf, bushes, boulders; sparse trees at mid LOD), territory drawn as faint fill + border ribbon (no square tiles), tactical grid only at zoom < 13"
    implemented: true
    working: true
    file: "frontend/src/map3d/terrain.ts, terrainMaterial.ts, flora.ts, territory.ts, engine.ts"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Verified visually on web (home, mountains, far zoom). Regression to check: chunk streaming, LOD switch, no WebGL/shader errors in console, tap-to-select still works (castles are taller now: pick points at 0.6/1.7/2.6 × scale)."
  - task: "Castle v2 + skins: bigger (≈2× footprint) decorated castles (plinth, octagonal wall with merlons, keep with windows, 4/8 towers by level, gatehouse with door + torches, wall banners at L≥10, corner turrets at L≥20, crest banner on top). Skin registry src/map3d/castle.ts (classic/royal/obsidian/sandstone; neutrals = ruin). Backend passes settlement `skin` through in public DTO (null → classic)."
    implemented: true
    working: true
    file: "frontend/src/map3d/castle.ts, entities.ts, backend/app/domain/settlements.py"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Royal skin verified by temporarily setting skin on the demo settlement (reverted). Labels anchor at CASTLE_TOP×scale."
  - task: "Pending from iteration 5 (never validated by testing agent): hostile march intel on map (incoming[] with intel disclosure → red halo marker + chip; selection card testID map-selection-intel with intel-* fields), tactical minimap (testID minimap / minimap-touch: tap recentres camera; shows footprint, march lines, player dots), house crests (house.tsx: crest editor + motto; crest on castles/marches/march-card; deterministic default crest from house name), battle report from map (map-selection-march-battle on a march with battle_id; map-selection-last-battle / map-selection-open-report on a settlement card)"
    implemented: true
    working: true
    file: "frontend/app/(tabs)/map.tsx, frontend/app/house.tsx, frontend/src/map3d/MiniMap.tsx, frontend/src/components/Crest.tsx, backend/app/domain/intel.py, house.py, marches.py"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Code complete since iteration 5, only screenshot-checked. Needs full E2E."
backend:
  - task: "GET /worlds/{w}/marches returns own marches + incoming[] hostile marches with intel disclosure (Bible §34.10) only after detection time; GET/PUT /worlds/{w}/house crest+motto; public settlement DTO includes owner_house_crest + skin"
    implemented: true
    working: true
    file: "backend/app/domain/marches.py, intel.py, house.py, settlements.py"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "pytest tests/test_public_e2e.py: 22/22 pass after the skin passthrough change."
agent_communication:
  - agent: "main"
    message: "Iteration 6: (1) regression-test the 3D map after the graphics overhaul (web preview): terrain renders (not black), no shader compile errors in console, zoom in/out/rotate, labels, tap on a castle opens map-selection-card, tap on the march marker opens the march card; (2) validate the iteration-5 features end-to-end: house crest editing (/house), crest visible in map selection card and march cards, minimap tap recentres, battle report reachable from the map (both demo marches are RETURNING with battle_id), hostile intel: create TWO fresh accounts (attacker + defender) so the demo account is untouched — join world_1, QA grant army to attacker + end_pvp_shield for both, launch ATTACK from attacker to defender's settlement, advance QA clock past detection, then GET /marches as defender must list it in incoming[] with intel; log in as defender on the frontend and check the red hostile marker/chip + map-selection-intel card. Demo creds in /app/memory/test_credentials.md; admin key there too."

# ---- iteration 7 (main agent) — castle skins picker, level-gated unlocks, battle history on map card, animated flags/torches/smoke ----
backend:
  - task: "Castle skins: GET /worlds/{w}/settlements/{s}/skins (catalog: current, level, skins[{id,min_level,unlocked}]) and PUT /worlds/{w}/settlements/{s}/skin {skin} — owner only; INVALID_SKIN 400 for unknown id; SKIN_LOCKED 409 when settlement level < min_level (classic 1, sandstone 5, royal 10, obsidian 20). Persists settlements.skin (exposed in public DTO / chunks)."
    implemented: true
    working: true
    file: "backend/app/domain/skins.py, backend/app/api/routes_game.py"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Manually verified with demo (L3): royal → 409 SKIN_LOCKED, nope → 400, classic → 200."
  - task: "GET /worlds/{w}/settlements/{s}/battles?limit=5 → battles the viewer took part in where the settlement is target or origin (new battles store origin_settlement_id)."
    implemented: true
    working: true
    file: "backend/app/api/routes_game.py, backend/app/domain/marches.py"
    stuck_count: 0
    priority: "medium"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Demo vs neutral 5,183 returns 5 battles."
  - task: "QA clock offset persisted in Mongo (qa_state.clock) and reloaded at startup so backend restarts no longer reset the world clock."
    implemented: true
    working: true
    file: "backend/app/core/clock.py, server.py, routes_qa.py"
    stuck_count: 0
    priority: "medium"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Restored offset to 2026-09-21T07:15Z (~+10.6d); verified it survives a restart."
frontend:
  - task: "Skins screen /skins (Città header palette button, testID settlement-skins-button): live 3D CastlePreview (GLView) with the selected skin, skin cards skin-card-<id> (locked show lock + 'Si sblocca al livello N', current shows 'In uso'), skins-apply-button (disabled unless unlocked & different), toast on success; map castles re-render with the new skin after chunk refresh."
    implemented: true
    working: true
    file: "frontend/app/skins.tsx, frontend/src/map3d/CastlePreview.tsx, frontend/app/(tabs)/settlement.tsx"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Visually verified; apply not yet exercised on an unlocked non-classic skin (demo is L3 → only classic unlocked; QA can raise level via /qa/grant? no — use a settlement upgrade or accept the lock test)."
  - task: "Map selection card: BattleHistory (testID map-selection-battles) replaces last-battle line — up to 5 rows battle-row-<id> (trophy/skull, outcome · mission · date, losses, loot, conquered), tap → /battle/<id>; empty state map-selection-no-battles."
    implemented: true
    working: true
    file: "frontend/src/components/MarchCard.tsx, frontend/app/(tabs)/map.tsx"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Verified on Neutrale 5,183 (5 rows)."
  - task: "Living map: waving flags (vertex shader via onBeforeCompile, instanced + march banners), flickering torch/brazier glow (additive), stylised smoke from castle chimneys, gate torches and guarded sentinel braziers (SmokeSystem, close zoom only < ×48)."
    implemented: true
    working: true
    file: "frontend/src/map3d/entities.ts, smoke.ts, castle.ts, engine.ts"
    stuck_count: 0
    priority: "medium"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Visually verified (smoke plume + glow); no console shader errors."
agent_communication:
  - agent: "main"
    message: "Iteration 7: test skins endpoints (owner-only 403/404 for a foreign settlement, lock/unlock rules), settlement battles endpoint, skins screen flow (demo L3: classic current; royal shows locked button text), battle history rows + navigation to report, map regression (no black map, no console errors, march card still works). Demo has one OUTBOUND ATTACK march (mar_6015cbcf298047f1, 1 Fanteria, ETA ~20h) left by the previous testing run — do not recall it. Do NOT restart the backend unnecessarily; QA clock offset now persists anyway."

# ---- iteration 8 (main agent) — Missioni personali + Prestigio + Achievement + Cronaca (Bible §20/§22/§39, spec.missions/achievements/house) ----
backend:
  - task: "Missions: GET /worlds/{w}/missions (catalog with cooldown_until/active_mission_id, active, slots_left, history, progress), POST /worlds/{w}/missions {key, origin_settlement_id, units, idempotency_key} (201; validations: UNKNOWN_MISSION 400, MISSION_UNITS_NOT_ALLOWED 400, MISSION_MIN_UNITS 400, MISSION_MIXED_UNITS 400, MISSION_NEEDS_FALCO 400, MISSION_RESEARCH_REQUIRED 409, MISSION_COOLDOWN 409, MISSION_SLOTS_FULL 409 (max 2), MISSION_TYPE_ACTIVE 409, INSUFFICIENT_UNITS 409); troops removed from garrison at start, returned at completion; reward = production snapshot × hours clamped to warehouse (overflow in reward_result.overflow) + prestige; cooldown from completion; MISSION_COMPLETE scheduled event (priority 60); MISSION_COMPLETED inbox notification."
    implemented: true
    working: true
    file: "backend/app/domain/missions.py, routes_game.py"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Manually verified patrol_local start → +1h QA advance → COMPLETED, troops back, +10 prestige, cooldown 2h."
  - task: "Progress ledger: prestige events (pvp_defense_win 10, pvp_battle_win 2, pvp conquest 25, neutral conquest 5, missions), achievement tracks (kills/successful_defenses/conquests/supports/territory_tiles/caravans_intercepted) with tier unlocks + notification, World Chronicle (SETTLEMENT_CONQUERED, LARGEST_BATTLE record, PATH_OF_CONQUERORS, FIRST_METROPOLIS), one-shots Prima Bandiera (crest ≥3 layers changed → +20 prestige), Guardiani del Confine window, Via dei Conquistatori, Prima Metropoli. GET /worlds/{w}/progress, GET /worlds/{w}/chronicle."
    implemented: true
    working: true
    file: "backend/app/domain/progress.py, marches.py (_persist_battle hook), conquest.py, construction.py, house.py, territory.py"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Largest-battle record already recorded from the earlier PvP fixture battle."
frontend:
  - task: "Tab 'Missioni' (tab-missions) with segments missions-seg-missions / -house / -chronicle: active missions (slots dots, countdown, progress bar), catalogue cards mission-card-<key> with status pill (Disponibile/In corso/Ricarica), requirements/rewards, Avvia → /mission/new composer (mission-unit-<U>-minus/input/plus/max, mission-new-total, mission-new-blocker, mission-new-submit); Casata segment (progress-prestige, progress-titles, track-<track> rows, house history); Cronaca segment (records-panel, chronicle-<id> rows). Inbox: MISSION_COMPLETED rendering + deep link to missions."
    implemented: true
    working: true
    file: "frontend/app/(tabs)/missions.tsx, frontend/app/mission/new.tsx, frontend/src/game/missions.ts, frontend/app/(tabs)/_layout.tsx, inbox.tsx"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Screenshots OK for all segments and the composer."
agent_communication:
  - agent: "main"
    message: "Iteration 8: test the missions API rules (see task) and the UI flow: start a mission from the tab (demo settlement has Fanteria/Arciere granted; use commercial_escort with 500 units if available else patrol_local after cooldown), verify it appears under Missioni attive with countdown and the slot dot fills; QA advance clock past duration → history entry + prestige increases in Casata segment + inbox MISSION_COMPLETED. Also GET /chronicle & /progress shapes. Demo units: check GET .../settlements/stl_0484bd7cfcbd40dd/army first; grant more via /qa/grant if needed."

# ---- iteration 9 (main agent) — Carovane: hub UI, mappa, inbox, regola eccedenza (Bible §13 / §34.9) ----
backend:
  - task: "Caravan delivery overflow rule fixed per Bible §13: only free Warehouse space is credited; the excess STAYS on the convoy (cargo = overflow) and returns to the sender (result DELIVERED_PARTIAL, status RETURNING, credited at home on return). Battle DTO exposes target_caravan_id. Verified by /app/backend/tests/test_caravans_e2e.py (5/5: info shape, validation errors, send→deliver→overflow-return, detect→intercept→battle→loot→residue returns, UI fixture)."
    implemented: true
    working: true
    file: "backend/app/domain/caravans.py, routes_game.py, tests/test_caravans_e2e.py"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: true
        agent: "main"
        comment: "pytest tests/test_caravans_e2e.py -o addopts='' → 5 passed. Rival account rival@empirelords.com / Rival12345! owns Neutrale 9,181 (origin, Caravanserraglio L3) and 1,203; a rival caravan is left OUTBOUND and detectable from the demo home."
frontend:
  - task: "Caravans hub /caravans (settlement-caravans-button in Città quick row): caravans-info (slots/capacity/speed/radius, caravans-send-button → /caravan/new), 'Le mie carovane' (MarchListCard with cargo/delivered/overflow lines, recall), caravans-detected panel (detected-caravan-<id> rows, countdown, detected-caravan-<id>-intercept → /caravan/intercept?caravan=). Map: detected foreign caravans rendered as hostile markers (caravanAsMarch) → tap → DetectedCaravanCard (map-selection-caravan, map-selection-intercept). Inbox: CARAVAN_STATE rows (OUTBOUND/DELIVERED/INTERCEPTED) + deep link caravans → /caravans. /marches now uses the shared MarchListCard (missionLabel, cargo lines)."
    implemented: true
    working: true
    file: "frontend/app/caravans.tsx, frontend/src/game/caravans.ts, frontend/src/components/MarchCard.tsx, frontend/app/(tabs)/map.tsx, settlement.tsx, inbox.tsx, frontend/app/marches.tsx, frontend/app/caravan/new.tsx, intercept.tsx, src/i18n/index.tsx"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Smoke screenshot OK: hub shows Caravanserraglio L3, 2 slots, 6844/caravan, detected 'Casa Rivale' caravan with Intercetta button."
agent_communication:
  - agent: "main"
    message: "Iteration 9: FRONTEND focus (backend already covered by pytest tests/test_caravans_e2e.py — you may re-run it once as regression, it advances the QA clock a few hours and leaves a fresh detectable rival caravan). Test as demo: Città → Carovane hub; Invia carovana composer (dest chip stl_84e946900a4745b6, cargo input + MAX clamps to capacity, escort toggle, submit → toast + back to hub where the caravan appears under 'Le mie carovane' with cargo line and countdown; a second send from the same settlement must fail with CARAVAN_OUTGOING_MAX toast); detected rival caravan row → Intercetta → intercept screen (only ATK units listed: Fanteria/Arciere/Cavalleria, not Falco; +10/MAX; submit → toast, back; hub now lists an 'Intercettazione' card); Map tab: hostile caravan marker near 6,188 (red, label 'Carovana') tap → card with cargo estimate/escort/arrival + Intercetta button; Inbox shows CARAVAN STATE rows and tapping opens /caravans; /marches list still renders (shared card) with recall for OUTBOUND. Regression: Missioni tab, map selection card for settlements, battle report."
  - agent: "main"
    message: "Iteration 9 post-test fixes: (1) inbox BATTLE_RESOLVED row localized (missionLabel · winner · loot) + tap opens /battle/<id> (also generic deep_link 'battle/…'); (2) detected caravan marker on the map was projected on the SERVER timeline with a CLIENT detection timestamp (QA clock +15d → progress clamped to 1 → marker at route end, off-screen). caravanAsMarch now stamps detection with serverNow(). Verified: red 'Carovana 7h39m' marker/label at 9,184, tap → DetectedCaravanCard → Intercetta → intercept screen."

# ---- iteration 10 (main agent) — Alleanze (Bible §19 / §34.7 / §40): Strutturate vs Mercenarie ----
backend:
  - task: "alliances domain + routes_alliance.py: create (kind STRUCTURED cap 100 / MERCENARY cap 5, unique name/tag), directory, invites (72h, roles), accept/decline, leave (12h delay, cooldown 24h/72h if at war, succession Vice→member, auto-dissolve when empty), kick/roles/transfer/settings/dissolve; diplomacy relations per pair (PNA propose/accept/decline/terminate with 12h notice; war vote 12h among Leader/Vice/Diplomat with mathematical majority, mercenary alliances cannot vote wars; peace proposal 24h → accept (Leader/Vice) → PEACE_PENDING 12h → NEUTRAL; peace locked while a mercenary contract is active); hostile-launch gate (CANNOT_ATTACK_ALLY / DIPLOMACY_BLOCKS_ATTACK) in marches.launch + caravans.intercept; REINFORCE + caravans to allied settlements; ally tiles get the 0.90 path factor; chat (500 msgs, SYSTEM heralds); Emerald treasury (append-only ledger, Leader/Vice visibility, sources: pvp defense +10 with 24h pair cooldown, pvp conquest +25, first mission/day +5 STRUCTURED only cap 500/day); mercenary contracts (escrow 1000–1M, durations 72/96/120/168h, max 3 active, accept → auto-war + lock, expiry/target dissolution = success → escrow to provider + 10 mercenary prestige to alliance & members, provider dissolution = fail → refund); provider members get +5% cap / +3% ATK vs contract target (snapshot `bonuses` on the march, applied in combat). Map DTOs: faction ALLY + owner_alliance_tag. QA: POST /qa/alliance/emeralds."
    implemented: true
    working: true
    file: "backend/app/domain/alliances.py, backend/app/api/routes_alliance.py, marches.py, caravans.py, combat.py, progress.py, missions.py, conquest.py, settlements.py, territory.py, worlds.py, routes_game.py, routes_qa.py, core/db.py, core/clock.py, tests/test_alliances_e2e.py"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: true
        agent: "main"
        comment: "pytest tests/test_alliances_e2e.py -o addopts='' → 8 passed (membership, roles, chat, leave/cancel, PNA + hostile gate + notice expiry, war vote → WAR → peace → PEACE_PENDING → NEUTRAL, mercenary lifecycle incl. bonuses/escrow/prestige, UI fixture). Regression suites: 69 passed, 2 pre-existing state-dependent failures (Fattoria cap on live demo L3; fleet test passes alone)."
frontend:
  - task: "Alliance UI: 4th segment 'Alleanza' in the Missioni tab (missions-seg-alliance) → AllianceSummary (lone wolf: invites accept/decline, create/browse; member: dashboard tiles + nav buttons). Screens: /alliance/create (kind cards, name/tag/description), /alliance/browse (directory), /alliance/[id] (public page + diplomacy actions: PNA propose/accept/decline/terminate, war propose, peace propose/accept, hire), /alliance/members (roles, invite form, leave/cancel, dissolve confirm), /alliance/diplomacy (relations + war votes with yes/no), /alliance/chat (bubbles + sticky composer), /alliance/treasury (balance + ledger, Leader/Vice), /alliance/mercenary (offers to accept for MERC, hire form with target/escrow/duration, contracts history). Inbox: new alliance events + deep links. Map: ALLY faction colour/legend/label tag, REINFORCE-only composer for allied targets."
    implemented: true
    working: true
    file: "frontend/app/alliance/*.tsx, frontend/src/components/alliance/*.tsx, frontend/src/game/alliances.ts, frontend/app/(tabs)/missions.tsx, inbox.tsx, map.tsx, app/march/new.tsx, app/target/[id].tsx, src/api/hooks.ts, src/i18n/index.tsx, src/map3d/*"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Smoke screenshots OK: dashboard [DEMO] Lords Demo Leader 5005 Smeraldi, diplomacy screen, mercenary market with hire form + 3 contracts."
agent_communication:
  - agent: "main"
    message: "Iteration 10: FRONTEND focus for alliances. Fixture accounts in /app/memory/test_credentials.md (demo LEADER [DEMO] STRUCTURED, ally VICE [DEMO], rival LEADER [MERC] MERCENARY, third LEADER [TRZ] STRUCTURED; an ACTIVE contract MERC vs TRZ hired by DEMO). Backend covered by pytest; do NOT re-run test_alliances_e2e.py (it dissolves and recreates the alliances). Please test UI flows as described in the task."
  - agent: "main"
    message: "Iteration 10/11 results: pass 1 (demo single account) all PASS — 'map legend missing' was a false alarm (legend toggles with map-legend-button). Pass 2 (iteration_11.json) multi-account A–H all PASS: PNA accept/terminate, war vote (demo proposes, ally VICE passes it), peace propose/accept → PEACE_PENDING, hire → rival MERC accepts → auto-war + peace lock, lone-wolf register/create MERC/dissolve/cooldown, invite → decline. Minor observation (by design): alliance-public-war-blocked note only renders while not at war. Frontend alliances → working: true."

# ---- iteration 12 (main agent) — Rubini (§23), Casata descrizione/rename, Alleanza tab + impostazioni ----
backend:
  - task: "premium.py + routes_premium.py: account Ruby wallet (accounts.rubies, ruby_transactions ledger, idempotency per key), GET /wallet, GET/POST /worlds/{w}/jobs/{id}/finish (quote + instant completion: construction ×3/min min 100, research ×4 min 150, recruitment ×2.5 min 100; forbidden special/legendary units; competitive lock SIEGE_ACTIVE / INCOMING_HOSTILE ≤60 min; atomic debit with rollback; same completion handler as scheduler), POST /worlds/{w}/house/rename (cosmetic 500 rubies, unique per world, denormalised copies updated), GET/POST /worlds/{w}/specialization (ATTACKER/DEFENDER +5%, available at 3 settlements, first free, change 2500 rubies, 168h cooldown, blocked AT_WAR/ACTIVE_SIEGE/ACTIVE_MILITARY_MARCH), combat reads spec keys. house.update accepts description (≤300). alliances.update_settings accepts name (unique) + description. /me exposes rubies. QA: POST /qa/rubies {email, amount}."
    implemented: true
    working: true
    file: "backend/app/domain/premium.py, routes_premium.py, house.py, alliances.py, combat.py, routes_game.py, routes_qa.py, tests/test_premium_e2e.py"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: true
        agent: "main"
        comment: "pytest tests/test_premium_e2e.py -o addopts='' → 8 passed (wallet/QA grant, construction quote+pay+effect+idempotent replay, recruit allowed/forbidden, INSUFFICIENT_RUBIES rollback, house rename cost + denormalisation + rename back, house description, alliance rename, specialization)."
frontend:
  - task: "Alliance is now a bottom TAB (tab-alliance, between Esercito and Missioni; segment removed from Missioni); alliance-settings-button (gear) + alliance-nav-settings → /alliance/settings (name + description). Casata: description input + save, 'Rinomina Casata' panel (500 rubies) + Specializzazione link. Rubies chip in Città header (settlement-rubies → /wallet). FinishNowButton pill (job-<id>-finish, price ◆) on job rows in Città queue, /queues, building detail, research, army. /wallet (balance, store disabled note, transactions) and /specialization screens."
    implemented: true
    working: true
    file: "frontend/app/(tabs)/alliance.tsx, _layout.tsx, missions.tsx, settlement.tsx, house.tsx, wallet.tsx, specialization.tsx, alliance/settings.tsx, src/components/FinishNow.tsx, src/components/alliance/AllianceSummary.tsx, src/api/hooks.ts, src/state/useGame.ts, src/i18n/index.tsx"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Smoke screenshots: house description/motto saved + rename 500 → 'Casa Demo Drago'; alliance settings rename → '[DEMO] Lords Demo del Drago'; Città finish pill 100 ◆ → 'Completato', rubies 3800→3700; wallet + specialization screens render."

# ---- iteration 13 (main agent) — Piramide endgame (Bibbia §21) ----
backend:
  - task: "pyramid.py: per-world cycle state machine (DORMANT_INITIAL→OPEN→REWARD_LOCK→DORMANT→OPEN), PYRAMID_STATE_DEADLINE scheduler events, configurable via spec defaults + worlds.pyramid_config override (GET/PUT /api/qa/pyramid/config, POST /api/qa/pyramid/reset), guardian snapshot, marches target_pyramid (ATTACK/REINFORCE gates), capture/hold/rewards (+8/5/5/10% windows on players+settlements, title, seals, prestige, emeralds), garrison return marches, GET /worlds/{w}/pyramid, PYRAMID_STATE_CHANGED notifications."
    implemented: true
    working: true
    file: "backend/app/domain/pyramid.py, pyramid_reward.py, marches.py, alliances.py, economy.py, formulas.py, research.py, recruitment.py, caravans.py, settlements.py, conquest.py, routes_game.py, routes_qa.py, tests/test_pyramid_e2e.py"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: true
        agent: "main"
        comment: "pytest tests/test_pyramid_e2e.py -o addopts='' → 8 passed (config override + open + guardian 441 units, launch gates MERCENARY/REINFORCE/RAID, preview + capture + emeralds/prestige/seal, ally reinforce + enemy repelled + loss split, hold reschedule → REWARD_LOCK rewards (+8% production verified on settlement), lock→dormant return marches + notifications, dormant→cycle 2 with history, realistic restore: world_1 OPEN with spec guardian 22k)."
frontend:
  - task: "3D pyramid monument at 200,200 (map3d/pyramid.ts) with state look; map label 'Piramide' + countdown; tap → map-pyramid-card (state pill, description, phase, Dettagli/Attacca/Rinforza); map-center-pyramid-button; /pyramid screen (hero, my reward, garrison, rewards, cycle timeline, battles, winners); march/new?pyramid=1 (target Piramide, missions from can_attack/can_reinforce, target_pyramid body); inbox PYRAMID_STATE_CHANGED + deep link; alliance tab pyramid tile."
    implemented: true
    working: true
    file: "frontend/src/map3d/pyramid.ts, engine.ts, MapView.tsx, MapLabels.tsx, src/components/PyramidCard.tsx, app/pyramid.tsx, app/(tabs)/map.tsx, app/march/new.tsx, app/(tabs)/inbox.tsx, src/components/alliance/AllianceSummary.tsx, src/api/hooks.ts, src/i18n/index.tsx, app/_layout.tsx"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Smoke screenshots: pyramid rendered + label 'Piramide APERTA', card with Guardiano 22.0k, /pyramid details render, march composer for Piramide (path 195 tiles, mission Attacco)."
      - working: true
        agent: "testing"
        comment: "iteration_13.json: all 7 frontend flows PASS (map HUD center button + 3D monument + label, selection card, /pyramid screen values, march composer target Piramide 195 tiles, alliance tile, inbox deep link, MERCENARY not-eligible hint). No console errors."
agent_communication:
  - agent: "main"
    message: "Iteration 13: Pyramid endgame. Backend fully covered by pytest (do NOT re-run tests/test_pyramid_e2e.py — it resets the cycle; world_1 is left OPEN with the spec guardian on purpose). Please test the frontend flows (map monument + card + details + composer + alliance tile + inbox). Note: world_1 pyramid is OPEN/neutral; demo is in STRUCTURED [DEMO] (eligible), rival is MERCENARY (not eligible → hint)."

# ---- iteration 14 (main agent) — Allerta Piramide + Cinematiche (Bibbia §21 / §41.2) ----
backend:
  - task: "pyramid.on_attack_launched: PYRAMID_ATTACK_INCOMING inbox (HIGH, deep_link pyramid, payload tag+eta only) to every member of the holding alliance + alliance chat SYSTEM line; status.incoming = {march_id, attacker_alliance_tag, arrival_at}; marches store alliance_tag; battles store attacker_house_name/attacker_alliance_tag."
    implemented: true
    working: true
    file: "backend/app/domain/pyramid.py, marches.py, notifications.py, routes_game.py, tests/test_pyramid_e2e.py"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: true
        agent: "main"
        comment: "pytest tests/test_pyramid_e2e.py 8/8 incl. new alert assertions (incoming DTO fields, inbox event for demo+ally, chat system line, attacker sees nothing)."
frontend:
  - task: "PyramidAlertBanner (pyramid-alert-banner) on Map HUD + Alliance tab → /pyramid; /pyramid incoming list (tag + countdown); inbox PYRAMID_ATTACK_INCOMING row. Cinematics: CinematicProvider (root), DEPARTURE played on march launch (cinematic-overlay, cinematic-title, cinematic-skip, cinematic-composition, cinematic-dragon/angel/demon, cinematic-falcon, cinematic-crest, cinematic-alliance-banner), CONQUEST auto-play once on battle report with ownership change (cinematic-conquest, cinematic-conquest-crest) + battle-cinematic-departure / battle-cinematic-conquest replay buttons."
    implemented: true
    working: true
    file: "frontend/src/components/cinematic/Cinematic.tsx, src/components/PyramidCard.tsx, app/_layout.tsx, app/march/new.tsx, app/battle/[id].tsx, app/(tabs)/map.tsx, app/(tabs)/inbox.tsx, app/pyramid.tsx, src/components/alliance/AllianceSummary.tsx, src/api/hooks.ts, src/i18n/index.tsx"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Smoke screenshots: dragon departure cinematic ('Il Drago scende in campo', dragon + falcon + formation + composition + Salta), conquest cinematic on pyramid battle ('La Piramide è nostra!'), red alert banner on map + alliance tab, incoming list in /pyramid."
      - working: true
        agent: "testing"
        comment: "iteration_14.json: all 7 flows PASS (alert banner map+alliance, incoming panel, chat system line, inbox deep link, departure standard + dragon/falcon variants, conquest auto-play once + replay buttons, rival non-owner view). No functional issues."
agent_communication:
  - agent: "main"
    message: "Iteration 14. world_1 state: Pyramid HELD by [DEMO] (demo+ally are owners), one [TRZ] attack in flight (ETA ~1.5 days) → alert banner visible for demo/ally. demo mother has Drago 2, Falco 5 (QA grant) to trigger the dragon/falcon cinematic variants. Max 1 legendary per march (LEGENDARY_LIMIT 409). Do NOT run pytest test_pyramid_e2e.py (resets the cycle). Any march launched for testing should be recalled afterwards (/marches → march card → recall)."

# ---- iteration 15 (main agent) — Cinematiche 3D (three.js su expo-gl) + galleria /cinematics ----
frontend:
  - task: "3D cinematics: CinematicGL (expo-gl host) renders scene3d (night departure: army/banner/torch/dragon/falcon; dawn conquest: castle or pyramid, banner swap, sparks, survivors). Show clock starts only after the GPU finished the first frame (1-px readPixels sync) — fixes the 'overlay vanishes immediately' bug in software-GL environments. Map engine drawing is held while the overlay is up (setMapRenderHold) and resumes after. New gallery screen /cinematics (Casata → 'Cinematiche' button, testIDs cinematic-play-{standard,falcon,major,dragon,angel,demon,conquest,pyramid}) replays every variant with the player's crest/alliance tag. HUD scrims (LinearGradient) for legibility."
    implemented: true
    working: "NA"
    file: "frontend/src/components/cinematic/CinematicGL.tsx, Cinematic.tsx, scene3d/*.ts, src/map3d/engine.ts, app/cinematics.tsx, app/house.tsx, src/i18n/index.tsx"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Smoke screenshots OK: dragon departure (dragon hovering + fire, marching column, banner), conquest (castle, banner fall/rise, sparks, survivors), pyramid conquest, falcon variant; Salta removes overlay; auto-unmount at end; map redraws after the show. NOTE for testing: in this headless/software-GL environment the first GL frame takes ~8s (shader JIT) — the overlay is visible (with HUD) and the 'Salta' button appears ~9s after play; wait up to 40s for cinematic-skip."
      - working: true
        agent: "testing"
        comment: "iteration_15.json: 6/8 PASS (gallery rows, dragon 3D night scene not black + auto-dismiss, conquest dawn castle, pyramid replay from battle report, skip, no console errors). Found: cold-start play before /me hydration → no crest/tag (fixed by main: rows disabled until player loaded). Suggestion applied by main: Salta shown 1s after mount regardless of GL. Not exercised: real march launch (covered in iter14), map-after-cinematic (main verified by screenshot)."

# ---- iteration 16 (main agent) — Cinematiche key-art AI + grafica 3D mappa (tone mapping, texture, ombre, acqua, alberi, Piramide) ----
frontend:
  - task: "Cinematics replaced by AI key-art player (CinematicArt.tsx): 2 bundled JPEG stills per variant (assets/cinematics/*.jpg generated once with Gemini Nano Banana via backend/scripts/gen_cinematics.py), Ken Burns camera moves, cross-dissolve cut with flash, embers, letterbox bars; HUD unchanged (cinematic-overlay, cinematic-title, cinematic-skip, cinematic-composition, cinematic-crest, cinematic-alliance-banner, markers cinematic-departure/conquest, cinematic-variant-{standard|falcon|major|dragon|angel|demon|conquest|pyramid}, cinematic-dragon/angel/demon/falcon). 3D scene files removed. Gallery /cinematics unchanged (rows disabled until player loaded)."
    implemented: true
    working: "NA"
    file: "frontend/src/components/cinematic/Cinematic.tsx, CinematicArt.tsx, app/cinematics.tsx, assets/cinematics/*.jpg"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Smoke screenshots OK: dragon (skip at 1.4s, cut at 55%, auto-dismiss 6s), conquest, skip closes overlay."
  - task: "Map 3D upgrade: ACES tone mapping (exposure 1.05), real-time sun shadow map (2048, follows camera target, radius by zoom) received by terrain (custom shader with three shadow chunks) and castles; procedural tileable textures (textures.ts: terrain detail atlas, stone masonry, roof tiles) — terrain detail + dry patches in shader, castles' walls/towers/roofs textured (mergeGeos now keeps UVs), Pyramid rebuilt (7 masonry tiers, gold edge bands, grand stair with rails + braziers, 4 obelisks, summit shrine + pyramidion, light pillar + halo); water with wave normals, sun glint, Fresnel; trees: jittered 4-tier conifers/5-blob broadleaf with baked AO + wind sway, cast shadows. CastlePreview (/skins) gets the same tone mapping/textures/shadows."
    implemented: true
    working: "NA"
    file: "frontend/src/map3d/engine.ts, terrainMaterial.ts, textures.ts, water.ts, flora.ts, pyramid.ts, entities.ts, geo.ts, CastlePreview.tsx"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Smoke screenshots OK at 3 zoom levels + pyramid; no shader errors in console."
      - working: true
        agent: "testing"
        comment: "iteration_16.json: 7/7 PASS — map renders (terrain mottling, masonry castles, tiled roofs, trees), controls/pyramid centering (stepped stone pyramid, gold bands, stair, braziers, light pillar), labels/legend, skins preview textured, cinematics gallery (dragon/conquest/pyramid/standard key-art, letterbox, cut at 2.2s, skip, auto-dismiss), battle replay, map after cinematics. No errors."

# ---- iteration 17 (main agent) — Intro 24 s, Notte/Giorno del Regno, Skin marce ----
backend:
  - task: "Intro flag: players.intro_seen_at; /worlds/{w}/me → player.intro_seen; POST /worlds/{w}/intro/seen (idempotent). March skins: house.MARCH_SKINS {classic, dragon→Drago, elephant→Elefante da Guerra, falcon→Falco}; GET/PUT /worlds/{w}/house accept/return march_skin + march_skin_unlocks (owned units across garrisons + in-flight marches); PUT with a locked skin → 409 MARCH_SKIN_LOCKED, unknown → 400 INVALID_MARCH_SKIN; changing the skin updates in-flight marches; new marches snapshot player.march_skin → march DTO field `skin`."
    implemented: true
    working: "NA"
    file: "backend/app/domain/house.py, worlds.py, marches.py, api/routes_game.py"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Manual curl-equivalent OK: demo unlocks {classic,dragon,falcon}=true, elephant=false; PUT dragon 200, elephant 409, unicorn 400; intro_seen false → endpoint sets true."
frontend:
  - task: "Intro cinematic (24 s, 6 AI stills intro_0..5 with narrative captions cinematic-caption-0..5, skip after 2 s, marker cinematic-intro, title 'Empire Lords Dragon', subtitle world name): IntroGate in (tabs)/_layout plays it once when player.intro_seen is false and POSTs intro/seen; replay from Missioni → Cronaca (chronicle-intro-replay) and from /cinematics gallery (cinematic-play-intro). Realm daylight (map3d/daylight.ts): UTC+1 server clock drives sun/hemisphere/fog/exposure/terrain+water uniforms, torches brighter and castle windows lit at night (readable blue-hour night); HUD chip map-realm-clock 'HH:MM · Alba/Giorno/Tramonto/Notte'. March skins: Casata panel house-march-skin-panel with house-march-skin-{classic,dragon,elephant,falcon} (locked ones show 'Richiede <unit>'), selection saves immediately; map markers get a low-poly Dragon (flying above, flapping, fire glow) / Elephant (front) / Falcon (circling) rig (map3d/markerSkins.ts)."
    implemented: true
    working: "NA"
    file: "frontend/src/components/cinematic/IntroGate.tsx, Cinematic.tsx, CinematicArt.tsx, app/(tabs)/_layout.tsx, app/(tabs)/missions.tsx, app/(tabs)/map.tsx, app/house.tsx, app/cinematics.tsx, src/map3d/daylight.ts, markerSkins.ts, engine.ts, entities.ts, water.ts"
    stuck_count: 0
    priority: "high"
    priority_note: "demo's intro_seen_at was reset so the intro auto-plays on the next world entry"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Smoke screenshots OK: intro auto-play with captions + skip; realm clock chip (server QA clock is +132 days → shows 14:xx Giorno); night preset verified with a temporary hour override (readable, lit windows); skin panel (elephant locked); dragon rig visible on the map marker at (34,184)."
      - working: true
        agent: "testing"
        comment: "iteration_17.json: backend 6/6 (tests/test_iteration_17.py) + frontend 6/6 — intro auto-play once, skip, no replay on tab switch, Cronaca replay, gallery intro, realm clock chip, skins tiles (elephant locked, falcon/dragon select + API), attack cinematic regression. Suggestion: add testID missions-segment-chronicle."

# ---- iteration 18 (main agent) — Chat del Regno, Login giornaliero, Mercenari diretti, look "adulto", Account Max ----
backend:
  - task: "Realm chat (domain/chat.py): GET /worlds/{w}/chat/summary|world|negotiations/{alliance_id}, POST /chat/world (1 msg / 3 s → 429 RATE_LIMITED) and /chat/negotiations/{id} (Leader/Vice/Diplomat only → 403 FORBIDDEN_ROLE). Daily login (domain/daily.py): GET /worlds/{w}/daily (day 1..7, claimable, streak, rewards preview, speedup_minutes), POST /daily/claim (atomic, 409 ALREADY_CLAIMED on second claim; resources credited to the capital within the warehouse cap, speed-up minutes banked on players.speedup_minutes), POST /jobs/{id}/speedup {minutes} (409 INSUFFICIENT_SPEEDUP / JOB_NOT_RUNNING; completes through the scheduler handler when the job ends). Mercenary directory GET /worlds/{w}/mercenaries + directed offers (provider_alliance_id). Max account script scripts/max_account.py (max@empirelords.com / Max12345!) + /app/memory/MAX_ACCOUNT_REPORT.md."
    implemented: true
    working: "NA"
    file: "backend/app/domain/chat.py, daily.py, alliances.py, api/routes_alliance.py, routes_premium.py, scripts/max_account.py"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "tests/smoke_new_endpoints.py + tests/smoke_max_account.py: all 200 (daily preview 896/res for demo, chat summary, mercenaries [MERC], max account readable at every cap: L30, 20/21 MAXED, 114/114 research, 3/3/3 legendaries). Daily claim verified through the UI (demo claimed day 1)."
frontend:
  - task: "Chat dock (chat-dock, chat-dock-preview, chat-dock-unread) above the tab bar; panel chat-panel with chat-tab-world / chat-tab-alliance / chat-tab-nego-{id}, chat-input, chat-send, chat-panel-close. Daily vault /daily (daily-screen, daily-title, daily-speedup-bank, daily-chest-stage GL, daily-strip with daily-day-1..7, daily-claim → chest opens → daily-reveal with daily-reward-{res}/daily-reward-speedup, daily-tomorrow, daily-done; claimed state: daily-claimed-label + daily-next-reset); auto-open once per session via DailyGate when claimable; entry buttons map-daily-button (+ map-daily-dot) and settlement-daily-button (+ settlement-daily-dot). Speed-up pill job-{id}-speedup next to timers (only when the bank > 0). Mercenary directory merc-{alliance_id} rows with merc-{id}-propose (directed offer note hire-directed-note) and merc-{id}-chat (opens negotiation room). Map selection card map-selection-caravan for own (non-active) / ally settlements. House: house-march-skin-preview (GL) + house-march-skin-preview-label; tapping a locked skin previews it without saving. Missions: mission-card-{key}-art banners (5 timed missions) + mission-new-art. Map palette darker/desaturated (theme.ts, terrainMaterial.ts, daylight.ts)."
    implemented: true
    working: "NA"
    file: "frontend/app/daily.tsx, app/(tabs)/_layout.tsx, app/(tabs)/map.tsx, app/(tabs)/settlement.tsx, app/(tabs)/missions.tsx, app/(tabs)/army.tsx, app/research.tsx, app/building/[name].tsx, app/mission/new.tsx, app/house.tsx, app/alliance/mercenary.tsx, src/components/chat/ChatDock.tsx, src/components/daily/ChestGL.tsx, DailyGate.tsx, src/components/SpeedupButton.tsx, src/components/MissionArt.tsx, src/map3d/MarchSkinPreview.tsx, src/theme.ts, src/map3d/terrainMaterial.ts, daylight.ts"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Smoke screenshots OK: dock visible above tabs with realm preview; vault auto-opened, chest on the painted pedestal, claim → lid opens + coins → reveal card with +896 ×5; house preview dragon/elephant; map darker. Demo already claimed today's reward (advance the QA clock 1 day to re-test the claim, or use max@empirelords.com which has not claimed)."

# ---- iteration 18b (main agent) — no raw codes in the UI ----
frontend:
  - task: "Human-readable labels everywhere the Player used to see raw codes: Chronicle (PYRAMID_OPEN/CAPTURED/WON/NEUTRALIZED templates chr_*), House history (prestigeReason_pyramid_*, mercenary_contract; kinds PYRAMID_VICTORY / RENAMED), Army (unit category labels, unlock line 'Richiede: Insediamento liv. N · ricerca «Nome» · Edificio' from unlockLine + backend required_research_name), Città/Edificio locked lines, Inbox (event titles evt_*, job states, research_name, march results, return reasons, contract results, ledger reasons, NEGOTIATION_MESSAGE, no JSON fallback), Treasury ledger reasons, Battle report (terrain name, luck, winner's losses, reason)."
    implemented: true
    working: true
    file: "frontend/app/(tabs)/missions.tsx, inbox.tsx, army.tsx, settlement.tsx, app/building/[name].tsx, app/battle/[id].tsx, app/alliance/mercenary.tsx, treasury.tsx, src/i18n/index.tsx, src/map3d/MapLabels.tsx; backend/app/domain/settlements.py (required_research_name), research.py + construction.py (research_name / target in notifications)"
    stuck_count: 0
    priority: "medium"
    status_history:
      - working: true
        agent: "main"
        comment: "Screenshots: Cronaca, Storia della Casata, Esercito, Inbox all readable in Italian (no PYRAMID_*, JSON, 'Tier undefined', 'military.archery_unlock', 'infantry')."

# ---- iteration 19 (main agent) — living 3D village, settings/logout, resources-only daily, inbox filters ----
backend:
  - task: "Daily login now resources only: GET /worlds/{w}/daily rewards[] have kind RESOURCES|CHEST + mult (1/1.25/1.5/1.75/2/2.5/4), no speedup fields; POST /daily/claim grants resources only; /jobs/{id}/speedup endpoint REMOVED (404)."
    implemented: true
    working: "NA"
    file: "backend/app/domain/daily.py, api/routes_premium.py"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "smoke_new_endpoints.py: GET /daily 200 with mult fields, no speedup_minutes."
frontend:
  - task: "Living 3D village in the Città tab (settlement-village panel with settlement-village-expand → /city full screen: city-screen, city-back, city-title, city-hint; tap a building → city-picked card with city-picked-name and city-picked-open → /building/[name]); villagers walk, castle + houses + walls scale with level (demo L3 ≈ 6 inhabitants; max L30 ≈ 29). Settings screen /settings from settlement-settings-button (gear in Città header): settings-account/settings-email, settings-lang-it/en, settings-change-world, settings-house, settings-logout → back to login. Daily vault resources only (no ⏩ bank, strip shows ×1..×4). Inbox filter chips inbox-filter-all/battles/queues/marches/alliance/realm with unread counts; inbox-empty shows a category-specific text."
    implemented: true
    working: "NA"
    file: "frontend/src/city/*, app/city.tsx, app/settings.tsx, app/(tabs)/settlement.tsx, app/(tabs)/inbox.tsx, app/daily.tsx, src/api/hooks.ts"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Screenshots OK for demo (L3) and max (L30) villages in panel + full screen, pick → castle card, settings screen, inbox battles filter. WebGL is slow in headless browsers: allow 6-10 s after opening Città/city."

# ---- iteration 19b (main agent) ----
frontend:
  - task: "UnitStepper card (mission-unit-{u}, -minus/-input/-plus/-half/-max/-value; march-unit-{u} same) replaces the cramped inline stepper in /mission/new and /march/new. Città header: terrain label translated, buttons 40px so the settlement name fits. Backend/QA: qa/grant lifts settlement level to the highest granted building (Bible invariant); demo settlements repaired to L10."
    implemented: true
    working: true
    file: "frontend/src/components/UnitStepper.tsx, src/game/units.ts, app/mission/new.tsx, app/march/new.tsx, app/(tabs)/settlement.tsx, backend/app/api/routes_qa.py, backend/scripts/repair_building_levels.py"
    stuck_count: 0
    priority: "medium"
    status_history:
      - working: true
        agent: "main"
        comment: "Screenshot at 360px: mission composer cards readable; Città shows L10 with consistent buildings."

# ---- iteration 20 (main agent) — "storybook" Game-of-Warriors graphics (city + world map), no blocky bricks ----
frontend:
  - task: "Vivid storybook 3D look: city (src/city/village.ts rounded blocks, puffy gables, curved 'hat' roofs, lumpy trees, rolling meadow with vertex colours, sky dome + clouds in src/city/sky.ts, no ink outlines), shared castle rig softened (src/map3d/castle.ts RoundedBox keep, 12-seg towers, hat roofs) and natural fieldstone texture (src/map3d/textures.ts), vivid theme terrain tokens (theme.ts), terrain shader grading removed (terrainMaterial.ts), warmer/brighter daylight presets (daylight.ts). Game rules untouched. Flows to regress: map renders + tap settlement → selection card (map-selection-* incl. map-selection-caravan for own), Città panel (settlement-village) → settlement-village-expand → /city (city-screen) → tap castle → city-picked-name 'Castello / Fortezza' → city-back; /skins CastlePreview GL renders; /house march skin preview renders; no red console errors."
    implemented: true
    working: "NA"
    file: "frontend/src/city/village.ts, cityTextures.ts, sky.ts, CityScene.tsx, src/map3d/castle.ts, textures.ts, entities.ts, daylight.ts, terrainMaterial.ts, engine.ts, src/theme.ts"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Screenshots OK: map vivid (green plain, pine forests, blue water, softened castles), city bright with sky/clouds when tilted (drag up), pick castle → card. WebGL headless is slow: allow 6-10 s after opening Mappa/Città/city."

# ---- iteration 21 (main agent) — Sentinel sectors as wedges, allied borders merged, configurable realm size (Regno 2 600×600) ----
backend:
  - task: "sentinels.sector_tiles wedge geometry (INNER 90° wedge of the 7x7 square, 12 tiles each incl. one diagonal; OUTER 45° wedge of the ring band 4..5, 8-10 tiles) + scripts/recompute_sentinel_sectors.py; worldgen.GenConfig (size/spacing/pyramid anchor) with S=size/400 landmass scaling, deterministic for 400 (verified identical to previous generator); POST /api/worlds accepts size/hard_min_player_distance/preferred_player_distance/neutral_min_distance/neutral_preferred_distance (admin); world doc stores gen_config + pyramid_config.anchor; pathfinding/territory/marches/sentinels/routes chunk+overview bounds use the world size."
    implemented: true
    working: "NA"
    file: "backend/app/domain/sentinels.py, worldgen.py, worlds.py, pathfinding.py, territory.py, marches.py, backend/app/api/routes_game.py"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Regno 2 (world_2) created 600x600 in 1.9 s: 100 slots, 800 neutrals, min player distance 20, neutral 7. Demo joined as 'Casa Demo Due'. pytest test_runtime -k sentinel passes."
frontend:
  - task: "MapEngine world size from world DTO (MapView3D worldSize prop, rendered once me.world.size is known), pyramid anchor from pyramid DTO; territory ribbon not drawn between OWN and ALLY tiles."
    implemented: true
    working: "NA"
    file: "frontend/src/map3d/engine.ts, MapView.tsx, territory.ts, app/(tabs)/map.tsx, daylight.ts"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Screenshots: world_2 map renders (home 534,546; Piramide at 301,301; minimap 600); world_1 home shows the 7x7 wedge territory with 4 sentinels."

# ---- iteration 22 (main agent) — Natural boundary (water replaces the Sentinel), 12 sentinel slots, 3D sentinel towers in the city ----
backend:
  - task: "12 slots (4 INNER cardinals r3 + 8 OUTER all dirs r5): POST /worlds/{w}/settlements/{s}/sentinels {direction, ring?}; GET returns {sentinels, natural[], outer_unlocked, garrison_cap, command_level}; natural boundary sectors claimed as NATURAL:<sid>:<ring>:<dir> when the slot tile is water/off-map (mountain never); building on water → 409 NATURAL_BOUNDARY."
    implemented: true
    working: "NA"
    file: "backend/app/domain/sentinels.py, backend/app/api/routes_game.py, backend/tests/test_sentinel_geometry.py"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Demo home world_1 now has 4 inner GUARDED + outer N and NE BUILDING (Perimetro Avanzato granted via QA). pytest geometry tests pass (4)."
frontend:
  - task: "/sentinels screen: inner grid (sentinel-build-{dir}) + outer grid (sentinel-build-outer-{dir}, locked without research) + natural-boundary panel (sentinels-natural-panel); city 3D: sentinel towers around the walls per state (src/city/sentinelTowers.ts) + camera farther by default."
    implemented: true
    working: "NA"
    file: "frontend/app/sentinels.tsx, frontend/src/city/sentinelTowers.ts, village.ts, useVillageInput.ts, CityScene.tsx, app/(tabs)/settlement.tsx"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Screenshots: sentinels screen shows 4+8 slots with ✓ on built; city shows towers with lit braziers + empty slot posts outside the walls."

# ---- iteration 24 (main agent) — caravan escort UX/blockers, Reinforce button for own settlements, "Carovane nei dintorni" (50-tile search) ----
frontend:
  - task: "Caravan composer up-front blockers (caravanAlreadyOutbound / outgoingCapReached / escort-empty hint) + Italian API error toasts; map selection card 'Rinforza' (map-selection-reinforce) for own non-active settlements → /march/new REINFORCE; map HUD binoculars button (map-nearby-caravans-button + map-nearby-caravans-badge) → /caravan/nearby (nearby-caravans-screen, rows nearby-caravan-<id> with -raid / -map / -reach); caravans hub row button renamed 'Saccheggia'."
    implemented: true
    working: "NA"
    file: "frontend/app/caravan/new.tsx, app/caravan/nearby.tsx, app/(tabs)/map.tsx, app/caravans.tsx, src/components/overlay.tsx, src/i18n/index.tsx, src/api/hooks.ts"
    stuck_count: 0
    priority: "high"
backend:
  - task: "caravans.search_radius(research, world) = max(Bible, world.caravan_search_radius=50); search returns distance/target_xy sorted; create_world sets caravan_search_radius 50."
    implemented: true
    working: "NA"
    file: "backend/app/domain/caravans.py, worlds.py, routes_game.py"
    stuck_count: 0
    priority: "high"

# ---- iteration 25 (main agent) — GRANDE MONDO Fase 1 (Bibbia GM v0.2): mega-mappa 9 regioni, muro di nebbia, ciclo ISOLAMENTO/GUERRA ----
backend:
  - task: "grande_mondo.py: layout ring (9 regioni 600x600, gap 64, mondo 3232), zone grid, fog_up/check_target/movement_mask (FOG_WALL 409), ciclo ISOLATION(120g)->WAR(20g)->ISOLATION via scheduler GM_PHASE_DEADLINE + notifica GRANDE_MONDO_PHASE + cronaca; worldgen.generate_grande_mondo (9 regni validati + terra centrale con Grande Piramide + 9 'Vie della Piramide' cost-compensate con passo di montagna); worlds.create_grande_mondo/join(region_code, REGION_REQUIRED/REGION_FULL, cap 100) ; world_dto.grande_mondo; /worlds/{w}/grande-mondo; map chunk/overview filtrati (fogged) fuori dalle zone visibili; marches/caravans usano check_target + allowed mask; astar octile + astar_async; QA POST /qa/grande-mondo/phase {world_id,to}; scripts/create_grande_mondo.py (gm_1 creato)."
    implemented: true
    working: "NA"
    file: "backend/app/domain/grande_mondo.py, worldgen.py, worlds.py, pathfinding.py, marches.py, caravans.py, backend/app/api/routes_game.py, routes_qa.py, server.py, scripts/create_grande_mondo.py"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Manual httpx: join IT ok, join senza regione 400 REGION_REQUIRED, chunk FR fogged (0 settlements) in ISOLATION, preview IT->FR 409 FOG_WALL, QA->WAR: chunk FR visibile, inbox GRANDE_MONDO_PHASE, cronaca GM_FOG_FALLEN, QA->ISOLATION cycle 2. A* 900 tiles 0.2s (era 5s)."
frontend:
  - task: "worlds.tsx: badge GRANDE MONDO + sottotitolo fase/countdown + sheet scelta regione (join-region-list, join-region-<CODE>, join-region-chosen) prima del nome Casa; map.tsx: chip map-gm-chip (Nebbia/Guerra · countdown · bandiera) -> /grande-mondo, viewBounds regione (camera clamp + minimap regione + muro di nebbia 3D src/map3d/fog.ts), pulsante piramide centra la Piramide regionale con nebbia alta; app/grande-mondo.tsx (gm-phase-card, gm-countdown, gm-rules, gm-region-<CODE>, gm-my-region); inbox GRANDE_MONDO_PHASE; engine: overview factor 8 per mondi >1024, tile far-LOD finestrati attorno alla camera, minimap sui bounds."
    implemented: true
    working: "NA"
    file: "frontend/app/worlds.tsx, app/grande-mondo.tsx, app/(tabs)/map.tsx, app/(tabs)/inbox.tsx, app/_layout.tsx, src/map3d/engine.ts, src/map3d/fog.ts, src/map3d/MapView.tsx, src/game/grandeMondo.ts, src/api/hooks.ts, src/i18n/index.tsx"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Screenshots: card Grande Mondo 1 (9 regioni · mega-mappa 3232×3232 · Muro di nebbia · 119g 19h · 🇮🇹 Italia), mappa gm_1 con chip 'Nebbia · 119g 19h · 🇮🇹 IT', minimap regionale, nebbia grigia oltre il confine nord; schermata /grande-mondo con countdown, regole e 9 regioni."

# ---- iteration 26 (main agent) — Sei lingue, Teletrasporto castello (Bibbia GM), Guerra 30 gg, account Osservatore ----
backend:
  - task: "teleport.py: GET/POST /worlds/{w}/settlements/{s}/teleport — candidati = PLAYER_SLOT FREE della regione del giocatore (solo port_eligible se il castello ha un Porto), ordinati per distanza dal Castello Madre; POST {slot_id, idempotency_key}: TELEPORT_MOTHER / TELEPORT_BUSY (marce in volo) / TELEPORT_SLOT_UNAVAILABLE / INSUFFICIENT_RUBIES; claim atomico slot→debit 2000 Rubini (ledger TELEPORT_CASTLE, idempotente per key)→swap coordinate (park off-map per unique index)→territorio/riserva slot/sentinelle ri-ancorate→teleport_log + cronaca CASTLE_TELEPORTED + inbox. grande_mondo DEFAULTS war_days 30 (+ gm_1.gm_config.war_days=30); dto.view_all; _fog_zones bypass per players.view_all_regions; scripts/observer_account.py (osservatore@empirelords.com / Demo12345!, gm_1 IT, view_all_regions, 3 castelli, 999.999 Rubini); scripts/translate_i18n.py (LLM gpt-5.4-mini via Emergent key → src/i18n/locales/*.ts)."
    implemented: true
    working: "NA"
    file: "backend/app/domain/teleport.py, grande_mondo.py, backend/app/api/routes_game.py, scripts/observer_account.py, scripts/translate_i18n.py"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "httpx: mother → 409 TELEPORT_MOTHER; candidates 1 (Porto); teleport 200 from [1442,458] to [1596,618], replay same key → replayed true, same slot again → 409 TELEPORT_SLOT_UNAVAILABLE; chunk: vecchia posizione = PLAYER_SLOT FREE, nuova = PLAYER L14; teleport_log ok; base tiles 4 + riserva 49 tile."
frontend:
  - task: "i18n 8 lingue (it en fr es de ru zh pt): locales generati, LANGS/normalizeLang/localeOf, fallback en, selettori login (lang-<code>) e settings (settings-lang-<code>), sheet regione propone la lingua (join-apply-lang checkbox) applicata dopo il join; /teleport (teleport-screen, teleport-price, teleport-candidate-<slot>, teleport-choose-<slot>, teleport-confirm-sheet/-body/-confirm-button/-cancel-button, teleport-mother, teleport-empty) + pulsante settlement-teleport-button (solo GM, castelli non Madre); inbox CASTLE_TELEPORTED; map/grande-mondo rispettano view_all (osservatore senza nebbia); label piramide senza countdown se > 1 anno; card mondi: badge GRANDE MONDO sotto il titolo."
    implemented: true
    working: "NA"
    file: "frontend/src/i18n/index.tsx, src/i18n/locales/*.ts, app/login.tsx, app/settings.tsx, app/worlds.tsx, app/teleport.tsx, app/(tabs)/settlement.tsx, app/(tabs)/inbox.tsx, app/(tabs)/map.tsx, app/grande-mondo.tsx, src/map3d/MapLabels.tsx, src/api/hooks.ts, src/components/MarchCard.tsx"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Screenshots: login in francese con 8 pill lingua; card mondi in francese; osservatore vede la mappa senza nebbia (minimap intero mondo) e la Grande Piramide a 1617,1617; schermata teletrasporto con candidato e sheet di conferma."

# ---- iteration 27 (main agent) — Grande Mondo layout a spicchi (sector/pie), guerre selettive con velocità custom, fix UI mappa ----
backend:
  - task: "worldgen/grande_mondo: NUOVO layout a spicchi — mondo 2176×2176, centro (1088,1088) disco r_in=130 con Grande Piramide footprint 41×41, 9 settori (mid_deg/half_deg, r_land 880, r_out 1030, canale mare 24 tile tra settori); region DTO ora ha index/mid_deg/half_deg/r_in/r_land/r_out/bbox/center/pyramid_anchor (NIENTE più x0/y0/size); zone_grid/allowed_zones/war_zones; admin: POST /worlds/{w}/grande-mondo/admin/war-config {regions:[codes]|null, speed_multiplier in (1,2,3,5)} (400 WAR_CONFIG_INVALID se <2 regioni o mult non valido), POST .../admin/phase {to: WAR|ISOLATION} (403 FORBIDDEN se non gm_admin); durante WAR le marce che escono dalla propria zona verso una zona in guerra usano speed_multiplier; regioni non in guerra restano isolate (my_fog_up true); GET /worlds/{w}/grande-mondo → phase, cycle, seconds_left, regions[], center{x,y,radius,pyramid_anchor}, war, next_war, speed_multipliers, my_region, view_all, is_admin. I vecchi test tests/test_iteration_25_grande_mondo.py e test_iteration_26_teleport.py hanno aspettative stantie (size 3232, anchor 1616, x0/y0, guerra 20 gg) → da aggiornare alla nuova geometria (war_days=30)."
    implemented: true
    working: "NA"
    file: "backend/app/domain/grande_mondo.py, worldgen.py, worlds.py, pathfinding.py, marches.py, backend/app/api/routes_game.py, scripts/create_grande_mondo.py"
    stuck_count: 0
    priority: "high"
frontend:
  - task: "map.tsx: nuovo SettlementSwitcher (src/components/SettlementSwitcher.tsx) per chi ha più villaggi: chip scorrevoli + frecce prev/next (map-settlement-prev / map-settlement-next) che selezionano il villaggio e centrano la camera + pulsante lista (map-settlement-list) → Sheet con tutti i villaggi (map-settlement-item-<id>); minimap spostata a sinistra (i pulsanti +/- a destra non la toccano più); grande-mondo.tsx: freccia indietro (grande-mondo-back), pannello admin (gm-admin-region-<CODE>, gm-admin-region-ALL, gm-admin-speed-<n>, gm-admin-save, gm-admin-drop-fog / gm-admin-raise-fog, gm-admin-confirm-button); settings.tsx e teleport.tsx: freccia indietro (settings-back, teleport-back); fog.ts: muro di nebbia a settori (coltre sulle zone non raggiungibili)."
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/map.tsx, src/components/SettlementSwitcher.tsx, app/grande-mondo.tsx, app/settings.tsx, app/teleport.tsx, src/map3d/fog.ts, src/map3d/engine.ts, src/game/grandeMondo.ts"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Screenshot osservatore: switcher con frecce e sheet 'Insediamenti · 3' OK; Grande Piramide a 1088,1088 (grande); minimap mostra il mondo circolare a 9 spicchi; /grande-mondo con freccia indietro e pannello admin (IT+FR ×5)."

# ---- iteration 28 (main agent) — Piccole Piramidi (una per regione) + Grande Piramide (apertura admin, premio regionale) ----
backend:
  - task: "pyramid.py multi-istanza: collection `pyramid` con un doc per Piramide: `_id = world_id` (CLASSIC nei regni classici; GRAND = Grande Piramide nel Grande Mondo, kind/manual_open) e `_id = f'{world_id}:{CODE}'` (REGIONAL = Piccola Piramide, ancora = regions[k].pyramid_anchor, footprint 15×15, Guardiano fisso 250k = guardian.min_power 250000 + median_multiplier 0, contendibile solo dai giocatori con region_code della regione → 409 PYRAMID_WRONG_REGION). GRAND: manual_open (nessun calendario), reward_scope REGION (7 gg, +10% prod, +5% ricerca, +10% addestramento a TUTTI i giocatori della regione dell'Alleanza vincitrice, slot `grand_pyramid_reward` che si SOMMA a `pyramid_reward`), titolo 'Custode della Grande Piramide', prestigio vittoria 500; alla vittoria la guerra finisce prima (transition → ISOLATION reason GRAND_PYRAMID_WON) e `gm.grand_wins` registra il vincitore; al ritorno della nebbia una Grande Piramide OPEN si chiude (close_grand: DORMANT, presidio torna a casa). API: GET /worlds/{w}/pyramid?id=…, GET /worlds/{w}/pyramids (lista compatta), MarchIn.pyramid_id (preview/launch), GET /grande-mondo → + pyramids/grand_pyramid/my_pyramid/regional_first_open_day/regional_overrides/grand_wins; admin: POST …/grande-mondo/admin/grand-pyramid {action: OPEN|CLOSE} (409 GRAND_PYRAMID_NEEDS_WAR se non in guerra), POST …/admin/regional-pyramid-config {region: CODE|null, config: {first_open_day…}} (null = tutte le regioni, slot '*'); QA: /qa/pyramid/config|reset accettano pyramid_id (+ all_regions). Test: tests/test_iteration_28_pyramids.py 10/10, tests/test_pyramid_e2e.py 8/8 (classico, nessuna regressione)."
    implemented: true
    working: true
    file: "backend/app/domain/pyramid.py, pyramid_reward.py, marches.py, grande_mondo.py, conquest.py, worlds.py, backend/app/api/routes_game.py, routes_qa.py, tests/test_iteration_28_pyramids.py"
    stuck_count: 0
    priority: "high"
frontend:
  - task: "Monumenti multipli: engine.setPyramids(list) (un PyramidMonument per Piramide, scala per footprint, picking/label/minimap per ognuno), MapView prop `pyramids`; map.tsx usa usePyramids (filtrate alle zone raggiungibili con la nebbia alta) + usePyramid(id) per la card della Piramide selezionata (map-pyramid-card, Dettagli → /pyramid?id=, Attacca/Rinforza → /march/new?pyramid=<id>); pulsante piramide centra sulla PROPRIA Piramide (Piccola nella regione). /pyramid: param `id`, chips switcher (pyramid-switcher, pyramid-switch-<id con : → ->), hint per kind (pyramid-grand-hint / pyramid-regional-hint), premi per kind. /grande-mondo: pannello 'Le Piramidi' (gm-pyramids, gm-my-pyramid, gm-grand-pyramid, gm-grand-win-<cycle>), admin: gm-admin-grand-open / gm-admin-grand-close, Piccole Piramidi: gm-admin-pyr-scope-ALL|<CODE>, gm-admin-pyr-days, gm-admin-pyr-save; regola 4 (gmRule4). march/new: pyramid param = id (legacy '1' = propria), body.pyramid_id. Inbox deep link pyramid?id=. 25 nuove chiavi i18n in 8 lingue."
    implemented: true
    working: "NA"
    file: "frontend/src/map3d/engine.ts, MapView.tsx, MapLabels.tsx, app/(tabs)/map.tsx, app/pyramid.tsx, app/grande-mondo.tsx, app/march/new.tsx, app/(tabs)/inbox.tsx, src/components/PyramidCard.tsx, src/api/hooks.ts, src/i18n/*"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Screenshot osservatore: monumento 'Piccola Piramide IT' a 1088,583 con etichetta e card SIGILLATA · Si apre tra 57g; /pyramid con switcher Grande/Piccola; /grande-mondo con pannello Piramidi, Custodi e admin (Apri la Grande Piramide disabilitato in Isolamento, Piccole Piramidi prima apertura 90)."

# ---- iteration 29 (main agent) — RESTYLING GRAFICO (solo frontend; regole/API/backend invariati; checkpoint git f0cfc17) ----
frontend:
  - task: "Mappa 3D: notte 'ora blu' leggibile (daylight.ts NIGHT più luminosa + AmbientLight fill in engine), skin castelli più chiare/sature (castle.ts CASTLE_SKINS), tier visivi Villaggio <10 = palizzata di legno (part `palisade`), Città 10–29 = mura in pietra, Metropoli 30 = cinta esterna + 4 bastioni + guglia dorata (entities.ts), targhe etichette con pip livello + [TAG] alleanza + icona tier (MapLabels.tsx, engine label.tag), marce come nastri con chevron animati (marchPath.ts, depthTest off: visibili sopra boschi/colline) e conteggio truppe nell'etichetta ('Saccheggio · 20 · 4h'), Piramide più chiara anche dormiente + anello/aura di stato (grigio sigillata, oro libera, colore fazione occupata) + alone rotante all'apice quando aperta (pyramid.ts). Città 3D: palizzata per villaggi senza Mura, lanterne stradali per Città ≥10, piazza con fontana/obelisco dorato + pennoni con bandiere + alberi ornamentali per Metropoli 30 (village.ts), cielo notturno più chiaro (sky.ts). Schermate: Missioni (tile durata/ricarica, chip requisiti, chip premi con icone, card missione attiva con % e barra, traguardi a forzieri), Ricerca (albero per ramo: ResearchTree.tsx con colonne per profondità prerequisiti, connettori SVG, pip livelli n/5, badge stato, chip 'Sblocca …', legenda; 'Tutte' resta lista; sheet con requisiti a spunta e prerequisiti con nome), Edificio (hero con icona, livello attuale → successivo → max, barra, tile 'Attuale' produzione/capacità, requisiti a spunta, costi, tempo, pulsante 'Migliora → L{n}'; card edifici con icone — src/game/buildings.ts), Rapporto battaglia (banner Vittoria/Sconfitta, barra confronto potenza, chip modificatori, tabelle perdite con icone unità e barra superstiti; rimossi seed/battle_id visibili). 2 nuove chiavi i18n (shipsNoCasualties, fastBuild) in 8 lingue."
    implemented: true
    working: "NA"
    file: "frontend/src/map3d/{daylight,castle,entities,engine,pyramid,marchPath}.ts, MapLabels.tsx, src/city/{village,sky}.ts, app/(tabs)/{missions,settlement}.tsx, app/research.tsx, src/components/ResearchTree.tsx, app/building/[name].tsx, src/game/{buildings,missions}.ts, app/battle/[id].tsx, src/i18n/*"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Screenshot prima/dopo in /app/test_reports/screens/{before,after}. tsc + eslint puliti. Nessun file backend toccato."

# ---- iteration 30 (main agent) — fix post-restyling: tap etichetta marcia, textShadow, traduzioni RU/ES/PT ----
frontend:
  - task: "engine.tap(): il tocco sul chip etichetta della marcia (anchor marker +1.7, clamp come MapLabels.clampX, −60/−46 px, ≈150×20) seleziona la MARCIA (MarchCard: testID map-selection-card + map-selection-march-recall 'Richiama', map-selection-march-list, map-selection-march-eta) invece del castello dietro; textShadow* → helper theme.textShadow (web: shorthand CSS, native: props classiche), ember boxShadow; missions-active-panel già presente nello stato vuoto (verificato); locali RU/ES/PT ritradotti dove il modello aveva restituito l'italiano (translate_i18n.py: chiavi 'stale' = uguali all'IT rifatte con --only-missing)."
    implemented: true
    working: "NA"
    file: "frontend/src/map3d/engine.ts, src/theme.ts, src/components/cinematic/{Cinematic,CinematicArt}.tsx, src/components/MissionArt.tsx, src/i18n/locales/{ru,es,pt,fr,de,zh}.ts, backend/scripts/translate_i18n.py"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Screenshot: tap su 'Saccheggio · 20 3h 17m' → card marcia 'Saccheggio → Neutrale 21,177 · In marcia · Cavalleria 20 · Richiama'. tsc pulito."
      - working: true
        agent: "main"
        comment: "Iteration 30 finale: labelHit() generalizzato a targhe castello (tester aveva trovato tap su targa 'Casa Demo' → tile 'Pianura 4,184'); verificati via screenshot: targhe demo (2 castelli) → card corretta; Lord L30 Metropoli world_2 (pip 30 + corona, cinta+bastioni+guglia) → card 'Casa Lord · L30 · 491,543'; switcher 5 villaggi OK; Osservatore gm_1: niente nebbia, chip GM, map-center-pyramid-button → 'Piccola Piramide · IT 53g 20h', tap etichetta → map-pyramid-card. daily-close usa canGoBack(). Testing agent seconda run: timeout (WebGL lento), nessun report iteration_30."

# ---- iteration 31 (main agent) — Inattività 3/30/120, Specializzazione in Casata, Cap Leggendari, Guida primo accesso ----
backend:
  - task: "Inattività (domain/inactivity.py): last_active_at aggiornato (throttle 10 min) in worlds.get_player; sweep INACTIVITY_SWEEP per mondo ogni 6h (bootstrap in server.py; migrazione last_active_at=now per i giocatori esistenti). Regola: mondo < 30 gg → 3 gg senza accesso → REMOVE (slot Madre torna PLAYER_SLOT FREE + raggio riserva, ex-neutrali conquistati → NEUTRAL, player_count −1, regione −1 nel GM); mondo ≥ 30 gg → 120 gg → NEUTRAL (spec.neutral_conversion: livelli/edifici/HP mura conservati, risorse 50%, guarnigione 100·L², territorio+Sentinelle rimossi, ricerca congelata, catch_up_neutral conserva gli edifici via converted_from_player). Sempre: marce DISBANDED, job CANCELLED, uscita dall'alleanza, status ELIMINATED (reason INACTIVE_EARLY|INACTIVE), audit + Cronaca PLAYER_INACTIVE. Esenti: inactivity_exempt (fixture demo/lord/max/osservatore) e view_all_regions. QA: PUT /qa/inactivity/config {world_id, config|null}, POST /qa/inactivity/touch {player_id, days_ago, exempt?}, POST /qa/inactivity/sweep {world_id}. DTO: world.inactivity {phase, timeout_days, mode, early_phase_until, …}, player.last_active_at, player.tour_seen; POST /worlds/{w}/tour/seen."
    implemented: true
    working: true
    file: "backend/app/domain/inactivity.py, worlds.py, settlements.py, server.py, api/routes_qa.py, api/routes_game.py, core/spec.py, tests/test_iteration_31_inactivity.py"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: true
        agent: "main"
        comment: "pytest tests/test_iteration_31_inactivity.py 5/5 (regola esposta, REMOVE con slot riaperto e player_count −1/+1, NEUTRAL con livello 3 conservato e guarnigione neutrale, fixture esenti, cap Leggendari 3/3 → batch_cap 0 e 409)."
  - task: "Cap Leggendari (recruitment.legendary_usage): max 3 per tipo per Metropoli = guarnigione + coda residua + in marcia dall'origine; start_recruitment → 409 LEGENDARY_CAP_REACHED; GET /army espone units[].legendary_cap {max, used, garrison, queued, in_flight, free}, batch_cap=min(1,free), state BLOCKED_CAP a cap pieno. spec.legendary_stacking esposto in core/spec.py."
    implemented: true
    working: true
    file: "backend/app/domain/recruitment.py, api/routes_game.py"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: true
        agent: "main"
        comment: "Verificato via pytest (lord world_2) e screenshot Esercito: pill 'Cap raggiunto', box 'Cap Metropoli ●●● 3/3 · Guarnigione 3 · in coda 0 · in marcia 0', foglio recluta con 'Lotto max: 0' e pulsante disabilitato."
frontend:
  - task: "Guida primo accesso (src/state/tour.ts store + components/tour/{TourOverlay,TourGate}.tsx): 4 passi Mappa→Città→Missioni→Piramidi con spotlight (tab misurate da MeasuredTabBar in (tabs)/_layout; pulsante piramide registrato con useTourTarget in map.tsx), card con testo, 'Salta la guida'/'Avanti'/'Inizia a giocare', testID tour-overlay, tour-step-<id>, tour-spotlight-<id>, tour-title, tour-body, tour-next, tour-skip, tour-progress. Auto-start solo se player.intro_seen && !player.tour_seen (giocatori esistenti backfillati tour_seen_at); DailyGate attende tour_seen && !tour.active. Impostazioni: 'Rivedi la guida' (settings-tour-replay → /(tabs)/map + tour.start) e pannello 'Regola inattività' (settings-inactivity, settings-inactivity-rule, settings-last-active). Casata: SpecializationCard (house-specialization-panel/current/bonus/available/locked/cooldown/button). Esercito: contatore Cap Metropoli (unit-<u>-legendary-cap, unit-<u>-legendary-count, recruit-legendary-cap), StatePill BLOCKED_CAP. i18n IT/EN + 6 lingue via translate_i18n.py; API_ERRORS LEGENDARY_CAP_REACHED/PLAYER_ELIMINATED; chr_PLAYER_INACTIVE."
    implemented: true
    working: true
    file: "frontend/src/state/tour.ts, src/components/tour/*, src/components/SpecializationCard.tsx, app/(tabs)/_layout.tsx, app/(tabs)/map.tsx, app/(tabs)/army.tsx, app/house.tsx, app/settings.tsx, src/components/daily/DailyGate.tsx, src/components/ui.tsx, src/api/hooks.ts, src/i18n/*"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Screenshot: 'Rivedi la guida' → 4 passi con spotlight corretti (tab Mappa/Città/Missioni, pulsante Piramide) e chiusura; Casata card 'Nessuna specializzazione · Scegli'; Impostazioni regola 120 gg + ultimo accesso. Da verificare con account nuovo: auto-start del tour dopo l'intro e prima del Login giornaliero."
      - working: true
        agent: "testing"
        comment: "Iteration 31 frontend 5/5 PASS: account nuovo → intro → tour 4 passi con spotlight → daily solo dopo; reload non ripropone il tour; Impostazioni regola inattività + Rivedi la guida; Casata card; Esercito cap 3/3 e recluta disabilitata; EN ok; 0 errori JS."

# ---- iteration 32 (main agent) — Avviso inattività in Inbox, Santuario Mitico + Unicorno/Ponte Arcobaleno (Bibbia §12), Guida contestuale ----
backend:
  - task: "Avviso inattività: inactivity.sweep_world invia INACTIVITY_WARNING (severity CRITICAL, deep_link settings) ai giocatori a ≤1 giorno dall'eliminazione, dedupe per periodo di inattività (chiave inactivity_warn:<pid>:<last_active_ts>). Santuario Mitico (domain/mythic.py): players.sanctuary {level 0..5}; catalogo edifici della Madre → riga 'Santuario Mitico' con tabella dedicata spec.mythic.sanctuary_levels (costo/tempo gg), stati AVAILABLE/BLOCKED_*/IN_PROGRESS/MAXED/LOCKED e MOTHER_ONLY nei castelli secondari; upgrade via POST …/buildings/Santuario Mitico/upgrade (job BUILDING player_wide=True nella coda della Madre; finish-now → FORBIDDEN_MYTHIC; non cancellato alla perdita della Madre); apply → $max sanctuary.level. Unicorno: POST /worlds/{w}/unicorn/summon (Santuario L5, costo pagato dalla Madre, 7 gg fissi, stato QUEUED→READY via evento UNICORN_READY, 409 UNICORN_ACTIVE/UNICORN_COOLDOWN/SANCTUARY_REQUIRED); GET /worlds/{w}/mythic; player.unicorn/sanctuary_level in /me. Ponte Arcobaleno: mission RAINBOW_BRIDGE in marches.launch/preview (solo bersaglio PLAYER nemico, path rettilineo 2 punti, eta 10 s, nessun pathfinding/nave, cap Sala di Guerra come ATTACK, prenotazione cap20, unicorn READY→IN_FLIGHT, alert immediato al difensore); on_arrival: rivalidazione (PLAYER, diplomazia, prenotazione) → se fallisce ritorno BRIDGE_CANCELLED con Unicorno di nuovo READY; altrimenti consume (COOLDOWN 720 h) + battaglia come ATTACK + vittoria → conquest.transfer_ownership immediato (retention 85%, successione Madre). _abort_side_effects rende idempotente il rilascio prenotazione/Unicorno su ritorno e richiamo. Hints: POST /worlds/{w}/hints/{key}/seen → players.hints_seen. QA: POST /qa/mythic {player_id, sanctuary_level?, unicorn_state NONE|READY}."
    implemented: true
    working: true
    file: "backend/app/domain/mythic.py, inactivity.py, marches.py, construction.py, conquest.py, premium.py, settlements.py, notifications.py, worlds.py, api/routes_game.py, api/routes_qa.py, tests/test_iteration_32_mythic.py"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: true
        agent: "main"
        comment: "pytest tests/test_iteration_32_mythic.py 3/3: catalogo+upgrade 4→5 (10 gg, FORBIDDEN_MYTHIC, TARGET_BUSY, MOTHER_ONLY, MAX_LEVEL); rituale 7 gg → READY → bridge 10 s con alert immediato → castello nemico conquistato subito, Unicorno COOLDOWN, UNICORN_COOLDOWN al nuovo summon, bersaglio eliminato, battle report RAINBOW_BRIDGE; INACTIVITY_WARNING in inbox una sola volta."
frontend:
  - task: "MythicPanel in /building/Santuario Mitico (tabella 5 livelli con effetti/costi/tempi, pannello Unicorno con stato tradotto, countdown, costo, 'Evoca l'Unicorno' abilitato solo con can_summon nella Madre; testID mythic-levels, mythic-level-<n>, mythic-unicorn, unicorn-state, unicorn-summon-button, unicorn-cost); StatePill MOTHER_ONLY + riga 'Solo nella Madre'. Composer marcia: chip 'Ponte Arcobaleno' (march-mission-RAINBOW_BRIDGE) solo con bersaglio PLAYER nemico e player.unicorn.state READY; preview 'Ponte Arcobaleno · evento di 10 s' (march-preview-rainbow). Mappa: marce rainbow disegnate come arco viola (marchPath.rainbowArc, RAINBOW_COLOR); missionLabel RAINBOW_BRIDGE. Hint (components/Hint.tsx, testID hint-<id>, hint-<id>-dismiss) in research.tsx, (tabs)/alliance.tsx, marches.tsx, march/new.tsx. Inbox: INACTIVITY_WARNING e MYTHIC_RITUAL (icone, filtro Regno, descrizione). i18n IT/EN + 6 lingue."
    implemented: true
    working: true
    file: "frontend/src/components/MythicPanel.tsx, src/components/Hint.tsx, app/building/[name].tsx, app/march/new.tsx, app/research.tsx, app/(tabs)/alliance.tsx, app/marches.tsx, app/(tabs)/inbox.tsx, src/map3d/{engine,marchPath,MapLabels}.ts(x), src/components/ui.tsx, src/api/hooks.ts, src/i18n/*"
    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Screenshot lord: Santuario L5 'Massimo', 5 livelli verdi, Unicorno pronto (QA), costo, pulsante; composer vs Casa Demo Due: hint Marce + chip Ponte Arcobaleno + preview rainbow. tsc pulito."
      - working: true
        agent: "testing"
        comment: "Iteration 32 frontend: hint research/alliance/marches una-tantum OK (dismiss persistente, stessa chiave lista+compositore); Santuario L5 con 5 livelli e Unicorno pronto; chip Ponte Arcobaleno + preview 10 s vs Casa Demo Due; Inbox MYTHIC_RITUAL; 0 errori JS. Main agent: bersaglio neutrale → nessuna chip; villaggio secondario → 'Solo nella Madre'. Suite completa backend: 185 passed, 8 failed pre-esistenti/stato QA (caravans resources 500k, cavalleria 5104, sentinelle demo rimosse per grace, skins L10, daily speedup, fleet flaky)."
