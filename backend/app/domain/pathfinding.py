"""Terrain grid cache + A* pathfinding (8-neighbourhood, no diagonal corner cutting, canonical costs).
Territory factor 0.9 for own/ally tiles is applied per tile step (spec.marches.own_or_ally_territory_path_cost_factor)."""
from __future__ import annotations

import asyncio
import heapq
import math

import numpy as np

from app.core.db import db
from app.core.spec import get_spec

N = 400  # default world size; each world carries its own `size` (grid.shape) — never assume 400 in callers
CHUNK = 32
_cache: dict[str, np.ndarray] = {}


async def world_size(world_id: str) -> int:
    if world_id in _cache:
        return int(_cache[world_id].shape[0])
    w = await db().worlds.find_one({"_id": world_id}, {"size": 1})
    return int((w or {}).get("size") or N)


async def load_terrain(world_id: str) -> np.ndarray:
    if world_id in _cache:
        return _cache[world_id]
    n = await world_size(world_id)
    grid = np.full((n, n), 3, dtype=np.uint8)
    async for c in db().map_chunks.find({"world_id": world_id}):
        cx, cy = c["cx"], c["cy"]
        arr = np.frombuffer(c["terrain"], dtype=np.uint8).reshape(CHUNK, CHUNK)
        h = min(CHUNK, n - cy * CHUNK)
        w = min(CHUNK, n - cx * CHUNK)
        grid[cy * CHUNK : cy * CHUNK + h, cx * CHUNK : cx * CHUNK + w] = arr[:h, :w]
    _cache[world_id] = grid
    return grid


def invalidate(world_id: str) -> None:
    _cache.pop(world_id, None)


def terrain_cost(code: int) -> float | None:
    spec = get_spec()
    name = spec.terrain_name(int(code))
    if name == "water":
        return None
    return float(spec.pathfinding_rules["terrain_costs"][name])


def astar(grid: np.ndarray, start: tuple[int, int], goal: tuple[int, int], naval: bool = False, territory: set[tuple[int, int]] | None = None, factor: float = 1.0, starts: list[tuple[int, int]] | None = None, goals: set[tuple[int, int]] | None = None, allowed: np.ndarray | None = None) -> tuple[list[tuple[int, int]], float] | None:
    """Returns (path, cost) where cost = sum(tile_cost * diagonal_cost * territory_factor) of entered tiles.
    Land: water impassable. Naval: only water passable (cost 1 per tile).
    `allowed` (bool grid) restricts passable tiles — the Grande Mondo fog wall keeps a movement inside its region zone."""
    sx, sy = start
    gx, gy = goal
    n_y, n_x = grid.shape
    if not (0 <= gx < n_x and 0 <= gy < n_y):
        return None
    if allowed is not None and not (allowed[gy, gx] and all(allowed[y, x] for x, y in (starts or [(sx, sy)]))):
        return None

    def passable(x: int, y: int) -> bool:
        if not (0 <= x < n_x and 0 <= y < n_y):
            return False
        if allowed is not None and not allowed[y, x]:
            return False
        code = int(grid[y, x])
        return (code == 3) if naval else (code != 3)

    def step_cost(x: int, y: int) -> float:
        if naval:
            base = 1.0
        else:
            base = terrain_cost(int(grid[y, x])) or 1.0
        if territory and (x, y) in territory:
            base *= factor
        return base

    # the goal tile (a settlement anchor) is enterable even if naval path ends on a port tile
    goal_set = goals or {(gx, gy)}

    def is_goal(x: int, y: int) -> bool:
        return (x, y) in goal_set

    start_list = starts or [(sx, sy)]
    open_heap: list[tuple[float, float, int, int]] = [(0.0, 0.0, x0, y0) for x0, y0 in start_list]
    g_score = {(x0, y0): 0.0 for x0, y0 in start_list}
    came: dict[tuple[int, int], tuple[int, int]] = {}
    closed: set[tuple[int, int]] = set()
    diag = math.sqrt(2)
    # octile heuristic scaled by the cheapest possible tile cost (territory factor < 1) — admissible, far tighter than
    # Chebyshev on open ground (the Grande Mondo has 900-tile routes)
    h_scale = min(1.0, factor) if territory else 1.0
    goal_list = list(goal_set)

    def heuristic(x: int, y: int) -> float:
        best = float("inf")
        for qx, qy in goal_list:
            ddx, ddy = abs(qx - x), abs(qy - y)
            v = max(ddx, ddy) + (diag - 1.0) * min(ddx, ddy)
            if v < best:
                best = v
        return best * h_scale

    while open_heap:
        _, g, x, y = heapq.heappop(open_heap)
        if (x, y) in closed:
            continue
        closed.add((x, y))
        if is_goal(x, y):
            path = [(x, y)]
            while (x, y) in came:
                x, y = came[(x, y)]
                path.append((x, y))
            path.reverse()
            return path, g
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                nx, ny = x + dx, y + dy
                goal_here = is_goal(nx, ny)
                if not goal_here and not passable(nx, ny):
                    continue
                if dx != 0 and dy != 0:
                    # no corner cutting: both adjacent cardinals must be traversable
                    if not (passable(x + dx, y) and passable(x, y + dy)):
                        continue
                mult = diag if (dx != 0 and dy != 0) else 1.0
                cost = (step_cost(nx, ny) if not goal_here else (1.0 if naval else (terrain_cost(int(grid[ny, nx])) or 1.0))) * mult
                ng = g + cost
                if ng < g_score.get((nx, ny), float("inf")):
                    g_score[(nx, ny)] = ng
                    came[(nx, ny)] = (x, y)
                    heapq.heappush(open_heap, (ng + heuristic(nx, ny), ng, nx, ny))
    return None


async def astar_async(*args, **kwargs):
    """A* off the event loop (a 900-tile Grande Mondo route can take seconds in pure Python)."""
    return await asyncio.get_running_loop().run_in_executor(None, lambda: astar(*args, **kwargs))
