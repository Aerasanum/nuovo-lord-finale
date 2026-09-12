/**
 * Procedural 3D village for the City tab — vivid "storybook" look (Game-of-Warriors style): saturated palette,
 * teal/blue/red tiled roofs with curved eaves and overhangs, half-timbered plaster houses with glowing windows,
 * shutters and flower boxes, cobbled ring roads, lush lumpy trees, softly bevelled stone walls with battlements and
 * flags, rolling meadows beyond the walls. Every block is a rounded box (no razor edges), roofs are puffy gables or
 * curved "witch hats", stone is large irregular fieldstone. The castle in the middle is the same rig the world map
 * draws. Everything static is merged per material (≈25 draw calls); windmill, crystal, boat and flags stay animated.
 * Layout is deterministic per settlement, buildings grow through three tiers (L1-9, L10-19, L20-30), unlocked-but-
 * unbuilt buildings are vacant lots with a sign, and the whole town follows the settlement level.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { CrestDto, SettlementPublic } from "@/src/api/hooks";

import { hat, settlementScale } from "../map3d/castle";
import { disposeGroup, type EntityFactory } from "../map3d/entities";
import type { SmokeEmitter } from "../map3d/smoke";
import { type CityTextures, makeCityTextures } from "./cityTextures";

export type VillageInput = {
  settlementId: string;
  level: number;
  buildings: Record<string, number>;
  /** buildings the Player may build now (unlocked) — unbuilt ones become vacant lots */
  unlocked: string[];
  wallLevel: number;
  skin: string;
  crest: CrestDto | null;
  portEligible: boolean;
  terrain: string;
};

export type VillageAnchor = { name: string; x: number; z: number; r: number; level: number };
export type Waypoint = { x: number; z: number; kind: "door" | "ring" | "gate" | "market" | "wall" | "farm" };
export type Village = {
  group: THREE.Group;
  anchors: VillageAnchor[];
  emitters: SmokeEmitter[];
  waypoints: Waypoint[];
  ring: number;
  wallR: number;
  gate: { x: number; z: number };
  farm: { x: number; z: number } | null;
  animated: { windmills: THREE.Object3D[]; crystal: THREE.Object3D | null; boat: THREE.Object3D | null; flags: THREE.Mesh[] };
  nightMats: THREE.MeshStandardMaterial[];
  pickables: THREE.Object3D[];
  dispose: () => void;
};

// ------------------------------------------------------------------------------------------------ palette / materials
type MatKey =
  | "stone" | "stoneDark" | "timber" | "timberLight" | "plaster" | "plasterWarm" | "plasterRose"
  | "roofTeal" | "roofBlue" | "roofRed" | "roofPurple" | "roofSlate" | "thatch"
  | "cobble" | "dirt" | "grass" | "field" | "water" | "metal" | "gold" | "window" | "lantern"
  | "cloth" | "clothRed" | "clothBlue" | "leaf" | "leafLight" | "leafDark" | "trunk" | "rock" | "clay" | "dark" | "cream" | "sand"
  | "flowerRed" | "flowerYellow" | "flowerBlue" | "hay" | "crystal" | "wool";

type Tex = keyof Omit<CityTextures, "dispose">;
const PALETTE: Record<MatKey, { c: string; tex?: Tex; rough?: number; metal?: number; emissive?: string; e?: number; alpha?: number }> = {
  stone: { c: "#bdb3a4", tex: "stone" },
  stoneDark: { c: "#8f867a", tex: "stone" },
  timber: { c: "#6b4527", tex: "planks" },
  timberLight: { c: "#b07a45", tex: "planks" },
  plaster: { c: "#fbf1da", tex: "plaster" },
  plasterWarm: { c: "#f6dcae", tex: "plaster" },
  plasterRose: { c: "#f7d3c0", tex: "plaster" },
  roofTeal: { c: "#2fb5a8", tex: "tiles" },
  roofBlue: { c: "#3f86dc", tex: "tiles" },
  roofRed: { c: "#e2573b", tex: "tiles" },
  roofPurple: { c: "#8a5fd3", tex: "tiles" },
  roofSlate: { c: "#6a7690", tex: "tiles" },
  thatch: { c: "#d9ae4f", tex: "thatch" },
  cobble: { c: "#c8b48f", tex: "cobble" },
  dirt: { c: "#b8905a", tex: "grass" },
  grass: { c: "#68bb42", tex: "grass" },
  field: { c: "#d8bd52", tex: "thatch" },
  water: { c: "#3a9be0", rough: 0.15, alpha: 0.85 },
  metal: { c: "#9aa2b0", rough: 0.4, metal: 0.65 },
  gold: { c: "#f5c142", rough: 0.3, metal: 0.75, emissive: "#8a5a10", e: 0.2 },
  window: { c: "#ffd98a", emissive: "#ffb84a", e: 0.0 },
  lantern: { c: "#ffe5a8", emissive: "#ffb347", e: 0.0 },
  cloth: { c: "#d33d2e" },
  clothRed: { c: "#d33d2e" },
  clothBlue: { c: "#2f7fd6" },
  leaf: { c: "#46ad3e" },
  leafLight: { c: "#78cc4c" },
  leafDark: { c: "#2f8a3c" },
  trunk: { c: "#7a5231", tex: "planks" },
  rock: { c: "#9c968c", tex: "stone" },
  clay: { c: "#c9744a" },
  dark: { c: "#3a2f28" },
  cream: { c: "#f8f0dc", tex: "plaster" },
  sand: { c: "#e6d39d" },
  flowerRed: { c: "#f25566", emissive: "#5a1020", e: 0.15 },
  flowerYellow: { c: "#fadd52", emissive: "#5a4a10", e: 0.15 },
  flowerBlue: { c: "#6a98f2", emissive: "#10205a", e: 0.15 },
  hay: { c: "#e5c463", tex: "thatch" },
  crystal: { c: "#8fd3ff", emissive: "#4aa3ff", e: 0.9, rough: 0.2, alpha: 0.9 },
  wool: { c: "#f7f2e8" },
};
/** flat ground dressing: never casts shadows */
const FLAT: MatKey[] = ["cobble", "dirt", "grass", "field", "water", "sand"];

let sharedTex: CityTextures | null = null;
function textures(): CityTextures {
  return (sharedTex ??= makeCityTextures());
}

function makeMaterials(faction: THREE.Color, terrain: THREE.Color): Record<MatKey, THREE.MeshStandardMaterial> {
  const tx = textures();
  const out = {} as Record<MatKey, THREE.MeshStandardMaterial>;
  for (const k of Object.keys(PALETTE) as MatKey[]) {
    const p = PALETTE[k];
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(p.c), roughness: p.rough ?? 0.78, metalness: p.metal ?? 0.0 });
    if (p.tex) m.map = tx[p.tex];
    if (p.emissive) {
      m.emissive = new THREE.Color(p.emissive);
      m.emissiveIntensity = p.e ?? 0;
    }
    if (p.alpha !== undefined) {
      m.transparent = true;
      m.opacity = p.alpha;
    }
    if (k === "cloth") m.color.copy(faction);
    if (k === "grass") {
      m.color.copy(terrain).lerp(new THREE.Color(p.c), 0.7); // theme terrain, pushed toward lush storybook green
      m.vertexColors = true; // meadow: per-vertex tone/hue variation baked by `meadow()`
    }
    m.userData.shared = true;
    out[k] = m;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ noise / meadow
