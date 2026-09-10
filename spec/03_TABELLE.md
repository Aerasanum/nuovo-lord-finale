# EMPIRE LORDS DRAGON v3.7 — TABELLE ECONOMIA, EDIFICI, UNITA

**SPEC_HASH:** `62a57ec4e4e400ed1ec4af41e473d98b9966186aa59dcfa851d89aac3540daa0`

Vista umana derivata dal Canonical Spec. In caso di divergenza prevale il JSON.

## Economia 1-30
| Lv | Grano/h | Legno/h | Argilla/h | Ferro/h | Oro/h | Magazzino per risorsa |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 20 | 20 | 20 | 18 | 5 | 3500 |
| 2 | 60 | 60 | 60 | 54 | 15 | 7000 |
| 3 | 120 | 120 | 120 | 108 | 30 | 11200 |
| 4 | 200 | 200 | 200 | 180 | 50 | 17500 |
| 5 | 300 | 300 | 300 | 270 | 75 | 26250 |
| 6 | 420 | 420 | 420 | 378 | 105 | 36750 |
| 7 | 560 | 560 | 560 | 504 | 140 | 61250 |
| 8 | 720 | 720 | 720 | 648 | 180 | 89250 |
| 9 | 900 | 900 | 900 | 810 | 225 | 120750 |
| 10 | 1100 | 1100 | 1100 | 990 | 275 | 155750 |
| 11 | 1320 | 1320 | 1320 | 1188 | 330 | 194250 |
| 12 | 1560 | 1560 | 1560 | 1404 | 390 | 236250 |
| 13 | 1820 | 1820 | 1820 | 1638 | 455 | 281750 |
| 14 | 2100 | 2100 | 2100 | 1890 | 525 | 355250 |
| 15 | 2400 | 2400 | 2400 | 2160 | 600 | 434000 |
| 16 | 2720 | 2720 | 2720 | 2448 | 680 | 518000 |
| 17 | 3060 | 3060 | 3060 | 2754 | 765 | 607250 |
| 18 | 3420 | 3420 | 3420 | 3078 | 855 | 701750 |
| 19 | 3800 | 3800 | 3800 | 3420 | 950 | 801500 |
| 20 | 4200 | 4200 | 4200 | 3780 | 1050 | 906500 |
| 21 | 8400 | 8400 | 8400 | 7560 | 2100 | 1053500 |
| 22 | 9400 | 9400 | 9400 | 8460 | 2350 | 1242500 |
| 23 | 10600 | 10600 | 10600 | 9540 | 2650 | 1473500 |
| 24 | 12000 | 12000 | 12000 | 10800 | 3000 | 1746500 |
| 25 | 13600 | 13600 | 13600 | 12240 | 3400 | 2061500 |
| 26 | 15600 | 15600 | 15600 | 14040 | 3900 | 2418500 |
| 27 | 17800 | 17800 | 17800 | 16020 | 4450 | 2817500 |
| 28 | 20300 | 20300 | 20300 | 18270 | 5075 | 3258500 |
| 29 | 23100 | 23100 | 23100 | 20790 | 5775 | 3741500 |
| 30 | 26200 | 26200 | 26200 | 23580 | 6550 | 4266500 |

## Politica Magazzino

- **base_uplift_fraction**: `0.4`
- **already_in_economy_table**: `SI`
- **permanent_bonus_cap_fraction**: `0.6`
- **automatic_bonus_fraction**: `0`
- **research_bonus_per_level**: `0.02`
- **research_keys**: `['economy.warehouse_1', 'economy.warehouse_2', 'economy.warehouse_3']`
- **research_only_max_fraction**: `0.3`
- **formula**: `floor(economy[L].warehouse_per_resource * (1 + min(0.60, sum(earned_active_warehouse_bonuses))))`
- **production_bonus_independent**: `SI`
- **production_permanent_cap_fraction**: `0.6`
- **note**: `A cap is not an awarded bonus. Existing production research remains effective. No new source grants the additional 30% warehouse capacity.`

## Progressione Settlement 1-30
| Lv | Stadio | Requisiti | Sblocchi | G | W | C | I | Au | Min |
|---:|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | Village | Stato iniziale | Fattoria/Boscaiolo/Cava/Miniera Ferro/Miniera Oro/Magazzino/Caserma/Universita/Mura/Sala Casata L1 prebuild | - | - | - | - | - | None |
| 2 | Village | Prod1, Mag1, Uni1, Mura1, Cas1 | Tiro con l Arco disponibile | 1000 | 1200 | 1200 | 800 | 100 | 30 |
| 3 | Village | Prod2, Mag2, Uni2, Mura2, Cas2 | Comando Sentinelle; Capacita Marcia | 1450 | 1740 | 1740 | 1160 | 145 | 42 |
| 4 | Village | Prod3, Mag3, Uni3, Mura3, Cas3, Sent1 | - | 2103 | 2523 | 2523 | 1682 | 211 | 59 |
| 5 | Village | Prod4, Mag4, Uni4, Mura4, Cas4, Sent2 | Caravanserraglio | 3049 | 3659 | 3659 | 2439 | 305 | 83 |
| 6 | Village | Prod5, Mag5, Uni5, Mura5, Cas5, Sent3, Carav1 | Tier ricerca B | 4421 | 5305 | 5305 | 3537 | 443 | 116 |
| 7 | Village | Prod6, Mag6, Uni6, Mura6, Cas5, Sent4, Carav2 | Sala Alleanza; specializzazione dopo 3o Insediamento | 6410 | 7692 | 7692 | 5128 | 641 | 162 |
| 8 | Village | Prod7, Mag7, Uni7, Mura7, Cas6, Sent5, Carav3, All1 | Salute/Velocita Marcia | 9295 | 11153 | 11153 | 7436 | 930 | 226 |
| 9 | Village | Prod8, Mag8, Uni8, Mura8, Cas7, Sent6, Carav4, All2 | - | 13477 | 16172 | 16172 | 10782 | 1348 | 317 |
| 10 | Village | Prod9, Mag9, Uni9, Mura9, Cas8, Sent7, Carav5, All3 | Sala di Guerra | 19541 | 23450 | 23450 | 15633 | 1955 | 443 |
| 11 | City | Prod10, Mag10, Uni10, Mura10, Cas8, Sent8, Carav6, All4, Guerra1 | Citta; Scuderia/Equitazione/Cavalleria | 24427 | 29312 | 29312 | 19541 | 2443 | 532 |
| 12 | City | Prod10, Mag11, Uni11, Mura11, Cas9, Sent8, Carav7, Guerra2, Scud1 | - | 30533 | 36640 | 36640 | 24427 | 3054 | 638 |
| 13 | City | Prod11, Mag12, Uni12, Mura12, Cas10, Sent9, Carav8, Guerra3, Scud2 | Intercettazione Carovane | 38166 | 45799 | 45799 | 30533 | 3817 | 766 |
| 14 | City | Prod12, Mag13, Uni13, Mura13, Cas11, Sent10, Carav9, Guerra4, Scud4 | - | 47708 | 57249 | 57249 | 38166 | 4771 | 919 |
| 15 | City | Prod13, Mag14, Uni14, Mura14, Cas12, Sent11, Carav10, Guerra5, Scud7 | Porto se port_eligible; Studi Nautici | 59635 | 71561 | 71561 | 47708 | 5964 | 1102 |
| 16 | City | Prod14, Mag15, Uni15, Mura15, Cas12, Sent12, Carav10, Guerra6, Scud11 | Officina; Catapulta; Costruzione Navale | 74543 | 89452 | 89452 | 59635 | 7455 | 1323 |
| 17 | City | Prod15, Mag16, Uni16, Mura16, Cas13, Sent13, Carav11, Guerra7, Scud12, Off1 | Dottrina Conquista | 93179 | 111814 | 111814 | 74543 | 9318 | 1587 |
| 18 | City | Prod16, Mag17, Uni17, Mura17, Cas14, Sent14, Carav12, Guerra8, Scud13, Off3 | Carro; Perimetro Avanzato; Navigazione avanzata | 116473 | 139768 | 139768 | 93179 | 11648 | 1904 |
| 19 | City | Prod16, Mag18, Uni18, Mura18, Cas15, Sent15, Carav13, Guerra9, Scud14, Off5 | Resistenza Carro | 145591 | 174710 | 174710 | 116473 | 14560 | 2285 |
| 20 | City | Prod17, Mag19, Uni19, Mura19, Cas16, Sent15, Carav14, Guerra10, Scud15, Off8 | Coordinamento Assedio | 181989 | 218387 | 218387 | 145591 | 18199 | 2742 |
| 21 | City | Prod18, Mag20, Uni20, Mura20, Cas17, Sent15, Carav15, Guerra12, Scud16, Off16 | Bestiario; Animali | 209287 | 251145 | 251145 | 167430 | 20929 | 3016 |
| 22 | City | Prod18, Mag21, Uni21, Mura21, Cas18, Sent16, Carav16, Guerra13, Scud17, Off17, Best1 | Maestrie Animali | 240680 | 288816 | 288816 | 192544 | 24068 | 3317 |
| 23 | City | Prod19, Mag22, Uni22, Mura22, Cas19, Sent17, Carav17, Guerra14, Scud18, Off18, Best3 | - | 276782 | 332139 | 332139 | 221426 | 27679 | 3649 |
| 24 | City | Prod20, Mag23, Uni23, Mura23, Cas20, Sent18, Carav18, Guerra15, Scud19, Off19, Best5 | Elefante; Pressione Fedelta | 318300 | 381960 | 381960 | 254640 | 31830 | 4014 |
| 25 | City | Prod21, Mag24, Uni24, Mura24, Cas20, Sent19, Carav19, Guerra16, Scud20, Off20, Best8 | Maestria Elefante | 366045 | 439253 | 439253 | 292836 | 36605 | 4415 |
| 26 | City | Prod22, Mag25, Uni25, Mura25, Cas21, Sent20, Carav20, Guerra18, Scud21, Off21, Best10 | Tier ricerca E | 420951 | 505141 | 505141 | 336761 | 42096 | 4857 |
| 27 | City | Prod23, Mag26, Uni26, Mura26, Cas22, Sent21, Carav21, Guerra20, Scud22, Off22, Best12 | Assedio/Logistica avanzata | 484094 | 580912 | 580912 | 387275 | 48410 | 5343 |
| 28 | City | Prod24, Mag27, Uni27, Mura27, Cas23, Sent22, Carav22, Guerra22, Scud23, Off23, Best14 | Intelligence/Sentinelle finali | 556708 | 668049 | 668049 | 445366 | 55671 | 5877 |
| 29 | City | Prod25, Mag28, Uni28, Mura28, Cas24, Sent23, Carav23, Guerra24, Scud24, Off24, Best16 | Studi del Tempio | 640214 | 768256 | 768256 | 512171 | 64022 | 6464 |
| 30 | Metropolis | Prod26, Mag29, Uni29, Mura29, Cas25, Sent24, Carav24, Guerra25, Scud25, Off25, Best18 | Metropoli; Tempio; Studi Mitici; Santuario Mitico | 736246 | 883495 | 883495 | 588997 | 73625 | 7111 |

