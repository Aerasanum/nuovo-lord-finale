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
  src/  api (client + hooks React Query), components (ui, overlay, Crest, MarchCard), i18n (IT/EN), map3d (engine.ts three.js + expo-gl; terrain.ts, terrainMaterial.ts, flora.ts, castle.ts (skin), entities.ts, territory.ts, water.ts, geo.ts, MapView.tsx gesture, MapLabels.tsx, MiniMap.tsx), state (AuthContext, useGame), theme.ts
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

### Marce sulla mappa (Bibbia §13, §41.3, deep-link map/march) — testato iteration_4/5
- [x] Marker marcia toccabile (picking in screen-space 30px, anche castelli/sentinelle) → scheda: missione → target, truppe, stato, ETA live, "Marce attive", "Richiama" (solo OUTBOUND proprie), "Battaglia" se esiste
- [x] Etichetta marcia (icona, missione/"In ritorno", countdown) proiettata dal 3D; marce in ritorno con banner pallido
- [x] LOD: marce nascoste a zoom lontano (dist > 100) come da §41.3; etichette marce entro dist 60
- [x] Richiamo = inversione reale dal punto raggiunto (DTO `recalled_at`; `engine.marchProgress`)
- [x] Marce nemiche con disclosure intel (§34.10): `incoming[]` solo dopo la detection (ingresso nel territorio), marker rosso con alone pulsante, chip "HOSTILE"/famiglia missione, scheda intel (direzione, ingresso, tipo, truppe, ETA per tier) — testato iteration_6 (backend fixture PvP + verifica visiva)
- [x] Minimappa tattica (secondo pass ortografico: terreno, punti giocatori, linee marce, footprint camera; tap → centra) — iteration_6
- [x] Stemmi Casata: crest deterministico dal nome, editor `/house` (simbolo/colori/bordo/motto, validazione catalogo), denormalizzato su insediamenti e marce; reso in 3D (bandiera sul mastio, banner marce) e in 2D (SVG `Crest.tsx`) — iteration_6
- [x] Report battaglia dalla mappa (scheda marcia → "Battaglia"; scheda insediamento → ultima battaglia) — iteration_6

### Grafica v3 "curata" (richiesta utente: niente quadrati, castello grande e decorato, skin future) — iteration_6 (0 errori shader, regressioni OK)
- [x] Terreno liscio indicizzato: vertici condivisi sugli angoli tile, rilievo fbm continuo, colori sfumati per vertice (niente scacchiera), normali analitiche (nessuna cucitura tra chunk), coste = superficie acqua che taglia il pendio (`terrain.ts`)
- [x] Shader terreno custom: grana micro (svanisce con la distanza), chiazze prato, roccia sui pendii, neve sulle creste con bordo organico, sole + emisfero, fog color "orizzonte" (`terrainMaterial.ts`, token `skyHorizon`)
- [x] Montagne a creste (ridged noise, stesso rilievo a tutti i LOD via `noiseScale`), massi ridotti
- [x] Flora: conifere a 3 livelli, latifoglie (con rari alberi autunnali), cespugli, massi; variazione colore per istanza; alberi sparsi al LOD medio (`flora.ts`)
- [x] Territorio: riempimento tenue + nastro di confine (niente tile quadrate) (`territory.ts`); griglia tattica solo a zoom < 13
- [x] Castello v2 (`castle.ts` + `entities.ts`): footprint ≈2×, basamento, mura ottagonali con merli, mastio con finestre, 4/8 torri per livello, portone con porta e torce, banner sulle mura (L≥10), torrette (L≥20), bandiera con stemma. **Skin data-driven**: `CASTLE_SKINS` classic/royal/obsidian/sandstone (neutrali = ruin); il DTO pubblico espone `skin` (null → classic) — la UI di scelta skin è un passo successivo
- [x] Marce: marker "squadra di soldati" + banner stemma; chip etichette clampate ai bordi schermo; ETA sconosciuta → "?"

