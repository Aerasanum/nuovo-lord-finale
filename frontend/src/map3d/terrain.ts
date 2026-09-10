/**
 * Terrain geometry builders — smooth, textureless, safe on expo-gl.
 *
 * The world is a tile grid, but the mesh must not look like one: vertices sit on tile corners and are SHARED between
 * quads (indexed geometry), heights follow a continuous multi-octave noise field, colours are blended per vertex from
 * the surrounding tiles, and normals are analytic (central differences on the height field) so lighting is identical on
 * both sides of a chunk seam. Water tiles are holes (the shared world water plane shows through); every corner touching
 * water is kept below WATER_LEVEL so shorelines are drawn by the water surface cutting the land slope, never by a tile edge.
 *
 * A sampler returns the terrain code of a tile: 0 plain, 1 forest, 2 mountain, 3 water, -1 unknown/not loaded.
 */
import * as THREE from "three";

export const WATER_LEVEL = -0.12;
const WATER_DEPTH = -0.6; // contribution of a water tile to a shared corner
const BASE_HEIGHT = [0.0, 0.12, 1.7]; // plain, forest, mountain

export type Sampler = (gx: number, gz: number) => number;

export type TerrainPalette = {
  plain: THREE.Color;
  dry: THREE.Color; // sun-bleached grass patches on plains
  forest: THREE.Color;
  mountain: THREE.Color;
  water: THREE.Color;
  snow: THREE.Color;
  sand: THREE.Color;
  rock: THREE.Color;
};

export function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return ((h >>> 0) % 10000) / 10000;
}

/** Smooth value noise on the integer lattice (0..1), continuous everywhere → no seams between chunks. */
export function smoothNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

/** Three-octave fbm in tile units (0..1). */
export function fbm(x: number, y: number): number {
  return 0.5 * smoothNoise(x * 0.31, y * 0.31) + 0.3 * smoothNoise(x * 0.9 + 7.3, y * 0.9 + 2.1) + 0.2 * smoothNoise(x * 2.3 + 11.0, y * 2.3 + 5.0);
}

/** Continuous mountain relief: ridged noise (sharp crests ~6 tiles apart) + a finer octave. Range ≈ 1.0 … 4.6. */
function mountainField(x: number, y: number): number {
  const n = smoothNoise(x * 0.16 + 5.0, y * 0.16 + 2.0);
  const ridge = Math.pow(1 - Math.abs(2 * n - 1), 1.8);
  return 1.0 + 2.8 * ridge + 0.9 * smoothNoise(x * 0.5 + 9.0, y * 0.5 + 3.0) + 0.7 * smoothNoise(x * 1.3 + 17.0, y * 1.3 + 8.0);
}

/**
 * Height of a tile corner: average of the 4 tiles sharing it, plus continuous relief. Corners touching water are always
 * submerged; land corners never dip below 0 so no inland puddles appear. `noiseScale` maps sampler coordinates to world
 * tiles (4 for the overview grid) so near and far LODs share the same relief.
 */
export function cornerHeight(sampler: Sampler, x: number, y: number, noiseScale = 1): number {
  let sum = 0;
  let n = 0;
  let water = 0;
  const wx = x * noiseScale;
  const wy = y * noiseScale;
  for (let dy = -1; dy <= 0; dy++) {
    for (let dx = -1; dx <= 0; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      const t = sampler(tx, ty);
      if (t < 0) continue;
      n++;
      if (t === 3) {
        water++;
        sum += WATER_DEPTH;
        continue;
      }
      sum += t === 2 ? mountainField(wx, wy) + 0.5 * hash2(tx, ty) : BASE_HEIGHT[t]; // per-tile term keeps crests jagged
    }
  }
  if (!n) return 0;
  const h = sum / n;
  const f = fbm(wx, wy);
  if (water > 0) return -0.2 - 0.12 * (water - 1) + (f - 0.5) * 0.08;
  if (h > 0.9) return h + (f - 0.5) * 0.5;
  return h + f * 0.42;
}

export function tileHeight(sampler: Sampler, x: number, y: number, noiseScale = 1): number {
  const t = sampler(x, y);
  if (t === 3) return WATER_LEVEL;
  if (t < 0) return 0;
  return (cornerHeight(sampler, x, y, noiseScale) + cornerHeight(sampler, x + 1, y, noiseScale) + cornerHeight(sampler, x, y + 1, noiseScale) + cornerHeight(sampler, x + 1, y + 1, noiseScale)) / 4;
}

/** Dominant land code of a step×step block (water only if the block is entirely water / unknown). */
function blockCode(sampler: Sampler, x0: number, z0: number, step: number): number {
  if (step === 1) return sampler(x0, z0);
  const counts = [0, 0, 0, 0];
  let known = 0;
  for (let z = 0; z < step; z++) {
    for (let x = 0; x < step; x++) {
      const t = sampler(x0 + x, z0 + z);
      if (t < 0) continue;
      counts[t]++;
      known++;
    }
  }
  if (!known) return -1;
  if (counts[3] === known) return 3;
  const weights = [1.0, 1.15, 1.35];
  let best = 0;
  for (let c = 1; c < 3; c++) if (counts[c] * weights[c] > counts[best] * weights[best]) best = c;
  return best;
}

const TYPE_WEIGHT = [1.0, 1.25, 1.45, 1.2]; // plain, forest, mountain, water(sand)

