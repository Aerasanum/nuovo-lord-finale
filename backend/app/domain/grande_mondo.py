"""Grande Mondo (Bibbia del Grande Mondo v0.2) — one mega-realm, N regions, fog wall, War of the Regions.

Geometry ("Corona dei Regni"): every region is a full realm square (its own landmass, islands, 100 slots, 800
neutrals, regional Pyramid at the centre) placed on a ring around the neutral central land that carries the Grande
Piramide; a land arm ("Via della Piramide") links each region to the centre. Regions never overlap and are separated by
at least `fog_gap` tiles of open sea — so a single coordinate space holds the whole Grande Mondo and day 120 needs no
data merge.

Fog wall = server rule. While the phase is ISOLATION, every movement (march, caravan, interception, naval route) must
stay inside the origin's region zone; the zone grid (uint8 per tile: 0 = interregional sea / central land, k = region
k) is applied as an A* passability mask and the target is rejected up-front with `FOG_WALL`.

Cycle (persisted in `worlds.gm`, scheduler event GM_PHASE_DEADLINE keyed by `gm.deadline_key`):
  ISOLATION (isolation_days) → WAR (war_days, or closed early by the Grande Piramide victory) → ISOLATION (cycle+1) …
"""
from __future__ import annotations

import math
from datetime import timedelta

import numpy as np

from app.core import clock
from app.core.db import db
from app.core.errors import ApiError
from app.domain import notifications, progress, scheduler

KIND = "GRANDE_MONDO"
EVENT = "GM_PHASE_DEADLINE"
PHASES = ("ISOLATION", "WAR")

# Bibbia GM §Regioni e lingue (7 canonical) + the two bonus regions chosen by the owner (Regno Unito, Portogallo)
REGION_CATALOG = [
    {"code": "IT", "name": "Italia", "lang": "it"},
    {"code": "FR", "name": "Francia", "lang": "fr"},
    {"code": "ES", "name": "Spagna", "lang": "es"},
    {"code": "DE", "name": "Germania", "lang": "de"},
    {"code": "AT", "name": "Austria", "lang": "de"},
    {"code": "RU", "name": "Russia", "lang": "ru"},
    {"code": "CN", "name": "Cina", "lang": "zh-CN"},
    {"code": "UK", "name": "Regno Unito", "lang": "en"},
    {"code": "PT", "name": "Portogallo", "lang": "pt"},
]

# Bibbia GM "Parametri iniziali" (+ owner decisions: 9 regions, 600×600, players 16/20, neutrals 7/9)
DEFAULTS = {
    "regions": 9,
    "region_size": 600,
    "max_players_per_region": 100,
    "isolation_days": 120,
    "war_days": 20,
    "pyramid_hold_hours": 168,
    "fog_gap": 64,  # open sea between two region squares (> caravan search radius 50: no cross-fog detection)
    "margin": 48,  # sea beyond the outer edge of the ring
    "center_radius": 480,  # neutral central land around the Grande Piramide
    "arm_width": 26,  # land arm linking each region to the centre
    "region_gen": {"hard_min_player_distance": 16, "preferred_player_distance": 20, "neutral_min_distance": 7, "neutral_preferred_distance": 9},
}


# ------------------------------------------------------------------------------------------------ geometry
def layout(n: int, size: int, gap: int, margin: int) -> dict:
    """Ring of `n` axis-aligned squares: the smallest radius with pairwise Chebyshev centre distance ≥ size+gap.
    Region 0 sits north, the others follow clockwise (screen space, y down)."""
    need = size + gap
    angles = [math.radians(-90 + 360.0 * k / n) for k in range(n)]

    def centres(r: float) -> list[tuple[float, float]]:
        return [(r * math.cos(a), r * math.sin(a)) for a in angles]

    radius = size
    while True:
        c = centres(radius)
        if all(max(abs(c[i][0] - c[j][0]), abs(c[i][1] - c[j][1])) >= need for i in range(n) for j in range(i + 1, n)):
            break
        radius += 1
    span = 2 * (radius + size / 2) + 2 * margin
    world = int(math.ceil(span / 32.0)) * 32
    cx = cy = world // 2
    regions = []
    for k, (dx, dy) in enumerate(centres(radius)):
        x0 = int(round(cx + dx - size / 2))
        y0 = int(round(cy + dy - size / 2))
        regions.append({"index": k, "x0": x0, "y0": y0, "size": size, "angle": angles[k]})
    return {"world_size": world, "ring_radius": radius, "center": [cx, cy], "regions": regions}


def nearest_point(reg: dict, px: float, py: float) -> tuple[float, float]:
    """Point of the region square closest to (px, py)."""
    return (min(max(px, reg["x0"]), reg["x0"] + reg["size"] - 1), min(max(py, reg["y0"]), reg["y0"] + reg["size"] - 1))


