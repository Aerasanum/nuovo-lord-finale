# Empire Lords Dragon — Account Max & rapporto di fattibilità

_Generato il 2026-09-13 21:48 UTC da `backend/scripts/max_account.py` — spec v3.7._

## Account Max (QA)
- **Login**: `max@empirelords.com` / `Max12345!` — mondo `qa_1`, Casata «Casa Max»
- Insediamento madre `stl_0492f24eaf8a4166` a (292,183) — Metropoli L30, 20 edifici L30 + Santuario Mitico L5, 114 ricerche al massimo, risorse = cap Magazzino (5.546.450 per risorsa), Mura L30, 3 Drago / 3 Angelo / 3 Demone (cap per Metropoli), esercito standard completo, 300 navi, 999.999 Rubini.

## 1. Insediamento 1 → 30 (Castello / Fortezza)

| Livello | Stadio | Costo (grano/legno/argilla/ferro/oro) | Tempo base | Tempo FAST (≤3 insediamenti, L≤10) | Cap Magazzino L-1 (+30% ricerca) | OK |
|---|---|---|---|---|---|---|
| 2 | Village | 1.000/1.200/1.200/800/100 | 30 min | 15 min | 4.550 | ✅ |
| 3 | Village | 1.450/1.740/1.740/1.160/145 | 42 min | 21 min | 9.100 | ✅ |
| 4 | Village | 2.103/2.523/2.523/1.682/211 | 59 min | 30 min | 14.560 | ✅ |
| 5 | Village | 3.049/3.659/3.659/2.439/305 | 1 h 23 min | 42 min | 22.750 | ✅ |
| 6 | Village | 4.421/5.305/5.305/3.537/443 | 1 h 56 min | 58 min | 34.125 | ✅ |
| 7 | Village | 6.410/7.692/7.692/5.128/641 | 2 h 42 min | 1 h 21 min | 47.775 | ✅ |
| 8 | Village | 9.295/11.153/11.153/7.436/930 | 3 h 46 min | 1 h 53 min | 79.625 | ✅ |
| 9 | Village | 13.477/16.172/16.172/10.782/1.348 | 5 h 17 min | 2 h 39 min | 116.025 | ✅ |
| 10 | Village | 19.541/23.450/23.450/15.633/1.955 | 7 h 23 min | 3 h 42 min | 156.975 | ✅ |
| 11 | City | 24.427/29.312/29.312/19.541/2.443 | 8 h 52 min | — | 202.475 | ✅ |
| 12 | City | 30.533/36.640/36.640/24.427/3.054 | 10 h 38 min | — | 252.525 | ✅ |
| 13 | City | 38.166/45.799/45.799/30.533/3.817 | 12 h 46 min | — | 307.125 | ✅ |
| 14 | City | 47.708/57.249/57.249/38.166/4.771 | 15 h 19 min | — | 366.275 | ✅ |
| 15 | City | 59.635/71.561/71.561/47.708/5.964 | 18 h 22 min | — | 461.825 | ✅ |
| 16 | City | 74.543/89.452/89.452/59.635/7.455 | 22 h 3 min | — | 564.200 | ✅ |
| 17 | City | 93.179/111.814/111.814/74.543/9.318 | 1 g 2 h 27 min | — | 673.400 | ✅ |
| 18 | City | 116.473/139.768/139.768/93.179/11.648 | 1 g 7 h 44 min | — | 789.425 | ✅ |
| 19 | City | 145.591/174.710/174.710/116.473/14.560 | 1 g 14 h 5 min | — | 912.275 | ✅ |
| 20 | City | 181.989/218.387/218.387/145.591/18.199 | 1 g 21 h 42 min | — | 1.041.950 | ✅ |
| 21 | City | 209.287/251.145/251.145/167.430/20.929 | 2 g 2 h 16 min | — | 1.178.450 | ✅ |
| 22 | City | 240.680/288.816/288.816/192.544/24.068 | 2 g 7 h 17 min | — | 1.369.550 | ✅ |
| 23 | City | 276.782/332.139/332.139/221.426/27.679 | 2 g 12 h 49 min | — | 1.615.250 | ✅ |
| 24 | City | 318.300/381.960/381.960/254.640/31.830 | 2 g 18 h 54 min | — | 1.915.550 | ✅ |
| 25 | City | 366.045/439.253/439.253/292.836/36.605 | 3 g 1 h 35 min | — | 2.270.450 | ✅ |
| 26 | City | 420.951/505.141/505.141/336.761/42.096 | 3 g 8 h 57 min | — | 2.679.950 | ✅ |
| 27 | City | 484.094/580.912/580.912/387.275/48.410 | 3 g 17 h 3 min | — | 3.144.050 | ✅ |
| 28 | City | 556.708/668.049/668.049/445.366/55.671 | 4 g 1 h 57 min | — | 3.662.750 | ✅ |
| 29 | City | 640.214/768.256/768.256/512.171/64.022 | 4 g 11 h 44 min | — | 4.236.050 | ✅ |
| 30 | Metropolis | 736.246/883.495/883.495/588.997/73.625 | 4 g 22 h 31 min | — | 4.863.950 | ✅ |

