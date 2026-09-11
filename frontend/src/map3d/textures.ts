/**
 * Procedural, tileable textures generated on the CPU once per engine (no asset downloads; identical on Android and web).
 *  - detail atlas (RGBA data): R grass/soil grain, G ridged rock, B fine grain → sampled by the terrain shader
 *  - stone blocks (sRGB colour): sandstone / granite courses with mortar, per-block tone and grain → castles & Pyramid
 *  - roof tiles (sRGB colour): overlapping tile rows → castle roofs
 * Value noise is periodic on a lattice whose period divides the texture size, so every texture wraps seamlessly.
 */
import * as THREE from "three";

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Periodic value noise: `period` lattice cells across the texture (must divide `size`). Returns 0..1 per pixel. */
function periodicNoise(size: number, period: number, seed: number): Float32Array {
  const out = new Float32Array(size * size);
  const cell = size / period;
  for (let y = 0; y < size; y++) {
    const gy = Math.floor(y / cell);
    let fy = (y - gy * cell) / cell;
    fy = fy * fy * (3 - 2 * fy);
    for (let x = 0; x < size; x++) {
      const gx = Math.floor(x / cell);
      let fx = (x - gx * cell) / cell;
      fx = fx * fx * (3 - 2 * fx);
      const a = hash(gx % period, gy % period, seed);
      const b = hash((gx + 1) % period, gy % period, seed);
      const c = hash(gx % period, (gy + 1) % period, seed);
      const d = hash((gx + 1) % period, (gy + 1) % period, seed);
      out[y * size + x] = (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
    }
  }
  return out;
}

/** Fractal sum of periodic noise (normalised 0..1). `ridged` folds the octaves into sharp crests (rock). */
function fbm(size: number, basePeriod: number, octaves: number, seed: number, ridged = false): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const period = Math.min(size, basePeriod << o);
    const n = periodicNoise(size, period, seed + o * 17);
    for (let i = 0; i < out.length; i++) {
      const v = ridged ? 1 - Math.abs(n[i] * 2 - 1) : n[i];
      out[i] += (ridged ? v * v : v) * amp;
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function dataTexture(data: Uint8Array, size: number, color: boolean): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Terrain detail atlas: R grass/soil, G ridged rock, B fine grain. */
export function makeDetailTexture(size = 256): THREE.DataTexture {
  const grass = fbm(size, 8, 5, 11);
  const rock = fbm(size, 4, 5, 23, true);
  const grain = fbm(size, 32, 3, 37);
  // blades: high-frequency noise stretched vertically, breaks the "cloudy" look of plain fbm
  const blades = periodicNoise(size, 64, 41);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const g = grass[i] * 0.72 + blades[i] * 0.28;
    data[i * 4] = Math.round(g * 255);
    data[i * 4 + 1] = Math.round(rock[i] * 255);
    data[i * 4 + 2] = Math.round(grain[i] * 255);
    data[i * 4 + 3] = 255;
  }
  return dataTexture(data, size, false);
}

/**
 * Stone courses: `rows` courses of blocks with a half-block stagger, dark mortar, per-block tone, chipped edges and
 * grain. Greyscale-ish (multiplied by the instance/skin colour in the material) — `tint` shifts the hue slightly.
 */
export function makeStoneTexture(size = 256, rows = 8, tint = 1.0): THREE.DataTexture {
  const grain = fbm(size, 16, 4, 53);
  const macro = fbm(size, 4, 3, 59);
  const data = new Uint8Array(size * size * 4);
  const rowH = size / rows;
  const blockW = rowH * 2;
  const cols = size / blockW;
  const mortar = Math.max(1.5, size * 0.012);
  for (let y = 0; y < size; y++) {
    const row = Math.floor(y / rowH);
    const ly = y - row * rowH;
    const stagger = row % 2 ? blockW / 2 : 0;
    for (let x = 0; x < size; x++) {
      const xs = (x + stagger) % size;
      const col = Math.floor(xs / blockW);
      const lx = xs - col * blockW;
      const i = y * size + x;
      const dEdge = Math.min(lx, blockW - lx, ly, rowH - ly);
      const tone = 0.78 + 0.34 * hash(col % cols, row, 71);
      // bevel: slightly lighter top-left, darker bottom-right of each block
      const bevel = 1 + ((ly < rowH * 0.25 ? 0.06 : 0) - (ly > rowH * 0.8 ? 0.07 : 0)) + (lx < blockW * 0.12 ? 0.04 : 0);
      let v = tone * bevel * (0.9 + 0.2 * grain[i]) * (0.94 + 0.12 * macro[i]);
      if (dEdge < mortar) v = 0.42 + 0.12 * grain[i] + Math.max(0, (mortar - dEdge) / mortar - 0.6) * 0.1;
      else if (dEdge < mortar * 2.2) v *= 0.86 + 0.14 * ((dEdge - mortar) / (mortar * 1.2));
      const c = Math.max(0, Math.min(1, v * 0.86));
      data[i * 4] = Math.round(c * 255 * Math.min(1, tint));
      data[i * 4 + 1] = Math.round(c * 255 * Math.min(1, tint * 0.985));
      data[i * 4 + 2] = Math.round(c * 255 * Math.min(1, tint * 0.95));
      data[i * 4 + 3] = 255;
    }
  }
  return dataTexture(data, size, true);
}

/** Roof tiles: overlapping rounded rows with a shadow under each course and per-tile tone. */
export function makeRoofTexture(size = 128, rows = 8): THREE.DataTexture {
  const grain = fbm(size, 16, 3, 83);
  const data = new Uint8Array(size * size * 4);
  const rowH = size / rows;
  const tileW = rowH * 1.4;
  for (let y = 0; y < size; y++) {
    const row = Math.floor(y / rowH);
    const ly = (y - row * rowH) / rowH;
    const stagger = row % 2 ? tileW / 2 : 0;
    for (let x = 0; x < size; x++) {
      const xs = (x + stagger) % size;
      const col = Math.floor(xs / tileW);
      const lx = (xs - col * tileW) / tileW;
      const i = y * size + x;
      const curve = 1 - Math.pow(Math.abs(lx - 0.5) * 2, 2) * 0.35; // rounded tile profile
      const shade = 0.6 + 0.4 * Math.min(1, ly * 2.2); // shadow under the course above
      const tone = 0.82 + 0.3 * hash(col, row, 91);
      const v = Math.max(0, Math.min(1, curve * shade * tone * (0.92 + 0.16 * grain[i]) * 0.9));
      data[i * 4] = Math.round(v * 255);
      data[i * 4 + 1] = Math.round(v * 240);
      data[i * 4 + 2] = Math.round(v * 225);
      data[i * 4 + 3] = 255;
    }
  }
  return dataTexture(data, size, true);
}
