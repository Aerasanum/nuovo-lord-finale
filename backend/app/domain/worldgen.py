"""generator_v3_landmass_first — deterministic 400x400 world generation (Bible §2, spec.generator/spawn/regions).

Landmass first (mainland + 3 large islands with >=12 water separation), then biome classification
(mountain chains as perturbed polylines + massif halo, forest region-growing clusters, plain residual),
pyramid plateau reserved in the landmask, then anchor placement per regional terrain quotas.
Every constraint failure rejects the seed (REJECT_SEED_NO_POSTHOC_TERRAIN_PATCH); max 50 attempts.
"""
from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass, field

import numpy as np

from app.core.spec import Spec, get_spec

BASE_N = 400  # reference size the generator geometry was tuned on; other sizes scale the landmass layout by size/BASE_N
N = BASE_N  # default world size (spec.world.map_size_x)
PLAIN, FOREST, MOUNTAIN, WATER = 0, 1, 2, 3
TERRAIN_NAMES = ["plain", "forest", "mountain", "water"]
SEA_MIN_TILES = 1500  # a navigable sea at 400x400; smaller water bodies are lakes (not coast, no ports) — scales with area


class MapGenerationError(Exception):
    pass


LAST_REJECT: list[str] = []


def _reject(reason: str):
    LAST_REJECT.append(reason)
    return None


