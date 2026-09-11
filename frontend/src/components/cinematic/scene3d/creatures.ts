/**
 * Cinematic creatures: a procedural low-poly Dragon rig (also skinned as Angel / Demon), a scout Falcon and additive
 * particle bursts (fire breath, victory sparks). All poses are functions of the scene clock.
 */
import * as THREE from "three";

import { mergeGeos, place } from "@/src/map3d/geo";

export type Legendary = "dragon" | "angel" | "demon";

const SKINS: Record<Legendary, { body: number; belly: number; wing: number; eye: number; glow: number; horn: number; emissive: number }> = {
  dragon: { body: 0x2e5a3a, belly: 0xb9a26a, wing: 0x234a2e, eye: 0xffd166, glow: 0xff8a2a, horn: 0xd9cfb8, emissive: 0x000000 },
  angel: { body: 0xf3ead8, belly: 0xffffff, wing: 0xfff5dc, eye: 0xffe9a8, glow: 0xffe9a8, horn: 0xffd166, emissive: 0x6a5a30 },
  demon: { body: 0x4a1212, belly: 0x7a2a1a, wing: 0x2b0a0a, eye: 0xff3b1f, glow: 0xff3b1f, horn: 0x1a0a0a, emissive: 0x3a0808 },
};

const sph = (r: number, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cone = (r: number, h: number, seg = 6) => new THREE.ConeGeometry(r, h, seg);
const cyl = (rt: number, rb: number, h: number, seg = 5) => new THREE.CylinderGeometry(rt, rb, h, seg);

function wingMembrane(side: 1 | -1): THREE.BufferGeometry {
  // fan of triangles from the shoulder; +x forward, span along ±z
  const S = new THREE.Vector3(0, 0, 0);
  const pts = [new THREE.Vector3(-0.5, 0.25, side * 3.6), new THREE.Vector3(-1.7, -0.05, side * 3.0), new THREE.Vector3(-2.2, -0.15, side * 1.8), new THREE.Vector3(-1.6, -0.1, side * 0.6)];
  const tris: THREE.Vector3[] = [];
  for (let i = 0; i < pts.length - 1; i++) tris.push(S.clone(), pts[i].clone(), pts[i + 1].clone());
  tris.push(S.clone(), pts[pts.length - 1].clone(), new THREE.Vector3(-0.9, -0.05, side * 0.2));
  const g = new THREE.BufferGeometry().setFromPoints(tris);
  g.computeVertexNormals();
  return g;
}

function wingBones(side: 1 | -1): THREE.BufferGeometry {
  const bone = (to: THREE.Vector3) => {
    const len = to.length();
    const g = cyl(0.035, 0.05, len, 4);
    g.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().normalize());
    g.applyQuaternion(q);
    return g;
  };
  return mergeGeos([bone(new THREE.Vector3(-0.5, 0.25, side * 3.6)), bone(new THREE.Vector3(-1.7, -0.05, side * 3.0)), bone(new THREE.Vector3(-2.2, -0.15, side * 1.8))]);
}

export class Dragon {
  readonly group = new THREE.Group();
  readonly light: THREE.PointLight;
  readonly fire: Burst;
  private wingL: THREE.Group;
  private wingR: THREE.Group;
  private tail: THREE.Mesh[] = [];
  private jaw: THREE.Mesh;
  private head: THREE.Group;
  private mouth = new THREE.Object3D();
  private disposables: { dispose(): void }[] = [];
  readonly kind: Legendary;

