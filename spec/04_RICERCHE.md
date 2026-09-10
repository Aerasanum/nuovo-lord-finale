# EMPIRE LORDS DRAGON v3.7 — 114 RICERCHE COMPLETE

**SPEC_HASH:** `62a57ec4e4e400ed1ec4af41e473d98b9966186aa59dcfa851d89aac3540daa0`

Esistono **esattamente 114 ricerche** in 12 rami. Questa tabella e una vista del JSON; gli effetti strutturati nel Canonical Spec sono la fonte runtime.

## Conteggio rami
| Ramo | Nodi |
|---|---:|
| Economia | 18 |
| Costruzione | 6 |
| Militare | 15 |
| Difesa | 12 |
| Logistica | 7 |
| Intelligence | 10 |
| Sentinelle | 8 |
| Assalto e Conquista | 9 |
| Animali | 11 |
| Leggendari | 10 |
| Navigazione | 7 |
| Mitici | 1 |
| **TOTALE** | **114** |

## Classi costo ricerca
| Classe | Lv | G | W | C | I | Au | Tempo |
|---|---:|---:|---:|---:|---:|---:|---|
| A | 1 | 500 | 500 | 500 | 300 | 50 | 15 min |
| A | 2 | 900 | 900 | 900 | 540 | 90 | 27 min |
| A | 3 | 1620 | 1620 | 1620 | 970 | 160 | 49 min |
| A | 4 | 2920 | 2920 | 2920 | 1750 | 290 | 1,4 h |
| A | 5 | 5250 | 5250 | 5250 | 3150 | 520 | 2,6 h |
| B | 1 | 2000 | 2000 | 2000 | 1500 | 200 | 1,0 h |
| B | 2 | 4000 | 4000 | 4000 | 3000 | 400 | 2,0 h |
| B | 3 | 8000 | 8000 | 8000 | 6000 | 800 | 4,0 h |
| B | 4 | 16000 | 16000 | 16000 | 12000 | 1600 | 8,0 h |
| B | 5 | 32000 | 32000 | 32000 | 24000 | 3200 | 16,0 h |
| C | 1 | 10000 | 10000 | 10000 | 8000 | 1000 | 4,0 h |
| C | 2 | 20000 | 20000 | 20000 | 16000 | 2000 | 8,0 h |
| C | 3 | 40000 | 40000 | 40000 | 32000 | 4000 | 16,0 h |
| C | 4 | 80000 | 80000 | 80000 | 64000 | 8000 | 1,3 gg |
| C | 5 | 160000 | 160000 | 160000 | 128000 | 16000 | 2,7 gg |
| D | 1 | 50000 | 50000 | 50000 | 40000 | 5000 | 12,0 h |
| D | 2 | 105000 | 105000 | 105000 | 84000 | 10500 | 1,1 gg |
| D | 3 | 220500 | 220500 | 220500 | 176400 | 22050 | 2,2 gg |
| D | 4 | 463050 | 463050 | 463050 | 370440 | 46310 | 4,6 gg |
| D | 5 | 972410 | 972410 | 972410 | 777920 | 97240 | 9,7 gg |
| E | 1 | 250000 | 250000 | 250000 | 200000 | 25000 | 2,0 gg |
| E | 2 | 550000 | 550000 | 550000 | 440000 | 55000 | 4,4 gg |
| E | 3 | 1210000 | 1210000 | 1210000 | 968000 | 121000 | 9,7 gg |
| E | 4 | 2100000 | 2100000 | 2100000 | 1680000 | 210000 | 16,0 gg |
| E | 5 | 3000000 | 3000000 | 3000000 | 2400000 | 300000 | 24,0 gg |

