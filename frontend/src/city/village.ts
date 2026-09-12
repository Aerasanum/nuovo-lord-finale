/**
 * Procedural 3D village for the City tab: the castle (same rigs as the world map) in the middle, a ring road with the
 * civic buildings facing it, resource works on an outer ring, filler houses that multiply with the settlement level,
 * the outer Walls whose height/towers follow the Mura level, and the market by the gate. Every canonical building
 * has a recognisable model that grows through three tiers (L1-9, L10-19, L20-30); unlocked-but-unbuilt buildings show
 * as a vacant lot with a sign. All static parts are merged per material → ~15 draw calls; animated bits (windmill,
 * crystal, boat) stay separate. Layout is deterministic per settlement (seeded by id).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { CrestDto, SettlementPublic } from "@/src/api/hooks";

import { settlementScale } from "../map3d/castle";
import { disposeGroup, type EntityFactory } from "../map3d/entities";
import type { SmokeEmitter } from "../map3d/smoke";
import { makeRoofTexture, makeStoneTexture } from "../map3d/textures";

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
export type Waypoint = { x: number; z: number; kind: "door" | "ring" | "gate" | "market" | "wall" };
export type Village = {
  group: THREE.Group;
  anchors: VillageAnchor[];
  emitters: SmokeEmitter[];
  waypoints: Waypoint[];
  /** ring-road radius (villagers walk it), wall radius (guards patrol it), gate position */
  ring: number;
  wallR: number;
  gate: { x: number; z: number };
  animated: { windmills: THREE.Object3D[]; crystal: THREE.Object3D | null; boat: THREE.Object3D | null };
  /** windows / braziers that brighten at night */
  nightMats: THREE.MeshStandardMaterial[];
  pickables: THREE.Object3D[];
  dispose: () => void;
};

// ------------------------------------------------------------------------------------------------ materials
type MatKey = "stone" | "timber" | "plaster" | "roofRed" | "roofSlate" | "thatch" | "dirt" | "grass" | "field" | "water" | "metal" | "gold" | "window" | "cloth" | "leaf" | "trunk" | "rock" | "clay" | "dark" | "cream" | "sand";

const COLORS: Record<MatKey, string> = {
  stone: "#8d867b",
  timber: "#5a3d24",
  plaster: "#d9c8a8",
  roofRed: "#8a3b2a",
  roofSlate: "#4a4f5a",
  thatch: "#a8873f",
  dirt: "#6b5a44",
  grass: "#5c6d38",
  field: "#a7923c",
  water: "#2b5b7a",
  metal: "#6f7580",
  gold: "#d4a52a",
  window: "#ffc46b",
  cloth: "#7a2a2a",
  leaf: "#2f4a2a",
  trunk: "#4a3320",
  rock: "#6a625a",
  clay: "#9a5a3c",
  dark: "#2a241f",
  cream: "#e8dcc4",
  sand: "#c2ad7c",
};

function makeMaterials(faction: THREE.Color): Record<MatKey, THREE.MeshStandardMaterial> {
  const stoneTex = makeStoneTexture(128, 6, 0.95);
  const roofTex = makeRoofTexture(64, 6);
  const out = {} as Record<MatKey, THREE.MeshStandardMaterial>;
  for (const k of Object.keys(COLORS) as MatKey[]) {
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(COLORS[k]), roughness: 0.92, metalness: 0.02 });
    if (k === "stone" || k === "rock") m.map = stoneTex;
    if (k === "roofRed" || k === "roofSlate") m.map = roofTex;
    if (k === "metal") {
      m.roughness = 0.45;
      m.metalness = 0.6;
    }
    if (k === "gold") {
      m.roughness = 0.35;
      m.metalness = 0.75;
      m.emissive = new THREE.Color("#7a5a10");
      m.emissiveIntensity = 0.15;
    }
    if (k === "window") {
      m.emissive = new THREE.Color("#ffb347");
      m.emissiveIntensity = 0.0;
    }
    if (k === "water") {
      m.roughness = 0.25;
      m.transparent = true;
      m.opacity = 0.9;
    }
    if (k === "cloth") m.color.copy(faction);
    m.userData.shared = true; // owned by the village, disposed once in Village.dispose
    out[k] = m;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ geometry helpers
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);

/** Gable roof prism: ridge along local x, base on y=0, footprint w×d, height h. */
function gable(w: number, d: number, h: number): THREE.BufferGeometry {
  const hw = w / 2;
  const hd = d / 2;
  // prettier-ignore
  const v = [
    // front slope (+z)
    -hw, 0, hd,  hw, 0, hd,  hw, h, 0,   -hw, 0, hd,  hw, h, 0,  -hw, h, 0,
    // back slope (-z)
    hw, 0, -hd,  -hw, 0, -hd,  -hw, h, 0,   hw, 0, -hd,  -hw, h, 0,  hw, h, 0,
    // ends
    -hw, 0, -hd,  -hw, 0, hd,  -hw, h, 0,
    hw, 0, hd,  hw, 0, -hd,  hw, h, 0,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Array((v.length / 3) * 2).fill(0), 2));
  g.computeVertexNormals();
  return g;
}

