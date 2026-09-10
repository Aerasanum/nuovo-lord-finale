# EMPIRE LORDS DRAGON — MASTER BIBLE v3.7 ANDROID ONLY

**Data:** 9 settembre 2026 
**Stato:** CANONE PER CLEAN BUILD ANDROID — codice non ancora certificato 
**SPEC_HASH:** `62a57ec4e4e400ed1ec4af41e473d98b9966186aa59dcfa851d89aac3540daa0`

## Autorita e obiettivo

Questo pacchetto serve a costruire **da zero** la versione Android di Empire Lords Dragon. Il prodotto utente e un gioco mobile Android. La logica competitiva e server-authoritative.

Ordine di autorita:
1. `02_EMPIRE_LORDS_DRAGON_CANONICAL_SPEC_v3.7_ANDROID_ONLY.json` per numeri, formule, timer, cap, unlock, costi e state machine.
2. Questo documento per semantica, comportamento e UX.
3. `03_TABELLE_ECONOMIA_EDIFICI_UNITA_v3.7.md` e `04_RICERCHE_114_COMPLETE_v3.7.md` sono viste umane derivate dal JSON e non possono contraddirlo.

Regole costituzionali:
- non inventare numeri mancanti; segnalarli;
- non cambiare formule per comodita tecnica;
- non duplicare la fonte dei numeri competitivi;
- backend e database sono authority; il client visualizza e richiede azioni;
- ogni azione competitiva deve essere persistente, idempotente dove necessario e isolata per `world_id`;
- il clean build non importa codice applicativo precedente.

## Direzione tecnica Android

- Client: React Native + TypeScript + Expo.
- Backend: FastAPI con Domain Services server-authoritative.
- Database: MongoDB persistente.
- Build finale: Android App Bundle per Google Play.
- Push, secure storage, lifecycle resume, deep link, safe areas, haptics e cancellazione account devono essere predisposti come capacita native.
- Acquisti: Google Play Billing con validazione server e idempotenza; catalogo commerciale inizialmente vuoto/disabilitato.

## Priorita del primo prodotto giocabile

Il primo vertical slice deve permettere: creazione/ingresso Player -> spawn -> mappa -> produzione risorse -> upgrade -> ricerca -> reclutamento -> marcia -> attacco a neutrale -> combat -> esito persistito -> chiusura e riapertura app con stato intatto. Dopo questo nucleo si completano alleanze, Piramide, missioni avanzate, cinematiche e rifiniture.


## 1. Visione del gioco e modello World

Empire Lords Dragon e uno strategico multiplayer persistente a crescita lunga: il Player sviluppa la propria Casata nel singolo World, conquista Insediamenti gia presenti, costruisce un dominio territoriale reale, collabora o combatte tramite Alleanze e affronta obiettivi endgame senza reset stagionali.

| Parametro | Regola CONSOLIDATA |
| --- | --- |
| Player operativi | 100 slot reali prevalidati per World. |
| Mappa | 400 x 400 tile logiche = 160.000 tile. |
| Durata | Indefinita; nessun wipe automatico o annuale. |
| Nuovi World | Si apre automaticamente un nuovo World quando il precedente raggiunge 100 Player oppure supera 120 giorni ed e chiuso ai nuovi ingressi. |
| Stress tecnico | Simulatore separato fino a 400 bot; non cambia il cap gameplay 100. |
| Isolamento | Ogni record competitivo contiene world_id; Casata e progressione competitiva sono world-scoped. |
| Account | Un account puo partecipare a piu World, ma in ciascun World possiede Player/Casata/progressione indipendenti. Solo il wallet Rubini e account-level. |

## 2. World Map 400x400: geografia, regioni e generatore

SCELTA GEOGRAFICA DEFINITIVA; L acqua resta. Il World deve avere un continente principale, tre grandi isole abitate, catene montuose strategiche, foreste a cluster e pianura prevalente. Le isole NON sono collegate via terra al continente: la navigazione deve avere valore reale.

| Terreno | Target | Range accettato | Tile target | Movimento | Combat difensore |
| --- | --- | --- | --- | --- | --- |
| Pianura | 52% | 49-55% | 83.200 | x1,00 | +0% DEF |
| Foresta | 18% | 16-20% | 28.800 | x1,25 | +10% DEF |
| Montagna | 10% | 8-12% | 16.000 | x2,00 | +20% DEF |
| Acqua | 20% | 18-22% | 32.000 | Non passabile a piedi | Nessun combat terrestre |

### 2.1 Quattro macro-regioni e slot

| Regione | Tipo | Player slot | Neutrali | Vincoli |
| --- | --- | --- | --- | --- |
| R0 - Continente Centrale | Continente | 70 | 560 | Include il centro/Piramide; piu catene montuose e passaggi. |
| R1 - Isola Nord | Grande isola | 10 | 80 | Separazione acqua >=12 tile; land utile 8.000-12.000 tile. |
| R2 - Isola Sud-Ovest | Grande isola | 10 | 80 | Separazione acqua >=12 tile; land utile 8.000-12.000 tile. |
| R3 - Isola Sud-Est | Grande isola | 10 | 80 | Separazione acqua >=12 tile; land utile 8.000-12.000 tile. |

| Tipo anchor | Pianura | Foresta | Montagna | Acqua |
| --- | --- | --- | --- | --- |
| 100 Player slot | 70 | 20 | 10 | 0 |
| 800 neutrali | 560 | 160 | 80 | 0 |

Un Insediamento puo quindi essere ancorato su PIANURA, FORESTA o MONTAGNA. WATER e sempre vietato. Un castello di montagna riceve il +20% DEF del terreno e tutte le marce terrestri che lo raggiungono/subiscono il costo x2,00 sul tratto montano.

### 2.2 Algoritmo generator_v3 - obbligatorio

Usare una generazione landmass-first con signed-distance masks e FBM multi-octave: prima si costruiscono le masse geografiche, poi si classificano i biomi.

Continente: unione deterministica di 6-9 ellissi/metaball perturbate da FBM; deve includere il centro (200,200) e rappresentare la massa terrestre prevalente.

Isole: tre maschere separate generate fuori dal continente, ognuna con 8.000-12.000 tile terrestri e almeno 12 tile di acqua nel punto di separazione minimo da qualunque altra grande massa.

Montagne: 3-5 catene sul continente e almeno 1 dorsale per isola, generate da polilinee/curve perturbate, larghezza 3-7 tile; niente pixel montagna casuali isolati come pattern dominante.

Foreste: 20-30 seed cluster con region growing/FMB locale; niente rumore uniforme a scacchiera.

Pianura: tutto il land residuo; deve restare il bioma dominante.

Piramide: il generatore riserva dall inizio una piattaforma centrale terrestre attorno all anchor (200,200). Non e una correzione post-hoc WATER->PLAIN.

Percentuali finali vengono raggiunte variando threshold in modo deterministico. Se i vincoli non passano, il seed viene rifiutato; nessuna tile viene corretta per salvare uno spawn.

Massimo 50 seed candidati deterministici per world creation. Se nessuno passa, la creazione World fallisce con MAP_GENERATION_CONSTRAINT_FAILED e nessun World parziale viene persistito.

### 2.3 Invarianti map/spawn

| Invariante | Valore |
| --- | --- |
| Player spawn hard minimum | 8 tile centro-centro. |
| Player spawn target | 10 tile; algoritmo massimizza il numero di coppie >=10 senza violare le quote regionali. |
| Neutral minimum | 4 tile da ogni altro anchor settlement; target 6. |
| Water settlement | 0 assoluto. |
| Duplicate anchor | 0 assoluto. |
| Player slot | 100 esatti, prevalidati ma vuoti fino all ingresso Player. |
| Neutral settlement | 800 esatti creati alla nascita World. |
| Port eligibility | Immutabile: anchor solo Plain/Forest con almeno una WATER tile cardinalmente adiacente. Mountain/Water mai port_eligible. Minimi regionali definiti in §31.2. |
| Piramide no-spawn | Nessun settlement anchor entro raggio Chebyshev 12 dall anchor 200,200. |

## 3. Ingresso Player, stato iniziale e protezione

| Voce | Valore CONSOLIDATA |
| --- | --- |
| Mother | Settlement L1 su uno dei 100 slot non occupati. |
| Casata | Creata per quel World: nome unico nel World, motto opzionale, stemma base. |
| Risorse iniziali | Grano 2.000; Legno 2.000; Argilla 2.000; Ferro 1.500; Oro 500. |
| Truppe iniziali | 250 Fanteria. |
| Edifici L1 prebuilt | Castello, 5 produttori, Magazzino, Caserma, Universita, Mura, Sala Casata. |
| Territorio base | Anchor + 4 tile cardinali valide/controllabili; le Sentinelle espandono il territorio dal Lv3. |
| PvP shield | Termina in modo permanente al primo tra: conquista del 3o neutrale oppure 7 giorni dalla fondazione. Per attaccare un Player, entrambi devono avere shield terminato. |
| PvE | Neutrali sono attaccabili durante lo shield. |
| World admission | Chiusa a nuovi ingressi a 100 slot occupati o 120 giorni di eta; slot liberati da eliminazione/inattivita non riaprono il World. |

## 4. Neutrali: 800 castelli autonomi e persistenti

REGOLA CHIAVE; I secondari NON vengono generati quando arriva un Player. Gli 800 Insediamenti neutrali esistono gia nel World, crescono deterministicamente e diventano bottino territoriale. Il limite 20 e un cap personale, non una promessa che tutti possano raggiungerlo.

| Livello iniziale | Percentuale | Numero su 800 |
| --- | --- | --- |
| 1 | 70% | 560 |
| 2 | 20% | 160 |
| 3 | 10% | 80 |

| Eta World | Cap livello neutrale |
| --- | --- |
| 0-14 giorni | Lv5 |
| 15-30 | Lv8 |
| 31-60 | Lv12 |
| 61-120 | Lv16 |
| >120 giorni | Lv20; nessun neutrale cresce automaticamente a Metropoli |

Ogni neutrale riceve un deterministic_offset 0-71h. Il primo growth check e a opened_at +72h + offset; poi ogni 72h.

Se neutral.level < cap(WorldAge), cresce di esattamente +1; altrimenti salta il tick. Nessuna IA generativa e nessuna scelta random non seeded.

Neutrali non attaccano Player e non fondano nuovi settlement. Non hanno Casata, Alleanza, Rubini o Smeraldi.

Neutrali non usano Sentinelle: l attacco PvE arriva direttamente alle difese dell Insediamento. Una volta conquistato, il settlement entra nel sistema territorio/Sentinelle del Player.

Un neutrale costiero port_eligible costruisce automaticamente Porto quando raggiunge Lv15, secondo il template; questo garantisce nodi navali nel lungo periodo.

La produzione locale dei neutrali usa la stessa economy table. I neutral growth non spendono risorse; le risorse prodotte servono da loot e rispettano il Magazzino.

| Componente neutrale | Formula a livello L |
| --- | --- |
| Produttori + Magazzino | max(1, L-1) |
| Universita + Mura | max(1, L-2) |
| Caserma | max(1, ceil(0,75 x L)) |
| Scuderia | se L>=11: max(1,L-5) |
| Officina | se L>=16: max(1,L-10) |
| Porto | se port_eligible e L>=15: max(1,L-14) |
| Garrison totale | 100 x L^2 unita |
| Composizione L1-10 | 65% Fanteria / 35% Arciere; sotto unlock Arciere, quota convertita in Fanteria |
| Composizione L11-15 | 45% Fanteria / 35% Arciere / 20% Cavalleria |
| Composizione L16-20 | 45% Fanteria / 30% Arciere / 20% Cavalleria / 5% Catapulta |

## 5. Insediamenti, Madre, limite e sviluppo

| Regola | Valore |
| --- | --- |
| Fasi | Lv1-10 Villaggio; Lv11-29 Citta; Lv30 Metropoli. |
| Cap Player | 20 Insediamenti: 1 Madre + massimo 19 secondari. |
| Secondari | Solo conquista di settlement gia esistenti; nessuna fondazione libera. |
| Building cap | Nessun edificio supera settlement.level. Legacy over-cap: congelato, mai downgraded automaticamente. |
| Code costruzione | 2 per Insediamento, condivise fra settlement upgrade ed edifici. |
| Code ricerca | 2 per Insediamento. |
| required_research upgrade settlement | OFF: nessun gate Research nascosto sull upgrade del settlement. |
| development_score | 10.000 x settlement.level + 100 x somma(building.level) + 25 x somma(livelli ricerca locale completati). |
| Successione Madre | Secondary con development_score maggiore; tie: founded_at piu vecchio; poi settlement_id lessicograficamente minore. |
| Nessun secondario alla perdita Madre | Player eliminato dal World; non puo ripartire nello stesso World. |

## 6. Progressione Settlement Lv1-Lv30 - tabella completa

Prod = livello minimo di tutti e cinque gli edifici produttivi. I requisiti sono controllati PRIMA di avviare l upgrade. I costi della Fortezza derivano dalla curva canonica e vengono snapshot al momento dell avvio.

| Lv | Stadio | Costo upgrade | Tempo base | Requisiti prima dell upgrade | Nuovi unlock / milestone |
| --- | --- | --- | --- | --- | --- |
| 1 | Villaggio | Initial | Initial | Stato iniziale | Fattoria/Boscaiolo/Cava/Miniera Ferro/Miniera Oro/Magazzino/Caserma/Universita/Mura/Sala Casata L1 prebuild |
| 2 | Villaggio | G 1.000; W 1.200; C 1.200; I 800; Au 100 | 30 min | Prod1, Mag1, Uni1, Mura1, Cas1 | Tiro con l Arco disponibile |
| 3 | Villaggio | G 1.450; W 1.740; C 1.740; I 1.160; Au 145 | 42 min | Prod2, Mag2, Uni2, Mura2, Cas2 | Comando Sentinelle; Capacita Marcia |
| 4 | Villaggio | G 2.103; W 2.523; C 2.523; I 1.682; Au 211 | 59 min | Prod3, Mag3, Uni3, Mura3, Cas3, Sent1 | - |
| 5 | Villaggio | G 3.049; W 3.659; C 3.659; I 2.439; Au 305 | 83 min | Prod4, Mag4, Uni4, Mura4, Cas4, Sent2 | Caravanserraglio |
| 6 | Villaggio | G 4.421; W 5.305; C 5.305; I 3.537; Au 443 | 116 min | Prod5, Mag5, Uni5, Mura5, Cas5, Sent3, Carav1 | Tier ricerca B |
| 7 | Villaggio | G 6.410; W 7.692; C 7.692; I 5.128; Au 641 | 162 min | Prod6, Mag6, Uni6, Mura6, Cas5, Sent4, Carav2 | Sala Alleanza; specializzazione dopo 3o Insediamento |
| 8 | Villaggio | G 9.295; W 11.153; C 11.153; I 7.436; Au 930 | 226 min | Prod7, Mag7, Uni7, Mura7, Cas6, Sent5, Carav3, All1 | Salute/Velocita Marcia |
| 9 | Villaggio | G 13.477; W 16.172; C 16.172; I 10.782; Au 1.348 | 317 min | Prod8, Mag8, Uni8, Mura8, Cas7, Sent6, Carav4, All2 | - |
| 10 | Villaggio | G 19.541; W 23.450; C 23.450; I 15.633; Au 1.955 | 443 min | Prod9, Mag9, Uni9, Mura9, Cas8, Sent7, Carav5, All3 | Sala di Guerra |
| 11 | Citta | G 24.427; W 29.312; C 29.312; I 19.541; Au 2.443 | 532 min | Prod10, Mag10, Uni10, Mura10, Cas8, Sent8, Carav6, All4, Guerra1 | Citta; Scuderia/Equitazione/Cavalleria |
| 12 | Citta | G 30.533; W 36.640; C 36.640; I 24.427; Au 3.054 | 638 min | Prod10, Mag11, Uni11, Mura11, Cas9, Sent8, Carav7, Guerra2, Scud1 | - |
| 13 | Citta | G 38.166; W 45.799; C 45.799; I 30.533; Au 3.817 | 766 min | Prod11, Mag12, Uni12, Mura12, Cas10, Sent9, Carav8, Guerra3, Scud2 | Intercettazione Carovane |
| 14 | Citta | G 47.708; W 57.249; C 57.249; I 38.166; Au 4.771 | 919 min | Prod12, Mag13, Uni13, Mura13, Cas11, Sent10, Carav9, Guerra4, Scud4 | - |
| 15 | Citta | G 59.635; W 71.561; C 71.561; I 47.708; Au 5.964 | 1.102 min | Prod13, Mag14, Uni14, Mura14, Cas12, Sent11, Carav10, Guerra5, Scud7 | Porto se port_eligible; Studi Nautici |
| 16 | Citta | G 74.543; W 89.452; C 89.452; I 59.635; Au 7.455 | 1.323 min | Prod14, Mag15, Uni15, Mura15, Cas12, Sent12, Carav10, Guerra6, Scud11 | Officina; Catapulta; Costruzione Navale |
| 17 | Citta | G 93.179; W 111.814; C 111.814; I 74.543; Au 9.318 | 1.587 min | Prod15, Mag16, Uni16, Mura16, Cas13, Sent13, Carav11, Guerra7, Scud12, Off1 | Dottrina Conquista |
| 18 | Citta | G 116.473; W 139.768; C 139.768; I 93.179; Au 11.648 | 1.904 min | Prod16, Mag17, Uni17, Mura17, Cas14, Sent14, Carav12, Guerra8, Scud13, Off3 | Carro; Perimetro Avanzato; Navigazione avanzata |
| 19 | Citta | G 145.591; W 174.710; C 174.710; I 116.473; Au 14.560 | 2.285 min | Prod16, Mag18, Uni18, Mura18, Cas15, Sent15, Carav13, Guerra9, Scud14, Off5 | Resistenza Carro |
| 20 | Citta | G 181.989; W 218.387; C 218.387; I 145.591; Au 18.199 | 2.742 min | Prod17, Mag19, Uni19, Mura19, Cas16, Sent15, Carav14, Guerra10, Scud15, Off8 | Coordinamento Assedio |
| 21 | Citta | G 209.287; W 251.145; C 251.145; I 167.430; Au 20.929 | 3.016 min | Prod18, Mag20, Uni20, Mura20, Cas17, Sent15, Carav15, Guerra12, Scud16, Off16 | Bestiario; Animali |
| 22 | Citta | G 240.680; W 288.816; C 288.816; I 192.544; Au 24.068 | 3.317 min | Prod18, Mag21, Uni21, Mura21, Cas18, Sent16, Carav16, Guerra13, Scud17, Off17, Best1 | Maestrie Animali |
| 23 | Citta | G 276.782; W 332.139; C 332.139; I 221.426; Au 27.679 | 3.649 min | Prod19, Mag22, Uni22, Mura22, Cas19, Sent17, Carav17, Guerra14, Scud18, Off18, Best3 | - |
| 24 | Citta | G 318.300; W 381.960; C 381.960; I 254.640; Au 31.830 | 4.014 min | Prod20, Mag23, Uni23, Mura23, Cas20, Sent18, Carav18, Guerra15, Scud19, Off19, Best5 | Elefante; Pressione Fedelta |
| 25 | Citta | G 366.045; W 439.253; C 439.253; I 292.836; Au 36.605 | 4.415 min | Prod21, Mag24, Uni24, Mura24, Cas20, Sent19, Carav19, Guerra16, Scud20, Off20, Best8 | Maestria Elefante |
| 26 | Citta | G 420.951; W 505.141; C 505.141; I 336.761; Au 42.096 | 4.857 min | Prod22, Mag25, Uni25, Mura25, Cas21, Sent20, Carav20, Guerra18, Scud21, Off21, Best10 | Tier ricerca E |
| 27 | Citta | G 484.094; W 580.912; C 580.912; I 387.275; Au 48.410 | 5.343 min | Prod23, Mag26, Uni26, Mura26, Cas22, Sent21, Carav21, Guerra20, Scud22, Off22, Best12 | Assedio/Logistica avanzata |
| 28 | Citta | G 556.708; W 668.049; C 668.049; I 445.366; Au 55.671 | 5.877 min | Prod24, Mag27, Uni27, Mura27, Cas23, Sent22, Carav22, Guerra22, Scud23, Off23, Best14 | Intelligence/Sentinelle finali |
| 29 | Citta | G 640.214; W 768.256; C 768.256; I 512.171; Au 64.022 | 6.464 min | Prod25, Mag28, Uni28, Mura28, Cas24, Sent23, Carav23, Guerra24, Scud24, Off24, Best16 | Studi del Tempio |
| 30 | Metropoli | G 736.246; W 883.495; C 883.495; I 588.997; Au 73.625 | 7.111 min | Prod26, Mag29, Uni29, Mura29, Cas25, Sent24, Carav24, Guerra25, Scud25, Off25, Best18 | Metropoli; Tempio; Studi Mitici; Santuario Mitico |