function hash2(x: number, y: number): number {
  let h = (Math.round(x * 1000) * 374761393 + Math.round(y * 1000) * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise2(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function fbm2(x: number, y: number, oct = 3): number {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise2(x * f + i * 17.3, y * f - i * 9.1);
    amp *= 0.5;
    f *= 2;
  }
  return s;
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Height of the meadow: flat inside the walls, rolling hills beyond them, rising rim at the far edge. */
function makeGroundFn(wallR: number, outer: number) {
  return (x: number, z: number): number => {
    const r = Math.hypot(x, z);
    // the paved road leaving the gate (+z) stays level until it fades into the meadow
    const onRoad = z > 0 ? (1 - smooth(0.7, 1.6, Math.abs(x))) * (1 - smooth(wallR + 2.2, wallR + 4.2, r)) : 0;
    const roll = smooth(wallR + 0.5, wallR + 3.2, r) * (1 - onRoad);
    const rim = smooth(outer - 4.5, outer, r);
    const n = fbm2(x * 0.32 + 5, z * 0.32 - 3, 3);
    return roll * (0.12 + n * 1.1) + rim * (1.6 + n * 0.8);
  };
}

/** Undulating meadow disc with baked vertex colours (tone + slight hue drift, worn ground near the roads). */
function meadow(outer: number, groundY: (x: number, z: number) => number, ring: number, wallR: number, mat: THREE.MeshStandardMaterial): THREE.Mesh {
  const g = new THREE.RingGeometry(0.02, outer, 96, 30);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, groundY(x, z));
    uv.setXY(i, x * 1.6, z * 1.6);
    const r = Math.hypot(x, z);
    const n = fbm2(x * 0.5 + 11, z * 0.5 + 7, 3);
    const n2 = fbm2(x * 1.7 + 3, z * 1.7 - 5, 2);
    // patches: sunlit yellow-green vs deeper blue-green, plus fine mottling; worn dirt along the ring road and the gate path
    let rr = 0.78 + n * 0.5 + (n2 - 0.5) * 0.12;
    let gg = 0.9 + n * 0.22 + (n2 - 0.5) * 0.08;
    let bb = 0.7 + (1 - n) * 0.4;
    const road = Math.max(1 - Math.abs(r - ring) / 0.55, 1 - Math.abs(r - wallR) / 0.9, x > -0.7 && x < 0.7 && z > 0 && z < wallR + 2.5 ? 0.6 : 0) * 0.35;
    rr = rr * (1 - road) + 1.05 * road;
    gg = gg * (1 - road) + 0.9 * road;
    bb = bb * (1 - road) + 0.7 * road;
    const far = smooth(wallR + 0.5, outer, r) * 0.1; // slightly cooler/lighter towards the horizon
    col[i * 3] = rr - far * 0.2;
    col[i * 3 + 1] = gg;
    col[i * 3 + 2] = bb + far;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}

// ------------------------------------------------------------------------------------------------ geometry helpers
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);

/** Gable roof prism with a gentle convex bulge on both slopes ("puffy" storybook roof): ridge along local x, base on
 * y=0, footprint w×d, height h; UVs tile the slopes. */
function gable(w: number, d: number, h: number): THREE.BufferGeometry {
  const hw = w / 2;
  const hd = d / 2;
  const bulge = h * 0.12;
  const ru = Math.max(1, Math.round(w * 2.2));
  const v: number[] = [];
  const uv: number[] = [];
  // each slope = 2 quads (eave→mid, mid→ridge) so the middle can bulge outwards
  const slope = (sz: number) => {
    const rows: [number, number, number][] = [
      [0, sz * hd, 0],
      [h * 0.5 + bulge, sz * (hd * 0.5 + bulge * 0.6), 0.5],
      [h, 0, 1],
    ];
    for (let i = 0; i < 2; i++) {
      const [y0, z0, t0] = rows[i];
      const [y1, z1, t1] = rows[i + 1];
      // two triangles, wound so the normal points outward (+z for sz > 0)
      if (sz > 0) {
        v.push(-hw, y0, z0, hw, y0, z0, hw, y1, z1, -hw, y0, z0, hw, y1, z1, -hw, y1, z1);
      } else {
        v.push(hw, y0, z0, -hw, y0, z0, -hw, y1, z1, hw, y0, z0, -hw, y1, z1, hw, y1, z1);
      }
      uv.push(0, t0, ru, t0, ru, t1, 0, t0, ru, t1, 0, t1);
    }
  };
  slope(1);
  slope(-1);
  // gable ends (triangles with the bulge as a 5-gon: eave-left, mid-left, ridge, mid-right, eave-right)
  const midZ = hd * 0.5 + bulge * 0.6;
  const midY = h * 0.5 + bulge;
  for (const sx of [-1, 1]) {
    const x = sx * hw;
    const pts: [number, number][] = [
      [0, hd],
      [midY, midZ],
      [h, 0],
      [midY, -midZ],
      [0, -hd],
    ];
    for (let i = 1; i < pts.length - 1; i++) {
      const tri = [pts[0], pts[i], pts[i + 1]];
      if (sx > 0) tri.reverse();
      for (const [y, z] of tri) {
        v.push(x, y, z);
        uv.push((z + hd) / d, y / h);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Lumpy organic blob (jittered icosahedron) for canopies, bushes and boulders. */
function blobGeo(r: number, seed: number, amount = 0.14): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const k = 1 + (hash2(seed * 3.1 + pos.getX(i) * 7, pos.getY(i) * 5 + pos.getZ(i) * 11) - 0.5) * 2 * amount;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

class Parts {
  private geos: Partial<Record<MatKey, THREE.BufferGeometry[]>> = {};
  private frame = new THREE.Matrix4();
  begin(x: number, z: number, rotY: number, y = 0) {
    this.frame.compose(_p.set(x, y, z), _q.setFromAxisAngle(Y, rotY), _s.set(1, 1, 1));
  }
  private put(key: MatKey, src: THREE.BufferGeometry, x: number, y: number, z: number, rotY: number, sx = 1, sy = 1, sz = 1, uvScale = 1) {
    let geo = src;
    if (src.index) {
      geo = src.toNonIndexed();
      src.dispose();
    }
    if (uvScale !== 1) {
      const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale, uv.getY(i) * uvScale);
    }
    _m.compose(_p.set(x, y, z), _q.setFromAxisAngle(Y, rotY), _s.set(sx, sy, sz));
    geo.applyMatrix4(_m);
    geo.applyMatrix4(this.frame);
    (this.geos[key] ??= []).push(geo);
  }
  /** Block: softly bevelled when it is big enough to read as a volume, plain when it is a thin beam/frame. */
  private block(w: number, h: number, d: number): THREE.BufferGeometry {
    const m = Math.min(w, h, d);
    if (m < 0.07) return new THREE.BoxGeometry(w, h, d);
    return new RoundedBoxGeometry(w, h, d, 1, Math.min(0.035, m * 0.22));
  }
  box(key: MatKey, w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0, uv = 1) {
    this.put(key, this.block(w, h, d), x, y + h / 2, z, rotY, 1, 1, 1, uv);
  }
  /** box rotated around its centre on x/z as well (for braces / lids) */
  boxR(key: MatKey, w: number, h: number, d: number, x: number, y: number, z: number, rx: number, ry: number, rz: number) {
    const g = this.block(w, h, d);
    g.rotateX(rx);
    g.rotateY(ry);
    g.rotateZ(rz);
    this.put(key, g, x, y, z, 0);
  }
  cyl(key: MatKey, rt: number, rb: number, h: number, x: number, y: number, z: number, seg = 10, rotY = 0, uv = 1) {
    this.put(key, new THREE.CylinderGeometry(rt, rb, h, Math.max(seg, rt > 0.08 ? 16 : seg)), x, y + h / 2, z, rotY, 1, 1, 1, uv);
  }
  /** cylinder lying along local x */
  cylX(key: MatKey, r: number, len: number, x: number, y: number, z: number, seg = 8, rotY = 0) {
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    g.rotateZ(Math.PI / 2);
    this.put(key, g, x, y, z, rotY);
  }
  /** Cone; roof materials get the curved "witch hat" profile instead of a straight cone. */
  cone(key: MatKey, r: number, h: number, x: number, y: number, z: number, seg = 10, rotY = 0) {
    const roofy = key.startsWith("roof") || key === "thatch";
    this.put(key, roofy ? hat(r, h, Math.max(seg, 12)) : new THREE.ConeGeometry(r, h, seg), x, y + h / 2, z, rotY);
  }
  sphere(key: MatKey, r: number, x: number, y: number, z: number, sy = 1, hemi = false) {
    this.put(key, hemi ? new THREE.SphereGeometry(r, 14, 9, 0, Math.PI * 2, 0, Math.PI / 2) : new THREE.SphereGeometry(r, 14, 10), x, y, z, 0, 1, sy, 1);
  }
  /** lumpy organic blob (canopy / bush / boulder) */
  blob(key: MatKey, r: number, x: number, y: number, z: number, seed = 0, sy = 1, amount = 0.14) {
    this.put(key, blobGeo(r, seed, amount), x, y, z, 0, 1, sy, 1);
  }
  gable(key: MatKey, w: number, d: number, h: number, x: number, y: number, z: number, rotY = 0) {
    this.put(key, gable(w, d, h), x, y, z, rotY);
  }
  disc(key: MatKey, r: number, x: number, z: number, y = 0.004, seg = 24, inner = 0, uv = 1) {
    const g = inner > 0 ? new THREE.RingGeometry(inner, r, seg) : new THREE.CircleGeometry(r, seg);
    g.rotateX(-Math.PI / 2);
    this.put(key, g, x, y, z, 0, 1, 1, 1, uv);
  }
  plane(key: MatKey, w: number, d: number, x: number, z: number, rotY = 0, y = 0.005, uv = 1) {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    this.put(key, g, x, y, z, rotY, 1, 1, 1, uv);
  }

  // ---------- compound props
  window(x: number, y: number, z: number, rotY: number, w = 0.09, h = 0.1, shutters: MatKey | null = "roofTeal") {
    const fx = Math.sin(rotY);
    const fz = Math.cos(rotY);
    const rx = Math.cos(rotY);
    const rz = -Math.sin(rotY);
    this.box("timber", w + 0.03, h + 0.03, 0.02, x, y - 0.015, z, rotY);
    this.box("window", w, h, 0.03, x + fx * 0.006, y, z + fz * 0.006, rotY);
    this.box("timber", 0.012, h, 0.035, x + fx * 0.008, y, z + fz * 0.008, rotY); // mullion
    if (shutters) {
      this.box(shutters, 0.035, h, 0.015, x + rx * (w / 2 + 0.03), y, z + rz * (w / 2 + 0.03), rotY);
      this.box(shutters, 0.035, h, 0.015, x - rx * (w / 2 + 0.03), y, z - rz * (w / 2 + 0.03), rotY);
    }
    // sill + flower box
    this.box("timberLight", w + 0.06, 0.02, 0.05, x + fx * 0.015, y - 0.015, z + fz * 0.015, rotY);
  }
  flowerBox(x: number, y: number, z: number, rotY: number, w = 0.1) {
    const fx = Math.sin(rotY);
    const fz = Math.cos(rotY);
    const rx = Math.cos(rotY);
    const rz = -Math.sin(rotY);
    this.box("timberLight", w, 0.035, 0.04, x + fx * 0.02, y, z + fz * 0.02, rotY);
    this.sphere("leafLight", 0.03, x + fx * 0.02, y + 0.045, z + fz * 0.02, 0.8);
    this.sphere("flowerRed", 0.014, x + fx * 0.025 + rx * 0.025, y + 0.06, z + fz * 0.025 + rz * 0.025);
    this.sphere("flowerYellow", 0.014, x + fx * 0.025 - rx * 0.025, y + 0.06, z + fz * 0.025 - rz * 0.025);
  }
  door(x: number, y: number, z: number, rotY: number, w = 0.12, h = 0.2, frame: MatKey = "stone") {
    const fx = Math.sin(rotY);
    const fz = Math.cos(rotY);
    this.box(frame, w + 0.05, h + 0.03, 0.025, x, y, z, rotY);
    this.box("timber", w, h - w / 2, 0.035, x + fx * 0.004, y, z + fz * 0.004, rotY);
    const arch = new THREE.CylinderGeometry(w / 2, w / 2, 0.035, 10, 1, false, 0, Math.PI);
    arch.rotateX(Math.PI / 2);
    arch.rotateY(rotY);
    this.put("timber", arch, x + fx * 0.004, y + h - w / 2, z + fz * 0.004, 0);
    this.sphere("gold", 0.012, x + fx * 0.03 + Math.cos(rotY) * 0.035, y + h * 0.45, z + fz * 0.03 - Math.sin(rotY) * 0.035);
  }
  lantern(x: number, z: number, h = 0.32) {
    this.box("timber", 0.025, h, 0.025, x, 0, z);
    this.box("timber", 0.08, 0.02, 0.02, x + 0.03, h - 0.02, z);
    this.box("dark", 0.05, 0.06, 0.05, x + 0.06, h - 0.1, z);
    this.sphere("lantern", 0.022, x + 0.06, h - 0.07, z);
  }
  barrel(x: number, z: number, s = 1, y = 0) {
    this.cyl("timberLight", 0.045 * s, 0.05 * s, 0.1 * s, x, y, z, 10);
    this.cyl("metal", 0.052 * s, 0.052 * s, 0.012, x, y + 0.02 * s, z, 10);
    this.cyl("metal", 0.052 * s, 0.052 * s, 0.012, x, y + 0.07 * s, z, 10);
  }
  crate(x: number, z: number, s = 1, rot = 0, y = 0) {
    this.box("timberLight", 0.1 * s, 0.1 * s, 0.1 * s, x, y, z, rot);
    this.box("timber", 0.104 * s, 0.014, 0.104 * s, x, y + 0.043 * s, z, rot);
  }
  hay(x: number, z: number, s = 1) {
    this.cone("hay", 0.09 * s, 0.14 * s, x, 0, z, 9);
    this.cyl("hay", 0.06 * s, 0.09 * s, 0.03, x, 0, z, 9);
  }
  bush(x: number, z: number, s = 1, key: MatKey = "leaf") {
    this.blob(key, 0.09 * s, x, 0.06 * s, z, 3, 0.75);
    this.blob("leafLight", 0.06 * s, x + 0.05 * s, 0.07 * s, z + 0.02 * s, 4, 0.75);
  }
  flowers(x: number, z: number, n = 5, seed = 1) {
    const keys: MatKey[] = ["flowerRed", "flowerYellow", "flowerBlue"];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + seed;
      const r = 0.05 + ((i * 7 + seed) % 5) * 0.012;
      this.box("leafLight", 0.008, 0.035, 0.008, x + Math.cos(a) * r, 0, z + Math.sin(a) * r);
      this.sphere(keys[(i + seed) % 3], 0.014, x + Math.cos(a) * r, 0.04, z + Math.sin(a) * r);
    }
  }
  /** Lumpy broadleaf: forked trunk + four overlapping canopy blobs in three greens. */
  treeRound(x: number, z: number, s = 1, seed = 0) {
    this.cyl("trunk", 0.035 * s, 0.055 * s, 0.28 * s, x, 0, z, 7);
    this.boxR("trunk", 0.03 * s, 0.14 * s, 0.03 * s, x + 0.06 * s, 0.3 * s, z, 0, 0, -0.7);
    this.blob("leaf", 0.2 * s, x, 0.4 * s, z, seed + 1, 0.92);
    this.blob("leafLight", 0.14 * s, x + 0.11 * s * Math.cos(seed), 0.48 * s, z + 0.11 * s * Math.sin(seed), seed + 2, 0.92);
    this.blob("leafDark", 0.13 * s, x - 0.12 * s * Math.cos(seed + 1), 0.32 * s, z - 0.09 * s * Math.sin(seed + 1), seed + 3, 0.92);
    this.blob("leafLight", 0.09 * s, x, 0.58 * s, z, seed + 4, 0.92);
  }
  /** Conifer: three flared, slightly irregular tiers. */
  pine(x: number, z: number, s = 1) {
    this.cyl("trunk", 0.03 * s, 0.05 * s, 0.22 * s, x, 0, z, 6);
    this.put("leafDark", hat(0.19 * s, 0.32 * s, 9), x, 0.16 * s + 0.16 * s, z, 0.3);
    this.put("leaf", hat(0.15 * s, 0.3 * s, 9), x, 0.34 * s + 0.15 * s, z, 0.9);
    this.put("leafLight", hat(0.1 * s, 0.24 * s, 9), x, 0.52 * s + 0.12 * s, z, 1.6);
  }
  /** Boulder: lumpy blob, flattened, half sunk. */
  boulder(x: number, z: number, r: number, seed = 0, y = 0) {
    this.blob("rock", r, x, y + r * 0.25, z, seed, 0.62, 0.2);
  }
  fence(x0: number, z0: number, x1: number, z1: number, h = 0.1) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(2, Math.round(len / 0.18));
    const rot = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.box("timberLight", 0.022, h, 0.022, x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t);
    }
    this.box("timberLight", 0.016, 0.016, len, (x0 + x1) / 2, h * 0.75, (z0 + z1) / 2, rot);
    this.box("timberLight", 0.016, 0.016, len, (x0 + x1) / 2, h * 0.4, (z0 + z1) / 2, rot);
  }
  well(x: number, z: number, s = 1) {
    this.cyl("stone", 0.11 * s, 0.12 * s, 0.12 * s, x, 0, z, 10);
    this.cyl("dark", 0.08 * s, 0.08 * s, 0.01, x, 0.12 * s, z, 10);
    this.box("timber", 0.025, 0.3 * s, 0.025, x - 0.11 * s, 0, z);
    this.box("timber", 0.025, 0.3 * s, 0.025, x + 0.11 * s, 0, z);
    this.gable("roofRed", 0.32 * s, 0.24 * s, 0.1 * s, x, 0.3 * s, z);
    this.cylX("timberLight", 0.015, 0.22 * s, x, 0.24 * s, z, 6);
    this.barrel(x, z, 0.5 * s, 0.13 * s);
  }
  cart(x: number, z: number, rot: number, s = 1, load: MatKey = "hay") {
    this.box("timberLight", 0.18 * s, 0.07 * s, 0.11 * s, x, 0.07 * s, z, rot);
    this.box(load, 0.15 * s, 0.06 * s, 0.09 * s, x, 0.14 * s, z, rot);
    const rx = Math.cos(rot);
    const rz = -Math.sin(rot);
    this.cyl("timber", 0.045 * s, 0.045 * s, 0.02, x + rx * 0.07 * s, 0.025 * s, z + rz * 0.07 * s, 10, rot + Math.PI / 2);
    this.cyl("timber", 0.045 * s, 0.045 * s, 0.02, x - rx * 0.07 * s, 0.025 * s, z - rz * 0.07 * s, 10, rot + Math.PI / 2);
    this.box("timber", 0.02, 0.02, 0.16 * s, x + Math.sin(rot) * 0.15 * s, 0.06 * s, z + Math.cos(rot) * 0.15 * s, rot);
  }
  bannerPole(x: number, z: number, h: number, cloth: MatKey = "cloth") {
    this.box("timber", 0.022, h, 0.022, x, 0, z);
    this.sphere("gold", 0.02, x, h + 0.01, z);
    this.box(cloth, 0.13, 0.1, 0.012, x + 0.07, h - 0.13, z);
  }

  /** Painted-style house: plinth, textured plaster body with timber framing, arched door, shuttered windows,
   * overhanging tiled roof with ridge beam, chimney; tier 2 adds a jutting upper floor, tier 3 a dormer + lantern. */
  house(o: { w: number; d: number; h: number; x: number; z: number; rot: number; roof: MatKey; body?: MatKey; tier?: number; shutters?: MatKey | null; chimney?: boolean }) {
    const { w, d, h, x, z, rot } = o;
    const body = o.body ?? "plaster";
    const tier = o.tier ?? 1;
    const fx = Math.sin(rot);
    const fz = Math.cos(rot);
    const rx = Math.cos(rot);
    const rz = -Math.sin(rot);
    const shut = o.shutters === undefined ? (o.roof === "thatch" ? "roofTeal" : o.roof) : o.shutters;
    this.box("stoneDark", w + 0.06, 0.05, d + 0.06, x, 0, z, rot);
    this.box(body, w, h, d, x, 0.05, z, rot);
    // timber frame: corner posts + beams + braces on the facade
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box("timber", 0.03, h, 0.03, x + rx * sx * (w / 2) + fx * sz * (d / 2), 0.05, z + rz * sx * (w / 2) + fz * sz * (d / 2), rot);
    this.box("timber", w + 0.04, 0.028, d + 0.04, x, 0.05 + h * 0.5, z, rot);
    this.box("timber", w + 0.04, 0.028, d + 0.04, x, 0.05 + h - 0.028, z, rot);
    const dz = d / 2 + 0.002;
    this.boxR("timber", 0.025, h * 0.42, 0.02, x + fx * dz + rx * w * 0.3, 0.05 + h * 0.74, z + fz * dz + rz * w * 0.3, 0, rot, 0.6);
    this.boxR("timber", 0.025, h * 0.42, 0.02, x + fx * dz - rx * w * 0.3, 0.05 + h * 0.74, z + fz * dz - rz * w * 0.3, 0, rot, -0.6);
    // door + windows on the facade
    this.door(x + fx * dz, 0.05, z + fz * dz, rot, Math.min(0.13, w * 0.3), Math.min(0.22, h * 0.6));
    const wy = 0.05 + h * 0.62;
    if (w > 0.34) {
      this.window(x + fx * dz + rx * w * 0.3, wy, z + fz * dz + rz * w * 0.3, rot, 0.08, 0.09, shut);
      this.window(x + fx * dz - rx * w * 0.3, wy, z + fz * dz - rz * w * 0.3, rot, 0.08, 0.09, shut);
      if (tier >= 2) this.flowerBox(x + fx * dz + rx * w * 0.3, wy - 0.075, z + fz * dz + rz * w * 0.3, rot, 0.1);
    } else {
      this.window(x + fx * dz + rx * w * 0.28, wy, z + fz * dz + rz * w * 0.28, rot, 0.07, 0.08, shut);
    }
    // side windows
    const sxw = w / 2 + 0.002;
    this.window(x + rx * sxw, wy, z + rz * sxw, rot + Math.PI / 2, 0.07, 0.08, shut);
    this.window(x - rx * sxw, wy, z - rz * sxw, rot - Math.PI / 2, 0.07, 0.08, shut);
    // upper floor jut (tier 2+)
    let top = 0.05 + h;
    if (tier >= 2) {
      const jh = h * 0.45;
      this.box(body === "plaster" ? "plasterWarm" : body, w + 0.08, jh, d + 0.08, x, top, z, rot);
      this.box("timber", w + 0.12, 0.028, d + 0.12, x, top, z, rot);
      this.box("timber", w + 0.12, 0.028, d + 0.12, x, top + jh - 0.028, z, rot);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box("timber", 0.03, jh, 0.03, x + rx * sx * (w / 2 + 0.04) + fx * sz * (d / 2 + 0.04), top, z + rz * sx * (w / 2 + 0.04) + fz * sz * (d / 2 + 0.04), rot);
      this.window(x + fx * (d / 2 + 0.042), top + jh * 0.55, z + fz * (d / 2 + 0.042), rot, 0.08, 0.09, shut);
      top += jh;
    }
    // puffy roof with overhang, eave boards and a rounded ridge cap
    const ov = 0.14;
    const rh = (w + ov) * 0.44;
    this.gable(o.roof, w + ov + 0.08, d + ov, rh, x, top, z, rot);
    for (const sg of [-1, 1]) this.box("timber", w + ov + 0.1, 0.035, 0.03, x + fx * sg * ((d + ov) / 2), top - 0.03, z + fz * sg * ((d + ov) / 2), rot);
    this.cylX(o.roof === "thatch" ? "hay" : "timber", 0.026, w + ov + 0.1, x, top + rh, z, 8, rot);
    // gable-end trim
    if (o.chimney ?? tier >= 1) {
      this.box("stone", 0.09, rh * 0.9 + 0.1, 0.09, x + rx * w * 0.28, top, z + rz * w * 0.28, rot);
      this.box("stoneDark", 0.11, 0.03, 0.11, x + rx * w * 0.28, top + rh * 0.9 + 0.1, z + rz * w * 0.28, rot);
    }
    if (tier >= 3) {
      // dormer on the facade slope
      const dy = top + rh * 0.35;
      const dzz = d / 2 - 0.02;
      this.box(body, 0.14, 0.12, 0.16, x + fx * dzz * 0.55, dy, z + fz * dzz * 0.55, rot);
      this.gable(o.roof, 0.18, 0.2, 0.08, x + fx * dzz * 0.55, dy + 0.12, z + fz * dzz * 0.55, rot);
      this.window(x + fx * (dzz * 0.55 + 0.082), dy + 0.06, z + fz * (dzz * 0.55 + 0.082), rot, 0.06, 0.06, null);
      this.lantern(x + fx * (d / 2 + 0.2) + rx * (w / 2 + 0.05), z + fz * (d / 2 + 0.2) + rz * (w / 2 + 0.05), 0.3);
    }
    return { chimney: { x: x + rx * w * 0.28, y: top + rh * 0.9 + 0.14, z: z + rz * w * 0.28 }, top: top + rh };
  }

  build(mats: Record<MatKey, THREE.MeshStandardMaterial>): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const k of Object.keys(this.geos) as MatKey[]) {
      const list = this.geos[k]!;
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mats[k]);
      mesh.castShadow = !FLAT.includes(k);
      mesh.receiveShadow = true;
      out.push(mesh);
    }
    this.geos = {};
    return out;
  }
}

