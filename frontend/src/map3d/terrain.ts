/**
 * Terrain geometry builders (vertex-coloured low-poly, no textures → safe on expo-gl).
 * A sampler returns the terrain code of a tile: 0 plain, 1 forest, 2 mountain, 3 water, -1 unknown/not loaded.
 */
import * as THREE from "three";

export const TILE_HEIGHT = [0.0, 0.14, 1.7, -0.32]; // plain, forest, mountain, water
export const WATER_LEVEL = -0.12;

export type Sampler = (gx: number, gz: number) => number;

export type TerrainPalette = {
  plain: THREE.Color;
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

/** Height of a tile corner = average of the 4 tiles sharing it (smooth low-poly relief with deterministic noise). */
export function cornerHeight(sampler: Sampler, x: number, y: number): number {
  let sum = 0;
  let n = 0;
  for (let dy = -1; dy <= 0; dy++) {
    for (let dx = -1; dx <= 0; dx++) {
      const t = sampler(x + dx, y + dy);
      if (t < 0) continue;
      let h = TILE_HEIGHT[t];
      if (t === 2) h += 0.9 * hash2(x + dx, y + dy) + 0.5 * hash2(x + dx + 7, y + dy + 3);
      else if (t === 1) h += 0.08 * hash2(x + dx, y + dy);
      else if (t === 0) h += 0.05 * hash2(x + dx, y + dy);
      sum += h;
      n++;
    }
  }
  return n ? sum / n : 0;
}

export function tileHeight(sampler: Sampler, x: number, y: number): number {
  const t = sampler(x, y);
  if (t === 3) return TILE_HEIGHT[3];
  if (t < 0) return 0;
  return (cornerHeight(sampler, x, y) + cornerHeight(sampler, x + 1, y) + cornerHeight(sampler, x, y + 1) + cornerHeight(sampler, x + 1, y + 1)) / 4;
}

function nearWater(sampler: Sampler, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && sampler(x + dx, y + dy) === 3) return true;
  return false;
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
};

/**
 * Builds a flat-shaded terrain geometry. Water tiles are left as holes (the shared world water plane shows through),
 * land corners adjacent to water dip below WATER_LEVEL so coastlines read naturally.
 */
export function buildTerrainGeometry(o: TerrainBuildOpts): THREE.BufferGeometry | null {
  const { ox, oz, w, h, step, sampler, palette } = o;
  const sxz = o.scaleXZ ?? 1;
  const sy = o.scaleY ?? 1;
  const qw = Math.ceil(w / step);
  const qh = Math.ceil(h / step);
  const positions = new Float32Array(qw * qh * 18);
  const colors = new Float32Array(qw * qh * 18);
  let p = 0;
  const tmp = new THREE.Color();
  const tri = new THREE.Color();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();

  const pushTri = (v0: number[], v1: number[], v2: number[], base: THREE.Color, t: number, avgH: number) => {
    a.set(v0[0], v0[1], v0[2]);
    b.set(v1[0], v1[1], v1[2]);
    c.set(v2[0], v2[1], v2[2]);
    n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    const slope = Math.max(0, 1 - n.y); // 0 flat … 1 vertical
    tri.copy(base);
    if (t === 2) {
      tri.lerp(palette.rock, Math.min(1, slope * 1.6));
      if (avgH > 2.35) tri.lerp(palette.snow, Math.min(1, (avgH - 2.35) * 1.4));
    } else if (slope > 0.12) tri.multiplyScalar(1 - Math.min(0.35, slope * 0.6));
    for (const v of [v0, v1, v2]) {
      positions[p] = v[0] * sxz;
      positions[p + 1] = v[1] * sy;
      positions[p + 2] = v[2] * sxz;
      colors[p] = tri.r;
      colors[p + 1] = tri.g;
      colors[p + 2] = tri.b;
      p += 3;
    }
  };

  for (let qz = 0; qz < qh; qz++) {
    for (let qx = 0; qx < qw; qx++) {
      const gx = ox + qx * step;
      const gz = oz + qz * step;
      const t = blockCode(sampler, gx, gz, step);
      if (t < 0 || t === 3) continue;
      const x1 = gx + step;
      const z1 = gz + step;
      const h00 = cornerHeight(sampler, gx, gz);
      const h10 = cornerHeight(sampler, x1, gz);
      const h01 = cornerHeight(sampler, gx, z1);
      const h11 = cornerHeight(sampler, x1, z1);
      const avgH = (h00 + h10 + h01 + h11) / 4;
      const base = t === 2 ? palette.mountain : t === 1 ? palette.forest : palette.plain;
      // per-tile grain + larger patches so plains read as meadows instead of a flat checkerboard
      const patch = hash2(Math.floor(gx / 6) * 17, Math.floor(gz / 6) * 29) - 0.5;
      const shade = 0.9 + 0.18 * hash2(gx * 3, gz * 5) + 0.12 * patch;
      tmp.copy(base).multiplyScalar(shade);
      if (t === 0) tmp.offsetHSL(0.02 * patch, 0.1 * patch, 0);
      if (t === 0 && step <= 2 && nearWater(sampler, gx, gz)) tmp.lerp(palette.sand, 0.55);
      if (t === 1 && step > 1) tmp.multiplyScalar(0.92);
      // two triangles, alternate diagonal for a hand-made low-poly feel
      if (hash2(gx, gz) > 0.5) {
        pushTri([gx, h00, gz], [gx, h01, z1], [x1, h10, gz], tmp, t, avgH);
        pushTri([x1, h10, gz], [gx, h01, z1], [x1, h11, z1], tmp.clone().multiplyScalar(0.97), t, avgH);
      } else {
        pushTri([gx, h00, gz], [gx, h01, z1], [x1, h11, z1], tmp, t, avgH);
        pushTri([gx, h00, gz], [x1, h11, z1], [x1, h10, gz], tmp.clone().multiplyScalar(0.97), t, avgH);
      }
    }
  }
  if (p === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions.subarray(0, p), 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors.subarray(0, p), 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/** Tile outline grid following the relief (tactical reading at close zoom). Water tiles are skipped. */
export function buildGridGeometry(ox: number, oz: number, w: number, h: number, sampler: Sampler): THREE.BufferGeometry | null {
  const pts: number[] = [];
  const lift = 0.025;
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