FORMULA COSTO/TEMPO v3.7; Lv2: base di ciascun edificio. Lv3-10: costi x1,45 e tempo x1,40; Lv11-20: x1,25 e x1,20; Lv21-30: x1,15 e x1,10. Decimal dalla base, ceil per risorsa e minuti solo dopo tutti i fattori applicabili. Santuario Mitico escluso: usa i cinque livelli dedicati. Early-game fast resta applicabile dove previsto.

## 7. Catalogo strutture e costruzione

| Struttura | Categoria | Unlock settlement | Stato | Scopo |
| --- | --- | --- | --- | --- |
| Castello / Fortezza | core | 1 | ACTIVE | Settlement.level; unlock e progressione |
| Fattoria | resource | 1 | ACTIVE | Produzione Grano |
| Boscaiolo | resource | 1 | ACTIVE | Produzione Legno |
| Cava d'Argilla | resource | 1 | ACTIVE | Produzione Argilla |
| Miniera di Ferro | resource | 1 | ACTIVE | Produzione Ferro |
| Miniera d'Oro | resource | 1 | ACTIVE | Produzione Oro |
| Magazzino | economy | 1 | ACTIVE | Hard cap risorse locali |
| Caserma | military | 1 | ACTIVE | Fanteria e Arcieri |
| Universita | research | 1 | ACTIVE | 12 rami ricerca, 2 code |
| Mura | defense | 1 | ACTIVE | HP, DEF, danno statico |
| Sala della Casata | house | 1 | ACTIVE | Identita Casata, araldica, prestigio |
| Comando Sentinelle | defense | 3 | ACTIVE | 4 interne; 8 esterne via ricerca |
| Caravanserraglio | logistics | 5 | ACTIVE | Carovane, capacita e velocita |
| Sala dell'Alleanza | alliance | 7 | ACTIVE | Supporti, ruoli, tesoreria, campagne |
| Sala di Guerra | military | 10 | ACTIVE | Capacita singola marcia |
| Scuderia | military | 11 | ACTIVE | Cavalleria |
| Porto | naval | 15 | ACTIVE | Navi trasporto Porto-Porto; solo port_eligible |
| Officina | military | 16 | ACTIVE | Catapulta e Carro di Conquista |
| Bestiario | beast | 21 | ACTIVE | Orso, Leone, Falco, Lupo, Elefante |
| Tempio | legendary | 30 | ACTIVE | Drago, Angelo, Demone |
| Santuario Mitico | mythic | 30 | ACTIVE | 5 livelli speciali; Unicorno player-wide |

Gli edifici sbloccati dopo Lv1 NON appaiono gia costruiti: la costruzione Lv1 costa il 60% della base Lv2 e richiede il 60% del tempo base Lv2, con ceil all intero. Da Lv2 in poi usa la curva comune. Le strutture disponibili all onboarding sono prebuilt Lv1.

| Struttura | G | W | C | I | Au | Tempo Lv2 |
| --- | --- | --- | --- | --- | --- | --- |
| Castello / Fortezza | 1.000 | 1.200 | 1.200 | 800 | 100 | 30 min |
| Fattoria | 100 | 250 | 150 | 50 | 0 | 10 min |
| Boscaiolo | 150 | 100 | 250 | 50 | 0 | 10 min |
| Cava d'Argilla | 150 | 250 | 100 | 50 | 0 | 10 min |
| Miniera di Ferro | 200 | 250 | 250 | 100 | 0 | 12 min |
| Miniera d'Oro | 300 | 300 | 300 | 250 | 50 | 15 min |
| Magazzino | 250 | 400 | 400 | 200 | 20 | 20 min |
| Caserma | 300 | 450 | 350 | 250 | 20 | 25 min |
| Universita | 500 | 700 | 700 | 500 | 100 | 45 min |
| Mura | 400 | 800 | 900 | 500 | 50 | 60 min |
| Sala della Casata | 200 | 300 | 300 | 150 | 20 | 20 min |
| Comando Sentinelle | 350 | 550 | 500 | 300 | 40 | 30 min |
| Caravanserraglio | 250 | 500 | 400 | 250 | 30 | 25 min |
| Sala dell'Alleanza | 300 | 550 | 450 | 350 | 50 | 30 min |
| Sala di Guerra | 400 | 600 | 500 | 500 | 60 | 35 min |
| Scuderia | 450 | 600 | 500 | 600 | 60 | 35 min |
| Porto | 900 | 1.600 | 1.000 | 800 | 150 | 90 min |
| Officina | 500 | 900 | 800 | 700 | 80 | 45 min |
| Bestiario | 800 | 900 | 800 | 700 | 120 | 60 min |
| Tempio | 1.500 | 1.800 | 1.800 | 1.500 | 400 | 120 min |

### 7.1 Effetti militari/logistici Lv1-30

| Lv | Batch Caserma | Moltip. tempo | Cap marcia | Cap Sentinella | Cap Carovana | Carovane/marcia |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 50 | 1.000 | 1.000 | 500 | 5.000 | 1 |
| 2 | 59 | 0.962 | 1.170 | 575 | 5.850 | 2 |
| 3 | 70 | 0.926 | 1.369 | 661 | 6.844 | 2 |
| 4 | 82 | 0.893 | 1.602 | 760 | 8.008 | 2 |
| 5 | 97 | 0.862 | 1.874 | 875 | 9.369 | 2 |
| 6 | 114 | 0.833 | 2.192 | 1.006 | 10.962 | 2 |
| 7 | 135 | 0.806 | 2.565 | 1.157 | 12.826 | 3 |
| 8 | 159 | 0.781 | 3.001 | 1.330 | 15.006 | 3 |
| 9 | 188 | 0.758 | 3.511 | 1.530 | 17.557 | 3 |
| 10 | 222 | 0.735 | 4.108 | 1.759 | 20.542 | 3 |
| 11 | 262 | 0.714 | 4.807 | 2.023 | 24.034 | 3 |
| 12 | 309 | 0.694 | 5.624 | 2.326 | 28.120 | 4 |
| 13 | 364 | 0.676 | 6.580 | 2.675 | 32.900 | 4 |
| 14 | 430 | 0.658 | 7.699 | 3.076 | 38.493 | 4 |
| 15 | 507 | 0.641 | 9.007 | 3.538 | 45.037 | 4 |
| 16 | 599 | 0.625 | 10.539 | 4.069 | 52.694 | 4 |
| 17 | 706 | 0.610 | 12.330 | 4.679 | 61.652 | 5 |
| 18 | 834 | 0.595 | 14.426 | 5.381 | 72.132 | 5 |
| 19 | 984 | 0.581 | 16.879 | 6.188 | 84.395 | 5 |
| 20 | 1.161 | 0.568 | 19.748 | 7.116 | 98.742 | 5 |
| 21 | 1.370 | 0.556 | 23.106 | 8.183 | 115.528 | 5 |
| 22 | 1.616 | 0.543 | 27.034 | 9.411 | 135.168 | 6 |
| 23 | 1.907 | 0.532 | 31.629 | 10.822 | 158.146 | 6 |
| 24 | 2.250 | 0.521 | 37.006 | 12.446 | 185.031 | 6 |
| 25 | 2.655 | 0.510 | 43.297 | 14.313 | 216.486 | 6 |
| 26 | 3.133 | 0.500 | 50.658 | 16.459 | 253.289 | 6 |
| 27 | 3.697 | 0.490 | 59.270 | 18.928 | 296.348 | 7 |
| 28 | 4.363 | 0.481 | 69.345 | 21.768 | 346.727 | 7 |
| 29 | 5.148 | 0.472 | 81.134 | 25.033 | 405.671 | 7 |
| 30 | 6.075 | 0.463 | 94.927 | 28.788 | 474.635 | 7 |

FORMULE ESATTE; Batch Caserma = round(50 x 1,18^(L-1)); moltiplicatore tempo addestramento = 1/(1+0,04 x (L-1)); cap singola marcia = round(1000 x 1,17^(L-1)); cap Sentinella = round(500 x 1,15^(L-1)); cap Carovana = round(5000 x 1,17^(L-1)); carovane per marcia = 1 a Lv1, altrimenti 1 + ceil((L-1)/5).

## 8. Economia canonica 1-30

| Lv | Grano/h | Legno/h | Argilla/h | Ferro/h | Oro/h | Magazzino / risorsa |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 20 | 20 | 20 | 18 | 5 | 3.500 |
| 2 | 60 | 60 | 60 | 54 | 15 | 7.000 |
| 3 | 120 | 120 | 120 | 108 | 30 | 11.200 |
| 4 | 200 | 200 | 200 | 180 | 50 | 17.500 |
| 5 | 300 | 300 | 300 | 270 | 75 | 26.250 |
| 6 | 420 | 420 | 420 | 378 | 105 | 36.750 |
| 7 | 560 | 560 | 560 | 504 | 140 | 61.250 |
| 8 | 720 | 720 | 720 | 648 | 180 | 89.250 |
| 9 | 900 | 900 | 900 | 810 | 225 | 120.750 |
| 10 | 1.100 | 1.100 | 1.100 | 990 | 275 | 155.750 |
| 11 | 1.320 | 1.320 | 1.320 | 1.188 | 330 | 194.250 |
| 12 | 1.560 | 1.560 | 1.560 | 1.404 | 390 | 236.250 |
| 13 | 1.820 | 1.820 | 1.820 | 1.638 | 455 | 281.750 |
| 14 | 2.100 | 2.100 | 2.100 | 1.890 | 525 | 355.250 |
| 15 | 2.400 | 2.400 | 2.400 | 2.160 | 600 | 434.000 |
| 16 | 2.720 | 2.720 | 2.720 | 2.448 | 680 | 518.000 |
| 17 | 3.060 | 3.060 | 3.060 | 2.754 | 765 | 607.250 |
| 18 | 3.420 | 3.420 | 3.420 | 3.078 | 855 | 701.750 |
| 19 | 3.800 | 3.800 | 3.800 | 3.420 | 950 | 801.500 |
| 20 | 4.200 | 4.200 | 4.200 | 3.780 | 1.050 | 906.500 |
| 21 | 8.400 | 8.400 | 8.400 | 7.560 | 2.100 | 1.053.500 |
| 22 | 9.400 | 9.400 | 9.400 | 8.460 | 2.350 | 1.242.500 |
| 23 | 10.600 | 10.600 | 10.600 | 9.540 | 2.650 | 1.473.500 |
| 24 | 12.000 | 12.000 | 12.000 | 10.800 | 3.000 | 1.746.500 |
| 25 | 13.600 | 13.600 | 13.600 | 12.240 | 3.400 | 2.061.500 |
| 26 | 15.600 | 15.600 | 15.600 | 14.040 | 3.900 | 2.418.500 |
| 27 | 17.800 | 17.800 | 17.800 | 16.020 | 4.450 | 2.817.500 |
| 28 | 20.300 | 20.300 | 20.300 | 18.270 | 5.075 | 3.258.500 |
| 29 | 23.100 | 23.100 | 23.100 | 20.790 | 5.775 | 3.741.500 |
| 30 | 26.200 | 26.200 | 26.200 | 23.580 | 6.550 | 4.266.500 |

Risorse locali: Grano, Legno, Argilla, Ferro, Oro.

Magazzino = hard cap per ciascuna risorsa; produzione oltre cap e persa, non recuperata retroattivamente.

Nessun upkeep continuo delle truppe.

Cap permanente produzione: +60%, distinto dalla capacita Magazzino. Il nuovo cap bonus Magazzino e +60% massimo, non automatico: le tre ricerche attuali danno +30% complessivo. La produzione oraria e i relativi bonus restano invariati.

Smeraldi sono Alliance-level; Rubini sono account-level; nessuna conversione implicita fra valute.

## 9. Ricerca: 12 rami canonici, costi e due code

CORREZIONE COPERTURA DOCUMENTALE; La vecchia documentazione dichiarava 12 rami ma mostrava anche "Dottrina Player" come tabella separata, creando un conteggio apparente di 13. In v3.7 i 12 rami sono quelli dell Universita; Attaccante/Difensore e una specializzazione Player separata, scelta al terzo Insediamento.

### 9.1 Classi costo ricerca

| Classe | Lv | G | W | C | I | Au | Tempo |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | 1 | 500 | 500 | 500 | 300 | 50 | 15 min |
| A | 2 | 900 | 900 | 900 | 540 | 90 | 27 min |
| A | 3 | 1.620 | 1.620 | 1.620 | 970 | 160 | 49 min |
| A | 4 | 2.920 | 2.920 | 2.920 | 1.750 | 290 | 1,4 h |
| A | 5 | 5.250 | 5.250 | 5.250 | 3.150 | 520 | 2,6 h |
| B | 1 | 2.000 | 2.000 | 2.000 | 1.500 | 200 | 1,0 h |
| B | 2 | 4.000 | 4.000 | 4.000 | 3.000 | 400 | 2,0 h |
| B | 3 | 8.000 | 8.000 | 8.000 | 6.000 | 800 | 4,0 h |
| B | 4 | 16.000 | 16.000 | 16.000 | 12.000 | 1.600 | 8,0 h |
| B | 5 | 32.000 | 32.000 | 32.000 | 24.000 | 3.200 | 16,0 h |
| C | 1 | 10.000 | 10.000 | 10.000 | 8.000 | 1.000 | 4,0 h |
| C | 2 | 20.000 | 20.000 | 20.000 | 16.000 | 2.000 | 8,0 h |
| C | 3 | 40.000 | 40.000 | 40.000 | 32.000 | 4.000 | 16,0 h |
| C | 4 | 80.000 | 80.000 | 80.000 | 64.000 | 8.000 | 1,3 gg |
| C | 5 | 160.000 | 160.000 | 160.000 | 128.000 | 16.000 | 2,7 gg |
| D | 1 | 50.000 | 50.000 | 50.000 | 40.000 | 5.000 | 12,0 h |
| D | 2 | 105.000 | 105.000 | 105.000 | 84.000 | 10.500 | 1,1 gg |
| D | 3 | 220.500 | 220.500 | 220.500 | 176.400 | 22.050 | 2,2 gg |
| D | 4 | 463.050 | 463.050 | 463.050 | 370.440 | 46.310 | 4,6 gg |
| D | 5 | 972.410 | 972.410 | 972.410 | 777.920 | 97.240 | 9,7 gg |
| E | 1 | 250.000 | 250.000 | 250.000 | 200.000 | 25.000 | 2,0 gg |
| E | 2 | 550.000 | 550.000 | 550.000 | 440.000 | 55.000 | 4,4 gg |
| E | 3 | 1.210.000 | 1.210.000 | 1.210.000 | 968.000 | 121.000 | 9,7 gg |
| E | 4 | 2.100.000 | 2.100.000 | 2.100.000 | 1.680.000 | 210.000 | 16,0 gg |
| E | 5 | 3.000.000 | 3.000.000 | 3.000.000 | 2.400.000 | 300.000 | 24,0 gg |

COSTI RICERCA E4/E5; Restano 2.100.000/1.680.000/210.000 e 16 giorni per E4; 3.000.000/2.400.000/300.000 e 24 giorni per E5, secondo la tabella completa. Magazzino base Lv30 v3.7: 4.266.500 per risorsa. Non occorre poter finanziare contemporaneamente tutte le spese endgame.

### 9.2 Albero completo

#### Economia

| Nodo | Key | Max | Uni/Ins | Prerequisiti | Classe | Effetto |
| --- | --- | --- | --- | --- | --- | --- |
| Agricoltura I | economy.grain_1 | 5 | 1/1 | - | A | +2% produzione Grano/livello; max +10% tier |
| Agricoltura II | economy.grain_2 | 5 | 6/6 | economy.grain_1 | B | Ulteriore +2% Grano/livello |
| Agricoltura III | economy.grain_3 | 5 | 26/26 | economy.grain_2 | E | Ulteriore +2% Grano/livello |
| Silvicoltura I | economy.wood_1 | 5 | 1/1 | - | A | +2% Legno/livello |
| Silvicoltura II | economy.wood_2 | 5 | 6/6 | economy.wood_1 | B | Ulteriore +2% Legno/livello |
| Silvicoltura III | economy.wood_3 | 5 | 26/26 | economy.wood_2 | E | Ulteriore +2% Legno/livello |
| Estrazione Argilla I | economy.clay_1 | 5 | 1/1 | - | A | +2% Argilla/livello |
| Estrazione Argilla II | economy.clay_2 | 5 | 6/6 | economy.clay_1 | B | Ulteriore +2% Argilla/livello |
| Estrazione Argilla III | economy.clay_3 | 5 | 26/26 | economy.clay_2 | E | Ulteriore +2% Argilla/livello |
| Metallurgia I | economy.iron_1 | 5 | 1/1 | - | A | +2% Ferro/livello |
| Metallurgia II | economy.iron_2 | 5 | 6/6 | economy.iron_1 | B | Ulteriore +2% Ferro/livello |
| Metallurgia III | economy.iron_3 | 5 | 26/26 | economy.iron_2 | E | Ulteriore +2% Ferro/livello |
| Oreficeria I | economy.gold_1 | 5 | 1/1 | - | A | +2% Oro/livello |
| Oreficeria II | economy.gold_2 | 5 | 6/6 | economy.gold_1 | B | Ulteriore +2% Oro/livello |
| Oreficeria III | economy.gold_3 | 5 | 26/26 | economy.gold_2 | E | Ulteriore +2% Oro/livello |
| Magazzini I | economy.warehouse_1 | 5 | 1/1 | - | A | +2% capacita Magazzino/livello |
| Magazzini II | economy.warehouse_2 | 5 | 6/6 | economy.warehouse_1 | B | Ulteriore +2% capacita/livello |
| Magazzini III | economy.warehouse_3 | 5 | 26/26 | economy.warehouse_2 | E | Ulteriore +2% capacita/livello |

