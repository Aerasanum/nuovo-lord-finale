/**
 * Cinematic army: low-poly figures (infantry, archers, cavalry, war carts, beasts) as InstancedMeshes — one instance
 * per figure, one mesh per coloured part. Figure count mirrors the real composition (largest remainder, ≤ MAX).
 * Pose is a pure function of time: marching gait (bob / sway / horse gallop) or a victory cheer.
 */
import * as THREE from "three";

import { mergeGeos, place } from "@/src/map3d/geo";
import type { SmokeEmitter } from "@/src/map3d/smoke";

export const MAX_FIGURES = 48;
const RANK_WIDTH = 6; // figures across the road
const FILE_STEP = 0.78;
const RANK_STEP = 0.62;

type Role = "infantry" | "archer" | "cavalry" | "catapult" | "cart" | "beast";
type Part = { geo: THREE.BufferGeometry; color: string | "faction" };
type RoleDef = { role: Role; color?: number; scale?: number; order: number };

// Order: cavalry leads, infantry centre, archers, then carts and beasts at the rear (legendaries fly).
const ROLE_OF: Record<string, RoleDef> = {
  Cavalleria: { role: "cavalry", order: 0 },
  Fanteria: { role: "infantry", order: 1 },
  Arciere: { role: "archer", order: 2 },
  Lupo: { role: "beast", color: 0x6b6b70, scale: 0.72, order: 3 },
  Leone: { role: "beast", color: 0xc9a25a, scale: 1.0, order: 3 },
  Orso: { role: "beast", color: 0x5a3a22, scale: 1.25, order: 3 },
  "Elefante da Guerra": { role: "beast", color: 0x7a7a80, scale: 1.9, order: 4 },
  Catapulta: { role: "catapult", order: 5 },
  "Carro di Conquista": { role: "cart", order: 5 },
};

const STEEL = "#B9BEC7";
const SKIN = "#D9B48F";
const WOOD = "#6B4A2B";
const HORSE = "#8B5E3C";
const BOW = "#8B5A2B";

const cyl = (rt: number, rb: number, h: number, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg);
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const sph = (r: number, w = 6, h = 5) => new THREE.SphereGeometry(r, w, h);
const cone = (r: number, h: number, seg = 6) => new THREE.ConeGeometry(r, h, seg);

function humanoid(y: number): { body: THREE.BufferGeometry; skin: THREE.BufferGeometry } {
  return {
    body: mergeGeos([place(cyl(0.11, 0.14, 0.42), 0, y + 0.46, 0), place(cyl(0.045, 0.05, 0.28), -0.07, y + 0.14, 0), place(cyl(0.045, 0.05, 0.28), 0.07, y + 0.14, 0), place(sph(0.105), 0, y + 0.8, 0)]),
    skin: place(sph(0.07), 0, y + 0.72, 0.04),
  };
}

