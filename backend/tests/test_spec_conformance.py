"""Combat, march and path numbers checked against the canonical spec rather than against themselves.

`spec_contract.divergence_behavior` is BUILD_BLOCKED_SPEC_DIVERGENCE and `regression_policy` forbids a fix without
a test, but the competitive arithmetic — the counter matrix, how power is composed, what the winner pays, how long
a march takes — was only ever exercised inside whole scenarios, where a wrong coefficient still produces a
plausible battle and nothing fails. These tests recompute each result from the JSON the spec declares as the
runtime authority, so an implementation that stops matching it says so.

Expectations are read from the spec on purpose: a rebalance is a spec edit and should flow through, while a
hand-edited constant in the code has nothing to hide behind. Pure functions only, no database.

In-process suite: `cd backend && pytest tests/test_spec_conformance.py -o addopts=''`.
"""
from __future__ import annotations

import math

import numpy as np
import pytest

from app.core.spec import get_spec
from app.domain import combat
from app.domain import formulas as F
from app.domain.pathfinding import astar

SPEC = get_spec()


def _mix_factor(attacker: str, enemy: dict[str, int]) -> float:
    """The spec's weighted_enemy_mix_formula, spelled out here so the test does not reuse the implementation."""
    cm = SPEC.counter_matrix
    row = cm["by_attacker_category_and_defender_category"][SPEC.units_by_name[attacker]["category"]]
    override = (cm.get("unit_specific_overrides", {}).get(attacker) or {}).get("vs_category", {})
    total = sum(enemy.values())
    out = 0.0
    for unit, count in enemy.items():
        category = SPEC.units_by_name[unit]["category"]
        out += (count / total) * float(override.get(category, row.get(category, cm["default_multiplier"])))
    return out


# ------------------------------------------------------------------------------------------------ counter_matrix
def test_counter_factor_weights_the_whole_enemy_mix():
    """A counter is diluted by how much of the enemy it actually applies to, not by what the enemy leads with."""
    enemy = {"Fanteria": 300, "Cavalleria": 100}
    got = combat._counter_factor("Arciere", [(u, c) for u, c in enemy.items()])
    assert got == pytest.approx(_mix_factor("Arciere", enemy))
    # and the mix really is between the two extremes, or the weighting is not doing anything
    pure_infantry = combat._counter_factor("Arciere", [("Fanteria", 1)])
    pure_cavalry = combat._counter_factor("Arciere", [("Cavalleria", 1)])
    assert min(pure_infantry, pure_cavalry) < got < max(pure_infantry, pure_cavalry)


@pytest.mark.parametrize("attacker", sorted(get_spec().counter_matrix.get("unit_specific_overrides", {})))
def test_a_units_own_override_beats_its_category_row(attacker):
    """spec.counter_matrix.unit_specific_overrides. The Elephant and the Dragon are the reason this branch exists."""
    override = SPEC.counter_matrix["unit_specific_overrides"][attacker]["vs_category"]
    row = SPEC.counter_matrix["by_attacker_category_and_defender_category"][SPEC.units_by_name[attacker]["category"]]
    for category, multiplier in override.items():
        enemy = next(u for u, d in SPEC.units_by_name.items() if d["category"] == category)
        assert combat._counter_factor(attacker, [(enemy, 10)]) == pytest.approx(float(multiplier))
        if float(multiplier) != float(row[category]):
            assert combat._counter_factor(attacker, [(enemy, 10)]) != pytest.approx(float(row[category]))


def test_an_absent_enemy_leaves_the_multiplier_alone():
    assert combat._counter_factor("Arciere", []) == 1.0


# ------------------------------------------------------------------------------------------------ power composition
def _plain_duel(battle_id: str, attacker: dict[str, int], defender: dict[str, int]) -> dict:
    """No research, no specialization, no wall, and a terrain the spec gives no defender bonus — so the report's
    powers are the bare weighted sum and can be recomputed by hand."""
    assert float(SPEC.terrain["plain"]["defender_bonus_pct"]) == 0.0
    return combat.resolve_battle(battle_id, "ATTACK", attacker, {}, None, defender, {}, None, "plain", None)