  constructor(kind: Legendary) {
    this.kind = kind;
    const sk = SKINS[kind];
    const lit = (color: number, extra: Partial<THREE.MeshLambertMaterialParameters> = {}) => {
      const m = new THREE.MeshLambertMaterial({ color, flatShading: true, emissive: sk.emissive, emissiveIntensity: kind === "angel" ? 0.35 : 0.5, ...extra });
      this.disposables.push(m);
      return m;
    };
    const geo = <T extends THREE.BufferGeometry>(g: T) => {
      this.disposables.push(g);
      return g;
    };
    const bodyMat = lit(sk.body);
    const bellyMat = lit(sk.belly);
    const wingMat = lit(sk.wing, { side: THREE.DoubleSide, transparent: kind === "angel", opacity: kind === "angel" ? 0.92 : 1 });
    const hornMat = lit(sk.horn);
    const eyeMat = new THREE.MeshBasicMaterial({ color: sk.eye });
    this.disposables.push(eyeMat);

    // body + belly
    const bodyG = geo(sph(0.9, 10, 8));
    bodyG.scale(1.9, 0.75, 0.8);
    this.group.add(new THREE.Mesh(bodyG, bodyMat));
    const bellyG = geo(sph(0.9, 10, 8));
    bellyG.scale(1.55, 0.5, 0.62);
    bellyG.translate(0.1, -0.22, 0);
    this.group.add(new THREE.Mesh(bellyG, bellyMat));
    // legs
    const legs = geo(mergeGeos([-1, 1].flatMap((sz) => [place(box(0.28, 0.6, 0.24), -0.7, -0.75, sz * 0.5), place(box(0.34, 0.14, 0.3), -0.62, -1.08, sz * 0.5), place(box(0.24, 0.5, 0.2), 0.9, -0.7, sz * 0.42), place(box(0.3, 0.12, 0.26), 0.98, -0.98, sz * 0.42)])));
    this.group.add(new THREE.Mesh(legs, bodyMat));
    // neck
    const neck = geo(mergeGeos([place(sph(0.44), 1.65, 0.35, 0), place(sph(0.36), 2.15, 0.78, 0), place(sph(0.3), 2.6, 1.1, 0)]));
    this.group.add(new THREE.Mesh(neck, bodyMat));
    // head group (pivot at neck top)
    this.head = new THREE.Group();
    this.head.position.set(2.75, 1.2, 0);
    this.head.add(new THREE.Mesh(geo(mergeGeos([place(box(0.8, 0.44, 0.46), 0.3, 0, 0), place(box(0.55, 0.26, 0.34), 0.9, -0.06, 0)])), bodyMat));
    this.head.add(new THREE.Mesh(geo(mergeGeos([place(cone(0.08, kind === "demon" ? 0.7 : 0.4), -0.05, 0.42, 0.16).rotateX(0), place(cone(0.08, kind === "demon" ? 0.7 : 0.4), -0.05, 0.42, -0.16)])), hornMat));
    this.head.add(new THREE.Mesh(geo(mergeGeos([place(sph(0.07, 6, 5), 0.5, 0.12, 0.22), place(sph(0.07, 6, 5), 0.5, 0.12, -0.22)])), eyeMat));
    this.jaw = new THREE.Mesh(geo(place(box(0.55, 0.1, 0.3), 0.3, -0.05, 0)), bodyMat);
    this.jaw.position.set(0.6, -0.2, 0);
    this.head.add(this.jaw);
    this.mouth.position.set(1.25, -0.12, 0);
    this.head.add(this.mouth);
    this.group.add(this.head);
    if (kind === "angel") {
      const halo = new THREE.Mesh(geo(new THREE.TorusGeometry(0.55, 0.05, 6, 24)), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
      halo.rotation.x = Math.PI / 2;
      halo.position.set(0.3, 0.8, 0);
      this.head.add(halo);
      this.disposables.push(halo.material as THREE.Material);
    }
    // tail segments
    const radii = [0.5, 0.4, 0.3, 0.2];
    for (let i = 0; i < radii.length; i++) {
      const g = geo(sph(radii[i]));
      g.scale(1.6, 1, 1);
      const seg = new THREE.Mesh(g, bodyMat);
      seg.position.set(-1.7 - i * 0.75, 0.05 + i * 0.08, 0);
      this.tail.push(seg);
      this.group.add(seg);
    }
    const spike = new THREE.Mesh(geo(cone(0.16, 0.6, 5).rotateZ(Math.PI / 2)), hornMat);
    spike.position.set(-4.9, 0.35, 0);
    this.tail.push(spike);
    this.group.add(spike);
    // wings (pivot at shoulders)
    this.wingL = new THREE.Group();
    this.wingR = new THREE.Group();
    this.wingL.position.set(0.2, 0.45, 0.3);
    this.wingR.position.set(0.2, 0.45, -0.3);
    this.wingL.add(new THREE.Mesh(geo(wingMembrane(1)), wingMat), new THREE.Mesh(geo(wingBones(1)), bodyMat));
    this.wingR.add(new THREE.Mesh(geo(wingMembrane(-1)), wingMat), new THREE.Mesh(geo(wingBones(-1)), bodyMat));
    this.group.add(this.wingL, this.wingR);
    // breath + light
    this.fire = new Burst(64, sk.glow, kind === "angel" ? 0xffffff : 0xffd166);
    this.group.add(this.fire.mesh);
    this.light = new THREE.PointLight(sk.glow, 0, 16, 2);
    this.group.add(this.light);
  }

  /**
   * @param pos world position of the body centre
   * @param heading yaw (radians, 0 = +x)
   * @param flap wing-beat intensity 0..1 (0 = glide)
   * @param breathing fire on/off
   * @param pitch nose up/down
   */
  update(t: number, pos: THREE.Vector3, heading: number, flap: number, breathing: boolean, pitch = 0) {
    this.group.position.copy(pos);
    this.group.rotation.set(0, heading, 0);
    this.group.rotation.z = pitch; // local pitch after yaw (nose along +x)
    const beat = Math.sin(t * Math.PI * 2 * (0.6 + flap * 1.4));
    const amp = 0.18 + flap * 0.55;
    this.wingL.rotation.x = -beat * amp - 0.1;
    this.wingR.rotation.x = beat * amp + 0.1;
    for (let i = 0; i < this.tail.length; i++) this.tail[i].position.z = Math.sin(t * 2.6 - i * 0.7) * 0.12 * (i + 1);
    this.head.rotation.z = Math.sin(t * 1.7) * 0.06 + (breathing ? -0.18 : 0);
    this.jaw.rotation.z = breathing ? -0.55 : -0.08 + Math.sin(t * 3.1) * 0.04;
    this.fire.mesh.visible = breathing;
    if (breathing) {
      const dir = new THREE.Vector3(1, -0.22, 0).normalize();
      const origin = this.mouth.getWorldPosition(new THREE.Vector3());
      this.group.worldToLocal(origin);
      this.fire.update(t, origin, dir, 7.5, 0.55);
      this.light.position.copy(origin).addScaledVector(dir, 1.5);
      this.light.intensity = 8 + Math.sin(t * 23) * 2.5 + Math.sin(t * 7) * 1.5;
    } else this.light.intensity = 0;
  }

  dispose() {
    this.fire.dispose();
    for (const d of this.disposables) d.dispose();
  }
}

export class Falcon {
  readonly group = new THREE.Group();
  private wingL: THREE.Mesh;
  private wingR: THREE.Mesh;
  private disposables: { dispose(): void }[] = [];