class Parts {
  private geos: Partial<Record<MatKey, THREE.BufferGeometry[]>> = {};
  private frame = new THREE.Matrix4();
  /** Local frame for the next parts: origin (x, z) on the ground, rotated so local +z faces `rotY`. */
  begin(x: number, z: number, rotY: number) {
    this.frame.compose(_p.set(x, 0, z), _q.setFromAxisAngle(Y, rotY), _s.set(1, 1, 1));
  }
  private put(key: MatKey, src: THREE.BufferGeometry, x: number, y: number, z: number, rotY: number, sx: number, sy: number, sz: number) {
    // mergeGeometries needs all-indexed or all-non-indexed inputs → normalise to non-indexed
    let geo = src;
    if (src.index) {
      geo = src.toNonIndexed();
      src.dispose();
    }
    _m.compose(_p.set(x, y, z), _q.setFromAxisAngle(Y, rotY), _s.set(sx, sy, sz));
    geo.applyMatrix4(_m);
    geo.applyMatrix4(this.frame);
    (this.geos[key] ??= []).push(geo);
  }
  /** Box with its base at y. */
  box(key: MatKey, w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0) {
    this.put(key, new THREE.BoxGeometry(w, h, d), x, y + h / 2, z, rotY, 1, 1, 1);
  }
  cyl(key: MatKey, rt: number, rb: number, h: number, x: number, y: number, z: number, seg = 10, rotY = 0) {
    this.put(key, new THREE.CylinderGeometry(rt, rb, h, seg), x, y + h / 2, z, rotY, 1, 1, 1);
  }
  cone(key: MatKey, r: number, h: number, x: number, y: number, z: number, seg = 10, rotY = 0) {
    this.put(key, new THREE.ConeGeometry(r, h, seg), x, y + h / 2, z, rotY, 1, 1, 1);
  }
  sphere(key: MatKey, r: number, x: number, y: number, z: number, sy = 1, hemi = false) {
    this.put(key, hemi ? new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2) : new THREE.SphereGeometry(r, 12, 8), x, y, z, 0, 1, sy, 1);
  }
  gable(key: MatKey, w: number, d: number, h: number, x: number, y: number, z: number, rotY = 0) {
    this.put(key, gable(w, d, h), x, y, z, rotY, 1, 1, 1);
  }
  /** Flat disc / ring lying on the ground (y up a hair to avoid z-fighting). */
  disc(key: MatKey, r: number, x: number, z: number, y = 0.004, seg = 24, inner = 0) {
    const g = inner > 0 ? new THREE.RingGeometry(inner, r, seg) : new THREE.CircleGeometry(r, seg);
    g.rotateX(-Math.PI / 2);
    this.put(key, g, x, y, z, 0, 1, 1, 1);
  }
  plane(key: MatKey, w: number, d: number, x: number, z: number, rotY = 0, y = 0.005) {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    this.put(key, g, x, y, z, rotY, 1, 1, 1);
  }
  /** Simple house: body + gable roof (+ chimney / windows by tier). Returns the roof ridge height. */
  house(w: number, d: number, h: number, x: number, z: number, rotY: number, roof: MatKey, body: MatKey = "plaster", tier = 1) {
    this.box(body, w, h, d, x, 0, z, rotY);
    this.box("timber", w * 1.02, 0.03, d * 1.02, x, h * 0.55, z, rotY); // beam line
    this.gable(roof, w * 1.12, d * 1.12, h * 0.62, x, h, z, rotY);
    // door + windows on the facing side (+z local)
    const dz = (d / 2) * 1.01;
    const fx = Math.sin(rotY);
    const fz = Math.cos(rotY);
    this.box("timber", 0.09, 0.14, 0.02, x + fx * dz, 0, z + fz * dz, rotY);
    if (tier >= 1) this.box("window", 0.06, 0.06, 0.02, x + fx * dz + Math.cos(rotY) * 0.12, h * 0.5, z + fz * dz - Math.sin(rotY) * 0.12, rotY);
    if (tier >= 2) this.box("window", 0.06, 0.06, 0.02, x + fx * dz - Math.cos(rotY) * 0.12, h * 0.5, z + fz * dz + Math.sin(rotY) * 0.12, rotY);
    return h + h * 0.62;
  }
  tree(x: number, z: number, s = 1) {
    this.cyl("trunk", 0.03 * s, 0.045 * s, 0.22 * s, x, 0, z, 6);
    this.cone("leaf", 0.16 * s, 0.34 * s, x, 0.16 * s, z, 8);
    this.cone("leaf", 0.12 * s, 0.26 * s, x, 0.36 * s, z, 8);
  }
  build(mats: Record<MatKey, THREE.MeshStandardMaterial>, receive = true): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const k of Object.keys(this.geos) as MatKey[]) {
      const list = this.geos[k]!;
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mats[k]);
      mesh.castShadow = k !== "dirt" && k !== "grass" && k !== "field" && k !== "water" && k !== "sand";
      mesh.receiveShadow = receive;
      out.push(mesh);
    }
    this.geos = {};
    return out;
  }
}

// ------------------------------------------------------------------------------------------------ layout
/** global size factor for village buildings vs the map-scale castle (stylised, Clash-of-Clans proportions) */
const VS = 1.55;
const INNER: string[] = ["Sala della Casata", "Magazzino", "Caserma", "Sala di Guerra", "Scuderia", "Officina", "Universita", "Sala dell'Alleanza", "Caravanserraglio", "Comando Sentinelle", "Bestiario", "Tempio", "Santuario Mitico"];
const OUTER: Record<string, number> = { Fattoria: 300, Boscaiolo: 62, "Cava d'Argilla": 122, "Miniera di Ferro": 180, "Miniera d'Oro": 238, Porto: 28 };
const D2R = Math.PI / 180;

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
type Ctx = { P: Parts; lvl: number; tier: 1 | 2 | 3; s: number; emit: (x: number, y: number, z: number, size?: number) => void; faction: THREE.Color; frame: { x: number; z: number; rot: number } };

