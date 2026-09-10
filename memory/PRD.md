# Empire Lords Dragon — PRD

## Problema originale (utente)
Nuovo progetto da zero: **Empire Lords Dragon**, gioco mobile Android persistente, multiplayer, server-authoritative.
- Frontend: React Native + TypeScript + Expo. Backend: FastAPI + MongoDB persistente.
- Il JSON `/app/spec/02_CANONICAL_SPEC.json` (v3.7) è l'**unica autorità runtime** (costi, cap, timer, unlock, combat stats). Documenti di supporto: `01_BIBLE.md`, `03_TABELLE.md`, `04_RICERCHE.md`.
- Vertical slice giocabile: mappa 3D isometrica di alta qualità (chunk/streaming, LOD, pan, zoom), economia (risorse, magazzino, 21 edifici, code), ricerca (114 nodi, 12 rami), esercito e combattimento (13 unità, marce, pathfinding, target neutrali), autenticazione bilingue IT/EN con JWT + Google Auth (Emergent), UI: mappa, insediamento, code, report battaglie.
- Lingua utente: **italiano**.

## Scelte utente
- Procedere con P0 (E2E + PRD) → poi passare subito alla mappa 3D (chunk/LOD/asset) senza attendere test manuale.
- Nessuna preferenza visiva esplicita: design da `/app/design_guidelines.json` (dark slate + glass HUD + oro antico).

## Architettura
```
backend/
  server.py                     FastAPI entrypoint, lifespan (spec load, DAG validate, indexes, scheduler worker, default world)
  app/core     config, db (motor), auth (JWT + Emergent session), errors (ApiError {code,message,details}), clock (offset iniettabile), spec (loader + hash)
  app/domain   economy, construction, research, recruitment, navy, marches, combat, conquest, pathfinding (A*), scheduler (job idempotenti), sentinels, settlements, territory, worldgen, worlds, notifications, formulas
  app/api      routes_auth (/api/auth/*), routes_game (/api/worlds/*, /api/spec/*, /api/health), routes_qa (/api/qa/* admin-key + env gate)
  tests/       pytest: test_spec_formulas, test_runtime, smoke, test_public_e2e (20 test E2E via URL pubblico)
frontend/
  app/  index, login, worlds, (tabs)/{map,settlement,army,inbox}, research, queues, marches, sentinels, building/[name], target/[id], march/new, battle/[id], auth/callback
  src/  api (client + hooks React Query), components (ui, overlay, error-boundary), i18n (IT/EN), map3d (engine.ts three.js + expo-gl, MapView.tsx gesture), state (AuthContext, useGame), theme.ts
```

### Collezioni MongoDB
`accounts`, `sessions`, `worlds`, `players`, `settlements` (PLAYER / NEUTRAL / PLAYER_SLOT), `map_chunks` (terrain 32×32 bytes), `territory_tiles`, `jobs` (BUILD/RESEARCH/RECRUIT/SHIPS/SENTINEL), `marches`, `battles`, `inbox`, `sentinels`, `idempotency`.

### Endpoint principali
- Auth: `POST /api/auth/register|login|refresh|logout|session`, `GET /api/auth/me`
- Mondi: `GET /api/worlds`, `POST /api/worlds/{w}/join`, `GET /api/worlds/{w}/me`
- Insediamento: `GET .../settlements/{s}`, `.../buildings`, `POST .../buildings/{name}/upgrade`, `POST .../upgrade`, `GET .../jobs`, `POST /api/worlds/{w}/jobs/{j}/cancel`
- Ricerca: `GET .../research`, `POST .../research/{key}/start`
- Esercito: `GET .../army`, `POST .../recruit`, `POST .../ships`, `GET/POST .../sentinels`
- Mappa: `GET /api/worlds/{w}/map/chunk/{cx}/{cy}`, `GET .../map/marches?chunks=`
- Marce: `POST .../marches/preview`, `POST .../marches`, `GET .../marches`, `GET .../marches/{id}`, `POST .../marches/{id}/recall`
- Battaglie/Inbox: `GET .../battles`, `GET .../battles/{id}`, `GET .../inbox`, `POST .../inbox/{id}/read`, `POST .../inbox/read-all`
- QA (X-Admin-Key): `GET /api/qa/clock`, `POST /api/qa/clock/advance`, `POST /api/qa/scheduler/run`, `POST /api/qa/grant`