#### Costruzione

| Nodo | Key | Max | Uni/Ins | Prerequisiti | Classe | Effetto |
| --- | --- | --- | --- | --- | --- | --- |
| Costruzione I | construction.speed_1 | 5 | 1/1 | - | A | -1% tempo costruzione/livello |
| Costruzione II | construction.speed_2 | 5 | 6/6 | construction.speed_1 | B | Ulteriore -1%/livello |
| Costruzione III | construction.speed_3 | 5 | 26/26 | construction.speed_2 | E | Ulteriore -1%/livello; cap permanente -35% |
| Ricerca Rapida I | research.speed_1 | 5 | 6/6 | - | B | -1% tempo ricerca/livello |
| Ricerca Rapida II | research.speed_2 | 5 | 16/16 | research.speed_1 | D | Ulteriore -1%/livello |
| Ricerca Rapida III | research.speed_3 | 5 | 26/26 | research.speed_2 | E | Ulteriore -1%/livello; cap permanente -35% |

#### Militare

| Nodo | Key | Max | Uni/Ins | Prerequisiti | Classe | Effetto |
| --- | --- | --- | --- | --- | --- | --- |
| Disciplina Fanteria I | military.infantry_1 | 5 | 1/1 | - | A | +2% ATK e +1% DEF Fanteria/livello |
| Tiro con l'Arco | military.archery_unlock | 1 | 2/2 | - | A | Sblocca Arciere |
| Arcieria I | military.archery_1 | 5 | 2/2 | military.archery_unlock | A | +2% ATK Arciere/livello |
| Addestramento I | military.training_1 | 5 | 2/2 | - | A | +3% throughput reclutamento/livello |
| Capacita Marcia I | military.march_capacity_1 | 5 | 3/3 | - | A | +5% capacita singola marcia/livello |
| Disciplina Fanteria II | military.infantry_2 | 5 | 6/6 | military.infantry_1 | B | Ulteriore +2% ATK e +1% DEF/livello |
| Arcieria II | military.archery_2 | 5 | 6/6 | military.archery_1 | B | Ulteriore +2% ATK/livello |
| Attacco Truppe I | military.attack_1 | 5 | 7/7 | - | B | +1,5% ATK generale/livello |
| Difesa Truppe I | military.defense_1 | 5 | 7/7 | - | B | +1,5% DEF generale/livello |
| Salute Truppe I | military.health_1 | 5 | 8/8 | - | B | +1,5% HP truppe/livello |
| Velocita Marcia I | military.march_speed_1 | 5 | 8/8 | - | B | +2% velocita terrestre/livello; cap ricerca +50% |
| Equitazione | military.equestrianism | 1 | 11/11 | military.march_speed_1 | C | Sblocca Scuderia |
| Cavalleria | military.cavalry_unlock | 1 | 11/11 | military.equestrianism | C | Sblocca reclutamento Cavalleria |
| Maestria Cavalleria I | military.cavalry_mastery_1 | 5 | 12/12 | military.cavalry_unlock | C | +2% ATK e +2% velocita Cavalleria/livello |
| Intercettazione Carovane | military.caravan_interception | 1 | 13/13 | military.cavalry_unlock + intelligence.caravan_search_1 | C | Sblocca missione intercettazione |

#### Difesa

| Nodo | Key | Max | Uni/Ins | Prerequisiti | Classe | Effetto |
| --- | --- | --- | --- | --- | --- | --- |
| Ingegneria delle Mura I | defense.wall_engineering_1 | 5 | 1/1 | - | A | +3% HP Mura/livello |
| Feritoie I | defense.battlements_1 | 5 | 2/2 | defense.wall_engineering_1 | A | +2% danno diretto Mura/livello |
| Difesa Guarnigione I | defense.garrison_1 | 5 | 3/3 | - | A | +2% DEF guarnigione/livello |
| Ingegneria delle Mura II | defense.wall_engineering_2 | 5 | 8/8 | defense.wall_engineering_1 | B | Ulteriore +3% HP/livello |
| Feritoie II | defense.battlements_2 | 5 | 9/9 | defense.battlements_1 | B | Ulteriore +2% danno Mura/livello |
| Difesa Guarnigione II | defense.garrison_2 | 5 | 10/10 | defense.garrison_1 | B | Ulteriore +2% DEF guarnigione/livello |
| Ingegneria delle Mura III | defense.wall_engineering_3 | 5 | 16/16 | defense.wall_engineering_2 | D | Ulteriore +3% HP/livello |
| Feritoie III | defense.battlements_3 | 5 | 17/17 | defense.battlements_2 | D | Ulteriore +2% danno Mura/livello |
| Riparazione Mura I | defense.wall_repair_1 | 5 | 18/18 | defense.wall_engineering_3 | D | +5% throughput riparazione manuale/livello; tempo = base/(1+bonus) |
| Ingegneria delle Mura IV | defense.wall_engineering_4 | 5 | 26/26 | defense.wall_engineering_3 | E | Ulteriore +3% HP/livello |
| Danno Mura IV | defense.battlements_4 | 5 | 27/27 | defense.battlements_3 | E | Ulteriore +2% danno/livello |
| Riparazione Mura II | defense.wall_repair_2 | 5 | 28/28 | defense.wall_repair_1 | E | Ulteriore +5% throughput riparazione manuale/livello; bonus cumulativo max +50% |

#### Logistica

| Nodo | Key | Max | Uni/Ins | Prerequisiti | Classe | Effetto |
| --- | --- | --- | --- | --- | --- | --- |
| Capacita Saccheggio I | logistics.loot_capacity_1 | 5 | 6/6 | - | B | +5% capacita bottino/livello |
| Carovane I | logistics.caravans_1 | 1 | 6/6 | - | B | Sblocca trasferimenti terrestri |
| Capacita Carovana I | logistics.caravan_capacity_1 | 5 | 7/7 | logistics.caravans_1 | B | +5% capacita carovana/livello |
| Velocita Carovana I | logistics.caravan_speed_1 | 5 | 8/8 | logistics.caravans_1 | B | +3% velocita carovana/livello |
| Logistica Rinforzi I | logistics.reinforcement_1 | 5 | 9/9 | - | B | +3% velocita supporto/livello |
| Logistica d Assedio I | logistics.siege_1 | 5 | 18/18 | siege.siege_engineering | D | Macchine Assedio/Special contano come ceil(count/(1+0,04*livello)) unita ai fini del cap War Hall; max Lv5 |
| Logistica Avanzata | logistics.advanced | 5 | 27/27 | logistics.siege_1 + logistics.caravan_capacity_1 | E | +2% velocita e +3% capacita logistica/livello |

#### Intelligence

| Nodo | Key | Max | Uni/Ins | Prerequisiti | Classe | Effetto |
| --- | --- | --- | --- | --- | --- | --- |
| Osservazione I | intelligence.observation_1 | 5 | 1/1 | - | A | +4 intel_points/livello; disclosure deterministica secondo intelligence_engine |
| Osservazione II | intelligence.observation_2 | 5 | 6/6 | intelligence.observation_1 | B | +4 intel_points/livello; disclosure deterministica secondo intelligence_engine |
| Controspionaggio I | intelligence.counter_1 | 5 | 7/7 | - | B | -3 intel_points all osservatore nemico/livello; non puo nascondere l esistenza di un detection event |
| Ricognizione Carovane I | intelligence.caravan_search_1 | 5 | 8/8 | logistics.caravans_1 | B | +1 tile raggio ricerca ai livelli 2 e 4 (max +2) |
| Ricognizione II | intelligence.observation_3 | 5 | 12/12 | intelligence.observation_2 | C | +4 intel_points/livello; disclosure deterministica secondo intelligence_engine |
| Ricerca Carovane II | intelligence.caravan_search_2 | 5 | 13/13 | intelligence.caravan_search_1 | C | +1 tile raggio ricerca/livello (max +5) e +2 intel_points/livello solo su rilevamenti Carovana |
| Controspionaggio II | intelligence.counter_2 | 5 | 17/17 | intelligence.counter_1 | D | -3 intel_points all osservatore nemico/livello; non puo nascondere l esistenza di un detection event |
| Intelligence IV | intelligence.observation_4 | 5 | 19/19 | intelligence.observation_3 | D | +4 intel_points/livello; disclosure deterministica secondo intelligence_engine |
| Intelligence V | intelligence.observation_5 | 5 | 28/28 | intelligence.observation_4 | E | +4 intel_points/livello; disclosure deterministica secondo intelligence_engine |
| Controspionaggio III | intelligence.counter_3 | 5 | 28/28 | intelligence.counter_2 | E | -3 intel_points all osservatore nemico/livello; non puo nascondere l esistenza di un detection event |

#### Sentinelle

| Nodo | Key | Max | Uni/Ins | Prerequisiti | Classe | Effetto |
| --- | --- | --- | --- | --- | --- | --- |
| Fuochi di Segnalazione I | sentinel.signals_1 | 5 | 3/3 | - | A | +2 intel_points/livello sui detection event originati dalla rete Sentinelle; nessuna espansione geometrica del territorio |
| Presidio Sentinella I | sentinel.garrison_1 | 5 | 3/3 | - | A | Bonus DEF guarnigione fino +5% tier |
| Rete di Segnalazione | sentinel.signals_2 | 5 | 10/10 | sentinel.signals_1 | B | +3 intel_points/livello sui detection event originati dalla rete Sentinelle; nessuna modifica alla probabilita di detection |
| Presidio Sentinella II | sentinel.garrison_2 | 5 | 10/10 | sentinel.garrison_1 | B | Bonus totale fino +10% |
| Presidio Sentinella III | sentinel.garrison_3 | 5 | 15/15 | sentinel.garrison_2 | C | Bonus totale fino +15% |
| Perimetro Avanzato | sentinel.advanced_perimeter | 1 | 18/18 | sentinel.signals_2 + intelligence.observation_3 | D | Sblocca 8 Sentinelle esterne |
| Presidio Sentinella IV | sentinel.garrison_4 | 5 | 20/20 | sentinel.garrison_3 + sentinel.advanced_perimeter | D | Bonus totale fino +20% |
| Presidio Sentinella V | sentinel.garrison_5 | 5 | 28/28 | sentinel.garrison_4 | E | Bonus totale fino +25% |

#### Assalto e Conquista

| Nodo | Key | Max | Uni/Ins | Prerequisiti | Classe | Effetto |
| --- | --- | --- | --- | --- | --- | --- |
| Ingegneria d Assedio | siege.siege_engineering | 1 | 16/16 | - | D | Sblocca Officina |
| Progetto Catapulta | siege.catapult_unlock | 1 | 16/16 | siege.siege_engineering | D | Sblocca Catapulta |
| Catapulta I-V | siege.catapult_mastery | 5 | 17/17 | siege.catapult_unlock | D | +4% danno strutturale Catapulta/livello |
| Dottrina di Conquista | siege.conquest_doctrine | 1 | 17/17 | siege.siege_engineering | D | Prerequisito Carro/Fedelta PvP |
| Progetto Carro di Conquista | siege.conquest_cart_unlock | 1 | 18/18 | siege.conquest_doctrine | D | Sblocca Carro |
| Resistenza Carro | siege.conquest_cart_resilience | 5 | 19/19 | siege.conquest_cart_unlock | D | +5% HP Carro di Conquista/livello (max +25%) |
| Coordinamento Assedio | siege.coordination | 5 | 20/20 | siege.conquest_doctrine | D | +2% cap War Hall per marce CONQUEST/livello (max +10%); non si applica ad ATTACK/RAID/REINFORCE |
| Pressione sulla Fedelta | siege.loyalty_pressure | 5 | 24/24 | siege.coordination | E | +2 punti Fedelta ridotti/livello: 20->30 max |
| Assedio Avanzato | siege.advanced | 5 | 27/27 | siege.catapult_mastery + siege.coordination | E | +3% wall_damage di tutte le unita attaccanti con wall_damage>0/livello (max +15%) |

#### Animali

| Nodo | Key | Max | Uni/Ins | Prerequisiti | Classe | Effetto |
| --- | --- | --- | --- | --- | --- | --- |
| Studio delle Bestie | animals.beast_studies | 1 | 21/21 | military.health_1 | E | Sblocca Bestiario |
| Addestramento Orso | animals.bear_unlock | 1 | 21/21 | animals.beast_studies | E | Sblocca Orso |
| Maestria Orso | animals.bear_mastery | 5 | 22/22 | animals.bear_unlock | E | +3% ATK/DEF/HP Orso per livello |
| Addestramento Leone | animals.lion_unlock | 1 | 21/21 | animals.beast_studies | E | Sblocca Leone |
| Maestria Leone | animals.lion_mastery | 5 | 22/22 | animals.lion_unlock | E | +3% ATK/DEF/HP Leone per livello |
| Addestramento Falco | animals.falcon_unlock | 1 | 21/21 | animals.beast_studies | E | Sblocca Falco |
| Maestria Falco | animals.falcon_mastery | 5 | 22/22 | animals.falcon_unlock | E | +3 intel_points/livello nelle missioni scouting che includono Falco e +2% velocita Falco/livello |
| Addestramento Lupo | animals.wolf_unlock | 1 | 21/21 | animals.beast_studies | E | Sblocca Lupo |
| Maestria Lupo | animals.wolf_mastery | 5 | 22/22 | animals.wolf_unlock | E | +3% ATK/DEF/HP Lupo per livello |
| Addestramento Elefante | animals.elephant_unlock | 1 | 24/24 | animals.beast_studies + siege.siege_engineering | E | Sblocca Elefante da Guerra |
| Maestria Elefante | animals.elephant_mastery | 5 | 25/25 | animals.elephant_unlock | E | +3% ATK/DEF/HP e +4% wall damage/livello |

#### Leggendari

| Nodo | Key | Max | Uni/Ins | Prerequisiti | Classe | Effetto |
| --- | --- | --- | --- | --- | --- | --- |
| Studi del Tempio | legendary.temple_studies | 1 | 29/29 | research.speed_3 + siege.advanced | E | Prerequisito Tempio |
| Richiamo del Drago 1 | legendary.dragon_1 | 1 | 30/30 | legendary.temple_studies | E | Sblocca copia 1 Drago |
| Richiamo del Drago 2 | legendary.dragon_2 | 1 | 30/30 | legendary.dragon_1 | E | Sblocca copia 2 Drago |
| Richiamo del Drago 3 | legendary.dragon_3 | 1 | 30/30 | legendary.dragon_2 | E | Sblocca copia 3 Drago |
| Benedizione dell Angelo 1 | legendary.angel_1 | 1 | 30/30 | legendary.temple_studies | E | Sblocca copia 1 Angelo |
| Benedizione dell Angelo 2 | legendary.angel_2 | 1 | 30/30 | legendary.angel_1 | E | Sblocca copia 2 Angelo |
| Benedizione dell Angelo 3 | legendary.angel_3 | 1 | 30/30 | legendary.angel_2 | E | Sblocca copia 3 Angelo |
| Patto del Demone 1 | legendary.demon_1 | 1 | 30/30 | legendary.temple_studies | E | Sblocca copia 1 Demone |
| Patto del Demone 2 | legendary.demon_2 | 1 | 30/30 | legendary.demon_1 | E | Sblocca copia 2 Demone |
| Patto del Demone 3 | legendary.demon_3 | 1 | 30/30 | legendary.demon_2 | E | Sblocca copia 3 Demone |

#### Navigazione

| Nodo | Key | Max | Uni/Ins | Prerequisiti | Classe | Effetto |
| --- | --- | --- | --- | --- | --- | --- |
| Studi Nautici | navigation.nautical_studies | 1 | 15/15 | - | D | Radice navigazione |
| Costruzione del Porto | navigation.port_construction | 1 | 15/15 | navigation.nautical_studies | D | Sblocca Porto costiero |
| Costruzione Navale | navigation.shipbuilding | 1 | 16/16 | navigation.port_construction | D | Sblocca Nave da Trasporto |
| Tecniche d Imbarco | navigation.embark | 1 | 16/16 | navigation.shipbuilding | D | Imbarco esclusivo Porto->Porto |
| Tecniche di Sbarco | navigation.disembark | 1 | 16/16 | navigation.shipbuilding | D | Sbarco esclusivo in Porto |
| Navigazione Avanzata | navigation.speed | 5 | 18/18 | navigation.shipbuilding | D | +3% velocita flotte/livello |
| Capacita Navi | navigation.capacity | 5 | 18/18 | navigation.shipbuilding | D | +5% capacita soldati/nave/livello |

#### Mitici

| Nodo | Key | Max | Uni/Ins | Prerequisiti | Classe | Effetto |
| --- | --- | --- | --- | --- | --- | --- |
| Studi Mitici | mythic.mythic_studies | 1 | 30/30 | - | E | Sblocca costruzione Santuario Mitico player-wide nella Madre |

### 9.3 Specializzazione Player

| Scelta | Effetto | Regole |
| --- | --- | --- |
| ATTACCANTE | +5% potenza ATK nelle proprie marce Attack/Raid/Conquista. | Prima scelta gratuita al 3o Insediamento; esclusiva. |
| DIFENSORE | +5% potenza DEF quando difende propri Settlement/Sentinelle. | Prima scelta gratuita al 3o Insediamento; esclusiva. |
| Cambio | Costo Rubini secondo premium policy. | Cooldown 7 giorni; vietato durante guerra, assedio o marce militari attive. |

## 10. Esercito, Bestie e Leggendari