const MODELS: Record<string, (c: Ctx) => void> = {
  Fattoria({ P, tier, s, emit }) {
    P.house(0.42 * s, 0.34 * s, 0.26 * s, 0, 0.2, 0, "thatch", "plaster", tier);
    P.plane("field", 0.7 * s, 0.5 * s, -0.55 * s, -0.25 * s);
    for (let i = 0; i < 5; i++) P.box("dirt", 0.7 * s, 0.012, 0.03, -0.55 * s, 0.006, -0.25 * s - 0.2 * s + i * 0.1 * s);
    if (tier >= 2) {
      P.plane("field", 0.7 * s, 0.5 * s, 0.6 * s, -0.25 * s);
      for (let i = 0; i < 5; i++) P.box("dirt", 0.7 * s, 0.012, 0.03, 0.6 * s, 0.006, -0.25 * s - 0.2 * s + i * 0.1 * s);
      P.box("timber", 0.02, 0.12, 0.02, -0.9 * s, 0, 0.05 * s); // fence posts
      P.box("timber", 0.02, 0.12, 0.02, -0.2 * s, 0, 0.05 * s);
      P.box("timber", 0.7 * s, 0.02, 0.02, -0.55 * s, 0.09, 0.05 * s);
    }
    if (tier >= 1) emit(0.12 * s, 0.42 * s, -0.05 * s, 0.05);
    // haystacks
    P.cone("thatch", 0.09 * s, 0.14 * s, 0.35 * s, 0, 0.25 * s, 8);
    if (tier >= 3) P.cone("thatch", 0.08 * s, 0.12 * s, 0.5 * s, 0, 0.35 * s, 8);
  },
  Boscaiolo({ P, tier, s }) {
    P.house(0.34 * s, 0.3 * s, 0.24 * s, 0, 0.15, 0, "roofSlate", "timber", tier);
    // log pile
    for (let i = 0; i < 3; i++) P.cyl("trunk", 0.04 * s, 0.04 * s, 0.34 * s, 0.32 * s + (i - 1) * 0.085 * s, 0, 0.12 * s, 7, Math.PI / 2);
    for (let i = 0; i < 2; i++) P.cyl("trunk", 0.04 * s, 0.04 * s, 0.34 * s, 0.32 * s + (i - 0.5) * 0.085 * s, 0.07 * s, 0.12 * s, 7, Math.PI / 2);
    if (tier >= 2) P.cyl("trunk", 0.04 * s, 0.04 * s, 0.34 * s, 0.32 * s, 0.14 * s, 0.12 * s, 7, Math.PI / 2);
    P.tree(-0.42 * s, -0.25 * s, 0.9 * s);
    P.tree(-0.55 * s, 0.15 * s, 0.75 * s);
    if (tier >= 2) P.tree(0.55 * s, -0.35 * s, 0.85 * s);
    if (tier >= 3) P.tree(-0.15 * s, -0.5 * s, 1.0 * s);
    // stump + axe
    P.cyl("trunk", 0.05 * s, 0.06 * s, 0.08 * s, 0.05 * s, 0, 0.35 * s, 7);
  },
  "Cava d'Argilla"({ P, tier, s, emit }) {
    P.disc("clay", 0.36 * s, -0.3 * s, -0.1 * s, 0.006, 16);
    P.cyl("clay", 0.28 * s, 0.34 * s, 0.04, -0.3 * s, -0.03, -0.1 * s, 16); // pit rim
    // kiln dome
    P.sphere("stone", 0.17 * s, 0.32 * s, 0.0, 0.05 * s, 1, true);
    P.cyl("dark", 0.05 * s, 0.05 * s, 0.05, 0.32 * s, 0.14 * s, 0.05 * s, 8);
    P.box("dark", 0.08 * s, 0.09 * s, 0.03, 0.32 * s, 0.0, 0.2 * s);
    emit(0.32 * s, 0.2 * s, 0.05 * s, 0.06);
    // brick stacks
    P.box("clay", 0.16 * s, 0.08 * s, 0.1 * s, 0.05 * s, 0, 0.3 * s);
    if (tier >= 2) P.box("clay", 0.16 * s, 0.08 * s, 0.1 * s, -0.15 * s, 0, 0.32 * s);
    if (tier >= 3) P.sphere("stone", 0.14 * s, 0.05 * s, 0, -0.3 * s, 1, true);
    P.house(0.28 * s, 0.24 * s, 0.2 * s, 0.45 * s, 0.35 * s, 0, "roofRed", "plaster", tier);
  },
  "Miniera di Ferro"(c) {
    mine(c, "metal");
  },
  "Miniera d'Oro"(c) {
    mine(c, "gold");
  },
  Magazzino({ P, tier, s }) {
    P.house(0.52 * s, 0.4 * s, 0.3 * s, 0, 0, 0, "roofSlate", "timber", tier);
    for (let i = 0; i < 2 + tier; i++) P.cyl("timber", 0.045 * s, 0.05 * s, 0.09 * s, 0.34 * s + (i % 2) * 0.1 * s, 0, 0.1 * s - Math.floor(i / 2) * 0.1 * s, 8);
    P.box("plaster", 0.14 * s, 0.1 * s, 0.14 * s, -0.36 * s, 0, 0.12 * s, 0.3);
    if (tier >= 3) P.house(0.3 * s, 0.3 * s, 0.22 * s, -0.5 * s, -0.3 * s, 0.5, "roofSlate", "timber", 1);
  },
  Caserma({ P, tier, s, faction }) {
    P.house(0.56 * s, 0.32 * s, 0.26 * s, 0, -0.1 * s, 0, "roofSlate", "stone", tier);
    // training yard: dummies
    for (let i = 0; i < 1 + tier; i++) {
      const x = -0.3 * s + i * 0.2 * s;
      P.box("timber", 0.025, 0.2 * s, 0.025, x, 0, 0.32 * s);
      P.box("timber", 0.12 * s, 0.025, 0.025, x, 0.13 * s, 0.32 * s);
      P.sphere("thatch", 0.03 * s, x, 0.21 * s, 0.32 * s);
    }
    // banner poles
    P.box("timber", 0.02, 0.5 * s, 0.02, 0.36 * s, 0, 0.24 * s);
    P.box("cloth", 0.12 * s, 0.09 * s, 0.01, 0.42 * s, 0.4 * s, 0.24 * s);
    if (tier >= 3) {
      P.cyl("stone", 0.09 * s, 0.1 * s, 0.6 * s, -0.4 * s, 0, -0.2 * s, 8);
      P.cone("roofSlate", 0.12 * s, 0.14 * s, -0.4 * s, 0.6 * s, -0.2 * s, 8);
    }
    void faction;
  },
  Universita({ P, tier, s }) {
    P.box("stone", 0.34 * s, 0.5 * s, 0.34 * s, 0, 0, 0);
    P.sphere("roofSlate", 0.2 * s, 0, 0.5 * s, 0, 0.8, true);
    P.cyl("gold", 0.01, 0.02, 0.1 * s, 0, 0.66 * s, 0, 6);
    for (let i = 0; i < 4; i++) P.box("window", 0.05 * s, 0.08 * s, 0.02, (i % 2 ? 0.1 : -0.1) * s, 0.18 * s + Math.floor(i / 2) * 0.18 * s, 0.171 * s);
    if (tier >= 2) P.house(0.3 * s, 0.26 * s, 0.22 * s, 0.4 * s, 0.02 * s, 0, "roofSlate", "stone", 1);
    if (tier >= 3) {
      P.box("stone", 0.2 * s, 0.7 * s, 0.2 * s, -0.36 * s, 0, -0.05 * s);
      P.sphere("roofSlate", 0.13 * s, -0.36 * s, 0.7 * s, -0.05 * s, 0.8, true);
    }
  },
  "Sala della Casata"({ P, tier, s }) {
    P.house(0.5 * s, 0.36 * s, 0.32 * s, 0, 0, 0, "roofRed", "cream", tier);
    P.box("stone", 0.6 * s, 0.04, 0.5 * s, 0, -0.02, 0.02 * s); // plinth
    if (tier >= 2) P.house(0.24 * s, 0.24 * s, 0.4 * s, -0.3 * s, -0.1 * s, 0, "roofRed", "cream", 1);
    if (tier >= 3) P.house(0.24 * s, 0.24 * s, 0.4 * s, 0.3 * s, -0.1 * s, 0, "roofRed", "cream", 1);
  },
  "Comando Sentinelle"({ P, tier, s }) {
    const h = (0.55 + tier * 0.12) * s;
    P.box("timber", 0.16 * s, h, 0.16 * s, 0, 0, 0);
    P.box("timber", 0.3 * s, 0.03, 0.3 * s, 0, h, 0);
    P.box("timber", 0.3 * s, 0.08 * s, 0.02, 0, h + 0.03, 0.14 * s);
    P.box("timber", 0.3 * s, 0.08 * s, 0.02, 0, h + 0.03, -0.14 * s);
    P.cyl("dark", 0.05 * s, 0.03 * s, 0.05 * s, 0, h + 0.03, 0, 8);
    P.sphere("window", 0.035 * s, 0, h + 0.1 * s, 0); // brazier glow
    P.gable("roofSlate", 0.36 * s, 0.36 * s, 0.14 * s, 0, h + 0.18 * s, 0);
    P.box("timber", 0.02, h + 0.18 * s, 0.02, 0.14 * s, 0, 0.14 * s);
    P.box("timber", 0.02, h + 0.18 * s, 0.02, -0.14 * s, 0, 0.14 * s);
    P.box("timber", 0.02, h + 0.18 * s, 0.02, 0.14 * s, 0, -0.14 * s);
    P.box("timber", 0.02, h + 0.18 * s, 0.02, -0.14 * s, 0, -0.14 * s);
    if (tier >= 2) P.house(0.26 * s, 0.22 * s, 0.18 * s, 0.32 * s, 0.05 * s, 0, "roofSlate", "stone", 1);
  },
  Caravanserraglio({ P, tier, s }) {
    P.box("sand", 0.62 * s, 0.26 * s, 0.14 * s, 0, 0, -0.24 * s);
    P.box("sand", 0.14 * s, 0.26 * s, 0.5 * s, -0.24 * s, 0, 0);
    P.box("sand", 0.14 * s, 0.26 * s, 0.5 * s, 0.24 * s, 0, 0);
    for (let i = -1; i <= 1; i++) P.box("dark", 0.1 * s, 0.16 * s, 0.03, i * 0.17 * s, 0.02, -0.16 * s);
    P.box("roofRed", 0.66 * s, 0.03, 0.18 * s, 0, 0.26 * s, -0.24 * s);
    // parked cart
    P.box("timber", 0.16 * s, 0.07 * s, 0.1 * s, 0, 0.07 * s, 0.1 * s);
    P.cyl("timber", 0.045 * s, 0.045 * s, 0.02, -0.07 * s, 0.025 * s, 0.1 * s, 8, Math.PI / 2);
    P.cyl("timber", 0.045 * s, 0.045 * s, 0.02, 0.07 * s, 0.025 * s, 0.1 * s, 8, Math.PI / 2);
    if (tier >= 2) P.box("cloth", 0.17 * s, 0.06 * s, 0.11 * s, 0, 0.14 * s, 0.1 * s);
    if (tier >= 3) P.box("sand", 0.62 * s, 0.14 * s, 0.14 * s, 0, 0.26 * s, -0.24 * s);
  },
  "Sala dell'Alleanza"({ P, tier, s }) {
    P.house(0.46 * s, 0.36 * s, 0.3 * s, 0, 0, 0, "roofSlate", "stone", tier);
    for (const x of [-0.2, 0.2]) {
      P.box("timber", 0.02, 0.5 * s, 0.02, x * s, 0, 0.26 * s);
      P.box("cloth", 0.1 * s, 0.08 * s, 0.01, x * s + 0.055 * s, 0.4 * s, 0.26 * s);
    }
    if (tier >= 2) P.box("stone", 0.5 * s, 0.04, 0.44 * s, 0, -0.02, 0.02 * s);
    if (tier >= 3) P.house(0.26 * s, 0.26 * s, 0.36 * s, -0.36 * s, -0.12 * s, 0, "roofSlate", "stone", 1);
  },
  "Sala di Guerra"({ P, tier, s }) {
    P.house(0.5 * s, 0.34 * s, 0.3 * s, 0, 0, 0, "roofSlate", "dark", tier);
    // spiked palisade front
    for (let i = -2; i <= 2; i++) P.cone("timber", 0.02, 0.16 * s, i * 0.12 * s, 0, 0.3 * s, 5);
    P.box("timber", 0.02, 0.55 * s, 0.02, 0.32 * s, 0, 0.2 * s);
    P.box("cloth", 0.14 * s, 0.1 * s, 0.01, 0.39 * s, 0.44 * s, 0.2 * s);
    if (tier >= 3) P.house(0.22 * s, 0.22 * s, 0.4 * s, -0.36 * s, -0.08 * s, 0, "roofSlate", "dark", 1);
  },
  Scuderia({ P, tier, s }) {
    P.box("timber", 0.6 * s, 0.22 * s, 0.26 * s, 0, 0, -0.16 * s);
    P.gable("thatch", 0.66 * s, 0.32 * s, 0.14 * s, 0, 0.22 * s, -0.16 * s);
    // paddock fence
    for (const [x, z] of [[-0.3, 0.3], [0.3, 0.3], [-0.3, 0.02], [0.3, 0.02]]) P.box("timber", 0.02, 0.1 * s, 0.02, x * s, 0, z * s);
    P.box("timber", 0.62 * s, 0.015, 0.015, 0, 0.08 * s, 0.3 * s);
    P.box("timber", 0.015, 0.015, 0.3 * s, -0.3 * s, 0.08 * s, 0.16 * s);
    P.box("timber", 0.015, 0.015, 0.3 * s, 0.3 * s, 0.08 * s, 0.16 * s);
    for (let i = 0; i < tier; i++) horse(P, (-0.15 + i * 0.16) * s, 0.16 * s, s, i * 0.7);
  },
  Porto({ P, tier, s }) {
    P.disc("water", 0.75 * s, 0, -0.55 * s, 0.003, 20);
    P.box("timber", 0.16 * s, 0.03, 0.7 * s, 0, 0.04, -0.4 * s);
    for (let i = 0; i < 4; i++) P.cyl("timber", 0.015, 0.015, 0.1, (i % 2 ? 0.07 : -0.07) * s, 0, (-0.15 - Math.floor(i / 2) * 0.45) * s, 6);
    P.house(0.3 * s, 0.26 * s, 0.22 * s, 0.32 * s, 0.1 * s, 0, "roofSlate", "timber", tier);
    if (tier >= 2) P.cyl("timber", 0.045 * s, 0.05 * s, 0.09 * s, -0.24 * s, 0, 0.12 * s, 8);
    if (tier >= 3) P.cyl("stone", 0.06 * s, 0.07 * s, 0.4 * s, -0.4 * s, 0, -0.1 * s, 8);
  },
  Officina({ P, tier, s }) {
    P.house(0.44 * s, 0.32 * s, 0.26 * s, 0, -0.08 * s, 0, "roofSlate", "timber", tier);
    // catapult frame
    P.box("timber", 0.24 * s, 0.03, 0.12 * s, 0.4 * s, 0.03, 0.2 * s);
    P.box("timber", 0.02, 0.16 * s, 0.02, 0.32 * s, 0.05, 0.2 * s);
    P.box("timber", 0.02, 0.16 * s, 0.02, 0.48 * s, 0.05, 0.2 * s);
    P.box("timber", 0.02, 0.26 * s, 0.02, 0.4 * s, 0.05, 0.2 * s, 0.9);
    P.cyl("timber", 0.045 * s, 0.045 * s, 0.02, 0.3 * s, 0.02, 0.27 * s, 8, Math.PI / 2);
    P.cyl("timber", 0.045 * s, 0.045 * s, 0.02, 0.5 * s, 0.02, 0.27 * s, 8, Math.PI / 2);
    P.box("metal", 0.08 * s, 0.05 * s, 0.05 * s, -0.3 * s, 0.06 * s, 0.24 * s); // anvil
    P.box("timber", 0.06 * s, 0.06 * s, 0.06 * s, -0.3 * s, 0, 0.24 * s);
    if (tier >= 2) P.box("stone", 0.1 * s, 0.34 * s, 0.1 * s, -0.16 * s, 0, -0.2 * s); // forge chimney
    if (tier >= 3) P.house(0.24 * s, 0.22 * s, 0.2 * s, -0.42 * s, -0.12 * s, 0, "roofSlate", "timber", 1);
  },
  Bestiario({ P, tier, s }) {
    P.house(0.36 * s, 0.3 * s, 0.24 * s, 0, -0.14 * s, 0, "thatch", "timber", tier);
    for (let c = 0; c < tier; c++) {
      const cx = (-0.32 + c * 0.32) * s;
      const cz = 0.26 * s;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        P.cyl("metal", 0.008, 0.008, 0.18 * s, cx + Math.cos(a) * 0.11 * s, 0, cz + Math.sin(a) * 0.11 * s, 4);
      }
      P.cyl("metal", 0.12 * s, 0.12 * s, 0.015, cx, 0.18 * s, cz, 12);
      P.box(c === 1 ? "thatch" : c === 2 ? "plaster" : "trunk", 0.1 * s, 0.07 * s, 0.14 * s, cx, 0, cz, 0.4 * c); // beast
    }
  },
  Tempio({ P, tier, s }) {
    P.box("cream", 0.6 * s, 0.05, 0.5 * s, 0, 0, 0);
    P.box("cream", 0.52 * s, 0.05, 0.42 * s, 0, 0.05, 0);
    for (let i = 0; i < 6; i++) P.cyl("cream", 0.03 * s, 0.035 * s, 0.34 * s, (i % 3 - 1) * 0.2 * s, 0.1, i < 3 ? 0.17 * s : -0.17 * s, 8);
    P.box("cream", 0.5 * s, 0.05, 0.42 * s, 0, 0.44 * s, 0);
    P.gable("roofRed", 0.56 * s, 0.48 * s, 0.14 * s, 0, 0.49 * s, 0, Math.PI / 2);
    P.box("dark", 0.22 * s, 0.3 * s, 0.22 * s, 0, 0.1, 0);
    P.box("window", 0.08 * s, 0.14 * s, 0.02, 0, 0.14 * s, 0.12 * s);
    P.sphere("gold", 0.04 * s, 0, 0.66 * s, 0);
    if (tier >= 2) P.cyl("gold", 0.03 * s, 0.03 * s, 0.02, 0, 0.7 * s, 0, 8);
    if (tier >= 3) {
      P.box("cream", 0.14 * s, 0.6 * s, 0.14 * s, 0.38 * s, 0, -0.1 * s);
      P.cone("roofRed", 0.1 * s, 0.14 * s, 0.38 * s, 0.6 * s, -0.1 * s, 4);
    }
  },
  "Santuario Mitico"({ P, tier, s }) {
    P.disc("stone", 0.42 * s, 0, 0, 0.006, 8);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      P.box("rock", 0.08 * s, (0.26 + (i % 2) * 0.08) * s, 0.06 * s, Math.cos(a) * 0.32 * s, 0, Math.sin(a) * 0.32 * s, -a);
    }
    if (tier >= 2) for (let i = 0; i < 3; i++) P.box("rock", 0.3 * s, 0.05 * s, 0.06 * s, Math.cos((i / 3) * Math.PI * 2 + 0.5) * 0.32 * s, 0.3 * s, Math.sin((i / 3) * Math.PI * 2 + 0.5) * 0.32 * s, -((i / 3) * Math.PI * 2 + 0.5) + Math.PI / 2);
    P.cyl("stone", 0.09 * s, 0.11 * s, 0.1 * s, 0, 0, 0, 8);
  },
};