## Stato implementazione
### Completato (vertical slice) — testato E2E 10/06/2026 (iteration_1: 20/20 backend, frontend tutti i flussi OK)
- [x] Backend server-authoritative completo, scheduler idempotente, spec-driven
- [x] Auth JWT (register/login/refresh/logout) + Google Auth Emergent (exchange session_id)
- [x] Mondo generato proceduralmente (400×400, 169 chunk, 800 neutrali, 95 slot giocatore)
- [x] Economia, 21 edifici, upgrade insediamento, code, cancel
- [x] Ricerca 114 nodi / 12 rami con gating prerequisiti/università
- [x] 13 unità, reclutamento, navi, sentinelle
- [x] Marce (preview/launch/recall), pathfinding A*, combattimento vs neutrali, report battaglia, inbox
- [x] Frontend: login IT/EN, mondi/join, mappa 3D (three.js + expo-gl — vedi sezione dedicata), città, esercito, inbox, ricerca, code, marce, dettaglio target, report battaglia
- [x] Migrazione `pointerEvents` prop → style (warning RN-web)

### Mappa 3D "alta qualità" — completato e testato (iteration_2: 22/22 backend, frontend OK)
- [x] `GET /api/worlds/{w}/map/overview`: terreno 100×100 (1 cella = 4×4 tile, cache in memoria) + tutti gli insediamenti PLAYER
- [x] Terreno LOD geometrico: step 1 (vicino, <34 tile), step 2 (medio); oltre → overview mondiale sempre residente, nascosta tile-per-tile sotto i chunk caricati (`src/map3d/terrain.ts`)
- [x] Acqua: un unico piano mondiale con shader (onde vertex + value-noise shimmer, fog e colorspace corretti) — le coste emergono dal dislivello del terreno (`water.ts`)
- [x] Entità instanced per chunk (castelli con mura/torri/tetto/bandiera, tende slot, sentinelle, pin giocatori a zoom lontano) ≈10 draw call/chunk (`entities.ts`)
- [x] Colorazione per pendenza (roccia/neve), sabbia costiera, chiazze prato; cespugli su pianura e massi su montagna (LOD0); griglia tattica a zoom < 22
- [x] Etichette RN proiettate dal 3D (nome + livello, colore fazione) con toggle `map-labels-button`
- [x] Camera: inerzia pan, pinch/double-tap con punto focale, centerOn animato, pulsazione selezione/beacon casa
- [x] Google Auth hardening: session_id letto da URL di lancio (hash/query), listener deep link Android (`dismiss` ≠ annullato), guardia anti-doppio exchange, gate root (login → /worlds via stato auth), scheme app `empirelords`

### Bug fix
- [x] Mappa nera dopo Città → costruzione → indietro → Mappa (canvas collassato a 0×0 dietro il modal, viewport stantio): engine risincronizza renderer/camera col drawing buffer a ogni frame (`syncDrawingBuffer`), verificato dal testing agent (iteration_3)

### Prossimi (P1)
- [ ] Verifica Google Auth con flusso reale su dispositivo (Expo Go / build)
- [ ] Test scheduler su restart backend (eventi persistenti con lease: design ok, verifica pratica)

### Backlog (P2)
- [ ] Metadata Google Play / Android App Bundle
- [ ] PvP (marce contro giocatori), alleanze, chat (fuori dallo slice)

## Credenziali test
Vedi `/app/memory/test_credentials.md` (demo@empirelords.com / Demo12345!, admin key in backend/.env).

## Note operative
- Non modificare `/app/spec/*` né `backend/.env` (SPEC_EXPECTED_HASH verificato all'avvio).
- Timer canonici lunghi: usare `/api/qa/clock/advance` in test.
- Mappa 3D: tutta la logica resta in three.js + expo-gl (compatibile Android nativo; su web usa WebGL via expo-gl).
- pytest: `cd backend && pytest tests/test_public_e2e.py -o addopts=''` (xdist rompe le fixture di sessione).