| Unita | Cat. | Edificio | Ins. | ATK | DEF | HP | Vel tph | Carico | Mura |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Fanteria | infantry | Caserma | 1 | 10 | 14 | 12 | 2,4 | 20 | 0 |
| Arciere | ranged | Caserma | 3 | 13 | 8 | 8 | 2,2 | 15 | 0 |
| Cavalleria | cavalry | Scuderia | 11 | 17 | 12 | 14 | 4,8 | 40 | 0 |
| Catapulta | siege | Officina | 16 | 3 | 4 | 10 | 1,2 | 5 | 120 |
| Carro di Conquista | special | Officina | 18 | 0 | 2 | 20 | 1,0 | 0 | 0 |
| Orso | beast | Bestiario | 21 | 12 | 18 | 25 | 1,6 | 10 | 40 |
| Leone | beast | Bestiario | 21 | 25 | 8 | 14 | 3,0 | 10 | 0 |
| Falco | beast_scout | Bestiario | 21 | 0 | 2 | 2 | 8,0 | 0 | 0 |
| Lupo | beast | Bestiario | 21 | 12 | 14 | 14 | 3,6 | 8 | 0 |
| Elefante da Guerra | beast_heavy | Bestiario | 24 | 30 | 24 | 45 | 1,4 | 20 | 80 |
| Drago | legendary | Tempio | 30 | 5000 | 3000 | 5000 | 18,0 | 0 | 150000 |
| Angelo | legendary | Tempio | 30 | 1000 | 8000 | 6000 | 16,0 | 0 | 0 |
| Demone | legendary | Tempio | 30 | 4000 | 4000 | 5000 | 16,0 | 0 | 0 |

| Unita | G | W | C | I | Au | Tempo | Ruolo / counter |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Fanteria | 15 | 10 | 10 | 5 | 0 | 1 min | +20% vs Cavalleria; +20% vs Assedio/Speciale |
| Arciere | 12 | 20 | 8 | 8 | 0 | 2 min | +25% vs Fanteria/Bestie; x0,75 vs Cavalleria |
| Cavalleria | 30 | 20 | 15 | 35 | 1 | 3 min | +30% vs Arcieri |
| Catapulta | 20 | 80 | 70 | 60 | 3 | 10 min | wall_damage 120; potenza truppe ridotta |
| Carro di Conquista | 100 | 250 | 200 | 180 | 30 | 1,0 h | Solo cambio owner PvP; non richiesto sui neutrali |
| Orso | 120 | 40 | 30 | 35 | 8 | 5 min | wall_damage 40; -1% effetti Mura/100 Orsi, cap -25% |
| Leone | 160 | 40 | 35 | 40 | 12 | 6 min | +25% ATK se nemico ha >=2x unita |
| Falco | 20 | 30 | 5 | 5 | 5 | 2 min | Scouting/Intelligence; nessun volo autonomo su acqua |
| Lupo | 90 | 35 | 20 | 25 | 7 | 4 min | -1% ATK nemico/100, cap15%; in difesa cap20% |
| Elefante da Guerra | 220 | 60 | 50 | 120 | 20 | 10 min | +20% vs Fanteria; wall_damage 80; Bestia |
| Drago | 3.000.000 | 3.000.000 | 3.000.000 | 2.000.000 | 500.000 | 14 gg | +30% vs Bestie; wall_damage 150.000 |
| Angelo | 2.500.000 | 2.500.000 | 2.500.000 | 2.500.000 | 500.000 | 14 gg | -15% perdite alleate dopo calcolo; cap globale 25% |
| Demone | 2.800.000 | 2.800.000 | 2.800.000 | 2.200.000 | 500.000 | 14 gg | Nemico -12% DEF e -8% ATK |

Bestiario e Animali sono ACTIVE. Elefante: unlock Lv24 + Addestramento Elefante; nessun cap numerico.

Leggendari Drago/Angelo/Demone sono ACTIVE. Richiedono Metropoli Lv30, Tempio Lv30 e ricerca dedicata.

Massimo 3 per tipo per Metropoli, contando garrison + queue + in-flight legati a home_metropolis_id. Massimo 1 qualsiasi Leggendario per marcia.

Se una home Metropolis e persa, Leggendari in-flight/sopravvissuti diventano UNHOUSED: possono essere riassegnati a una propria Metropoli con slot libero entro 24h; altrimenti vengono disbanded. Non possono partire mentre UNHOUSED.

Falco e Drago non ottengono un path acqua autonomo: per attraversare mare usano la navigazione, salvo il potere speciale Unicorno.

## 11. Porti, Nave da Trasporto e navigazione ACTIVE

UNITA NAVALE COMPLETAMENTE DEFINITA; La vecchia Bible sbloccava "navi trasporto" senza definire la nave. v3.7 elimina il riferimento orfano: esiste una sola unita navale, Nave da Trasporto. Nessun combattimento navale.

| Campo | Nave da Trasporto |
| --- | --- |
| Edificio | Porto ACTIVE; settlement port_eligible. |
| Unlock | Settlement/Universita Lv16 + Costruzione Navale. |
| Costo | Grano 0 / Legno 100 / Argilla 40 / Ferro 80 / Oro 3. |
| Tempo base | 10 min per nave, modificato dal livello Porto con il moltiplicatore tempo militare. |
| Velocita base | 6,00 tile/h su WATER; Navigazione Avanzata +3%/livello, max +15% = 6,90 tile/h. |
| Ownership cap | Nessun cap; stack 64-bit. |
| Coda | 1 coda navale dedicata per Porto; non usa le 2 code costruzione. |
| Combat | La nave non combatte, non ha ATK/DEF/HP competitivo e non viene scelta come casualty terrestre. |
| Risorse | Non trasporta risorse. |
| Marcia | Una flotta conta come 1 delle 5 outgoing del settlement di origine. |
| Sorveglianza | Entrare in WATER_SURVEILLANCE straniera genera NAVAL_FLEET_DETECTED; nessun combat/rallentamento/blocco. Vedi §31.1. [v3.7: funzione navale DISABLED; nessuna emissione di nuovi allarmi. I campi descritti sono storico.] |

| Porto Lv | Capacita base per nave | Con ricerca Capacita Navi V (+25%) |
| --- | --- | --- |
| 15-19 | 1.000 soldati | 1.250 |
| 20-24 | 5.000 | 6.250 |
| 25-29 | 10.000 | 12.500 |
| 30 | 20.000 | 25.000 |

Capacita flotta = somma capacita navi, ma soldati imbarcati <= normale cap singola marcia della Sala di Guerra. Le navi non bypassano la War Hall.

Imbarco e sbarco solo Porto->Porto. Nessuna costa generica.

Una flotta puo targettizzare un Porto proprio/alleato per trasferimento oppure un settlement nemico/neutrale con Porto operativo per assalto. Le navi non combattono: sbarcano le truppe, poi il normale battle resolver terrestre decide.

Dopo un Rinforzo, le truppe restano e le navi tornano vuote; dopo Attack/Raid, i superstiti tornano con le navi; dopo Conquista riuscita, le truppe superstiti restano nel nuovo settlement e le navi tornano vuote.

Ownership target e diplomazia sono rivalidate all arrivo. Se il Porto origine non e piu proprio al ritorno, la flotta rientra al Porto proprio piu vicino; se non esiste alcun Porto proprio, le navi vengono perse.

Le isole sono realmente separate: i Player isolani giocano localmente fino allo sblocco navale; il World garantisce piu port_eligible settlement per isola.

## 12. Santuario Mitico e Unicorno - ACTIVE

DECISIONE MITICA CONSOLIDATA; L Unicorno non e piu FUTURE. E un potere endgame unico per Player, costoso e consumabile. Crea un Ponte Arcobaleno visibile e spettacolare che porta istantaneamente una normale formazione militare su un settlement Player nemico. Se la battaglia viene vinta, il settlement cambia owner immediatamente; se viene persa, il target non cambia owner. L Unicorno viene consumato in entrambi i casi.

### 12.1 Santuario Mitico player-wide

| Lv | G | W | C | I | Au | Tempo | Effetto |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 500.000 | 600.000 | 600.000 | 500.000 | 100.000 | 2 gg | Sblocca fondamenta e slot mitico |
| 2 | 900.000 | 1.100.000 | 1.100.000 | 900.000 | 200.000 | 3 gg | Stabilizza il Nexus Arcobaleno |
| 3 | 1.400.000 | 1.700.000 | 1.700.000 | 1.400.000 | 300.000 | 5 gg | Amplifica portata mitica |
| 4 | 2.000.000 | 2.400.000 | 2.400.000 | 2.000.000 | 450.000 | 7 gg | Prepara il rituale di evocazione |
| 5 | 2.600.000 | 3.000.000 | 3.000.000 | 2.600.000 | 650.000 | 10 gg | Sblocca 1 Unicorno player-wide |

Il Santuario e unico per Player nel World, non per settlement. E visualizzato nella Madre corrente e la sua progressione segue la successione Madre; non viene catturato dal conquistatore.

Requisiti: almeno una propria Metropoli Lv30, Universita Lv30, ricerca Studi Mitici completata.

Santuario Lv5 consente di creare al massimo 1 Unicorno ACTIVE/QUEUED/IN_FLIGHT per Player.

Costo Unicorno: G 2.800.000 | W 2.800.000 | C 2.800.000 | I 2.500.000 | Au 600.000; tempo evocazione 7 giorni.

Dopo il consumo dell Unicorno parte cooldown esatto 720 ore (30 giorni). Un nuovo Unicorno non puo essere messo in coda prima della scadenza.

Rubini NON possono completare Santuario, evocazione Unicorno o cooldown.

### 12.2 Ponte Arcobaleno: sequenza atomica

Il Player seleziona un proprio settlement di origine, un target Player nemico e una formazione che rispetta il normale cap War Hall. Il potere non targettizza neutrali, Piramide, Sentinelle, Carovane o flotte.

Pre-validazione: PvP unlocked per entrambi, target attackable secondo diplomazia/war, attacker <20 settlement includendo reservation, Unicorno disponibile, nessuna duplicate idempotency key.

Il Ponte Arcobaleno bypassa distanza, WATER, montagne e percorso Sentinelle e arriva direttamente al settlement. E una eccezione mitica esplicita.

Animazione: rainbow trail e cinematic spettacolare, skippabile, durata evento 10 secondi; target riceve alert immediato. I 10 secondi non sono tempo di viaggio e non possono essere accelerati.

All execute_at il server rivalida ownership, diplomazia, cap20 e target state. Se la validazione fallisce prima della battaglia, azione annullata, truppe restano, Unicorno NON consumato.

Quando il battle resolver inizia, l Unicorno viene consumato e parte il cooldown 720h. La battaglia usa Mura, terreno, research, specializzazione, Leggendari e RNG normali.

Se attacker perde: tutte le normali perdite e wall damage restano, ma Loyalty non viene ridotta e owner non cambia.

Se attacker vince: owner cambia immediatamente, senza Fedelta e senza Carro. Si applicano retention 85%, successione Madre/eliminazione e cap20. E questa l unica eccezione al percorso standard di conquista.

L Unicorno non e una unita combattente e non conta nel limite "1 Leggendario per marcia"; puo accompagnare una formazione che contiene al massimo 1 Leggendario.

## 13. Marce, pathfinding, Carovane e ETA

| Tipo | Target | Effetto / vincolo |
| --- | --- | --- |
| Rinforzo | Proprio/alleato | Trasferisce truppe; richiamo reale. |
| Attacco | Nemico/neutrale | Battaglia; nessun cambio owner. |
| Raid | Nemico/neutrale | Battaglia + loot entro cargo. |
| Conquista neutrale | Neutrale | Se vince: cambio owner immediato; NO Loyalty, NO Carro. |
| Conquista PvP | Player | Battaglia + Loyalty; Carro solo sul final owner change. |
| Presidio/Richiamo Sentinella | Sentinella propria | Marcia reale; viaggio conta nelle 5. |
| Carovana | Proprio/alleato | Risorse; max 1 in uscita per settlement; conta nelle 5. |
| Intercetta Carovana | Carovana rilevata | Combatte scorta e ruba carico. |
| Ricognizione | Target/area | Intelligence; Falco migliora precisione. |
| Trasporto navale | Porto | Soldati Porto-Porto; nave non combatte. |
| Ponte Arcobaleno | Settlement Player nemico | Speciale Unicorno; 10s evento; regole cap12. |

FORMULA ETA; ETA_s = max(60, 3600 x SUM(costo_tile x costo_diagonale x modificatore_territorio) / velocita_effettiva_formazione). Diagonale = sqrt(2). Territorio proprio/alleato x0,90. Velocita formazione = unita piu lenta x (1+bonus ricerca), cap ricerca +50%. Snapshot alla partenza.

| Sistema | Regola |
| --- | --- |
| Carovana chassis speed | 3,00 tile/h. |
| Carovana con scorta | Velocita = min(3,00; velocita unita di scorta piu lenta) x bonus logistici. |
| Cap delivery Magazzino | Solo spazio libero; eccedenza resta sulla Carovana e ritorna al mittente. |
| Marce outgoing | 5 per settlement; Carovana inclusa. |
| Revalidation | Target owner/diplomazia/cap rivalidati all arrivo; niente outcome congelato alla partenza. |

## 14. Territorio, Sentinelle e confini

| Elemento | Regola CONSOLIDATA |
| --- | --- |
| Base settlement | Anchor + fino a 4 cardinali validi. |
| Anello interno | 4 Sentinelle N/E/S/O; radius baseline 3; Comando Sentinelle Lv3. |
| Anello esterno | 8 N/NE/E/SE/S/SO/O/NO; radius baseline 5; Perimetro Avanzato. |
| Natural Boundary | Solo WATER realmente non attraversabile o fuori mappa puo sostituire la Sentinella fisica. Montagna NO. |
| Stesso Player | INTERNAL_SHARED_BORDER; territori uniti, nessun muro/sentinella interna. |
| Stessa Alleanza | ALLIED_SHARED_BORDER; owner separati; facing sentinel shared_dormant. |
| Fine rapporto alleato | 12h stabilizzazione: nessun attacco attraversa quel bordo, presidio possibile con marcia reale. |
| Perdita Sentinella | Presidio annientato o rimosso: settore aperto subito, struttura senza mura ne riparazione. Dopo 24h consecutive senza presidio scompare; ripresidio prima del termine gratuito. |
| Percorso PvP normale | Una esterna -> una interna -> settlement; non serve distruggere tutte. |
| Muraglia del Regno | Solo rendering del perimetro territory_tiles; nessun HP/DEF/breach competitivo. |
| WATER_SURVEILLANCE [v3.7: funzione navale DISABLED; nessuna emissione di nuovi allarmi. I campi descritti sono storico.] | DISABLED v3.7. Acqua senza sentinelle fisiche e senza sorveglianza navale passiva. |
| Ingresso flotta straniera | Nessun allarme navale. Navi solo trasporto, senza HP o combattimento. Restano i controlli allo sbarco. |

## 15. Mura dell Insediamento: formula completa

| Lv | Bonus DEF % | HP base | Danno diretto base |
| --- | --- | --- | --- |
| 1 | 1 | 1.000 | 5 |
| 2 | 2 | 4.595 | 20 |
| 3 | 3 | 11.212 | 45 |
| 4 | 4 | 21.112 | 80 |
| 5 | 5 | 34.493 | 125 |
| 6 | 6 | 51.515 | 180 |
| 7 | 7 | 72.313 | 245 |
| 8 | 8 | 97.006 | 320 |
| 9 | 9 | 125.699 | 405 |
| 10 | 10 | 158.489 | 500 |
| 11 | 11 | 195.463 | 605 |
| 12 | 12 | 236.700 | 720 |
| 13 | 13 | 282.277 | 845 |
| 14 | 14 | 332.263 | 980 |
| 15 | 15 | 386.724 | 1.125 |
| 16 | 16 | 445.722 | 1.280 |
| 17 | 17 | 509.316 | 1.445 |
| 18 | 18 | 577.563 | 1.620 |
| 19 | 19 | 650.516 | 1.805 |
| 20 | 20 | 728.226 | 2.000 |
| 21 | 23 | 810.742 | 2.205 |
| 22 | 26 | 898.111 | 2.420 |
| 23 | 29 | 990.379 | 2.645 |
| 24 | 32 | 1.087.589 | 2.880 |
| 25 | 35 | 1.189.784 | 3.125 |
| 26 | 38 | 1.297.004 | 3.380 |
| 27 | 41 | 1.409.290 | 3.645 |
| 28 | 44 | 1.526.679 | 3.920 |
| 29 | 47 | 1.649.209 | 4.205 |
| 30 | 50 | 1.776.915 | 4.500 |

FORMULE MURA; HP_base(L) = round(1000 x L^2,2). Bonus DEF = L% per L1-20; da L21 = 20 + 3 x (L-20)%. Danno diretto = 5 x L^2. Research e cap globali si applicano dopo la base. Bonus Mura totale da research/buff non supera +75% oltre la base.

Wall HP e persistente; non si resetta fra attacchi.

Riparazione manuale: usa risorse, tempo e una delle 2 code costruzione; ricerca Riparazione Mura accelera soltanto la riparazione manuale.

Dopo una conquista parte AUTO_REPAIR_POST_CONQUEST: +5% del nuovo max_hp ogni ora esatta, gratuito, a partire da conquered_at+1h, fino a full. Research non modifica questo 5%.

Riparazione manuale e auto-repair possono coesistere. Il job manuale fotografa gli HP selezionati all avvio; eventuale quota gia riparata dall auto-repair prima del completamento non genera rimborso. current_hp e sempre clamp <= max_hp.

La Muraglia territoriale e un sistema visivo diverso e non condivide HP.

Riparazione manuale: il Player seleziona una quota di missing_hp. Per Mura L1 il riferimento e G240/W480/C540/I300/Au30 e 36 min; da L2 in poi il riferimento e il costo/tempo dell upgrade Mura del livello corrente derivato dalla curva comune. Costo = ceil(0,50 x repair_fraction x reference_cost) per risorsa. Base time = max(5 min, ceil(0,25 x repair_fraction x reference_time)). Wall Repair I+II danno +5% throughput/livello, max +50%; effective_time = ceil(base_time/(1+bonus)). Nessun healing prima del job completion.

## 16. Combat resolver CONSOLIDATA

ORDINE DI RISOLUZIONE; 1) snapshot/revalidation; 2) siege wall damage; 3) wall static casualties; 4) power calculation + terrain/wall/research/counter; 5) seeded RNG +/-5%; 6) winner/loser; 7) winner casualties; 8) report; 9) eventuale Loyalty/conquest. Nessun client calcola l outcome.

### 16.1 Potenza

Per ciascun lato e stack i contro il roster avversario: enemy_weight_j = count_j / total_enemy_count. counter_factor_i = SUM(enemy_weight_j x multiplier_i,j), usando 1,00 dove non esiste un counter specifico. Il contributo dello stack e:

FORMULA POWER; Attacker stack power = count x (0,70 x ATK x counter_factor + 0,30 x HP). Defender stack power = count x (0,70 x DEF x counter_factor + 0,30 x HP). Poi si applicano research, specializzazione, terreno, Mura, Leggendari e debuff, sempre con cap definiti.

Leone: +25% alla componente ATK se il numero totale unita nemiche e >=2x il numero totale del proprio lato.

Orso: wall_damage 40/unita e riduce bonus DEF + danno statico Mura di 1% ogni 100 Orsi, cap -25%.