  constructor() {
    const body = new THREE.MeshLambertMaterial({ color: 0x5a3f2a, flatShading: true });
    const light = new THREE.MeshLambertMaterial({ color: 0xe8dcc4, flatShading: true, side: THREE.DoubleSide });
    this.disposables.push(body, light);
    const bodyG = sph(0.16, 7, 5);
    bodyG.scale(1.8, 0.8, 0.8);
    const g = mergeGeos([bodyG, place(sph(0.1, 6, 5), 0.3, 0.06, 0), place(cone(0.04, 0.14, 4).rotateZ(-Math.PI / 2), 0.42, 0.04, 0), place(box(0.34, 0.03, 0.22), -0.34, 0.02, 0)]);
    this.disposables.push(g);
    this.group.add(new THREE.Mesh(g, body));
    const wing = (side: 1 | -1) => {
      const wg = new THREE.PlaneGeometry(0.42, 0.95);
      wg.rotateX(-Math.PI / 2);
      wg.translate(-0.05, 0, side * 0.5);
      this.disposables.push(wg);
      const m = new THREE.Mesh(wg, light);
      m.position.set(0, 0.04, side * 0.08);
      return m;
    };
    this.wingL = wing(1);
    this.wingR = wing(-1);
    this.group.add(this.wingL, this.wingR);
  }