## Catalogo completo 114 nodi
| # | Ramo | Nome | Key | Max Lv | Uni Lv | Sett. Lv | Prerequisiti | Classe | Effetto leggibile | Effetto strutturato | Scope |
|---:|---|---|---|---:|---:|---:|---|---|---|---|---|
| 1 | Economia | Agricoltura I | `economy.grain_1` | 5 | 1 | 1 | - | A | +2% produzione Grano/livello; max +10% tier | metric=production.grain; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 2 | Economia | Agricoltura II | `economy.grain_2` | 5 | 6 | 6 | economy.grain_1 | B | Ulteriore +2% Grano/livello | metric=production.grain; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 3 | Economia | Agricoltura III | `economy.grain_3` | 5 | 26 | 26 | economy.grain_2 | E | Ulteriore +2% Grano/livello | metric=production.grain; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 4 | Economia | Silvicoltura I | `economy.wood_1` | 5 | 1 | 1 | - | A | +2% Legno/livello | metric=production.wood; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 5 | Economia | Silvicoltura II | `economy.wood_2` | 5 | 6 | 6 | economy.wood_1 | B | Ulteriore +2% Legno/livello | metric=production.wood; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 6 | Economia | Silvicoltura III | `economy.wood_3` | 5 | 26 | 26 | economy.wood_2 | E | Ulteriore +2% Legno/livello | metric=production.wood; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 7 | Economia | Estrazione Argilla I | `economy.clay_1` | 5 | 1 | 1 | - | A | +2% Argilla/livello | metric=production.clay; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 8 | Economia | Estrazione Argilla II | `economy.clay_2` | 5 | 6 | 6 | economy.clay_1 | B | Ulteriore +2% Argilla/livello | metric=production.clay; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 9 | Economia | Estrazione Argilla III | `economy.clay_3` | 5 | 26 | 26 | economy.clay_2 | E | Ulteriore +2% Argilla/livello | metric=production.clay; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 10 | Economia | Metallurgia I | `economy.iron_1` | 5 | 1 | 1 | - | A | +2% Ferro/livello | metric=production.iron; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 11 | Economia | Metallurgia II | `economy.iron_2` | 5 | 6 | 6 | economy.iron_1 | B | Ulteriore +2% Ferro/livello | metric=production.iron; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 12 | Economia | Metallurgia III | `economy.iron_3` | 5 | 26 | 26 | economy.iron_2 | E | Ulteriore +2% Ferro/livello | metric=production.iron; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 13 | Economia | Oreficeria I | `economy.gold_1` | 5 | 1 | 1 | - | A | +2% Oro/livello | metric=production.gold; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 14 | Economia | Oreficeria II | `economy.gold_2` | 5 | 6 | 6 | economy.gold_1 | B | Ulteriore +2% Oro/livello | metric=production.gold; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 15 | Economia | Oreficeria III | `economy.gold_3` | 5 | 26 | 26 | economy.gold_2 | E | Ulteriore +2% Oro/livello | metric=production.gold; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 16 | Economia | Magazzini I | `economy.warehouse_1` | 5 | 1 | 1 | - | A | +2% capacita Magazzino/livello | metric=warehouse_capacity; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 17 | Economia | Magazzini II | `economy.warehouse_2` | 5 | 6 | 6 | economy.warehouse_1 | B | Ulteriore +2% capacita/livello | metric=warehouse_capacity; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 18 | Economia | Magazzini III | `economy.warehouse_3` | 5 | 26 | 26 | economy.warehouse_2 | E | Ulteriore +2% capacita/livello | metric=warehouse_capacity; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 19 | Costruzione | Costruzione I | `construction.speed_1` | 5 | 1 | 1 | - | A | -1% tempo costruzione/livello | metric=construction_time_reduction; operator=ADD_THEN_CATEGORY_CAP; per_level=0.01; cap=0.35; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 20 | Costruzione | Costruzione II | `construction.speed_2` | 5 | 6 | 6 | construction.speed_1 | B | Ulteriore -1%/livello | metric=construction_time_reduction; operator=ADD_THEN_CATEGORY_CAP; per_level=0.01; cap=0.35; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 21 | Costruzione | Costruzione III | `construction.speed_3` | 5 | 26 | 26 | construction.speed_2 | E | Ulteriore -1%/livello; cap permanente -35% | metric=construction_time_reduction; operator=ADD_THEN_CATEGORY_CAP; per_level=0.01; cap=0.35; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 22 | Costruzione | Ricerca Rapida I | `research.speed_1` | 5 | 6 | 6 | - | B | -1% tempo ricerca/livello | metric=research_time_reduction; operator=ADD_THEN_CATEGORY_CAP; per_level=0.01; cap=0.35; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 23 | Costruzione | Ricerca Rapida II | `research.speed_2` | 5 | 16 | 16 | research.speed_1 | D | Ulteriore -1%/livello | metric=research_time_reduction; operator=ADD_THEN_CATEGORY_CAP; per_level=0.01; cap=0.35; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 24 | Costruzione | Ricerca Rapida III | `research.speed_3` | 5 | 26 | 26 | research.speed_2 | E | Ulteriore -1%/livello; cap permanente -35% | metric=research_time_reduction; operator=ADD_THEN_CATEGORY_CAP; per_level=0.01; cap=0.35; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 25 | Militare | Disciplina Fanteria I | `military.infantry_1` | 5 | 1 | 1 | - | A | +2% ATK e +1% DEF Fanteria/livello | metric=unit.Fanteria.atk; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction / metric=unit.Fanteria.def; operator=ADD_THEN_CATEGORY_CAP; per_level=0.01; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 26 | Militare | Tiro con l'Arco | `military.archery_unlock` | 1 | 2 | 2 | - | A | Sblocca Arciere | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=military.archery_unlock | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 27 | Militare | Arcieria I | `military.archery_1` | 5 | 2 | 2 | military.archery_unlock | A | +2% ATK Arciere/livello | metric=unit.Arciere.atk; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 28 | Militare | Addestramento I | `military.training_1` | 5 | 2 | 2 | - | A | +3% throughput reclutamento/livello | metric=recruitment_throughput; operator=ADD_THEN_CATEGORY_CAP; per_level=0.03; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 29 | Militare | Capacita Marcia I | `military.march_capacity_1` | 5 | 3 | 3 | - | A | +5% capacita singola marcia/livello | metric=march_capacity; operator=ADD_THEN_CATEGORY_CAP; per_level=0.05; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 30 | Militare | Disciplina Fanteria II | `military.infantry_2` | 5 | 6 | 6 | military.infantry_1 | B | Ulteriore +2% ATK e +1% DEF/livello | metric=unit.Fanteria.atk; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction / metric=unit.Fanteria.def; operator=ADD_THEN_CATEGORY_CAP; per_level=0.01; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 31 | Militare | Arcieria II | `military.archery_2` | 5 | 6 | 6 | military.archery_1 | B | Ulteriore +2% ATK/livello | metric=unit.Arciere.atk; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 32 | Militare | Attacco Truppe I | `military.attack_1` | 5 | 7 | 7 | - | B | +1,5% ATK generale/livello | metric=troop_atk; operator=ADD_THEN_CATEGORY_CAP; per_level=0.015; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 33 | Militare | Difesa Truppe I | `military.defense_1` | 5 | 7 | 7 | - | B | +1,5% DEF generale/livello | metric=troop_def; operator=ADD_THEN_CATEGORY_CAP; per_level=0.015; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 34 | Militare | Salute Truppe I | `military.health_1` | 5 | 8 | 8 | - | B | +1,5% HP truppe/livello | metric=troop_hp; operator=ADD_THEN_CATEGORY_CAP; per_level=0.015; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 35 | Militare | Velocita Marcia I | `military.march_speed_1` | 5 | 8 | 8 | - | B | +2% velocita terrestre/livello; cap ricerca +50% | metric=land_march_speed; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; cap=0.5; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 36 | Militare | Equitazione | `military.equestrianism` | 1 | 11 | 11 | military.march_speed_1 | C | Sblocca Scuderia | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=military.equestrianism | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 37 | Militare | Cavalleria | `military.cavalry_unlock` | 1 | 11 | 11 | military.equestrianism | C | Sblocca reclutamento Cavalleria | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=military.cavalry_unlock | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 38 | Militare | Maestria Cavalleria I | `military.cavalry_mastery_1` | 5 | 12 | 12 | military.cavalry_unlock | C | +2% ATK e +2% velocita Cavalleria/livello | metric=unit.Cavalleria.atk; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction / metric=unit.Cavalleria.speed; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 39 | Militare | Intercettazione Carovane | `military.caravan_interception` | 1 | 13 | 13 | military.cavalry_unlock + intelligence.caravan_search_1 | C | Sblocca missione intercettazione | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=military.caravan_interception | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 40 | Difesa | Ingegneria delle Mura I | `defense.wall_engineering_1` | 5 | 1 | 1 | - | A | +3% HP Mura/livello | metric=settlement_wall_hp; operator=ADD_THEN_CATEGORY_CAP; per_level=0.03; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 41 | Difesa | Feritoie I | `defense.battlements_1` | 5 | 2 | 2 | defense.wall_engineering_1 | A | +2% danno diretto Mura/livello | metric=settlement_wall_static_damage; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 42 | Difesa | Difesa Guarnigione I | `defense.garrison_1` | 5 | 3 | 3 | - | A | +2% DEF guarnigione/livello | metric=settlement_garrison_def; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 43 | Difesa | Ingegneria delle Mura II | `defense.wall_engineering_2` | 5 | 8 | 8 | defense.wall_engineering_1 | B | Ulteriore +3% HP/livello | metric=settlement_wall_hp; operator=ADD_THEN_CATEGORY_CAP; per_level=0.03; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 44 | Difesa | Feritoie II | `defense.battlements_2` | 5 | 9 | 9 | defense.battlements_1 | B | Ulteriore +2% danno Mura/livello | metric=settlement_wall_static_damage; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 45 | Difesa | Difesa Guarnigione II | `defense.garrison_2` | 5 | 10 | 10 | defense.garrison_1 | B | Ulteriore +2% DEF guarnigione/livello | metric=settlement_garrison_def; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 46 | Difesa | Ingegneria delle Mura III | `defense.wall_engineering_3` | 5 | 16 | 16 | defense.wall_engineering_2 | D | Ulteriore +3% HP/livello | metric=settlement_wall_hp; operator=ADD_THEN_CATEGORY_CAP; per_level=0.03; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 47 | Difesa | Feritoie III | `defense.battlements_3` | 5 | 17 | 17 | defense.battlements_2 | D | Ulteriore +2% danno Mura/livello | metric=settlement_wall_static_damage; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 48 | Difesa | Riparazione Mura I | `defense.wall_repair_1` | 5 | 18 | 18 | defense.wall_engineering_3 | D | +5% throughput riparazione manuale/livello; tempo = base/(1+bonus) | metric=settlement_wall_repair_throughput; operator=ADD_THEN_CATEGORY_CAP; per_level=0.05; cap=0.5; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 49 | Difesa | Ingegneria delle Mura IV | `defense.wall_engineering_4` | 5 | 26 | 26 | defense.wall_engineering_3 | E | Ulteriore +3% HP/livello | metric=settlement_wall_hp; operator=ADD_THEN_CATEGORY_CAP; per_level=0.03; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 50 | Difesa | Danno Mura IV | `defense.battlements_4` | 5 | 27 | 27 | defense.battlements_3 | E | Ulteriore +2% danno/livello | metric=settlement_wall_static_damage; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 51 | Difesa | Riparazione Mura II | `defense.wall_repair_2` | 5 | 28 | 28 | defense.wall_repair_1 | E | Ulteriore +5% throughput riparazione manuale/livello; bonus cumulativo max +50% | metric=settlement_wall_repair_throughput; operator=ADD_THEN_CATEGORY_CAP; per_level=0.05; cap=0.5; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 52 | Logistica | Capacita Saccheggio I | `logistics.loot_capacity_1` | 5 | 6 | 6 | - | B | +5% capacita bottino/livello | metric=loot_capacity; operator=ADD_THEN_CATEGORY_CAP; per_level=0.05; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 53 | Logistica | Carovane I | `logistics.caravans_1` | 1 | 6 | 6 | - | B | Sblocca trasferimenti terrestri | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=logistics.caravans_1 | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 54 | Logistica | Capacita Carovana I | `logistics.caravan_capacity_1` | 5 | 7 | 7 | logistics.caravans_1 | B | +5% capacita carovana/livello | metric=caravan_capacity; operator=ADD_THEN_CATEGORY_CAP; per_level=0.05; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 55 | Logistica | Velocita Carovana I | `logistics.caravan_speed_1` | 5 | 8 | 8 | logistics.caravans_1 | B | +3% velocita carovana/livello | metric=caravan_speed; operator=ADD_THEN_CATEGORY_CAP; per_level=0.03; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 56 | Logistica | Logistica Rinforzi I | `logistics.reinforcement_1` | 5 | 9 | 9 | - | B | +3% velocita supporto/livello | metric=reinforcement_speed; operator=ADD_THEN_CATEGORY_CAP; per_level=0.03; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 57 | Logistica | Logistica d Assedio I | `logistics.siege_1` | 5 | 18 | 18 | siege.siege_engineering | D | Macchine Assedio/Special contano come ceil(count/(1+0,04*livello)) unita ai fini del cap War Hall; max Lv5 | metric=war_hall_weight; operator=CEIL_COUNT_DIVIDE; categories=['siege', 'special']; denominator_base=1; denominator_per_level=0.04 | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 58 | Logistica | Logistica Avanzata | `logistics.advanced` | 5 | 27 | 27 | logistics.siege_1 + logistics.caravan_capacity_1 | E | +2% velocita e +3% capacita logistica/livello | metric=logistics_speed; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction / metric=logistics_capacity; operator=ADD_THEN_CATEGORY_CAP; per_level=0.03; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 59 | Intelligence | Osservazione I | `intelligence.observation_1` | 5 | 1 | 1 | - | A | +4 intel_points/livello; disclosure deterministica secondo intelligence_engine | metric=intel_points; operator=ADD_THEN_CATEGORY_CAP; per_level=4; unit=points | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 60 | Intelligence | Osservazione II | `intelligence.observation_2` | 5 | 6 | 6 | intelligence.observation_1 | B | +4 intel_points/livello; disclosure deterministica secondo intelligence_engine | metric=intel_points; operator=ADD_THEN_CATEGORY_CAP; per_level=4; unit=points | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 61 | Intelligence | Controspionaggio I | `intelligence.counter_1` | 5 | 7 | 7 | - | B | -3 intel_points all osservatore nemico/livello; non puo nascondere l esistenza di un detection event | metric=enemy_intel_points; operator=ADD_THEN_CATEGORY_CAP; per_level=-3; unit=points | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 62 | Intelligence | Ricognizione Carovane I | `intelligence.caravan_search_1` | 5 | 8 | 8 | logistics.caravans_1 | B | +1 tile raggio ricerca ai livelli 2 e 4 (max +2) | metric=caravan_search_radius; operator=LOOKUP_LEVEL; unit=tiles; values=[0, 0, 1, 1, 2, 2] | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 63 | Intelligence | Ricognizione II | `intelligence.observation_3` | 5 | 12 | 12 | intelligence.observation_2 | C | +4 intel_points/livello; disclosure deterministica secondo intelligence_engine | metric=intel_points; operator=ADD_THEN_CATEGORY_CAP; per_level=4; unit=points | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 64 | Intelligence | Ricerca Carovane II | `intelligence.caravan_search_2` | 5 | 13 | 13 | intelligence.caravan_search_1 | C | +1 tile raggio ricerca/livello (max +5) e +2 intel_points/livello solo su rilevamenti Carovana | metric=caravan_search_radius; operator=ADD_THEN_CATEGORY_CAP; per_level=1; unit=tiles / metric=caravan_intel_points; operator=ADD_THEN_CATEGORY_CAP; per_level=2; unit=points | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 65 | Intelligence | Controspionaggio II | `intelligence.counter_2` | 5 | 17 | 17 | intelligence.counter_1 | D | -3 intel_points all osservatore nemico/livello; non puo nascondere l esistenza di un detection event | metric=enemy_intel_points; operator=ADD_THEN_CATEGORY_CAP; per_level=-3; unit=points | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 66 | Intelligence | Intelligence IV | `intelligence.observation_4` | 5 | 19 | 19 | intelligence.observation_3 | D | +4 intel_points/livello; disclosure deterministica secondo intelligence_engine | metric=intel_points; operator=ADD_THEN_CATEGORY_CAP; per_level=4; unit=points | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 67 | Intelligence | Intelligence V | `intelligence.observation_5` | 5 | 28 | 28 | intelligence.observation_4 | E | +4 intel_points/livello; disclosure deterministica secondo intelligence_engine | metric=intel_points; operator=ADD_THEN_CATEGORY_CAP; per_level=4; unit=points | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 68 | Intelligence | Controspionaggio III | `intelligence.counter_3` | 5 | 28 | 28 | intelligence.counter_2 | E | -3 intel_points all osservatore nemico/livello; non puo nascondere l esistenza di un detection event | metric=enemy_intel_points; operator=ADD_THEN_CATEGORY_CAP; per_level=-3; unit=points | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 69 | Sentinelle | Fuochi di Segnalazione I | `sentinel.signals_1` | 5 | 3 | 3 | - | A | +2 intel_points/livello sui detection event originati dalla rete Sentinelle; nessuna espansione geometrica del territorio | metric=sentinel_intel_points; operator=ADD_THEN_CATEGORY_CAP; per_level=2; unit=points | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 70 | Sentinelle | Presidio Sentinella I | `sentinel.garrison_1` | 5 | 3 | 3 | - | A | Bonus DEF guarnigione fino +5% tier | metric=sentinel_garrison_def; operator=ADD_THEN_CATEGORY_CAP; per_level=0.01; cap=0.25; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 71 | Sentinelle | Rete di Segnalazione | `sentinel.signals_2` | 5 | 10 | 10 | sentinel.signals_1 | B | +3 intel_points/livello sui detection event originati dalla rete Sentinelle; nessuna modifica alla probabilita di detection | metric=sentinel_intel_points; operator=ADD_THEN_CATEGORY_CAP; per_level=3; unit=points | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 72 | Sentinelle | Presidio Sentinella II | `sentinel.garrison_2` | 5 | 10 | 10 | sentinel.garrison_1 | B | Bonus totale fino +10% | metric=sentinel_garrison_def; operator=ADD_THEN_CATEGORY_CAP; per_level=0.01; cap=0.25; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 73 | Sentinelle | Presidio Sentinella III | `sentinel.garrison_3` | 5 | 15 | 15 | sentinel.garrison_2 | C | Bonus totale fino +15% | metric=sentinel_garrison_def; operator=ADD_THEN_CATEGORY_CAP; per_level=0.01; cap=0.25; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 74 | Sentinelle | Perimetro Avanzato | `sentinel.advanced_perimeter` | 1 | 18 | 18 | sentinel.signals_2 + intelligence.observation_3 | D | Sblocca 8 Sentinelle esterne | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=sentinel.advanced_perimeter | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 75 | Sentinelle | Presidio Sentinella IV | `sentinel.garrison_4` | 5 | 20 | 20 | sentinel.garrison_3 + sentinel.advanced_perimeter | D | Bonus totale fino +20% | metric=sentinel_garrison_def; operator=ADD_THEN_CATEGORY_CAP; per_level=0.01; cap=0.25; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 76 | Sentinelle | Presidio Sentinella V | `sentinel.garrison_5` | 5 | 28 | 28 | sentinel.garrison_4 | E | Bonus totale fino +25% | metric=sentinel_garrison_def; operator=ADD_THEN_CATEGORY_CAP; per_level=0.01; cap=0.25; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 77 | Assalto e Conquista | Ingegneria d Assedio | `siege.siege_engineering` | 1 | 16 | 16 | - | D | Sblocca Officina | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=siege.siege_engineering | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 78 | Assalto e Conquista | Progetto Catapulta | `siege.catapult_unlock` | 1 | 16 | 16 | siege.siege_engineering | D | Sblocca Catapulta | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=siege.catapult_unlock | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 79 | Assalto e Conquista | Catapulta I-V | `siege.catapult_mastery` | 5 | 17 | 17 | siege.catapult_unlock | D | +4% danno strutturale Catapulta/livello | metric=unit.Catapulta.wall_damage; operator=ADD_THEN_CATEGORY_CAP; per_level=0.04; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 80 | Assalto e Conquista | Dottrina di Conquista | `siege.conquest_doctrine` | 1 | 17 | 17 | siege.siege_engineering | D | Prerequisito Carro/Fedelta PvP | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=siege.conquest_doctrine | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 81 | Assalto e Conquista | Progetto Carro di Conquista | `siege.conquest_cart_unlock` | 1 | 18 | 18 | siege.conquest_doctrine | D | Sblocca Carro | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=siege.conquest_cart_unlock | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 82 | Assalto e Conquista | Resistenza Carro | `siege.conquest_cart_resilience` | 5 | 19 | 19 | siege.conquest_cart_unlock | D | +5% HP Carro di Conquista/livello (max +25%) | metric=unit.Carro di Conquista.hp; operator=ADD_THEN_CATEGORY_CAP; per_level=0.05; cap=0.25; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 83 | Assalto e Conquista | Coordinamento Assedio | `siege.coordination` | 5 | 20 | 20 | siege.conquest_doctrine | D | +2% cap War Hall per marce CONQUEST/livello (max +10%); non si applica ad ATTACK/RAID/REINFORCE | metric=conquest_march_capacity; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; cap=0.1; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 84 | Assalto e Conquista | Pressione sulla Fedelta | `siege.loyalty_pressure` | 5 | 24 | 24 | siege.coordination | E | +2 punti Fedelta ridotti/livello: 20->30 max | metric=loyalty_damage; operator=ADD_THEN_CATEGORY_CAP; per_level=2; unit=points | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 85 | Assalto e Conquista | Assedio Avanzato | `siege.advanced` | 5 | 27 | 27 | siege.catapult_mastery + siege.coordination | E | +3% wall_damage di tutte le unita attaccanti con wall_damage>0/livello (max +15%) | metric=positive_wall_damage; operator=ADD_THEN_CATEGORY_CAP; per_level=0.03; cap=0.15; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 86 | Animali | Studio delle Bestie | `animals.beast_studies` | 1 | 21 | 21 | military.health_1 | E | Sblocca Bestiario | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=animals.beast_studies | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 87 | Animali | Addestramento Orso | `animals.bear_unlock` | 1 | 21 | 21 | animals.beast_studies | E | Sblocca Orso | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=animals.bear_unlock | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 88 | Animali | Maestria Orso | `animals.bear_mastery` | 5 | 22 | 22 | animals.bear_unlock | E | +3% ATK/DEF/HP Orso per livello | metric=unit.Orso.atk; operator=ADD_THEN_CATEGORY_CAP; per_level=0.03; unit=fraction / metric=unit.Orso.def; operator=ADD_THEN_CATEGORY_CAP; per_level=0.03; unit=fraction / metric=unit.Orso.hp; operator=ADD_THEN_CATEGORY_CAP; per_level=0.03; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 89 | Animali | Addestramento Leone | `animals.lion_unlock` | 1 | 21 | 21 | animals.beast_studies | E | Sblocca Leone | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=animals.lion_unlock | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 90 | Animali | Maestria Leone | `animals.lion_mastery` | 5 | 22 | 22 | animals.lion_unlock | E | +3% ATK/DEF/HP Leone per livello | metric=unit.Leone.atk; operator=ADD_THEN_CATEGORY_CAP; per_level=0.03; unit=fraction / metric=unit.Leone.def; operator=ADD_THEN_CATEGORY_CAP; per_level=0.03; unit=fraction / metric=unit.Leone.hp; operator=ADD_THEN_CATEGORY_CAP; per_level=0.03; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 91 | Animali | Addestramento Falco | `animals.falcon_unlock` | 1 | 21 | 21 | animals.beast_studies | E | Sblocca Falco | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=animals.falcon_unlock | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 92 | Animali | Maestria Falco | `animals.falcon_mastery` | 5 | 22 | 22 | animals.falcon_unlock | E | +3 intel_points/livello nelle missioni scouting che includono Falco e +2% velocita Falco/livello | metric=falcon_scout_intel_points; operator=ADD_THEN_CATEGORY_CAP; per_level=3; unit=points / metric=unit.Falco.speed; operator=ADD_THEN_CATEGORY_CAP; per_level=0.02; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 93 | Animali | Addestramento Lupo | `animals.wolf_unlock` | 1 | 21 | 21 | animals.beast_studies | E | Sblocca Lupo | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=animals.wolf_unlock | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 94 | Animali | Maestria Lupo | `animals.wolf_mastery` | 5 | 22 | 22 | animals.wolf_unlock | E | +3% ATK/DEF/HP Lupo per livello | metric=unit.Lupo.atk; operator=ADD_THEN_CATEGORY_CAP; per_level=0.03; unit=fraction / metric=unit.Lupo.def; operator=ADD_THEN_CATEGORY_CAP; per_level=0.03; unit=fraction / metric=unit.Lupo.hp; operator=ADD_THEN_CATEGORY_CAP; per_level=0.03; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 95 | Animali | Addestramento Elefante | `animals.elephant_unlock` | 1 | 24 | 24 | animals.beast_studies + siege.siege_engineering | E | Sblocca Elefante da Guerra | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=animals.elephant_unlock | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 96 | Animali | Maestria Elefante | `animals.elephant_mastery` | 5 | 25 | 25 | animals.elephant_unlock | E | +3% ATK/DEF/HP e +4% wall damage/livello | metric=unit.Elefante da Guerra.atk; operator=ADD_THEN_CATEGORY_CAP; per_level=0.03; unit=fraction / metric=unit.Elefante da Guerra.def; operator=ADD_THEN_CATEGORY_CAP; per_level=0.03; unit=fraction / metric=unit.Elefante da Guerra.hp; operator=ADD_THEN_CATEGORY_CAP; per_level=0.03; unit=fraction / metric=unit.Elefante da Guerra.wall_damage; operator=ADD_THEN_CATEGORY_CAP; per_level=0.04; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 97 | Leggendari | Studi del Tempio | `legendary.temple_studies` | 1 | 29 | 29 | research.speed_3 + siege.advanced | E | Prerequisito Tempio | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=legendary.temple_studies | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 98 | Leggendari | Richiamo del Drago 1 | `legendary.dragon_1` | 1 | 30 | 30 | legendary.temple_studies | E | Sblocca copia 1 Drago | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=legendary.dragon_1 | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 99 | Leggendari | Richiamo del Drago 2 | `legendary.dragon_2` | 1 | 30 | 30 | legendary.dragon_1 | E | Sblocca copia 2 Drago | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=legendary.dragon_2 | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 100 | Leggendari | Richiamo del Drago 3 | `legendary.dragon_3` | 1 | 30 | 30 | legendary.dragon_2 | E | Sblocca copia 3 Drago | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=legendary.dragon_3 | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 101 | Leggendari | Benedizione dell Angelo 1 | `legendary.angel_1` | 1 | 30 | 30 | legendary.temple_studies | E | Sblocca copia 1 Angelo | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=legendary.angel_1 | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 102 | Leggendari | Benedizione dell Angelo 2 | `legendary.angel_2` | 1 | 30 | 30 | legendary.angel_1 | E | Sblocca copia 2 Angelo | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=legendary.angel_2 | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 103 | Leggendari | Benedizione dell Angelo 3 | `legendary.angel_3` | 1 | 30 | 30 | legendary.angel_2 | E | Sblocca copia 3 Angelo | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=legendary.angel_3 | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 104 | Leggendari | Patto del Demone 1 | `legendary.demon_1` | 1 | 30 | 30 | legendary.temple_studies | E | Sblocca copia 1 Demone | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=legendary.demon_1 | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 105 | Leggendari | Patto del Demone 2 | `legendary.demon_2` | 1 | 30 | 30 | legendary.demon_1 | E | Sblocca copia 2 Demone | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=legendary.demon_2 | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 106 | Leggendari | Patto del Demone 3 | `legendary.demon_3` | 1 | 30 | 30 | legendary.demon_2 | E | Sblocca copia 3 Demone | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=legendary.demon_3 | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 107 | Navigazione | Studi Nautici | `navigation.nautical_studies` | 1 | 15 | 15 | - | D | Radice navigazione | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=navigation.nautical_studies | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 108 | Navigazione | Costruzione del Porto | `navigation.port_construction` | 1 | 15 | 15 | navigation.nautical_studies | D | Sblocca Porto costiero | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=navigation.port_construction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 109 | Navigazione | Costruzione Navale | `navigation.shipbuilding` | 1 | 16 | 16 | navigation.port_construction | D | Sblocca Nave da Trasporto | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=navigation.shipbuilding | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 110 | Navigazione | Tecniche d Imbarco | `navigation.embark` | 1 | 16 | 16 | navigation.shipbuilding | D | Imbarco esclusivo Porto->Porto | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=navigation.embark | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 111 | Navigazione | Tecniche di Sbarco | `navigation.disembark` | 1 | 16 | 16 | navigation.shipbuilding | D | Sbarco esclusivo in Porto | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=navigation.disembark | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 112 | Navigazione | Navigazione Avanzata | `navigation.speed` | 5 | 18 | 18 | navigation.shipbuilding | D | +3% velocita flotte/livello | metric=fleet_speed; operator=ADD_THEN_CATEGORY_CAP; per_level=0.03; cap=0.15; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 113 | Navigazione | Capacita Navi | `navigation.capacity` | 5 | 18 | 18 | navigation.shipbuilding | D | +5% capacita soldati/nave/livello | metric=ship_capacity; operator=ADD_THEN_CATEGORY_CAP; per_level=0.05; cap=0.25; unit=fraction | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |
| 114 | Mitici | Studi Mitici | `mythic.mythic_studies` | 1 | 30 | 30 | - | E | Sblocca costruzione Santuario Mitico player-wide nella Madre | operator=UNLOCK_OR_PREREQUISITE; authority=unlock_registry and originating domain; no numeric bonus; research_key=mythic.mythic_studies | SETTLEMENT_LOCAL_UNLESS_EXISTING_PLAYER_EXCEPTION |

