/**
 * Sentinel towers around the 3D village (feature "Vista Sentinelle Città").
 *
 * Shows the 4 inner (radius 3) + 8 outer (radius 5) Sentinel slots of the settlement just outside the walls, one per
 * direction, with their live state:
 *   GUARDED          → stone tower, lit brazier (flickering), faction flag
 *   UNGUARDED_GRACE  → tower, brazier down to embers, no flag (24 h grace running)
 *   BUILDING         → half-built tower with scaffolding
 *   EMPTY            → stone footing + wooden slot post (nothing built yet)
 *   NATURAL          → pond with reeds and rocks: water is the natural boundary, no tower needed (Bible §14)
 * Self-contained: own materials, own tick (fire flicker, flag wave). To remove the feature delete this file and the
 * `sentinelSlots` field + the single `buildSentinelTowers` call in village.ts / useVillageInput.ts.
 */
import * as THREE from "three";

import type { NaturalSlotDto, SentinelDto } from "@/src/api/hooks";

import type { CityTextures } from "./cityTextures";

export type SentinelSlotState = "GUARDED" | "UNGUARDED_GRACE" | "BUILDING" | "EMPTY" | "NATURAL";
export type SentinelSlot = { direction: string; ring: "INNER" | "OUTER"; state: SentinelSlotState };

const DIRS: Record<string, [number, number]> = { N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1], S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1] };
const INNER = ["N", "E", "S", "W"];
const OUTER = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** Slot list from the sentinels endpoint: inner ring always (once the Comando Sentinelle exists), outer ring once the
 * Perimetro Avanzato research is done or a tower/natural boundary already exists there. */
export function sentinelSlots(data: { sentinels: SentinelDto[]; natural: NaturalSlotDto[]; outer_unlocked: boolean } | undefined, commandLevel: number): SentinelSlot[] {
  if (!data || commandLevel < 1) return [];
  const built = new Map(data.sentinels.map((s) => [`${s.ring}:${s.direction}`, s]));
  const natural = new Map(data.natural.map((n) => [`${n.ring}:${n.direction}`, n]));
  const out: SentinelSlot[] = [];
  const push = (direction: string, ring: "INNER" | "OUTER", locked: boolean) => {
    const key = `${ring}:${direction}`;
    const b = built.get(key);
    const n = natural.get(key);
    if (b) out.push({ direction, ring, state: b.state === "GUARDED" ? "GUARDED" : b.state === "BUILDING" ? "BUILDING" : "UNGUARDED_GRACE" });
    else if (n?.eligible) out.push({ direction, ring, state: "NATURAL" });
    else if (!locked) out.push({ direction, ring, state: "EMPTY" });
  };
  for (const d of INNER) push(d, "INNER", false);
  for (const d of OUTER) push(d, "OUTER", !data.outer_unlocked);
  return out;
}

export type SentinelTowers = { group: THREE.Group; tick(t: number, night: number): void; dispose(): void };

type Opts = { wallR: number; groundY: (x: number, z: number) => number; faction: THREE.Color; tx: CityTextures };