def test_power_is_the_declared_blend_of_the_primary_stat_and_hp():
    """spec.combat_resolution.power_weights. Nothing failed before if these two weights drifted."""
    attacker, defender = {"Fanteria": 10}, {"Fanteria": 10}
    rep = _plain_duel("btl_conf_power", attacker, defender)
    w = SPEC.combat_resolution["power_weights"]
    primary, hp = float(w["primary_atk_or_def"]), float(w["hp"])

    def expect(units: dict[str, int], enemy: dict[str, int], stat: str) -> float:
        return sum(
            count * (primary * float(SPEC.units_by_name[u][stat]) * _mix_factor(u, enemy) + hp * float(SPEC.units_by_name[u]["hp"]))
            for u, count in units.items()
        )

    assert rep["attacker_power"] == pytest.approx(expect(attacker, defender, "atk") * rep["rng"]["attacker"], rel=1e-4)
    assert rep["defender_power"] == pytest.approx(expect(defender, attacker, "def") * rep["rng"]["defender"], rel=1e-4)


def test_the_winner_pays_the_canonical_fraction_of_its_army():
    """spec.combat_resolution.winner_loss: min(cap, coefficient * (loser/winner) ** exponent)."""
    rep = _plain_duel("btl_conf_loss", {"Fanteria": 400}, {"Fanteria": 120})
    wl = SPEC.combat_resolution["winner_loss"]
    powers = sorted([rep["attacker_power"], rep["defender_power"]])
    expected = min(float(wl["cap_fraction"]), float(wl["coefficient"]) * (powers[0] / powers[1]) ** float(wl["ratio_exponent"]))
    assert rep["winner_loss_fraction"] == pytest.approx(expected, rel=1e-4)

    winner = rep["attacker_losses"] if rep["winner"] == "ATTACKER" else rep["defender_losses"]
    started = rep["attacker_start"] if rep["winner"] == "ATTACKER" else rep["defender_start"]
    assert sum(winner.values()) == math.floor(sum(started.values()) * expected)


def test_the_winners_bill_never_exceeds_the_cap():
    """A hopelessly one-sided defence must not wipe the winner out; the cap is what stops it."""
    rep = _plain_duel("btl_conf_cap", {"Fanteria": 10}, {"Drago": 40})
    assert rep["winner_loss_fraction"] <= float(SPEC.combat_resolution["winner_loss"]["cap_fraction"])


# ------------------------------------------------------------------------------------------------ decisive outcomes
def test_an_undefended_settlement_falls():
    """spec.combat_resolution.zero_defender_troops_and_attackers_survive_walls."""
    rep = _plain_duel("btl_conf_empty", {"Fanteria": 5}, {})
    assert rep["winner"] == "ATTACKER"


def test_an_army_the_walls_wipe_out_loses_without_a_battle():
    """spec.combat_resolution.after_wall_phase_no_attackers. The defender wins even with nobody left standing."""
    wall = {"level": max(SPEC.walls), "current_hp": 10**7, "max_hp": 10**7}
    rep = combat.resolve_battle("btl_conf_wall", "ATTACK", {"Fanteria": 1}, {}, None, {"Fanteria": 1}, {}, None, "plain", wall)
    assert rep["attacker_survivors"] == {}
    assert rep["winner"] == "DEFENDER"
    assert rep["reason"] == SPEC.combat_resolution["after_wall_phase_no_attackers"]


@pytest.mark.parametrize("unit", get_spec().combat_resolution["noncombat_units_cannot_start_battle_alone"])
def test_a_noncombat_unit_cannot_open_a_battle_on_its_own(unit):
    """spec.combat_resolution.offensive_mission_minimum: a scout or a conquest cart is not an assault."""
    assert float(SPEC.units_by_name[unit]["atk"]) == 0.0
    for mission in SPEC.combat_resolution["offensive_mission_minimum"]["applies_to"]:
        with pytest.raises(ValueError, match=SPEC.combat_resolution["offensive_no_combat_error"]):
            combat.resolve_battle(f"btl_conf_{unit}", mission, {unit: 50}, {}, None, {"Fanteria": 1}, {}, None, "plain", None)