## Regole di applicazione effetti

- **algebra_ref**: `modifier_algebra`
- **scope_ref**: `research_scope`
- **structured_effects_ref**: `research_effects`
- **unlock_ref**: `unlock_registry`
- **existing_domain_specific_caps_take_precedence**: `SI`
- **do_not_apply_effect_twice_from_text_and_registry**: `SI`

## Scope ricerca

```json
{
  "scope": "SETTLEMENT_LOCAL",
  "queues_per_settlement": 2,
  "economy_construction_effects": "Apply only to the settlement that completed the research.",
  "recruitment_effects": "Apply to recruitment jobs started in that settlement and are snapshotted at job start.",
  "outgoing_march_effects": "Origin settlement research profile is snapshotted at launch for that march.",
  "own_garrison_defense": "Uses current defending-settlement research at battle snapshot.",
  "allied_reinforcement_defense": "Uses the reinforcement research snapshot captured when that reinforcement march launched.",
  "own_troops_rehomed": "After a completed transfer to another own settlement, future actions use the new origin settlement research; research is not permanently attached to unit instances.",
  "mother_succession": "All research of surviving settlements remains unchanged. Research in the conquered Mother follows normal 85% settlement research retention and is not copied to the successor.",
  "player_level_exceptions": [
    "specialization",
    "casata",
    "mythic_sanctuary_progression"
  ]
}
```