export function buildSentinelTowers(slots: SentinelSlot[], opts: Opts): SentinelTowers {
  const group = new THREE.Group();
  const mats = {
    stone: new THREE.MeshStandardMaterial({ color: "#bdb3a4", map: opts.tx.stone, roughness: 0.8 }),
    stoneDark: new THREE.MeshStandardMaterial({ color: "#8f867a", map: opts.tx.stone, roughness: 0.8 }),
    timber: new THREE.MeshStandardMaterial({ color: "#6b4527", map: opts.tx.planks, roughness: 0.8 }),
    metal: new THREE.MeshStandardMaterial({ color: "#5a5f6a", roughness: 0.45, metalness: 0.6 }),
    dark: new THREE.MeshStandardMaterial({ color: "#3a2f28", roughness: 0.9 }),
    fire: new THREE.MeshStandardMaterial({ color: "#ffb347", emissive: new THREE.Color("#ff7a1a"), emissiveIntensity: 1.6, roughness: 0.6 }),
    ember: new THREE.MeshStandardMaterial({ color: "#5a2a14", emissive: new THREE.Color("#c2401a"), emissiveIntensity: 0.35, roughness: 0.9 }),
    water: new THREE.MeshStandardMaterial({ color: "#3a9be0", roughness: 0.15, transparent: true, opacity: 0.85 }),
    reed: new THREE.MeshStandardMaterial({ color: "#2f8a3c", roughness: 0.9 }),
    rock: new THREE.MeshStandardMaterial({ color: "#9c968c", map: opts.tx.stone, roughness: 0.85 }),
    flag: new THREE.MeshStandardMaterial({ color: opts.faction, side: THREE.DoubleSide, roughness: 0.9 }),
  };
  const geos: THREE.BufferGeometry[] = [];
  const fires: { mesh: THREE.Mesh; phase: number }[] = [];
  const flags: { mesh: THREE.Mesh; phase: number }[] = [];
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rotY = 0): THREE.Mesh => {
    geos.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  for (const slot of slots) {
    const [dx, dz] = DIRS[slot.direction];
    const len = Math.hypot(dx, dz) || 1;
    const r = slot.ring === "INNER" ? opts.wallR + 1.05 : opts.wallR + 2.9;
    const x = (dx / len) * r;
    const z = (dz / len) * r;
    const y = opts.groundY(x, z);
    const face = Math.atan2(-x, -z); // towers look at the castle
    if (slot.state === "NATURAL") {
      // pond: water is the boundary here
      const pond = add(new THREE.CircleGeometry(0.42, 22), mats.water, x, y + 0.012, z);
      pond.rotation.x = -Math.PI / 2;
      pond.castShadow = false;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.7;
        const rk = add(new THREE.DodecahedronGeometry(0.07 + i * 0.02, 0), mats.rock, x + Math.cos(a) * 0.4, y + 0.03, z + Math.sin(a) * 0.4);
        rk.scale.y = 0.6;
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        const rr = 0.3 + (i % 2) * 0.1;
        add(new THREE.CylinderGeometry(0.008, 0.012, 0.22 + (i % 3) * 0.05, 5), mats.reed, x + Math.cos(a) * rr, y + 0.12, z + Math.sin(a) * rr);
      }
      continue;
    }
    // footing (every buildable slot)
    add(new THREE.CylinderGeometry(0.21, 0.24, 0.06, 16), mats.stoneDark, x, y + 0.03, z);
    if (slot.state === "EMPTY") {
      add(new THREE.CylinderGeometry(0.015, 0.02, 0.42, 6), mats.timber, x, y + 0.27, z);
      add(new THREE.BoxGeometry(0.16, 0.09, 0.02), mats.timber, x, y + 0.42, z, face);
      continue;
    }
    const building = slot.state === "BUILDING";
    const h = building ? 0.42 : 0.82;
    add(new THREE.CylinderGeometry(0.14, 0.165, h, 16), mats.stone, x, y + 0.06 + h / 2, z);
    if (building) {
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        add(new THREE.BoxGeometry(0.025, 0.95, 0.025), mats.timber, x + sx * 0.23, y + 0.5, z + sz * 0.23);
      }
      add(new THREE.BoxGeometry(0.5, 0.02, 0.04), mats.timber, x, y + 0.72, z + 0.23);
      add(new THREE.BoxGeometry(0.04, 0.02, 0.5), mats.timber, x - 0.23, y + 0.55, z);
      continue;
    }
    // battlement, brazier, window
    add(new THREE.CylinderGeometry(0.18, 0.15, 0.05, 16), mats.stoneDark, x, y + 0.06 + h + 0.025, z);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      add(new THREE.BoxGeometry(0.06, 0.06, 0.06), mats.stone, x + Math.cos(a) * 0.155, y + 0.06 + h + 0.08, z + Math.sin(a) * 0.155, -a);
    }
    add(new THREE.BoxGeometry(0.06, 0.09, 0.02), mats.dark, x + Math.sin(face) * 0.145, y + 0.06 + h * 0.6, z + Math.cos(face) * 0.145, face);
    add(new THREE.CylinderGeometry(0.07, 0.04, 0.07, 10), mats.metal, x, y + 0.06 + h + 0.085, z);
    const guarded = slot.state === "GUARDED";
    const fire = add(new THREE.SphereGeometry(guarded ? 0.06 : 0.035, 10, 8), guarded ? mats.fire : mats.ember, x, y + 0.06 + h + 0.15, z);
    fire.castShadow = false;
    fires.push({ mesh: fire, phase: x * 3.1 + z * 1.7 });
    if (guarded) {
      add(new THREE.CylinderGeometry(0.01, 0.012, 0.36, 6), mats.timber, x + 0.11, y + 0.06 + h + 0.2, z);
      const fg = new THREE.PlaneGeometry(0.2, 0.12, 6, 1);
      fg.translate(0.1, 0, 0);
      const flag = add(fg, mats.flag, x + 0.11, y + 0.06 + h + 0.32, z);
      flags.push({ mesh: flag, phase: x + z });
    }
  }

  return {
    group,
    tick(t, night) {
      const glow = 1 + night * 0.8;
      for (const f of fires) {
        const s = 1 + Math.sin(t * 13 + f.phase) * 0.12 + Math.sin(t * 7.3 + f.phase * 2) * 0.08;
        f.mesh.scale.set(s, 1 + (s - 1) * 1.8, s);
      }
      mats.fire.emissiveIntensity = 1.6 * glow;
      mats.ember.emissiveIntensity = 0.35 * glow;
      for (const f of flags) f.mesh.rotation.y = Math.sin(t * 2.4 + f.phase) * 0.35;
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of Object.values(mats)) m.dispose();
    },
  };
}