def region_at(world: dict, x: int, y: int) -> dict | None:
    for r in world.get("regions") or []:
        if r["x0"] <= x < r["x0"] + r["size"] and r["y0"] <= y < r["y0"] + r["size"]:
            return r
    return None


def region_by_code(world: dict, code: str | None) -> dict | None:
    for r in world.get("regions") or []:
        if r["code"] == code:
            return r
    return None


_zone_cache: dict[str, np.ndarray] = {}


def zone_grid(world: dict) -> np.ndarray:
    """uint8 [y, x]: 0 = interregional (sea, central land, arms), k+1 = region k."""
    wid = world["_id"]
    z = _zone_cache.get(wid)
    if z is None:
        n = int(world["size"])
        z = np.zeros((n, n), dtype=np.uint8)
        for r in world.get("regions") or []:
            z[r["y0"] : r["y0"] + r["size"], r["x0"] : r["x0"] + r["size"]] = r["index"] + 1
        _zone_cache[wid] = z
    return z


def is_grande_mondo(world: dict | None) -> bool:
    return bool(world) and world.get("kind") == KIND


def fog_up(world: dict | None) -> bool:
    """True while the fog wall separates the regions (ISOLATION). Classic realms never have a fog wall."""
    return is_grande_mondo(world) and ((world.get("gm") or {}).get("phase") or "ISOLATION") != "WAR"


def movement_mask(world: dict, origin_xy: tuple[int, int]) -> np.ndarray | None:
    """A* passability mask for a movement leaving `origin_xy`: the origin's zone only while the fog is up."""
    if not fog_up(world):
        return None
    z = zone_grid(world)
    k = int(z[int(origin_xy[1]), int(origin_xy[0])])
    return z == k


def check_target(world: dict, origin_xy: tuple[int, int], target_xy: tuple[int, int]) -> None:
    """Bibbia GM: no attack, reinforcement, exploration, caravan or conquest beyond the regional border before the fog
    falls — enforced server-side whatever the client sends."""
    if not fog_up(world):
        return
    z = zone_grid(world)
    zo = int(z[int(origin_xy[1]), int(origin_xy[0])])
    zt = int(z[int(target_xy[1]), int(target_xy[0])])
    if zo != zt or zt == 0:
        raise ApiError("FOG_WALL", "The fog wall blocks every movement outside your region until the War of the Regions", 409, {"phase": "ISOLATION", "phase_until": clock.iso((world.get("gm") or {}).get("phase_until"))})


def visible_zones(world: dict, settlements_xy: list[tuple[int, int]]) -> set[int] | None:
    """Zones a player may observe on the map: every zone he owns a settlement in while the fog is up; None = everything."""
    if not fog_up(world):
        return None
    z = zone_grid(world)
    return {int(z[y, x]) for x, y in settlements_xy} or set()


def chunk_visible(world: dict, zones: set[int] | None, cx: int, cy: int) -> bool:
    if zones is None:
        return True
    x0, y0, x1, y1 = cx * 32, cy * 32, cx * 32 + 31, cy * 32 + 31
    for r in world.get("regions") or []:
        if (r["index"] + 1) in zones and x0 <= r["x0"] + r["size"] - 1 and x1 >= r["x0"] and y0 <= r["y0"] + r["size"] - 1 and y1 >= r["y0"]:
            return True
    return False


# ------------------------------------------------------------------------------------------------ cycle
def _cfg(world: dict) -> dict:
    return {**DEFAULTS, **(world.get("gm_config") or {})}


def _key(world_id: str, to: str, cycle: int) -> str:
    return f"gm:{world_id}:{to.lower()}:{cycle}"


def initial_state(world_id: str, opened_at, cfg: dict) -> tuple[dict, str]:
    until = opened_at + timedelta(days=float(cfg["isolation_days"]))
    key = _key(world_id, "WAR", 1)
    return {"phase": "ISOLATION", "cycle": 1, "phase_since": opened_at, "phase_until": until, "deadline_key": key, "war_opened_at": None, "war_closed_at": None}, key


async def ensure_schedule(world: dict) -> None:
    gm = world.get("gm") or {}
    if not gm.get("deadline_key") or not gm.get("phase_until"):
        return
    to = "WAR" if gm["phase"] == "ISOLATION" else "ISOLATION"
    await scheduler.schedule(world["_id"], EVENT, clock.aware(gm["phase_until"]), world["_id"], gm["deadline_key"], {"to": to, "cycle": int(gm["cycle"])})


async def bootstrap() -> None:
    async for w in db().worlds.find({"kind": KIND, "status": "OPEN"}):
        await ensure_schedule(w)