function mine(c: Ctx, ore: MatKey) {
  const { P, tier, s } = c;
  P.sphere("rock", 0.36 * s, 0, 0, -0.26 * s, 0.75, true);
  P.box("dark", 0.16 * s, 0.16 * s, 0.1 * s, 0, 0, 0.05 * s);
  P.box("timber", 0.02, 0.18 * s, 0.02, -0.09 * s, 0, 0.1 * s);
  P.box("timber", 0.02, 0.18 * s, 0.02, 0.09 * s, 0, 0.1 * s);
  P.box("timber", 0.22 * s, 0.03, 0.03, 0, 0.18 * s, 0.1 * s);
  // rails + cart
  P.box("metal", 0.012, 0.01, 0.5 * s, -0.04 * s, 0.006, 0.3 * s);
  P.box("metal", 0.012, 0.01, 0.5 * s, 0.04 * s, 0.006, 0.3 * s);
  P.box("timber", 0.1 * s, 0.07 * s, 0.12 * s, 0, 0.03, 0.3 * s);
  P.box(ore, 0.08 * s, 0.03 * s, 0.09 * s, 0, 0.1 * s, 0.3 * s);
  for (let i = 0; i < tier; i++) P.sphere(ore, 0.05 * s, (0.28 + i * 0.1) * s, 0.03 * s, (0.1 + (i % 2) * 0.1) * s, 0.7);
  if (tier >= 2) P.house(0.24 * s, 0.22 * s, 0.18 * s, -0.4 * s, 0.2 * s, 0, "roofSlate", "timber", 1);
  if (tier >= 3) {
    P.box("timber", 0.02, 0.4 * s, 0.02, 0.36 * s, 0, -0.1 * s); // hoist
    P.box("timber", 0.02, 0.4 * s, 0.02, 0.46 * s, 0, -0.1 * s);
    P.box("timber", 0.14 * s, 0.02, 0.02, 0.41 * s, 0.4 * s, -0.1 * s);
  }
}

