"""Combat resolver (Bible §16, spec.combat_resolution / counter_matrix / modifier_algebra / unit_special_abilities).

Order: snapshot -> siege wall damage -> wall static casualties -> power (counter, research, specialization,
terrain, wall x integrity, self bonus, aura, debuff) -> seeded RNG (last) -> winner -> winner casualties -> report.
Transport ships are never part of the roster (navigation.eligible_for_casualties=false)."""
from __future__ import annotations

import hashlib
import math
import random

from app.core.spec import get_spec
from app.domain import formulas as F


def _roster(units: dict[str, int]) -> list[tuple[str, int]]:
    spec = get_spec()
    return [(u, int(units.get(u, 0))) for u in spec.unit_order if int(units.get(u, 0)) > 0]


def _counter_factor(attacker_unit: str, enemy: list[tuple[str, int]]) -> float:
    spec = get_spec()
    cm = spec.counter_matrix
    total = sum(c for _, c in enemy)
    if total <= 0:
        return 1.0
    a_cat = spec.units_by_name[attacker_unit]["category"]
    row = cm["by_attacker_category_and_defender_category"].get(a_cat, {})
    override = (cm.get("unit_specific_overrides", {}).get(attacker_unit) or {}).get("vs_category", {})
    factor = 0.0
    for e_unit, cnt in enemy:
        e_cat = spec.units_by_name[e_unit]["category"]
        mult = override.get(e_cat, row.get(e_cat, cm["default_multiplier"]))
        factor += (cnt / total) * float(mult)
    return factor


def _hp_mult(unit: str, research: dict[str, int]) -> float:
    spec = get_spec()
    total = F.research_metric(research, "troop_hp", spec)[0]
    unit_hp, cap = F.research_metric(research, f"unit.{unit}.hp", spec)
    if cap is not None:
        unit_hp = min(unit_hp, cap)
    return 1.0 + total + unit_hp


def _effective_hp(unit: str, research: dict[str, int]) -> float:
    return float(get_spec().units_by_name[unit]["hp"]) * _hp_mult(unit, research)


def _distribute_casualties(roster: list[tuple[str, int]], total: int, research: dict[str, int]) -> dict[str, int]:
    """Proportional to count_i / HP_i, deterministic largest remainder, capped at stack size with reflow."""
    losses = {u: 0 for u, _ in roster}
    remaining = total
    alive = [(u, c) for u, c in roster]
    while remaining > 0 and alive:
        weights = [c / _effective_hp(u, research) for u, c in alive]
        alloc = F.largest_remainder(remaining, weights)
        progressed = False
        new_alive = []
        for (u, c), k in zip(alive, alloc):
            k = min(k, c)
            if k > 0:
                progressed = True
            losses[u] += k
            remaining -= k
            if c - k > 0:
                new_alive.append((u, c - k))
        alive = new_alive
        if not progressed:
            break
    return losses


def _wall_static_casualties(roster: list[tuple[str, int]], pool: float, research: dict[str, int]) -> dict[str, int]:
    """Pool allocated proportional to surviving unit counts; kills=floor(dmg/eff_hp); overkill reflowed."""
    losses = {u: 0 for u, _ in roster}
    alive = [(u, c) for u, c in roster]
    guard = 0
    while pool > 0 and alive and guard < 50:
        guard += 1
        weights = [float(c) for _, c in alive]
        total_w = sum(weights)
        used = 0.0
        new_alive = []
        any_kill = False
        for (u, c), w in zip(alive, weights):
            dmg = pool * w / total_w
            hp = _effective_hp(u, research)
            kills = min(c, int(math.floor(dmg / hp)))
            if kills > 0:
                any_kill = True
            losses[u] += kills
            used += kills * hp
            if c - kills > 0:
                new_alive.append((u, c - kills))
        alive = new_alive
        pool -= used
        if not any_kill:
            break
    return losses