function partsFor(role: Role): Part[] {
  switch (role) {
    case "infantry": {
      const h = humanoid(0);
      return [
        { geo: h.body, color: "faction" },
        { geo: h.skin, color: SKIN },
        { geo: mergeGeos([place(cyl(0.19, 0.19, 0.03, 8).rotateX(Math.PI / 2), 0, 0.5, 0.2), place(cyl(0.012, 0.012, 1.3), 0.17, 0.75, -0.1), place(cone(0.03, 0.14), 0.17, 1.47, -0.1)]), color: STEEL },
      ];
    }
    case "archer": {
      const h = humanoid(0);
      const bow = new THREE.TorusGeometry(0.28, 0.012, 4, 10, Math.PI);
      bow.rotateZ(-Math.PI / 2); // arc bulges forward (+x), string vertical
      bow.translate(0.12, 0.62, 0.12);
      return [
        { geo: h.body, color: "faction" },
        { geo: h.skin, color: SKIN },
        { geo: mergeGeos([bow, place(cyl(0.04, 0.04, 0.32), -0.12, 0.62, -0.1)]), color: BOW },
        { geo: place(cone(0.12, 0.14), 0, 0.95, 0), color: "faction" },
      ];
    }
    case "cavalry": {
      const rider = humanoid(0.62);
      const horse = mergeGeos([
        place(box(0.82, 0.34, 0.3), 0, 0.62, 0),
        place(box(0.28, 0.42, 0.22), 0.45, 0.85, 0),
        place(box(0.32, 0.18, 0.18), 0.62, 1.02, 0),
        ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => place(cyl(0.05, 0.045, 0.5), sx * 0.3, 0.25, sz * 0.1))),
        place(cyl(0.03, 0.06, 0.34), -0.46, 0.5, 0),
      ]);
      return [
        { geo: horse, color: HORSE },
        { geo: rider.body, color: "faction" },
        { geo: rider.skin, color: SKIN },
        { geo: mergeGeos([place(cyl(0.012, 0.012, 1.5), 0.2, 1.35, 0.12), place(cone(0.03, 0.14), 0.2, 2.1, 0.12), place(box(0.3, 0.06, 0.34), 0, 0.82, 0)]), color: STEEL },
      ];
    }
    case "catapult":
    case "cart": {
      const wheel = (x: number, z: number) => place(cyl(0.3, 0.3, 0.08, 10).rotateX(Math.PI / 2), x, 0.3, z);
      const frame = mergeGeos([place(box(1.1, 0.14, 0.7), 0, 0.42, 0), wheel(-0.35, 0.38), wheel(-0.35, -0.38), wheel(0.4, 0.38), wheel(0.4, -0.38)]);
      const top = role === "catapult" ? mergeGeos([place(box(0.1, 1.2, 0.1).rotateZ(-0.6), 0.05, 0.95, 0), place(box(0.3, 0.1, 0.3), -0.34, 1.5, 0), place(box(0.5, 0.35, 0.5), 0.2, 0.62, 0)]) : mergeGeos([place(box(0.9, 0.5, 0.6), 0, 0.75, 0), place(cyl(0.02, 0.02, 1.1), 0, 1.5, 0)]);
      return [
        { geo: frame, color: WOOD },
        { geo: top, color: role === "catapult" ? STEEL : "faction" },
        ...(role === "cart" ? [{ geo: place(new THREE.PlaneGeometry(0.42, 0.3), 0.22, 1.85, 0), color: "faction" as const }] : []),
      ];
    }
    case "beast": {
      const bodyG = sph(0.42, 8, 6);
      bodyG.scale(1.3, 0.8, 0.8);
      const body = mergeGeos([place(bodyG, 0, 0.62, 0), place(sph(0.26, 7, 5), 0.6, 0.72, 0), ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => place(cyl(0.08, 0.07, 0.42), sx * 0.32, 0.21, sz * 0.18))), place(cyl(0.03, 0.05, 0.4).rotateZ(1.1), -0.62, 0.7, 0)]);
      return [{ geo: body, color: "faction" }];
    }
  }
}

type Figure = { role: Role; def: RoleDef; file: number; rank: number; phase: number; freq: number; jx: number; jz: number };

export class Army {
  readonly group = new THREE.Group();
  readonly figures: Figure[] = [];
  readonly dust: SmokeEmitter[] = [];
  private meshes: { role: Role; parts: THREE.InstancedMesh[]; indices: number[] }[] = [];
  private disposables: { dispose(): void }[] = [];
  private mode: "march" | "cheer";
  private facing: number;
  private files = 0;
  private headX = 0;