function horse(P: Parts, x: number, z: number, s: number, rot: number) {
  P.box("trunk", 0.07 * s, 0.07 * s, 0.16 * s, x, 0.06 * s, z, rot);
  P.box("trunk", 0.04 * s, 0.09 * s, 0.05 * s, x + Math.sin(rot) * 0.09 * s, 0.1 * s, z + Math.cos(rot) * 0.09 * s, rot);
  for (const [lx, lz] of [[-0.025, 0.06], [0.025, 0.06], [-0.025, -0.06], [0.025, -0.06]]) {
    const wx = x + Math.cos(rot) * lx * s + Math.sin(rot) * lz * s;
    const wz = z - Math.sin(rot) * lx * s + Math.cos(rot) * lz * s;
    P.box("trunk", 0.015, 0.06 * s, 0.015, wx, 0, wz, rot);
  }
}

// ------------------------------------------------------------------------------------------------ village
export function buildVillage(input: VillageInput, factory: EntityFactory, faction: THREE.Color, terrainColor: THREE.Color): Village {
  const rnd = seeded(input.settlementId);
  const group = new THREE.Group();
  const mats = makeMaterials(faction);
  mats.grass.color.copy(terrainColor);
  const anchors: VillageAnchor[] = [];
  const emitters: SmokeEmitter[] = [];
  const waypoints: Waypoint[] = [];
  const pickables: THREE.Object3D[] = [];
  const nightMats = [mats.window];
  const smokeColor = new THREE.Color("#d8d2c8");
  const emit = (x: number, y: number, z: number, size = 0.05) => emitters.push({ x, y, z, size, rise: 0.5, period: 2.6, puffs: 5, color: smokeColor });

  const level = Math.max(1, input.level);
  const sc = settlementScale(level);
  const castleR = 1.15 * sc;
  const R1 = castleR + 1.25; // ring road
  const R2 = R1 + 2.6; // resource ring
  const R3 = R2 + 1.6; // walls
  const P = new Parts();

  // ---- castle (same rigs as the world map)
  const fake: SettlementPublic = { settlement_id: input.settlementId, kind: "PLAYER", name: "", x: -1, y: -1, terrain: input.terrain as any, terrain_defender_bonus_pct: 0, region: "", port_eligible: input.portEligible, level, owner_player_id: "me", owner_house_crest: input.crest, skin: input.skin, faction: "OWN", wall_level: input.wallLevel };
  const castle = factory.buildSettlements([fake], () => 0);
  castle.group.position.set(0.5, 0, 0.5);
  // the map-only faction ring has no meaning inside your own city
  castle.group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.type === "RingGeometry") o.visible = false;
  });
  group.add(castle.group);
  // castle chimney / torch smoke was sized for the far map camera — thinner puffs up close
  for (const e of castle.emitters) emitters.push({ ...e, x: e.x + 0.5, z: e.z + 0.5, size: e.size * 0.45, rise: e.rise * 0.75, puffs: Math.min(e.puffs, 4) });
  anchors.push({ name: "Castello / Fortezza", x: 0, z: 0, r: castleR, level });
  const castlePick = new THREE.Mesh(new THREE.CylinderGeometry(castleR, castleR, 2.6 * sc, 12), new THREE.MeshBasicMaterial({ visible: false }));
  castlePick.position.y = 1.3 * sc;
  castlePick.userData.building = "Castello / Fortezza";
  group.add(castlePick);
  pickables.push(castlePick);

  // ---- ground, roads
  P.begin(0, 0, 0);
  P.disc("grass", R3 + 4.5, 0, 0, 0, 48);
  P.disc("dirt", R1 + 0.28, 0, 0, 0.003, 40, R1 - 0.28);
  P.disc("dirt", R2 + 0.18, 0, 0, 0.003, 44, R2 - 0.18);
  P.plane("dirt", 0.7, R3 + 2.2 - castleR + 0.3, 0, (castleR - 0.3 + R3 + 2.2) / 2, 0, 0.004); // main road to the gate and beyond
  P.disc("dirt", castleR + 0.35, 0, 0, 0.002, 32, castleR - 0.1); // castle apron
  const gate = { x: 0, z: R3 };
  waypoints.push({ x: 0, z: castleR + 0.4, kind: "gate" }, { x: 0, z: R3 - 0.3, kind: "gate" }, { x: 0, z: R2, kind: "ring" });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    waypoints.push({ x: Math.sin(a) * R1, z: Math.cos(a) * R1, kind: "ring" });
  }

  // ---- civic ring
  const built = (name: string) => input.buildings[name] ?? 0;
  const place = (name: string, cx: number, cz: number, facing: number, radiusHint: number) => {
    const lvl = built(name);
    const unlocked = input.unlocked.includes(name) || lvl > 0;
    if (!unlocked) return;
    const tier = tierOf(lvl);
    const s = VS * (0.9 + Math.min(30, lvl) * 0.018);
    anchors.push({ name, x: cx, z: cz, r: radiusHint * s, level: lvl });
    // door waypoint just in front of the lot (towards the facing direction)
    waypoints.push({ x: cx + Math.sin(facing) * 0.5, z: cz + Math.cos(facing) * 0.5, kind: "door" });
    P.begin(cx, cz, facing);
    if (tier === 0) {
      // vacant lot: dirt + sign + stacked timber
      P.disc("dirt", 0.42 * VS, 0, 0, 0.006, 12);
      P.box("timber", 0.03, 0.34, 0.03, 0, 0, 0.3 * VS);
      P.box("plaster", 0.28, 0.14, 0.03, 0, 0.28, 0.3 * VS);
      P.box("timber", 0.2, 0.06, 0.2, 0.25, 0, -0.2, 0.5);
      P.box("timber", 0.16, 0.06, 0.16, -0.25, 0, -0.15, 0.2);
    } else {
      MODELS[name]?.({ P, lvl, tier, s, emit: (x, y, z, size) => emitLocal(cx, cz, facing, x, y, z, size), faction, frame: { x: cx, z: cz, rot: facing } });
    }
    const pick = new THREE.Mesh(new THREE.CylinderGeometry(radiusHint * s, radiusHint * s, 0.9, 10), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.set(cx, 0.45, cz);
    pick.userData.building = name;
    group.add(pick);
    pickables.push(pick);
  };
  const emitLocal = (cx: number, cz: number, rot: number, x: number, y: number, z: number, size?: number) => {
    const wx = cx + Math.cos(rot) * x + Math.sin(rot) * z;
    const wz = cz - Math.sin(rot) * x + Math.cos(rot) * z;
    emit(wx, y, wz, size);
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
    if (name !== "Porto") P.plane("dirt", 0.3, r - 0.7 - R1, Math.sin(a) * ((R1 + r - 0.7) / 2), Math.cos(a) * ((R1 + r - 0.7) / 2), a, 0.0035);
  }

  // ---- filler houses (grow with the level) between the rings, away from the roads and the resource lots
  const nHouses = Math.min(26, 2 + Math.round(level * 0.85));
  const blocked = Object.values(OUTER).map((d) => d * D2R);
  let placed = 0;
  for (let tries = 0; tries < 400 && placed < nHouses; tries++) {
    const a = rnd() * Math.PI * 2;
    const norm = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const nearRoad = norm < 10 * D2R || norm > 350 * D2R;
    const nearLot = blocked.some((b) => Math.abs(Math.atan2(Math.sin(norm - b), Math.cos(norm - b))) < 24 * D2R);
    if (nearRoad || nearLot) continue;
    const r = R1 + 1.35 + rnd() * 0.8;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (anchors.some((k) => Math.hypot(k.x - x, k.z - z) < k.r + 0.55 * VS)) continue;
    P.begin(x, z, a + Math.PI + (rnd() - 0.5) * 0.5);
    const big = placed % 3 === 0;
    const hs = VS * (big ? 1.3 : 1);
    P.house(0.26 * hs, 0.22 * hs, 0.2 * hs, 0, 0, 0, rnd() < 0.5 ? "roofRed" : rnd() < 0.5 ? "thatch" : "roofSlate", rnd() < 0.3 ? "timber" : "plaster", level >= 10 ? 2 : 1);
    if (big && level >= 8) emitLocal(x, z, a + Math.PI, 0.09 * hs, 0.34 * hs, -0.05 * hs, 0.05);
    anchors.push({ name: "", x, z, r: 0.3 * hs, level: 0 });
    waypoints.push({ x: x + Math.sin(a + Math.PI) * 0.35 * hs, z: z + Math.cos(a + Math.PI) * 0.35 * hs, kind: "door" });
    placed++;
  }

  // ---- market by the gate (L5+): stalls with awnings
  if (level >= 5) {
    const stalls = level >= 15 ? 4 : 2;
    for (let i = 0; i < stalls; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (0.75 + Math.floor(i / 2) * 0.05);
      const z = R1 + 1.4 + Math.floor(i / 2) * 0.7;
      const k = VS;
      P.begin(x, z, side > 0 ? -Math.PI / 2 : Math.PI / 2);
      P.box("timber", 0.3 * k, 0.12 * k, 0.18 * k, 0, 0.1 * k, 0);
      for (const [px, pz] of [[-0.13, -0.07], [0.13, -0.07], [-0.13, 0.07], [0.13, 0.07]]) P.box("timber", 0.02, 0.3 * k, 0.02, px * k, 0, pz * k);
      P.gable(i % 2 ? "cloth" : "roofRed", 0.36 * k, 0.26 * k, 0.08 * k, 0, 0.3 * k, 0);
      P.box(i % 2 ? "field" : "clay", 0.08 * k, 0.06 * k, 0.08 * k, -0.08 * k, 0.22 * k, 0, 0.3);
      P.box(i % 2 ? "gold" : "thatch", 0.08 * k, 0.05 * k, 0.08 * k, 0.07 * k, 0.22 * k, 0, 0.1);
      waypoints.push({ x: x - side * 0.45, z, kind: "market" });
    }
  }

  // ---- walls (Mura level): height & towers grow, gatehouse on the road
  const wl = Math.max(0, input.wallLevel);
  if (wl > 0) {
    const segs = 36;
    const hW = (0.32 + Math.min(30, wl) * 0.02) * VS;
    const thick = (0.2 + wl * 0.004) * VS;
    const segLen = (2 * Math.PI * R3) / segs;
    for (let i = 0; i < segs; i++) {
      const a = ((i + 0.5) / segs) * Math.PI * 2;
      const norm = a > Math.PI ? a - Math.PI * 2 : a;
      if (Math.abs(norm) < 6 * D2R) continue; // gate opening
      P.begin(Math.sin(a) * R3, Math.cos(a) * R3, a);
      P.box("stone", segLen * 1.02, hW, thick, 0, 0, 0);
      P.box("stone", segLen * 1.02, 0.05, thick * 1.25, 0, hW, 0); // parapet lip
      if (wl >= 10) for (let k = -2; k <= 2; k++) P.box("stone", segLen * 0.1, 0.06, thick * 0.5, k * segLen * 0.2, hW + 0.05, thick * 0.3);
    }
    const towers = wl >= 20 ? 12 : wl >= 10 ? 8 : 4;
    for (let i = 0; i < towers; i++) {
      const a = ((i + 0.5) / towers) * Math.PI * 2;
      const tr = (0.16 + wl * 0.003) * VS;
      P.begin(Math.sin(a) * R3, Math.cos(a) * R3, 0);
      P.cyl("stone", tr, tr * 1.08, hW + 0.32, 0, 0, 0, 10);
      P.cone("roofSlate", tr * 1.25, 0.24 * VS, 0, hW + 0.32, 0, 10);
      waypoints.push({ x: Math.sin(a) * (R3 - 0.45), z: Math.cos(a) * (R3 - 0.45), kind: "wall" });
    }
    // gatehouse
    for (const sx of [-1, 1]) {
      P.begin(sx * 0.62, R3, 0);
      P.box("stone", 0.4, hW + 0.5, 0.5, 0, 0, 0);
      P.box("stone", 0.46, 0.06, 0.56, 0, hW + 0.5, 0);
      P.box("cloth", 0.01, 0.2, 0.14, sx * 0.21, hW + 0.15, 0.14);
    }
    P.begin(0, R3, 0);
    P.box("stone", 1.24, 0.2, 0.34, 0, hW + 0.05, 0); // lintel
    P.box("timber", 0.8, hW + 0.02, 0.04, 0, 0, -0.2); // open doors (leaves along the passage)
  }

  // ---- countryside beyond the walls
  const nTrees = 10 + Math.min(14, level);
  for (let i = 0; i < nTrees; i++) {
    const a = rnd() * Math.PI * 2;
    const norm = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (norm < 12 * D2R || norm > 348 * D2R) continue;
    const r = R3 + 0.9 + rnd() * 2.6;
    P.begin(0, 0, 0);
    P.tree(Math.sin(a) * r, Math.cos(a) * r, 1.0 + rnd() * 0.9);
  }
  for (let i = 0; i < 5; i++) {
    const a = rnd() * Math.PI * 2;
    const r = R3 + 1.2 + rnd() * 2;
    P.begin(0, 0, 0);
    P.sphere("rock", 0.1 + rnd() * 0.12, Math.sin(a) * r, 0, Math.cos(a) * r, 0.6, true);
  }

  for (const m of P.build(mats)) group.add(m);

  // ---- animated pieces
  const animated: Village["animated"] = { windmills: [], crystal: null, boat: null };
  const fLvl = built("Fattoria");
  if (fLvl >= 20) {
    const a = OUTER.Fattoria * D2R;
    const r = R2 + 0.6;
    const s = VS * (0.9 + Math.min(30, fLvl) * 0.018);
    const base = new THREE.Group();
    base.position.set(Math.sin(a) * r + Math.cos(a) * 0.62 * s, 0, Math.cos(a) * r - Math.sin(a) * 0.62 * s);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * s, 0.12 * s, 0.5 * s, 8), mats.stone);
    tower.position.y = 0.25 * s;
    tower.castShadow = true;
    base.add(tower);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.12 * s, 0.12 * s, 8), mats.roofSlate);
    cap.position.y = 0.56 * s;
    base.add(cap);
    const hub = new THREE.Group();
    hub.position.set(0, 0.46 * s, 0.12 * s);
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05 * s, 0.34 * s, 0.01), mats.plaster);
      blade.position.y = 0.17 * s;
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
    const crystalMat = new THREE.MeshStandardMaterial({ color: "#8fd3ff", emissive: "#4aa3ff", emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.9 });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.11 * s, 0), crystalMat);
    crystal.position.set(Math.sin(a) * r, 0.34 * s, Math.cos(a) * r);
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
    boat.position.set(cx + Math.cos(rot) * 0.22 * s + Math.sin(rot) * -0.5 * s, 0.02, cz - Math.sin(rot) * 0.22 * s + Math.cos(rot) * -0.5 * s);
    boat.rotation.y = rot + 0.4;
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.12 * s, 0.06 * s, 0.3 * s), mats.timber);
    hull.position.y = 0.03 * s;
    hull.castShadow = true;
    boat.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.3 * s, 6), mats.timber);
    mast.position.y = 0.2 * s;
    boat.add(mast);
    const sail = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.16 * s, 0.14 * s), mats.cream);
    sail.position.set(0.0, 0.22 * s, 0.0);
    boat.add(sail);
    group.add(boat);
    animated.boat = boat;
  }

  const dispose = () => {
    disposeGroup(group); // skips the factory-shared castle parts; village materials are flagged shared and disposed below
    for (const m of Object.values(mats)) {
      m.map?.dispose();
      m.dispose();
    }
  };
  return { group, anchors: anchors.filter((a) => a.name), emitters, waypoints, ring: R1, wallR: R3, gate, animated, nightMats, pickables, dispose };
}