**Totale Castello**: grain 5.122.297 · wood 6.146.752 · clay 6.146.752 · iron 4.097.839 · gold 512.242 — tempo base **43 g 23 h 39 min**, con FAST sui primi 10 livelli **43 g 11 h 22 min**, con ricerca costruzione −35 % ≈ **28 g 6 h 11 min** (limite inferiore).

## 2. Edifici 1 → 30 (20 edifici canonici)

| Edificio | Sblocco (liv. insediamento) | Costo totale L1→30 (grano/legno/argilla/ferro/oro) | Tempo base | Tempo con FAST | Passo più caro (livello) | Cap Magazzino allo stesso livello | Sotto il cap L30 |
|---|---|---|---|---|---|---|---|
| Fattoria | 1 | 512.242/1.280.586/768.356/256.129/0 | 14 g 16 h 2 min | 14 g 11 h 55 min | 184.062 (L30) | 5.546.450 | ✅ |
| Boscaiolo | 1 | 768.356/512.242/1.280.586/256.129/0 | 14 g 16 h 2 min | 14 g 11 h 55 min | 184.062 (L30) | 5.546.450 | ✅ |
| Cava d'Argilla | 1 | 768.356/1.280.586/512.242/256.129/0 | 14 g 16 h 2 min | 14 g 11 h 55 min | 184.062 (L30) | 5.546.450 | ✅ |
| Miniera di Ferro | 1 | 1.024.470/1.280.586/1.280.586/512.242/0 | 17 g 14 h 24 min | 17 g 9 h 30 min | 184.062 (L30) | 5.546.450 | ✅ |
| Miniera d'Oro | 1 | 1.536.697/1.536.697/1.536.697/1.280.586/256.129 | 21 g 23 h 57 min | 21 g 17 h 49 min | 220.874 (L30) | 5.546.450 | ✅ |
| Magazzino | 1 | 1.280.586/2.048.927/2.048.927/1.024.470/102.457 | 29 g 7 h 52 min | 28 g 23 h 41 min | 294.499 (L30) | 4.863.950 | ✅ |
| Caserma | 1 | 1.536.697/2.305.040/1.792.812/1.280.586/102.457 | 36 g 15 h 44 min | 36 g 5 h 32 min | 331.311 (L30) | 5.546.450 | ✅ |
| Universita | 1 | 2.561.157/3.585.611/3.585.611/2.561.157/512.242 | 65 g 23 h 22 min | 65 g 4 h 58 min | 515.372 (L30) | 5.546.450 | ✅ |
| Mura | 1 | 2.048.927/4.097.839/4.610.066/2.561.157/256.129 | 87 g 23 h 2 min | 86 g 22 h 28 min | 662.621 (L30) | 5.546.450 | ✅ |
| Sala della Casata | 1 | 1.024.470/1.536.697/1.536.697/768.356/102.457 | 29 g 7 h 52 min | 28 g 23 h 41 min | 220.874 (L30) | 5.546.450 | ✅ |
| Comando Sentinelle | 3 | 1.793.022/2.817.597/2.561.457/1.536.877/204.929 | 43 g 23 h 57 min | 43 g 11 h 31 min | 404.935 (L30) | 5.546.450 | ✅ |
| Caravanserraglio | 5 | 1.280.736/2.561.457/2.049.167/1.280.736/153.701 | 36 g 15 h 59 min | 36 g 5 h 40 min | 368.123 (L30) | 5.546.450 | ✅ |
| Sala dell'Alleanza | 7 | 1.536.877/2.817.597/2.305.310/1.793.022/256.159 | 43 g 23 h 57 min | 43 g 11 h 31 min | 404.935 (L30) | 5.546.450 | ✅ |
| Sala di Guerra | 10 | 2.049.167/3.073.743/2.561.457/2.561.457/307.385 | 51 g 7 h 53 min | 50 g 17 h 25 min | 441.748 (L30) | 5.546.450 | ✅ |
| Scuderia | 11 | 2.305.310/3.073.743/2.561.457/3.073.743/307.385 | 51 g 7 h 53 min | 50 g 17 h 25 min | 441.748 (L30) | 5.546.450 | ✅ |
| Porto | 15 | 4.610.606/8.196.627/5.122.897/4.098.319/768.446 | 131 g 23 h 22 min | 130 g 10 h 4 min | 1.177.993 (L30) | 5.546.450 | ✅ |
| Officina | 16 | 2.561.457/4.610.606/4.098.319/3.586.031/409.845 | 65 g 23 h 49 min | 65 g 5 h 12 min | 662.621 (L30) | 5.546.450 | ✅ |
| Bestiario | 21 | 4.098.319/4.610.606/4.098.319/3.586.031/614.759 | 87 g 23 h 38 min | 86 g 22 h 46 min | 662.621 (L30) | 5.546.450 | ✅ |
| Tempio | 30 | 7.684.335/9.221.201/9.221.201/7.684.335/2.049.167 | 175 g 23 h 2 min | 173 g 21 h 17 min | 1.325.242 (L30) | 5.546.450 | ✅ |