async def transition(world: dict, to: str, reason: str = "DEADLINE") -> dict:
    """ISOLATION → WAR (fog falls, simultaneously for every region) or WAR → ISOLATION (fog returns, next cycle).
    Idempotent: conditional on the current phase."""
    if to not in PHASES:
        raise ApiError("INVALID_PHASE", "Unknown phase", 400)
    cfg = _cfg(world)
    gm = world.get("gm") or {}
    cur = gm.get("phase") or "ISOLATION"
    if cur == to:
        return world
    now = clock.now()
    cycle = int(gm.get("cycle", 1))
    if to == "WAR":
        until = now + timedelta(days=float(cfg["war_days"]))
        key = _key(world["_id"], "ISOLATION", cycle)
        sets = {"gm.phase": "WAR", "gm.phase_since": now, "gm.phase_until": until, "gm.deadline_key": key, "gm.war_opened_at": now, "gm.war_closed_at": None, "gm.war_reason": reason}
        payload = {"to": "ISOLATION", "cycle": cycle}
    else:
        cycle += 1
        until = now + timedelta(days=float(cfg["isolation_days"]))
        key = _key(world["_id"], "WAR", cycle)
        sets = {"gm.phase": "ISOLATION", "gm.cycle": cycle, "gm.phase_since": now, "gm.phase_until": until, "gm.deadline_key": key, "gm.war_closed_at": now, "gm.war_reason": reason}
        payload = {"to": "WAR", "cycle": cycle}
    res = await db().worlds.update_one({"_id": world["_id"], "gm.phase": cur}, {"$set": sets})
    if res.modified_count == 0:
        return await db().worlds.find_one({"_id": world["_id"]})
    if gm.get("deadline_key"):
        await scheduler.cancel(gm["deadline_key"])
    await scheduler.schedule(world["_id"], EVENT, until, world["_id"], key, payload)
    kind = "GM_FOG_FALLEN" if to == "WAR" else "GM_FOG_RETURNED"
    await progress.chronicle(world["_id"], kind, {"cycle": cycle, "until": clock.iso(until), "reason": reason}, [], ref=f"{kind}:{cycle}")
    # world-wide notice (Bibbia GM: "avviso mondiale") — one inbox entry per active player, idempotent per cycle
    async for p in db().players.find({"world_id": world["_id"], "status": {"$ne": "ELIMINATED"}}, {"_id": 1}):
        await notifications.notify(world["_id"], p["_id"], "GRANDE_MONDO_PHASE", {"phase": to, "cycle": cycle, "until": clock.iso(until), "reason": reason}, dedupe_key=f"gm_phase:{world['_id']}:{to}:{cycle}", deep_link="grande-mondo")
    return await db().worlds.find_one({"_id": world["_id"]})


@scheduler.handler(EVENT)
async def on_deadline(evt: dict) -> None:
    world = await db().worlds.find_one({"_id": evt["world_id"]})
    if not world or not is_grande_mondo(world):
        return
    if (world.get("gm") or {}).get("deadline_key") != evt.get("effect_key"):
        return  # stale deadline (QA forced transition / reschedule)
    await transition(world, evt["payload"]["to"])


# ------------------------------------------------------------------------------------------------ DTO
def region_dto(world: dict, r: dict) -> dict:
    slots = int(r.get("player_slots", DEFAULTS["max_players_per_region"]))
    count = int(r.get("player_count", 0))
    return {
        "index": r["index"],
        "code": r["code"],
        "name": r["name"],
        "lang": r["lang"],
        "x0": r["x0"],
        "y0": r["y0"],
        "size": r["size"],
        "center": [r["x0"] + r["size"] // 2, r["y0"] + r["size"] // 2],
        "pyramid_anchor": r.get("pyramid_anchor"),
        "player_slots": slots,
        "player_count": count,
        "free": max(0, slots - count),
        "full": count >= slots,
    }


def dto(world: dict, player: dict | None = None) -> dict | None:
    if not is_grande_mondo(world):
        return None
    gm = world.get("gm") or {}
    cfg = _cfg(world)
    now = clock.now()
    until = clock.aware(gm.get("phase_until")) if gm.get("phase_until") else None
    return {
        "phase": gm.get("phase") or "ISOLATION",
        "cycle": int(gm.get("cycle", 1)),
        "phase_since": clock.iso(gm.get("phase_since")),
        "phase_until": clock.iso(until),
        "seconds_left": max(0, int((until - now).total_seconds())) if until else None,
        "fog_up": fog_up(world),
        "isolation_days": cfg["isolation_days"],
        "war_days": cfg["war_days"],
        "pyramid_hold_hours": cfg["pyramid_hold_hours"],
        "regions": [region_dto(world, r) for r in world.get("regions") or []],
        "center": world.get("center"),
        "my_region": (player or {}).get("region_code"),
    }