## Catalogo edifici (21)
| Edificio | Categoria | Unlock Settlement | Ricerca richiesta | Funzione |
|---|---|---:|---|---|
| Castello / Fortezza | core | 1 | - | Settlement.level; unlock e progressione |
| Fattoria | resource | 1 | - | Produzione Grano |
| Boscaiolo | resource | 1 | - | Produzione Legno |
| Cava d'Argilla | resource | 1 | - | Produzione Argilla |
| Miniera di Ferro | resource | 1 | - | Produzione Ferro |
| Miniera d'Oro | resource | 1 | - | Produzione Oro |
| Magazzino | economy | 1 | - | Hard cap risorse locali |
| Caserma | military | 1 | - | Fanteria e Arcieri |
| Universita | research | 1 | - | 12 rami ricerca, 2 code |
| Mura | defense | 1 | - | HP, DEF, danno statico |
| Sala della Casata | house | 1 | - | Identita Casata, araldica, prestigio |
| Comando Sentinelle | defense | 3 | - | 4 interne; 8 esterne via ricerca |
| Caravanserraglio | logistics | 5 | - | Carovane, capacita e velocita |
| Sala dell'Alleanza | alliance | 7 | - | Supporti, ruoli, tesoreria, campagne |
| Sala di Guerra | military | 10 | - | Capacita singola marcia |
| Scuderia | military | 11 | military.equestrianism | Cavalleria |
| Porto | naval | 15 | navigation.port_construction | Navi trasporto Porto-Porto; solo port_eligible |
| Officina | military | 16 | siege.siege_engineering | Catapulta e Carro di Conquista |
| Bestiario | beast | 21 | animals.beast_studies | Orso, Leone, Falco, Lupo, Elefante |
| Tempio | legendary | 30 | legendary.temple_studies | Drago, Angelo, Demone |
| Santuario Mitico | mythic | 30 | mythic.mythic_studies | 5 livelli speciali; Unicorno player-wide |

## Curva costruzione

- **level1_new_build_fraction_of_level2**: `0.6`
- **cost_step_multiplier**: `{'3-10': 1.45, '11-20': 1.25, '21-30': 1.15}`
- **time_step_multiplier**: `{'3-10': 1.4, '11-20': 1.2, '21-30': 1.1}`
- **rounding**: `Use Decimal from original base; round each resource and integer minutes once after curve and applicable job modifiers. Derived tables are unmodified base display values, not inputs for re-rounding.`
- **runtime_duration_unit**: `integer_minutes`
- **pdf_hour_values_are_display_only**: `SI`
- **special_table_exceptions**: `['Santuario Mitico']`

## FAST early game

- **status**: `ACTIVE`
- **applies_to**: `['settlement_upgrade', 'building_construction', 'building_upgrade']`
- **eligibility_snapshot_at**: `job_start`
- **max_owned_settlements_including_mother**: `3`
- **max_target_level**: `10`
- **cost_multiplier**: `0.7`
- **time_multiplier**: `0.5`
- **excluded**: `['research', 'recruitment', 'naval_ship_production', 'legendary_recruitment', 'mythic_sanctuary', 'unicorn_ritual']`
- **snapshot_rule**: `Eligibility and multipliers are frozen at job start; later acquisition of a fourth settlement does not modify an already-started eligible job.`
- **rounding**: `{'costs': 'ceil_each_resource_after_multiplier', 'duration': 'ceil_to_runtime_minute_after_multiplier'}`

