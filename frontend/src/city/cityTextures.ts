/**
 * Procedural "painted" detail textures for the village (grayscale luminance, tinted by material.color so one
 * texture serves many hues). Generated once per GL context as DataTextures — no asset loading, works on web + native.
 */
import * as THREE from "three";

function hash(ix: number, iy: number, seed = 0): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** value noise in [0,1], periodic on `period` cells (tileable) */
function vnoise(x: number, y: number, period: number, seed = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const w = (a: number) => ((a % period) + period) % period;
  const a = hash(w(ix), w(iy), seed);
  const b = hash(w(ix + 1), w(iy), seed);
  const c = hash(w(ix), w(iy + 1), seed);
  const d = hash(w(ix + 1), w(iy + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function fbm(u: number, v: number, base: number, oct = 3, seed = 0): number {
  let s = 0;
  let amp = 0.5;
  let f = base;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(u * f, v * f, f, seed + i);
    amp *= 0.5;
    f *= 2;
  }
  return s;
}

function make(size: number, fn: (u: number, v: number) => number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = Math.max(0, Math.min(1, fn((x + 0.5) / size, (y + 0.5) / size)));
      const i = (y * size + x) * 4;
      const c = Math.round(l * 255);
      data[i] = c;
      data[i + 1] = c;
      data[i + 2] = c;
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

export type CityTextures = { planks: THREE.DataTexture; tiles: THREE.DataTexture; plaster: THREE.DataTexture; thatch: THREE.DataTexture; cobble: THREE.DataTexture; grass: THREE.DataTexture; stone: THREE.DataTexture; dispose: () => void };

export function makeCityTextures(): CityTextures {
  const planks = make(128, (u, v) => {
    const n = 5;
    const p = Math.floor(u * n);
    const f = u * n - p;
    if (f < 0.06) return 0.32;
    const grain = Math.sin(v * 46 + hash(p, 0) * 9 + fbm(u, v, 6, 2, 3) * 6) * 0.05;
    return 0.72 + hash(p, 1) * 0.16 + grain + (fbm(u * 4, v, 8, 2, 4) - 0.5) * 0.1;
  });
  const tiles = make(128, (u, v) => {
    const rows = 6;
    const r = Math.floor(v * rows);
    const fy = v * rows - r;
    const col = u * 6 + (r % 2) * 0.5;
    const c = Math.floor(col);
    const fx = col - c;
    // scalloped lower edge of each tile row + soft seam between tiles + gentle shading under the row above
    const curve = 0.14 * (1 - Math.pow((fx - 0.5) * 2, 2));
    if (fy < curve) return 0.52 + fy * 0.9;
    if (Math.abs(fx - 0.5) > 0.47) return 0.56;
    return 0.66 + (1 - fy) * 0.16 + hash(c, r) * 0.1 + (fbm(u, v, 12, 2, 7) - 0.5) * 0.06;
  });
  const plaster = make(128, (u, v) => {
    let l = 0.86 + (fbm(u, v, 6, 3, 11) - 0.5) * 0.14;
    if (v < 0.28) l -= (0.28 - v) * 0.9; // dirt / damp at the base
    return l;
  });
  const thatch = make(128, (u, v) => 0.62 + (fbm(u * 10, v, 4, 2, 21) - 0.5) * 0.32 + Math.sin(u * 160 + fbm(u, v, 6, 2, 22) * 9) * 0.07 + (v > 0.9 ? -0.15 : 0));
  const cobble = make(128, (u, v) => {
    const n = 6;
    const px = u * n;
    const py = v * n;
    const cx = Math.floor(px);
    const cy = Math.floor(py);
    let d1 = 9;
    let d2 = 9;
    let id = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const gx = cx + ox;
        const gy = cy + oy;
        const jx = gx + 0.25 + hash(((gx % n) + n) % n, ((gy % n) + n) % n, 31) * 0.5;
        const jy = gy + 0.25 + hash(((gx % n) + n) % n, ((gy % n) + n) % n, 32) * 0.5;
        const d = Math.hypot(px - jx, py - jy);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          id = gx * 7 + gy * 13;
        } else if (d < d2) d2 = d;
      }
    }
    const edge = d2 - d1;
    if (edge < 0.07) return 0.5 + edge * 1.5; // soft sandy joints
    return 0.66 + hash(id, 0, 33) * 0.2 - d1 * 0.18 + (fbm(u, v, 12, 2, 34) - 0.5) * 0.08;
  });
  const grass = make(256, (u, v) => {
    let l = 0.74 + (fbm(u, v, 4, 3, 41) - 0.5) * 0.34;
    l += (fbm(u, v, 24, 2, 42) - 0.5) * 0.12;
    if (hash(Math.floor(u * 256), Math.floor(v * 256), 43) > 0.988) l += 0.18; // light blades
    return l;
  });
  // fieldstone: large irregular stones (jittered cells), soft joints, gentle rounded shading — natural, not a brick grid
  const stone = make(128, (u, v) => {
    const nx = 3;
    const ny = 4;
    const px = u * nx;
    const py = v * ny;
    const cx = Math.floor(px);
    const cy = Math.floor(py);
    let d1 = 9;
    let d2 = 9;
    let id = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const gx = cx + ox;
        const gy = cy + oy;
        const wx = ((gx % nx) + nx) % nx;
        const wy = ((gy % ny) + ny) % ny;
        const jx = gx + 0.2 + hash(wx, wy, 51) * 0.6;
        const jy = gy + 0.2 + hash(wx, wy, 52) * 0.6;
        // stretched metric → stones wider than tall (ashlar-like courses)
        const d = Math.hypot((px - jx) * 0.7, (py - jy) * 1.15);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          id = wx * 7 + wy * 13;
        } else if (d < d2) d2 = d;
      }
    }
    const edge = d2 - d1;
    const joint = 0.06;
    const base = 0.78 + hash(id, 1, 53) * 0.14 + (fbm(u, v, 10, 2, 54) - 0.5) * 0.1 - d1 * 0.12;
    if (edge < joint) return 0.6 + (edge / joint) * 0.12;
    return base;
  });
  return {
    planks,
    tiles,
    plaster,
    thatch,
    cobble,
    grass,
    stone,
    dispose: () => [planks, tiles, plaster, thatch, cobble, grass, stone].forEach((t) => t.dispose()),
  };
}
