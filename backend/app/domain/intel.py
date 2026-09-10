"""Intelligence engine — Bible §34.10 / spec.intelligence_engine.

effective_intel_score = clamp(0,100, 4·Σ observation levels (observer) − 3·Σ counter levels (observed march owner) + source bonus)
A detection event exists once a hostile march enters the defender's surveilled territory (entry tile); it can never be
suppressed afterwards. Disclosure detail is a deterministic band centred on the true value — the UI never fabricates a
false heading, category or mission family.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from app.core import clock
from app.core.spec import get_spec
from app.domain import formulas as F

OFFENSIVE = {"ATTACK", "RAID", "CONQUEST"}
HEADINGS_8 = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]


def _engine() -> dict:
    return get_spec().raw["intelligence_engine"]


def score(observer_research: dict, observed_research: dict, sentinel_source_research: dict | None) -> int:
    eng = _engine()
    obs = sum(F.rget(observer_research, k) for k in eng["observation_keys"])
    counter = sum(F.rget(observed_research, k) for k in eng["counter_keys"])
    bonus = 0
    if sentinel_source_research is not None:  # detection originated from the Sentinel network
        sb = eng["source_bonus_points"]
        bonus += F.rget(sentinel_source_research, "sentinel.signals_1") * int(sb["sentinel.signals_1_per_level"])
        bonus += F.rget(sentinel_source_research, "sentinel.signals_2") * int(sb["sentinel.signals_2_per_level"])
    return max(0, min(100, 4 * obs - 3 * counter + bonus))


def tier_of(s: int) -> dict:
    for t in _engine()["tiers"]:
        if int(t["min_score"]) <= s <= int(t["max_score"]):
            return t
    return _engine()["tiers"][0]


def entry_index(path: list, defender_tiles: set[tuple[int, int]]) -> int:
    """First path index inside the defender's territory (the target tile itself is always own territory)."""
    for i, p in enumerate(path):
        if i > 0 and (int(p[0]), int(p[1])) in defender_tiles:
            return i
    return max(0, len(path) - 1)


def detection_time(departed_at: datetime, eta_seconds: float, path_len: int, entry_idx: int) -> datetime:
    frac = entry_idx / max(1, path_len - 1)
    return clock.aware(departed_at) + timedelta(seconds=float(eta_seconds) * frac)


def heading(path: list, entry_idx: int, coarse: bool) -> str:
    """Direction of travel across the border (from the tile before entry towards the target)."""
    a = path[max(0, entry_idx - 3)]
    b = path[min(len(path) - 1, entry_idx + 3)]
    dx, dy = int(b[0]) - int(a[0]), int(b[1]) - int(a[1])
    if dx == 0 and dy == 0:
        return "N"
    import math

    ang = (math.degrees(math.atan2(dx, -dy)) + 360.0) % 360.0  # 0 = North (−y), clockwise
    if coarse:
        return ["N", "E", "S", "W"][int(((ang + 45.0) % 360.0) // 90.0)]
    return HEADINGS_8[int(((ang + 22.5) % 360.0) // 45.0)]


def band(value: float, pct: float | None) -> list[int] | None:
    if pct is None:
        return None
    lo = int(round(value * (1 - pct / 100.0)))
    hi = int(round(value * (1 + pct / 100.0)))
    return [max(0, lo), max(hi, lo)]


def disclose(march: dict, observer_research: dict, sentinel_source_research: dict | None, defender_tiles: set[tuple[int, int]]) -> dict:
    spec = get_spec()
    path = march.get("path") or []
    idx = entry_index(path, defender_tiles)
    detected_at = detection_time(march["departed_at"], march.get("eta_seconds", 0), len(path), idx)
    s = score(observer_research, march.get("research_snapshot", {}) or {}, sentinel_source_research)
    tier = tier_of(s)
    reveal = set(tier["reveal"])
    units: dict[str, int] = {u: int(c) for u, c in (march.get("units") or {}).items()}
    total = sum(units.values())
    cats: dict[str, int] = {}
    for u, c in units.items():
        cat = spec.units_by_name[u]["category"]
        cats[cat] = cats.get(cat, 0) + c
    eta_pct = tier.get("eta_error_pct")
    troop_pct = tier.get("troop_count_error_pct")
    arrival = clock.aware(march["arrival_at"])
    remaining = max(0.0, (arrival - clock.now()).total_seconds())
    out: dict = {
        "detected_at": clock.iso(detected_at),
        "entry_tile": [int(path[idx][0]), int(path[idx][1])] if path else None,
        "entry_index": idx,
        "intel_score": s,
        "tier": {"min_score": tier["min_score"], "max_score": tier["max_score"], "reveal": sorted(reveal)},
        "heading": heading(path, idx, coarse="heading" not in reveal and "coarse_heading" in reveal) if path else None,
        "mission_class": None,
        "mission_family": None,
        "eta_error_pct": eta_pct,
        "eta_range": None,
        "troop_error_pct": troop_pct,
        "troops_total_range": None,
        "unit_categories": None,
        "category_bands": None,
        "composition": None,
        "flags": None,
    }
    if "mission_class" in reveal or "mission_family" in reveal:
        out["mission_class"] = "OFFENSIVE" if march["mission"] in OFFENSIVE else "SUPPORT"
    if "mission_family" in reveal:
        out["mission_family"] = march["mission"]
    if eta_pct is not None:
        lo, hi = remaining * (1 - eta_pct / 100.0), remaining * (1 + eta_pct / 100.0)
        now = clock.now()
        out["eta_range"] = [clock.iso(now + timedelta(seconds=lo)), clock.iso(now + timedelta(seconds=hi))]
    if troop_pct is not None:
        out["troops_total_range"] = band(total, troop_pct)
    if "unit_categories" in reveal:
        out["unit_categories"] = sorted(cats.keys())
    if "stack_percentage_bands_10pp" in reveal and total:
        out["category_bands"] = {c: int(round((n / total) * 10.0)) * 10 for c, n in cats.items()}
    if "near_exact_stack_composition" in reveal:
        out["composition"] = {u: band(c, troop_pct) for u, c in units.items()}
    if "siege_cart_legendary_flags" in reveal:
        out["flags"] = {
            "siege_cart": units.get("Carro di Conquista", 0) > 0,
            "legendary": any(spec.units_by_name[u]["category"] == "legendary" for u in units),
        }
    return out
