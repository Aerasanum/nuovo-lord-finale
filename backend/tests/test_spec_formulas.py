"""Mandatory tests 1-8 (pure spec / formula validation) + cross-check against the human tables (03/04 .md)."""
from __future__ import annotations

import re

import pytest

from app.core.spec import get_spec, parse_duration_minutes
from app.domain import formulas as F
from app.domain.research import validate_dag
from tests.paths import SPEC_DIR

spec = get_spec()
TABLES = (SPEC_DIR / "03_TABELLE.md").read_text(encoding="utf-8")
RICERCHE = (SPEC_DIR / "04_RICERCHE.md").read_text(encoding="utf-8")


# 1 ------------------------------------------------------------------------------------------------
def test_economy_level_1_and_30_exact():
    b1 = {p: 1 for p in spec.PRODUCERS} | {"Magazzino": 1}
    prod1 = F.production_per_hour(b1, {})
    assert prod1 == {"grain": 20.0, "wood": 20.0, "clay": 20.0, "iron": 18.0, "gold": 5.0}
    assert F.warehouse_capacity(b1, {}) == 3500
    b30 = {p: 30 for p in spec.PRODUCERS} | {"Magazzino": 30}
    prod30 = F.production_per_hour(b30, {})
    assert prod30 == {"grain": 26200.0, "wood": 26200.0, "clay": 26200.0, "iron": 23580.0, "gold": 6550.0}
    assert F.warehouse_capacity(b30, {}) == 4_266_500
    # human table cross-check (03_TABELLE.md rows)
    assert "| 1 | 20 | 20 | 20 | 18 | 5 | 3500 |" in TABLES
    assert "| 30 | 26200 | 26200 | 26200 | 23580 | 6550 | 4266500 |" in TABLES


# 2 ------------------------------------------------------------------------------------------------
def test_warehouse_l30_research_and_cap_not_automatic():
    b30 = {"Magazzino": 30}
    assert F.warehouse_capacity(b30, {}) == 4_266_500  # no automatic bonus
    research = {"economy__warehouse_1": 5, "economy__warehouse_2": 5, "economy__warehouse_3": 5}  # +30%
    assert F.warehouse_capacity(b30, research) == 5_546_450
    # cap +60% is a ceiling, not an award: research alone can only reach +30%
    total, _ = F.research_metric(research, "warehouse_capacity")
    assert abs(total - 0.30) < 1e-9
    assert spec.warehouse_policy["automatic_bonus_fraction"] == 0
    assert spec.warehouse_policy["permanent_bonus_cap_fraction"] == 0.6
    # hypothetical over-cap input is clamped to 0.6 by the formula
    assert int(4_266_500 * 1.6) == 6_826_400
    over = {"economy__warehouse_1": 50}  # impossible level, only to exercise the clamp
    assert F.warehouse_capacity(b30, over) <= 6_826_400


# 3 ------------------------------------------------------------------------------------------------
def test_30_settlement_levels():
    assert sorted(spec.settlement_progression) == list(range(1, 31))
    for lvl in range(2, 31):
        row = spec.settlement_progression[lvl]
        cost, minutes = spec.building_cost_time("Castello / Fortezza", lvl)
        assert cost == row["upgrade_cost"] and minutes == row["upgrade_time_min"]
        assert spec.settlement_requirements(lvl)  # parseable requirements for every level
    assert spec.settlement_progression[30]["upgrade_time_min"] == 7111
    assert spec.settlement_progression[30]["stage"] == "Metropolis"


# 4 ------------------------------------------------------------------------------------------------
def test_21_buildings_and_600_rows():
    assert len(spec.buildings) == 21
    rows = spec.building_upgrade_costs
    assert len(rows) == 600
    ordinary = [b["name"] for b in spec.buildings if b["name"] != "Santuario Mitico"]
    assert len(ordinary) == 20
    for name in ordinary:
        for lvl in range(1, 31):
            cost, minutes = spec.building_cost_time(name, lvl)
            assert all(isinstance(v, int) and v >= 0 for v in cost.values()) and minutes >= 1
    # spot check vs human table (first/last rows of 600)
    assert "| Castello / Fortezza | 1 | 600 | 720 | 720 | 480 | 60 | 18 |" in TABLES
    assert re.search(r"\| Tempio \| 30 \| \d+ \| \d+ \| \d+ \| \d+ \| \d+ \| \d+ \|", TABLES)