  constructor(units: Record<string, number>, faction: THREE.Color, mode: "march" | "cheer", facing = 0) {
    this.mode = mode;
    this.facing = facing;
    // allocation: proportional over ground units, ≥1 per present type, capped
    const ground = Object.entries(units).filter(([u, c]) => c > 0 && ROLE_OF[u]);
    const total = ground.reduce((a, [, c]) => a + c, 0) || 1;
    const alloc = ground.map(([u, c]) => ({ u, exact: (c / total) * MAX_FIGURES, n: Math.max(1, Math.floor((c / total) * MAX_FIGURES)) }));
    let left = MAX_FIGURES - alloc.reduce((a, b) => a + b.n, 0);
    for (const a of [...alloc].sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)))) {
      if (left <= 0) break;
      a.n += 1;
      left -= 1;
    }
    while (left < 0) {
      const big = alloc.reduce((a, b) => (b.n > a.n ? b : a));
      big.n -= 1;
      left += 1;
    }
    const list: RoleDef[] = [];
    for (const a of alloc.sort((x, y) => ROLE_OF[x.u].order - ROLE_OF[y.u].order)) for (let i = 0; i < a.n; i++) list.push({ ...ROLE_OF[a.u] });
    // formation grid: ranks across the road, files along it
    list.forEach((def, i) => {
      const file = Math.floor(i / RANK_WIDTH);
      const rank = i % RANK_WIDTH;
      this.figures.push({ role: def.role, def, file, rank, phase: Math.random() * Math.PI * 2, freq: 0.9 + Math.random() * 0.25, jx: (Math.random() - 0.5) * 0.18, jz: (Math.random() - 0.5) * 0.14 });
    });
    this.files = Math.ceil(list.length / RANK_WIDTH);
    // instanced meshes per role
    const roles = Array.from(new Set(this.figures.map((f) => f.role)));
    for (const role of roles) {
      const indices = this.figures.map((f, i) => (f.role === role ? i : -1)).filter((i) => i >= 0);
      const parts = partsFor(role).map((p) => {
        const mat = new THREE.MeshLambertMaterial({ color: p.color === "faction" ? faction : new THREE.Color(p.color), flatShading: true, side: p.geo instanceof THREE.PlaneGeometry ? THREE.DoubleSide : THREE.FrontSide });
        this.disposables.push(mat, p.geo);
        const m = new THREE.InstancedMesh(p.geo, mat, indices.length);
        m.frustumCulled = false;
        this.group.add(m);
        return m;
      });
      // beasts: per-instance colour
      if (role === "beast") {
        for (let k = 0; k < indices.length; k++) parts[0].setColorAt(k, new THREE.Color(this.figures[indices[k]].def.color ?? 0x888888));
        if (parts[0].instanceColor) parts[0].instanceColor.needsUpdate = true;
      }
      this.meshes.push({ role, parts, indices });
    }
    // dust behind the rear ranks
    for (let i = 0; i < 4; i++) this.dust.push({ x: 0, y: 0.05, z: -1.2 + i * 0.8, size: 0.22, rise: 0.45, period: 1.8 + i * 0.25, puffs: 3, color: new THREE.Color(0x6e6252) });
  }

  /** Formation depth along the march axis (metres). */
  get length(): number {
    return this.files * FILE_STEP;
  }

  get centerX(): number {
    return this.headX - this.length / 2;
  }

  private static _m = new THREE.Matrix4();
  private static _p = new THREE.Vector3();
  private static _q = new THREE.Quaternion();
  private static _e = new THREE.Euler();
  private static _s = new THREE.Vector3();

  /** headX: position of the front rank along +x (march) or the formation centre (cheer). */
  update(t: number, headX: number) {
    this.headX = headX;
    const m = Army._m;
    const p = Army._p;
    const q = Army._q;
    const e = Army._e;
    const s = Army._s;
    for (const rm of this.meshes) {
      for (let k = 0; k < rm.indices.length; k++) {
        const f = this.figures[rm.indices[k]];
        const sc = f.def.scale ?? 1;
        const gait = f.role === "cavalry" ? 2.1 : f.role === "beast" ? 1.7 : f.role === "catapult" || f.role === "cart" ? 0 : 1.6;
        const w = t * Math.PI * 2 * gait * f.freq + f.phase;
        let x = headX - f.file * FILE_STEP + f.jx;
        let z = (f.rank - (RANK_WIDTH - 1) / 2) * RANK_STEP + f.jz;
        let y = 0;
        let pitch = 0;
        let roll = 0;
        let yaw = this.facing;
        if (this.mode === "march") {
          if (gait > 0) {
            y = Math.abs(Math.sin(w)) * (f.role === "cavalry" ? 0.09 : 0.055) * sc;
            pitch = f.role === "cavalry" ? Math.sin(w) * 0.06 : 0;
            roll = f.role === "cavalry" ? 0 : Math.sin(w) * 0.05;
          } else y = Math.sin(t * 7 + f.phase) * 0.012;
        } else {
          // victory cheer: hops and turns
          const hop = Math.max(0, Math.sin(t * Math.PI * 2 * 0.9 * f.freq + f.phase));
          y = hop * hop * 0.22 * sc;
          yaw = this.facing + Math.sin(t * 1.3 + f.phase) * 0.35;
          x = headX + (f.rank - (RANK_WIDTH - 1) / 2) * RANK_STEP * 1.25 + f.jx;
          z = f.file * FILE_STEP * 1.1 + f.jz;
        }
        p.set(x, y, z);
        e.set(pitch, yaw, roll);
        q.setFromEuler(e);
        s.setScalar(sc);
        m.compose(p, q, s);
        for (const part of rm.parts) part.setMatrixAt(k, m);
      }
      for (const part of rm.parts) part.instanceMatrix.needsUpdate = true;
    }
    if (this.mode === "march") for (const d of this.dust) d.x = headX - this.length + 0.3;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    for (const rm of this.meshes) for (const part of rm.parts) part.dispose();
  }
}