// ------------------------------------------------------------------------------------------------ layout
const VS = 1.55; // village scale vs the map-scale castle (stylised proportions)
const INNER: string[] = ["Sala della Casata", "Magazzino", "Caserma", "Sala di Guerra", "Scuderia", "Officina", "Universita", "Sala dell'Alleanza", "Caravanserraglio", "Comando Sentinelle", "Bestiario", "Tempio", "Santuario Mitico"];
const OUTER: Record<string, number> = { Fattoria: 300, Boscaiolo: 62, "Cava d'Argilla": 122, "Miniera di Ferro": 180, "Miniera d'Oro": 238, Porto: 28 };
const D2R = Math.PI / 180;
const ROOFS: MatKey[] = ["roofTeal", "roofBlue", "roofRed", "roofPurple", "thatch", "roofTeal", "roofRed"];
const BODIES: MatKey[] = ["plaster", "plasterWarm", "plasterRose", "plaster"];

function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export function tierOf(level: number): 0 | 1 | 2 | 3 {
  return level <= 0 ? 0 : level >= 20 ? 3 : level >= 10 ? 2 : 1;
}

// ------------------------------------------------------------------------------------------------ building models
type Ctx = { P: Parts; lvl: number; tier: 1 | 2 | 3; s: number; emit: (x: number, y: number, z: number, size?: number) => void; faction: THREE.Color };
const H = (P: Parts, w: number, d: number, h: number, x: number, z: number, roof: MatKey, body: MatKey, tier: number, rot = 0) => P.house({ w, d, h, x, z, rot, roof, body, tier });