## Costi e tempi esatti edifici (600 righe)
| Edificio | Lv | G | W | C | I | Au | Minuti |
|---|---:|---:|---:|---:|---:|---:|---:|
| Castello / Fortezza | 1 | 600 | 720 | 720 | 480 | 60 | 18 |
| Castello / Fortezza | 2 | 1000 | 1200 | 1200 | 800 | 100 | 30 |
| Castello / Fortezza | 3 | 1450 | 1740 | 1740 | 1160 | 145 | 42 |
| Castello / Fortezza | 4 | 2103 | 2523 | 2523 | 1682 | 211 | 59 |
| Castello / Fortezza | 5 | 3049 | 3659 | 3659 | 2439 | 305 | 83 |
| Castello / Fortezza | 6 | 4421 | 5305 | 5305 | 3537 | 443 | 116 |
| Castello / Fortezza | 7 | 6410 | 7692 | 7692 | 5128 | 641 | 162 |
| Castello / Fortezza | 8 | 9295 | 11153 | 11153 | 7436 | 930 | 226 |
| Castello / Fortezza | 9 | 13477 | 16172 | 16172 | 10782 | 1348 | 317 |
| Castello / Fortezza | 10 | 19541 | 23450 | 23450 | 15633 | 1955 | 443 |
| Castello / Fortezza | 11 | 24427 | 29312 | 29312 | 19541 | 2443 | 532 |
| Castello / Fortezza | 12 | 30533 | 36640 | 36640 | 24427 | 3054 | 638 |
| Castello / Fortezza | 13 | 38166 | 45799 | 45799 | 30533 | 3817 | 766 |
| Castello / Fortezza | 14 | 47708 | 57249 | 57249 | 38166 | 4771 | 919 |
| Castello / Fortezza | 15 | 59635 | 71561 | 71561 | 47708 | 5964 | 1102 |
| Castello / Fortezza | 16 | 74543 | 89452 | 89452 | 59635 | 7455 | 1323 |
| Castello / Fortezza | 17 | 93179 | 111814 | 111814 | 74543 | 9318 | 1587 |
| Castello / Fortezza | 18 | 116473 | 139768 | 139768 | 93179 | 11648 | 1904 |
| Castello / Fortezza | 19 | 145591 | 174710 | 174710 | 116473 | 14560 | 2285 |
| Castello / Fortezza | 20 | 181989 | 218387 | 218387 | 145591 | 18199 | 2742 |
| Castello / Fortezza | 21 | 209287 | 251145 | 251145 | 167430 | 20929 | 3016 |
| Castello / Fortezza | 22 | 240680 | 288816 | 288816 | 192544 | 24068 | 3317 |
| Castello / Fortezza | 23 | 276782 | 332139 | 332139 | 221426 | 27679 | 3649 |
| Castello / Fortezza | 24 | 318300 | 381960 | 381960 | 254640 | 31830 | 4014 |
| Castello / Fortezza | 25 | 366045 | 439253 | 439253 | 292836 | 36605 | 4415 |
| Castello / Fortezza | 26 | 420951 | 505141 | 505141 | 336761 | 42096 | 4857 |
| Castello / Fortezza | 27 | 484094 | 580912 | 580912 | 387275 | 48410 | 5343 |
| Castello / Fortezza | 28 | 556708 | 668049 | 668049 | 445366 | 55671 | 5877 |
| Castello / Fortezza | 29 | 640214 | 768256 | 768256 | 512171 | 64022 | 6464 |
| Castello / Fortezza | 30 | 736246 | 883495 | 883495 | 588997 | 73625 | 7111 |
| Fattoria | 1 | 60 | 150 | 90 | 30 | 0 | 6 |
| Fattoria | 2 | 100 | 250 | 150 | 50 | 0 | 10 |
| Fattoria | 3 | 145 | 363 | 218 | 73 | 0 | 14 |
| Fattoria | 4 | 211 | 526 | 316 | 106 | 0 | 20 |
| Fattoria | 5 | 305 | 763 | 458 | 153 | 0 | 28 |
| Fattoria | 6 | 443 | 1106 | 664 | 222 | 0 | 39 |
| Fattoria | 7 | 641 | 1603 | 962 | 321 | 0 | 54 |
| Fattoria | 8 | 930 | 2324 | 1395 | 465 | 0 | 76 |
| Fattoria | 9 | 1348 | 3370 | 2022 | 674 | 0 | 106 |
| Fattoria | 10 | 1955 | 4886 | 2932 | 978 | 0 | 148 |
| Fattoria | 11 | 2443 | 6107 | 3664 | 1222 | 0 | 178 |
| Fattoria | 12 | 3054 | 7634 | 4580 | 1527 | 0 | 213 |
| Fattoria | 13 | 3817 | 9542 | 5725 | 1909 | 0 | 256 |
| Fattoria | 14 | 4771 | 11927 | 7157 | 2386 | 0 | 307 |
| Fattoria | 15 | 5964 | 14909 | 8946 | 2982 | 0 | 368 |
| Fattoria | 16 | 7455 | 18636 | 11182 | 3728 | 0 | 441 |
| Fattoria | 17 | 9318 | 23295 | 13977 | 4659 | 0 | 529 |
| Fattoria | 18 | 11648 | 29119 | 17471 | 5824 | 0 | 635 |
| Fattoria | 19 | 14560 | 36398 | 21839 | 7280 | 0 | 762 |
| Fattoria | 20 | 18199 | 45498 | 27299 | 9100 | 0 | 914 |
| Fattoria | 21 | 20929 | 52322 | 31394 | 10465 | 0 | 1006 |
| Fattoria | 22 | 24068 | 60170 | 36102 | 12034 | 0 | 1106 |
| Fattoria | 23 | 27679 | 69196 | 41518 | 13840 | 0 | 1217 |
| Fattoria | 24 | 31830 | 79575 | 47745 | 15915 | 0 | 1338 |
| Fattoria | 25 | 36605 | 91512 | 54907 | 18303 | 0 | 1472 |
| Fattoria | 26 | 42096 | 105238 | 63143 | 21048 | 0 | 1619 |
| Fattoria | 27 | 48410 | 121024 | 72614 | 24205 | 0 | 1781 |
| Fattoria | 28 | 55671 | 139177 | 83507 | 27836 | 0 | 1959 |
| Fattoria | 29 | 64022 | 160054 | 96032 | 32011 | 0 | 2155 |
| Fattoria | 30 | 73625 | 184062 | 110437 | 36813 | 0 | 2371 |
| Boscaiolo | 1 | 90 | 60 | 150 | 30 | 0 | 6 |
| Boscaiolo | 2 | 150 | 100 | 250 | 50 | 0 | 10 |
| Boscaiolo | 3 | 218 | 145 | 363 | 73 | 0 | 14 |
| Boscaiolo | 4 | 316 | 211 | 526 | 106 | 0 | 20 |
| Boscaiolo | 5 | 458 | 305 | 763 | 153 | 0 | 28 |
| Boscaiolo | 6 | 664 | 443 | 1106 | 222 | 0 | 39 |
| Boscaiolo | 7 | 962 | 641 | 1603 | 321 | 0 | 54 |
| Boscaiolo | 8 | 1395 | 930 | 2324 | 465 | 0 | 76 |
| Boscaiolo | 9 | 2022 | 1348 | 3370 | 674 | 0 | 106 |
| Boscaiolo | 10 | 2932 | 1955 | 4886 | 978 | 0 | 148 |
| Boscaiolo | 11 | 3664 | 2443 | 6107 | 1222 | 0 | 178 |
| Boscaiolo | 12 | 4580 | 3054 | 7634 | 1527 | 0 | 213 |
| Boscaiolo | 13 | 5725 | 3817 | 9542 | 1909 | 0 | 256 |
| Boscaiolo | 14 | 7157 | 4771 | 11927 | 2386 | 0 | 307 |
| Boscaiolo | 15 | 8946 | 5964 | 14909 | 2982 | 0 | 368 |
| Boscaiolo | 16 | 11182 | 7455 | 18636 | 3728 | 0 | 441 |
| Boscaiolo | 17 | 13977 | 9318 | 23295 | 4659 | 0 | 529 |
| Boscaiolo | 18 | 17471 | 11648 | 29119 | 5824 | 0 | 635 |
| Boscaiolo | 19 | 21839 | 14560 | 36398 | 7280 | 0 | 762 |
| Boscaiolo | 20 | 27299 | 18199 | 45498 | 9100 | 0 | 914 |
| Boscaiolo | 21 | 31394 | 20929 | 52322 | 10465 | 0 | 1006 |
| Boscaiolo | 22 | 36102 | 24068 | 60170 | 12034 | 0 | 1106 |
| Boscaiolo | 23 | 41518 | 27679 | 69196 | 13840 | 0 | 1217 |
| Boscaiolo | 24 | 47745 | 31830 | 79575 | 15915 | 0 | 1338 |
| Boscaiolo | 25 | 54907 | 36605 | 91512 | 18303 | 0 | 1472 |
| Boscaiolo | 26 | 63143 | 42096 | 105238 | 21048 | 0 | 1619 |
| Boscaiolo | 27 | 72614 | 48410 | 121024 | 24205 | 0 | 1781 |
| Boscaiolo | 28 | 83507 | 55671 | 139177 | 27836 | 0 | 1959 |
| Boscaiolo | 29 | 96032 | 64022 | 160054 | 32011 | 0 | 2155 |
| Boscaiolo | 30 | 110437 | 73625 | 184062 | 36813 | 0 | 2371 |
| Cava d'Argilla | 1 | 90 | 150 | 60 | 30 | 0 | 6 |
| Cava d'Argilla | 2 | 150 | 250 | 100 | 50 | 0 | 10 |
| Cava d'Argilla | 3 | 218 | 363 | 145 | 73 | 0 | 14 |
| Cava d'Argilla | 4 | 316 | 526 | 211 | 106 | 0 | 20 |
| Cava d'Argilla | 5 | 458 | 763 | 305 | 153 | 0 | 28 |
| Cava d'Argilla | 6 | 664 | 1106 | 443 | 222 | 0 | 39 |
| Cava d'Argilla | 7 | 962 | 1603 | 641 | 321 | 0 | 54 |
| Cava d'Argilla | 8 | 1395 | 2324 | 930 | 465 | 0 | 76 |
| Cava d'Argilla | 9 | 2022 | 3370 | 1348 | 674 | 0 | 106 |
| Cava d'Argilla | 10 | 2932 | 4886 | 1955 | 978 | 0 | 148 |
| Cava d'Argilla | 11 | 3664 | 6107 | 2443 | 1222 | 0 | 178 |
| Cava d'Argilla | 12 | 4580 | 7634 | 3054 | 1527 | 0 | 213 |
| Cava d'Argilla | 13 | 5725 | 9542 | 3817 | 1909 | 0 | 256 |
| Cava d'Argilla | 14 | 7157 | 11927 | 4771 | 2386 | 0 | 307 |
| Cava d'Argilla | 15 | 8946 | 14909 | 5964 | 2982 | 0 | 368 |
| Cava d'Argilla | 16 | 11182 | 18636 | 7455 | 3728 | 0 | 441 |
| Cava d'Argilla | 17 | 13977 | 23295 | 9318 | 4659 | 0 | 529 |
| Cava d'Argilla | 18 | 17471 | 29119 | 11648 | 5824 | 0 | 635 |
| Cava d'Argilla | 19 | 21839 | 36398 | 14560 | 7280 | 0 | 762 |
| Cava d'Argilla | 20 | 27299 | 45498 | 18199 | 9100 | 0 | 914 |
| Cava d'Argilla | 21 | 31394 | 52322 | 20929 | 10465 | 0 | 1006 |
| Cava d'Argilla | 22 | 36102 | 60170 | 24068 | 12034 | 0 | 1106 |
| Cava d'Argilla | 23 | 41518 | 69196 | 27679 | 13840 | 0 | 1217 |
| Cava d'Argilla | 24 | 47745 | 79575 | 31830 | 15915 | 0 | 1338 |
| Cava d'Argilla | 25 | 54907 | 91512 | 36605 | 18303 | 0 | 1472 |
| Cava d'Argilla | 26 | 63143 | 105238 | 42096 | 21048 | 0 | 1619 |
| Cava d'Argilla | 27 | 72614 | 121024 | 48410 | 24205 | 0 | 1781 |
| Cava d'Argilla | 28 | 83507 | 139177 | 55671 | 27836 | 0 | 1959 |
| Cava d'Argilla | 29 | 96032 | 160054 | 64022 | 32011 | 0 | 2155 |
| Cava d'Argilla | 30 | 110437 | 184062 | 73625 | 36813 | 0 | 2371 |
| Miniera di Ferro | 1 | 120 | 150 | 150 | 60 | 0 | 8 |
| Miniera di Ferro | 2 | 200 | 250 | 250 | 100 | 0 | 12 |
| Miniera di Ferro | 3 | 290 | 363 | 363 | 145 | 0 | 17 |
| Miniera di Ferro | 4 | 421 | 526 | 526 | 211 | 0 | 24 |
| Miniera di Ferro | 5 | 610 | 763 | 763 | 305 | 0 | 33 |
| Miniera di Ferro | 6 | 885 | 1106 | 1106 | 443 | 0 | 47 |
| Miniera di Ferro | 7 | 1282 | 1603 | 1603 | 641 | 0 | 65 |
| Miniera di Ferro | 8 | 1859 | 2324 | 2324 | 930 | 0 | 91 |
| Miniera di Ferro | 9 | 2696 | 3370 | 3370 | 1348 | 0 | 127 |
| Miniera di Ferro | 10 | 3909 | 4886 | 4886 | 1955 | 0 | 178 |
| Miniera di Ferro | 11 | 4886 | 6107 | 6107 | 2443 | 0 | 213 |
| Miniera di Ferro | 12 | 6107 | 7634 | 7634 | 3054 | 0 | 256 |
| Miniera di Ferro | 13 | 7634 | 9542 | 9542 | 3817 | 0 | 307 |
| Miniera di Ferro | 14 | 9542 | 11927 | 11927 | 4771 | 0 | 368 |
| Miniera di Ferro | 15 | 11927 | 14909 | 14909 | 5964 | 0 | 441 |
| Miniera di Ferro | 16 | 14909 | 18636 | 18636 | 7455 | 0 | 529 |
| Miniera di Ferro | 17 | 18636 | 23295 | 23295 | 9318 | 0 | 635 |
| Miniera di Ferro | 18 | 23295 | 29119 | 29119 | 11648 | 0 | 762 |
| Miniera di Ferro | 19 | 29119 | 36398 | 36398 | 14560 | 0 | 914 |
| Miniera di Ferro | 20 | 36398 | 45498 | 45498 | 18199 | 0 | 1097 |
| Miniera di Ferro | 21 | 41858 | 52322 | 52322 | 20929 | 0 | 1207 |
| Miniera di Ferro | 22 | 48136 | 60170 | 60170 | 24068 | 0 | 1327 |
| Miniera di Ferro | 23 | 55357 | 69196 | 69196 | 27679 | 0 | 1460 |
| Miniera di Ferro | 24 | 63660 | 79575 | 79575 | 31830 | 0 | 1606 |
| Miniera di Ferro | 25 | 73209 | 91512 | 91512 | 36605 | 0 | 1766 |
| Miniera di Ferro | 26 | 84191 | 105238 | 105238 | 42096 | 0 | 1943 |
| Miniera di Ferro | 27 | 96819 | 121024 | 121024 | 48410 | 0 | 2137 |
| Miniera di Ferro | 28 | 111342 | 139177 | 139177 | 55671 | 0 | 2351 |
| Miniera di Ferro | 29 | 128043 | 160054 | 160054 | 64022 | 0 | 2586 |
| Miniera di Ferro | 30 | 147250 | 184062 | 184062 | 73625 | 0 | 2845 |
| Miniera d'Oro | 1 | 180 | 180 | 180 | 150 | 30 | 9 |
| Miniera d'Oro | 2 | 300 | 300 | 300 | 250 | 50 | 15 |
| Miniera d'Oro | 3 | 435 | 435 | 435 | 363 | 73 | 21 |
| Miniera d'Oro | 4 | 631 | 631 | 631 | 526 | 106 | 30 |
| Miniera d'Oro | 5 | 915 | 915 | 915 | 763 | 153 | 42 |
| Miniera d'Oro | 6 | 1327 | 1327 | 1327 | 1106 | 222 | 58 |
| Miniera d'Oro | 7 | 1923 | 1923 | 1923 | 1603 | 321 | 81 |
| Miniera d'Oro | 8 | 2789 | 2789 | 2789 | 2324 | 465 | 113 |
| Miniera d'Oro | 9 | 4043 | 4043 | 4043 | 3370 | 674 | 159 |
| Miniera d'Oro | 10 | 5863 | 5863 | 5863 | 4886 | 978 | 222 |
| Miniera d'Oro | 11 | 7328 | 7328 | 7328 | 6107 | 1222 | 266 |
| Miniera d'Oro | 12 | 9160 | 9160 | 9160 | 7634 | 1527 | 319 |
| Miniera d'Oro | 13 | 11450 | 11450 | 11450 | 9542 | 1909 | 383 |
| Miniera d'Oro | 14 | 14313 | 14313 | 14313 | 11927 | 2386 | 460 |
| Miniera d'Oro | 15 | 17891 | 17891 | 17891 | 14909 | 2982 | 551 |
| Miniera d'Oro | 16 | 22363 | 22363 | 22363 | 18636 | 3728 | 662 |
| Miniera d'Oro | 17 | 27954 | 27954 | 27954 | 23295 | 4659 | 794 |
| Miniera d'Oro | 18 | 34942 | 34942 | 34942 | 29119 | 5824 | 952 |
| Miniera d'Oro | 19 | 43678 | 43678 | 43678 | 36398 | 7280 | 1143 |
| Miniera d'Oro | 20 | 54597 | 54597 | 54597 | 45498 | 9100 | 1371 |
| Miniera d'Oro | 21 | 62787 | 62787 | 62787 | 52322 | 10465 | 1508 |
| Miniera d'Oro | 22 | 72204 | 72204 | 72204 | 60170 | 12034 | 1659 |
| Miniera d'Oro | 23 | 83035 | 83035 | 83035 | 69196 | 13840 | 1825 |
| Miniera d'Oro | 24 | 95490 | 95490 | 95490 | 79575 | 15915 | 2007 |
| Miniera d'Oro | 25 | 109814 | 109814 | 109814 | 91512 | 18303 | 2208 |
| Miniera d'Oro | 26 | 126286 | 126286 | 126286 | 105238 | 21048 | 2429 |
| Miniera d'Oro | 27 | 145228 | 145228 | 145228 | 121024 | 24205 | 2672 |
| Miniera d'Oro | 28 | 167013 | 167013 | 167013 | 139177 | 27836 | 2939 |
| Miniera d'Oro | 29 | 192064 | 192064 | 192064 | 160054 | 32011 | 3232 |
| Miniera d'Oro | 30 | 220874 | 220874 | 220874 | 184062 | 36813 | 3556 |
| Magazzino | 1 | 150 | 240 | 240 | 120 | 12 | 12 |
| Magazzino | 2 | 250 | 400 | 400 | 200 | 20 | 20 |
| Magazzino | 3 | 363 | 580 | 580 | 290 | 29 | 28 |
| Magazzino | 4 | 526 | 841 | 841 | 421 | 43 | 40 |
| Magazzino | 5 | 763 | 1220 | 1220 | 610 | 61 | 55 |
| Magazzino | 6 | 1106 | 1769 | 1769 | 885 | 89 | 77 |
| Magazzino | 7 | 1603 | 2564 | 2564 | 1282 | 129 | 108 |
| Magazzino | 8 | 2324 | 3718 | 3718 | 1859 | 186 | 151 |
| Magazzino | 9 | 3370 | 5391 | 5391 | 2696 | 270 | 211 |
| Magazzino | 10 | 4886 | 7817 | 7817 | 3909 | 391 | 296 |
| Magazzino | 11 | 6107 | 9771 | 9771 | 4886 | 489 | 355 |
| Magazzino | 12 | 7634 | 12214 | 12214 | 6107 | 611 | 426 |
| Magazzino | 13 | 9542 | 15267 | 15267 | 7634 | 764 | 511 |
| Magazzino | 14 | 11927 | 19083 | 19083 | 9542 | 955 | 613 |
| Magazzino | 15 | 14909 | 23854 | 23854 | 11927 | 1193 | 735 |
| Magazzino | 16 | 18636 | 29818 | 29818 | 14909 | 1491 | 882 |
| Magazzino | 17 | 23295 | 37272 | 37272 | 18636 | 1864 | 1058 |
| Magazzino | 18 | 29119 | 46590 | 46590 | 23295 | 2330 | 1270 |
| Magazzino | 19 | 36398 | 58237 | 58237 | 29119 | 2912 | 1523 |
| Magazzino | 20 | 45498 | 72796 | 72796 | 36398 | 3640 | 1828 |
| Magazzino | 21 | 52322 | 83715 | 83715 | 41858 | 4186 | 2011 |
| Magazzino | 22 | 60170 | 96272 | 96272 | 48136 | 4814 | 2212 |
| Magazzino | 23 | 69196 | 110713 | 110713 | 55357 | 5536 | 2433 |
| Magazzino | 24 | 79575 | 127320 | 127320 | 63660 | 6366 | 2676 |
| Magazzino | 25 | 91512 | 146418 | 146418 | 73209 | 7321 | 2944 |
| Magazzino | 26 | 105238 | 168381 | 168381 | 84191 | 8420 | 3238 |
| Magazzino | 27 | 121024 | 193638 | 193638 | 96819 | 9682 | 3562 |
| Magazzino | 28 | 139177 | 222683 | 222683 | 111342 | 11135 | 3918 |
| Magazzino | 29 | 160054 | 256086 | 256086 | 128043 | 12805 | 4310 |
| Magazzino | 30 | 184062 | 294499 | 294499 | 147250 | 14725 | 4741 |
| Caserma | 1 | 180 | 270 | 210 | 150 | 12 | 15 |
| Caserma | 2 | 300 | 450 | 350 | 250 | 20 | 25 |
| Caserma | 3 | 435 | 653 | 508 | 363 | 29 | 35 |
| Caserma | 4 | 631 | 947 | 736 | 526 | 43 | 49 |
| Caserma | 5 | 915 | 1372 | 1068 | 763 | 61 | 69 |
| Caserma | 6 | 1327 | 1990 | 1548 | 1106 | 89 | 97 |
| Caserma | 7 | 1923 | 2885 | 2244 | 1603 | 129 | 135 |
| Caserma | 8 | 2789 | 4183 | 3253 | 2324 | 186 | 189 |
| Caserma | 9 | 4043 | 6065 | 4717 | 3370 | 270 | 264 |
| Caserma | 10 | 5863 | 8794 | 6840 | 4886 | 391 | 369 |
| Caserma | 11 | 7328 | 10992 | 8550 | 6107 | 489 | 443 |
| Caserma | 12 | 9160 | 13740 | 10687 | 7634 | 611 | 532 |
| Caserma | 13 | 11450 | 17175 | 13359 | 9542 | 764 | 638 |
| Caserma | 14 | 14313 | 21469 | 16698 | 11927 | 955 | 766 |
| Caserma | 15 | 17891 | 26836 | 20872 | 14909 | 1193 | 919 |
| Caserma | 16 | 22363 | 33545 | 26090 | 18636 | 1491 | 1102 |
| Caserma | 17 | 27954 | 41931 | 32613 | 23295 | 1864 | 1323 |
| Caserma | 18 | 34942 | 52413 | 40766 | 29119 | 2330 | 1587 |
| Caserma | 19 | 43678 | 65516 | 50957 | 36398 | 2912 | 1904 |
| Caserma | 20 | 54597 | 81895 | 63697 | 45498 | 3640 | 2285 |
| Caserma | 21 | 62787 | 94180 | 73251 | 52322 | 4186 | 2513 |
| Caserma | 22 | 72204 | 108306 | 84238 | 60170 | 4814 | 2765 |
| Caserma | 23 | 83035 | 124552 | 96874 | 69196 | 5536 | 3041 |
| Caserma | 24 | 95490 | 143235 | 111405 | 79575 | 6366 | 3345 |
| Caserma | 25 | 109814 | 164720 | 128116 | 91512 | 7321 | 3680 |
| Caserma | 26 | 126286 | 189428 | 147333 | 105238 | 8420 | 4047 |
| Caserma | 27 | 145228 | 217842 | 169433 | 121024 | 9682 | 4452 |
| Caserma | 28 | 167013 | 250519 | 194848 | 139177 | 11135 | 4897 |
| Caserma | 29 | 192064 | 288096 | 224075 | 160054 | 12805 | 5387 |
| Caserma | 30 | 220874 | 331311 | 257686 | 184062 | 14725 | 5926 |
| Universita | 1 | 300 | 420 | 420 | 300 | 60 | 27 |
| Universita | 2 | 500 | 700 | 700 | 500 | 100 | 45 |
| Universita | 3 | 725 | 1015 | 1015 | 725 | 145 | 63 |
| Universita | 4 | 1052 | 1472 | 1472 | 1052 | 211 | 89 |
| Universita | 5 | 1525 | 2135 | 2135 | 1525 | 305 | 124 |
| Universita | 6 | 2211 | 3095 | 3095 | 2211 | 443 | 173 |
| Universita | 7 | 3205 | 4487 | 4487 | 3205 | 641 | 243 |
| Universita | 8 | 4648 | 6506 | 6506 | 4648 | 930 | 339 |
| Universita | 9 | 6739 | 9434 | 9434 | 6739 | 1348 | 475 |
| Universita | 10 | 9771 | 13679 | 13679 | 9771 | 1955 | 665 |
| Universita | 11 | 12214 | 17099 | 17099 | 12214 | 2443 | 797 |
| Universita | 12 | 15267 | 21373 | 21373 | 15267 | 3054 | 957 |
| Universita | 13 | 19083 | 26717 | 26717 | 19083 | 3817 | 1148 |
| Universita | 14 | 23854 | 33396 | 33396 | 23854 | 4771 | 1378 |
| Universita | 15 | 29818 | 41744 | 41744 | 29818 | 5964 | 1653 |
| Universita | 16 | 37272 | 52180 | 52180 | 37272 | 7455 | 1984 |
| Universita | 17 | 46590 | 65225 | 65225 | 46590 | 9318 | 2380 |
| Universita | 18 | 58237 | 81531 | 81531 | 58237 | 11648 | 2856 |
| Universita | 19 | 72796 | 101914 | 101914 | 72796 | 14560 | 3427 |
| Universita | 20 | 90995 | 127393 | 127393 | 90995 | 18199 | 4112 |
| Universita | 21 | 104644 | 146501 | 146501 | 104644 | 20929 | 4524 |
| Universita | 22 | 120340 | 168476 | 168476 | 120340 | 24068 | 4976 |
| Universita | 23 | 138391 | 193748 | 193748 | 138391 | 27679 | 5474 |
| Universita | 24 | 159150 | 222810 | 222810 | 159150 | 31830 | 6021 |
| Universita | 25 | 183023 | 256231 | 256231 | 183023 | 36605 | 6623 |
| Universita | 26 | 210476 | 294666 | 294666 | 210476 | 42096 | 7285 |
| Universita | 27 | 242047 | 338866 | 338866 | 242047 | 48410 | 8014 |
| Universita | 28 | 278354 | 389696 | 389696 | 278354 | 55671 | 8815 |
| Universita | 29 | 320107 | 448150 | 448150 | 320107 | 64022 | 9696 |
| Universita | 30 | 368123 | 515372 | 515372 | 368123 | 73625 | 10666 |
| Mura | 1 | 240 | 480 | 540 | 300 | 30 | 36 |
| Mura | 2 | 400 | 800 | 900 | 500 | 50 | 60 |
| Mura | 3 | 580 | 1160 | 1305 | 725 | 73 | 84 |
| Mura | 4 | 841 | 1682 | 1893 | 1052 | 106 | 118 |
| Mura | 5 | 1220 | 2439 | 2744 | 1525 | 153 | 165 |
| Mura | 6 | 1769 | 3537 | 3979 | 2211 | 222 | 231 |
| Mura | 7 | 2564 | 5128 | 5769 | 3205 | 321 | 323 |
| Mura | 8 | 3718 | 7436 | 8365 | 4648 | 465 | 452 |
| Mura | 9 | 5391 | 10782 | 12129 | 6739 | 674 | 633 |
| Mura | 10 | 7817 | 15633 | 17587 | 9771 | 978 | 886 |
| Mura | 11 | 9771 | 19541 | 21984 | 12214 | 1222 | 1063 |
| Mura | 12 | 12214 | 24427 | 27480 | 15267 | 1527 | 1276 |
| Mura | 13 | 15267 | 30533 | 34350 | 19083 | 1909 | 1531 |
| Mura | 14 | 19083 | 38166 | 42937 | 23854 | 2386 | 1837 |
| Mura | 15 | 23854 | 47708 | 53671 | 29818 | 2982 | 2204 |
| Mura | 16 | 29818 | 59635 | 67089 | 37272 | 3728 | 2645 |
| Mura | 17 | 37272 | 74543 | 83861 | 46590 | 4659 | 3173 |
| Mura | 18 | 46590 | 93179 | 104826 | 58237 | 5824 | 3808 |
| Mura | 19 | 58237 | 116473 | 131032 | 72796 | 7280 | 4569 |
| Mura | 20 | 72796 | 145591 | 163790 | 90995 | 9100 | 5483 |
| Mura | 21 | 83715 | 167430 | 188359 | 104644 | 10465 | 6031 |
| Mura | 22 | 96272 | 192544 | 216612 | 120340 | 12034 | 6634 |
| Mura | 23 | 110713 | 221426 | 249104 | 138391 | 13840 | 7298 |
| Mura | 24 | 127320 | 254640 | 286470 | 159150 | 15915 | 8028 |
| Mura | 25 | 146418 | 292836 | 329440 | 183023 | 18303 | 8830 |
| Mura | 26 | 168381 | 336761 | 378856 | 210476 | 21048 | 9713 |
| Mura | 27 | 193638 | 387275 | 435684 | 242047 | 24205 | 10685 |
| Mura | 28 | 222683 | 445366 | 501037 | 278354 | 27836 | 11753 |
| Mura | 29 | 256086 | 512171 | 576192 | 320107 | 32011 | 12928 |
| Mura | 30 | 294499 | 588997 | 662621 | 368123 | 36813 | 14221 |
| Sala della Casata | 1 | 120 | 180 | 180 | 90 | 12 | 12 |
| Sala della Casata | 2 | 200 | 300 | 300 | 150 | 20 | 20 |
| Sala della Casata | 3 | 290 | 435 | 435 | 218 | 29 | 28 |
| Sala della Casata | 4 | 421 | 631 | 631 | 316 | 43 | 40 |
| Sala della Casata | 5 | 610 | 915 | 915 | 458 | 61 | 55 |
| Sala della Casata | 6 | 885 | 1327 | 1327 | 664 | 89 | 77 |
| Sala della Casata | 7 | 1282 | 1923 | 1923 | 962 | 129 | 108 |
| Sala della Casata | 8 | 1859 | 2789 | 2789 | 1395 | 186 | 151 |
| Sala della Casata | 9 | 2696 | 4043 | 4043 | 2022 | 270 | 211 |
| Sala della Casata | 10 | 3909 | 5863 | 5863 | 2932 | 391 | 296 |
| Sala della Casata | 11 | 4886 | 7328 | 7328 | 3664 | 489 | 355 |
| Sala della Casata | 12 | 6107 | 9160 | 9160 | 4580 | 611 | 426 |
| Sala della Casata | 13 | 7634 | 11450 | 11450 | 5725 | 764 | 511 |
| Sala della Casata | 14 | 9542 | 14313 | 14313 | 7157 | 955 | 613 |
| Sala della Casata | 15 | 11927 | 17891 | 17891 | 8946 | 1193 | 735 |
| Sala della Casata | 16 | 14909 | 22363 | 22363 | 11182 | 1491 | 882 |
| Sala della Casata | 17 | 18636 | 27954 | 27954 | 13977 | 1864 | 1058 |
| Sala della Casata | 18 | 23295 | 34942 | 34942 | 17471 | 2330 | 1270 |
| Sala della Casata | 19 | 29119 | 43678 | 43678 | 21839 | 2912 | 1523 |
| Sala della Casata | 20 | 36398 | 54597 | 54597 | 27299 | 3640 | 1828 |
| Sala della Casata | 21 | 41858 | 62787 | 62787 | 31394 | 4186 | 2011 |
| Sala della Casata | 22 | 48136 | 72204 | 72204 | 36102 | 4814 | 2212 |
| Sala della Casata | 23 | 55357 | 83035 | 83035 | 41518 | 5536 | 2433 |
| Sala della Casata | 24 | 63660 | 95490 | 95490 | 47745 | 6366 | 2676 |
| Sala della Casata | 25 | 73209 | 109814 | 109814 | 54907 | 7321 | 2944 |
| Sala della Casata | 26 | 84191 | 126286 | 126286 | 63143 | 8420 | 3238 |
| Sala della Casata | 27 | 96819 | 145228 | 145228 | 72614 | 9682 | 3562 |
| Sala della Casata | 28 | 111342 | 167013 | 167013 | 83507 | 11135 | 3918 |
| Sala della Casata | 29 | 128043 | 192064 | 192064 | 96032 | 12805 | 4310 |
| Sala della Casata | 30 | 147250 | 220874 | 220874 | 110437 | 14725 | 4741 |
| Comando Sentinelle | 1 | 210 | 330 | 300 | 180 | 24 | 18 |
| Comando Sentinelle | 2 | 350 | 550 | 500 | 300 | 40 | 30 |
| Comando Sentinelle | 3 | 508 | 798 | 725 | 435 | 58 | 42 |
| Comando Sentinelle | 4 | 736 | 1157 | 1052 | 631 | 85 | 59 |
| Comando Sentinelle | 5 | 1068 | 1677 | 1525 | 915 | 122 | 83 |
| Comando Sentinelle | 6 | 1548 | 2432 | 2211 | 1327 | 177 | 116 |
| Comando Sentinelle | 7 | 2244 | 3526 | 3205 | 1923 | 257 | 162 |
| Comando Sentinelle | 8 | 3253 | 5112 | 4648 | 2789 | 372 | 226 |
| Comando Sentinelle | 9 | 4717 | 7413 | 6739 | 4043 | 540 | 317 |
| Comando Sentinelle | 10 | 6840 | 10748 | 9771 | 5863 | 782 | 443 |
| Comando Sentinelle | 11 | 8550 | 13435 | 12214 | 7328 | 978 | 532 |
| Comando Sentinelle | 12 | 10687 | 16793 | 15267 | 9160 | 1222 | 638 |
| Comando Sentinelle | 13 | 13359 | 20992 | 19083 | 11450 | 1527 | 766 |
| Comando Sentinelle | 14 | 16698 | 26239 | 23854 | 14313 | 1909 | 919 |
| Comando Sentinelle | 15 | 20872 | 32799 | 29818 | 17891 | 2386 | 1102 |
| Comando Sentinelle | 16 | 26090 | 40999 | 37272 | 22363 | 2982 | 1323 |
| Comando Sentinelle | 17 | 32613 | 51248 | 46590 | 27954 | 3728 | 1587 |
| Comando Sentinelle | 18 | 40766 | 64060 | 58237 | 34942 | 4659 | 1904 |
| Comando Sentinelle | 19 | 50957 | 80075 | 72796 | 43678 | 5824 | 2285 |
| Comando Sentinelle | 20 | 63697 | 100094 | 90995 | 54597 | 7280 | 2742 |
| Comando Sentinelle | 21 | 73251 | 115108 | 104644 | 62787 | 8372 | 3016 |
| Comando Sentinelle | 22 | 84238 | 132374 | 120340 | 72204 | 9628 | 3317 |
| Comando Sentinelle | 23 | 96874 | 152231 | 138391 | 83035 | 11072 | 3649 |
| Comando Sentinelle | 24 | 111405 | 175065 | 159150 | 95490 | 12732 | 4014 |
| Comando Sentinelle | 25 | 128116 | 201325 | 183023 | 109814 | 14642 | 4415 |
| Comando Sentinelle | 26 | 147333 | 231523 | 210476 | 126286 | 16839 | 4857 |
| Comando Sentinelle | 27 | 169433 | 266252 | 242047 | 145228 | 19364 | 5343 |
| Comando Sentinelle | 28 | 194848 | 306189 | 278354 | 167013 | 22269 | 5877 |
| Comando Sentinelle | 29 | 224075 | 352118 | 320107 | 192064 | 25609 | 6464 |
| Comando Sentinelle | 30 | 257686 | 404935 | 368123 | 220874 | 29450 | 7111 |
| Caravanserraglio | 1 | 150 | 300 | 240 | 150 | 18 | 15 |
| Caravanserraglio | 2 | 250 | 500 | 400 | 250 | 30 | 25 |
| Caravanserraglio | 3 | 363 | 725 | 580 | 363 | 44 | 35 |
| Caravanserraglio | 4 | 526 | 1052 | 841 | 526 | 64 | 49 |
| Caravanserraglio | 5 | 763 | 1525 | 1220 | 763 | 92 | 69 |
| Caravanserraglio | 6 | 1106 | 2211 | 1769 | 1106 | 133 | 97 |
| Caravanserraglio | 7 | 1603 | 3205 | 2564 | 1603 | 193 | 135 |
| Caravanserraglio | 8 | 2324 | 4648 | 3718 | 2324 | 279 | 189 |
| Caravanserraglio | 9 | 3370 | 6739 | 5391 | 3370 | 405 | 264 |
| Caravanserraglio | 10 | 4886 | 9771 | 7817 | 4886 | 587 | 369 |
| Caravanserraglio | 11 | 6107 | 12214 | 9771 | 6107 | 733 | 443 |
| Caravanserraglio | 12 | 7634 | 15267 | 12214 | 7634 | 916 | 532 |
| Caravanserraglio | 13 | 9542 | 19083 | 15267 | 9542 | 1145 | 638 |
| Caravanserraglio | 14 | 11927 | 23854 | 19083 | 11927 | 1432 | 766 |
| Caravanserraglio | 15 | 14909 | 29818 | 23854 | 14909 | 1790 | 919 |
| Caravanserraglio | 16 | 18636 | 37272 | 29818 | 18636 | 2237 | 1102 |
| Caravanserraglio | 17 | 23295 | 46590 | 37272 | 23295 | 2796 | 1323 |
| Caravanserraglio | 18 | 29119 | 58237 | 46590 | 29119 | 3495 | 1587 |
| Caravanserraglio | 19 | 36398 | 72796 | 58237 | 36398 | 4368 | 1904 |
| Caravanserraglio | 20 | 45498 | 90995 | 72796 | 45498 | 5460 | 2285 |
| Caravanserraglio | 21 | 52322 | 104644 | 83715 | 52322 | 6279 | 2513 |
| Caravanserraglio | 22 | 60170 | 120340 | 96272 | 60170 | 7221 | 2765 |
| Caravanserraglio | 23 | 69196 | 138391 | 110713 | 69196 | 8304 | 3041 |
| Caravanserraglio | 24 | 79575 | 159150 | 127320 | 79575 | 9549 | 3345 |
| Caravanserraglio | 25 | 91512 | 183023 | 146418 | 91512 | 10982 | 3680 |
| Caravanserraglio | 26 | 105238 | 210476 | 168381 | 105238 | 12629 | 4047 |
| Caravanserraglio | 27 | 121024 | 242047 | 193638 | 121024 | 14523 | 4452 |
| Caravanserraglio | 28 | 139177 | 278354 | 222683 | 139177 | 16702 | 4897 |
| Caravanserraglio | 29 | 160054 | 320107 | 256086 | 160054 | 19207 | 5387 |
| Caravanserraglio | 30 | 184062 | 368123 | 294499 | 184062 | 22088 | 5926 |
| Sala dell'Alleanza | 1 | 180 | 330 | 270 | 210 | 30 | 18 |
| Sala dell'Alleanza | 2 | 300 | 550 | 450 | 350 | 50 | 30 |
| Sala dell'Alleanza | 3 | 435 | 798 | 653 | 508 | 73 | 42 |
| Sala dell'Alleanza | 4 | 631 | 1157 | 947 | 736 | 106 | 59 |
| Sala dell'Alleanza | 5 | 915 | 1677 | 1372 | 1068 | 153 | 83 |
| Sala dell'Alleanza | 6 | 1327 | 2432 | 1990 | 1548 | 222 | 116 |
| Sala dell'Alleanza | 7 | 1923 | 3526 | 2885 | 2244 | 321 | 162 |
| Sala dell'Alleanza | 8 | 2789 | 5112 | 4183 | 3253 | 465 | 226 |
| Sala dell'Alleanza | 9 | 4043 | 7413 | 6065 | 4717 | 674 | 317 |
| Sala dell'Alleanza | 10 | 5863 | 10748 | 8794 | 6840 | 978 | 443 |
| Sala dell'Alleanza | 11 | 7328 | 13435 | 10992 | 8550 | 1222 | 532 |
| Sala dell'Alleanza | 12 | 9160 | 16793 | 13740 | 10687 | 1527 | 638 |
| Sala dell'Alleanza | 13 | 11450 | 20992 | 17175 | 13359 | 1909 | 766 |
| Sala dell'Alleanza | 14 | 14313 | 26239 | 21469 | 16698 | 2386 | 919 |
| Sala dell'Alleanza | 15 | 17891 | 32799 | 26836 | 20872 | 2982 | 1102 |
| Sala dell'Alleanza | 16 | 22363 | 40999 | 33545 | 26090 | 3728 | 1323 |
| Sala dell'Alleanza | 17 | 27954 | 51248 | 41931 | 32613 | 4659 | 1587 |
| Sala dell'Alleanza | 18 | 34942 | 64060 | 52413 | 40766 | 5824 | 1904 |
| Sala dell'Alleanza | 19 | 43678 | 80075 | 65516 | 50957 | 7280 | 2285 |
| Sala dell'Alleanza | 20 | 54597 | 100094 | 81895 | 63697 | 9100 | 2742 |
| Sala dell'Alleanza | 21 | 62787 | 115108 | 94180 | 73251 | 10465 | 3016 |
| Sala dell'Alleanza | 22 | 72204 | 132374 | 108306 | 84238 | 12034 | 3317 |
| Sala dell'Alleanza | 23 | 83035 | 152231 | 124552 | 96874 | 13840 | 3649 |
| Sala dell'Alleanza | 24 | 95490 | 175065 | 143235 | 111405 | 15915 | 4014 |
| Sala dell'Alleanza | 25 | 109814 | 201325 | 164720 | 128116 | 18303 | 4415 |
| Sala dell'Alleanza | 26 | 126286 | 231523 | 189428 | 147333 | 21048 | 4857 |
| Sala dell'Alleanza | 27 | 145228 | 266252 | 217842 | 169433 | 24205 | 5343 |
| Sala dell'Alleanza | 28 | 167013 | 306189 | 250519 | 194848 | 27836 | 5877 |
| Sala dell'Alleanza | 29 | 192064 | 352118 | 288096 | 224075 | 32011 | 6464 |
| Sala dell'Alleanza | 30 | 220874 | 404935 | 331311 | 257686 | 36813 | 7111 |
| Sala di Guerra | 1 | 240 | 360 | 300 | 300 | 36 | 21 |
| Sala di Guerra | 2 | 400 | 600 | 500 | 500 | 60 | 35 |
| Sala di Guerra | 3 | 580 | 870 | 725 | 725 | 87 | 49 |
| Sala di Guerra | 4 | 841 | 1262 | 1052 | 1052 | 127 | 69 |
| Sala di Guerra | 5 | 1220 | 1830 | 1525 | 1525 | 183 | 97 |
| Sala di Guerra | 6 | 1769 | 2653 | 2211 | 2211 | 266 | 135 |
| Sala di Guerra | 7 | 2564 | 3846 | 3205 | 3205 | 385 | 189 |
| Sala di Guerra | 8 | 3718 | 5577 | 4648 | 4648 | 558 | 264 |
| Sala di Guerra | 9 | 5391 | 8086 | 6739 | 6739 | 809 | 369 |
| Sala di Guerra | 10 | 7817 | 11725 | 9771 | 9771 | 1173 | 517 |
| Sala di Guerra | 11 | 9771 | 14656 | 12214 | 12214 | 1466 | 620 |
| Sala di Guerra | 12 | 12214 | 18320 | 15267 | 15267 | 1832 | 744 |
| Sala di Guerra | 13 | 15267 | 22900 | 19083 | 19083 | 2290 | 893 |
| Sala di Guerra | 14 | 19083 | 28625 | 23854 | 23854 | 2863 | 1072 |
| Sala di Guerra | 15 | 23854 | 35781 | 29818 | 29818 | 3579 | 1286 |
| Sala di Guerra | 16 | 29818 | 44726 | 37272 | 37272 | 4473 | 1543 |
| Sala di Guerra | 17 | 37272 | 55907 | 46590 | 46590 | 5591 | 1851 |
| Sala di Guerra | 18 | 46590 | 69884 | 58237 | 58237 | 6989 | 2221 |
| Sala di Guerra | 19 | 58237 | 87355 | 72796 | 72796 | 8736 | 2666 |
| Sala di Guerra | 20 | 72796 | 109194 | 90995 | 90995 | 10920 | 3199 |
| Sala di Guerra | 21 | 83715 | 125573 | 104644 | 104644 | 12558 | 3519 |
| Sala di Guerra | 22 | 96272 | 144408 | 120340 | 120340 | 14441 | 3870 |
| Sala di Guerra | 23 | 110713 | 166070 | 138391 | 138391 | 16607 | 4257 |
| Sala di Guerra | 24 | 127320 | 190980 | 159150 | 159150 | 19098 | 4683 |
| Sala di Guerra | 25 | 146418 | 219627 | 183023 | 183023 | 21963 | 5151 |
| Sala di Guerra | 26 | 168381 | 252571 | 210476 | 210476 | 25258 | 5666 |
| Sala di Guerra | 27 | 193638 | 290456 | 242047 | 242047 | 29046 | 6233 |
| Sala di Guerra | 28 | 222683 | 334025 | 278354 | 278354 | 33403 | 6856 |
| Sala di Guerra | 29 | 256086 | 384128 | 320107 | 320107 | 38413 | 7542 |
| Sala di Guerra | 30 | 294499 | 441748 | 368123 | 368123 | 44175 | 8296 |
| Scuderia | 1 | 270 | 360 | 300 | 360 | 36 | 21 |
| Scuderia | 2 | 450 | 600 | 500 | 600 | 60 | 35 |
| Scuderia | 3 | 653 | 870 | 725 | 870 | 87 | 49 |
| Scuderia | 4 | 947 | 1262 | 1052 | 1262 | 127 | 69 |
| Scuderia | 5 | 1372 | 1830 | 1525 | 1830 | 183 | 97 |
| Scuderia | 6 | 1990 | 2653 | 2211 | 2653 | 266 | 135 |
| Scuderia | 7 | 2885 | 3846 | 3205 | 3846 | 385 | 189 |
| Scuderia | 8 | 4183 | 5577 | 4648 | 5577 | 558 | 264 |
| Scuderia | 9 | 6065 | 8086 | 6739 | 8086 | 809 | 369 |
| Scuderia | 10 | 8794 | 11725 | 9771 | 11725 | 1173 | 517 |
| Scuderia | 11 | 10992 | 14656 | 12214 | 14656 | 1466 | 620 |
| Scuderia | 12 | 13740 | 18320 | 15267 | 18320 | 1832 | 744 |
| Scuderia | 13 | 17175 | 22900 | 19083 | 22900 | 2290 | 893 |
| Scuderia | 14 | 21469 | 28625 | 23854 | 28625 | 2863 | 1072 |
| Scuderia | 15 | 26836 | 35781 | 29818 | 35781 | 3579 | 1286 |
| Scuderia | 16 | 33545 | 44726 | 37272 | 44726 | 4473 | 1543 |
| Scuderia | 17 | 41931 | 55907 | 46590 | 55907 | 5591 | 1851 |
| Scuderia | 18 | 52413 | 69884 | 58237 | 69884 | 6989 | 2221 |
| Scuderia | 19 | 65516 | 87355 | 72796 | 87355 | 8736 | 2666 |
| Scuderia | 20 | 81895 | 109194 | 90995 | 109194 | 10920 | 3199 |
| Scuderia | 21 | 94180 | 125573 | 104644 | 125573 | 12558 | 3519 |
| Scuderia | 22 | 108306 | 144408 | 120340 | 144408 | 14441 | 3870 |
| Scuderia | 23 | 124552 | 166070 | 138391 | 166070 | 16607 | 4257 |
| Scuderia | 24 | 143235 | 190980 | 159150 | 190980 | 19098 | 4683 |
| Scuderia | 25 | 164720 | 219627 | 183023 | 219627 | 21963 | 5151 |
| Scuderia | 26 | 189428 | 252571 | 210476 | 252571 | 25258 | 5666 |
| Scuderia | 27 | 217842 | 290456 | 242047 | 290456 | 29046 | 6233 |
| Scuderia | 28 | 250519 | 334025 | 278354 | 334025 | 33403 | 6856 |
| Scuderia | 29 | 288096 | 384128 | 320107 | 384128 | 38413 | 7542 |
| Scuderia | 30 | 331311 | 441748 | 368123 | 441748 | 44175 | 8296 |
| Porto | 1 | 540 | 960 | 600 | 480 | 90 | 54 |
| Porto | 2 | 900 | 1600 | 1000 | 800 | 150 | 90 |
| Porto | 3 | 1305 | 2320 | 1450 | 1160 | 218 | 126 |
| Porto | 4 | 1893 | 3364 | 2103 | 1682 | 316 | 177 |
| Porto | 5 | 2744 | 4878 | 3049 | 2439 | 458 | 247 |
| Porto | 6 | 3979 | 7073 | 4421 | 3537 | 664 | 346 |
| Porto | 7 | 5769 | 10256 | 6410 | 5128 | 962 | 485 |
| Porto | 8 | 8365 | 14871 | 9295 | 7436 | 1395 | 678 |
| Porto | 9 | 12129 | 21563 | 13477 | 10782 | 2022 | 949 |
| Porto | 10 | 17587 | 31266 | 19541 | 15633 | 2932 | 1329 |
| Porto | 11 | 21984 | 39082 | 24427 | 19541 | 3664 | 1594 |
| Porto | 12 | 27480 | 48853 | 30533 | 24427 | 4580 | 1913 |
| Porto | 13 | 34350 | 61066 | 38166 | 30533 | 5725 | 2296 |
| Porto | 14 | 42937 | 76332 | 47708 | 38166 | 7157 | 2755 |
| Porto | 15 | 53671 | 95415 | 59635 | 47708 | 8946 | 3306 |
| Porto | 16 | 67089 | 119269 | 74543 | 59635 | 11182 | 3967 |
| Porto | 17 | 83861 | 149086 | 93179 | 74543 | 13977 | 4760 |
| Porto | 18 | 104826 | 186357 | 116473 | 93179 | 17471 | 5712 |
| Porto | 19 | 131032 | 232946 | 145591 | 116473 | 21839 | 6854 |
| Porto | 20 | 163790 | 291182 | 181989 | 145591 | 27299 | 8224 |
| Porto | 21 | 188359 | 334859 | 209287 | 167430 | 31394 | 9047 |
| Porto | 22 | 216612 | 385088 | 240680 | 192544 | 36102 | 9951 |
| Porto | 23 | 249104 | 442852 | 276782 | 221426 | 41518 | 10947 |
| Porto | 24 | 286470 | 509279 | 318300 | 254640 | 47745 | 12041 |
| Porto | 25 | 329440 | 585671 | 366045 | 292836 | 54907 | 13245 |
| Porto | 26 | 378856 | 673522 | 420951 | 336761 | 63143 | 14570 |
| Porto | 27 | 435684 | 774550 | 484094 | 387275 | 72614 | 16027 |
| Porto | 28 | 501037 | 890732 | 556708 | 445366 | 83507 | 17629 |
| Porto | 29 | 576192 | 1024342 | 640214 | 512171 | 96032 | 19392 |
| Porto | 30 | 662621 | 1177993 | 736246 | 588997 | 110437 | 21331 |
| Officina | 1 | 300 | 540 | 480 | 420 | 48 | 27 |
| Officina | 2 | 500 | 900 | 800 | 700 | 80 | 45 |
| Officina | 3 | 725 | 1305 | 1160 | 1015 | 116 | 63 |
| Officina | 4 | 1052 | 1893 | 1682 | 1472 | 169 | 89 |
| Officina | 5 | 1525 | 2744 | 2439 | 2135 | 244 | 124 |
| Officina | 6 | 2211 | 3979 | 3537 | 3095 | 354 | 173 |
| Officina | 7 | 3205 | 5769 | 5128 | 4487 | 513 | 243 |
| Officina | 8 | 4648 | 8365 | 7436 | 6506 | 744 | 339 |
| Officina | 9 | 6739 | 12129 | 10782 | 9434 | 1079 | 475 |
| Officina | 10 | 9771 | 17587 | 15633 | 13679 | 1564 | 665 |
| Officina | 11 | 12214 | 21984 | 19541 | 17099 | 1955 | 797 |
| Officina | 12 | 15267 | 27480 | 24427 | 21373 | 2443 | 957 |
| Officina | 13 | 19083 | 34350 | 30533 | 26717 | 3054 | 1148 |
| Officina | 14 | 23854 | 42937 | 38166 | 33396 | 3817 | 1378 |
| Officina | 15 | 29818 | 53671 | 47708 | 41744 | 4771 | 1653 |
| Officina | 16 | 37272 | 67089 | 59635 | 52180 | 5964 | 1984 |
| Officina | 17 | 46590 | 83861 | 74543 | 65225 | 7455 | 2380 |
| Officina | 18 | 58237 | 104826 | 93179 | 81531 | 9318 | 2856 |
| Officina | 19 | 72796 | 131032 | 116473 | 101914 | 11648 | 3427 |
| Officina | 20 | 90995 | 163790 | 145591 | 127393 | 14560 | 4112 |
| Officina | 21 | 104644 | 188359 | 167430 | 146501 | 16743 | 4524 |
| Officina | 22 | 120340 | 216612 | 192544 | 168476 | 19255 | 4976 |
| Officina | 23 | 138391 | 249104 | 221426 | 193748 | 22143 | 5474 |
| Officina | 24 | 159150 | 286470 | 254640 | 222810 | 25464 | 6021 |
| Officina | 25 | 183023 | 329440 | 292836 | 256231 | 29284 | 6623 |
| Officina | 26 | 210476 | 378856 | 336761 | 294666 | 33677 | 7285 |
| Officina | 27 | 242047 | 435684 | 387275 | 338866 | 38728 | 8014 |
| Officina | 28 | 278354 | 501037 | 445366 | 389696 | 44537 | 8815 |
| Officina | 29 | 320107 | 576192 | 512171 | 448150 | 51218 | 9696 |
| Officina | 30 | 368123 | 662621 | 588997 | 515372 | 58900 | 10666 |
| Bestiario | 1 | 480 | 540 | 480 | 420 | 72 | 36 |
| Bestiario | 2 | 800 | 900 | 800 | 700 | 120 | 60 |
| Bestiario | 3 | 1160 | 1305 | 1160 | 1015 | 174 | 84 |
| Bestiario | 4 | 1682 | 1893 | 1682 | 1472 | 253 | 118 |
| Bestiario | 5 | 2439 | 2744 | 2439 | 2135 | 366 | 165 |
| Bestiario | 6 | 3537 | 3979 | 3537 | 3095 | 531 | 231 |
| Bestiario | 7 | 5128 | 5769 | 5128 | 4487 | 770 | 323 |
| Bestiario | 8 | 7436 | 8365 | 7436 | 6506 | 1116 | 452 |
| Bestiario | 9 | 10782 | 12129 | 10782 | 9434 | 1618 | 633 |
| Bestiario | 10 | 15633 | 17587 | 15633 | 13679 | 2345 | 886 |
| Bestiario | 11 | 19541 | 21984 | 19541 | 17099 | 2932 | 1063 |
| Bestiario | 12 | 24427 | 27480 | 24427 | 21373 | 3664 | 1276 |
| Bestiario | 13 | 30533 | 34350 | 30533 | 26717 | 4580 | 1531 |
| Bestiario | 14 | 38166 | 42937 | 38166 | 33396 | 5725 | 1837 |
| Bestiario | 15 | 47708 | 53671 | 47708 | 41744 | 7157 | 2204 |
| Bestiario | 16 | 59635 | 67089 | 59635 | 52180 | 8946 | 2645 |
| Bestiario | 17 | 74543 | 83861 | 74543 | 65225 | 11182 | 3173 |
| Bestiario | 18 | 93179 | 104826 | 93179 | 81531 | 13977 | 3808 |
| Bestiario | 19 | 116473 | 131032 | 116473 | 101914 | 17471 | 4569 |
| Bestiario | 20 | 145591 | 163790 | 145591 | 127393 | 21839 | 5483 |
| Bestiario | 21 | 167430 | 188359 | 167430 | 146501 | 25115 | 6031 |
| Bestiario | 22 | 192544 | 216612 | 192544 | 168476 | 28882 | 6634 |
| Bestiario | 23 | 221426 | 249104 | 221426 | 193748 | 33214 | 7298 |
| Bestiario | 24 | 254640 | 286470 | 254640 | 222810 | 38196 | 8028 |
| Bestiario | 25 | 292836 | 329440 | 292836 | 256231 | 43926 | 8830 |
| Bestiario | 26 | 336761 | 378856 | 336761 | 294666 | 50515 | 9713 |
| Bestiario | 27 | 387275 | 435684 | 387275 | 338866 | 58092 | 10685 |
| Bestiario | 28 | 445366 | 501037 | 445366 | 389696 | 66805 | 11753 |
| Bestiario | 29 | 512171 | 576192 | 512171 | 448150 | 76826 | 12928 |
| Bestiario | 30 | 588997 | 662621 | 588997 | 515372 | 88350 | 14221 |
| Tempio | 1 | 900 | 1080 | 1080 | 900 | 240 | 72 |
| Tempio | 2 | 1500 | 1800 | 1800 | 1500 | 400 | 120 |
| Tempio | 3 | 2175 | 2610 | 2610 | 2175 | 580 | 168 |
| Tempio | 4 | 3154 | 3785 | 3785 | 3154 | 841 | 236 |
| Tempio | 5 | 4573 | 5488 | 5488 | 4573 | 1220 | 330 |
| Tempio | 6 | 6631 | 7957 | 7957 | 6631 | 1769 | 461 |
| Tempio | 7 | 9615 | 11538 | 11538 | 9615 | 2564 | 646 |
| Tempio | 8 | 13942 | 16730 | 16730 | 13942 | 3718 | 904 |
| Tempio | 9 | 20215 | 24258 | 24258 | 20215 | 5391 | 1265 |
| Tempio | 10 | 29312 | 35174 | 35174 | 29312 | 7817 | 1771 |
| Tempio | 11 | 36640 | 43967 | 43967 | 36640 | 9771 | 2126 |
| Tempio | 12 | 45799 | 54959 | 54959 | 45799 | 12214 | 2551 |
| Tempio | 13 | 57249 | 68699 | 68699 | 57249 | 15267 | 3061 |
| Tempio | 14 | 71561 | 85873 | 85873 | 71561 | 19083 | 3673 |
| Tempio | 15 | 89452 | 107342 | 107342 | 89452 | 23854 | 4407 |
| Tempio | 16 | 111814 | 134177 | 134177 | 111814 | 29818 | 5289 |
| Tempio | 17 | 139768 | 167721 | 167721 | 139768 | 37272 | 6346 |
| Tempio | 18 | 174710 | 209651 | 209651 | 174710 | 46590 | 7615 |
| Tempio | 19 | 218387 | 262064 | 262064 | 218387 | 58237 | 9138 |
| Tempio | 20 | 272983 | 327580 | 327580 | 272983 | 72796 | 10966 |
| Tempio | 21 | 313931 | 376717 | 376717 | 313931 | 83715 | 12062 |
| Tempio | 22 | 361020 | 433224 | 433224 | 361020 | 96272 | 13268 |
| Tempio | 23 | 415173 | 498208 | 498208 | 415173 | 110713 | 14595 |
| Tempio | 24 | 477449 | 572939 | 572939 | 477449 | 127320 | 16055 |
| Tempio | 25 | 549067 | 658880 | 658880 | 549067 | 146418 | 17660 |
| Tempio | 26 | 631426 | 757712 | 757712 | 631426 | 168381 | 19426 |
| Tempio | 27 | 726140 | 871368 | 871368 | 726140 | 193638 | 21369 |
| Tempio | 28 | 835061 | 1002074 | 1002074 | 835061 | 222683 | 23505 |
| Tempio | 29 | 960320 | 1152384 | 1152384 | 960320 | 256086 | 25856 |
| Tempio | 30 | 1104368 | 1325242 | 1325242 | 1104368 | 294499 | 28441 |

