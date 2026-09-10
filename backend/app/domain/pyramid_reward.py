"""Pyramid reward window read-side (Bible §21): the winning Alliance's membership snapshot carries a 14-day economic
bonus (+production / +research / +training / +caravan capacity, never ATK/DEF). The window is denormalised on the
player and on each of their settlements as `pyramid_reward = {until, production_pct, research_pct, training_pct,
caravan_capacity_pct, cycle_id, alliance_id}` so economy/research/recruitment/caravan formulas can read it without
extra queries. Rewards never stack: a newer window simply replaces the previous one."""
from __future__ import annotations

from app.core import clock

KEYS = ("production_pct", "research_pct", "training_pct", "caravan_capacity_pct")
ZERO = {k: 0.0 for k in KEYS}


def active(doc: dict | None) -> dict | None:
    """The reward window of a player/settlement document if it is still running, else None."""
    r = (doc or {}).get("pyramid_reward")
    if not r:
        return None
    until = clock.aware(r.get("until"))
    if not until or until <= clock.now():
        return None
    return r


def bonus_pct(doc: dict | None) -> dict[str, float]:
    r = active(doc)
    if not r:
        return dict(ZERO)
    return {k: float(r.get(k, 0.0)) for k in KEYS}