const MODELS: Record<string, (c: Ctx) => void> = {
  Fattoria({ P, tier, s, emit }) {
    const r = H(P, 0.42 * s, 0.34 * s, 0.24 * s, 0, 0.22 * s, "thatch", "plasterWarm", tier);
    emit(r.chimney.x, r.chimney.y, r.chimney.z, 0.05);
    for (const side of [-1, 1]) {
      if (side > 0 && tier < 2) continue;
      const cx = side * 0.62 * s;
      P.plane("field", 0.72 * s, 0.56 * s, cx, -0.28 * s, 0, 0.006, 2);
      for (let i = 0; i < 6; i++) P.box("dirt", 0.7 * s, 0.014, 0.025, cx, 0.006, -0.28 * s - 0.24 * s + i * 0.095 * s);
      for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) P.sphere("field", 0.02 * s, cx - 0.28 * s + j * 0.19 * s, 0.03, -0.28 * s - 0.22 * s + i * 0.095 * s, 1.6);
      P.fence(cx - 0.36 * s, 0.02 * s, cx + 0.36 * s, 0.02 * s, 0.09);
    }
    P.hay(0.36 * s, 0.3 * s, s);
    P.hay(0.5 * s, 0.42 * s, 0.8 * s);
    if (tier >= 3) P.hay(0.22 * s, 0.46 * s, 0.9 * s);
    P.cart(-0.38 * s, 0.42 * s, 0.5, s * 0.9, "hay");
    P.flowers(0.32 * s, 0.05 * s, 5, 2);
  },
  Boscaiolo({ P, tier, s, emit }) {
    const r = H(P, 0.34 * s, 0.3 * s, 0.22 * s, 0, 0.15, "roofSlate", "timberLight", tier);
    emit(r.chimney.x, r.chimney.y, r.chimney.z, 0.045);
    for (let i = 0; i < 3; i++) P.cylX("trunk", 0.04 * s, 0.34 * s, 0.34 * s, 0.04 * s + i * 0.0, 0.14 * s + (i - 1) * 0.085 * s, 7);
    for (let i = 0; i < 2; i++) P.cylX("trunk", 0.04 * s, 0.34 * s, 0.34 * s, 0.11 * s, 0.14 * s + (i - 0.5) * 0.085 * s, 7);
    if (tier >= 2) P.cylX("trunk", 0.04 * s, 0.34 * s, 0.34 * s, 0.18 * s, 0.14 * s, 7);
    P.treeRound(-0.44 * s, -0.25 * s, 0.9 * s, 1);
    P.pine(-0.58 * s, 0.18 * s, 0.8 * s);
    if (tier >= 2) P.treeRound(0.56 * s, -0.36 * s, 0.85 * s, 2);
    if (tier >= 3) P.pine(-0.15 * s, -0.52 * s, 1.0 * s);
    P.cyl("trunk", 0.05 * s, 0.06 * s, 0.08 * s, 0.05 * s, 0, 0.36 * s, 7);
    P.boxR("metal", 0.03, 0.06, 0.012, 0.05 * s, 0.11 * s, 0.36 * s, 0, 0.4, 0.5); // axe head
    P.boxR("timber", 0.012, 0.14, 0.012, 0.03 * s, 0.14 * s, 0.34 * s, 0, 0.4, 0.5);
  },
  "Cava d'Argilla"({ P, tier, s, emit }) {
    P.disc("clay", 0.36 * s, -0.3 * s, -0.1 * s, 0.006, 16);
    P.cyl("clay", 0.28 * s, 0.35 * s, 0.045, -0.3 * s, -0.035, -0.1 * s, 16);
    P.sphere("stone", 0.18 * s, 0.32 * s, 0.0, 0.05 * s, 1, true);
    P.cyl("dark", 0.05 * s, 0.05 * s, 0.06, 0.32 * s, 0.15 * s, 0.05 * s, 8);
    P.box("dark", 0.09 * s, 0.1 * s, 0.03, 0.32 * s, 0.0, 0.21 * s);
    P.sphere("lantern", 0.03 * s, 0.32 * s, 0.05 * s, 0.22 * s); // fire glow
    emit(0.32 * s, 0.22 * s, 0.05 * s, 0.06);
    for (let i = 0; i < 1 + tier; i++) P.box("clay", 0.16 * s, 0.08 * s, 0.1 * s, 0.05 * s - i * 0.2 * s, 0, 0.32 * s, i * 0.3);
    if (tier >= 3) P.sphere("stone", 0.14 * s, 0.05 * s, 0, -0.32 * s, 1, true);
    H(P, 0.3 * s, 0.26 * s, 0.2 * s, 0.5 * s, 0.38 * s, "roofRed", "plaster", tier);
    P.barrel(0.72 * s, 0.2 * s, 0.9);
  },
  "Miniera di Ferro"(c) {
    mine(c, "metal");
  },
  "Miniera d'Oro"(c) {
    mine(c, "gold");
  },
  Magazzino({ P, tier, s }) {
    H(P, 0.56 * s, 0.42 * s, 0.3 * s, 0, 0, "roofSlate", "timberLight", tier);
    for (let i = 0; i < 2 + tier; i++) P.barrel(0.38 * s + (i % 2) * 0.1 * s, 0.14 * s - Math.floor(i / 2) * 0.1 * s, 1);
    P.crate(-0.4 * s, 0.14 * s, 1.1, 0.3);
    P.crate(-0.4 * s, 0.14 * s, 0.8, 0.1, 0.11);
    if (tier >= 2) P.crate(-0.52 * s, 0.02 * s, 1, 0.5);
    if (tier >= 3) H(P, 0.3 * s, 0.3 * s, 0.22 * s, -0.55 * s, -0.32 * s, "roofSlate", "timberLight", 1, 0.5);
  },
  Caserma({ P, tier, s }) {
    H(P, 0.6 * s, 0.34 * s, 0.28 * s, 0, -0.1 * s, "roofRed", "stone", tier);
    for (let i = 0; i < 1 + tier; i++) {
      const x = -0.3 * s + i * 0.2 * s;
      P.box("timber", 0.028, 0.22 * s, 0.028, x, 0, 0.34 * s);
      P.box("timber", 0.13 * s, 0.028, 0.028, x, 0.14 * s, 0.34 * s);
      P.sphere("hay", 0.035 * s, x, 0.23 * s, 0.34 * s);
      P.box("clothRed", 0.06 * s, 0.05 * s, 0.03, x, 0.08 * s, 0.34 * s); // target board
    }
    P.bannerPole(0.38 * s, 0.26 * s, 0.55 * s, "cloth");
    P.bannerPole(-0.42 * s, 0.26 * s, 0.5 * s, "cloth");
    P.box("metal", 0.14 * s, 0.05 * s, 0.14 * s, 0.42 * s, 0, 0.0); // weapon rack base
    for (let i = 0; i < 3; i++) P.box("metal", 0.012, 0.18 * s, 0.012, 0.38 * s + i * 0.04 * s, 0.05 * s, 0.0);
    if (tier >= 3) {
      P.cyl("stone", 0.1 * s, 0.11 * s, 0.62 * s, -0.44 * s, 0, -0.24 * s, 10);
      P.cone("roofRed", 0.14 * s, 0.16 * s, -0.44 * s, 0.62 * s, -0.24 * s, 10);
      P.bannerPole(-0.44 * s, -0.24 * s, 0.9 * s, "cloth");
    }
  },
  Universita({ P, tier, s }) {
    P.box("stoneDark", 0.46 * s, 0.05, 0.46 * s, 0, 0, 0);
    P.box("cream", 0.36 * s, 0.52 * s, 0.36 * s, 0, 0.05, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box("stone", 0.05, 0.52 * s, 0.05, sx * 0.18 * s, 0.05, sz * 0.18 * s);
    P.box("gold", 0.4 * s, 0.03, 0.4 * s, 0, 0.55 * s, 0);
    P.sphere("roofBlue", 0.21 * s, 0, 0.57 * s, 0, 0.85, true);
    P.cyl("gold", 0.012, 0.02, 0.12 * s, 0, 0.74 * s, 0, 6);
    P.sphere("gold", 0.03 * s, 0, 0.87 * s, 0);
    for (let i = 0; i < 4; i++) P.window((i % 2 ? 0.1 : -0.1) * s, 0.2 * s + Math.floor(i / 2) * 0.2 * s, 0.181 * s, 0, 0.06 * s, 0.1 * s, null);
    P.door(0, 0.05, 0.181 * s, 0, 0.12 * s, 0.2 * s, "gold");
    if (tier >= 2) H(P, 0.3 * s, 0.26 * s, 0.24 * s, 0.42 * s, 0.02 * s, "roofBlue", "cream", 1);
    if (tier >= 3) {
      P.box("cream", 0.2 * s, 0.72 * s, 0.2 * s, -0.38 * s, 0, -0.05 * s);
      P.sphere("roofBlue", 0.14 * s, -0.38 * s, 0.72 * s, -0.05 * s, 0.85, true);
      P.window(-0.38 * s, 0.5 * s, -0.05 * s + 0.101 * s, 0, 0.05 * s, 0.08 * s, null);
    }
    P.bush(0.28 * s, 0.3 * s, 0.9);
    P.bush(-0.28 * s, 0.3 * s, 0.9);
  },
  "Sala della Casata"({ P, tier, s }) {
    H(P, 0.52 * s, 0.38 * s, 0.32 * s, 0, 0, "roofPurple", "cream", Math.max(2, tier));
    P.box("stoneDark", 0.64 * s, 0.04, 0.54 * s, 0, -0.02, 0.02 * s);
    P.bannerPole(0.34 * s, 0.3 * s, 0.6 * s, "cloth");
    P.bannerPole(-0.34 * s, 0.3 * s, 0.6 * s, "cloth");
    P.flowers(0.3 * s, 0.34 * s, 6, 3);
    P.flowers(-0.3 * s, 0.34 * s, 6, 5);
    if (tier >= 2) {
      P.cyl("cream", 0.11 * s, 0.12 * s, 0.5 * s, -0.34 * s, 0, -0.12 * s, 10);
      P.cone("roofPurple", 0.15 * s, 0.2 * s, -0.34 * s, 0.5 * s, -0.12 * s, 10);
    }
    if (tier >= 3) {
      P.cyl("cream", 0.11 * s, 0.12 * s, 0.5 * s, 0.34 * s, 0, -0.12 * s, 10);
      P.cone("roofPurple", 0.15 * s, 0.2 * s, 0.34 * s, 0.5 * s, -0.12 * s, 10);
      P.sphere("gold", 0.025 * s, 0.34 * s, 0.71 * s, -0.12 * s);
      P.sphere("gold", 0.025 * s, -0.34 * s, 0.71 * s, -0.12 * s);
    }
  },
  "Comando Sentinelle"({ P, tier, s }) {
    const h = (0.58 + tier * 0.12) * s;
    P.box("stoneDark", 0.28 * s, 0.1 * s, 0.28 * s, 0, 0, 0);
    P.box("timberLight", 0.17 * s, h, 0.17 * s, 0, 0.1 * s, 0);
    for (let i = 1; i < 4; i++) P.box("timber", 0.19 * s, 0.03, 0.19 * s, 0, 0.1 * s + (h * i) / 4, 0);
    P.box("timber", 0.32 * s, 0.03, 0.32 * s, 0, 0.1 * s + h, 0);
    for (const [a, b] of [[0.15, 0], [-0.15, 0], [0, 0.15], [0, -0.15]]) P.box("timberLight", a ? 0.02 : 0.32 * s, 0.09 * s, b ? 0.02 : 0.32 * s, a * s, 0.13 * s + h, b * s);
    P.cyl("dark", 0.05 * s, 0.035 * s, 0.05 * s, 0, 0.13 * s + h, 0, 8);
    P.sphere("lantern", 0.04 * s, 0, 0.2 * s + h, 0);
    P.gable("roofSlate", 0.38 * s, 0.38 * s, 0.14 * s, 0, 0.3 * s + h, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box("timber", 0.022, 0.2 * s, 0.022, sx * 0.15 * s, 0.1 * s + h, sz * 0.15 * s);
    P.bannerPole(0.2 * s, 0.2 * s, 0.4 * s, "cloth");
    if (tier >= 2) H(P, 0.28 * s, 0.24 * s, 0.2 * s, 0.36 * s, 0.05 * s, "roofSlate", "stone", 1);
  },
  Caravanserraglio({ P, tier, s }) {
    P.box("sand", 0.66 * s, 0.28 * s, 0.14 * s, 0, 0, -0.24 * s);
    P.box("sand", 0.14 * s, 0.28 * s, 0.54 * s, -0.26 * s, 0, 0);
    P.box("sand", 0.14 * s, 0.28 * s, 0.54 * s, 0.26 * s, 0, 0);
    for (let i = -1; i <= 1; i++) {
      P.box("dark", 0.1 * s, 0.14 * s, 0.03, i * 0.18 * s, 0.02, -0.165 * s);
      P.sphere("dark", 0.05 * s, i * 0.18 * s, 0.16 * s, -0.165 * s, 0.6, true);
    }
    P.box("roofRed", 0.7 * s, 0.035, 0.2 * s, 0, 0.28 * s, -0.24 * s);
    for (let i = -2; i <= 2; i++) P.box("sand", 0.06 * s, 0.05 * s, 0.05 * s, i * 0.15 * s, 0.315 * s, -0.24 * s); // parapet teeth
    P.cart(0, 0.1 * s, 0.2, s, tier >= 2 ? "clothBlue" : "hay");
    P.barrel(-0.14 * s, 0.32 * s, 1);
    P.crate(0.16 * s, 0.34 * s, 1, 0.4);
    if (tier >= 3) P.box("sand", 0.66 * s, 0.14 * s, 0.14 * s, 0, 0.28 * s, -0.24 * s);
    P.bannerPole(0.3 * s, 0.34 * s, 0.45 * s, "clothBlue");
  },
  "Sala dell'Alleanza"({ P, tier, s }) {
    H(P, 0.5 * s, 0.38 * s, 0.3 * s, 0, 0, "roofBlue", "stone", Math.max(2, tier));
    P.bannerPole(-0.22 * s, 0.3 * s, 0.56 * s, "clothBlue");
    P.bannerPole(0.22 * s, 0.3 * s, 0.56 * s, "cloth");
    P.box("stoneDark", 0.56 * s, 0.04, 0.46 * s, 0, -0.02, 0.02 * s);
    if (tier >= 3) H(P, 0.26 * s, 0.26 * s, 0.34 * s, -0.4 * s, -0.12 * s, "roofBlue", "stone", 1);
  },
  "Sala di Guerra"({ P, tier, s }) {
    H(P, 0.54 * s, 0.36 * s, 0.3 * s, 0, 0, "roofSlate", "stoneDark", tier);
    for (let i = -2; i <= 2; i++) P.cone("timber", 0.022, 0.18 * s, i * 0.13 * s, 0, 0.34 * s, 5);
    P.bannerPole(0.34 * s, 0.22 * s, 0.6 * s, "clothRed");
    P.bannerPole(-0.34 * s, 0.22 * s, 0.6 * s, "clothRed");
    P.box("metal", 0.1 * s, 0.05 * s, 0.1 * s, 0.4 * s, 0, 0.05 * s);
    P.sphere("dark", 0.045 * s, 0.4 * s, 0.09 * s, 0.05 * s); // cauldron / brazier
    P.sphere("lantern", 0.03 * s, 0.4 * s, 0.12 * s, 0.05 * s);
    if (tier >= 3) H(P, 0.24 * s, 0.24 * s, 0.42 * s, -0.4 * s, -0.08 * s, "roofSlate", "stoneDark", 1);
  },
  Scuderia({ P, tier, s }) {
    P.box("stoneDark", 0.66 * s, 0.04, 0.3 * s, 0, 0, -0.16 * s);
    P.box("timberLight", 0.62 * s, 0.24 * s, 0.26 * s, 0, 0.04, -0.16 * s);
    for (let i = -1; i <= 1; i++) P.box("dark", 0.14 * s, 0.16 * s, 0.03, i * 0.2 * s, 0.05, -0.028 * s);
    P.gable("thatch", 0.72 * s, 0.36 * s, 0.16 * s, 0, 0.28 * s, -0.16 * s);
    P.fence(-0.32 * s, 0.32 * s, 0.32 * s, 0.32 * s, 0.1);
    P.fence(-0.32 * s, 0.02 * s, -0.32 * s, 0.32 * s, 0.1);
    P.fence(0.32 * s, 0.02 * s, 0.32 * s, 0.32 * s, 0.1);
    for (let i = 0; i < tier; i++) horse(P, (-0.16 + i * 0.16) * s, 0.17 * s, s, i * 0.7);
    P.hay(-0.28 * s, 0.1 * s, 0.7 * s);
    P.barrel(0.28 * s, 0.08 * s, 0.8);
  },
  Porto({ P, tier, s }) {
    P.disc("water", 0.8 * s, 0, -0.6 * s, 0.003, 22);
    P.disc("sand", 0.86 * s, 0, -0.6 * s, 0.002, 22, 0.78 * s);
    P.box("timberLight", 0.18 * s, 0.035, 0.74 * s, 0, 0.05, -0.42 * s);
    for (let i = 0; i < 6; i++) P.cyl("timber", 0.016, 0.016, 0.12, (i % 2 ? 0.08 : -0.08) * s, 0, (-0.12 - Math.floor(i / 2) * 0.3) * s, 6);
    H(P, 0.32 * s, 0.28 * s, 0.22 * s, 0.36 * s, 0.12 * s, "roofBlue", "timberLight", tier);
    P.barrel(-0.26 * s, 0.14 * s, 1);
    P.crate(-0.3 * s, 0.02 * s, 1, 0.3);
    if (tier >= 2) P.crate(-0.16 * s, 0.14 * s, 0.9, 0.5);
    if (tier >= 3) {
      P.cyl("stone", 0.07 * s, 0.09 * s, 0.5 * s, -0.46 * s, 0, -0.12 * s, 10);
      P.sphere("lantern", 0.04 * s, -0.46 * s, 0.54 * s, -0.12 * s);
      P.cone("roofRed", 0.09 * s, 0.1 * s, -0.46 * s, 0.58 * s, -0.12 * s, 10);
    }
  },
  Officina({ P, tier, s, emit }) {
    const r = H(P, 0.46 * s, 0.34 * s, 0.26 * s, 0, -0.1 * s, "roofSlate", "timberLight", tier);
    emit(r.chimney.x, r.chimney.y, r.chimney.z, 0.06);
    // catapult
    P.box("timber", 0.26 * s, 0.035, 0.13 * s, 0.42 * s, 0.03, 0.22 * s);
    P.box("timber", 0.025, 0.18 * s, 0.025, 0.33 * s, 0.05, 0.22 * s);
    P.box("timber", 0.025, 0.18 * s, 0.025, 0.51 * s, 0.05, 0.22 * s);
    P.boxR("timber", 0.025, 0.3 * s, 0.025, 0.42 * s, 0.16 * s, 0.22 * s, 0.9, 0, 0);
    P.sphere("rock", 0.03 * s, 0.42 * s, 0.3 * s, 0.1 * s);
    P.cylX("timber", 0.045 * s, 0.02, 0.31 * s, 0.045 * s, 0.29 * s, 10);
    P.cylX("timber", 0.045 * s, 0.02, 0.53 * s, 0.045 * s, 0.29 * s, 10);
    P.box("metal", 0.1 * s, 0.05 * s, 0.05 * s, -0.32 * s, 0.07 * s, 0.26 * s); // anvil
    P.box("timber", 0.07 * s, 0.07 * s, 0.07 * s, -0.32 * s, 0, 0.26 * s);
    P.sphere("lantern", 0.03 * s, -0.16 * s, 0.1 * s, 0.24 * s); // forge glow
    P.box("stoneDark", 0.16 * s, 0.12 * s, 0.14 * s, -0.16 * s, 0, 0.24 * s);
    if (tier >= 3) H(P, 0.26 * s, 0.24 * s, 0.2 * s, -0.46 * s, -0.14 * s, "roofSlate", "timberLight", 1);
  },
  Bestiario({ P, tier, s }) {
    H(P, 0.38 * s, 0.3 * s, 0.24 * s, 0, -0.16 * s, "thatch", "timberLight", tier);
    for (let c = 0; c < tier; c++) {
      const cx = (-0.34 + c * 0.34) * s;
      const cz = 0.28 * s;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        P.cyl("metal", 0.009, 0.009, 0.2 * s, cx + Math.cos(a) * 0.12 * s, 0, cz + Math.sin(a) * 0.12 * s, 4);
      }
      P.cyl("metal", 0.13 * s, 0.13 * s, 0.018, cx, 0.2 * s, cz, 12);
      P.cyl("metal", 0.13 * s, 0.13 * s, 0.018, cx, 0.0, cz, 12);
      P.box(c === 1 ? "hay" : c === 2 ? "wool" : "trunk", 0.1 * s, 0.07 * s, 0.14 * s, cx, 0.02, cz, 0.4 * c);
      P.sphere(c === 1 ? "hay" : c === 2 ? "wool" : "trunk", 0.035 * s, cx + Math.sin(0.4 * c) * 0.08 * s, 0.1 * s, cz + Math.cos(0.4 * c) * 0.08 * s);
    }
    P.hay(0.34 * s, 0.02 * s, 0.7 * s);
  },
  Tempio({ P, tier, s }) {
    P.box("stoneDark", 0.66 * s, 0.05, 0.56 * s, 0, 0, 0);
    P.box("cream", 0.58 * s, 0.05, 0.48 * s, 0, 0.05, 0);
    for (let i = 0; i < 6; i++) P.cyl("cream", 0.03 * s, 0.036 * s, 0.36 * s, ((i % 3) - 1) * 0.21 * s, 0.1, i < 3 ? 0.19 * s : -0.19 * s, 10);
    P.box("cream", 0.56 * s, 0.05, 0.46 * s, 0, 0.46 * s, 0);
    P.gable("roofRed", 0.62 * s, 0.52 * s, 0.16 * s, 0, 0.51 * s, 0, Math.PI / 2);
    P.box("gold", 0.58 * s, 0.02, 0.48 * s, 0, 0.5 * s, 0);
    P.box("dark", 0.24 * s, 0.32 * s, 0.24 * s, 0, 0.1, 0);
    P.window(0, 0.28 * s, 0.121 * s, 0, 0.08 * s, 0.14 * s, null);
    P.door(0, 0.1, 0.121 * s, 0, 0.1 * s, 0.18 * s, "gold");
    P.sphere("gold", 0.045 * s, 0, 0.7 * s, 0);
    P.cyl("gold", 0.01, 0.01, 0.12 * s, 0, 0.72 * s, 0, 6);
    P.flowers(0.3 * s, 0.32 * s, 5, 7);
    P.flowers(-0.3 * s, 0.32 * s, 5, 9);
    if (tier >= 2) P.cyl("gold", 0.035 * s, 0.035 * s, 0.02, 0, 0.84 * s, 0, 8);
    if (tier >= 3) {
      P.box("cream", 0.14 * s, 0.62 * s, 0.14 * s, 0.4 * s, 0, -0.1 * s);
      P.cone("roofRed", 0.11 * s, 0.16 * s, 0.4 * s, 0.62 * s, -0.1 * s, 4);
      P.sphere("gold", 0.025 * s, 0.4 * s, 0.8 * s, -0.1 * s);
    }
  },
  "Santuario Mitico"({ P, tier, s }) {
    P.disc("stone", 0.44 * s, 0, 0, 0.006, 8, 0, 2);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      P.box("rock", 0.09 * s, (0.28 + (i % 2) * 0.1) * s, 0.07 * s, Math.cos(a) * 0.34 * s, 0, Math.sin(a) * 0.34 * s, -a);
    }
    if (tier >= 2) for (let i = 0; i < 3; i++) P.box("rock", 0.32 * s, 0.06 * s, 0.07 * s, Math.cos((i / 3) * Math.PI * 2 + 0.5) * 0.34 * s, 0.32 * s, Math.sin((i / 3) * Math.PI * 2 + 0.5) * 0.34 * s, -((i / 3) * Math.PI * 2 + 0.5) + Math.PI / 2);
    P.cyl("stone", 0.1 * s, 0.12 * s, 0.1 * s, 0, 0, 0, 8);
    P.flowers(0.42 * s, 0.2 * s, 6, 4);
    P.flowers(-0.4 * s, -0.2 * s, 6, 6);
  },
};