Elefante: +20% ATK contro Fanteria; wall_damage 80/unita; resta Beast e subisce counter Arcieri.

Drago: wall_damage 150.000 e +30% ATK contro Beast.

Angelo: dopo il casualty calculation riduce perdite alleate del 15%; cap globale riduzione perdite 25%.

Demone: lato nemico -12% DEF e -8% ATK; cap debuff categoria -25%.

Lupo: -1% ATK nemico ogni 100, cap15%; quando il lato Lupo difende, cap20%.

### 16.2 Mura e casualty allocation

Prima del combat power, Catapulte/Orsi/Elefanti/Drago infliggono wall_damage. current_wall_hp = max(0, current_hp - structural_damage).

Wall DEF bonus e static damage sono moltiplicati per wall_integrity = current_hp/max_hp dopo il structural damage.

Il wall static damage viene convertito in casualties sugli attaccanti proporzionalmente a count_i / HP_i; remainder deterministico all id stack. Se elimina tutti, attacco fallisce senza fase esercito.

RNG: un seed server-side produce un moltiplicatore uniforme indipendente per ciascun lato in [0,95;1,05]. Il seed e salvato nel Battle Report.

Perdente: tutte le unita del lato vengono eliminate.

Vincitore: winner_loss_fraction = min(0,95; 0,72 x (loser_power / winner_power)^0,85). total_winner_casualties = floor(total_winner_units x fraction), poi eventuale Angelo. Distribuzione proporzionale a count_i / HP_i, remainder deterministico. winner_min_losses = 0.

## 17. Conquista, Fedelta, Carro e simultaneita

| Caso | Regola |
| --- | --- |
| Neutrale | Una marcia CONQUISTA che vince trasferisce owner immediatamente. Nessuna Fedelta e nessun Carro. Retention 85%. |
| Player | Fedelta iniziale 100. Ogni assalto CONQUISTA vinto: -20 punti base +1 per livello Pressione sulla Fedelta, max -30. |
| Recovery | Dopo 15h consecutive senza assalto Conquista valido: +10 Fedelta/ora, max100. Ogni nuovo assalto valido resetta il delay. |
| Carro | Non serve a ogni hit Loyalty. Serve, deve sopravvivere ed essere valido nell assalto che esegue il cambio owner PvP. |
| Cap20 | Owned + reservation di Conquista con Carro non puo superare20. Check alla partenza e check atomico finale. |
| 5% anti-token | La difesa numerica <5% degli attaccanti non crea un gate artificiale al cambio owner; il battle resolver resta sempre autoritativo e nessuna perdita viene inventata. |
| Unicorno | Unica eccezione: vittoria Ponte Arcobaleno cambia owner senza Loyalty/Carro. |

### 17.1 Assedio condiviso Alleanza

COLLABORAZIONE CONSOLIDATA; La Fedelta appartiene al settlement target, non al singolo attaccante. In una campagna di Alleanza, TUTTI i membri legalmente autorizzati possono vincere assalti Conquista e abbassare la stessa Fedelta. Non esiste un beneficiario bloccato in anticipo.

Ogni hit salva campaign_id, alliance_id e contributor_player_id.

Quando Loyalty <=0, il primo successivo/contestuale assalto valido che vince con un Carro sopravvissuto puo cambiare owner.

Owner finale = Player proprietario del Carro nell assalto atomico che committa il cambio owner. Deve avere slot cap disponibile. Se non lo ha, il cambio owner non avviene e Loyalty resta 0 per consentire a un altro alleato di completare.

Due final assault simultanei sono serializzati sul settlement: il primo commit valido vince; il secondo rivalida il nuovo owner e non duplica la conquista.

Assalti di Alleanze rivali possono tecnicamente ridurre la stessa Loyalty globale; nessuna istanza separata della Fedelta. Questo rende il target realmente contendibile.

### 17.2 Retention 85% e cambio owner

settlement.level = max(1, floor(old_level x0,85)).

building.level = min(new_settlement_level, max(1, floor(old_building_level x0,85))) per edificio esistente.

Risorse = floor(old_amount x0,85).

Ricerche locali: calcolare total research level-points completati, target=floor(total x0,85); rimuovere un livello alla volta partendo dai nodi piu profondi/avanzati, poi completion timestamp piu recente, finche target raggiunto, mantenendo sempre il DAG valido.

Code costruzione/ricerca/reclutamento cancellate. 30% dei costi snapshot non consumati viene rimborsato alla Mother del vecchio owner se esiste; se eliminato, nessun rimborso World.

Wall max_hp ricalcolato sul nuovo livello Mura; current_hp = min(current_hp pre-conquista, new_max_hp); poi auto-repair 5%/h.

Truppe non cambiano proprietario. Il lato sconfitto e gia annientato dal combat; eventuali marce fuori settlement restano del vecchio Player se non eliminato.

## 18. Successione Madre, eliminazione e inattivita

| Evento | Comportamento |
| --- | --- |
| Mother conquistata con secondari | Promuovi secondo development_score; tie founded_at piu vecchio, poi settlement_id. |
| Mother conquistata senza secondari | Elimina Player dal World; Casata marcata ELIMINATED; outgoing armies disbanded atomicamente; storico resta Chronicle. |
| Player eliminato | Non puo ricominciare nello stesso World; puo entrare in altro World con nuova Casata world-scoped; wallet Rubini account-level resta. |
| Inattivita 120 giorni | Richiama rinforzi alleati; dissolve truppe proprietario; cancella code; risorse al50%; tutti settlement diventano neutrali; operazione idempotente. |
| Slot ingresso | Non si riapre dopo inattivita/eliminazione; World maturo non riceve newbie di rimpiazzo. |

## 19. Alleanze, PNA, guerre e Mercenari

| Tipo | Cap | Funzioni |
| --- | --- | --- |
| Lupo Solitario | 1 Player | PvE/PvP personale, commercio; niente Piramide/tesoreria/assedio condiviso. |
| Alleanza Mercenaria | 5 Player | Contratti, supporti, guerre target; Smeraldi; niente Piramide. |
| Alleanza Strutturata | 100 membri | Chat, supporti, ruoli, tesoreria, PNA, guerre, assedi condivisi, Piramide. |

| Regola | CONSOLIDATA |
| --- | --- |
| Ruoli | Leader, Vice, Diplomatico, Membro. |
| PNA | Durata indefinita. Recesso normale con preavviso 12h; nessun attacco durante preavviso. Contratto mercenario accettato rompe PNA col target immediatamente e senza penalita. |
| Guerra normale | Voto 12h tra Leader/Vice/Diplomatici; maggioranza semplice aventi diritto; appena maggioranza matematica raggiunta, guerra parte. Parita/fallimento = no guerra. |
| Leave | Richiesta effettiva dopo 12h. Se l Alleanza e in guerra, ex membro resta war-involved 72h e non puo entrare in altra Alleanza per72h; altrimenti cooldown join24h. |
| Successione Leader | Vice con anzianita maggiore; poi membro con anzianita maggiore; se nessuno, dissolve. |
| Shared border | Rottura relazione ->12h stabilizzazione come cap14. |
| Treasury privacy | Saldo/ledger Smeraldi solo membri autorizzati; DTO pubblico non espone tesoreria. |

### 19.1 Contratti Mercenari

| Voce | Regola |
| --- | --- |
| Durate selezionabili | 72 / 96 / 120 / 168 ore. |
| Max contratti attivi | 3 per Alleanza Mercenaria. |
| Pagamento | Smeraldi in escrow all accettazione; 100% compenso finale alla tesoreria Smeraldi Mercenaria. Nessun payout individuale, nessun Rubino. |
| Effetto accettazione | Auto-war sul target; lock minimo72h; PNA target rotto senza penalty. |
| Bonus | Solo vs target e durante contratto: +5% capacita singola marcia, +3% ATK; snapshot alla partenza. |
| Prestigio Mercenario | 0 iniziale; +10 per contratto completato positivamente; feedback auditato. |

## 20. Casata world-scoped

NESSUNA CASATA MULTI-WORLD; Ogni World ha i suoi Player e le sue Casate. Nome, motto, stemma, prestigio, storia e achievement NON si trasferiscono ad altri World. Solo il wallet Rubini rimane account-level.

| Campo | Regola |
| --- | --- |
| Identita | 1 Casata per Player per World; nome unico nel World; motto, descrizione, stemma a layer, stendardo. |
| Layer stemma | Forma scudo, campo, colori, simbolo, bordo, corona/elmo, supporti, motto. |
| Prestigio | Storico, non diminuisce per perdita settlement. |
| Visibilita | Settlement, marce, report, profilo, Chronicle; banner Alleanza distinto. |
| Membership | Casata NON ha membri/founder/max_members: il Player e la Casata 1:1. |

| Evento prestigio | Punti |
| --- | --- |
| Missione Pattuglia / Ricognizione | +10 |
| Missione Scorta | +15 |
| Caccia Predoni | +25 |
| Spedizione Confine | +40 |
| Conquista neutrale | +5 |
| Conquista settlement Player | +25 |
| Difesa PvP riuscita | +10 |
| Vittoria battaglia PvP | +2 |
| Piramide: partecipazione ciclo | +50 |
| Piramide: Alleanza vincitrice | +250 |

## 21. Piramide endgame ciclica

POSIZIONE E CICLO; Piramide enorme e fissa al centro logico della mappa: anchor (200,200), footprint visuale 15x15 su piattaforma riservata. Primo evento al giorno 90. Dopo un vincitore: 14 giorni reward lock, poi 30 giorni DORMANT, poi nuovo evento. Ciclo infinito.

| Stato | Durata/trigger | Comportamento |
| --- | --- | --- |
| DORMANT_INITIAL | World day0 -> day90 | Non attaccabile. Click mostra countdown esatto a opened_at+90d. |
| OPEN | Da day90 o dopo dormancy | Structured Alliances possono contestare. Serve controllo continuo7 giorni. Cambio owner resetta timer. |
| REWARD_LOCK | 14 giorni dal completamento hold | Piramide non attaccabile; vincitore riceve bonus14d. |
| DORMANT | 30 giorni dopo reward | Non attaccabile; click countdown alla prossima OPEN. |
| OPEN successiva | Alla fine dei30d | Nuovo guard snapshot, nessun vantaggio permanente di controllo precedente. |

| Parametro | Regola |
| --- | --- |
| Eligible | Solo Alleanza Strutturata. |
| Diplomazia evento | Pyramid combat e legalizzato dall evento fra Alleanze Structured e NON crea/break PNA o guerra generale. |
| Hold | 7 giorni = 168h continue. |
| Garrison cap | 1.000.000 unita alliance-wide nella Piramide. |
| Guardian apertura | Power target = clamp(250.000, 10 x mediana max_legal_march_power dei top10 Player per development_score, 1.500.000). Snapshot a ogni OPEN; composizione 45% Fanteria/35% Arciere/20% Cavalleria. |
| Owner cambia | Timer hold torna a0. |
| Alliance dissolve durante hold | Piramide neutralizzata, timer0. |
| Reward | +8% produzione, +5% ricerca, +5% addestramento, +10% cap carovane, titolo + araldica. Nessun ATK/DEF. |
| Reward stacking | Non stacka. Un futuro nuovo premio rinnova solo la propria nuova finestra. |
| Dissoluzione dopo vittoria | I membri presenti nell award snapshot mantengono il reward personale/economico per il residuo dei14d; il titolo Alliance viene archiviato nella Chronicle. |
| Unicorno | Non puo targettizzare Piramide. |

## 22. Missioni, achievement, Chronicle e notifiche

| Missione | Durata | Requisito | Reward esatto | Cooldown |
| --- | --- | --- | --- | --- |
| Pattuglia locale | 1h | 100 Fanteria/Arciere | 0,25h produzione locale delle 5 risorse +10 prestigio | 2h |
| Scorta commerciale | 4h | 500 unita | 1h produzione locale + ulteriore 1h produzione Oro +15 prestigio | 8h |
| Caccia ai predoni | 8h | 1.000 unita miste | 2,5h produzione locale +25 prestigio; nessun achievement orfano | 16h |
| Spedizione di confine | 12h | 2.000 unita | 5h produzione locale +40 prestigio; 10% seeded chance token cosmetico, altrimenti +20 prestigio | 24h |
| Ricognizione distante | 4h | >=1 Falco + intelligence.observation_1 Lv1+ | Intelligence snapshot + mission progress +10 prestigio | 8h |

Massimo 2 missioni personali simultanee per Player.

Le truppe restano indisponibili per tutta la durata; le missioni base non generano casualty random.

Reward accreditato automaticamente exactly-once alla conclusione; nessun pulsante claim necessario.

Chronicle e narrativa e permanente per il World, ma non e source of truth gameplay.

Battle Report, notifiche e inbox sono persistenti: il push realtime puo mancare, il record DB no.

| Achievement | Soglie |
| --- | --- |
| Uccisioni | 1k / 10k / 100k / 1M / 10M |
| Difese riuscite | 1 / 10 / 50 / 200 / 1000 |
| Conquiste | 1 / 3 / 10 / 25 / 100 |
| Supporti | 10k / 100k / 1M / 10M / 100M truppe |
| Territorio | 50 / 250 / 1k / 5k / 20k tile |
| Carovane intercettate | 1 / 10 / 50 / 250 / 1000 |
| Piramide | Partecipazione/vittoria storica |

## 23. Rubini e monetizzazione ACTIVE ma vincolata

SCELTA COMMERCIALE CONSOLIDATA; I Rubini possono completare istantaneamente un elemento GIA AVVIATO di costruzione, ricerca o reclutamento normale. Il costo e volutamente alto e proporzionale al tempo residuo. Non comprano risorse mancanti e non comprano direttamente un outcome di battaglia.

| Uso | Costo Rubini | Vincoli |
| --- | --- | --- |
| Completamento costruzione | max(100, ceil(minuti_residui x 3,0)) | Completa solo l item di coda selezionato; risorse gia pagate. |
| Completamento ricerca | max(150, ceil(minuti_residui x 4,0)) | Completa solo il research job selezionato. |
| Completamento reclutamento | max(100, ceil(minuti_residui x 2,5)) | Solo Fanteria/Arciere/Cavalleria/Catapulta/Bestie incluso Elefante; batch selezionato. |
| Cambio specializzazione | 2.500 Rubini | Cooldown7d; bloccato guerra/assedio/marce militari. |
| Cosmetica / rename | Prezzo catalogo versionato | Nessun gameplay effect. |

Premium completion vietato per Carro di Conquista, Drago/Angelo/Demone, Santuario Mitico, Unicorno e cooldown Unicorno.

Premium completion vietato in un settlement con siege ACTIVE o incoming hostile military march ETA <=60 min. Questo impedisce difesa wallet reattiva all ultimo minuto.

Rubini NON riparano Mura, NON ripristinano Fedelta, NON accelerano marce, NON alterano Pyramid hold, NON comprano territory/Sentinelle e NON cambiano outcome combat.

Ogni transazione salva provider_transaction_id, idempotency_key, policy_version, world_id, price_rubies, effect_snapshot e result. Retry idempotente.

Il wallet Rubini e account-level; l effetto comprato e sempre applicato a un world_id/entita esplicita.

### 23.1 Cancellazione code - refund CONSOLIDATA

| Job | Cancel | Refund |
| --- | --- | --- |
| Costruzione / settlement upgrade | Consentito finche non completato | 70% delle risorse snapshot pagate; 0 Rubini. |
| Ricerca | Consentito finche non completata | 70% delle risorse snapshot; nessun livello parziale. |
| Reclutamento | Consentito sui batch non completati | 70% costo delle unita ancora non prodotte; unita gia prodotte restano. |
| Navi | Come reclutamento | 70% costo delle navi non prodotte. |
| Marcia | Non cancel istantaneo | Recall crea viaggio di ritorno reale; nessun teleport. |

### 23.2 Smeraldi - fonti baseline

| Evento | Smeraldi treasury |
| --- | --- |
| Prima missione personale completata da ciascun membro ogni giorno | +5 alla propria Alleanza Strutturata; max 500/giorno per Alleanza. |
| Difesa PvP riuscita di un membro | +10 |
| Conquista settlement Player | +25 |
| Partecipazione valida a ciclo Piramide | +500 una volta per ciclo |
| Vittoria Piramide | +2.000 |
| Contratto Mercenario | Compenso di mercato: offerta 1.000-1.000.000 Smeraldi in escrow; a scadenza normale 100% trasferito alla tesoreria Mercenaria. |

## 24. Architettura tecnica non negoziabile

| Layer | Regola |
| --- | --- |
| Client mobile | React Native + TypeScript + Expo. Android mobile-first; nessuna authority competitiva. |
| Backend | FastAPI + MongoDB nuova base pulita; Domain Services per regole. |
| World isolation | world_id su ogni record competitivo e in ogni query/indice. |
| Map API | Chunk/viewport + buffer; chunk logical size32x32; mai full-world endpoint. |
| Config | YAML/JSON baseline per modulo + override Mongo versionati/effective_at/audit. Una chiave competitiva = una fonte. |
| Events | scheduled_events persistenti; atomic claim, lease, retry, idempotent domain effect. |
| Snapshots | Build/research/recruit/march/premium action congelano config rilevante all avvio. |
| DTO | Pydantic/OpenAPI -> tipi TS generati. Collections sempre []; public DTO separato owner/private. |
| Realtime | Realtime socket/SSE solo push. DB source of truth; reconnect con missed-event recovery. |
| Counts | 64-bit integer per truppe, risorse e valute. |
| Time | UTC DB/API; local timezone solo UI. |
| Security | No secret nel repo/client; rate limit; audit; anti-replay; backup+restore testato. |

### 24.1 Exactly-once reale

CRASH WINDOW; Una unique effect_key da sola NON garantisce exactly-once se il processo applica l effetto e muore prima di inserire il ledger. Ogni scheduled effect competitivo deve usare una transazione atomica quando disponibile oppure una reservation/state-machine idempotente in cui la domain mutation e il marker di completamento sono committati insieme.

## 25. DTO, errori, cache e report

ApiError obbligatorio: code stabile, message, details {}, retryable, trace_id.

Collection response sempre array; mai null/missing per liste.

Public vs Owner/Admin DTO separati: treasury, dettagli intelligence e informazioni private non vengono filtrati solo dal frontend.

Battle Report atomico col battle effect: battle_id, seed, input snapshot, modifiers, casualties, survivors, wall damage, terrain, campaign_id, loyalty change e ownership result.

Cache stale marker: castle_not_found/ownership mismatch invalida marker e chunk; niente target fantasma.

Chunk mancante: placeholder controllato + retry/backoff; non mostrare vuoto infinito o oggetti senza tile validata.

## 28. QA, simulator e release gates

