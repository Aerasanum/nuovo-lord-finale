"""Pyramid reward window read-side (Bible §21): the winning Alliance's membership snapshot carries a 14-day economic
bonus (+production / +research / +training / +caravan capacity, never ATK/DEF). The window is denormalised on the
player and on each of their settlements as `pyramid_reward = {until, production_pct, research_pct, training_pct,
caravan_capacity_pct, cycle_id, alliance_id, pyramid_id}` so economy/research/recruitment/caravan formulas can read it
without extra queries. Windows of the same slot never stack: a newer one simply replaces the previous one.

Grande Mondo: the Grande Piramide victory grants a second, independent slot (`grand_pyramid_reward`, 7 days, to every
player of the winning region) that ADDS to the regional/classic window."""
from __future__ import annotations

from app.core import clock

KEYS = ("production_pct", "research_pct", "training_pct", "caravan_capacity_pct")
ZERO = {k: 0.0 for k in KEYS}
FIELD = "pyramid_reward"
GRAND_FIELD = "grand_pyramid_reward"


def _window(doc: dict | None, field: str) -> dict | None:
    r = (doc or {}).get(field)
    if not r:
        return None
    until = clock.aware(r.get("until"))
    if not until or until <= clock.now():
        return None
    return r


def active(doc: dict | None) -> dict | None:
    """The classic/regional reward window of a player/settlement document if it is still running, else None."""
    return _window(doc, FIELD)


def active_grand(doc: dict | None) -> dict | None:
    """The Grande Piramide reward window (region-wide) if it is still running, else None."""
    return _window(doc, GRAND_FIELD)


def bonus_pct(doc: dict | None) -> dict[str, float]:
    out = dict(ZERO)
    for r in (active(doc), active_grand(doc)):
        if r:
            for k in KEYS:
                out[k] += float(r.get(k, 0.0))
    return out