### Skin, cronologia e mappa viva — iteration_7 (testing agent: 39/39 backend, frontend OK)
- [x] Skin castello per insediamento: `GET/PUT /worlds/{w}/settlements/{s}/skins|skin` (server-authoritative, sblocco per livello: classic 1 · sandstone 5 · royal 10 · obsidian 20; 400 INVALID_SKIN / 409 SKIN_LOCKED)
- [x] Schermata `/skins` (pulsante tavolozza in Città): anteprima 3D live (`CastlePreview` GLView, stesso motore della mappa, orbita lenta, fumo), card skin con lucchetto/livello richiesto/"In uso", Applica
- [x] Cronologia battaglie nella scheda insediamento sulla mappa: ultime 5 (esito, missione, data, perdite, bottino, conquista) → tap apre il report; endpoint `GET .../settlements/{s}/battles?limit=5` (target o origine, solo battaglie del visualizzatore; le nuove battaglie salvano `origin_settlement_id`)
- [x] Mappa viva: bandiere che ondeggiano (vertex shader `onBeforeCompile`, istanziate + banner marce), bagliore torce/bracieri pulsante (additivo), fumo stilizzato da camini, torce e bracieri presidiati (`SmokeSystem`, solo zoom < ×48)
- [x] Orologio QA persistito in Mongo (`qa_state.clock`) — il restart del backend non azzera più i timer

### Missioni personali, Prestigio, Achievement, Cronaca — iteration_8 (Bibbia §20/§22/§39)
- [x] Tab "Missioni" (segmenti Missioni / Casata / Cronaca), composer `/mission/new`, catalogo 5 missioni TIMED con cooldown/slot (max 2), reward = snapshot produzione × ore (cap Magazzino) + Prestigio; ledger Prestigio, achievement a tier, Cronaca del mondo; `GET/POST /worlds/{w}/missions`, `GET .../progress`, `GET .../chronicle`

### Carovane — iteration_9 (Bibbia §13 / §34.9, spec.caravans) — testing agent frontend OK + pytest `tests/test_caravans_e2e.py` 5/5
- [x] Backend: slot logistici astratti (Caravanserraglio: 1 + ceil((L-1)/5) carovane/marcia, cap 5000×1,17^(L-1) × bonus ricerca), velocità 3 tile/h (scorta = unità più lenta), max 1 carovana in uscita/insediamento (conta nelle 5), consegna con cap Magazzino: **l'eccedenza resta sul convoglio e torna al mittente** (`DELIVERED_PARTIAL` → RETURNING), ricerca carovane straniere per raggio Chebyshev (5 + bonus ricerca, max 12) con disclosure intel, intercettazione (primo waypoint raggiungibile scelto dal server, combattimento normale, loot cap cargo sopravvissuti, residuo torna al mittente), notifiche `CARAVAN_STATE`, achievement `caravans_intercepted`
- [x] Endpoint: `GET .../settlements/{s}/caravans/info`, `POST /worlds/{w}/caravans`, `GET .../settlements/{s}/caravans/search`, `POST /worlds/{w}/caravans/intercept`
- [x] Frontend: hub `/caravans` (pulsante in Città), composer `/caravan/new` (destinazione tra i propri insediamenti, slot, carico con clamp capacità, scorta opzionale), `/caravan/intercept` (solo unità ATK>0), carovane straniere rilevate come marker ostili sulla mappa 3D (`caravanAsMarch`, orologio server) con scheda + Intercetta, inbox CARAVAN_STATE/BATTLE_RESOLVED con deep link, `MarchListCard` condiviso (marce + carovane con righe carico/consegnato/eccedenza)
- Fixture QA: account rivale `rival@empirelords.com` (vedi test_credentials.md)