**Totale edifici (senza Castello)**: grain 40.981.787 · wood 60.447.988 · clay 53.532.164 · iron 39.957.492 · gold 6.403.647 — tempo base **1022 g 1 h 49 min**, con FAST **1010 g 2 h 15 min**, con ricerca −35 % ≈ **656 g 13 h 28 min**.

Santuario Mitico (tabella dedicata, §12 — fuori dalla vertical slice attuale):

| Livello | Costo (grano/legno/argilla/ferro/oro) | Tempo | Effetto |
|---|---|---|---|
| 1 | 500.000/600.000/600.000/500.000/100.000 | 2 gg | Sblocca fondamenta e slot mitico |
| 2 | 900.000/1.100.000/1.100.000/900.000/200.000 | 3 gg | Stabilizza il Nexus Arcobaleno |
| 3 | 1.400.000/1.700.000/1.700.000/1.400.000/300.000 | 5 gg | Amplifica portata mitica |
| 4 | 2.000.000/2.400.000/2.400.000/2.000.000/450.000 | 7 gg | Prepara il rituale di evocazione |
| 5 | 2.600.000/3.000.000/3.000.000/2.600.000/650.000 | 10 gg | Sblocca 1 Unicorno player-wide |

Totale Santuario: grain 7.400.000 · wood 8.800.000 · clay 8.800.000 · iron 7.400.000 · gold 1.700.000 — 27 giorni fissi (nessun modificatore). Il passo più caro (3.000.000) è sotto il cap Magazzino L30 (5.546.450).

## 3. Ricerca — 114 nodi, 12 rami