def resolve_battle(
    battle_id: str,
    mission: str,
    attacker_units: dict[str, int],
    attacker_research: dict[str, int],
    attacker_specialization: str | None,
    defender_units: dict[str, int],
    defender_research: dict[str, int],
    defender_specialization: str | None,
    terrain: str,
    wall: dict | None,
    defender_kind: str = "SETTLEMENT",
    attacker_bonus_atk_pct: float = 0.0,
) -> dict:
    spec = get_spec()
    cr = spec.combat_resolution
    att = _roster(attacker_units)
    dfn = _roster(defender_units)
    if mission in cr["offensive_mission_minimum"]["applies_to"] and not any(spec.units_by_name[u]["atk"] > 0 for u, _ in att):
        raise ValueError(cr["offensive_no_combat_error"])
    seed_int = int(hashlib.sha256(battle_id.encode()).hexdigest(), 16) % (2**63)
    rng = random.Random(seed_int)
    att_rng = rng.uniform(cr["rng"]["multiplier_min"], cr["rng"]["multiplier_max"])
    def_rng = rng.uniform(cr["rng"]["multiplier_min"], cr["rng"]["multiplier_max"])

    report: dict = {
        "battle_id": battle_id,
        "seed": seed_int,
        "mission": mission,
        "terrain": terrain,
        "defender_kind": defender_kind,
        "attacker_start": dict(att),
        "defender_start": dict(dfn),
        "modifiers": {},
    }

    # ---- 1) siege wall damage (attacker only) ----
    wall_before = dict(wall) if wall else None
    integrity = 0.0
    bear_reduction = 0.0
    structural = 0.0
    if wall and defender_kind == "SETTLEMENT" and wall.get("max_hp", 0) > 0:
        pos_bonus = F.capped_metric(attacker_research, "positive_wall_damage", 0.15)
        for u, c in att:
            wd = float(spec.units_by_name[u]["wall_damage"])
            if wd <= 0:
                continue
            unit_bonus = F.research_metric(attacker_research, f"unit.{u}.wall_damage", spec)[0]
            structural += c * wd * (1.0 + pos_bonus + unit_bonus)
        new_hp = max(0, int(wall["current_hp"]) - int(math.floor(structural)))
        integrity = new_hp / float(wall["max_hp"])
        wall = {**wall, "current_hp": new_hp}
        bears = dict(att).get("Orso", 0)
        ab = spec.unit_special_abilities["Orso"]
        steps = bears // int(ab["trigger_units_per_step"])
        bear_reduction = min(float(ab["cap_reduction_pct"]), steps * float(ab["reduction_per_step_pct"])) / 100.0
    report["wall"] = {"before": wall_before, "after": wall, "structural_damage": int(math.floor(structural)), "integrity_after": round(integrity, 4), "bear_reduction": bear_reduction}

    # ---- 2) wall static casualties ----
    wall_losses = {u: 0 for u, _ in att}
    if wall and defender_kind == "SETTLEMENT" and wall.get("max_hp", 0) > 0:
        ws = F.wall_stats(int(wall["level"]), defender_research, spec)
        pool = ws["static_damage"] * integrity * (1.0 - bear_reduction)
        wall_losses = _wall_static_casualties(att, pool, attacker_research)
        att = [(u, c - wall_losses.get(u, 0)) for u, c in att if c - wall_losses.get(u, 0) > 0]
        report["wall"]["static_pool"] = round(pool, 2)
    report["wall_static_losses"] = wall_losses

    att_total = sum(c for _, c in att)
    def_total = sum(c for _, c in dfn)
    if att_total == 0:
        return _finish(report, "DEFENDER", att, dfn, 0.0, 0.0, att_rng, def_rng, wall_losses, {u: 0 for u in dict(dfn)}, attacker_research, defender_research, reason=cr["after_wall_phase_no_attackers"])

    # ---- 3) power ----
    # specialization slot of the frozen attacker order also carries the mercenary-contract target bonus (+3% ATK,
    # Bible §19.1): same category → percentages add first, then multiply
    ps = spec.player_specialization["choices"]
    spec_att = 1.0 + (float(ps["ATTACKER"]["bonus_pct"]) / 100.0 if attacker_specialization == "ATTACKER" else 0.0) + max(0.0, float(attacker_bonus_atk_pct)) / 100.0
    spec_def = 1.0 + (float(ps["DEFENDER"]["bonus_pct"]) / 100.0 if defender_specialization == "DEFENDER" else 0.0)
    terrain_bonus = float(spec.terrain[terrain]["defender_bonus_pct"]) / 100.0
    wall_def = 0.0
    if wall and defender_kind == "SETTLEMENT" and wall.get("max_hp", 0) > 0:
        wall_def = float(spec.walls[int(wall["level"])]["defense_bonus_pct"]) / 100.0 * integrity * (1.0 - bear_reduction)

    # debuffs (same-category add, cap 25%)
    wolf_ab = spec.unit_special_abilities["Lupo"]
    lion_ab = spec.unit_special_abilities["Leone"]

    def side_debuffs(units: list[tuple[str, int]], defending: bool) -> tuple[float, float]:
        wolves = dict(units).get("Lupo", 0)
        steps = wolves // int(wolf_ab["trigger_units_per_step"])
        cap = float(wolf_ab["cap_pct_when_wolf_side_defends" if defending else "cap_pct_when_wolf_side_attacks"])
        wolf_atk = min(-cap, steps * abs(float(wolf_ab["effect_per_step_enemy_atk_pct"])))
        demons = dict(units).get("Demone", 0)
        atk_deb = wolf_atk + (8.0 if demons > 0 else 0.0)
        def_deb = 12.0 if demons > 0 else 0.0
        return min(25.0, atk_deb) / 100.0, min(25.0, def_deb) / 100.0

    att_deb_atk, att_deb_def = side_debuffs(att, defending=False)  # debuffs the attacker inflicts on the defender
    def_deb_atk, def_deb_def = side_debuffs(dfn, defending=True)  # debuffs the defender inflicts on the attacker

    atk_general = F.research_metric(attacker_research, "troop_atk", spec)[0]
    def_general = F.research_metric(defender_research, "troop_def", spec)[0]
    garrison_metric = "settlement_garrison_def" if defender_kind == "SETTLEMENT" else "sentinel_garrison_def"
    garrison_def = F.capped_metric(defender_research, garrison_metric, 0.25 if defender_kind == "SENTINEL" else None)

    lion_fury_att = def_total >= 2 * att_total
    lion_fury_def = att_total >= 2 * def_total

    def stack_power(u: str, c: int, enemy: list[tuple[str, int]], attacking: bool) -> float:
        unit = spec.units_by_name[u]
        counter = _counter_factor(u, enemy)
        if attacking:
            stat = float(unit["atk"])
            research_mult = 1.0 + atk_general + F.research_metric(attacker_research, f"unit.{u}.atk", spec)[0]
            self_bonus = (1.0 + float(lion_ab["effect_lion_stack_atk_pct"]) / 100.0) if (u == "Leone" and lion_fury_att) else 1.0
            debuff = 1.0 - def_deb_atk
            primary = stat * counter * research_mult * spec_att * self_bonus * debuff
            hp = float(unit["hp"]) * _hp_mult(u, attacker_research)
        else:
            stat = float(unit["def"])
            research_mult = 1.0 + def_general + garrison_def + F.research_metric(defender_research, f"unit.{u}.def", spec)[0]
            self_bonus = 1.0
            debuff = 1.0 - att_deb_def
            primary = stat * counter * research_mult * spec_def * (1.0 + terrain_bonus) * (1.0 + wall_def) * self_bonus * debuff
            hp = float(unit["hp"]) * _hp_mult(u, defender_research)
        w = cr["power_weights"]
        return c * (float(w["primary_atk_or_def"]) * primary + float(w["hp"]) * hp)

    att_power = sum(stack_power(u, c, dfn, True) for u, c in att) * att_rng
    def_power = sum(stack_power(u, c, att, False) for u, c in dfn) * def_rng
    report["modifiers"] = {
        "attacker_specialization": spec_att,
        "attacker_contract_bonus_pct": float(attacker_bonus_atk_pct),
        "defender_specialization": spec_def,
        "terrain_bonus": terrain_bonus,
        "wall_def_bonus_effective": round(wall_def, 4),
        "attacker_debuff_on_defender": {"atk": att_deb_atk, "def": att_deb_def},
        "defender_debuff_on_attacker": {"atk": def_deb_atk, "def": def_deb_def},
        "lion_fury_attacker": lion_fury_att,
        "lion_fury_defender": lion_fury_def,
    }

    if def_total == 0:
        winner = "ATTACKER"
    elif att_power > def_power:
        winner = "ATTACKER"
    else:
        winner = "DEFENDER"  # exact tie -> defender

    # ---- winner casualties ----
    wl = cr["winner_loss"]
    if winner == "ATTACKER":
        loser_power, winner_power, w_roster, w_research = def_power, att_power, att, attacker_research
    else:
        loser_power, winner_power, w_roster, w_research = att_power, def_power, dfn, defender_research
    fraction = 0.0
    if winner_power > 0 and loser_power > 0:
        fraction = min(float(wl["cap_fraction"]), float(wl["coefficient"]) * (loser_power / winner_power) ** float(wl["ratio_exponent"]))
    total_units = sum(c for _, c in w_roster)
    total_cas = int(math.floor(total_units * fraction))
    if dict(w_roster).get("Angelo", 0) > 0:
        total_cas = int(math.floor(total_cas * (1.0 - min(0.25, 0.15))))
    winner_losses = _distribute_casualties(w_roster, total_cas, w_research)
    if winner == "ATTACKER":
        att_losses = {u: wall_losses.get(u, 0) + winner_losses.get(u, 0) for u in set(wall_losses) | set(winner_losses)}
        def_losses = {u: c for u, c in dfn}
    else:
        att_losses = {u: c for u, c in report["attacker_start"].items()}
        def_losses = winner_losses
    report["winner_loss_fraction"] = round(fraction, 6)
    return _finish(report, winner, att, dfn, att_power, def_power, att_rng, def_rng, att_losses, def_losses, attacker_research, defender_research)


def _finish(report: dict, winner: str, att, dfn, att_power: float, def_power: float, att_rng: float, def_rng: float, att_losses: dict, def_losses: dict, ar: dict, dr: dict, reason: str | None = None) -> dict:
    att_start = report["attacker_start"]
    def_start = report["defender_start"]
    att_losses = {u: min(int(att_start.get(u, 0)), int(att_losses.get(u, 0))) for u in att_start}
    def_losses = {u: min(int(def_start.get(u, 0)), int(def_losses.get(u, 0))) for u in def_start}
    report.update(
        {
            "winner": winner,
            "reason": reason,
            "attacker_power": round(att_power, 3),
            "defender_power": round(def_power, 3),
            "rng": {"attacker": round(att_rng, 6), "defender": round(def_rng, 6)},
            "attacker_losses": att_losses,
            "defender_losses": def_losses,
            "attacker_survivors": {u: att_start[u] - att_losses[u] for u in att_start if att_start[u] - att_losses[u] > 0},
            "defender_survivors": {u: def_start[u] - def_losses[u] for u in def_start if def_start[u] - def_losses[u] > 0},
        }
    )
    return report