### Alleanze — iteration_10/11 (Bibbia §19 / §34.7 / §40) — pytest `tests/test_alliances_e2e.py` 8/8 + testing agent UI (2 pass, 4 account) OK
- [x] **Strutturate** (cap 100, Piramide, ruoli Leader/Vice/Diplomatico/Membro con permessi da spec, chat, tesoreria Smeraldi, PNA, guerre con voto 12h a maggioranza matematica, assedio condiviso) **vs Mercenarie** (cap 5, fuori Piramide, nessun voto di guerra: guerre solo come effetto dei contratti accettati) — separazione rigida (regola utente)
- [x] Membership: creazione (nome/sigla unici), elenco pubblico, inviti 72h con ruolo, accetta/rifiuta, uscita con ritardo 12h + cooldown 24h (72h se in guerra + war_involved), successione Leader (Vice più anziano → membro), scioglimento (rimborsi/esiti contratti), kick/ruoli/trasferimento
- [x] Diplomazia per coppia: PNA proponi/accetta/rifiuta/termina (preavviso 12h), voto di guerra, pace (proposta 24h, accettazione Leader/Vice → PEACE_PENDING 12h → NEUTRAL), pace bloccata durante contratto mercenario; **gate lanci ostili** (CANNOT_ATTACK_ALLY / DIPLOMACY_BLOCKS_ATTACK) su marce e intercettazioni; RINFORZO e Carovane verso alleati; tile alleati con fattore 0,90
- [x] Tesoreria Smeraldi: registro append-only, visibile a Leader/Vice; fonti: difesa PvP +10 (cooldown coppia 24h), conquista PvP +25, prima missione/giorno +5 (solo Strutturate, cap 500/giorno)
- [x] Contratti mercenari: escrow 1000–1M, durate 72/96/120/168h, max 3 attivi, accettazione → guerra automatica + lock pace, scadenza/scioglimento bersaglio = successo (escrow al fornitore, +10 prestigio mercenario alleanza e membri), scioglimento fornitore = fallimento (rimborso); bonus fornitore vs bersaglio +5% cap marcia / +3% ATK (snapshot `bonuses` sulla marcia)
- [x] Frontend: segmento **Alleanza** nel tab Missioni (dashboard / lupo solitario con inviti), `/alliance/create`, `/alliance/browse`, `/alliance/[id]` (azioni diplomatiche), `/alliance/members`, `/alliance/diplomacy` (relazioni + voti), `/alliance/chat`, `/alliance/treasury`, `/alliance/mercenary`; inbox eventi alleanza con deep link; mappa: fazione ALLEATO (colore, legenda, tag `[SIGLA]`), composer solo RINFORZO verso alleati
- Fixture QA: account ally/third (vedi test_credentials.md), `POST /qa/alliance/emeralds`

### Rubini & premium — iteration_12 (Bibbia §23, spec.premium) — pytest `tests/test_premium_e2e.py` 8/8 + testing agent UI OK
- [x] Wallet Rubini a livello account (`accounts.rubies`, registro `ruby_transactions` idempotente per chiave), `GET /wallet`, Rubini in `/me`; negozio DISABILITATO (catalogo Play Billing vuoto) → nessun acquisto; concessione QA `POST /qa/rubies`
- [x] **Completa ora** su job già avviati: costruzione max(100, min residui×3), ricerca max(150, ×4), reclutamento max(100, ×2,5); vietato per unità speciali/leggendarie (Carro, Drago/Angelo/Demone), con assedio attivo o marcia ostile in arrivo ≤60 min; debito atomico con rollback, stesso handler di completamento dello scheduler; pillola `◆N` su code Città, /queues, dettaglio edificio, ricerca, esercito
- [x] Cosmetica: **rinomina Casata** 500 Rubini (catalogo `cosmetics_v1`, nome unico nel mondo, copie denormalizzate aggiornate); Casata con **descrizione** (§20) editabile
- [x] **Specializzazione** giocatore (spec.player_specialization): Attaccante/Difensore +5%, disponibile con 3 insediamenti, prima scelta gratis, cambio 2.500 Rubini, cooldown 7g, bloccata in guerra/assedio/marce militari; il combattimento legge le chiavi spec
- [x] UX: **Alleanza è un tab** della barra inferiore (accanto a Esercito), impostazioni alleanza (nome unico + descrizione) per il Leader; schermate `/wallet`, `/specialization`
- Nota: nella Bibbia le missioni personali generano **Smeraldi** per l'alleanza (+5 prima missione/giorno per membro, solo Strutturate) — non Rubini; i Rubini sono solo da acquisto (catalogo vuoto) o QA

