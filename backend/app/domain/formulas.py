"""Pure canonical formulas. Every number comes from the Canonical Spec (get_spec())."""
from __future__ import annotations

import math
from decimal import ROUND_HALF_UP, Decimal

from app.core.spec import Spec, get_spec

RES = ["grain", "wood", "clay", "iron", "gold"]


def enc(key: str) -> str:
    """Research keys contain dots (economy.grain_1); Mongo field paths cannot. Storage form uses __."""
    return key.replace(".", "__")


def dec(key: str) -> str:
    return key.replace("__", ".")


def rget(research: dict[str, int], key: str) -> int:
    return int(research.get(enc(key), research.get(key, 0)) or 0)


def decode_research(research: dict[str, int]) -> dict[str, int]:
    return {dec(k): int(v) for k, v in (research or {}).items()}


def round_half_up(x: float) -> int:
    return int(Decimal(str(x)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def ceil_int(x) -> int:
    if isinstance(x, Decimal):
        return int(x.to_integral_value(rounding="ROUND_CEILING"))
    return int(math.ceil(x - 1e-9))


# --------------------------------------------------------------------------- research effects
def research_metric(research: dict[str, int], metric: str, spec: Spec | None = None) -> tuple[float, float | None]:
    """Sum ADD_THEN_CATEGORY_CAP contributions for `metric` over completed local research levels.
    Returns (uncapped_total, cap_declared_or_None). Each level counted exactly once (research_effect_policy)."""
    spec = spec or get_spec()
    total = 0.0
    cap: float | None = None
    for key, level in research.items():
        if not level:
            continue
        eff = spec.research_effects.get(dec(key))
        if not eff:
            continue
        for e in eff["effects"]:
            if e.get("metric") != metric:
                continue
            op = e.get("operator")
            if op == "ADD_THEN_CATEGORY_CAP":
                total += float(e["per_level"]) * min(level, eff["max_level"])
                if e.get("cap") is not None:
                    cap = float(e["cap"]) if cap is None else min(cap, float(e["cap"]))
            elif op == "LOOKUP_LEVEL":
                vals = e.get("values") or []
                total += float(vals[min(level, len(vals) - 1)])
    return total, cap


def capped_metric(research: dict[str, int], metric: str, default_cap: float | None = None) -> float:
    total, cap = research_metric(research, metric)
    c = cap if cap is not None else default_cap
    if c is not None:
        total = min(total, c) if total >= 0 else max(total, -c)
    return total


# --------------------------------------------------------------------------- economy
def production_per_hour(buildings: dict[str, int], research: dict[str, int], spec: Spec | None = None, extra_pct: float = 0.0) -> dict[str, float]:
    """extra_pct: additive-free multiplicative window bonus (Pyramid reward, Bible §21) — never part of the research cap."""
    spec = spec or get_spec()
    producer = {
        "grain": "Fattoria",
        "wood": "Boscaiolo",
        "clay": "Cava d'Argilla",
        "iron": "Miniera di Ferro",
        "gold": "Miniera d'Oro",
    }
    cap = float(spec.warehouse_policy["production_permanent_cap_fraction"])
    out: dict[str, float] = {}
    for res, bname in producer.items():
        lvl = int(buildings.get(bname, 0))
        base = float(spec.economy[lvl][f"{res}_per_h"]) if lvl > 0 else 0.0
        bonus = capped_metric(research, f"production.{res}", cap)
        out[res] = base * (1.0 + bonus) * (1.0 + max(0.0, float(extra_pct)) / 100.0)
    return out


def warehouse_capacity(buildings: dict[str, int], research: dict[str, int], spec: Spec | None = None) -> int:
    spec = spec or get_spec()
    lvl = int(buildings.get("Magazzino", 0))
    if lvl <= 0:
        return 0
    base = int(spec.economy[lvl]["warehouse_per_resource"])
    cap = float(spec.warehouse_policy["permanent_bonus_cap_fraction"])
    bonus = min(cap, research_metric(research, "warehouse_capacity", spec)[0])
    return int(math.floor(base * (1.0 + bonus) + 1e-9))


def overflow_credit(incoming: float, current: float, capacity: float) -> tuple[float, float]:
    """accepted = max(0, min(incoming, max(0, cap-current))); discarded = incoming-accepted."""
    incoming = max(0.0, incoming)
    accepted = max(0.0, min(incoming, max(0.0, capacity - current)))
    return accepted, incoming - accepted


# --------------------------------------------------------------------------- construction
def fast_eligible(owned_settlements: int, target_level: int, spec: Spec | None = None) -> bool:
    spec = spec or get_spec()
    f = spec.early_game_fast
    return (
        f["status"] == "ACTIVE"
        and owned_settlements <= int(f["max_owned_settlements_including_mother"])
        and target_level <= int(f["max_target_level"])
    )


def construction_cost_time(
    building: str,
    target_level: int,
    owned_settlements: int,
    research: dict[str, int],
    spec: Spec | None = None,
) -> dict:
    """Canonical row -> FAST (snapshot) -> construction research reduction; ceil once per resource/minute."""
    spec = spec or get_spec()
    base_cost, base_min = spec.building_cost_time(building, target_level)
    fast = fast_eligible(owned_settlements, target_level, spec)
    cost_mult = float(spec.early_game_fast["cost_multiplier"]) if fast else 1.0
    time_mult = float(spec.early_game_fast["time_multiplier"]) if fast else 1.0
    reduction = capped_metric(research, "construction_time_reduction", 0.35)
    cost = {r: ceil_int(Decimal(base_cost[r]) * Decimal(str(cost_mult))) for r in RES}
    minutes = ceil_int(Decimal(base_min) * Decimal(str(time_mult)) * (Decimal(1) - Decimal(str(reduction))))
    minutes = max(1, minutes)
    return {
        "base_cost": base_cost,
        "base_time_min": base_min,
        "cost": cost,
        "duration_min": minutes,
        "fast_applied": fast,
        "cost_multiplier": cost_mult,
        "time_multiplier": time_mult,
        "research_time_reduction": reduction,
    }


def research_cost_time(cost_class: str, level: int, research: dict[str, int], spec: Spec | None = None, speed_bonus_pct: float = 0.0) -> dict:
    spec = spec or get_spec()
    cost, base_min = spec.research_cost(cost_class, level)
    reduction = capped_metric(research, "research_time_reduction", 0.35)
    minutes = max(1, ceil_int(base_min * (1.0 - reduction) / (1.0 + max(0.0, float(speed_bonus_pct)) / 100.0)))
    return {"cost": cost, "base_time_min": base_min, "duration_min": minutes, "research_time_reduction": reduction, "pyramid_bonus_pct": float(speed_bonus_pct)}


# --------------------------------------------------------------------------- recruitment
def batch_cap(producer_level: int, spec: Spec | None = None) -> int:
    return round_half_up(50 * (1.18 ** (max(1, producer_level) - 1)))


def training_time_multiplier(producer_level: int) -> float:
    return 1.0 / (1.0 + 0.04 * (max(1, producer_level) - 1))


def unit_effective_time_seconds(unit: str, producer_level: int, research: dict[str, int], spec: Spec | None = None, pyramid_training_bonus_pct: float = 0.0) -> float:
    """Bible §31.4: base × 1/(1+0,04(L-1)) / (1 + training_research_bonus + pyramid_training_bonus)."""
    spec = spec or get_spec()
    base = spec.unit_base_time_seconds(unit)
    bonus = research_metric(research, "recruitment_throughput", spec)[0]
    return max(1.0, base * training_time_multiplier(producer_level) / (1.0 + bonus + max(0.0, float(pyramid_training_bonus_pct)) / 100.0))


def war_hall_cap(war_hall_level: int, research: dict[str, int], mission: str, spec: Spec | None = None) -> int:
    spec = spec or get_spec()
    f = spec.recruitment["war_hall_march_cap_formula"]
    # SPEC NOTE: cap for a settlement without Sala di Guerra is not defined; the formula base (L=1) is used.
    lvl = max(1, war_hall_level)
    base = round_half_up(float(f["base"]) * (float(f["growth_per_level"]) ** (lvl - 1)))
    bonus = research_metric(research, "march_capacity", spec)[0]
    if mission == "CONQUEST":
        bonus += capped_metric(research, "conquest_march_capacity", 0.10)
    return int(math.floor(base * (1.0 + bonus)))


def sentinel_garrison_cap(command_level: int, spec: Spec | None = None) -> int:
    spec = spec or get_spec()
    f = spec.recruitment["sentinel_garrison_cap_formula"]
    lvl = max(1, command_level)
    return round_half_up(float(f["base"]) * (float(f["growth_per_level"]) ** (lvl - 1)))


# --------------------------------------------------------------------------- walls
def wall_stats(level: int, research: dict[str, int], spec: Spec | None = None) -> dict:
    spec = spec or get_spec()
    if level <= 0:
        return {"level": 0, "max_hp": 0, "defense_bonus_pct": 0.0, "static_damage": 0.0}
    w = spec.walls[level]
    hp_bonus = min(0.75, research_metric(research, "settlement_wall_hp", spec)[0])
    dmg_bonus = min(0.75, research_metric(research, "settlement_wall_static_damage", spec)[0])
    return {
        "level": level,
        "max_hp": int(math.floor(w["base_hp"] * (1.0 + hp_bonus))),
        "defense_bonus_pct": float(w["defense_bonus_pct"]),
        "static_damage": float(w["base_direct_damage"]) * (1.0 + dmg_bonus),
    }


# --------------------------------------------------------------------------- marches
def formation_speed_tph(units: dict[str, int], research: dict[str, int], spec: Spec | None = None) -> float:
    spec = spec or get_spec()
    speeds = []
    for name, count in units.items():
        if count <= 0:
            continue
        u = spec.units_by_name[name]
        mastery = research_metric(research, f"unit.{name}.speed", spec)[0]
        speeds.append(float(u["speed_tph"]) * (1.0 + mastery))
    if not speeds:
        return 0.0
    slowest = min(speeds)
    cap = float(spec.marches["research_speed_cap_pct"]) / 100.0
    bonus = capped_metric(research, "land_march_speed", cap)
    return slowest * (1.0 + bonus)


def march_eta_seconds(path_cost: float, speed_tph: float, spec: Spec | None = None) -> int:
    spec = spec or get_spec()
    floor_s = int(spec.marches["eta_floor_seconds"])
    if speed_tph <= 0:
        return floor_s
    return max(floor_s, int(math.ceil(3600.0 * path_cost / speed_tph)))


# --------------------------------------------------------------------------- neutral template
def neutral_template(level: int, port_eligible: bool, spec: Spec | None = None) -> dict:
    """Bible §4: buildings + garrison composition for a neutral settlement of level L."""
    spec = spec or get_spec()
    L = level
    b = {"Castello / Fortezza": L}
    for p in spec.PRODUCERS:
        b[p] = max(1, L - 1)
    b["Magazzino"] = max(1, L - 1)
    b["Universita"] = max(1, L - 2)
    b["Mura"] = max(1, L - 2)
    b["Caserma"] = max(1, math.ceil(0.75 * L))
    if L >= 11:
        b["Scuderia"] = max(1, L - 5)
    if L >= 16:
        b["Officina"] = max(1, L - 10)
    if port_eligible and L >= 15:
        b["Porto"] = max(1, L - 14)
    total = 100 * L * L
    if L <= 10:
        comp = {"Fanteria": 0.65, "Arciere": 0.35}
    elif L <= 15:
        comp = {"Fanteria": 0.45, "Arciere": 0.35, "Cavalleria": 0.20}
    else:
        comp = {"Fanteria": 0.45, "Arciere": 0.30, "Cavalleria": 0.20, "Catapulta": 0.05}
    army: dict[str, int] = {}
    for unit, frac in comp.items():
        # units below their unlock level convert to Fanteria (Arciere min settlement level 3)
        min_lvl = spec.units_by_name[unit]["min_settlement_level"]
        target = unit if L >= min_lvl else "Fanteria"
        army[target] = army.get(target, 0) + int(math.floor(total * frac))
    assigned = sum(army.values())
    army["Fanteria"] = army.get("Fanteria", 0) + (total - assigned)
    return {"buildings": b, "army": {k: v for k, v in army.items() if v > 0}}


def neutral_level_cap(world_age_days: float, spec: Spec | None = None) -> int:
    spec = spec or get_spec()
    for row in spec.neutral_runtime["world_age_caps"]:
        if row["max_world_age_days"] is None or world_age_days <= row["max_world_age_days"]:
            return int(row["neutral_level_cap"])
    return int(spec.neutral_runtime["world_age_caps"][-1]["neutral_level_cap"])


def development_score(level: int, buildings: dict[str, int], research: dict[str, int]) -> int:
    return 10000 * level + 100 * sum(buildings.values()) + 25 * sum(research.values())


def largest_remainder(total: int, weights: list[float]) -> list[int]:
    """Deterministic integer apportionment; ties resolved by index order (canonical roster order)."""
    s = sum(weights)
    if total <= 0 or s <= 0:
        return [0] * len(weights)
    raw = [total * w / s for w in weights]
    base = [int(math.floor(r)) for r in raw]
    rem = total - sum(base)
    order = sorted(range(len(weights)), key=lambda i: (-(raw[i] - base[i]), i))
    for i in order[:rem]:
        base[i] += 1
    return base
