"""Pure-geometry tests for Sentinel sectors (Bible §14): wedge coverage, single ownership between wedges, natural
boundaries (water / map edge replace the physical Sentinel, mountains never)."""
from __future__ import annotations

import numpy as np

from app.domain.sentinels import DIRS, INNER, all_slots, natural_directions, ring_for, sector_tiles


def test_inner_wedges_partition_the_7x7_square():
    wedges = {d: set(sector_tiles((10, 10), d, "INNER", 3, 5)) for d in INNER}
    assert all(len(w) == 12 for w in wedges.values())
    union = set().union(*wedges.values())
    assert len(union) == 48 and (10, 10) not in union
    assert union == {(10 + dx, 10 + dy) for dx in range(-3, 4) for dy in range(-3, 4)} - {(10, 10)}
    # sentinel tile of each direction lies in its own wedge
    for d in INNER:
        dx, dy = DIRS[d]
        assert (10 + dx * 3, 10 + dy * 3) in wedges[d]


def test_outer_wedges_partition_the_ring_band():
    wedges = {d: set(sector_tiles((10, 10), d, "OUTER", 3, 5)) for d in DIRS}
    union = set().union(*wedges.values())
    assert len(union) == 11 * 11 - 7 * 7
    assert sum(len(w) for w in wedges.values()) == len(union)  # disjoint
    for d in DIRS:
        dx, dy = DIRS[d]
        assert (10 + dx * 5, 10 + dy * 5) in wedges[d]


def test_twelve_slots_and_ring_defaults():
    assert len(all_slots()) == 12
    assert ring_for("N", None) == "INNER" and ring_for("N", "OUTER") == "OUTER" and ring_for("NE", None) == "OUTER"


def test_natural_boundary_water_and_edge_not_mountain():
    g = np.zeros((20, 20), dtype=np.uint8)
    g[:, 13] = 3  # water column east at x=13 (inner E slot)
    g[7, 10] = 2  # mountain on the inner N slot → NOT a natural boundary
    doc = {"x": 10, "y": 10, "buildings": {"Comando Sentinelle": 1}, "research": {}}
    nat = natural_directions(doc, g)
    keys = {(n["direction"], n["ring"]): n for n in nat}
    assert ("E", "INNER") in keys and keys[("E", "INNER")]["eligible"]
    assert ("N", "INNER") not in keys
    # outer ring needs Perimetro Avanzato to be eligible
    g2 = np.zeros((20, 20), dtype=np.uint8)
    g2[:, 15] = 3  # outer E slot (15,10)
    nat2 = {(n["direction"], n["ring"]): n for n in natural_directions(doc, g2)}
    assert nat2[("E", "OUTER")]["eligible"] is False
    doc["research"] = {"sentinel.advanced_perimeter": 1}
    nat3 = {(n["direction"], n["ring"]): n for n in natural_directions(doc, g2)}
    assert nat3[("E", "OUTER")]["eligible"] is True
    # map edge
    edge = {"x": 1, "y": 1, "buildings": {"Comando Sentinelle": 1}, "research": {"sentinel.advanced_perimeter": 1}}
    nat4 = {(n["direction"], n["ring"]) for n in natural_directions(edge, np.zeros((20, 20), dtype=np.uint8))}
    assert ("N", "INNER") in nat4 and ("W", "INNER") in nat4 and ("NW", "OUTER") in nat4 and ("S", "INNER") not in nat4
