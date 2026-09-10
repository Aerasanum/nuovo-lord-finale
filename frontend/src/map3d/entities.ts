/**
 * Instanced procedural entities (castles, camps, sentinels). One InstancedMesh per part per chunk keeps draw calls
 * at ~10 per chunk regardless of settlement count. Shared geometries/materials are flagged `userData.shared`.
 */
import * as THREE from "three";

import type { SentinelDto, SettlementPublic } from "@/src/api/hooks";

export type EntityPalette = {
  own: THREE.Color;
  enemy: THREE.Color;
  neutral: THREE.Color;
  ally: THREE.Color;
  stone: THREE.Color;
  roof: THREE.Color;
  snow: THREE.Color;
};

type Part = { geo: THREE.BufferGeometry; mat: THREE.Material };

const Y_AXIS = new THREE.Vector3(0, 1, 0);

export function settlementScale(level: number): number {
  return 0.65 + Math.min(1, Math.max(1, level) / 30) * 0.85;
}

export function towerCount(level: number): number {
  return level >= 20 ? 6 : level >= 10 ? 4 : level >= 3 ? 2 : 0;
}

export class EntityFactory {
  private parts: Record<string, Part>;
  private pal: EntityPalette;

  constructor(pal: EntityPalette) {
    this.pal = pal;
    const flat = (extra: Partial<THREE.MeshLambertMaterialParameters> = {}) => new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, ...extra });
    const basic = (extra: Partial<THREE.MeshBasicMaterialParameters> = {}) => new THREE.MeshBasicMaterial({ color: 0xffffff, ...extra });
    const disc = new THREE.CircleGeometry(1, 20);
    disc.rotateX(-Math.PI / 2);
    const flag = new THREE.PlaneGeometry(0.34, 0.22);
    flag.translate(0.17, 0, 0);
    const roof = new THREE.ConeGeometry(0.42, 0.45, 4);
    roof.rotateY(Math.PI / 4);
    this.parts = {
      disc: { geo: disc, mat: basic({ transparent: true, opacity: 0.22, depthWrite: false }) },
      wall: { geo: new THREE.CylinderGeometry(0.62, 0.66, 0.32, 8, 1, true), mat: flat({ side: THREE.DoubleSide }) },
      keep: { geo: new THREE.BoxGeometry(0.5, 0.7, 0.5), mat: flat() },
      roof: { geo: roof, mat: flat() },
      tower: { geo: new THREE.CylinderGeometry(0.11, 0.13, 0.6, 6), mat: flat() },
      cap: { geo: new THREE.ConeGeometry(0.15, 0.22, 6), mat: flat() },
      pole: { geo: new THREE.CylinderGeometry(0.025, 0.025, 0.9, 4), mat: basic() },
      flag: { geo: flag, mat: basic({ side: THREE.DoubleSide }) },
      tent: { geo: new THREE.ConeGeometry(0.3, 0.35, 4), mat: flat({ transparent: true, opacity: 0.35, depthWrite: false }) },
      senTower: { geo: new THREE.CylinderGeometry(0.12, 0.16, 0.7, 6), mat: flat() },
      senFire: { geo: new THREE.SphereGeometry(0.1, 8, 6), mat: basic() },
      pin: { geo: new THREE.ConeGeometry(0.9, 2.4, 5), mat: basic({ transparent: true, opacity: 0.9 }) },
    };
    for (const p of Object.values(this.parts)) {
      p.geo.userData.shared = true;
      p.mat.userData.shared = true;
    }
  }

  factionColor(f?: string): THREE.Color {
    return f === "OWN" ? this.pal.own : f === "ENEMY" ? this.pal.enemy : f === "ALLY" ? this.pal.ally : this.pal.neutral;
  }

  private make(part: string, count: number): THREE.InstancedMesh {
    const p = this.parts[part];
    const m = new THREE.InstancedMesh(p.geo, p.mat, Math.max(1, count));
    m.count = 0;
    m.frustumCulled = false;
    return m;
  }

  /** Settlements (PLAYER / NEUTRAL castles, PLAYER_SLOT tents) of one chunk. */
  buildSettlements(list: SettlementPublic[], heightAt: (x: number, y: number) => number): THREE.Group {
    const g = new THREE.Group();
    const castles = list.filter((s) => s.kind !== "PLAYER_SLOT");
    const slots = list.filter((s) => s.kind === "PLAYER_SLOT");
    const towers = castles.reduce((acc, s) => acc + towerCount(s.level), 0);
    const mesh = {
      disc: this.make("disc", castles.length),
      wall: this.make("wall", castles.length),
      keep: this.make("keep", castles.length),
      roof: this.make("roof", castles.length),
      tower: this.make("tower", towers),
      cap: this.make("cap", towers),
      pole: this.make("pole", castles.length),
      flag: this.make("flag", castles.length),
      tent: this.make("tent", slots.length),
    };
    const M = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const sv = new THREE.Vector3();
    const put = (im: THREE.InstancedMesh, x: number, y: number, z: number, s: number, color: THREE.Color, rotY = 0) => {
      pos.set(x, y, z);
      q.setFromAxisAngle(Y_AXIS, rotY);
      sv.set(s, s, s);
      M.compose(pos, q, sv);
      im.setMatrixAt(im.count, M);
      im.setColorAt(im.count, color);
      im.count++;
    };
    const stoneTint = new THREE.Color();
    const roofTint = new THREE.Color();
    for (const s of castles) {
      const h = heightAt(s.x, s.y);
      const cx = s.x + 0.5;
      const cz = s.y + 0.5;
      const sc = settlementScale(s.level);
      const fac = this.factionColor(s.faction);
      stoneTint.copy(this.pal.stone).offsetHSL(0, 0, s.faction === "NEUTRAL" ? -0.06 : 0.08);
      roofTint.copy(this.pal.roof).lerp(fac, s.faction === "NEUTRAL" ? 0.15 : 0.45);
      put(mesh.disc, cx, h + 0.02, cz, 0.85 * sc, fac);
      put(mesh.wall, cx, h + 0.16 * sc, cz, sc, stoneTint);
      put(mesh.keep, cx, h + 0.35 * sc, cz, sc, stoneTint);
      put(mesh.roof, cx, h + 0.92 * sc, cz, sc, roofTint);
      const tc = towerCount(s.level);
      for (let i = 0; i < tc; i++) {
        const ang = (i / tc) * Math.PI * 2 + Math.PI / 4;
        const tx = cx + Math.cos(ang) * 0.6 * sc;
        const tz = cz + Math.sin(ang) * 0.6 * sc;
        put(mesh.tower, tx, h + 0.3 * sc, tz, sc, stoneTint);
        put(mesh.cap, tx, h + 0.7 * sc, tz, sc, roofTint);
      }
      put(mesh.pole, cx, h + 1.4 * sc, cz, sc, this.pal.snow);
      put(mesh.flag, cx, h + 1.75 * sc, cz, sc, fac);
    }
    for (const s of slots) put(mesh.tent, s.x + 0.5, heightAt(s.x, s.y) + 0.18, s.y + 0.5, 1, this.pal.neutral);
    for (const im of Object.values(mesh)) {
      if (!im.count) continue;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      g.add(im);
    }
    return g;
  }

  buildSentinels(list: SentinelDto[], heightAt: (x: number, y: number) => number): THREE.Group | null {
    if (!list.length) return null;
    const g = new THREE.Group();
    const tower = this.make("senTower", list.length);
    const fire = this.make("senFire", list.length);
    const M = new THREE.Matrix4();
    for (const s of list) {
      const h = heightAt(s.x, s.y);
      M.makeTranslation(s.x + 0.5, h + 0.35, s.y + 0.5);
      tower.setMatrixAt(tower.count, M);
      tower.setColorAt(tower.count, this.pal.stone);
      tower.count++;
      M.makeTranslation(s.x + 0.5, h + 0.8, s.y + 0.5);
      fire.setMatrixAt(fire.count, M);
      fire.setColorAt(fire.count, s.state === "GUARDED" ? this.factionColor(s.faction) : this.pal.neutral);
      fire.count++;
    }
    for (const im of [tower, fire]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      g.add(im);
    }
    return g;
  }

  /** Far-zoom markers for player settlements (overview LOD); `scale` keeps them a constant on-screen size. */
  buildPins(list: SettlementPublic[], heightAt: (x: number, y: number) => number, scale: number): THREE.InstancedMesh {
    const pin = this.make("pin", list.length);
    const M = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sv = new THREE.Vector3(scale, scale, scale);
    const pos = new THREE.Vector3();
    for (const s of list) {
      pos.set(s.x + 0.5, heightAt(s.x, s.y) + 1.6 * scale, s.y + 0.5);
      M.compose(pos, q, sv);
      pin.setMatrixAt(pin.count, M);
      pin.setColorAt(pin.count, this.factionColor(s.faction));
      pin.count++;
    }
    pin.instanceMatrix.needsUpdate = true;
    if (pin.instanceColor) pin.instanceColor.needsUpdate = true;
    return pin;
  }
}

/** Dispose everything a chunk group owns, skipping factory-shared geometries/materials. */
export function disposeGroup(root: THREE.Object3D) {
  root.traverse((o: any) => {
    if (o.isInstancedMesh) o.dispose?.();
    if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) if (!m.userData?.shared) m.dispose?.();
  });
}