## Mura 1-30
| Lv | Bonus DEF % | HP base | Danno diretto base |
|---:|---:|---:|---:|
| 1 | 1 | 1000 | 5 |
| 2 | 2 | 4595 | 20 |
| 3 | 3 | 11212 | 45 |
| 4 | 4 | 21112 | 80 |
| 5 | 5 | 34493 | 125 |
| 6 | 6 | 51515 | 180 |
| 7 | 7 | 72313 | 245 |
| 8 | 8 | 97006 | 320 |
| 9 | 9 | 125699 | 405 |
| 10 | 10 | 158489 | 500 |
| 11 | 11 | 195463 | 605 |
| 12 | 12 | 236700 | 720 |
| 13 | 13 | 282277 | 845 |
| 14 | 14 | 332263 | 980 |
| 15 | 15 | 386724 | 1125 |
| 16 | 16 | 445722 | 1280 |
| 17 | 17 | 509316 | 1445 |
| 18 | 18 | 577563 | 1620 |
| 19 | 19 | 650516 | 1805 |
| 20 | 20 | 728226 | 2000 |
| 21 | 23 | 810742 | 2205 |
| 22 | 26 | 898111 | 2420 |
| 23 | 29 | 990379 | 2645 |
| 24 | 32 | 1087589 | 2880 |
| 25 | 35 | 1189784 | 3125 |
| 26 | 38 | 1297004 | 3380 |
| 27 | 41 | 1409290 | 3645 |
| 28 | 44 | 1526679 | 3920 |
| 29 | 47 | 1649209 | 4205 |
| 30 | 50 | 1776915 | 4500 |