| Ramo | Nodi | Livelli totali | Costo totale (grano/legno/argilla/ferro/oro) | Tempo base | Tempo con −35 % |
|---|---|---|---|---|---|
| Economia | 18 | 90 | 43.099.140/43.099.140/43.099.140/34.447.260/4.309.860 | 345 g 17 h 30 min | 224 g 17 h 22 min |
| Costruzione | 6 | 30 | 16.166.150/16.166.150/16.166.150/12.924.470/1.616.610 | 133 g 2 h 43 min | 86 g 12 h 34 min |
| Militare | 15 | 59 | 757.260/757.260/757.260/578.140/75.690 | 14 g 8 h 19 min | 9 g 7 h 48 min |
| Difesa | 12 | 60 | 26.982.450/26.982.450/26.982.450/21.569.910/2.698.230 | 227 g 3 h 57 min | 147 g 15 h 46 min |
| Logistica | 7 | 31 | 9.170.960/9.170.960/9.170.960/7.324.260/917.100 | 79 g 9 h 48 min | 51 g 14 h 46 min |
| Intelligence | 10 | 50 | 18.659.110/18.659.110/18.659.110/14.915.730/1.865.910 | 162 g 20 h 7 min | 105 g 20 h 17 min |
| Sentinelle | 8 | 36 | 9.427.340/9.427.340/9.427.340/7.531.180/942.720 | 82 g 21 h 50 min | 53 g 21 h 24 min |
| Assalto e Conquista | 9 | 29 | 19.852.880/19.852.880/19.852.880/15.882.280/1.985.300 | 168 g 12 h 0 min | 109 g 12 h 36 min |
| Animali | 11 | 31 | 37.050.000/37.050.000/37.050.000/29.640.000/3.705.000 | 292 g 12 h 0 min | 190 g 3 h 0 min |
| Leggendari | 10 | 10 | 2.500.000/2.500.000/2.500.000/2.000.000/250.000 | 20 g 0 h 0 min | 13 g 0 h 0 min |
| Navigazione | 7 | 15 | 3.871.920/3.871.920/3.871.920/3.097.520/387.200 | 38 g 16 h 48 min | 25 g 3 h 43 min |
| Mitici | 1 | 1 | 250.000/250.000/250.000/200.000/25.000 | 2 g 0 h 0 min | 1 g 7 h 12 min |

**Totale ricerca**: grain 187.787.210 · wood 187.787.210 · clay 187.787.210 · iron 150.110.750 · gold 18.778.620 — tempo base **1567 g 5 h 2 min** (2 code per insediamento → ≈ 783 g 14 h 31 min in parallelo; con −35 % ≈ 509 g 8 h 14 min).

## 4. Esercito

| Unità | Categoria | Costo unitario | Tempo base | Tempo effettivo (produttore L30, ricerca max) | Lotto max (L30) |
|---|---|---|---|---|---|
| Fanteria | infantry | 15/10/10/5/0 | 1 min | 24.2 s | 6075 |
| Arciere | ranged | 12/20/8/8/0 | 2 min | 48.3 s | 6075 |
| Cavalleria | cavalry | 30/20/15/35/1 | 3 min | 72.5 s | 6075 |
| Catapulta | siege | 20/80/70/60/3 | 10 min | 241.5 s | 6075 |
| Carro di Conquista | special | 100/250/200/180/30 | 1 h 0 min | 1449.3 s | 6075 |
| Orso | beast | 120/40/30/35/8 | 5 min | 120.8 s | 6075 |
| Leone | beast | 160/40/35/40/12 | 6 min | 144.9 s | 6075 |
| Falco | beast_scout | 20/30/5/5/5 | 2 min | 48.3 s | 6075 |
| Lupo | beast | 90/35/20/25/7 | 4 min | 96.6 s | 6075 |
| Elefante da Guerra | beast_heavy | 220/60/50/120/20 | 10 min | 241.5 s | 6075 |
| Drago | legendary | 3.000.000/3.000.000/3.000.000/2.000.000/500.000 | 14 g 0 h 0 min | 14 giorni fissi (1 coda per Tempio, nessun modificatore) | 1 (max 3 per tipo per Metropoli) |
| Angelo | legendary | 2.500.000/2.500.000/2.500.000/2.500.000/500.000 | 14 g 0 h 0 min | 14 giorni fissi (1 coda per Tempio, nessun modificatore) | 1 (max 3 per tipo per Metropoli) |
| Demone | legendary | 2.800.000/2.800.000/2.800.000/2.200.000/500.000 | 14 g 0 h 0 min | 14 giorni fissi (1 coda per Tempio, nessun modificatore) | 1 (max 3 per tipo per Metropoli) |

Leggendari al cap (3 Drago + 3 Angelo + 3 Demone): grain 24.900.000 · wood 24.900.000 · clay 24.900.000 · iron 20.100.000 · gold 4.500.000; **9 × 14 giorni = 126 giorni** con la singola coda del Tempio (un Tempio per Metropoli). Costo unitario più alto 3.000.000 < cap Magazzino L30 5.546.450.

Esercito standard dell'account Max (Fanteria 100.000, Arciere 100.000, Cavalleria 60.000, Catapulta 10.000, Carro di Conquista 2.000, Orso 20.000, Leone 20.000, Falco 20.000, Lupo 20.000, Elefante da Guerra 8.000): grain 14.460.000 · wood 8.880.000 · clay 6.000.000 · iron 7.420.000 · gold 950.000, ≈ 313 g 2 h 46 min di addestramento cumulato (4 code produttore in parallelo → ≈ 78 g 6 h 41 min). Non è un cap di gioco: la dimensione dell'esercito è limitata solo dalla produzione e dal cap di marcia della Sala di Guerra (118.658 unità per marcia a L30).

