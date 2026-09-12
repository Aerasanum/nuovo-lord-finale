/**
 * Castle skins + procedural castle parts. Every settlement is assembled from the same shared part geometries (instanced
 * per chunk); a skin only changes colours and which roof variants are used, so adding a skin is pure data.
 *
 * Local frame: origin at the tile centre on the ground, scale 1 ≈ level-1 castle (footprint ≈ 2.2 tiles).
 * Positions use the (sin a, y, cos a) convention so the gate faces +z.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import { mergeGeos, place, ring } from "./geo";

export type RoofStyle = "pyramid" | "cone" | "onion";

export type CastleSkin = {
  id: string;
  name: { it: string; en: string };
  stone: string;
  stoneDark: string;
  roof: string;
  trim: string;
  wood: string;
  keepRoof: RoofStyle;
  towerRoof: "cone" | "pyramid";
  torches: boolean;
};

// Asset colours (physical materials of the 3D models, not UI tokens) — identical in every scheme by design.
export const CASTLE_SKINS: Record<string, CastleSkin> = {
  classic: { id: "classic", name: { it: "Classico", en: "Classic" }, stone: "#A0968A", stoneDark: "#726A5F", roof: "#8E3B2F", trim: "#C89B3C", wood: "#5A3B22", keepRoof: "pyramid", towerRoof: "cone", torches: true },
  royal: { id: "royal", name: { it: "Regale", en: "Royal" }, stone: "#DBD4C6", stoneDark: "#A69E8E", roof: "#2E4A7A", trim: "#E8C56E", wood: "#6B4A2E", keepRoof: "onion", towerRoof: "cone", torches: true },
  obsidian: { id: "obsidian", name: { it: "Ossidiana", en: "Obsidian" }, stone: "#3E3D44", stoneDark: "#25242A", roof: "#4A2340", trim: "#C89B3C", wood: "#2E241E", keepRoof: "cone", towerRoof: "pyramid", torches: true },
  sandstone: { id: "sandstone", name: { it: "Arenaria", en: "Sandstone" }, stone: "#CBA76E", stoneDark: "#9C7A4A", roof: "#3F7A6E", trim: "#E8C56E", wood: "#6B4A2E", keepRoof: "onion", towerRoof: "cone", torches: true },
  ruin: { id: "ruin", name: { it: "Rovina", en: "Ruin" }, stone: "#7E7F75", stoneDark: "#5A5B52", roof: "#5C4A33", trim: "#8C8074", wood: "#3E2E20", keepRoof: "pyramid", towerRoof: "pyramid", torches: false },
};

export const DEFAULT_SKIN = "classic";
export const NEUTRAL_SKIN = "ruin";
export const TORCH_COLOR = "#FFB347";
export const SHADOW_COLOR = "#000000";

export function skinFor(s: { skin?: string | null; faction: string; kind: string }): CastleSkin {
  if (s.kind === "NEUTRAL") return CASTLE_SKINS[NEUTRAL_SKIN];
  return (s.skin && CASTLE_SKINS[s.skin]) || CASTLE_SKINS[DEFAULT_SKIN];
}

export const FLAG_W = 0.42;
export const FLAG_H = 0.27;
export const BANNER_Y = 2.7; // flag centre height (local units)
export const CASTLE_TOP = 2.95; // label anchor
export const TOWER_RADIUS = 0.86;
export const CASTLE_OCTAGON = Math.PI / 8; // wall/plinth rotated so the +z direction is a face centre (the gate)

/** Level 1 → 1.05, level 30 → 1.8 (roughly twice the previous footprint). */
export function settlementScale(level: number): number {
  return 1.05 + (Math.min(30, Math.max(1, level)) / 30) * 0.75;
}

export function towerCount(level: number): number {
  return level >= 10 ? 8 : 4;
}

/** Octagon vertex angles hosting towers: 4 towers flank the sides, 8 use every vertex. */
export function towerAngles(level: number): number[] {
  const all = Array.from({ length: 8 }, (_, k) => CASTLE_OCTAGON + (k * Math.PI) / 4);
  return towerCount(level) === 8 ? all : [all[1], all[2], all[5], all[6]];
}