## Unita: statistiche, costi, velocita
| Unita | Cat. | Unlock | Ricerca | ATK | DEF | HP | Vel. tile/h | Cargo | Danno mura | G | W | C | I | Au | Tempo |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Fanteria | infantry | 1 | - | 10 | 14 | 12 | 2.4 | 20 | 0 | 15 | 10 | 10 | 5 | 0 | 1 min |
| Arciere | ranged | 3 | military.archery_unlock | 13 | 8 | 8 | 2.2 | 15 | 0 | 12 | 20 | 8 | 8 | 0 | 2 min |
| Cavalleria | cavalry | 11 | military.cavalry_unlock | 17 | 12 | 14 | 4.8 | 40 | 0 | 30 | 20 | 15 | 35 | 1 | 3 min |
| Catapulta | siege | 16 | siege.catapult_unlock | 3 | 4 | 10 | 1.2 | 5 | 120 | 20 | 80 | 70 | 60 | 3 | 10 min |
| Carro di Conquista | special | 18 | siege.conquest_cart_unlock | 0 | 2 | 20 | 1.0 | 0 | 0 | 100 | 250 | 200 | 180 | 30 | 1,0 h |
| Orso | beast | 21 | animals.bear_unlock | 12 | 18 | 25 | 1.6 | 10 | 40 | 120 | 40 | 30 | 35 | 8 | 5 min |
| Leone | beast | 21 | animals.lion_unlock | 25 | 8 | 14 | 3.0 | 10 | 0 | 160 | 40 | 35 | 40 | 12 | 6 min |
| Falco | beast_scout | 21 | animals.falcon_unlock | 0 | 2 | 2 | 8.0 | 0 | 0 | 20 | 30 | 5 | 5 | 5 | 2 min |
| Lupo | beast | 21 | animals.wolf_unlock | 12 | 14 | 14 | 3.6 | 8 | 0 | 90 | 35 | 20 | 25 | 7 | 4 min |
| Elefante da Guerra | beast_heavy | 24 | animals.elephant_unlock | 30 | 24 | 45 | 1.4 | 20 | 80 | 220 | 60 | 50 | 120 | 20 | 10 min |
| Drago | legendary | 30 | legendary.dragon_1 | 5000 | 3000 | 5000 | 18.0 | 0 | 150000 | 3000000 | 3000000 | 3000000 | 2000000 | 500000 | 14 gg |
| Angelo | legendary | 30 | legendary.angel_1 | 1000 | 8000 | 6000 | 16.0 | 0 | 0 | 2500000 | 2500000 | 2500000 | 2500000 | 500000 | 14 gg |
| Demone | legendary | 30 | legendary.demon_1 | 4000 | 4000 | 5000 | 16.0 | 0 | 0 | 2800000 | 2800000 | 2800000 | 2200000 | 500000 | 14 gg |