/** Blended colour of a corner from its 4 tiles + large-scale meadow / undergrowth variation. */
function cornerColor(sampler: Sampler, x: number, y: number, pal: TerrainPalette, out: THREE.Color, tmp: THREE.Color, ns = 1): THREE.Color {
  let r = 0;
  let g = 0;
  let b = 0;
  let w = 0;
  const wx = x * ns;
  const wy = y * ns;
  const dryMix = 0.75 * smoothNoise(wx * 0.13 + 3.1, wy * 0.13 + 9.7);
  const floorMix = smoothNoise(wx * 0.05 + 1.0, wy * 0.05 + 4.0);
  for (let dy = -1; dy <= 0; dy++) {
    for (let dx = -1; dx <= 0; dx++) {
      const t = sampler(x + dx, y + dy);
      if (t < 0) continue;
      if (t === 0) tmp.copy(pal.plain).lerp(pal.dry, dryMix);
      else if (t === 1) tmp.copy(pal.forest).multiplyScalar(0.88 + 0.24 * floorMix);
      else if (t === 2) tmp.copy(pal.mountain).lerp(pal.rock, 0.4);
      else tmp.copy(pal.sand);
      const k = TYPE_WEIGHT[t];
      r += tmp.r * k;
      g += tmp.g * k;
      b += tmp.b * k;
      w += k;
    }
  }
  if (!w) return out.copy(pal.plain);
  out.setRGB(r / w, g / w, b / w);
  out.multiplyScalar(0.93 + 0.14 * smoothNoise(wx * 0.7 + 21.0, wy * 0.7 + 17.0));
  return out;
}

export type TerrainBuildOpts = {
  ox: number;
  oz: number;
  w: number;
  h: number;
  step: number;
  sampler: Sampler;
  palette: TerrainPalette;
  scaleXZ?: number;
  scaleY?: number;
  noiseScale?: number; // sampler units → world tiles (overview grid = 4)
};

/** Builds a smooth indexed terrain geometry with per-vertex blended colours and analytic normals. */
export function buildTerrainGeometry(o: TerrainBuildOpts): THREE.BufferGeometry | null {
  const { ox, oz, w, h, step, sampler, palette } = o;
  const sxz = o.scaleXZ ?? 1;
  const sy = o.scaleY ?? 1;
  const ns = o.noiseScale ?? 1;
  const qw = Math.ceil(w / step);
  const qh = Math.ceil(h / step);
  const vw = qw + 1;
  const vh = qh + 1;
  const positions = new Float32Array(vw * vh * 3);
  const normals = new Float32Array(vw * vh * 3);
  const colors = new Float32Array(vw * vh * 3);
  const heights = new Float32Array(vw * vh);
  const col = new THREE.Color();
  const tmp = new THREE.Color();
  for (let j = 0; j < vh; j++) {
    for (let i = 0; i < vw; i++) {
      const gx = ox + i * step;
      const gz = oz + j * step;
      const k = j * vw + i;
      const hh = cornerHeight(sampler, gx, gz, ns);
      heights[k] = hh;
      positions[k * 3] = gx * sxz;
      positions[k * 3 + 1] = hh * sy;
      positions[k * 3 + 2] = gz * sxz;
      cornerColor(sampler, gx, gz, palette, col, tmp, ns);
      colors[k * 3] = col.r;
      colors[k * 3 + 1] = col.g;
      colors[k * 3 + 2] = col.b;
      // analytic normal from central differences (neighbours outside this chunk are sampled too → seamless lighting)
      const hl = i > 0 ? heights[k - 1] : cornerHeight(sampler, gx - step, gz, ns);
      const hr = cornerHeight(sampler, gx + step, gz, ns);
      const hu = j > 0 ? heights[k - vw] : cornerHeight(sampler, gx, gz - step, ns);
      const hd = cornerHeight(sampler, gx, gz + step, ns);
      const nx = (hl - hr) * sy;
      const nz = (hu - hd) * sy;
      const ny = 2 * step * sxz;
      const len = Math.hypot(nx, ny, nz) || 1;
      normals[k * 3] = nx / len;
      normals[k * 3 + 1] = ny / len;
      normals[k * 3 + 2] = nz / len;
    }
  }
  const index: number[] = [];
  for (let qz = 0; qz < qh; qz++) {
    for (let qx = 0; qx < qw; qx++) {
      const gx = ox + qx * step;
      const gz = oz + qz * step;
      const t = blockCode(sampler, gx, gz, step);
      if (t < 0 || t === 3) continue;
      const a = qz * vw + qx;
      const b = a + 1;
      const c = a + vw;
      const d = c + 1;
      if (hash2(gx, gz) > 0.5) index.push(a, c, b, b, c, d);
      else index.push(a, c, d, a, d, b);
    }
  }
  if (!index.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  return geo;
}

/** Faint tile outline following the relief (tactical reading at very close zoom only). Water tiles are skipped. */
export function buildGridGeometry(ox: number, oz: number, w: number, h: number, sampler: Sampler): THREE.BufferGeometry | null {
  const pts: number[] = [];
  const lift = 0.03;
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const gx = ox + x;
      const gz = oz + z;
      const t = sampler(gx, gz);
      if (t < 0 || t === 3) continue;
      const h00 = cornerHeight(sampler, gx, gz) + lift;
      const h10 = cornerHeight(sampler, gx + 1, gz) + lift;
      const h01 = cornerHeight(sampler, gx, gz + 1) + lift;
      pts.push(gx, h00, gz, gx + 1, h10, gz);
      pts.push(gx, h00, gz, gx, h01, gz + 1);
    }
  }
  if (!pts.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return geo;
}