export const WALL_BANNER_ANGLES = [1, 3, 5, 7].map((k) => (k * Math.PI) / 4);
/** Local emitter anchors (scale 1): chimney on the keep's upper tier, two gate torches, sentinel brazier. */
export const CHIMNEY = { x: 0.21, y: 2.2, z: 0.21 };
export const TORCHES = [
  { x: -0.14, y: 0.52, z: 1.06 },
  { x: 0.14, y: 0.52, z: 1.06 },
];
export const BRAZIER = { x: 0, y: 1.16, z: 0 };

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
/** Softly bevelled block (keeps the silhouette but kills the razor edges of a plain box). */
const rbox = (w: number, h: number, d: number, r = 0.035) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, Math.min(w, h, d) * 0.3));
const cyl = (rt: number, rb: number, h: number, seg: number, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
const cone = (r: number, h: number, seg: number) => new THREE.ConeGeometry(r, h, seg);
/** Curved "witch hat" roof: concave flare at the eaves, pointed tip (lathe; 4 segments → curved pyramid). */
export function hat(r: number, h: number, seg: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(new THREE.Vector2(r * Math.pow(1 - t, 1.45) * (i === n ? 0 : 1), h * t));
  }
  pts.unshift(new THREE.Vector2(0, 0));
  const g = new THREE.LatheGeometry(pts, seg);
  g.translate(0, -h / 2, 0); // centre on the height like ConeGeometry so existing placements hold
  return g;
}

function onionRoof(): THREE.BufferGeometry {
  const pts = [
    [0, 0],
    [0.3, 0.04],
    [0.38, 0.2],
    [0.33, 0.4],
    [0.15, 0.56],
    [0.04, 0.7],
    [0, 0.76],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 12);
}