def test_fast_and_construction_rounding():
    q = F.construction_cost_time("Castello / Fortezza", 2, owned_settlements=1, research={})
    assert q["fast_applied"] and q["cost"] == {"grain": 700, "wood": 840, "clay": 840, "iron": 560, "gold": 70} and q["duration_min"] == 15
    q = F.construction_cost_time("Fattoria", 2, owned_settlements=1, research={})
    assert q["cost"] == {"grain": 70, "wood": 175, "clay": 105, "iron": 35, "gold": 0} and q["duration_min"] == 5
    q4 = F.construction_cost_time("Castello / Fortezza", 2, owned_settlements=4, research={})
    assert not q4["fast_applied"] and q4["cost"] == {"grain": 1000, "wood": 1200, "clay": 1200, "iron": 800, "gold": 100} and q4["duration_min"] == 30
    q11 = F.construction_cost_time("Castello / Fortezza", 11, owned_settlements=1, research={})
    assert not q11["fast_applied"]
    # construction research reduction capped at 35%
    red = {"construction__speed_1": 5, "construction__speed_2": 5, "construction__speed_3": 5}
    q = F.construction_cost_time("Castello / Fortezza", 11, 1, red)
    assert q["research_time_reduction"] == pytest.approx(0.15)


# 5 ------------------------------------------------------------------------------------------------
def test_13_canonical_units():
    names = ["Fanteria", "Arciere", "Cavalleria", "Catapulta", "Carro di Conquista", "Orso", "Leone", "Falco", "Lupo", "Elefante da Guerra", "Drago", "Angelo", "Demone"]
    assert spec.unit_order == names
    for n in names:
        u = spec.units_by_name[n]
        for k in ("atk", "def", "hp", "speed_tph", "cargo", "wall_damage"):
            assert k in u
        assert spec.unit_cost(n) and spec.unit_base_time_seconds(n) >= 1
    assert spec.unit_base_time_seconds("Drago") == 14 * 86400
    assert spec.unit_base_time_seconds("Fanteria") == 60
    assert F.batch_cap(1) == 50 and F.batch_cap(2) == 59 and F.batch_cap(3) == 70
    assert F.war_hall_cap(1, {}, "ATTACK") == 1000 and F.war_hall_cap(2, {}, "ATTACK") == 1170


# 6 ------------------------------------------------------------------------------------------------
def test_114_research_keys_and_12_branches():
    keys = [n["key"] for n in spec.research_nodes]
    assert len(keys) == 114 and len(set(keys)) == 114
    assert len(spec.research_branches) == 12
    assert len(spec.research_effects) == 114
    # human table cross-check: every key appears in 04_RICERCHE.md, no extra 115th node
    for k in keys:
        assert k in RICERCHE, k
    table_keys = set(re.findall(r"\| (\w+\.\w+) \|", RICERCHE))
    assert table_keys <= set(keys), table_keys - set(keys)


# 7 ------------------------------------------------------------------------------------------------
def test_prerequisites_resolve_and_dag_acyclic():
    info = validate_dag()
    assert info == {"nodes": 114, "branches": 12, "acyclic": True}
    for k in spec.research_by_key:
        for p in spec.research_prereqs(k):
            assert p in spec.research_by_key


def test_research_time_literal_parse():
    assert parse_duration_minutes("15 min") == 15
    assert parse_duration_minutes("1,4 h") == 84
    assert parse_duration_minutes("1,3 gg") == 1872
    assert parse_duration_minutes("14 gg") == 20160
    for (cls, lvl), row in spec.research_costs.items():
        assert parse_duration_minutes(row["time"]) >= 1


def test_wall_table_exact():
    w1 = F.wall_stats(1, {})
    assert w1 == {"level": 1, "max_hp": 1000, "defense_bonus_pct": 1.0, "static_damage": 5.0}
    w30 = F.wall_stats(30, {})
    assert w30["max_hp"] == 1776915 and w30["defense_bonus_pct"] == 50.0 and w30["static_damage"] == 4500.0


def test_neutral_template_and_caps():
    t1 = F.neutral_template(1, False)
    assert sum(t1["army"].values()) == 100 and t1["army"] == {"Fanteria": 100}  # archers below unlock convert
    t3 = F.neutral_template(3, False)
    assert sum(t3["army"].values()) == 900 and t3["army"]["Arciere"] == 315 and t3["army"]["Fanteria"] == 585
    assert F.neutral_level_cap(1) == 5 and F.neutral_level_cap(20) == 8 and F.neutral_level_cap(200) == 20