function mine(c: Ctx, ore: MatKey) {
  const { P, tier, s } = c;
  P.blob("rock", 0.38 * s, 0, -0.05 * s, -0.28 * s, 7, 0.72, 0.18);
  P.blob("leafDark", 0.12 * s, 0.26 * s, 0.02, -0.4 * s, 8, 0.6);
  P.box("dark", 0.17 * s, 0.17 * s, 0.1 * s, 0, 0, 0.06 * s);
  P.box("timber", 0.025, 0.2 * s, 0.025, -0.1 * s, 0, 0.11 * s);
  P.box("timber", 0.025, 0.2 * s, 0.025, 0.1 * s, 0, 0.11 * s);
  P.box("timber", 0.24 * s, 0.035, 0.035, 0, 0.2 * s, 0.11 * s);
  P.box("metal", 0.012, 0.01, 0.52 * s, -0.04 * s, 0.006, 0.32 * s);
  P.box("metal", 0.012, 0.01, 0.52 * s, 0.04 * s, 0.006, 0.32 * s);
  for (let i = 0; i < 5; i++) P.box("timber", 0.12 * s, 0.01, 0.02, 0, 0.004, 0.12 * s + i * 0.1 * s);
  P.box("timberLight", 0.1 * s, 0.07 * s, 0.12 * s, 0, 0.03, 0.32 * s);
  P.box(ore, 0.08 * s, 0.03 * s, 0.09 * s, 0, 0.1 * s, 0.32 * s);
  for (let i = 0; i < tier + 1; i++) P.sphere(ore, 0.045 * s, (0.28 + i * 0.09) * s, 0.03 * s, (0.1 + (i % 2) * 0.1) * s, 0.7);
  P.lantern(-0.2 * s, 0.2 * s, 0.26);
  if (tier >= 2) H(P, 0.26 * s, 0.24 * s, 0.2 * s, -0.42 * s, 0.22 * s, "roofSlate", "timberLight", 1);
  if (tier >= 3) {
    P.box("timber", 0.025, 0.42 * s, 0.025, 0.38 * s, 0, -0.1 * s);
    P.box("timber", 0.025, 0.42 * s, 0.025, 0.5 * s, 0, -0.1 * s);
    P.box("timber", 0.16 * s, 0.025, 0.025, 0.44 * s, 0.42 * s, -0.1 * s);
    P.cylX("timberLight", 0.03 * s, 0.1 * s, 0.44 * s, 0.36 * s, -0.1 * s, 8);
  }
}