## Ruoli/counter unita
| Unita | Ruolo canonico |
|---|---|
| Fanteria | +20% vs Cavalleria; +20% vs Assedio/Speciale |
| Arciere | +25% vs Fanteria/Bestie; x0,75 vs Cavalleria |
| Cavalleria | +30% vs Arcieri |
| Catapulta | wall_damage 120; potenza truppe ridotta |
| Carro di Conquista | Solo cambio owner PvP; non richiesto sui neutrali |
| Orso | wall_damage 40; -1% effetti Mura/100 Orsi, cap -25% |
| Leone | +25% ATK se nemico ha >=2x unita |
| Falco | Scouting/Intelligence; nessun volo autonomo su acqua |
| Lupo | -1% ATK nemico/100, cap15%; in difesa cap20% |
| Elefante da Guerra | +20% vs Fanteria; wall_damage 80; Bestia |
| Drago | +30% vs Bestie; wall_damage 150.000 |
| Angelo | -15% perdite alleate dopo calcolo; cap globale 25% |
| Demone | Nemico -12% DEF e -8% ATK |

## Santuario Mitico e Unicorno

- Santuario Lv1: G500000 W600000 C600000 I500000 Au100000 — 2 gg — Sblocca fondamenta e slot mitico
- Santuario Lv2: G900000 W1100000 C1100000 I900000 Au200000 — 3 gg — Stabilizza il Nexus Arcobaleno
- Santuario Lv3: G1400000 W1700000 C1700000 I1400000 Au300000 — 5 gg — Amplifica portata mitica
- Santuario Lv4: G2000000 W2400000 C2400000 I2000000 Au450000 — 7 gg — Prepara il rituale di evocazione
- Santuario Lv5: G2600000 W3000000 C3000000 I2600000 Au650000 — 10 gg — Sblocca 1 Unicorno player-wide
- Unicorno: max attivi/player 1; costo {'grain': 2800000, 'wood': 2800000, 'clay': 2800000, 'iron': 2500000, 'gold': 600000}; build 7 giorni; cooldown post-consumo 720h.