### Piramide endgame — iteration_13 (Bibbia §21 / §31.7 / §34.8 / §39.2, spec.pyramid) — pytest `tests/test_pyramid_e2e.py` 8/8
- [x] Backend `domain/pyramid.py`: macchina a stati per mondo (collezione `pyramid`, `_id`=world_id) DORMANT_INITIAL → OPEN → REWARD_LOCK → DORMANT → OPEN…, eventi `PYRAMID_STATE_DEADLINE` con `scheduled_at` persistiti (`deadline_key` scarta gli eventi stantii), `epoch` per chiave anti-collisione dei reset QA
- [x] **Configurazione modulare**: default da spec.pyramid + override per mondo `worlds.pyramid_config` (`GET/PUT /api/qa/pyramid/config`, `POST /api/qa/pyramid/reset {clear_config, config}`) — durate, giorno di apertura, cap presidio, % premi, Smeraldi, Prestigio, Guardiano; un cambio ricalcola la scadenza pendente dagli anchor persistiti (`_reschedule`)
- [x] Guardiano ad ogni OPEN: top-10 development_score → mediana max legal march power (cap Sala di Guerra × 11,35) → clamp 250k–1,5M → 45/35/20 Fanteria/Arciere/Cavalleria
- [x] Marce `target_pyramid` (ATTACK solo Strutturate/OPEN/non owner; REINFORCE solo owner, cap 1M): battaglia vs presidio (`defender_kind PYRAMID`), sopravvissuti = presidio (`garrison_by_player`), perdite ripartite per contributore, cambio owner azzera l'hold, partecipazione +500 Smeraldi/alleanza/ciclo + Prestigio +50 + sigillo bronzo
- [x] Hold completato → REWARD_LOCK: snapshot membri (`players.pyramid_reward` + denormalizzato sugli insediamenti), +8% produzione / +5% ricerca / +5% addestramento / +10% cap carovane (formule `extra_pct`, non nel cap ricerca), titolo "Signore della Piramide", sigillo oro, Prestigio +250, +2000 Smeraldi, Cronaca `PYRAMID_WON`; REWARD_LOCK → DORMANT: presidio torna a casa con marce reali (`PYRAMID_RELEASED`); scioglimento alleanza → neutralizzata
- [x] `GET /worlds/{w}/pyramid` (stato, countdown, owner/hold, presidio — composizione solo se neutrale o propria —, battaglie recenti dell'epoca, attacchi in arrivo per l'owner, `me.*`, config, storico); notifiche `PYRAMID_STATE_CHANGED` (deep link `pyramid`)
- [x] Frontend: monumento 3D 15×15 a (200,200) (`map3d/pyramid.ts`, aspetto per stato/fazione, braciere+pilastro di luce in OPEN), label mappa con countdown, tap → scheda con azioni, pulsante "centra sulla Piramide", schermata `/pyramid`, `march/new?pyramid=1`, tile nel tab Alleanza, inbox
- world_1 demo: override `first_open_day: 1` → Piramide OPEN con Guardiano spec (22k unità)

### Prossimi (P2)
- [ ] Eliminazione per 120 giorni di inattività, cap Leggendario
- [ ] Skin marce/unità (idee proposte all'utente: drago, elefante, falco spia…)
- [ ] Verifica Google Auth con flusso reale su dispositivo (Expo Go / build)
- [ ] Test scheduler su restart backend (eventi persistenti con lease: design ok, verifica pratica)

### Backlog (P3)
- [ ] Santuario Mitico + Unicorno (§12), cinematiche d'attacco skippabili (draghi/falchi)
- [ ] Metadata Google Play / Android App Bundle

## Credenziali test
Vedi `/app/memory/test_credentials.md` (demo@empirelords.com / Demo12345!, admin key in backend/.env).

## Note operative
- Non modificare `/app/spec/*` né `backend/.env` (SPEC_EXPECTED_HASH verificato all'avvio).
- Timer canonici lunghi: usare `/api/qa/clock/advance` in test.
- Mappa 3D: tutta la logica resta in three.js + expo-gl (compatibile Android nativo; su web usa WebGL via expo-gl).
- pytest: `cd backend && pytest tests/test_public_e2e.py -o addopts=''` (xdist rompe le fixture di sessione).