| Livello test | Obbligatorio |
| --- | --- |
| Unit | Formule pure: economy, wall, combat, research costs, ETA, retention. |
| Contract | OpenAPI snapshot; [] collections; ApiError; public/private DTO. |
| Integration | Mongo + config reale + scheduler + idempotency; niente mock che nasconde runtime. |
| Invariant | 0 settlement WATER; 100 player slots;800 neutrali; cap20; no territory overlap; no orphan research; no negative resources. Naval surveillance water never counts as land/territory score. |
| Concurrency | Simultaneous conquest, double purchase, double event, world creation, alliance votes. |
| Playwright | Onboarding -> neutral capture -> build/research/recruit -> march -> report -> alliance -> siege -> navy -> Pyramid; multi-account. Include hostile fleet detection + reconnect inbox. |
| Visual regression | Map LOD, castle growth, Pyramid, Unicorn rainbow, responsive mobile/desktop. |
| Simulator | 100-player full validation su 400x400. Stress 400 bot separato. Clock injectable x1/x10/x50, mai manipolare timestamp di produzione direttamente. |

### 28.1 Gate release CONSOLIDATA

0 P0/P1 aperti.

0 invariant violation su 100-player simulation.

0 settlement su WATER dopo world creation, fixture, migration e 30 giorni simulati.

99,9% scheduled event completati entro SLA simulato; nessun duplicate effect.

Battle reports 1:1 con battle commits.

Backup -> restore -> smoke test PASS.

Mobile e desktop E2E passano.

Ogni B01-B17 ha stato SPECIFICATO/IMPLEMENTATO/TEST/E2E; APPROVED e manuale.

## 29. Edge-case matrix - comportamento deterministico

| Caso | Regola CONSOLIDATA |
| --- | --- |
| Due click upgrade | Idempotency key: un solo job e una sola spesa. |
| Server down a execute_at | Worker esegue evento scaduto al restart; snapshot originale. |
| Due Carri finali stesso istante | Lock/transaction settlement; primo commit valido cambia owner; secondo rivalida. |
| 19 settlement + 2 Conquista con Carro | Seconda partenza bloccata da owned+reservations cap20. |
| Cap20 raggiunto mentre Carro viaggia | Final revalidation: no owner change; Loyalty resta; truppe rientrano. |
| Carro muore ma Loyalty <=0 | Nessun owner change. |
| Neutral conquest senza Carro | Consentita se march_type=CONQUEST e attacker vince. |
| Target cambia owner in viaggio | Rivalida all arrivo e converte/fallisce secondo nuova diplomazia; mai attacco fantasma. |
| Mother cade e nessun secondario | Eliminazione World atomica. |
| Mother cade con tie score | founded_at piu vecchio, poi id min. |
| Settlement catturato con queue attive | Queue cancel; 30% snapshot refund alla vecchia Mother se esiste. |
| Mura 0 HP dopo conquista | +5% max_hp ogni ora; full in20 tick senza manual repair. |
| Alliance membri diversi colpiscono Loyalty | Stessa Loyalty target/campaign; contributi auditati. |
| Rival Alliance fa hit Loyalty | Stessa Loyalty globale; nessuna meter privata. |
| Final Carro ally senza slot | No conquest; Loyalty resta0 per altro membro. |
| Difesa token <5% | Battle normale; non crea blocco artificiale owner-change. |
| Unicorno target diventa alleato nei10s | Cancel prima battle; Unicorn non consumato. |
| Unicorno battaglia iniziata poi server crash | State machine effect: consumo, battle e cooldown exactly-once. |
| Unicorno vince Mother finale | Owner change immediato + eliminazione target se nessun secondario. |
| Unicorno attacker cap20 | Azione bloccata pre-start/final revalidation. |
| Nave destinazione cambia owner | Revalidation all arrival. |
| Nave origine persa al ritorno | Nearest owned Port; se nessuno, ships lost. |
| Nessun Porto su isola enemy | Nessun landing diretto: serve un Porto target/proprio/alleato; niente costa generica. |
| Carovana eccede Magazzino | Solo spazio libero consegnato; residuo ritorna. |
| Carovana intercettata due volte | Primo effect chiude route; secondo idempotent no-op. |
| Piramide owner cambia a 167h59m | Hold reset0. |
| Piramide winner al giorno X | Lock14d, poi dormancy30d, poi OPEN. |
| Alleanza dissolve durante hold | Pyramid neutral, timer0. |
| PNA + contratto mercenario | Accept contract rompe PNA target subito, zero penalty, auto-war >=72h. |
| Premium doppio webhook | provider_transaction_id + idempotency: un effetto. |
| Premium durante incoming <=60m | Completion competitiva bloccata. |
| E5 research cost | Sempre <= warehouse Lv30 base; nessun costo impossibile. |
| Building legacy over cap | Frozen: no downgrade, no upgrade finche settlement raggiunge. |
| Player inactivity con rinforzi alleati | Rinforzi ritornano via marcia; poi conversione neutrali. |
| Eliminated slot | Non riapre World admission. |
| Chunk mancante | Placeholder + retry; no invisible world. |
| Map seed non trova100 slot | Reject seed, non alterare WATER. |
| Pyramid center generato water | Impossibile: center plateau e parte del landmask prima della classification. |
| Player spawn mountain | Legale; movement x2 e defender +20% applicati. |
| Falco/Drago attraversa mare | Solo via Nave; nessun path volo implicito. |
| Legendary home Metropolis persa | UNHOUSED; rebind24h o disband; no launch. |
| Research retention produce orphan | DAG-pruning algorithm rimuove dipendenze avanzate finche valido. |
| Config cambia a meta marcia | Marcia usa snapshot; nuove marce nuova config. |
| World config override effective_at | Azioni iniziate prima restano snapshot; continuous production boundary separa prima/dopo. |
| Rubies wallet global, Casata world | Transazione ha world_id effect; nessun prestige/heraldry cross-world. |
| Flotta entra WATER territorio nemico | NAVAL_FLEET_DETECTED 100%; alert rosso; nessun combat/slow/block. [v3.7: funzione navale DISABLED; nessuna emissione di nuovi allarmi. I campi descritti sono storico.] |
| Flotta attraversa PNA/neutral territory | Avviso giallo; nessuna rottura diplomatica automatica. |
| Flotta passa fra2 settori stesso owner | Nessun duplicate alert; nuovo solo dopo full exit + reentry. |
| Sentinella cade mentre flotta e in sector | WATER_SURVEILLANCE del settore perso rimossa subito; nessun evento retroattivo. [v3.7: funzione navale DISABLED; nessuna emissione di nuovi allarmi. I campi descritti sono storico.] |
| Pyramid con<10 Player attivi | Guardian median usa tutti gli attivi; con0 usa floor250k. |
| Player lascia Alliance durante14d reward | Se era nello snapshot vittoria mantiene residuo; nuovo membro non eredita. |
| Due queue submit stesso producer | Idempotency: un solo job; seconda richiesta no duplicate spend. |
| Due Angeli in difesa | Entrambi contano stats; aura casualty -15% applicata una volta, cap globale25%. |
| Mission reward a Warehouse pieno | Clamped al cap; overflow perso e auditato. |
| Neutralized ex-player Lv>neutral cap | Nessun downgrade; growth automatico sospeso finche cap WorldAge non lo supera. |

## 31. v3.7 REAUDIT - chiusure deterministiche aggiuntive

REAUDIT CONSOLIDATA: un secondo passaggio zero-gap ha cercato riferimenti orfani, scope impliciti, stacking non definito, queue mancanti, edge case navali e condizioni di evento. Le regole seguenti sono normative e prevalgono su formulazioni meno specifiche delle sezioni precedenti.

### 31.1 Sorveglianza navale nel territorio - NAVAL_FLEET_DETECTED [v3.7: funzione navale DISABLED; nessuna emissione di nuovi allarmi. I campi descritti sono storico.]

In v3.7 WATER_SURVEILLANCE e DISABLED. Non esistono Sentinelle fisiche su WATER, ne una rete di allarmi navali passivi. Le tile acqua non danno territorio, score o bonus movimento.

NAVAL_FLEET_DETECTED non viene piu generato. Le navi servono esclusivamente al trasporto: nessun HP, attacco, difesa, intercettazione o combattimento navale. Il combattimento allo sbarco riguarda le truppe e il settlement.

Eventi navali gia persistiti restano soltanto storico. Nessun replay o riconnessione deve crearne di nuovi. Rilevamento terrestre al solo ingresso nel territorio secondo le regole Intelligence; nessun preavviso di due tile inventato.

WATER puo restare un confine naturale geometrico. Non richiede una struttura costruibile, non diventa terra posseduta e non attribuisce sorveglianza navale.

| Relazione flotta | UI difensore | Effetto gameplay |
| --- | --- | --- |
| SELF / ALLY | Visibile sulla mappa, nessun allarme ostile | Nessun blocco/combat. |
| PNA / NEUTRAL | Avviso giallo informativo + inbox | Transito consentito; nessuna violazione automatica PNA. |
| AT_WAR / MERCENARY TARGET | Allarme rosso critico + map marker + inbox | Transito consentito; il difensore puo reagire solo a terra/Porto. |

| Effective intel score | Dettaglio deterministico |
| --- | --- |
| 0-9 | event_exists, entry_sector_or_tile, coarse_heading; ETA n/d; truppe n/d |
| 10-24 | event_exists, entry_sector_or_tile, heading, mission_class; ETA +/-30%; truppe n/d |
| 25-39 | march_or_fleet_category, mission_family, size_band; ETA +/-20%; truppe +/-40% |
| 40-54 | mission_family, unit_categories; ETA +/-12%; truppe +/-25% |
| 55-69 | unit_categories, siege_cart_legendary_flags; ETA +/-7%; truppe +/-15% |
| 70-84 | unit_categories, stack_percentage_bands_10pp, siege_cart_legendary_flags; ETA +/-4%; truppe +/-8% |
| 85-100 | unit_categories, near_exact_stack_composition, siege_cart_legendary_flags; ETA +/-2%; truppe +/-3% |

Counterintelligence puo degradare precisione/dettaglio, ma NON puo mai nascondere l esistenza dell evento dopo che la flotta ha attraversato il confine sorvegliato. Inbox DB e source of truth; WebSocket/push sono solo delivery realtime.

### 31.2 Fairness generator, quote regionali e accesso ai Porti

| Regione | Player P/F/M | Neutrali P/F/M | Min port_eligible neutrali | Distribuzione costa |
| --- | --- | --- | --- | --- |
| R0 Continente | 49 / 14 / 7 | 392 / 112 / 56 | 24 | >=8 settori costieri distinti |
| R1 Isola Nord | 7 / 2 / 1 | 56 / 16 / 8 | 8 | >=4 settori costieri distinti |
| R2 Isola Sud-Ovest | 7 / 2 / 1 | 56 / 16 / 8 | 8 | >=4 settori costieri distinti |
| R3 Isola Sud-Est | 7 / 2 / 1 | 56 / 16 / 8 | 8 | >=4 settori costieri distinti |

Le quote sopra sommano esattamente a 100 Player slot e 800 neutrali e impediscono che tutte le partenze montane o tutti i Porti finiscano nella stessa regione.

port_eligible resta immutabile e richiede anchor Plain/Forest + almeno una WATER cardinalmente adiacente. Un settlement su Mountain non puo costruire Porto anche se costiero.

Se il generator non soddisfa quote regionali, minima portualita, distanze, 3 isole, terreno e zero-WATER settlement nello stesso seed, il seed viene rifiutato. Nessuna patch terrain post-hoc.

### 31.3 Research settlement-local: scope e snapshot

| Caso | Regola CONSOLIDATA |
| --- | --- |
| Economia / costruzione / Magazzino | Effetto solo nel settlement che ha completato la ricerca. |
| Recruitment | Usa research locale del producer settlement; snapshot alla creazione del job. |
| Marcia in uscita | Snapshot research dell origin settlement al launch; resta congelato per quella marcia. |
| Difesa garrison proprietario | Usa research corrente del settlement difeso al battle snapshot. |
| Rinforzo alleato | Mantiene research snapshot catturato al launch della marcia di rinforzo fino a recall/distruzione. |
| Trasferimento fra propri settlement | Dopo arrivo, le truppe non portano research permanente: future azioni usano il nuovo origin settlement. |
| Perdita Madre | Research dei settlement sopravvissuti resta intatto; quella della Madre conquistata segue retention85% e non viene copiata sul successore. |
| Player-wide | Specializzazione, Casata e Santuario Mitico non sono research locali. |
| Flotta entra WATER territorio nemico | NAVAL_FLEET_DETECTED 100%; alert rosso; nessun combat/slow/block. [v3.7: funzione navale DISABLED; nessuna emissione di nuovi allarmi. I campi descritti sono storico.] |
| Flotta attraversa PNA/neutral territory | Avviso giallo; nessuna rottura diplomatica automatica. |
| Flotta passa fra2 settori stesso owner | Nessun duplicate alert; nuovo solo dopo full exit + reentry. |
| Sentinella cade mentre flotta e in sector | WATER_SURVEILLANCE del settore perso rimossa subito; nessun evento retroattivo. [v3.7: funzione navale DISABLED; nessuna emissione di nuovi allarmi. I campi descritti sono storico.] |
| Pyramid con<10 Player attivi | Guardian median usa tutti gli attivi; con0 usa floor250k. |
| Player lascia Alliance durante14d reward | Se era nello snapshot vittoria mantiene residuo; nuovo membro non eredita. |
| Due queue submit stesso producer | Idempotency: un solo job; seconda richiesta no duplicate spend. |
| Due Angeli in difesa | Entrambi contano stats; aura casualty -15% applicata una volta, cap globale25%. |
| Mission reward a Warehouse pieno | Clamped al cap; overflow perso e auditato. |
| Neutralized ex-player Lv>neutral cap | Nessun downgrade; growth automatico sospeso finche cap WorldAge non lo supera. |

### 31.4 Code reclutamento e tempi

| Producer | Code | Batch / tempo |
| --- | --- | --- |
| Caserma | 1 dedicata | Cap batch standard = round(50 x 1,18^(L-1)). |
| Scuderia | 1 dedicata | Stesso cap batch standard sul livello Scuderia. |
| Officina | 1 dedicata | Stesso cap batch per Catapulta/Carro; Carro non premium-completable. |
| Bestiario | 1 dedicata | Stesso cap batch per Bestie/Elefante. |
| Tempio | 1 Legendary queue | Drago/Angelo/Demone: 14 giorni esatti ciascuno; no bonus Addestramento/Piramide/Rubini. |
| Porto | 1 Naval queue | Navi secondo §11: tempo nave usa livello Porto; no limite ownership. |
| Santuario Mitico | 2 construction queue della Madre | Ogni upgrade Santuario occupa una normale coda costruzione. |
| Evocazione Unicorno | 1 ritual slot player-wide | 7 giorni fissi; nessun acceleratore. |

Per Fanteria/Arciere/Cavalleria/Catapulta/Carro/Bestie: effective_time = max(1s, base_time x [1/(1+0,04 x (producer_level-1))] / (1 + training_research_bonus + pyramid_training_bonus)). Il job congela costi, quantita, tempo e config all avvio.

### 31.5 Algebra dei modificatori e stacking Leggendari

Regola universale: bonus/debuff percentuali della STESSA categoria si sommano prima e vengono clampati al cap della categoria. Categorie indipendenti si moltiplicano nell ordine CONSOLIDATA; non si compongono silenziosamente livello per livello.

Combat attacker order: base stat -> counter -> research locale -> specializzazione -> mastery/self bonus -> aura positiva -> debuff nemico -> RNG. Defender order: base stat -> counter -> research -> specializzazione -> terreno -> Mura x integrity -> mastery/self bonus -> aura -> debuff -> RNG. RNG e sempre l ultimo moltiplicatore sul side power.

HP: base -> research HP -> mastery -> aura/debuff HP espliciti. Throughput usa divisione per (1+bonus); riduzioni tempo dichiarate usano base x (1-riduzione_clampata). Produzione: bonus percentuali si sommano, cap +60% dove previsto, poi moltiplicano la base.

| Leggendario | Stacking CONSOLIDATA |
| --- | --- |
| Tutti | Ogni copia presente contribuisce con le proprie statistiche unita. Max 1 Leggendario per marcia offensiva/di supporto. |
| Angelo | Aura -15% casualty alleate applicata UNA volta per lato, anche con piu Angeli; cap globale loss-reduction 25%. |
| Demone | Aura -12% DEF / -8% ATK applicata UNA volta per lato; cap categoria debuff -25%. |
| Drago | +30% vs Beast e self-modifier di ciascun Drago. wall_damage150.000 per Drago soltanto quando e sul lato attaccante. |

### 31.6 Transizioni neutrali e reservation Carro

Neutrale conquistato: autonomous growth si ferma immediatamente al cambio owner.

Player inattivo -> neutrale: conserva livelli settlement/building e current Wall HP; risorse al 50%; territory/Sentinelle Player rimossi. La research locale viene congelata (nessun job neutrale) e resta legata al settlement per future retention/conquista. Se il livello e sopra il cap neutrale di WorldAge non viene mai downgraded; i growth tick riprendono soltanto se current_level < cap(WorldAge).

Reservation cap20: una PvP CONQUEST con Carro valido acquisisce atomicamente uno slot reservation al launch. La reservation conta nel cap20 e viene rilasciata su recall completato pre-battle, invalidazione pre-battle, sconfitta, Carro distrutto senza cambio owner, target/diplomazia invalidi oppure convertita atomicamente in owned count al successo.

All arrivo/final commit vengono rivalidati membership/war legality, target owner, Carro sopravvissuto, cap20 e idempotency. Se illegale, nessun owner change.

### 31.7 Piramide: sample, OPEN e reward snapshot

Guardian sample: top10 Player ACTIVE/non-eliminati per development_score. Se sono meno di10 usa tutti quelli disponibili; se sono0 usa direttamente il floor250.000. Formula invariata: clamp(250.000, 10 x mediana(max_legal_march_power(sample)), 1.500.000).

OPEN non ha timeout: resta OPEN finche una Alleanza Strutturata completa168h continue. Il completamento crea membership reward snapshot; membri presenti mantengono il residuo14d anche se lasciano dopo, nuovi membri successivi non ereditano quel reward.

Le scadenze del ciclo usano timestamp scheduled_at persistiti: worker in ritardo non sposta il calendario. hold completion ->14d REWARD_LOCK ->30d DORMANT -> nuovo OPEN.

### 31.8 Missioni e Achievement - nessun riferimento orfano

Ricognizione distante richiede >=1 Falco e intelligence.observation_1 almeno Lv1. La parola generica "scouting" non e piu un prerequisito interpretabile.

Reward equivalenti a produzione rispettano sempre il Magazzino del settlement reward target; overflow oltre hard cap e perso e loggato, mai parcheggiato in una riserva nascosta.

Achievement non danno ATK/DEF/economia: ogni soglia sblocca soltanto decorazione araldica/titolo permanente nel World.