# ------------------------------------------------------------------------------------------------ marches
def test_a_formation_moves_at_the_pace_of_its_slowest_unit():
    """spec.marches.formation_speed_rule. Cavalry in the column does not make the siege train faster."""
    slow = min(SPEC.units_by_name["Fanteria"]["speed_tph"], SPEC.units_by_name["Cavalleria"]["speed_tph"])
    assert F.formation_speed_tph({"Fanteria": 10, "Cavalleria": 10}, {}) == pytest.approx(slow)
    assert F.formation_speed_tph({}, {}) == 0.0


def test_fully_researched_march_speed_matches_what_the_spec_grants():
    """spec.marches.research_speed_cap_pct is headroom today: the only research granting land_march_speed reaches
    10% against a 50% ceiling. So this pins the bonus actually applied, and flags a rebalance that pushes past the
    ceiling — at which point the clamp starts mattering and should be shown to work."""
    cap = float(SPEC.marches["research_speed_cap_pct"]) / 100.0
    effects = [(k, e) for k, e in SPEC.research_effects.items() if any(x.get("metric") == "land_march_speed" for x in e["effects"])]
    assert effects, "no research grants land_march_speed; this test would be vacuous"
    grantable = sum(float(x["per_level"]) * e["max_level"] for _, e in effects for x in e["effects"] if x.get("metric") == "land_march_speed")
    assert grantable <= cap, f"research can now grant {grantable}, over the {cap} ceiling: assert the clamp instead"

    # levels deliberately past max_level: research_effect_policy counts each level once, up to the declared maximum
    maxed = {k.replace(".", "__"): e["max_level"] + 5 for k, e in effects}
    base = SPEC.units_by_name["Fanteria"]["speed_tph"]
    assert F.formation_speed_tph({"Fanteria": 1}, maxed) == pytest.approx(base * (1.0 + grantable))


def test_eta_follows_the_canonical_formula():
    """spec.marches.eta_formula: 3600 * path_cost / speed, rounded up to whole seconds."""
    assert F.march_eta_seconds(12.5, 2.4) == math.ceil(3600.0 * 12.5 / 2.4)


def test_eta_never_dips_under_the_floor():
    """spec.marches.eta_floor_seconds, including the degenerate case of a formation that cannot move."""
    floor_s = int(SPEC.marches["eta_floor_seconds"])
    assert F.march_eta_seconds(0.0001, 99.0) == floor_s
    assert F.march_eta_seconds(500.0, 0.0) == floor_s


# ------------------------------------------------------------------------------------------------ path costs
def _plain_grid(n: int) -> np.ndarray:
    """Uniform walkable terrain, so a route's cost is only about geometry and territory."""
    plain = next(code for code in range(4) if SPEC.terrain_name(code) == "plain")
    return np.full((n, n), plain, dtype=np.int8)


def test_a_diagonal_step_costs_the_root_of_two():
    """spec.marches.diagonal_cost. Eight-neighbour movement priced as if it were four would shorten every route."""
    grid = _plain_grid(8)
    straight = astar(grid, (0, 0), (4, 0))
    diagonal = astar(grid, (0, 0), (4, 4))
    tile = float(SPEC.pathfinding_rules["terrain_costs"]["plain"])
    assert straight[1] == pytest.approx(4 * tile)
    assert diagonal[1] == pytest.approx(4 * tile * math.sqrt(2))


def test_own_territory_discounts_every_tile_entered():
    """spec.marches.own_or_ally_territory_path_cost_factor: moving at home is cheaper, tile by tile."""
    grid = _plain_grid(8)
    factor = float(SPEC.marches["own_or_ally_territory_path_cost_factor"])
    owned = {(x, 0) for x in range(1, 5)}
    assert astar(grid, (0, 0), (4, 0), territory=owned, factor=factor)[1] == pytest.approx(astar(grid, (0, 0), (4, 0))[1] * factor)


def test_water_is_not_a_road():
    """Land routes must not cross water even when that is the straight line (pathfinding_rules.terrain_costs)."""
    grid = _plain_grid(8)
    water = next(code for code in range(4) if SPEC.terrain_name(code) == "water")
    grid[:, 3] = water
    assert astar(grid, (0, 0), (6, 0)) is None