## 5. Totale per raggiungere ogni cap (un solo insediamento)

| Voce | grano | legno | argilla | ferro | oro |
|---|---|---|---|---|---|
| Castello 1→30 | 5.122.297 | 6.146.752 | 6.146.752 | 4.097.839 | 512.242 |
| 19 edifici 1→30 | 40.981.787 | 60.447.988 | 53.532.164 | 39.957.492 | 6.403.647 |
| Ricerca 114 nodi | 187.787.210 | 187.787.210 | 187.787.210 | 150.110.750 | 18.778.620 |
| 9 Leggendari | 24.900.000 | 24.900.000 | 24.900.000 | 20.100.000 | 4.500.000 |
| **Totale** | **258.791.294** | **279.281.950** | **272.366.126** | **214.266.081** | **30.194.509** |

Produzione a L30 con ricerca max: grain 34.060/h · wood 34.060/h · clay 34.060/h · iron 30.654/h · gold 8.515/h (L1 senza ricerca: grain 20/h · wood 20/h · clay 20/h · iron 18/h · gold 5/h).

- **Limite produzione** (tutto il costo prodotto al ritmo massimo): ≈ **342 giorni** (risorsa vincolante: wood). Nella realtà la produzione cresce da L1 a L30 durante il percorso: una media realistica del 55–60 % del ritmo massimo porta a ≈ **599 giorni**; bottino PvP/neutrali, carovane tra insediamenti e ricompense giornaliere accorciano il percorso.
- **Limite code di costruzione** (2 code condivise): 1053 g 13 h 37 min di lavoro → ≈ **527 giorni** in parallelo, ≈ 342 giorni con la riduzione ricerca −35 % (il Castello è sequenziale: 43 g 11 h 22 min minimo).
- **Limite code di ricerca** (2 code): ≈ **784 giorni** base, 509 con −35 %.
- **Leggendari**: 126 giorni sulla coda del Tempio (disponibile solo a L30) — è il vincolo temporale più lungo dopo la Metropoli.
- **Santuario Mitico + Unicorno**: 27 giorni + rituale 7 giorni (backlog §12).

**Stima complessiva per un giocatore standard senza Rubini**: Metropoli con tutto al massimo in ≈ **599 giorni** di gioco attivo, poi **+126 giorni** per i 9 Leggendari → ≈ **725 giorni (24.2 mesi)**. Con i Rubini («Completa ora») le code si comprimono ma non i Leggendari né il Santuario (per regola canonica).

## 6. Verifica di raggiungibilità (cap Magazzino)

Regola: nessun edificio supera il livello dell'insediamento, quindi quando si paga un passo di livello L il Magazzino è al massimo il livello dell'insediamento (L−1 per il Castello e per i requisiti della tabella di progressione). Il costo di ogni singolo passo deve stare nel cap `floor(warehouse[L] × (1 + min(0,60; bonus ricerca)))` — le carovane consegnano entro lo stesso cap, quindi un passo che superasse il cap massimo disponibile sarebbe **irraggiungibile**.

Controlli eseguiti (con ricerca Magazzino al massimo, +30 %):
- Castello L→L+1: costo ≤ cap con Magazzino L−1 (29 passi).
- Ogni requisito della tabella di progressione (es. L30 richiede Prod26, Mag29, Uni29, Mura29…): costo del requisito ≤ cap con Magazzino L−1.
- Ogni livello di ogni edificio, ogni livello di ricerca, ogni Leggendario e il Santuario: costo ≤ cap massimo (Magazzino L30 = 5.546.450).

✅ **Nessun passo irraggiungibile**: la progressione canonica è chiusa — ogni costo è pagabile con il Magazzino disponibile nel momento in cui il passo diventa necessario.