  update(t: number, pos: THREE.Vector3, heading: number, roll: number) {
    this.group.position.copy(pos);
    this.group.rotation.set(0, heading, 0);
    this.group.rotateX(roll);
    const beat = Math.sin(t * Math.PI * 2 * 3.2) * 0.65;
    this.wingL.rotation.x = -beat;
    this.wingR.rotation.x = beat;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}

/** Additive low-poly particle stream/burst: state is a pure function of time (no bookkeeping). */
export class Burst {
  readonly mesh: THREE.InstancedMesh;
  private n: number;
  private c0: THREE.Color;
  private c1: THREE.Color;
  private geo: THREE.BufferGeometry;
  private mat: THREE.MeshBasicMaterial;
  private static _m = new THREE.Matrix4();
  private static _p = new THREE.Vector3();
  private static _q = new THREE.Quaternion();
  private static _s = new THREE.Vector3();
  private static _c = new THREE.Color();

  constructor(n: number, color: number, core: number) {
    this.n = n;
    this.c0 = new THREE.Color(core);
    this.c1 = new THREE.Color(color);
    this.geo = new THREE.IcosahedronGeometry(1, 0);
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
  }

  /** Continuous stream (fire breath) from origin along dir; `reach` metres, `spread` radius at the tip. */
  update(t: number, origin: THREE.Vector3, dir: THREE.Vector3, reach: number, spread: number) {
    const m = Burst._m;
    const p = Burst._p;
    const s = Burst._s;
    const c = Burst._c;
    for (let i = 0; i < this.n; i++) {
      const u = (((t * 1.6 + i / this.n) % 1) + 1) % 1;
      const seed = i * 12.9898;
      const side = Math.sin(seed) * spread * u;
      const up = Math.cos(seed * 1.7) * spread * u + u * u * 0.9;
      p.copy(origin).addScaledVector(dir, u * reach);
      p.y += up;
      p.z += side;
      p.x += Math.cos(seed * 0.7) * spread * u * 0.5;
      const sc = (0.12 + u * 0.55) * (1 - u * 0.55);
      s.setScalar(sc);
      Burst._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), seed + t * 3);
      m.compose(p, Burst._q, s);
      this.mesh.setMatrixAt(i, m);
      c.copy(this.c0).lerp(this.c1, Math.min(1, u * 1.6));
      if (u > 0.75) c.multiplyScalar(1 - (u - 0.75) / 0.25);
      this.mesh.setColorAt(i, c);
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Radial firework bursts: `starts` are burst times (s) at `origin`; particles live `life` seconds. */
  fireworks(t: number, origin: THREE.Vector3, starts: number[], life = 1.7) {
    const m = Burst._m;
    const p = Burst._p;
    const s = Burst._s;
    const c = Burst._c;
    let k = 0;
    const per = Math.floor(this.n / Math.max(1, starts.length));
    for (let b = 0; b < starts.length; b++) {
      const age = t - starts[b];
      if (age < 0 || age > life) continue;
      const u = age / life;
      for (let i = 0; i < per && k < this.n; i++) {
        const seed = i * 7.31 + b * 3.7;
        const a = seed % (Math.PI * 2);
        const e = ((seed * 1.3) % 1.2) - 0.1;
        const speed = 5 + ((seed * 2.1) % 3);
        p.set(origin.x + Math.cos(a) * Math.cos(e) * speed * age, origin.y + Math.sin(e) * speed * age + 2.5 * age - 4.9 * age * age, origin.z + Math.sin(a) * Math.cos(e) * speed * age);
        s.setScalar(0.075 * (1 - u * 0.8));
        Burst._q.identity();
        m.compose(p, Burst._q, s);
        this.mesh.setMatrixAt(k, m);
        c.copy(this.c0).lerp(this.c1, u);
        if (u > 0.6) c.multiplyScalar(1 - (u - 0.6) / 0.4);
        this.mesh.setColorAt(k, c);
        k++;
      }
    }
    this.mesh.count = k;
    this.mesh.visible = k > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
    this.mesh.dispose();
  }
}