function horse(P: Parts, x: number, z: number, s: number, rot: number) {
  const key: MatKey = rot > 1 ? "wool" : "trunk";
  P.box(key, 0.07 * s, 0.07 * s, 0.17 * s, x, 0.065 * s, z, rot);
  P.box(key, 0.045 * s, 0.1 * s, 0.05 * s, x + Math.sin(rot) * 0.1 * s, 0.1 * s, z + Math.cos(rot) * 0.1 * s, rot);
  P.box("dark", 0.02, 0.04 * s, 0.06 * s, x + Math.sin(rot) * 0.08 * s, 0.11 * s, z + Math.cos(rot) * 0.08 * s, rot); // mane
  for (const [lx, lz] of [[-0.025, 0.06], [0.025, 0.06], [-0.025, -0.06], [0.025, -0.06]]) {
    const wx = x + Math.cos(rot) * lx * s + Math.sin(rot) * lz * s;
    const wz = z - Math.sin(rot) * lx * s + Math.cos(rot) * lz * s;
    P.box(key, 0.016, 0.065 * s, 0.016, wx, 0, wz, rot);
  }
}

// ------------------------------------------------------------------------------------------------ village
export function buildVillage(input: VillageInput, factory: EntityFactory, faction: THREE.Color, terrainColor: THREE.Color): Village {
  const rnd = seeded(input.settlementId);
  const group = new THREE.Group();
  const mats = makeMaterials(faction, terrainColor);
  const anchors: VillageAnchor[] = [];
  const emitters: SmokeEmitter[] = [];
  const waypoints: Waypoint[] = [];
  const pickables: THREE.Object3D[] = [];
  const nightMats = [mats.window, mats.lantern];
  const smokeColor = new THREE.Color("#f2eee8");
  const emit = (x: number, y: number, z: number, size = 0.05) => emitters.push({ x, y, z, size, rise: 0.5, period: 2.6, puffs: 5, color: smokeColor });

  const level = Math.max(1, input.level);
  const sc = settlementScale(level);
  const castleR = 1.15 * sc;
  const R1 = castleR + 1.25; // ring road
  const R2 = R1 + 2.6; // resource ring
  const R3 = R2 + 1.6; // walls
  const MEADOW_R = R3 + 9; // meadow edge
  const groundY = makeGroundFn(R3, MEADOW_R);
  const P = new Parts();

  // ---- castle (same rigs as the world map)
  const fake: SettlementPublic = { settlement_id: input.settlementId, kind: "PLAYER", name: "", x: -1, y: -1, terrain: input.terrain as any, terrain_defender_bonus_pct: 0, region: "", port_eligible: input.portEligible, level, owner_player_id: "me", owner_house_crest: input.crest, skin: input.skin, faction: "OWN", wall_level: input.wallLevel };
  const castle = factory.buildSettlements([fake], () => 0);
  castle.group.position.set(0.5, 0, 0.5);
  castle.group.traverse((o) => {
    const t = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh).geometry.type : "";
    if (t === "RingGeometry" || t === "CircleGeometry") o.visible = false; // faction ring + fake blob shadow (real shadows here)
  });
  group.add(castle.group);
  for (const e of castle.emitters) emitters.push({ ...e, x: e.x + 0.5, z: e.z + 0.5, size: e.size * 0.45, rise: e.rise * 0.75, puffs: Math.min(e.puffs, 4) });
  anchors.push({ name: "Castello / Fortezza", x: 0, z: 0, r: castleR, level });
  const castlePick = new THREE.Mesh(new THREE.CylinderGeometry(castleR, castleR, 2.6 * sc, 12), new THREE.MeshBasicMaterial({ visible: false }));
  castlePick.position.y = 1.3 * sc;
  castlePick.userData.building = "Castello / Fortezza";
  group.add(castlePick);
  pickables.push(castlePick);

  // ---- ground: rolling meadow + textured roads (UV-tiled)
  group.add(meadow(MEADOW_R, groundY, R1, R3, mats.grass));
  P.begin(0, 0, 0);
  P.disc("cobble", R1 + 0.3, 0, 0, 0.003, 64, R1 - 0.3, 14);
  P.disc("dirt", R2 + 0.2, 0, 0, 0.003, 64, R2 - 0.2, 20);
  P.plane("cobble", 0.8, R3 + 2.4 - castleR + 0.3, 0, (castleR - 0.3 + R3 + 2.4) / 2, 0, 0.004, 3);
  P.disc("cobble", castleR + 0.4, 0, 0, 0.002, 48, castleR - 0.1, 10);
  // castle apron dressing: flower beds + lanterns at the keep gate
  P.flowers(0.55, castleR + 0.42, 6, 1);
  P.flowers(-0.55, castleR + 0.42, 6, 2);
  P.lantern(0.62, castleR + 0.15, 0.36);
  P.lantern(-0.62, castleR + 0.15, 0.36);
  const gate = { x: 0, z: R3 };
  waypoints.push({ x: 0, z: castleR + 0.45, kind: "gate" }, { x: 0, z: R3 - 0.35, kind: "gate" }, { x: 0, z: R2, kind: "ring" });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    waypoints.push({ x: Math.sin(a) * R1, z: Math.cos(a) * R1, kind: "ring" });
  }

  // ---- buildings
  const built = (name: string) => input.buildings[name] ?? 0;
  const emitLocal = (cx: number, cz: number, rot: number, x: number, y: number, z: number, size?: number) => {
    const wx = cx + Math.cos(rot) * x + Math.sin(rot) * z;
    const wz = cz - Math.sin(rot) * x + Math.cos(rot) * z;
    emit(wx, y, wz, size);
  };
  let farm: Village["farm"] = null;
  const place = (name: string, cx: number, cz: number, facing: number, radiusHint: number) => {
    const lvl = built(name);
    const unlocked = input.unlocked.includes(name) || lvl > 0;
    if (!unlocked) return;
    const tier = tierOf(lvl);
    const s = VS * (0.9 + Math.min(30, lvl) * 0.018);
    anchors.push({ name, x: cx, z: cz, r: radiusHint * s, level: lvl });
    waypoints.push({ x: cx + Math.sin(facing) * 0.55 * s, z: cz + Math.cos(facing) * 0.55 * s, kind: name === "Fattoria" ? "farm" : "door" });
    if (name === "Fattoria" && lvl > 0) farm = { x: cx, z: cz };
    P.begin(cx, cz, facing);
    // stone doorstep path to the road
    P.plane("cobble", 0.22, 0.5 * s, 0, 0.42 * s, 0, 0.0045, 1);
    if (tier === 0) {
      P.disc("dirt", 0.42 * VS, 0, 0, 0.006, 12, 0, 2);
      P.box("timber", 0.03, 0.36, 0.03, 0, 0, 0.3 * VS);
      P.box("plaster", 0.3, 0.16, 0.03, 0, 0.3, 0.3 * VS);
      P.box("timber", 0.32, 0.02, 0.05, 0, 0.29, 0.3 * VS);
      P.crate(0.26, -0.2, 1.2, 0.5);
      P.box("timber", 0.18, 0.06, 0.18, -0.26, 0, -0.15, 0.2);
      P.box("timber", 0.14, 0.06, 0.14, -0.26, 0.06, -0.15, 0.6);
    } else {
      MODELS[name]?.({ P, lvl, tier, s, emit: (x, y, z, size) => emitLocal(cx, cz, facing, x, y, z, size), faction });
    }
    const pick = new THREE.Mesh(new THREE.CylinderGeometry(radiusHint * s, radiusHint * s, 1.0, 10), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.set(cx, 0.5, cz);
    pick.userData.building = name;
    group.add(pick);
    pickables.push(pick);
  };
  INNER.forEach((name, i) => {
    const a = (26 + i * (308 / (INNER.length - 1))) * D2R;
    const r = R1 + 0.62 * VS;
    place(name, Math.sin(a) * r, Math.cos(a) * r, a + Math.PI, 0.55);
  });
  for (const [name, deg] of Object.entries(OUTER)) {
    if (name === "Porto" && !input.portEligible) continue;
    const a = deg * D2R;
    const r = name === "Porto" ? R3 + 1.3 : R2 + 0.6;
    place(name, Math.sin(a) * r, Math.cos(a) * r, a + Math.PI, 0.75);
    if (name !== "Porto") P.plane("dirt", 0.32, r - 0.7 - R1, Math.sin(a) * ((R1 + r - 0.7) / 2), Math.cos(a) * ((R1 + r - 0.7) / 2), a, 0.0035, 2);
  }

  // ---- filler houses (grow with the level)
  const nHouses = Math.min(26, 2 + Math.round(level * 0.85));
  const blocked = Object.values(OUTER).map((d) => d * D2R);
  let placed = 0;
  for (let tries = 0; tries < 500 && placed < nHouses; tries++) {
    const a = rnd() * Math.PI * 2;
    const norm = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const nearRoad = norm < 10 * D2R || norm > 350 * D2R;
    const nearLot = blocked.some((b) => Math.abs(Math.atan2(Math.sin(norm - b), Math.cos(norm - b))) < 24 * D2R);
    if (nearRoad || nearLot) continue;
    const r = R1 + 1.35 + rnd() * 0.85;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (anchors.some((k) => Math.hypot(k.x - x, k.z - z) < k.r + 0.6 * VS)) continue;
    const rot = a + Math.PI + (rnd() - 0.5) * 0.5;
    P.begin(x, z, rot);
    const big = placed % 3 === 0;
    const hs = VS * (big ? 1.25 : 1);
    const roof = ROOFS[Math.floor(rnd() * ROOFS.length)];
    const body = BODIES[Math.floor(rnd() * BODIES.length)];
    const tier = level >= 20 && placed % 4 === 0 ? 3 : level >= 10 && placed % 2 === 0 ? 2 : 1;
    const h = P.house({ w: 0.28 * hs, d: 0.24 * hs, h: 0.2 * hs, x: 0, z: 0, rot: 0, roof, body, tier });
    if (tier >= 2 || (big && level >= 8)) emitLocal(x, z, rot, h.chimney.x, h.chimney.y, h.chimney.z, 0.045);
    // yard dressing
    const dress = rnd();
    if (dress < 0.3) P.barrel(0.24 * hs, 0.18 * hs, 0.9);
    else if (dress < 0.55) P.crate(-0.24 * hs, 0.18 * hs, 0.9, rnd() * 1.5);
    else if (dress < 0.8) P.bush(0.26 * hs, 0.14 * hs, 0.8, rnd() < 0.5 ? "leaf" : "leafLight");
    else P.flowers(-0.24 * hs, 0.2 * hs, 5, placed);
    if (rnd() < 0.35) P.treeRound(-0.34 * hs, -0.3 * hs, 0.75 + rnd() * 0.3, placed);
    anchors.push({ name: "", x, z, r: 0.34 * hs, level: 0 });
    waypoints.push({ x: x + Math.sin(rot) * 0.42 * hs, z: z + Math.cos(rot) * 0.42 * hs, kind: "door" });
    placed++;
  }

  // ---- well on the ring + market by the gate (L5+)
  P.begin(0, 0, 0);
  P.well(Math.sin(190 * D2R) * (R1 - 0.7), Math.cos(190 * D2R) * (R1 - 0.7), 1);
  if (level >= 5) {
    const stalls = level >= 15 ? 4 : 2;
    for (let i = 0; i < stalls; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (0.8 + Math.floor(i / 2) * 0.05);
      const z = R1 + 1.45 + Math.floor(i / 2) * 0.75;
      const k = VS;
      const awning: MatKey = i % 2 ? "clothRed" : i % 4 === 0 ? "roofTeal" : "clothBlue";
      P.begin(x, z, side > 0 ? -Math.PI / 2 : Math.PI / 2);
      P.box("timberLight", 0.34 * k, 0.13 * k, 0.2 * k, 0, 0.1 * k, 0);
      for (const [px, pz] of [[-0.15, -0.08], [0.15, -0.08], [-0.15, 0.08], [0.15, 0.08]]) P.box("timber", 0.022, 0.34 * k, 0.022, px * k, 0, pz * k);
      P.gable(awning, 0.4 * k, 0.3 * k, 0.09 * k, 0, 0.34 * k, 0);
      // wares
      P.box("field", 0.08 * k, 0.06 * k, 0.08 * k, -0.09 * k, 0.23 * k, 0, 0.3);
      P.sphere("flowerRed", 0.03 * k, 0.02 * k, 0.26 * k, 0.02 * k);
      P.sphere("flowerYellow", 0.03 * k, 0.05 * k, 0.26 * k, -0.04 * k);
      P.box(i % 2 ? "gold" : "clay", 0.08 * k, 0.05 * k, 0.08 * k, 0.1 * k, 0.23 * k, 0.03 * k, 0.1);
      P.barrel(-0.24 * k, 0.1 * k, 0.8);
      waypoints.push({ x: x - side * 0.5, z, kind: "market" });
    }
  }

  // ---- walls (Mura level): battlements, walkway, towers with tiled cones and flags, gatehouse with portcullis
  const wl = Math.max(0, input.wallLevel);
  const flags: THREE.Mesh[] = [];
  if (wl > 0) {
    const segs = 36;
    const hW = (0.34 + Math.min(30, wl) * 0.02) * VS;
    const thick = (0.22 + wl * 0.004) * VS;
    const segLen = (2 * Math.PI * R3) / segs;
    for (let i = 0; i < segs; i++) {
      const a = ((i + 0.5) / segs) * Math.PI * 2;
      const norm = a > Math.PI ? a - Math.PI * 2 : a;
      if (Math.abs(norm) < 6 * D2R) continue;
      P.begin(Math.sin(a) * R3, Math.cos(a) * R3, a);
      P.box("stone", segLen * 1.02, hW, thick, 0, 0, 0, 0, 2);
      P.box("stoneDark", segLen * 1.02, 0.06, thick * 1.3, 0, hW, 0);
      P.box("timberLight", segLen * 1.02, 0.03, thick * 0.6, 0, hW + 0.06, -thick * 0.15); // walkway planks
      for (let k = -2; k <= 2; k++) P.box("stone", segLen * 0.11, 0.09, thick * 0.4, k * segLen * 0.2, hW + 0.06, thick * 0.35); // merlons
    }
    const towers = wl >= 20 ? 12 : wl >= 10 ? 8 : 4;
    for (let i = 0; i < towers; i++) {
      const a = ((i + 0.5) / towers) * Math.PI * 2;
      const tr = (0.17 + wl * 0.003) * VS;
      P.begin(Math.sin(a) * R3, Math.cos(a) * R3, 0);
      P.cyl("stone", tr, tr * 1.12, hW + 0.36, 0, 0, 0, 16, 0, 2);
      P.cyl("stoneDark", tr * 1.16, tr * 1.1, 0.06, 0, hW + 0.36, 0, 16);
      for (let k = 0; k < 7; k++) P.box("stone", 0.08, 0.08, 0.08, Math.cos((k / 7) * Math.PI * 2) * tr * 1.05, hW + 0.42, Math.sin((k / 7) * Math.PI * 2) * tr * 1.05);
      P.cone("roofRed", tr * 1.32, 0.38 * VS, 0, hW + 0.44, 0, 14);
      P.box("timber", 0.022, 0.3, 0.022, 0, hW + 0.44 + 0.38 * VS - 0.05, 0);
      P.window(Math.sin(a + Math.PI) * tr * 1.0, hW * 0.6, Math.cos(a + Math.PI) * tr * 1.0, a + Math.PI, 0.05, 0.08, null);
      waypoints.push({ x: Math.sin(a) * (R3 - 0.45), z: Math.cos(a) * (R3 - 0.45), kind: "wall" });
      // animated flag (separate mesh)
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.14, 6, 1), new THREE.MeshStandardMaterial({ color: faction, side: THREE.DoubleSide, roughness: 0.9 }));
      flag.geometry.translate(0.11, 0, 0);
      flag.position.set(Math.sin(a) * R3, hW + 0.44 + 0.38 * VS + 0.16, Math.cos(a) * R3);
      flag.castShadow = true;
      group.add(flag);
      flags.push(flag);
    }
    for (const sx of [-1, 1]) {
      P.begin(sx * 0.66, R3, 0);
      P.box("stone", 0.44, hW + 0.56, 0.54, 0, 0, 0, 0, 2);
      P.box("stoneDark", 0.5, 0.06, 0.6, 0, hW + 0.56, 0);
      for (let k = -1; k <= 1; k++) P.box("stone", 0.1, 0.09, 0.1, k * 0.16, hW + 0.62, 0.22);
      P.box("cloth", 0.012, 0.24, 0.16, sx * 0.23, hW + 0.2, 0.16);
      P.window(sx * 0.0, hW * 0.55, 0.271, 0, 0.06, 0.1, null);
      P.lantern(sx * 0.3, 0.36, 0.34);
    }
    P.begin(0, R3, 0);
    P.box("stone", 1.32, 0.26, 0.4, 0, hW + 0.08, 0, 0, 2);
    P.box("stoneDark", 1.36, 0.05, 0.44, 0, hW + 0.34, 0);
    for (let k = -2; k <= 2; k++) P.box("stone", 0.12, 0.09, 0.12, k * 0.26, hW + 0.39, 0.16);
    for (let k = -3; k <= 3; k++) P.box("dark", 0.02, hW * 0.4, 0.02, k * 0.12, hW * 0.66, 0.05); // raised portcullis
    P.box("timber", 0.86, hW + 0.05, 0.05, 0, 0, -0.22); // open gate leaves along the passage
  }

  // ---- countryside beyond the walls: copses on the rolling hills, boulders, bushes
  const nTrees = 22 + Math.min(22, level * 1.5);
  for (let i = 0; i < nTrees; i++) {
    const a = rnd() * Math.PI * 2;
    const norm = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (norm < 12 * D2R || norm > 348 * D2R) continue;
    const r = R3 + 0.9 + rnd() * 6.5;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    const far = smooth(R3 + 1, MEADOW_R, r);
    P.begin(0, 0, 0, groundY(x, z) - 0.02);
    if (rnd() < 0.6) P.treeRound(x, z, (1.0 + rnd() * 0.9) * (1 + far * 0.6), i);
    else P.pine(x, z, (1.0 + rnd() * 0.8) * (1 + far * 0.6));
  }
  for (let i = 0; i < 16; i++) {
    const a = rnd() * Math.PI * 2;
    const r = R3 + 1.0 + rnd() * 5;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    P.begin(0, 0, 0, groundY(x, z));
    if (i < 7) P.boulder(x, z, 0.14 + rnd() * 0.2, i);
    else P.bush(x, z, 1 + rnd(), rnd() < 0.5 ? "leaf" : "leafDark");
  }
  // wild flowers inside the walls
  for (let i = 0; i < 6 + Math.min(10, level); i++) {
    const a = rnd() * Math.PI * 2;
    const r = R1 + 0.9 + rnd() * 2.2;
    P.begin(0, 0, 0);
    P.flowers(Math.sin(a) * r, Math.cos(a) * r, 3 + Math.floor(rnd() * 3), i);
  }

  for (const m of P.build(mats)) group.add(m);

  // ---- animated pieces
  const animated: Village["animated"] = { windmills: [], crystal: null, boat: null, flags };
  const fLvl = built("Fattoria");
  if (fLvl >= 20) {
    const a = OUTER.Fattoria * D2R;
    const r = R2 + 0.6;
    const s = VS * (0.9 + Math.min(30, fLvl) * 0.018);
    const base = new THREE.Group();
    base.position.set(Math.sin(a) * r + Math.cos(a) * 0.7 * s, 0, Math.cos(a) * r - Math.sin(a) * 0.7 * s);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * s, 0.13 * s, 0.52 * s, 10), mats.plaster);
    tower.position.y = 0.26 * s;
    tower.castShadow = true;
    base.add(tower);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.13 * s, 0.14 * s, 10), mats.roofRed);
    cap.position.y = 0.59 * s;
    base.add(cap);
    const hub = new THREE.Group();
    hub.position.set(0, 0.48 * s, 0.13 * s);
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06 * s, 0.36 * s, 0.012), mats.cream);
      blade.position.y = 0.18 * s;
      const arm = new THREE.Group();
      arm.rotation.z = (i * Math.PI) / 2;
      arm.add(blade);
      hub.add(arm);
    }
    base.add(hub);
    group.add(base);
    animated.windmills.push(hub);
  }
  const sLvl = built("Santuario Mitico");
  if (sLvl > 0) {
    const i = INNER.indexOf("Santuario Mitico");
    const a = (26 + i * (308 / (INNER.length - 1))) * D2R;
    const r = R1 + 0.62 * VS;
    const s = VS * (0.9 + Math.min(30, sLvl) * 0.018);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.12 * s, 0), mats.crystal);
    crystal.position.set(Math.sin(a) * r, 0.36 * s, Math.cos(a) * r);
    crystal.scale.y = 1.6;
    group.add(crystal);
    animated.crystal = crystal;
  }
  if (input.portEligible && built("Porto") > 0) {
    const a = OUTER.Porto * D2R;
    const r = R3 + 1.3;
    const s = VS * (0.9 + Math.min(30, built("Porto")) * 0.018);
    const boat = new THREE.Group();
    const cx = Math.sin(a) * r;
    const cz = Math.cos(a) * r;
    const rot = a + Math.PI;
    boat.position.set(cx + Math.cos(rot) * 0.24 * s + Math.sin(rot) * -0.55 * s, 0.02, cz - Math.sin(rot) * 0.24 * s + Math.cos(rot) * -0.55 * s);
    boat.rotation.y = rot + 0.4;
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.13 * s, 0.07 * s, 0.32 * s), mats.timberLight);
    hull.position.y = 0.035 * s;
    hull.castShadow = true;
    boat.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.32 * s, 6), mats.timber);
    mast.position.y = 0.2 * s;
    boat.add(mast);
    const sail = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.17 * s, 0.15 * s), mats.cream);
    sail.position.set(0, 0.23 * s, 0);
    boat.add(sail);
    const pennant = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.03 * s, 0.06 * s), mats.cloth);
    pennant.position.set(0, 0.35 * s, 0.03 * s);
    boat.add(pennant);
    group.add(boat);
    animated.boat = boat;
  }

  const dispose = () => {
    disposeGroup(group);
    for (const f of flags) {
      f.geometry.dispose();
      (f.material as THREE.Material).dispose();
    }
    for (const m of Object.values(mats)) m.dispose();
  };
  return { group, anchors: anchors.filter((a) => a.name), emitters, waypoints, ring: R1, wallR: R3, gate, farm, animated, nightMats, pickables, dispose };
}