| Track achievement | Reward cosmetico |
| --- | --- |
| Uccisioni | Incisioni d Arma Tier I-V |
| Difese riuscite | Bordo Bastione Tier I-V |
| Conquiste | Corona di Conquista Tier I-V |
| Supporti | Supporti Araldici Tier I-V |
| Territorio | Manto Territoriale Tier I-V; WATER_SURVEILLANCE esclusa dal conteggio [v3.7: funzione navale DISABLED; nessuna emissione di nuovi allarmi. I campi descritti sono storico.] |
| Carovane intercettate | Sigillo del Predone Tier I-V |
| Piramide | Partecipazione: Sigillo Bronzo; vittoria: Sigillo Oro |

### 31.9 Nuovi gate di test v3.7

NAVAL_FLEET_DETECTED: hostile/PNA/neutral/self/ally, dedup, exit+reentry, sector loss, reconnect inbox; detection existence mai soppressa da Counterintelligence. [v3.7: funzione navale DISABLED; nessuna emissione di nuovi allarmi. I campi descritti sono storico.]

Generator: quote P/F/M per ognuna delle4 regioni + min port_eligible per regione + coast-sector diversity; seed reject se fallisce.

Research scope: outgoing snapshot, own defense current, allied reinforcement snapshot, Mother loss retention.

Recruit queue concurrency: una coda per producer; duplicate submit idempotente; Santuario e Unicorn slot corretti.

Modifier algebra golden tests: stesso input/config produce identico power; aura Angelo/Demone non stacka; RNG applicato last.

Pyramid n<10/n=0, OPEN senza timeout, member leave dopo award, worker delayed senza schedule drift.

Mission overflow warehouse e achievement cosmetics; WATER_SURVEILLANCE non incrementa territorio achievement. [v3.7: funzione navale DISABLED; nessuna emissione di nuovi allarmi. I campi descritti sono storico.]

Cap20 reservation lifecycle e final revalidation con alliance/diplomacy change.

## 34. v3.7 STATE-TRANSITION COPERTURA DOCUMENTALE - 42 chiusure normative

Le chiusure STC di questa sezione restano applicabili salvo le modifiche esplicite v3.7. Le nuove regole sulle sentinelle e la disattivazione della sorveglianza navale prevalgono su riferimenti storici. SPEC_HASH 7364a355132a90a522d067fe89bff3cf4cdf9af7b1637360cfc990771f96b500

### 34.1 Autorita spec, costruzioni e Mura

STC-01 - PDF/JSON authority: Bible provides semantics/invariants; CANONICAL_SPEC provides exact runtime numbers. Same version and spec_hash are mandatory; any divergence blocks the build.

STC-02 - Wall repair at level 1: Mura L1 manual-repair reference is 60% of Mura L2 base: G240/W480/C540/I300/Au30 and 36 minutes.

STC-03 - Damaged wall upgrade: Wall upgrade never heals for free; absolute missing HP is preserved across the upgrade.

STC-04 - Manual plus automatic wall repair: Both may overlap; manual job snapshots the selected missing HP and any auto-repaired overlap receives no refund.

STC-05 - Wall repair research: Each level of Wall Repair I/II gives +5% manual-repair throughput; cumulative max +50%; time is ceil(base/(1+bonus)).

STC-06 - Building unlock gates: A later-unlocked building requires both its settlement-level gate and its research gate; losing either leaves a retained building FROZEN_LOCKED.

### 34.2 Raid, Carovane, pathfinding e navigazione

STC-07 - Raid loot: Only RAID steals resources; survivor cargo plus loot-capacity research caps loot; resources are distributed proportionally with deterministic largest remainder.

STC-08 - Caravan model: Caravans are abstract logistic slots, not recruitable unit entities.

STC-09 - Caravan interception: Target a detected caravan; server chooses first reachable intercept point; if none before delivery, reject; normal combat determines escort/interceptor outcome.

STC-10 - Diagonal corner cutting: Land and naval pathfinding forbid diagonal corner cutting through two impassable adjacent cardinals.

STC-11 - Naval assault and Sentinels: Porto-to-Porto bypasses the terrestrial Sentinel path. WATER_SURVEILLANCE is DISABLED in v3.7; no naval detection event is generated.

STC-12 - Ship survival and invalid arrival: Transport ships never die from terrestrial combat; if troops all die they return empty; invalid destination before disembark triggers turnaround without battle.

### 34.3 Combat e counter

STC-13 - Zero power and exact tie: No attackers after wall phase means defense wins; zero defender troops with surviving attackers means attacker wins; exact power tie is defender victory.

STC-14 - Noncombat units alone: ATTACK/RAID/CONQUEST must contain at least one unit with ATK>0; Cart and Falcon cannot initiate battle alone.

STC-15 - Wall static casualties: Wall static-damage pool is distributed deterministically by surviving unit counts; kills use effective HP and overkill is reflowed until pool exhaustion.

STC-16 - Counter matrix: Counter matrix is explicit in CANONICAL_SPEC with default 1.00 and all current canonical exceptions, including Beasts categories.

### 34.4 Conquista, retention e Sentinelle

STC-17 - Loyalty after owner change: Any owner change, including Unicorn, resets settlement Loyalty to 100 and closes prior loyalty campaigns.

STC-18 - Cart reservation terminal release: A conquest reservation releases on every terminal march state without owner change, including victory with Loyalty still above zero.

STC-19 - Unicorn cap20 concurrency: Unicorn acquires a cap20 reservation atomically before battle; failure to reserve means no battle and Unicorn is not consumed.

STC-20 - FROZEN_LOCKED: retained building levels remain stored, but production, bonuses, new jobs and upgrades are unavailable until all existing prerequisites return. No new hidden research gate is introduced.

STC-21 - Retention resources vs Warehouse: After 85% retention, each resource is clamped to new effective Warehouse capacity; overflow is discarded and audited.

STC-22 - Sentinels after conquest: Surviving Sentinel structures transfer empty to new owner; surviving prior/ally garrisons return by real marches; territory recalculates atomically.

### 34.5 World slots, spawn e neutrali

STC-23 - Unused Player-slot reserve: Unclaimed player anchors keep a Chebyshev-radius-4 reservation blocking territory/founding until claimed or World admission closes.

STC-24 - Spawn playability: Every Player slot must have a land path to at least three neutral settlements on the same landmass before navigation; otherwise reject seed.

STC-25 - Neutral recovery tick: Every 72h neutral tick, after possible growth, resets neutral garrison to 100*L^2 and walls to max HP.

STC-26 - Inactive Player to neutral: On conversion, troops dissolve and every resulting neutral gets canonical garrison 100*L^2 immediately; wall HP follows neutral conversion rule.

### 34.6 Intelligence e ricerca Assedio

STC-27 - Intelligence exactness: Detection detail uses deterministic intel_points and fixed error bands; Counterintelligence can reduce detail but never suppress an existing detection event.

STC-28 - Siege research exactness: Cart Resilience=+5% HP/level; Coordination=+2% CONQUEST march cap/level; Advanced Siege=+3% wall_damage/level; Siege Logistics uses explicit capacity-cost formula.

### 34.7 Diplomazia, ruoli e Mercenari

STC-29 - How normal war ends: Normal war is indefinite until bilateral peace; accepted peace enters PEACE_PENDING 12h, blocks new hostile launches, lets in-flight marches resolve, then becomes NEUTRAL.

STC-30 - Alliance role permissions: Leader/Vice/Diplomat/Member permissions are explicit in CANONICAL_SPEC; no endpoint may infer extra permissions.

STC-31 - Mercenary completion: Accepted contract cannot be voluntarily canceled; natural expiry or target dissolution is success; provider dissolution is failure/refund; 100% escrow goes to provider Emerald treasury.

### 34.8 Piramide e Missioni

STC-32 - Pyramid Guardian troop count: Guardian target power converts to N using fixed 45/35/20 Infantry/Archer/Cavalry reference power and deterministic rounding.

STC-33 - Pyramid garrison lifecycle: Winning survivors become garrison; allied real reinforcements allowed to cap; REWARD_LOCK returns living troops; each new OPEN creates a new Guardian snapshot.

STC-34 - Mission origin and concurrency: Player chooses origin; max two total and max one same type; cooldown begins at completion; missions cannot be canceled.

STC-35 - Mission origin conquered: Mission continues; completion routes troops/reward to current Mother or nearest own settlement; eliminated Player gets no reward and troops disband.

STC-36 - Predator Hunt orphan achievement: Caccia ai predoni grants its production reward and +25 prestige only; no undefined achievement progress.

STC-37 - Mission reward snapshot: Production-equivalent mission reward snapshots local production at mission start.

### 34.9 Madre, inattivita, Mitico, event order e visual

STC-38 - Mother loss with inflight marches: Existing marches continue; returns route to new Mother/nearest own settlement; eliminated Player residual units disband at resolution.

STC-39 - Inactivity while attacks are inflight: Conversion is serialized; arrivals revalidate new owner and legality, becoming PvE only if still legal; no phantom attacks.

STC-40 - Sanctuary/Unicorn and Mother loss: Sanctuary is player-wide and follows Mother succession; in-progress upgrade continues; World elimination cancels sanctuary/ritual/Unicorn without refund or transfer.

STC-41 - Same-timestamp events: Scheduled events use (scheduled_at,event_priority,event_id) and fixed type priorities; worker race cannot change outcome.

STC-42 - Castle visual growth: Visual castle stages and footprints are fixed by level but remain rendering-only; logical anchor remains one tile and never changes ownership/pathfinding.

### 34.10 Intelligence engine - bande numeriche CONSOLIDATA

effective_intel_score = clamp(0,100, 4 x somma livelli Observation - 3 x somma livelli Counterintelligence + source_bonus_points). L esistenza di un detection event non puo essere soppressa.

| Score | Disclosure | Errore ETA | Errore quantita |
| --- | --- | --- | --- |
| 0-9 | event_exists, entry_sector_or_tile, coarse_heading | n/d | n/d |
| 10-24 | event_exists, entry_sector_or_tile, heading, mission_class | +/-30% | n/d |
| 25-39 | march_or_fleet_category, mission_family, size_band | +/-20% | +/-40% |
| 40-54 | mission_family, unit_categories | +/-12% | +/-25% |
| 55-69 | unit_categories, siege_cart_legendary_flags | +/-7% | +/-15% |
| 70-84 | unit_categories, stack_percentage_bands_10pp, siege_cart_legendary_flags | +/-4% | +/-8% |
| 85-100 | unit_categories, near_exact_stack_composition, siege_cart_legendary_flags | +/-2% | +/-3% |

### 34.11 Event ordering - stessa entita e stesso timestamp

Ordine obbligatorio: (scheduled_at, event_priority, event_id). Numero piu basso esegue prima. Il lock/transazione sulla stessa entita resta obbligatorio.

| Priority | Event class |
| --- | --- |
| 10 | PYRAMID_STATE_DEADLINE |
| 20 | PLAYER_WORLD_STATUS_TRANSITION |
| 30 | BUILD_RESEARCH_RECRUIT_COMPLETE |
| 40 | WALL_AUTO_REPAIR |
| 50 | NEUTRAL_GROWTH |
| 60 | MISSION_COMPLETE |
| 70 | BATTLE_OR_FLEET_ARRIVAL |
| 80 | MARCH_RETURN_OR_RECALL |
| 100 | NOTIFICATION_ONLY |

### 34.12 Crescita visuale Castello - rendering only

| Livelli | Asset stage | Footprint visuale |
| --- | --- | --- |
| 1-4 | VILLAGE_I | 1x1 |
| 5-10 | VILLAGE_II | 1x1 |
| 11-15 | CITY_I | 3x3 |
| 16-20 | CITY_II | 3x3 |
| 21-25 | CITY_III | 5x5 |
| 26-29 | CITY_IV | 5x5 |
| 30 | METROPOLIS | 7x7 |

L anchor logica resta sempre 1 tile. Footprint, asset stage e animazioni non aggiungono collisione, territorio, path block o hitbox competitive.

### 34.13 Counter matrix esplicita

| Attaccante | Difensore | Moltiplicatore |
| --- | --- | --- |
| Fanteria | Cavalleria | 1,20 |
| Fanteria | Assedio | 1,20 |
| Fanteria | Speciale | 1,20 |
| Arciere | Fanteria | 1,25 |
| Arciere | Bestia/Bestia scout/Bestia heavy | 1,25 |
| Arciere | Cavalleria | 0,75 |
| Cavalleria | Arciere | 1,30 |
| Elefante da Guerra | Fanteria | 1,20 |
| Drago | Bestia/Bestia scout/Bestia heavy | 1,30 |
| Qualsiasi altra coppia | Qualsiasi | 1,00 |

### 34.14 Salvage manifest vocabulary per il clean rebuild

| Categoria | Regola |
| --- | --- |
| COPY | May be copied into the new repo, subject to v3.7 regression tests. |
| COPY_AND_ADAPT | May be transferred only with explicit v3.7 adaptation and tests. |
| REFERENCE_ONLY | May be read for ideas/contracts, never copied verbatim into runtime. |
| DO_NOT_IMPORT | Must not enter the new project. |

## 38. v3.7 CONTENT-COVERAGE REINTEGRATION - 33 chiusure

NON REGRESSIONE; Conservare sistemi e tabelle non modificati dal CHANGELOG v3.5_to_v3.7. Nessuna eliminazione di roster, missioni, Casata, alleanze o altre regole per abbreviare un file.

La v3.7 riattiva solo i sistemi dimostrati come persi: FAST early game, catalogo mission/challenge esteso, matrice notifiche, schede UX, cinematiche/LOD, performance, error UX, observability, anti-cheat, anti-multi-account, simulator, late-join, Android mobile-first e regression policy.

Ogni aggiunta numerica e duplicata in forma strutturata nel CANONICAL_SPEC v3.7; nessun runtime deve estrarre numeri dal testo PDF.


### 38.1 FAST early game - ACTIVE

| Parametro | Valore CONSOLIDATA |
| --- | --- |
| Applicazione | Settlement upgrade + costruzione/upgrade edifici |
| Eligibilita | Player possiede <=3 Insediamenti E target level <=10 allo start job |
| Costo | x0,70 |
| Tempo | x0,50 |
| Snapshot | Eligibilita e moltiplicatori congelati allo start; il 4o settlement successivo non modifica il job |
| Esclusioni | Research, reclutamento, navi, Leggendari, Santuario Mitico, rituale Unicorno |
| Rounding | ceil per risorsa; durata ceil al minuto runtime |

### 38.2 Code costruzione e Specializzazione Player - machine parity

| Voce | Regola |
| --- | --- |
| Code costruzione | 2 per Insediamento, condivise da settlement upgrade + building construction/upgrade. Terzo job = REJECT_QUEUE_FULL. |
| ATTACCANTE | +5% ATK power nelle proprie marce ATTACK/RAID/CONQUEST. |
| DIFENSORE | +5% DEF power quando difende propri Settlement/Sentinelle. |
| Unlock | Scelta esclusiva gratuita al raggiungimento del 3o Insediamento. |
| Cambio | 2.500 Rubini, cooldown 168h; vietato AT_WAR, ACTIVE_SIEGE o con marce militari attive. |

## 39. Missioni e challenge v3.7 - catalogo completo 18 definizioni


| Nome | Scope | Tipo | Durata/finestra | Requisiti | Reward | Cooldown h |
| --- | --- | --- | --- | --- | --- | --- |
| Pattuglia locale | PLAYER | TIMED_MISSION | 1 | 100 Fanteria/Arciere | 0,25h produzione 5 risorse +10 Prestigio | 2 |
| Scorta commerciale | PLAYER | TIMED_MISSION | 4 | 500 unita | 1h produzione 5 risorse +1h Oro +15 Prestigio | 8 |
| Caccia ai predoni | PLAYER | TIMED_MISSION | 8 | 1.000 unita miste | 2,5h produzione 5 risorse +25 Prestigio | 16 |
| Spedizione di confine | PLAYER | TIMED_MISSION | 12 | 2.000 unita | 5h produzione +40 Prestigio; 10% cosmetico seeded, altrimenti +20 Prestigio | 24 |
| Ricognizione distante | PLAYER | TIMED_MISSION | 4 | >=1 Falco + Observation I Lv1 | Intel snapshot + mission progress +10 Prestigio | 8 |
| Rifornisci un alleato | PLAYER | REAL_CARAVAN_MISSION | REAL_ONE_WAY_CARAVAN_ETA | Carovana alleato; >=10.000 risorse consegnate | +15 Prestigio; prossima Carovana +5% cap entro24h | 24 |
| Presidia una Sentinella | PLAYER | STATE_DURATION_MISSION | 24 | >=max(100,20% cap) per 6h cumulative/24h | +15 Prestigio | 12 |
| Prima Bandiera | PLAYER | WORLD_ONE_SHOT_HOUSE_MISSION | evento | Stemma salvato con >=3 layer modificati | +20 Prestigio + bordo_fondatore | - |
| Guardiani del Confine | PLAYER | WINDOW_CHALLENGE | 168 | 3 difese PvP; >=2 attacker; power attacker >=25% | +100 Prestigio + stendardo_guardiani | 720 |
| Via dei Conquistatori | PLAYER | WORLD_ONE_SHOT_CHALLENGE | evento | 3 conquiste PvP contro 3 Player diversi | +100 Prestigio extra + titolo + araldica + Chronicle | - |
| Mano tesa | PLAYER | WINDOW_CHALLENGE | 168 | Supporta 3 alleati; include >=1.000 truppe e >=10.000 risorse | +50 Prestigio + sigillo_supporto | 720 |
| Muro di scudi | ALLIANCE | WINDOW_CHALLENGE | 24 | 3 difese PvP in 3 membri diversi; attacker >=25% | +100 Smeraldi + Chronicle | 72 |
| Operazione coordinata | ALLIANCE | WINDOW_CHALLENGE | 72 | 1 conquista PvP con >=3 contributor validi | +250 Smeraldi + titolo Alleanza 7g + Chronicle | 168 |
| Rotta commerciale | ALLIANCE | WINDOW_CHALLENGE | 24 | >=5 membri e >=100.000 risorse consegnate | +150 Smeraldi +5% cap Carovana Alleanza/24h | 72 |
| Prima Metropoli | WORLD | WORLD_FIRST_RECORD | evento | Primo Settlement L30 del World | +250 Prestigio + titolo + araldica + Chronicle | - |
| Battaglia piu grande | WORLD | WORLD_RECORD | evento | Nuovo record PvP total_prebattle_power | Titolo/cosmetico detentore; nessun power reward | - |
| Mercato in movimento | WORLD | RECURRING_WORLD_CHALLENGE | 48 | Volume Carovane >=250.000 nella finestra | +50 Prestigio; top10 cosmetico logistico | - |
| Frontiere aperte | WORLD | RECURRING_WORLD_CHALLENGE | 72 | 3 conquiste PvP tra macro-regioni diverse | +100 Prestigio + stemma regionale + Chronicle | - |

### 39.1 Chiusure operative delle 13 definizioni riammese