ℹ️ 29 passi opzionali (non richiesti dalla progressione) costano più del cap Magazzino **allo stesso livello** e vanno quindi rinviati a un livello di insediamento/Magazzino più alto — è un ritmo voluto, non un blocco:
- economy.grain_1 L5 (5.250): sbloccabile a insediamento L1, pagabile con Magazzino ≥ L2
- economy.wood_1 L5 (5.250): sbloccabile a insediamento L1, pagabile con Magazzino ≥ L2
- economy.clay_1 L5 (5.250): sbloccabile a insediamento L1, pagabile con Magazzino ≥ L2
- economy.iron_1 L5 (5.250): sbloccabile a insediamento L1, pagabile con Magazzino ≥ L2
- economy.gold_1 L5 (5.250): sbloccabile a insediamento L1, pagabile con Magazzino ≥ L2
- economy.warehouse_1 L5 (5.250): sbloccabile a insediamento L1, pagabile con Magazzino ≥ L2
- construction.speed_1 L5 (5.250): sbloccabile a insediamento L1, pagabile con Magazzino ≥ L2
- research.speed_2 L5 (972.410): sbloccabile a insediamento L16, pagabile con Magazzino ≥ L19
- military.infantry_1 L5 (5.250): sbloccabile a insediamento L1, pagabile con Magazzino ≥ L2
- defense.wall_engineering_1 L5 (5.250): sbloccabile a insediamento L1, pagabile con Magazzino ≥ L2
- defense.wall_engineering_3 L5 (972.410): sbloccabile a insediamento L16, pagabile con Magazzino ≥ L19
- defense.battlements_3 L5 (972.410): sbloccabile a insediamento L17, pagabile con Magazzino ≥ L19
- defense.wall_repair_1 L5 (972.410): sbloccabile a insediamento L18, pagabile con Magazzino ≥ L19
- logistics.siege_1 L5 (972.410): sbloccabile a insediamento L18, pagabile con Magazzino ≥ L19
- intelligence.observation_1 L5 (5.250): sbloccabile a insediamento L1, pagabile con Magazzino ≥ L2
- intelligence.counter_2 L5 (972.410): sbloccabile a insediamento L17, pagabile con Magazzino ≥ L19
- siege.catapult_mastery L5 (972.410): sbloccabile a insediamento L17, pagabile con Magazzino ≥ L19
- siege.loyalty_pressure L5 (3.000.000): sbloccabile a insediamento L24, pagabile con Magazzino ≥ L26
- animals.bear_mastery L4 (2.100.000): sbloccabile a insediamento L22, pagabile con Magazzino ≥ L24
- animals.bear_mastery L5 (3.000.000): sbloccabile a insediamento L22, pagabile con Magazzino ≥ L26
- animals.lion_mastery L4 (2.100.000): sbloccabile a insediamento L22, pagabile con Magazzino ≥ L24
- animals.lion_mastery L5 (3.000.000): sbloccabile a insediamento L22, pagabile con Magazzino ≥ L26
- animals.falcon_mastery L4 (2.100.000): sbloccabile a insediamento L22, pagabile con Magazzino ≥ L24
- animals.falcon_mastery L5 (3.000.000): sbloccabile a insediamento L22, pagabile con Magazzino ≥ L26
- animals.wolf_mastery L4 (2.100.000): sbloccabile a insediamento L22, pagabile con Magazzino ≥ L24
- animals.wolf_mastery L5 (3.000.000): sbloccabile a insediamento L22, pagabile con Magazzino ≥ L26
- animals.elephant_mastery L5 (3.000.000): sbloccabile a insediamento L25, pagabile con Magazzino ≥ L26
- navigation.speed L5 (972.410): sbloccabile a insediamento L18, pagabile con Magazzino ≥ L19
- navigation.capacity L5 (972.410): sbloccabile a insediamento L18, pagabile con Magazzino ≥ L19

Anche **senza** ricerca Magazzino ogni passo è pagabile.

## 7. Note di bilanciamento

- Il ritmo è coerente con un MMO persistente stagionale: Metropoli in ~3–6 mesi di gioco attivo, Leggendari nei 4 mesi successivi; l'eliminazione per inattività (120 giorni, backlog) non interferisce con un giocatore attivo.
- I Rubini accelerano solo costruzione/ricerca/reclutamento standard: il percorso ai cap è identico per tutti nei contenuti che contano (Leggendari, Santuario, Piramide).
- L'account Max serve a QA di UI/combattimento agli estremi (cap di marcia, Leggendari in garrison, DTO a L30) — non va usato come riferimento di progressione.