/** Builds every shared castle/camp/sentinel part once (call from the entity factory). */
export function buildCastleParts(): Record<string, THREE.BufferGeometry> {
  const shadow = new THREE.CircleGeometry(1.32, 24);
  shadow.rotateX(-Math.PI / 2);
  shadow.translate(0, 0.012, 0);
  const factionRing = new THREE.RingGeometry(1.14, 1.22, 40);
  factionRing.rotateX(-Math.PI / 2);
  factionRing.translate(0, 0.02, 0);

  const plinth = place(cyl(0.98, 1.08, 0.18, 16), 0, 0.09, 0, CASTLE_OCTAGON);

  const walkway = new THREE.RingGeometry(0.7, 0.86, 8, 1, CASTLE_OCTAGON);
  walkway.rotateX(-Math.PI / 2);
  walkway.translate(0, 0.73, 0);
  const wall = mergeGeos([
    place(cyl(0.84, 0.9, 0.55, 8, true), 0, 0.455, 0, CASTLE_OCTAGON),
    walkway,
    ...ring(8, 0.855, 0.78, () => rbox(0.075, 0.1, 0.07, 0.015), -0.19),
    ...ring(8, 0.855, 0.78, () => rbox(0.075, 0.1, 0.07, 0.015), 0),
    ...ring(8, 0.855, 0.78, () => rbox(0.075, 0.1, 0.07, 0.015), 0.19),
  ]);

  const keep = mergeGeos([
    place(rbox(0.66, 0.95, 0.66), 0, 0.655, 0),
    place(rbox(0.74, 0.06, 0.74, 0.02), 0, 1.16, 0),
    place(rbox(0.5, 0.45, 0.5), 0, 1.415, 0),
    place(box(0.1, 0.6, 0.1), CHIMNEY.x, CHIMNEY.y - 0.3, CHIMNEY.z), // chimney (smoke emitter), clears every roof style
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => place(cyl(0.045, 0.05, 0.97, 8), sx * 0.33, 0.665, sz * 0.33))),
  ]);
  const windows = mergeGeos([
    ...[-1, 1].flatMap((side) =>
      [0.7, 1.0].flatMap((y) => [
        place(box(0.08, 0.15, 0.03), -0.16, y, side * 0.335),
        place(box(0.08, 0.15, 0.03), 0.16, y, side * 0.335),
        place(box(0.03, 0.15, 0.08), side * 0.335, y, -0.16),
        place(box(0.03, 0.15, 0.08), side * 0.335, y, 0.16),
      ]),
    ),
    ...[-1, 1].flatMap((side) => [place(box(0.08, 0.14, 0.03), 0, 1.42, side * 0.255), place(box(0.03, 0.14, 0.08), side * 0.255, 1.42, 0)]),
  ]);
  const keepRoof_pyramid = place(hat(0.42, 0.56, 4), 0, 1.92, 0, Math.PI / 4);
  const keepRoof_cone = place(hat(0.39, 0.66, 12), 0, 1.97, 0);
  const keepRoof_onion = place(onionRoof(), 0, 1.64, 0);
  const turrets = mergeGeos([-1, 1].flatMap((sx) => [-1, 1].flatMap((sz) => [place(cyl(0.06, 0.07, 0.36, 8), sx * 0.25, 1.78, sz * 0.25), place(hat(0.085, 0.16, 8), sx * 0.25, 2.04, sz * 0.25)])));

  const tower = mergeGeos([place(cyl(0.17, 0.21, 0.9, 12), 0, 0.63, 0), place(cyl(0.21, 0.17, 0.06, 12), 0, 1.11, 0), ...ring(8, 0.18, 1.175, () => rbox(0.06, 0.07, 0.05, 0.012))]);
  const towerRoof_cone = place(hat(0.25, 0.4, 12), 0, 1.34, 0);
  const towerRoof_pyramid = place(hat(0.26, 0.36, 4), 0, 1.32, 0, Math.PI / 4);

  const gate = mergeGeos([place(rbox(0.42, 0.52, 0.24), 0, 0.44, 0.92), place(cyl(0.075, 0.09, 0.64, 10), -0.23, 0.5, 0.98), place(cyl(0.075, 0.09, 0.64, 10), 0.23, 0.5, 0.98)]);
  const gateDoor = place(box(0.2, 0.3, 0.03), 0, 0.33, 1.045);
  const gateRoof = mergeGeos([place(hat(0.11, 0.18, 8), -0.23, 0.91, 0.98), place(hat(0.11, 0.18, 8), 0.23, 0.91, 0.98)]);
  const torch = mergeGeos(TORCHES.map((t) => place(new THREE.SphereGeometry(0.045, 6, 5), t.x, t.y, t.z)));
  const torchGlow = mergeGeos(TORCHES.map((t) => place(new THREE.SphereGeometry(0.13, 8, 6), t.x, t.y, t.z)));
  const senGlow = place(new THREE.SphereGeometry(0.24, 8, 6), 0, 1.1, 0);

  const wallBanner = mergeGeos(WALL_BANNER_ANGLES.map((a) => place(new THREE.PlaneGeometry(0.14, 0.28), Math.sin(a) * 0.905, 0.5, Math.cos(a) * 0.905, a)));

  const pole = place(cyl(0.02, 0.02, 0.85, 5), 0, 2.45, 0);
  const flag = new THREE.PlaneGeometry(FLAG_W, FLAG_H);
  flag.translate(FLAG_W / 2, BANNER_Y, 0);
  const flagBorder = new THREE.PlaneGeometry(FLAG_W + 0.05, FLAG_H + 0.05);
  flagBorder.translate(FLAG_W / 2 + 0.01, BANNER_Y, -0.004);

  const tent = mergeGeos([place(cone(0.32, 0.4, 6), 0, 0.2, 0), place(cyl(0.012, 0.012, 0.3, 4), 0, 0.5, 0), place(new THREE.PlaneGeometry(0.16, 0.09), 0.08, 0.6, 0)]);

  const senTower = mergeGeos([place(cyl(0.15, 0.19, 0.95, 6), 0, 0.475, 0), place(cyl(0.22, 0.19, 0.06, 6), 0, 0.98, 0), ...ring(6, 0.2, 1.05, () => box(0.05, 0.06, 0.04))]);
  const senFire = place(new THREE.SphereGeometry(0.1, 8, 6), 0, 1.1, 0);

  const pin = cone(0.9, 2.4, 5);

  // marching army: five soldiers in a wedge (body + head), faction coloured
  const soldier = (x: number, z: number) => [place(cyl(0.07, 0.08, 0.24, 6), x, 0.12, z), place(new THREE.SphereGeometry(0.065, 6, 5), x, 0.3, z)];
  const army = mergeGeos([...soldier(0, 0.18), ...soldier(-0.16, 0.02), ...soldier(0.16, 0.02), ...soldier(-0.3, -0.16), ...soldier(0.3, -0.16), ...soldier(0, -0.16)]);

  return {
    shadow,
    factionRing,
    plinth,
    wall,
    keep,
    windows,
    keepRoof_pyramid,
    keepRoof_cone,
    keepRoof_onion,
    turrets,
    tower,
    towerRoof_cone,
    towerRoof_pyramid,
    gate,
    gateDoor,
    gateRoof,
    torch,
    torchGlow,
    senGlow,
    wallBanner,
    pole,
    flag,
    flagBorder,
    tent,
    senTower,
    senFire,
    pin,
    army,
  };
}