Rifornisci un alleato - Carovana reale verso un alleato, consegna >=10.000 risorse. Reward +15 Prestigio e +5% capacita sulla prossima Carovana entro 24h; non cumulabile. Cooldown 24h; stessa coppia destinatario 72h.

Presidia una Sentinella - Presidio >=max(100,20% cap Sentinella) per 6h cumulative entro 24h; sotto soglia il timer si mette in pausa. +15 Prestigio; cooldown 12h.

Prima Bandiera - One-shot World: salva stemma con almeno 3 layer modificati rispetto al default. +20 Prestigio + bordo_fondatore.

Guardiani del Confine - Finestra 7g: 3 difese PvP vinte su Settlement/Sentinelle, >=2 attaccanti diversi e attacker_power >=25% defender_power. +100 Prestigio + stendardo_guardiani; cooldown 30g.

Via dei Conquistatori - One-shot World: 3 conquiste PvP contro 3 Player diversi. +100 Prestigio extra, titolo Conquistatore del Regno, araldica e Chronicle; il normale +25 per conquista resta.

Mano tesa - Finestra 7g: supporta 3 alleati diversi, includendo almeno un rinforzo >=1.000 truppe e una Carovana >=10.000 risorse. +50 Prestigio + sigillo_supporto; cooldown 30g.

Muro di scudi - Alleanza, 24h: 3 difese PvP vinte in 3 owner membri diversi, attacco esterno valido >=25% defender_power. +100 Smeraldi + Chronicle; cooldown 72h.

Operazione coordinata - Alleanza, 72h: una conquista PvP con >=3 contributor; ognuno deve avere un assalto CONQUEST valido che vince combat o riduce Loyalty. +250 Smeraldi, titolo 7g, Chronicle; cooldown 7g.

Rotta commerciale - Alleanza, 24h: consegne riuscite da >=5 membri e >=100.000 risorse totali. +150 Smeraldi e +5% capacita Carovana alliance-wide per 24h, non cumulabile; cooldown 72h.

Prima Metropoli - World one-shot: primo completamento server di un Settlement L30. +250 Prestigio, titolo Prima Metropoli, araldica, Chronicle. Tie-break timestamp poi event_id.

Battaglia piu grande - World Record permanente su total_prebattle_power di battaglia PvP valida; admin/simulator/test esclusi. Solo titolo/cosmetico al detentore corrente, nessun reward di potere.

Mercato in movimento - Prima apertura giorno30, poi ogni30g, durata48h. Volume = risorse consegnate + intercettate con Carovane reali. >=250.000: +50 Prestigio; top10 cosmetico logistico.

Frontiere aperte - Prima apertura giorno45, poi ogni60g, durata72h. 1 punto per conquista PvP fra macro-regioni diverse; a 3 punti +100 Prestigio + stemma regionale + Chronicle.

### 39.2 Piramide - assorbimento del vecchio concetto missione

| Evento | Reward Smeraldi | Vincolo |
| --- | --- | --- |
| Prima partecipazione valida Alleanza nel ciclo | +500 | Una sola volta per Alleanza/ciclo. |
| Vittoria ciclo Piramide | +2.000 ulteriori | Una sola volta; si aggiunge al reward gameplay Piramide gia canonico. |
| Missione Piramide separata | NO | Il sistema Piramide resta unico; nessun duplicato. |

## 40. Alleanze, Smeraldi, Prestigio, refund e notifiche - parity completa

### 40.1 Cap e timer Alleanza

| Regola | Valore |
| --- | --- |
| Cap Lupo Solitario / Mercenaria / Strutturata | 1 / 5 / 100 Player |
| PNA | Indefinito; recesso normale 12h senza nuovi attacchi; contratto Mercenario rompe PNA target subito senza penalty. |
| Voto guerra | 12h; Leader/Vice/Diplomatici; maggioranza semplice; parte appena raggiunta maggioranza matematica. |
| Leave | Effettivo dopo 12h. Join cooldown 24h normale; se Alleanza in guerra: war-involved 72h e join cooldown 72h. |
| Shared border | 12h stabilizzazione alla rottura relazione. |
| Mercenari | 72/96/120/168h; max3 contratti attivi; +5% cap marcia e +3% ATK solo target; escrow 1.000-1.000.000 Smeraldi. |

### 40.2 Smeraldi treasury - fonti esatte

| Evento | Smeraldi | Limite |
| --- | --- | --- |
| Prima missione personale completata per membro/giorno UTC | +5 | 1/membro/giorno; cap Alleanza +500/giorno; solo Alleanza Strutturata |
| Difesa PvP valida vinta | +10 | Stessa coppia attacker/defender premiabile 1 volta/24h |
| Conquista PvP Settlement | +25 | Per owner change valido |
| Partecipazione Piramide | +500 | 1/Alleanza/ciclo |
| Vittoria Piramide | +2.000 | 1/Alleanza/ciclo |
| Contratto Mercenario | offerta 1.000-1.000.000 | Escrow atomico; success 100% tesoreria provider |

### 40.3 Cancel/refund 70%

| Job | Cancel | Refund |
| --- | --- | --- |
| Settlement/building | Prima del completamento | 70% risorse snapshot; 0 Rubini |
| Research | Prima del completamento | 70% risorse snapshot; nessun livello parziale |
| Recruitment | Solo porzione non completata | 70% costo unita non prodotte; prodotte restano |
| Navi | Come recruitment | 70% costo navi non prodotte |
| Marcia | No cancel istantaneo | Recall = viaggio reale di ritorno |

### 40.4 Casata: Prestigio e stemma a layer

| Voce | Regola |
| --- | --- |
| Scope | World-scoped, identita 1:1 del Player; no membership group. |
| Campi | Nome, motto, stemma, prestigio, storia. |
| Stemma | Layer almeno: shield base, primary symbol, secondary mark, border, color scheme. |
| Unlock | Missioni, achievement, conquiste, difese, Piramide, World Record. |
| Gameplay power cosmetici | 0. |
| Prestigio | Missioni usano valori del catalogo; difesa PvP +10; conquista PvP +25; successo contratto Mercenario provider +10. |

### 40.5 Notification Event Catalog

| Evento | Destinatari | Canali | Inbox | Severity | Payload minimo | Deep link |
| --- | --- | --- | --- | --- | --- | --- |
| BUILD_JOB_STATE | OWNER | REALTIME,INBOX | SI | INFO | job_id,entity_id,state,eta,cost_or_refund | settlement/build |
| SETTLEMENT_UPGRADE_STATE | OWNER | REALTIME,INBOX | SI | INFO | settlement_id,old_level,new_level,state,eta,unlocks | settlement |
| RESEARCH_JOB_STATE | OWNER | REALTIME,INBOX | SI | INFO | research_key,level,state,eta,effect,unlocks | research |
| RECRUITMENT_JOB_STATE | OWNER | REALTIME,INBOX | SI | INFO | producer_id,unit_key,batch,state,eta | army/recruitment |
| MARCH_DEPARTED | SENDER | REALTIME,INBOX,MAP | SI | INFO | march_id,mission_type,target_id,eta,own_composition | map/march |
| REINFORCEMENT_INCOMING | SENDER,ALLY_TARGET_OWNER | REALTIME,INBOX,MAP | SI | INFO | march_id,origin,eta,quantity_if_allied | map/march |
| MARCH_ARRIVED | INTERESTED_PLAYERS | REALTIME,INBOX | SI | INFO | march_id,result,new_position_or_return_state | battle-or-map |
| MARCH_RETURNED | OWNER | REALTIME,INBOX | SI | INFO | march_id,eta_or_completed,destination | map/march |
| CARAVAN_STATE | SENDER,RECIPIENT_IF_ALLIED | REALTIME,INBOX | SI | INFO | caravan_id,state,eta,delivered,intercepted,capacity | caravans |
| SENTINEL_ATTACKED | OWNER,AUTHORIZED_ALLIANCE | REALTIME,INBOX,MAP,PUSH | SI | HIGH | sentinel_id,sector,eta,garrison_state | map/sentinel |
| SENTINEL_LOST | OWNER | REALTIME,INBOX,MAP,PUSH | SI | CRITICAL | sentinel_id,sector,grace_deadline | map/sentinel |
| SHARED_BORDER_CREATED | BOTH_ALLIED_OWNERS | REALTIME,INBOX,MAP | SI | INFO | sectors,dormant_sentinels,returns | map/border |
| SHARED_BORDER_ENDED | BOTH_FORMER_ALLIES | REALTIME,INBOX,MAP,PUSH | SI | HIGH | sectors,stabilization_deadline | map/border |
| NAVAL_FLEET_DETECTED [v3.7: funzione navale DISABLED; nessuna emissione di nuovi allarmi. I campi descritti sono storico.] | TERRITORY_OWNER | REALTIME,INBOX,MAP,PUSH | SI | HIGH | fleet_id,sector,direction,intel_disclosure | map/naval |
| BATTLE_REPORT_READY | PARTICIPANTS | INBOX,REALTIME | SI | HIGH | battle_id,seed,losses,survivors,counter_summary,loot | battle-reports |
| LOYALTY_CHANGED | DEFENDER_OWNER,AUTHORIZED_SIEGE_ATTACKERS | REALTIME,INBOX | SI | HIGH | settlement_id,loyalty,actor_player_id,recovery_at | siege |
| SETTLEMENT_CONQUERED | OLD_OWNER,NEW_OWNER | REALTIME,INBOX,PUSH | SI | CRITICAL | settlement_id,old_owner,new_owner,retention,returns_or_refunds | settlement |
| ALLIANCE_INVITE | TARGET_PLAYER | INBOX,REALTIME | SI | INFO | alliance_id,sender_id,expires_at,role | alliance |
| DIPLOMACY_STATE_CHANGED | AFFECTED_MEMBERS | REALTIME,INBOX,PUSH | SI | HIGH | relation,state,vote_or_deadline | alliance/diplomacy |
| MERCENARY_OFFER | AUTHORIZED_LEADERS | INBOX,REALTIME | SI | INFO | target_alliance_id,emerald_offer,duration_hours | alliance/mercenary |
| MERCENARY_CONTRACT_ACTIVE | CLIENT_ALLIANCE,PROVIDER_ALLIANCE,TARGET_ALLIANCE | REALTIME,INBOX,PUSH | SI | CRITICAL | contract_id,escrow,duration_hours,auto_war,bonuses | alliance/mercenary |
| MERCENARY_CONTRACT_ENDED | CLIENT_ALLIANCE,PROVIDER_ALLIANCE | INBOX,REALTIME | SI | INFO | contract_id,result,prestige_delta,feedback_available | alliance/mercenary |
| EMERALD_TREASURY_MOVEMENT | AUTHORIZED_ALLIANCE_MEMBERS | INBOX | SI | AUDIT | amount,reason,balance_after,contract_id_or_source | alliance/treasury |
| RUBY_TRANSACTION | PLAYER | INBOX | SI | AUDIT | amount,provider_transaction_id,policy_version,effect,result | premium |
| PYRAMID_STATE_CHANGED | WORLD_PLAYERS | REALTIME,INBOX,MAP | SI | HIGH | state,owner_alliance_id,deadline,cycle_id | pyramid |
| MISSION_COMPLETED | PLAYER_OR_ALLIANCE | REALTIME,INBOX | SI | INFO | mission_key,reward,completion_id | missions |
| WORLD_CHALLENGE_STATE | WORLD_PLAYERS | REALTIME,INBOX | SI | INFO | challenge_key,state,deadline,leaderboard_summary | missions/world |
| SERVER_ACTION_RETRY_STATUS | PLAYER | REALTIME | NO | ERROR | action_code,verified_state,retryable,trace_id | support |

Ogni notifica: event_id, world_id, player_id, created_at UTC, read_at e deep_link sicuro.

Toast effimero; Inbox persistente per eventi che cambiano risorse, eserciti, proprieta, contratti, premium o sicurezza.

Eventi ripetitivi non critici possono essere aggregati; un evento CRITICAL/HIGH persistente non viene mai scartato.

WebSocket/push segnala: la persistenza server resta source of truth.

## 41. UX, cinematiche, LOD e performance - requisiti recuperati

### 41.1 Schede operative UX - zero duplicazione numerica

| Campo obbligatorio | Regola |
| --- | --- |
| Applicazione | Ogni edificio e ogni unita. |
| Dati | name, cosa fa, perche serve, unlock level, required research, cost/time, unlock prodotti, effetto attuale, effetto prossimo, CTA. |
| Stati | LOCKED / AVAILABLE / BLOCKED_RESOURCES / BLOCKED_QUEUE / IN_PROGRESS / MAXED |
| Source | Numeri generati dal CANONICAL_SPEC; il testo UX non diventa seconda source of truth. |

### 41.2 Cinematiche ACTIVE

| Sequenza | Trigger | Durata | Regola |
| --- | --- | --- | --- |
| Intro | Prima entrata Player/World | 24s | Skippabile dopo2s; rivedibile Chronicle; non blocca timer server. |
| Major Attack | Leggendario/Unicorno nella marcia OPPURE >=25.000 unita | 6s | Skippabile; usa composizione reale, stemma Casata e banner Alleanza se presente. |
| Conquest Success | Owner change committato | 8s | Skippabile; mostra superstiti reali, stemma e banner. |

### 41.3 LOD mappa

| Zoom | Mostrare | Nascondere/Regola |
| --- | --- | --- |
| <0,65 | Settlement, neutrali, Piramide, territory fill, confini | Zero Sentinelle/connector |
| 0,65-1,19 | Settlement, confini, flotte/marce rilevanti, Sentinelle di bordo utili | No rete 4+8 completa per tutti |
| >=1,20 | Dettaglio | Solo il Settlement selezionato mostra 4+8 completa + connector |
| Sempre | Tutti i Settlement del viewport valido | Nessun owner scompare per LOD |

### 41.4 Target performance map/mobile

| Metrica | Target CONSOLIDATA |
| --- | --- |
| Profilo rete mobile | 10 Mbps down, RTT80ms |
| Time to first terrain | p75 <=3.000ms; p95 <=5.000ms |
| Chunk API | p95 <=500ms escluso cold-start DB |
| Pan/zoom | vietato full-world refetch |
| Client | LRU cache, prefetch adiacente, request dedupe, cancellazione obsolete, culling offscreen |

### 41.5 Error UX

| Area | Regola |
| --- | --- |
| Core route states | LOADING / EMPTY / ERROR_RETRYABLE / ERROR_FATAL / READY |
| ErrorBoundary | Locale per ogni route core; root boundary solo ultima difesa. |
| Liste API | [] quando semanticamente lista; mai null/missing. |
| Retry | Messaggio non ambiguo e trace_id; nessun doppio spend/effect. |

## 42. Operations, security, simulator e regression policy

### 42.1 Observability minima obbligatoria

Log strutturati: trace_id, world_id, player_id, action_type, entity_id.

Metriche: chunk latency/payload, scheduler lag/retry/duplicate effect prevented, DB index usage, WebSocket reconnect/catch-up, event queue depth, API error rate, combat/conquest frequency, world generation reject rate, economy overflow, territory overlap violations.

### 42.2 Anti-cheat e anti-multi-account

| Tema | Regola |
| --- | --- |
| Anti-cheat | Server authority; rate limit; idempotency/anti-replay; wallet/risorse mai client-authoritative; impossible-state detector; audit permanente premium/conquest/treasury. |
| Shared IP/device | Mai sanzione automatica solo per IP/device condiviso. |
| Risk signals | Trasferimenti circolari ripetuti, battaglie reciproche anomale, reward farm, account tecnicamente collegati. |
| Esito | Flag audit/review; no auto-ban. Pair cooldown applicati dove la spec li definisce. |

### 42.3 World Simulator e late join

| Voce | Regola |
| --- | --- |
| Simulator | DEV/TEST only; clock x1/x10/x50; bot usano stesse API/domain commands dei Player; nessuna modifica manuale timestamp produzione. |
| Validation | 100 bot obbligatori; stress 400 bot. |
| Metriche | spawn, chunk latency, scheduler, economy, marches, territory, combat, alliances, Pyramid, DB, realtime reconnect. |
| Late join | Al claim slot devono restare >=3 neutrali raggiungibili; reservation anchor non puo essere inglobata da territory altrui prima del claim. |

### 42.4 Android-only release guard

| Regola | CONSOLIDATA |
| --- | --- |
| P0/P1 | Chiusura richiede test riproduttivo -> root cause fix -> regression guard permanente -> rerun gate coinvolto. Nessun FIXED senza test. |

## Chiusure normative finali v3.7

### Magazzino
I 30 valori base sono quelli del JSON. Lv1 = 3.500 per risorsa; Lv30 = 4.266.500. Le tre ricerche Magazzino a Lv5 sommano +30%, quindi Lv30 arriva a 5.546.450. Il cap categoria resta +60% (6.826.400 a Lv30 al cap), ma non e un bonus automatico. Produzione oraria e capacita Magazzino sono categorie separate.

### Curve edifici
Per gli edifici ordinari usare la tabella completa `building_upgrade_costs` del JSON. La curva che la genera e: costi 1,45 fino al passaggio 10, poi 1,25 fino al 20, poi 1,15; tempi 1,40 / 1,20 / 1,10. Le riduzioni ammesse si applicano prima del ceil finale. Il Santuario Mitico conserva la tabella speciale a 5 livelli.

### Sentinelle territoriali
Il Comando Sentinelle e un edificio del settlement; la Sentinella territoriale e un presidio distinto. Costo costruzione/rifacimento: G210 / W330 / C300 / I180 / Au24; tempo 18 minuti. Nessun HP struttura, nessuna mura, nessuna riparazione. Serve una guarnigione combattente. Se resta senza truppe il settore si apre immediatamente e parte una grace di 24h; ripresidio prima della scadenza annulla il timer gratuitamente; alla scadenza la Sentinella viene rimossa in modo idempotente.

### Navi
Le navi sono solo trasporto Porto-Porto: ATK/DEF/HP = 0 per serializzazione, nessun roster combat, nessuna casualty nave, nessun allarme territoriale passivo. Se le truppe sbarcate vengono eliminate, le navi tornano vuote.

### Ricerche
Esistono esattamente 114 chiavi di ricerca in 12 rami. Ogni effetto deve essere applicato una sola volta secondo `research_effects`. Non creare un 115esimo nodo e non dedurre effetti dalla sola descrizione testuale.

### Overflow risorse
Per produzione, reward, loot e consegna carovana: accredito = max(0,min(incoming,max(0,cap-current))); scarto = incoming-accredito. Rubini e Smeraldi sono esclusi da questa regola. Retry e replay non possono riaccreditare la parte scartata.

### Concorrenza e stato
Le transizioni competitive simultanee devono essere atomiche o equivalenti a una state machine idempotente. Il limite di 20 insediamenti, gli slot World, la proprieta delle tile e gli accrediti monetari non possono essere violati da richieste concorrenti.
