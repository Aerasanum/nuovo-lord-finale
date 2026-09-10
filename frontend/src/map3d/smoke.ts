/**
 * Stylised smoke: one InstancedMesh of soft low-poly puffs shared by every emitter in view (castle chimneys, torches,
 * sentinel braziers). Puff state is a pure function of time → no per-particle bookkeeping, deterministic and cheap.
 */
import * as THREE from "three";

import { hash2 } from "./terrain";

export type SmokeEmitter = { x: number; y: number; z: number; size: number; rise: number; period: number; puffs: number; color: THREE.Color };

const MAX_PUFFS = 720;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

export class SmokeSystem {
  mesh: THREE.InstancedMesh;
  private emitters: SmokeEmitter[] = [];
  private mat: THREE.MeshBasicMaterial;

  constructor(color: THREE.Color) {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    this.mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.42, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, MAX_PUFFS);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  setEmitters(list: SmokeEmitter[]) {
    this.emitters = list;
  }

  /** Nearest emitters to the camera target first; puffs beyond the budget are dropped. */
  update(tSeconds: number, tx: number, tz: number, maxEmitters = 90) {
    const em = this.emitters.length > maxEmitters ? this.emitters.slice().sort((a, b) => Math.hypot(a.x - tx, a.z - tz) - Math.hypot(b.x - tx, b.z - tz)).slice(0, maxEmitters) : this.emitters;
    let k = 0;
    for (let e = 0; e < em.length && k < MAX_PUFFS; e++) {
      const s = em[e];
      const seed = hash2(Math.round(s.x * 10), Math.round(s.z * 10));
      for (let i = 0; i < s.puffs && k < MAX_PUFFS; i++) {
        const u = ((tSeconds / s.period + i / s.puffs + seed) % 1 + 1) % 1; // 0 → 1 over one period
        const fade = u < 0.15 ? u / 0.15 : u > 0.75 ? 1 - (u - 0.75) / 0.25 : 1; // grow in, dissolve out
        const drift = 0.18 * s.size * u;
        _p.set(s.x + Math.sin(seed * 12.0 + u * 5.0 + i) * drift, s.y + u * s.rise, s.z + Math.cos(seed * 9.0 + u * 4.0 + i) * drift);
        const sc = s.size * (0.45 + 1.1 * u) * Math.max(0.001, fade);
        _s.set(sc, sc * 0.85, sc);
        _q.setFromAxisAngle(Y_AXIS, seed * 6.28 + u);
        _m.compose(_p, _q, _s);
        this.mesh.setMatrixAt(k, _m);
        this.mesh.setColorAt(k, s.color);
        k++;
      }
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.mesh.dispose();
  }
}