@dataclass(frozen=True)
class GenConfig:
    """Per-world generation parameters. Defaults come from the spec (Bible); a world may override size and spacing
    (bigger realm, more room between castles) — counts (player slots, neutrals), timers and costs never change."""

    size: int = BASE_N
    hard_min_player_distance: int = 8
    preferred_player_distance: int = 10
    neutral_min_distance: int = 4
    neutral_preferred_distance: int = 4
    pyramid_anchor: tuple[int, int] = (200, 200)

    @staticmethod
    def from_spec(spec: Spec, overrides: dict | None = None) -> GenConfig:
        sp = spec.spawn
        o = overrides or {}
        size = int(o.get("size", spec.world["map_size_x"]))
        default_anchor = tuple(int(v) for v in spec.world["pyramid_anchor"]) if size == int(spec.world["map_size_x"]) else (size // 2, size // 2)
        nmin = int(o.get("neutral_min_distance", sp["neutral_min_distance"]))
        return GenConfig(
            size=size,
            hard_min_player_distance=int(o.get("hard_min_player_distance", sp["hard_min_player_distance"])),
            preferred_player_distance=int(o.get("preferred_player_distance", sp["preferred_player_distance"])),
            neutral_min_distance=nmin,
            neutral_preferred_distance=int(o.get("neutral_preferred_distance", nmin)),
            pyramid_anchor=tuple(int(v) for v in o.get("pyramid_anchor", default_anchor)),  # type: ignore[arg-type]
        )

    def to_doc(self) -> dict:
        return {
            "size": self.size,
            "hard_min_player_distance": self.hard_min_player_distance,
            "preferred_player_distance": self.preferred_player_distance,
            "neutral_min_distance": self.neutral_min_distance,
            "neutral_preferred_distance": self.neutral_preferred_distance,
            "pyramid_anchor": list(self.pyramid_anchor),
        }


@dataclass
class Anchor:
    kind: str  # PLAYER_SLOT | NEUTRAL
    x: int
    y: int
    terrain: str
    region: str
    port_eligible: bool
    level: int = 1


@dataclass
class WorldGen:
    seed: int
    terrain: np.ndarray  # uint8 [y, x]
    region: np.ndarray  # uint8 [y, x], 255 = water
    anchors: list[Anchor]
    stats: dict = field(default_factory=dict)


# ----------------------------------------------------------------------------- noise
def _value_noise(shape: tuple[int, int], freq: int, rng: np.random.Generator) -> np.ndarray:
    gh, gw = freq + 1, freq + 1
    grid = rng.random((gh, gw))
    ys = np.linspace(0, freq, shape[0], endpoint=False)
    xs = np.linspace(0, freq, shape[1], endpoint=False)
    y0 = np.floor(ys).astype(int)
    x0 = np.floor(xs).astype(int)
    fy = ys - y0
    fx = xs - x0
    fy = fy * fy * (3 - 2 * fy)
    fx = fx * fx * (3 - 2 * fx)
    y1 = np.minimum(y0 + 1, gh - 1)
    x1 = np.minimum(x0 + 1, gw - 1)
    a = grid[np.ix_(y0, x0)]
    b = grid[np.ix_(y0, x1)]
    c = grid[np.ix_(y1, x0)]
    d = grid[np.ix_(y1, x1)]
    top = a + (b - a) * fx[None, :]
    bot = c + (d - c) * fx[None, :]
    return top + (bot - top) * fy[:, None]


def fbm(shape: tuple[int, int], rng: np.random.Generator, octaves: int = 5, base_freq: int = 4, persistence: float = 0.5) -> np.ndarray:
    total = np.zeros(shape)
    amp, freq, norm = 1.0, base_freq, 0.0
    for _ in range(octaves):
        total += amp * _value_noise(shape, freq, rng)
        norm += amp
        amp *= persistence
        freq *= 2
    return total / norm


# ----------------------------------------------------------------------------- morphology / labeling
def dilate_chebyshev(mask: np.ndarray, r: int) -> np.ndarray:
    out = mask.copy()
    for _ in range(r):
        p = np.pad(out, 1, constant_values=False)
        acc = out.copy()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0:
                    continue
                acc |= p[1 + dy : 1 + dy + out.shape[0], 1 + dx : 1 + dx + out.shape[1]]
        out = acc
    return out


def label_components(mask: np.ndarray) -> tuple[np.ndarray, list[int]]:
    """4-connected component labeling. Returns labels (-1 for false) and sizes list."""
    labels = np.full(mask.shape, -1, dtype=np.int32)
    sizes: list[int] = []
    H, W = mask.shape
    flat = mask.ravel()
    lab = labels.ravel()
    for start in np.flatnonzero(flat):
        if lab[start] != -1:
            continue
        cid = len(sizes)
        lab[start] = cid
        q = deque([start])
        cnt = 0
        while q:
            i = q.popleft()
            cnt += 1
            y, x = divmod(int(i), W)
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < H and 0 <= nx < W:
                    j = ny * W + nx
                    if flat[j] and lab[j] == -1:
                        lab[j] = cid
                        q.append(j)
        sizes.append(cnt)
    return labels, sizes


def _ellipse_field(n: int, cx: float, cy: float, rx: float, ry: float) -> np.ndarray:
    yy, xx = np.mgrid[0:n, 0:n]
    return ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2


def _threshold_top_k(field: np.ndarray, allowed: np.ndarray, k: int) -> np.ndarray:
    vals = field[allowed]
    if len(vals) < k:
        return allowed.copy()
    t = np.sort(vals)[-k]
    return allowed & (field >= t)


def _segment_mask(n: int, x1: float, y1: float, x2: float, y2: float, half_w: np.ndarray | float) -> np.ndarray:
    yy, xx = np.mgrid[0:n, 0:n]
    dx, dy = x2 - x1, y2 - y1
    seg_len2 = dx * dx + dy * dy
    if seg_len2 == 0:
        t = np.zeros((n, n))
    else:
        t = np.clip(((xx - x1) * dx + (yy - y1) * dy) / seg_len2, 0, 1)
    px, py = x1 + t * dx, y1 + t * dy
    dist = np.sqrt((xx - px) ** 2 + (yy - py) ** 2)
    return dist <= half_w


# ----------------------------------------------------------------------------- generation
def _try_generate(seed: int, spec: Spec, cfg: GenConfig) -> WorldGen | None:
    rng = np.random.default_rng(seed)
    gen = spec.generator
    terr = spec.terrain
    N = cfg.size  # noqa: N806 — local world size shadows the module default on purpose
    S = N / BASE_N  # linear scale of the landmass layout; areas scale by S²
    A = S * S
    px0, py0 = cfg.pyramid_anchor
    total_tiles = N * N
    land_target = int(total_tiles * (1 - terr["water"]["target_pct"] / 100.0))  # 128000 at 400x400
    isl_lo, isl_hi = int(gen["island_land_tiles_range"][0] * A), int(gen["island_land_tiles_range"][1] * A)
    rng.integers(isl_lo + int(500 * A), isl_hi - int(500 * A))  # keeps the RNG sequence of the original generator (seed reproducibility)
    island_sep = int(gen["island_min_water_separation_tiles"])

    # ---- islands first (three separate masks, each 8000-12000 land tiles at 400x400) ----
    island_specs = [
        ((200.0 + rng.uniform(-40, 40)) * S, (30.0 + rng.uniform(-4, 4)) * S, 125.0 * S, 30.0 * S),  # north
        ((52.0 + rng.uniform(-6, 6)) * S, (345.0 + rng.uniform(-10, 10)) * S, 50.0 * S, 72.0 * S),  # south-west
        ((348.0 + rng.uniform(-6, 6)) * S, (345.0 + rng.uniform(-10, 10)) * S, 50.0 * S, 72.0 * S),  # south-east
    ]
    islands: list[np.ndarray] = []
    for cx, cy, rx, ry in island_specs:
        island_target = int(rng.integers(isl_lo + int(500 * A), isl_hi - int(500 * A)))
        noise = fbm((N, N), rng, octaves=4, base_freq=8)
        fld = 1.0 - _ellipse_field(N, cx, cy, rx, ry) + 0.45 * (noise - 0.5)
        window = _ellipse_field(N, cx, cy, rx * 1.35, ry * 1.35) <= 1.0
        mask = _threshold_top_k(fld, window, island_target)
        labels, sizes = label_components(mask)
        if not sizes:
            return _reject("L174: if not sizes:")
        main = int(np.argmax(sizes))
        mask = labels == main
        cnt = int(mask.sum())
        if not (isl_lo <= cnt <= isl_hi):
            return _reject("L179: if not (gen['island_land_tiles_range'][0] <= cnt <= gen['island_land_t")
        islands.append(mask)
    islands_all = islands[0] | islands[1] | islands[2]
    # islands must be separated from each other
    for i in range(3):
        for j in range(i + 1, 3):
            if (dilate_chebyshev(islands[i], island_sep) & islands[j]).any():
                return _reject("L186: if (dilate_chebyshev(islands[i], island_sep) & islands[j]).any():")
    forbidden = dilate_chebyshev(islands_all, island_sep)

    # ---- mainland: union of 6-9 perturbed ellipses, must contain the pyramid anchor ----
    k = int(rng.integers(gen["mainland_mountain_chains_range"][0] + 3, 10))  # 6..9 ellipses
    fields = [_ellipse_field(N, 200 * S, 212 * S, 190 * S, 150 * S)]
    for _ in range(k - 1):
        cx = (200 + rng.uniform(-110, 110)) * S
        cy = (212 + rng.uniform(-90, 90)) * S
        fields.append(_ellipse_field(N, cx, cy, rng.uniform(45, 95) * S, rng.uniform(40, 85) * S))
    d = np.min(np.stack(fields), axis=0)
    noise = fbm((N, N), rng, octaves=5, base_freq=5)
    land_field = 1.0 - d + 0.55 * (noise - 0.5)
    plateau = np.zeros((N, N), dtype=bool)
    plateau[py0 - 12 : py0 + 13, px0 - 12 : px0 + 13] = True  # pyramid platform reserved in the landmask
    land_field[plateau] = 10.0
    allowed = ~forbidden
    mainland_target = land_target - int(islands_all.sum())
    mainland = _threshold_top_k(land_field, allowed, mainland_target)
    labels, sizes = label_components(mainland)
    if not sizes or labels[py0, px0] == -1:
        return _reject("L207: if not sizes or labels[200, 200] == -1:")
    main_id = int(labels[py0, px0])
    mainland = labels == main_id
    # refine threshold so that the main component reaches the target (max 6 passes)
    for _ in range(6):
        cnt = int(mainland.sum())
        if abs(cnt - mainland_target) <= 600 * A:
            break
        mainland_target_adj = mainland_target + (mainland_target - cnt)
        cand = _threshold_top_k(land_field, allowed, max(1000, mainland_target_adj))
        labels, sizes = label_components(cand)
        if labels[py0, px0] == -1:
            return _reject("L219: if labels[200, 200] == -1:")
        mainland = labels == int(labels[py0, px0])
        mainland_target = mainland_target_adj
    land = mainland | islands_all
    water_pct = 100.0 * (total_tiles - int(land.sum())) / total_tiles
    if not (terr["water"]["range_pct"][0] <= water_pct <= terr["water"]["range_pct"][1]):
        return _reject("L225: if not (terr['water']['range_pct'][0] <= water_pct <= terr['water']['r")

    # region labels: 0 mainland, 1..3 islands, 255 water
    region = np.full((N, N), 255, dtype=np.uint8)
    region[mainland] = 0
    for i, isl in enumerate(islands):
        region[isl] = i + 1

    terrain = np.full((N, N), WATER, dtype=np.uint8)
    terrain[land] = PLAIN

    # ---- mountains: chains (polylines, width 3-7) + massif halo, islands >= 1 ridge each ----
    mountain_target = int(total_tiles * terr["mountain"]["target_pct"] / 100.0)
    chain_mask = np.zeros((N, N), dtype=bool)
    wmin, wmax = gen["mountain_width_tiles_range"]
    n_chains = int(rng.integers(gen["mainland_mountain_chains_range"][0], gen["mainland_mountain_chains_range"][1] + 1))
    ml_pts = np.argwhere(mainland & ~dilate_chebyshev(plateau, 6))
    for _ in range(n_chains):
        y, x = ml_pts[rng.integers(len(ml_pts))]
        heading = rng.uniform(0, 2 * math.pi)
        for _seg in range(int(rng.integers(6, 11))):
            seg_len = rng.uniform(28, 48) * S
            heading += rng.uniform(-0.6, 0.6)
            nx, ny = x + math.cos(heading) * seg_len, y + math.sin(heading) * seg_len
            half_w = rng.uniform(wmin, wmax) / 2.0
            chain_mask |= _segment_mask(N, x, y, nx, ny, half_w)
            x, y = nx, ny
    for isl in islands:
        pts = np.argwhere(isl)
        y, x = pts[rng.integers(len(pts))]
        heading = rng.uniform(0, 2 * math.pi)
        for _seg in range(int(rng.integers(3, 6))):
            seg_len = rng.uniform(14, 26) * S
            heading += rng.uniform(-0.5, 0.5)
            nx, ny = x + math.cos(heading) * seg_len, y + math.sin(heading) * seg_len
            half_w = rng.uniform(wmin, wmax) / 2.0
            chain_mask |= _segment_mask(N, x, y, nx, ny, half_w)
            x, y = nx, ny
    chain_mask &= land & ~plateau
    mnoise = fbm((N, N), rng, octaves=4, base_freq=10)
    halo = dilate_chebyshev(chain_mask, max(9, round(9 * S))) & land & ~plateau & ~chain_mask
    need = mountain_target - int(chain_mask.sum())
    mountain = chain_mask.copy()
    if need > 0:
        # deterministic threshold variation: pick the `need` highest-noise halo tiles (massifs hug the chains)
        halo_field = mnoise - 0.02 * np.where(halo, 0, 1)
        mountain |= _threshold_top_k(halo_field, halo, need)
    # islands must keep at least one ridge
    for isl in islands:
        if int((mountain & isl).sum()) < int(gen["island_min_mountain_ridges_each"]) * 20:
            return _reject("L275: if int((mountain & isl).sum()) < int(gen['island_min_mountain_ridges_e")
    terrain[mountain] = MOUNTAIN
    mountain_pct = 100.0 * int(mountain.sum()) / total_tiles
    if not (terr["mountain"]["range_pct"][0] <= mountain_pct <= terr["mountain"]["range_pct"][1]):
        return _reject("L279: if not (terr['mountain']['range_pct'][0] <= mountain_pct <= terr['moun")

    # ---- forests: 20-30 seeds, best-first region growing on FBM ----
    forest_target = int(total_tiles * terr["forest"]["target_pct"] / 100.0)
    n_seeds = int(round(int(rng.integers(gen["forest_cluster_seed_range"][0], gen["forest_cluster_seed_range"][1] + 1)) * A))
    fnoise = fbm((N, N), rng, octaves=4, base_freq=12)
    growable = (terrain == PLAIN) & ~plateau
    weights = rng.uniform(0.5, 1.5, size=n_seeds)
    sizes_f = (weights / weights.sum() * forest_target).astype(int)
    grow_pts = np.argwhere(growable)
    forest = np.zeros((N, N), dtype=bool)
    import heapq

    for si in range(n_seeds):
        y0, x0 = grow_pts[rng.integers(len(grow_pts))]
        if forest[y0, x0]:
            continue
        target = int(sizes_f[si])
        heap = [(-fnoise[y0, x0], int(y0), int(x0))]
        seen = {(int(y0), int(x0))}
        grown = 0
        while heap and grown < target:
            _, y, x = heapq.heappop(heap)
            if forest[y, x] or not growable[y, x]:
                continue
            forest[y, x] = True
            grown += 1
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < N and 0 <= nx < N and (ny, nx) not in seen and growable[ny, nx] and not forest[ny, nx]:
                    seen.add((ny, nx))
                    heapq.heappush(heap, (-fnoise[ny, nx], ny, nx))
    deficit = forest_target - int(forest.sum())
    if deficit > 0:
        # clusters blocked by mountains/water: expand existing clusters from their boundary (count unchanged)
        heap = []
        seen = set()
        fy, fx = np.nonzero(forest)
        for y, x in zip(fy.tolist(), fx.tolist()):
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < N and 0 <= nx < N and growable[ny, nx] and not forest[ny, nx] and (ny, nx) not in seen:
                    seen.add((ny, nx))
                    heapq.heappush(heap, (-fnoise[ny, nx], ny, nx))
        while heap and deficit > 0:
            _, y, x = heapq.heappop(heap)
            if forest[y, x]:
                continue
            forest[y, x] = True
            deficit -= 1
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < N and 0 <= nx < N and growable[ny, nx] and not forest[ny, nx] and (ny, nx) not in seen:
                    seen.add((ny, nx))
                    heapq.heappush(heap, (-fnoise[ny, nx], ny, nx))
    terrain[forest] = FOREST
    forest_pct = 100.0 * int(forest.sum()) / total_tiles
    if not (terr["forest"]["range_pct"][0] <= forest_pct <= terr["forest"]["range_pct"][1]):
        return _reject("L313: if not (terr['forest']['range_pct'][0] <= forest_pct <= terr['forest']")
    plain_pct = 100.0 * int((terrain == PLAIN).sum()) / total_tiles
    if not (terr["plain"]["range_pct"][0] <= plain_pct <= terr["plain"]["range_pct"][1]):
        return _reject("L316: if not (terr['plain']['range_pct'][0] <= plain_pct <= terr['plain']['r")

    # ---- anchors ----
    anchors = _place_anchors(rng, spec, cfg, terrain, region)
    if anchors is None:
        return _reject("L321: if anchors is None:")

    stats = {
        "plain_pct": round(plain_pct, 2),
        "forest_pct": round(forest_pct, 2),
        "mountain_pct": round(mountain_pct, 2),
        "water_pct": round(water_pct, 2),
        "island_sizes": [int(i.sum()) for i in islands],
        "mainland_size": int(mainland.sum()),
        "mountain_chains": n_chains,
        "forest_seeds": n_seeds,
    }
    return WorldGen(seed=seed, terrain=terrain, region=region, anchors=anchors, stats=stats)


def _port_eligible_mask(terrain: np.ndarray) -> np.ndarray:
    """Plain/forest tiles with a cardinal neighbour on a sea (water body >= SEA_MIN_TILES scaled by area; ponds/lakes
    are not coast)."""
    n = terrain.shape[0]
    sea_min = int(SEA_MIN_TILES * (n / BASE_N) ** 2)
    labels, sizes = label_components(terrain == WATER)
    sea_ids = {i for i, sz in enumerate(sizes) if sz >= sea_min}
    water = np.isin(labels, list(sea_ids)) if sea_ids else terrain == WATER
    adj = np.zeros(terrain.shape, dtype=bool)
    adj[1:, :] |= water[:-1, :]
    adj[:-1, :] |= water[1:, :]
    adj[:, 1:] |= water[:, :-1]
    adj[:, :-1] |= water[:, 1:]
    return ((terrain == PLAIN) | (terrain == FOREST)) & adj


def _place_anchors(rng: np.random.Generator, spec: Spec, cfg: GenConfig, terrain: np.ndarray, region: np.ndarray) -> list[Anchor] | None:
    sp = spec.spawn
    hard_min = cfg.hard_min_player_distance
    pref = cfg.preferred_player_distance
    nmin = cfg.neutral_min_distance
    npref = max(nmin, cfg.neutral_preferred_distance)
    pyr_excl = int(sp["pyramid_exclusion_chebyshev"])
    px, py = cfg.pyramid_anchor
    N = terrain.shape[0]  # noqa: N806

    near_any = np.zeros((N, N), dtype=bool)  # Chebyshev <= nmin-1 of any anchor
    near_any_pref = np.zeros((N, N), dtype=bool)  # Chebyshev <= npref-1 of any anchor (preferred neutral spacing)
    near_player_pref = np.zeros((N, N), dtype=bool)  # Chebyshev <= pref-1 of a player anchor
    near_player_hard = np.zeros((N, N), dtype=bool)  # Chebyshev <= hard_min-1 of a player anchor
    pyramid_block = np.zeros((N, N), dtype=bool)
    pyramid_block[max(0, py - pyr_excl) : py + pyr_excl + 1, max(0, px - pyr_excl) : px + pyr_excl + 1] = True
    port_mask = _port_eligible_mask(terrain)

    def mark(grid: np.ndarray, x: int, y: int, r: int) -> None:
        grid[max(0, y - r) : y + r + 1, max(0, x - r) : x + r + 1] = True

    anchors: list[Anchor] = []
    region_ids = {"R0": 0, "R1": 1, "R2": 2, "R3": 3}
    tname = {"plain": PLAIN, "forest": FOREST, "mountain": MOUNTAIN}

    def sector_of(x: int, y: int, cx: float, cy: float) -> int:
        ang = math.atan2(y - cy, x - cx)
        return int(((ang + math.pi) / (2 * math.pi)) * 8) % 8

    for reg in spec.regions:
        rid = region_ids[reg["id"]]
        rmask = region == rid
        pts = np.argwhere(rmask)
        cy, cx = pts.mean(axis=0)

        # players
        for tn, quota in reg["player_terrain_quota"].items():
            if quota == 0:
                continue
            cand = np.argwhere(rmask & (terrain == tname[tn]) & ~pyramid_block)
            rng.shuffle(cand)
            placed = 0
            for strict in (True, False):
                for y, x in cand:
                    if placed >= quota:
                        break
                    y, x = int(y), int(x)
                    if near_any[y, x] or near_player_hard[y, x]:
                        continue
                    if strict and near_player_pref[y, x]:
                        continue
                    anchors.append(Anchor("PLAYER_SLOT", x, y, tn, reg["id"], bool(port_mask[y, x])))
                    mark(near_any, x, y, nmin - 1)
                    mark(near_any_pref, x, y, npref - 1)
                    mark(near_player_hard, x, y, hard_min - 1)
                    mark(near_player_pref, x, y, pref - 1)
                    placed += 1
                if placed >= quota:
                    break
            if placed < quota:
                return _reject("L404: if placed < quota:")

        # neutrals: port-eligible first (spread over coast sectors), then the remaining quota
        min_ports = int(reg["min_port_eligible_neutrals"])
        min_sectors = int(reg["min_distinct_coast_sectors"])
        remaining = dict(reg["neutral_terrain_quota"])
        coastal = np.argwhere(rmask & port_mask & ~pyramid_block)
        rng.shuffle(coastal)
        # coast sectors = 8 equal-count angular bins of the region's coastline around its centroid
        angles = np.arctan2(coastal[:, 0] - cy, coastal[:, 1] - cx) if len(coastal) else np.zeros(0)
        edges = np.quantile(angles, np.linspace(0, 1, 9)[1:-1]) if len(coastal) >= 8 else np.zeros(7)
        by_sector: dict[int, list[tuple[int, int]]] = {s: [] for s in range(8)}
        for (y, x), ang in zip(coastal, angles):
            by_sector[int(np.searchsorted(edges, ang))].append((int(y), int(x)))
        ports_placed = 0
        sectors_used: set[int] = set()
        sector_order = list(range(8))
        rng.shuffle(sector_order)
        guard = 0
        while ports_placed < min_ports and guard < 5000:
            guard += 1
            progressed = False
            for s in sector_order:
                if ports_placed >= min_ports:
                    break
                lst = by_sector[s]
                while lst:
                    y, x = lst.pop()
                    tn = TERRAIN_NAMES[terrain[y, x]]
                    if near_any[y, x] or remaining.get(tn, 0) <= 0:
                        continue
                    anchors.append(Anchor("NEUTRAL", x, y, tn, reg["id"], True))
                    mark(near_any, x, y, nmin - 1)
                    mark(near_any_pref, x, y, npref - 1)
                    remaining[tn] -= 1
                    ports_placed += 1
                    sectors_used.add(s)
                    progressed = True
                    break
            if not progressed:
                break
        if ports_placed < min_ports or len(sectors_used) < min_sectors:
            return _reject("L442: if ports_placed < min_ports or len(sectors_used) < min_sectors:")
        for tn, quota in remaining.items():
            if quota <= 0:
                continue
            cand = np.argwhere(rmask & (terrain == tname[tn]) & ~pyramid_block & ~near_any)
            rng.shuffle(cand)
            placed = 0
            for strict in (True, False):  # preferred spacing first, then fall back to the hard minimum
                for y, x in cand:
                    if placed >= quota:
                        break
                    y, x = int(y), int(x)
                    if near_any[y, x] or (strict and near_any_pref[y, x]):
                        continue
                    anchors.append(Anchor("NEUTRAL", x, y, tn, reg["id"], bool(port_mask[y, x])))
                    mark(near_any, x, y, nmin - 1)
                    mark(near_any_pref, x, y, npref - 1)
                    placed += 1
                if placed >= quota:
                    break
            if placed < quota:
                return _reject("L459: if placed < quota:")

    # sanity invariants
    players = [a for a in anchors if a.kind == "PLAYER_SLOT"]
    neutrals = [a for a in anchors if a.kind == "NEUTRAL"]
    if len(players) != spec.world["player_slots"] or len(neutrals) != spec.world["neutral_settlements"]:
        return _reject("L465: if len(players) != spec.world['player_slots'] or len(neutrals) != spec")
    if any(terrain[a.y, a.x] == WATER for a in anchors):
        return _reject("L467: if any(terrain[a.y, a.x] == WATER for a in anchors):")
    if len({(a.x, a.y) for a in anchors}) != len(anchors):
        return _reject("L469: if len({(a.x, a.y) for a in anchors}) != len(anchors):")
    # playability: >= 3 neutrals on the same landmass (region) for every player slot
    per_region = {}
    for a in neutrals:
        per_region[a.region] = per_region.get(a.region, 0) + 1
    if any(per_region.get(a.region, 0) < int(sp["playability_validation"]["min_reachable_neutrals_per_player_slot_before_navigation"]) for a in players):
        return _reject("L475: if any(per_region.get(a.region, 0) < int(sp['playability_validation'][")

    # neutral level distribution 560/160/80 (deterministic shuffle)
    dist = spec.neutral_runtime["level_distribution"]
    levels = [1] * int(dist["level_1"]) + [2] * int(dist["level_2"]) + [3] * int(dist["level_3"])
    levels = list(rng.permutation(levels))
    for a, lvl in zip(neutrals, levels):
        a.level = int(lvl)
    return anchors


def generate_world(base_seed: int, spec: Spec | None = None, cfg: GenConfig | None = None) -> WorldGen:
    spec = spec or get_spec()
    cfg = cfg or GenConfig.from_spec(spec)
    max_attempts = int(spec.generator["max_seed_attempts"])
    rejected = 0
    for attempt in range(max_attempts):
        seed = base_seed * 1000 + attempt
        try:
            result = _try_generate(seed, spec, cfg)
        except MapGenerationError:
            result = None
        if result is not None:
            result.stats["rejected_seeds"] = rejected
            result.stats["attempt"] = attempt
            return result
        rejected += 1
    raise MapGenerationError("MAP_GENERATION_CONSTRAINT_FAILED")


# ============================================================================= Grande Mondo (Bibbia GM v0.2)
# "Spicchi": the mega-realm is a disc. Nine annular sectors (40° each) fan out from the neutral central disc that carries
# the Grande Piramide; each sector is a complete region (mainland touching the centre, 3 islands on the outer rim, 100
# slots + 800 neutrals, regional Pyramid). Sectors are separated by narrow sea channels (the fog wall stands over them);
# the only land link between regions is the centre — every War of the Regions converges on the Grande Piramide.
@dataclass
class GrandeMondoGen:
    seed: int
    terrain: np.ndarray  # uint8 [y, x], whole mega-realm
    anchors: list[tuple[Anchor, str]]  # (anchor in world coordinates, region code)
    stats: dict


@dataclass(frozen=True)
class SectorGeom:
    """One region of the Grande Mondo in world coordinates (centre cx, cy; angles in radians, screen space y-down)."""

    index: int
    code: str
    cx: float
    cy: float
    mid: float  # mid angle
    half: float  # angular half-width (π / n)
    r_in: int  # inner radius (edge of the central disc)
    r_land: int  # outer coast of the mainland
    r_out: int  # outer limit of the island band
    channel_half: int  # half width of the sea channel between two sectors (tiles)

    def bbox(self, pad: int = 8) -> tuple[int, int, int, int]:
        pts = []
        for r in (self.r_in, self.r_out):
            for k in range(0, 41):
                a = self.mid - self.half + (2 * self.half) * k / 40.0
                pts.append((self.cx + r * math.cos(a), self.cy + r * math.sin(a)))
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        return int(math.floor(min(xs))) - pad, int(math.floor(min(ys))) - pad, int(math.ceil(max(xs))) + pad, int(math.ceil(max(ys))) + pad

    def polar(self, x: float, y: float) -> tuple[float, float]:
        return math.hypot(x - self.cx, y - self.cy), math.atan2(y - self.cy, x - self.cx)

    def point(self, r: float, dtheta: float = 0.0) -> tuple[int, int]:
        return int(round(self.cx + r * math.cos(self.mid + dtheta))), int(round(self.cy + r * math.sin(self.mid + dtheta)))


def _wrap(a: np.ndarray | float) -> np.ndarray | float:
    return (a + math.pi) % (2 * math.pi) - math.pi


def _sector_fields(g: SectorGeom, ox: int, oy: int, L: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:  # noqa: N803
    """r, |Δθ| (from the mid angle) and the perpendicular distance to the nearest sector boundary ray, on an L×L canvas
    whose origin is the world tile (ox, oy)."""
    yy, xx = np.mgrid[0:L, 0:L].astype(np.float32)
    wx = xx + ox - g.cx
    wy = yy + oy - g.cy
    r = np.sqrt(wx * wx + wy * wy)
    dth = np.abs(_wrap(np.arctan2(wy, wx) - g.mid))
    edge = r * np.sin(np.clip(g.half - dth, -math.pi / 2, math.pi / 2))  # signed distance to the nearest spoke (+ inside)
    return r, dth, edge


def _paint_biomes(rng: np.random.Generator, spec: Spec, terrain: np.ndarray, land: np.ndarray, mainland: np.ndarray, islands: list[np.ndarray], plateau: np.ndarray, area_tiles: int, S: float, n: int) -> tuple[float, float, float, int, int] | None:  # noqa: N803
    """Mountain chains + massif halo and forest clusters (same rules as the classic generator) on an arbitrary land
    mask; percentages are checked against `area_tiles` (the region's own area). Returns (mountain%, forest%, plain%,
    chains, seeds) or None on a Bible constraint failure."""
    gen = spec.generator
    terr = spec.terrain
    mountain_target = int(area_tiles * terr["mountain"]["target_pct"] / 100.0)
    chain_mask = np.zeros((n, n), dtype=bool)
    wmin, wmax = gen["mountain_width_tiles_range"]
    n_chains = int(rng.integers(gen["mainland_mountain_chains_range"][0], gen["mainland_mountain_chains_range"][1] + 1))
    ml_pts = np.argwhere(mainland & ~dilate_chebyshev(plateau, 6))
    for _ in range(n_chains):
        y, x = ml_pts[rng.integers(len(ml_pts))]
        heading = rng.uniform(0, 2 * math.pi)
        for _seg in range(int(rng.integers(6, 11))):
            seg_len = rng.uniform(28, 48) * S
            heading += rng.uniform(-0.6, 0.6)
            nx, ny = x + math.cos(heading) * seg_len, y + math.sin(heading) * seg_len
            half_w = rng.uniform(wmin, wmax) / 2.0
            chain_mask |= _segment_mask_bbox(n, float(x), float(y), nx, ny, half_w, _band_bbox(n, float(x), float(y), nx, ny, half_w))
            x, y = nx, ny
    for isl in islands:
        pts = np.argwhere(isl)
        y, x = pts[rng.integers(len(pts))]
        heading = rng.uniform(0, 2 * math.pi)
        for _seg in range(int(rng.integers(3, 6))):
            seg_len = rng.uniform(14, 26) * S
            heading += rng.uniform(-0.5, 0.5)
            nx, ny = x + math.cos(heading) * seg_len, y + math.sin(heading) * seg_len
            half_w = rng.uniform(wmin, wmax) / 2.0
            chain_mask |= _segment_mask_bbox(n, float(x), float(y), nx, ny, half_w, _band_bbox(n, float(x), float(y), nx, ny, half_w))
            x, y = nx, ny
    chain_mask &= land & ~plateau
    mnoise = _coarse_fbm(n, rng, base_freq=10, factor=2)
    halo = dilate_chebyshev(chain_mask, max(9, round(9 * S))) & land & ~plateau & ~chain_mask
    need = mountain_target - int(chain_mask.sum())
    mountain = chain_mask.copy()
    if need > 0:
        halo_field = mnoise - 0.02 * np.where(halo, 0, 1)
        mountain |= _threshold_top_k(halo_field, halo, need)
    for isl in islands:
        if int((mountain & isl).sum()) < int(gen["island_min_mountain_ridges_each"]) * 20:
            return None
    terrain[mountain] = MOUNTAIN
    mountain_pct = 100.0 * int(mountain.sum()) / area_tiles
    if not (terr["mountain"]["range_pct"][0] <= mountain_pct <= terr["mountain"]["range_pct"][1]):
        return None
    # forests: best-first region growing on noise
    import heapq

    forest_target = int(area_tiles * terr["forest"]["target_pct"] / 100.0)
    A = area_tiles / (BASE_N * BASE_N)  # noqa: N806
    n_seeds = int(round(int(rng.integers(gen["forest_cluster_seed_range"][0], gen["forest_cluster_seed_range"][1] + 1)) * A))
    fnoise = _coarse_fbm(n, rng, base_freq=12, factor=2)
    growable = (terrain == PLAIN) & ~plateau
    weights = rng.uniform(0.5, 1.5, size=n_seeds)
    sizes_f = (weights / weights.sum() * forest_target).astype(int)
    grow_pts = np.argwhere(growable)
    forest = np.zeros((n, n), dtype=bool)
    for si in range(n_seeds):
        y0, x0 = grow_pts[rng.integers(len(grow_pts))]
        if forest[y0, x0]:
            continue
        target = int(sizes_f[si])
        heap = [(-float(fnoise[y0, x0]), int(y0), int(x0))]
        seen = {(int(y0), int(x0))}
        grown = 0
        while heap and grown < target:
            _, y, x = heapq.heappop(heap)
            if forest[y, x] or not growable[y, x]:
                continue
            forest[y, x] = True
            grown += 1
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < n and 0 <= nx < n and (ny, nx) not in seen and growable[ny, nx] and not forest[ny, nx]:
                    seen.add((ny, nx))
                    heapq.heappush(heap, (-float(fnoise[ny, nx]), ny, nx))
    deficit = forest_target - int(forest.sum())
    if deficit > 0:
        heap = []
        seen = set()
        fy, fx = np.nonzero(forest)
        for y, x in zip(fy.tolist(), fx.tolist()):
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < n and 0 <= nx < n and growable[ny, nx] and not forest[ny, nx] and (ny, nx) not in seen:
                    seen.add((ny, nx))
                    heapq.heappush(heap, (-float(fnoise[ny, nx]), ny, nx))
        while heap and deficit > 0:
            _, y, x = heapq.heappop(heap)
            if forest[y, x]:
                continue
            forest[y, x] = True
            deficit -= 1
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < n and 0 <= nx < n and growable[ny, nx] and not forest[ny, nx] and (ny, nx) not in seen:
                    seen.add((ny, nx))
                    heapq.heappush(heap, (-float(fnoise[ny, nx]), ny, nx))
    terrain[forest] = FOREST
    forest_pct = 100.0 * int(forest.sum()) / area_tiles
    if not (terr["forest"]["range_pct"][0] <= forest_pct <= terr["forest"]["range_pct"][1]):
        return None
    plain_pct = 100.0 * int((terrain == PLAIN).sum()) / area_tiles
    if not (terr["plain"]["range_pct"][0] <= plain_pct <= terr["plain"]["range_pct"][1]):
        return None
    return mountain_pct, forest_pct, plain_pct, n_chains, n_seeds


def _coarse_fbm(n: int, rng: np.random.Generator, base_freq: int, factor: int = 4) -> np.ndarray:
    """fbm on an n/factor grid upsampled by nearest neighbour (float32) — mega-realm canvases are large."""
    m = (n + factor - 1) // factor
    small = fbm((m, m), rng, octaves=4, base_freq=base_freq).astype(np.float32)
    return np.repeat(np.repeat(small, factor, axis=0), factor, axis=1)[:n, :n]


def _band_bbox(n: int, x1: float, y1: float, x2: float, y2: float, half_w: float, pad: int = 8) -> tuple[int, int, int, int]:
    x0 = max(0, int(math.floor(min(x1, x2) - half_w - pad)))
    y0 = max(0, int(math.floor(min(y1, y2) - half_w - pad)))
    xe = min(n, int(math.ceil(max(x1, x2) + half_w + pad)) + 1)
    ye = min(n, int(math.ceil(max(y1, y2) + half_w + pad)) + 1)
    return x0, y0, xe, ye


def _segment_mask_bbox(n: int, x1: float, y1: float, x2: float, y2: float, half_w: np.ndarray | float, bbox: tuple[int, int, int, int]) -> np.ndarray:
    """Segment band restricted to a bounding box (full-size bool mask, work done on the slice only)."""
    x0, y0, xe, ye = bbox
    out = np.zeros((n, n), dtype=bool)
    if xe <= x0 or ye <= y0:
        return out
    yy, xx = np.mgrid[y0:ye, x0:xe].astype(np.float32)
    dx, dy = x2 - x1, y2 - y1
    seg_len2 = dx * dx + dy * dy
    t = np.clip(((xx - x1) * dx + (yy - y1) * dy) / seg_len2, 0, 1) if seg_len2 else np.zeros_like(xx)
    px, py = x1 + t * dx, y1 + t * dy
    dist = np.sqrt((xx - px) ** 2 + (yy - py) ** 2)
    hw = half_w[y0:ye, x0:xe] if isinstance(half_w, np.ndarray) else half_w
    out[y0:ye, x0:xe] = dist <= hw
    return out


def _try_generate_sector(seed: int, spec: Spec, cfg: GenConfig, g: SectorGeom) -> tuple[np.ndarray, np.ndarray, list[Anchor], dict, tuple[int, int]] | None:
    """One region as an annular sector on a local square canvas. Returns (terrain, in_sector mask, anchors in LOCAL
    coordinates, stats, (ox, oy) canvas origin) or None when a Bible constraint fails (seed rejected)."""
    rng = np.random.default_rng(seed)
    gen = spec.generator
    terr = spec.terrain
    x0, y0, x1, y1 = g.bbox()
    L = int(max(x1 - x0, y1 - y0))  # noqa: N806
    L = ((L + 31) // 32) * 32  # noqa: N806
    ox, oy = x0, y0
    r, dth, edge = _sector_fields(g, ox, oy, L)
    S = 600.0 / BASE_N  # noqa: N806 — landmass features scaled like a 600×600 realm (owner decision: Regno 2 feel)
    A_eq = S * S  # noqa: N806
    in_sector_full = (dth <= g.half) & (r >= g.r_in) & (r <= g.r_out)  # the region's own tiles (channel included)
    in_sector = in_sector_full & (edge >= g.channel_half)  # land may exist here (outside the sea channels)
    area_tiles = int(in_sector_full.sum())
    land_target = int(area_tiles * (1 - terr["water"]["target_pct"] / 100.0))
    isl_lo, isl_hi = int(gen["island_land_tiles_range"][0] * A_eq), int(gen["island_land_tiles_range"][1] * A_eq)
    island_sep = int(gen["island_min_water_separation_tiles"])

    # ---- islands on the outer rim (three, spread across the sector) ----
    r_isl = (g.r_land + g.r_out) / 2.0 + 6
    islands: list[np.ndarray] = []
    for k, dt in enumerate((-math.radians(12.5), 0.0, math.radians(12.5))):
        icx, icy = g.point(r_isl + rng.uniform(-8, 8), dt + math.radians(rng.uniform(-1.5, 1.5)))
        icx, icy = icx - ox, icy - oy
        target = int(rng.integers(isl_lo + int(500 * A_eq), isl_hi - int(500 * A_eq)))
        noise = _coarse_fbm(L, rng, base_freq=8, factor=2)
        fld = 1.0 - _ellipse_field(L, icx, icy, 82.0, 70.0) + 0.45 * (noise - 0.5)
        window = (_ellipse_field(L, icx, icy, 82.0 * 1.35, 70.0 * 1.35) <= 1.0) & in_sector & (r > g.r_land + island_sep)
        mask = _threshold_top_k(fld, window, target)
        labels, sizes = label_components(mask)
        if not sizes:
            return _reject("GM island: empty")
        mask = labels == int(np.argmax(sizes))
        cnt = int(mask.sum())
        if not (isl_lo <= cnt <= isl_hi):
            return _reject(f"GM island size {cnt}")
        islands.append(mask)
    for i in range(3):
        for j in range(i + 1, 3):
            if (dilate_chebyshev(islands[i], island_sep) & islands[j]).any():
                return _reject("GM islands too close")
    islands_all = islands[0] | islands[1] | islands[2]
    forbidden = dilate_chebyshev(islands_all, island_sep)

    # ---- mainland: the sector body eroded by noise along the outer coast and the channels; solid at the centre ----
    noise = _coarse_fbm(L, rng, base_freq=6, factor=2)
    coast_d = np.minimum(g.r_land - r, edge - g.channel_half)  # distance to the outer coast / channel shores (+ inside)
    land_field = np.clip(coast_d / 70.0, -1.0, 1.0) + 0.9 * (noise - 0.5)
    land_field = np.where(r <= g.r_in + 45, 5.0, land_field)  # the inner arc always touches the central disc
    pxl, pyl = cfg.pyramid_anchor
    plateau = np.zeros((L, L), dtype=bool)
    plateau[pyl - 12 : pyl + 13, pxl - 12 : pxl + 13] = True
    land_field[plateau] = 10.0
    allowed = in_sector & (r <= g.r_land) & ~forbidden
    mainland_target = land_target - int(islands_all.sum())
    mainland = _threshold_top_k(land_field, allowed, mainland_target)
    ax, ay = g.point(g.r_in + 20)
    ax, ay = ax - ox, ay - oy
    labels, sizes = label_components(mainland)
    if not sizes or labels[ay, ax] == -1 or labels[pyl, pxl] == -1:
        return _reject("GM mainland: centre/plateau not on the main component")
    mainland = labels == int(labels[ay, ax])
    for _ in range(6):
        cnt = int(mainland.sum())
        if abs(cnt - mainland_target) <= 600 * A_eq:
            break
        mainland_target_adj = mainland_target + (mainland_target - cnt)
        cand = _threshold_top_k(land_field, allowed, max(1000, mainland_target_adj))
        labels, sizes = label_components(cand)
        if labels[ay, ax] == -1:
            return _reject("GM mainland: centre lost")
        mainland = labels == int(labels[ay, ax])
        mainland_target = mainland_target_adj
    if labels[pyl, pxl] == -1 or not mainland[pyl, pxl]:
        return _reject("GM mainland: plateau lost")
    land = mainland | islands_all
    water_pct = 100.0 * (area_tiles - int(land.sum())) / area_tiles
    if not (terr["water"]["range_pct"][0] <= water_pct <= terr["water"]["range_pct"][1]):
        return _reject(f"GM water% {water_pct:.1f}")

    region = np.full((L, L), 255, dtype=np.uint8)
    region[mainland] = 0
    for i, isl in enumerate(islands):
        region[isl] = i + 1
    terrain = np.full((L, L), WATER, dtype=np.uint8)
    terrain[land] = PLAIN
    biomes = _paint_biomes(rng, spec, terrain, land, mainland, islands, plateau, area_tiles, S, L)
    if biomes is None:
        return _reject("GM biomes")
    mountain_pct, forest_pct, plain_pct, n_chains, n_seeds = biomes
    anchors = _place_anchors(rng, spec, cfg, terrain, region)
    if anchors is None:
        return _reject("GM anchors")
    stats = {
        "plain_pct": round(plain_pct, 2),
        "forest_pct": round(forest_pct, 2),
        "mountain_pct": round(mountain_pct, 2),
        "water_pct": round(water_pct, 2),
        "island_sizes": [int(i.sum()) for i in islands],
        "mainland_size": int(mainland.sum()),
        "area_tiles": area_tiles,
        "mountain_chains": n_chains,
        "forest_seeds": n_seeds,
    }
    return terrain, in_sector_full, anchors, stats, (ox, oy)


def generate_sector(base_seed: int, spec: Spec, cfg: GenConfig, g: SectorGeom) -> tuple[np.ndarray, np.ndarray, list[Anchor], dict, tuple[int, int]]:
    max_attempts = int(spec.generator["max_seed_attempts"])
    for attempt in range(max_attempts):
        try:
            res = _try_generate_sector(base_seed * 1000 + attempt, spec, cfg, g)
        except MapGenerationError:
            res = None
        if res is not None:
            res[3]["attempt"] = attempt
            res[3]["seed"] = base_seed * 1000 + attempt
            return res
    raise MapGenerationError(f"MAP_GENERATION_CONSTRAINT_FAILED (sector {g.code}): {LAST_REJECT[-5:]}")


def generate_grande_mondo(base_seed: int, spec: Spec, region_cfg_overrides: dict, sectors: list[SectorGeom], world_size: int, center: tuple[int, int], r_in: int) -> GrandeMondoGen:
    """Whole mega-realm: central disc (Grande Piramide plateau 41×41, forest patches) + one generated sector per region."""
    N = int(world_size)  # noqa: N806
    cx, cy = center
    terrain = np.full((N, N), WATER, dtype=np.uint8)
    anchors: list[tuple[Anchor, str]] = []
    stats_regions = {}
    for i, g in enumerate(sectors):
        # regional Pyramid: mid angle, mid-way between the centre and the outer coast (local coordinates for the sector canvas)
        x0, y0, _, _ = g.bbox()
        px, py = g.point((g.r_in + g.r_land) / 2.0)
        cfg = GenConfig.from_spec(spec, {"size": 600, **region_cfg_overrides, "pyramid_anchor": [px - x0, py - y0]})
        t, mask, anc, st, (ox, oy) = generate_sector(base_seed * 100 + i, spec, cfg, g)
        L = t.shape[0]  # noqa: N806
        # paste the sector's own tiles into the world grid (clipped to the world)
        wy0, wx0 = max(0, oy), max(0, ox)
        wy1, wx1 = min(N, oy + L), min(N, ox + L)
        sub = mask[wy0 - oy : wy1 - oy, wx0 - ox : wx1 - ox]
        dst = terrain[wy0:wy1, wx0:wx1]
        dst[sub] = t[wy0 - oy : wy1 - oy, wx0 - ox : wx1 - ox][sub]
        for a in anc:
            anchors.append((Anchor(a.kind, a.x + ox, a.y + oy, a.terrain, a.region, a.port_eligible, a.level), g.code))
        stats_regions[g.code] = {**st, "pyramid_anchor": [px, py]}
    # ---- central disc: neutral plain with forest patches and the Grande Piramide plateau ----
    rng = np.random.default_rng(base_seed * 7 + 13)
    cb = (max(0, cx - r_in - 4), max(0, cy - r_in - 4), min(N, cx + r_in + 5), min(N, cy + r_in + 5))
    yy, xx = np.mgrid[cb[1] : cb[3], cb[0] : cb[2]].astype(np.float32)
    disc = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) <= r_in
    sl = terrain[cb[1] : cb[3], cb[0] : cb[2]]
    sl[disc] = PLAIN
    fn = fbm(disc.shape, rng, octaves=4, base_freq=6)
    sl[disc & (fn > 0.62)] = FOREST
    terrain[cy - 20 : cy + 21, cx - 20 : cx + 21] = PLAIN  # Grande Piramide plateau (monument drawn by the client)
    stats = {"regions": stats_regions, "world_size": N, "r_in": r_in, "water_pct": round(100.0 * float((terrain == WATER).sum()) / (N * N), 2)}
    return GrandeMondoGen(seed=base_seed, terrain=terrain, anchors=anchors, stats=stats)
