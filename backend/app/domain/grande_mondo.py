"""Grande Mondo (Bibbia del Grande Mondo v0.2) — one mega-realm, N regions, fog wall, War of the Regions.

Geometry ("Spicchi"): the realm is a disc. The neutral central disc (radius r_in) carries the Grande Piramide; N
annular sectors of 360/N degrees fan out from it, each a complete region (mainland touching the centre, three islands
on the outer rim, 100 slots + 800 neutrals, regional Pyramid). Sectors are separated by narrow sea channels; the only
land link between regions is the centre, so every War of the Regions converges on the Grande Piramide.

Fog wall = server rule. Zones (uint8 per tile): 0 = central disc, k = region k (sector k-1, channel included).
  ISOLATION: a movement may only use its origin's zone.
  WAR: the regions admitted to the current war (`gm.war.regions`, None = all) may use each other's zones and the centre;
       regions left out stay isolated. Interregional marches travel at `gm.war.speed_multiplier` × speed.
Both settings are decided cycle by cycle by the realm administrator (`gm.next_war`, copied into `gm.war` when the fog
falls; editable live during a war).

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
SPEED_MULTIPLIERS = (1, 2, 3, 5)

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

# Bibbia GM "Parametri iniziali" + owner decisions (9 regions, Regno-2 spacing 16/20 and 7/9, War 30 days)
DEFAULTS = {
    "regions": 9,
    "max_players_per_region": 100,
    "isolation_days": 120,
    "war_days": 30,
    "pyramid_hold_hours": 168,
    "r_in": 130,  # central disc (Grande Piramide) radius
    "r_land": 880,  # outer coast of every regional mainland
    "r_out": 1030,  # outer limit of the island band
    "channel_half": 12,  # sea channel between two sectors = 24 tiles
    "margin": 48,  # sea beyond the outer rim
    "region_gen": {"hard_min_player_distance": 16, "preferred_player_distance": 20, "neutral_min_distance": 7, "neutral_preferred_distance": 9},
}


# ------------------------------------------------------------------------------------------------ geometry
def layout(n: int, r_out: int, margin: int) -> dict:
    world = int(math.ceil(2 * (r_out + margin) / 32.0)) * 32
    cx = cy = world // 2
    return {"world_size": world, "center": [cx, cy], "half_deg": 180.0 / n, "mids_deg": [-90.0 + 360.0 * k / n for k in range(n)]}


def region_record(index: int, cat: dict, world: dict) -> dict:
    """Region document stored in the world (angles in degrees, screen space y-down)."""
    n = len(world["regions"]) if world.get("regions") else int(world["gm_config"]["regions"])
    cfg = world["gm_config"]
    cx, cy = world["center"]["x"], world["center"]["y"]
    half = 180.0 / n
    mid = -90.0 + 360.0 * index / n
    r_in, r_land, r_out = int(cfg["r_in"]), int(cfg["r_land"]), int(cfg["r_out"])
    pts = [(cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))) for r in (r_in, r_out) for a in np.linspace(mid - half, mid + half, 41)]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    rm = (r_in + r_land) / 2.0
    center = [int(round(cx + rm * math.cos(math.radians(mid)))), int(round(cy + rm * math.sin(math.radians(mid))))]
    return {
        "index": index,
        "code": cat["code"],
        "name": cat["name"],
        "lang": cat["lang"],
        "mid_deg": mid,
        "half_deg": half,
        "r_in": r_in,
        "r_land": r_land,
        "r_out": r_out,
        "bbox": [int(math.floor(min(xs))), int(math.floor(min(ys))), int(math.ceil(max(xs))), int(math.ceil(max(ys)))],
        "center": center,
        "pyramid_anchor": center,
        "player_slots": int(cfg["max_players_per_region"]),
        "player_count": 0,
    }


def sector_index(world: dict, x: float, y: float) -> int | None:
    """Sector index of a tile (None inside the central disc)."""
    c = world["center"]
    r = math.hypot(x - c["x"], y - c["y"])
    if r < int(world["gm_config"]["r_in"]):
        return None
    n = len(world["regions"])
    ang = math.degrees(math.atan2(y - c["y"], x - c["x"]))
    k = int(math.floor(((ang + 90.0 + 180.0 / n) % 360.0) / (360.0 / n)))
    return k % n


def region_at(world: dict, x: int, y: int) -> dict | None:
    k = sector_index(world, x, y)
    return world["regions"][k] if k is not None else None


def region_by_code(world: dict, code: str | None) -> dict | None:
    for r in world.get("regions") or []:
        if r["code"] == code:
            return r
    return None


_zone_cache: dict[str, np.ndarray] = {}


def zone_grid(world: dict) -> np.ndarray:
    """uint8 [y, x]: 0 = central disc, k+1 = region k (its whole sector, channel water included)."""
    wid = world["_id"]
    z = _zone_cache.get(wid)
    if z is None:
        n = int(world["size"])
        c = world["center"]
        nreg = len(world["regions"])
        yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
        r = np.sqrt((xx - c["x"]) ** 2 + (yy - c["y"]) ** 2)
        ang = np.degrees(np.arctan2(yy - c["y"], xx - c["x"]))
        k = np.floor(((ang + 90.0 + 180.0 / nreg) % 360.0) / (360.0 / nreg)).astype(np.int32) % nreg
        z = (k + 1).astype(np.uint8)
        z[r < int(world["gm_config"]["r_in"])] = 0
        _zone_cache[wid] = z
    return z


def is_grande_mondo(world: dict | None) -> bool:
    return bool(world) and world.get("kind") == KIND


def phase(world: dict) -> str:
    return (world.get("gm") or {}).get("phase") or "ISOLATION"


def fog_up(world: dict | None) -> bool:
    """True while the fog wall separates the regions (ISOLATION). Classic realms never have a fog wall."""
    return is_grande_mondo(world) and phase(world) != "WAR"


def war_zones(world: dict) -> set[int] | None:
    """Zones admitted to the current war (+ the centre); None = every zone (all regions at war)."""
    war = (world.get("gm") or {}).get("war") or {}
    codes = war.get("regions")
    if not codes:
        return None
    zones = {r["index"] + 1 for r in world.get("regions") or [] if r["code"] in codes}
    zones.add(0)
    return zones


def allowed_zones(world: dict, origin_zone: int) -> set[int] | None:
    """Zones a movement leaving `origin_zone` may use. None = unrestricted."""
    if not is_grande_mondo(world):
        return None
    if phase(world) != "WAR":
        return {origin_zone}
    wz = war_zones(world)
    if wz is None:
        return None
    return wz if origin_zone in wz else {origin_zone}


def movement_mask(world: dict, origin_xy: tuple[int, int]) -> np.ndarray | None:
    """A* passability mask for a movement leaving `origin_xy` (fog wall / war participants)."""
    if not is_grande_mondo(world):
        return None
    z = zone_grid(world)
    allowed = allowed_zones(world, int(z[int(origin_xy[1]), int(origin_xy[0])]))
    if allowed is None:
        return None
    return np.isin(z, list(allowed))


def check_target(world: dict, origin_xy: tuple[int, int], target_xy: tuple[int, int]) -> None:
    """Bibbia GM: no attack, reinforcement, exploration, caravan or conquest beyond the regional border before the fog
    falls (or towards a region that is not part of the current war) — enforced server-side whatever the client sends."""
    if not is_grande_mondo(world):
        return
    z = zone_grid(world)
    zo = int(z[int(origin_xy[1]), int(origin_xy[0])])
    zt = int(z[int(target_xy[1]), int(target_xy[0])])
    allowed = allowed_zones(world, zo)
    if allowed is not None and zt not in allowed:
        raise ApiError("FOG_WALL", "The fog wall blocks every movement outside your region until the War of the Regions", 409, {"phase": phase(world), "phase_until": clock.iso((world.get("gm") or {}).get("phase_until"))})


def speed_multiplier(world: dict, origin_xy: tuple[int, int], path: list[tuple[int, int]]) -> float:
    """War of the Regions: a march that leaves its region travels at the multiplier decided for this war."""
    if not is_grande_mondo(world) or phase(world) != "WAR":
        return 1.0
    mult = float(((world.get("gm") or {}).get("war") or {}).get("speed_multiplier") or 1)
    if mult <= 1.0 or not path:
        return 1.0
    z = zone_grid(world)
    zo = int(z[int(origin_xy[1]), int(origin_xy[0])])
    step = max(1, len(path) // 200)
    crosses = any(int(z[y, x]) != zo for x, y in path[::step]) or int(z[path[-1][1], path[-1][0]]) != zo
    return mult if crosses else 1.0


def visible_zones(world: dict, settlements_xy: list[tuple[int, int]]) -> set[int] | None:
    """Zones a player may observe on the map (union of what each of his settlements may reach); None = everything."""
    if not is_grande_mondo(world):
        return None
    z = zone_grid(world)
    out: set[int] = set()
    for x, y in settlements_xy:
        a = allowed_zones(world, int(z[y, x]))
        if a is None:
            return None
        out |= a
    return out


def chunk_visible(world: dict, zones: set[int] | None, cx: int, cy: int) -> bool:
    if zones is None:
        return True
    z = zone_grid(world)
    sl = z[cy * 32 : cy * 32 + 32, cx * 32 : cx * 32 + 32]
    return bool(np.isin(sl, list(zones)).any())


# ------------------------------------------------------------------------------------------------ cycle
def _cfg(world: dict) -> dict:
    return {**DEFAULTS, **(world.get("gm_config") or {})}


def _key(world_id: str, to: str, cycle: int) -> str:
    return f"gm:{world_id}:{to.lower()}:{cycle}"


def default_war_config() -> dict:
    return {"regions": None, "speed_multiplier": 1}


def initial_state(world_id: str, opened_at, cfg: dict) -> tuple[dict, str]:
    until = opened_at + timedelta(days=float(cfg["isolation_days"]))
    key = _key(world_id, "WAR", 1)
    return {"phase": "ISOLATION", "cycle": 1, "phase_since": opened_at, "phase_until": until, "deadline_key": key, "war_opened_at": None, "war_closed_at": None, "next_war": default_war_config(), "war": None}, key


def normalize_war_config(world: dict, regions: list[str] | None, speed_multiplier: float | int | None) -> dict:
    codes = [r["code"] for r in world.get("regions") or []]
    if regions is not None:
        regions = sorted({c for c in regions if c in codes})
        if len(regions) < 2:
            raise ApiError("WAR_CONFIG_INVALID", "A War of the Regions needs at least two regions (or all)", 400)
        if len(regions) == len(codes):
            regions = None
    mult = float(speed_multiplier or 1)
    if mult not in SPEED_MULTIPLIERS:
        raise ApiError("WAR_CONFIG_INVALID", f"speed_multiplier must be one of {list(SPEED_MULTIPLIERS)}", 400)
    return {"regions": regions, "speed_multiplier": int(mult)}


async def set_war_config(world: dict, regions: list[str] | None, speed_multiplier: float | int | None, by_player_id: str | None) -> dict:
    """Administrator decision for the next war (applied live too when a war is running)."""
    cfg = normalize_war_config(world, regions, speed_multiplier)
    sets = {"gm.next_war": cfg, "gm.next_war_set_by": by_player_id, "gm.next_war_set_at": clock.now()}
    if phase(world) == "WAR":
        sets["gm.war"] = {**((world.get("gm") or {}).get("war") or {}), **cfg}
    await db().worlds.update_one({"_id": world["_id"]}, {"$set": sets})
    return await db().worlds.find_one({"_id": world["_id"]})


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
    """ISOLATION → WAR (fog falls for the admitted regions, simultaneously) or WAR → ISOLATION (fog returns, next
    cycle). Idempotent: conditional on the current phase."""
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
        war = {**default_war_config(), **(gm.get("next_war") or {}), "opened_at": now}
        sets = {"gm.phase": "WAR", "gm.phase_since": now, "gm.phase_until": until, "gm.deadline_key": key, "gm.war_opened_at": now, "gm.war_closed_at": None, "gm.war_reason": reason, "gm.war": war}
        payload = {"to": "ISOLATION", "cycle": cycle}
    else:
        cycle += 1
        until = now + timedelta(days=float(cfg["isolation_days"]))
        key = _key(world["_id"], "WAR", cycle)
        sets = {"gm.phase": "ISOLATION", "gm.cycle": cycle, "gm.phase_since": now, "gm.phase_until": until, "gm.deadline_key": key, "gm.war_closed_at": now, "gm.war_reason": reason, "gm.war": None}
        payload = {"to": "WAR", "cycle": cycle}
    res = await db().worlds.update_one({"_id": world["_id"], "gm.phase": cur}, {"$set": sets})
    if res.modified_count == 0:
        return await db().worlds.find_one({"_id": world["_id"]})
    if gm.get("deadline_key"):
        await scheduler.cancel(gm["deadline_key"])
    await scheduler.schedule(world["_id"], EVENT, until, world["_id"], key, payload)
    fresh = await db().worlds.find_one({"_id": world["_id"]})
    if to == "ISOLATION":
        from app.domain import pyramid  # local: pyramid imports this module

        await pyramid.close_grand(fresh, reason)
    war = (fresh.get("gm") or {}).get("war") or {}
    kind = "GM_FOG_FALLEN" if to == "WAR" else "GM_FOG_RETURNED"
    await progress.chronicle(world["_id"], kind, {"cycle": cycle, "until": clock.iso(until), "reason": reason, "regions": war.get("regions"), "speed_multiplier": war.get("speed_multiplier")}, [], ref=f"{kind}:{cycle}")
    # world-wide notice (Bibbia GM: "avviso mondiale") — one inbox entry per active player, idempotent per cycle
    async for p in db().players.find({"world_id": world["_id"], "status": {"$ne": "ELIMINATED"}}, {"_id": 1}):
        await notifications.notify(world["_id"], p["_id"], "GRANDE_MONDO_PHASE", {"phase": to, "cycle": cycle, "until": clock.iso(until), "reason": reason, "regions": war.get("regions"), "speed_multiplier": war.get("speed_multiplier")}, dedupe_key=f"gm_phase:{world['_id']}:{to}:{cycle}:{p['_id']}", deep_link="grande-mondo")
    return fresh


@scheduler.handler(EVENT)
async def on_deadline(evt: dict) -> None:
    world = await db().worlds.find_one({"_id": evt["world_id"]})
    if not world or not is_grande_mondo(world):
        return
    if (world.get("gm") or {}).get("deadline_key") != evt.get("effect_key"):
        return  # stale deadline (forced transition / reschedule)
    await transition(world, evt["payload"]["to"])


# ------------------------------------------------------------------------------------------------ DTO
def region_dto(world: dict, r: dict) -> dict:
    slots = int(r.get("player_slots", DEFAULTS["max_players_per_region"]))
    count = int(r.get("player_count", 0))
    war = (world.get("gm") or {}).get("war") or {}
    codes = war.get("regions")
    return {
        "index": r["index"],
        "code": r["code"],
        "name": r["name"],
        "lang": r["lang"],
        "mid_deg": r["mid_deg"],
        "half_deg": r["half_deg"],
        "r_in": r["r_in"],
        "r_land": r["r_land"],
        "r_out": r["r_out"],
        "bbox": r["bbox"],
        "center": r["center"],
        "pyramid_anchor": r.get("pyramid_anchor"),
        "player_slots": slots,
        "player_count": count,
        "free": max(0, slots - count),
        "full": count >= slots,
        "at_war": phase(world) == "WAR" and (codes is None or r["code"] in codes),
    }


def dto(world: dict, player: dict | None = None) -> dict | None:
    if not is_grande_mondo(world):
        return None
    gm = world.get("gm") or {}
    cfg = _cfg(world)
    now = clock.now()
    until = clock.aware(gm.get("phase_until")) if gm.get("phase_until") else None
    my_zone = None
    if player and player.get("region_code"):
        reg = region_by_code(world, player["region_code"])
        my_zone = reg["index"] + 1 if reg else None
    return {
        "phase": phase(world),
        "cycle": int(gm.get("cycle", 1)),
        "phase_since": clock.iso(gm.get("phase_since")),
        "phase_until": clock.iso(until),
        "seconds_left": max(0, int((until - now).total_seconds())) if until else None,
        "fog_up": fog_up(world),
        # this player's own region is isolated even during a war it is not part of
        "my_fog_up": (allowed_zones(world, my_zone) == {my_zone}) if my_zone is not None else fog_up(world),
        "isolation_days": cfg["isolation_days"],
        "war_days": cfg["war_days"],
        "pyramid_hold_hours": cfg["pyramid_hold_hours"],
        "regions": [region_dto(world, r) for r in world.get("regions") or []],
        "center": {**world.get("center", {}), "radius": int(cfg["r_in"])} if world.get("center") else None,
        "war": gm.get("war"),
        "next_war": gm.get("next_war") or default_war_config(),
        "speed_multipliers": list(SPEED_MULTIPLIERS),
        "my_region": (player or {}).get("region_code"),
        "view_all": bool((player or {}).get("view_all_regions")),
        "is_admin": bool((player or {}).get("gm_admin")),
    }
