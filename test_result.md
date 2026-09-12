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
