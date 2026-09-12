/**
 * Villagers, guards and ox-carts that bring the village to life. Agents walk between waypoints (doors, ring road,
 * market, gate) along the ring so they never cut through buildings; guards patrol the wall walk; carts roll around the
 * ring road. Population grows with the settlement level (peasants → merchants → guards → nobles).
 */
import * as THREE from "three";

import type { Waypoint } from "./village";

type Kind = "peasant" | "merchant" | "guard" | "noble";
type Agent = { obj: THREE.Group; kind: Kind; speed: number; path: THREE.Vector3[]; seg: number; wait: number; t: number; phase: number; body: THREE.Mesh };
type Cart = { obj: THREE.Group; angle: number; speed: number; r: number; wheels: THREE.Mesh[] };

const TUNICS: Record<Kind, string[]> = {
  peasant: ["#8a6b45", "#6f5a3c", "#9a8563", "#5e6b3a"],
  merchant: ["#a33c3c", "#2f6a8a", "#c48a2c", "#5b3a7a"],
  guard: ["#3a3f4a"],
  noble: ["#5b2b6e", "#8a1f2f"],
};

export class Villagers {
  group = new THREE.Group();
  private agents: Agent[] = [];
  private carts: Cart[] = [];
  private waypoints: Waypoint[] = [];
  private ring = 3;
  private wallR = 5;
  private torchMat: THREE.MeshStandardMaterial;
  private geo = {
    body: new THREE.CapsuleGeometry(0.045, 0.1, 3, 6),
    head: new THREE.SphereGeometry(0.035, 8, 6),
    hat: new THREE.ConeGeometry(0.045, 0.05, 6),
    helmet: new THREE.SphereGeometry(0.04, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    spear: new THREE.CylinderGeometry(0.005, 0.005, 0.32, 4),
    torch: new THREE.SphereGeometry(0.02, 6, 4),
    cartBody: new THREE.BoxGeometry(0.22, 0.09, 0.14),
    wheel: new THREE.CylinderGeometry(0.05, 0.05, 0.02, 10),
    ox: new THREE.BoxGeometry(0.1, 0.09, 0.18),
    oxHead: new THREE.BoxGeometry(0.06, 0.06, 0.06),
  };
  private skin = new THREE.MeshStandardMaterial({ color: "#d9b28c", roughness: 0.8 });
  private timber = new THREE.MeshStandardMaterial({ color: "#5a3d24", roughness: 0.9 });
  private oxMat = new THREE.MeshStandardMaterial({ color: "#6b4a35", roughness: 0.9 });
  private metal = new THREE.MeshStandardMaterial({ color: "#7d838e", roughness: 0.4, metalness: 0.6 });
  private mats: THREE.MeshStandardMaterial[] = [];

  constructor(private faction: THREE.Color, private scale = 1) {
    this.torchMat = new THREE.MeshStandardMaterial({ color: "#ffb347", emissive: "#ff9a2e", emissiveIntensity: 0 });
  }

  /** (Re)populate for a settlement level. */
  populate(level: number, waypoints: Waypoint[], ring: number, wallR: number, hasWalls: boolean) {
    this.clear();
    this.waypoints = waypoints;
    this.ring = ring;
    this.wallR = wallR;
    const n = Math.min(30, 3 + Math.round(level * 0.85));
    const guards = hasWalls ? Math.min(8, Math.floor(level / 4)) : 0;
    const nobles = level >= 20 ? 2 : level >= 12 ? 1 : 0;
    const merchants = Math.min(8, Math.floor(level / 3));
    for (let i = 0; i < n; i++) {
      const kind: Kind = i < guards ? "guard" : i < guards + nobles ? "noble" : i < guards + nobles + merchants ? "merchant" : "peasant";
      this.agents.push(this.makeAgent(kind, i));
    }
    const carts = level >= 20 ? 2 : level >= 8 ? 1 : 0;
    for (let i = 0; i < carts; i++) this.carts.push(this.makeCart(i));
  }

  private mat(color: string) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    this.mats.push(m);
    return m;
  }

  private makeAgent(kind: Kind, i: number): Agent {
    const g = new THREE.Group();
    const tunic = kind === "guard" ? this.mat(TUNICS.guard[0]) : this.mat(TUNICS[kind][i % TUNICS[kind].length]);
    const body = new THREE.Mesh(this.geo.body, tunic);
    body.position.y = 0.1;
    body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(this.geo.head, this.skin);
    head.position.y = 0.2;
    g.add(head);
    if (kind === "peasant") {
      const hat = new THREE.Mesh(this.geo.hat, this.mat("#b89a5a"));
      hat.position.y = 0.235;
      g.add(hat);
    } else if (kind === "guard") {
      const helmet = new THREE.Mesh(this.geo.helmet, this.metal);
      helmet.position.y = 0.205;
      g.add(helmet);
      const spear = new THREE.Mesh(this.geo.spear, this.timber);
      spear.position.set(0.05, 0.18, 0);
      g.add(spear);
      const tip = new THREE.Mesh(this.geo.hat, this.metal);
      tip.scale.setScalar(0.5);
      tip.position.set(0.05, 0.35, 0);
      g.add(tip);
      const torch = new THREE.Mesh(this.geo.torch, this.torchMat);
      torch.position.set(-0.05, 0.2, 0.02);
      g.add(torch);
      const tabard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.012), this.mat(`#${this.faction.getHexString()}`));
      tabard.position.set(0, 0.11, 0.045);
      g.add(tabard);
    } else if (kind === "noble") {
      const crown = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 10), this.mat("#d4a52a"));
      crown.rotation.x = Math.PI / 2;
      crown.position.y = 0.23;
      g.add(crown);
      const cape = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.012), this.mat("#2d1c3a"));
      cape.position.set(0, 0.1, -0.045);
      g.add(cape);
    } else {
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.04), this.timber);
      pack.position.set(0, 0.13, -0.055);
      g.add(pack);
    }
    const start = this.randomWaypoint(kind);
    g.position.set(start.x, 0, start.z);
    g.scale.setScalar(this.scale);
    this.group.add(g);
    const a: Agent = { obj: g, kind, speed: kind === "guard" ? 0.28 : kind === "noble" ? 0.22 : 0.3 + Math.random() * 0.12, path: [], seg: 0, wait: Math.random() * 2, t: 0, phase: Math.random() * 6, body };
    return a;
  }

  private makeCart(i: number): Cart {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.geo.cartBody, this.timber);
    body.position.y = 0.09;
    body.castShadow = true;
    g.add(body);
    const load = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.11), this.mat(i % 2 ? "#a7923c" : "#9a5a3c"));
    load.position.y = 0.16;
    g.add(load);
    const wheels: THREE.Mesh[] = [];
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(this.geo.wheel, this.timber);
      w.rotation.z = Math.PI / 2;
      w.position.set(sx * 0.12, 0.05, 0.0);
      g.add(w);
      wheels.push(w);
    }
    const ox = new THREE.Mesh(this.geo.ox, this.oxMat);
    ox.position.set(0, 0.06, 0.24);
    ox.castShadow = true;
    g.add(ox);
    const head = new THREE.Mesh(this.geo.oxHead, this.oxMat);
    head.position.set(0, 0.1, 0.35);
    g.add(head);
    const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.14), this.timber);
    yoke.position.set(0, 0.08, 0.12);
    g.add(yoke);
    g.scale.setScalar(this.scale);
    this.group.add(g);
    return { obj: g, angle: (i / 2) * Math.PI * 2 + 0.7, speed: 0.12 + i * 0.03, r: this.ring, wheels };
  }

  private randomWaypoint(kind: Kind): Waypoint {
    const pool = kind === "guard" ? this.waypoints.filter((w) => w.kind === "wall" || w.kind === "gate") : kind === "merchant" ? this.waypoints.filter((w) => w.kind === "market" || w.kind === "door" || w.kind === "gate") : this.waypoints.filter((w) => w.kind !== "wall");
    const list = pool.length ? pool : this.waypoints;
    return list[Math.floor(Math.random() * list.length)] ?? { x: 0, z: this.ring, kind: "ring" };
  }

  /** Route: current → nearest ring point → along the ring (shorter arc) → target's ring point → target. Guards go
   * straight along the wall circle. */
  private route(a: Agent, target: Waypoint) {
    const from = a.obj.position;
    const path: THREE.Vector3[] = [];
    const R = a.kind === "guard" ? this.wallR - 0.35 : this.ring;
    const a0 = Math.atan2(from.x, from.z);
    const a1 = Math.atan2(target.x, target.z);
    const onRing = (ang: number) => new THREE.Vector3(Math.sin(ang) * R, 0, Math.cos(ang) * R);
    const r0 = Math.hypot(from.x, from.z);
    if (Math.abs(r0 - R) > 0.08) path.push(onRing(a0));
    let d = a1 - a0;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const steps = Math.max(1, Math.ceil(Math.abs(d) / 0.35));
    for (let i = 1; i <= steps; i++) path.push(onRing(a0 + (d * i) / steps));
    const rt = Math.hypot(target.x, target.z);
    if (Math.abs(rt - R) > 0.08) path.push(new THREE.Vector3(target.x, 0, target.z));
    a.path = path;
    a.seg = 0;
  }

  update(dt: number, t: number, night: number) {
    this.torchMat.emissiveIntensity = night * 1.6;
    for (const a of this.agents) {
      if (a.wait > 0) {
        a.wait -= dt;
        a.obj.position.y = 0;
        continue;
      }
      if (a.seg >= a.path.length) {
        this.route(a, this.randomWaypoint(a.kind));
        a.wait = 0.8 + Math.random() * 3;
        continue;
      }
      const target = a.path[a.seg];
      const dx = target.x - a.obj.position.x;
      const dz = target.z - a.obj.position.z;
      const dist = Math.hypot(dx, dz);
      const step = a.speed * dt;
      if (dist <= step) {
        a.obj.position.set(target.x, 0, target.z);
        a.seg++;
      } else {
        a.obj.position.x += (dx / dist) * step;
        a.obj.position.z += (dz / dist) * step;
        a.obj.rotation.y = Math.atan2(dx, dz);
      }
      // walk bob
      a.obj.position.y = Math.abs(Math.sin(t * 9 + a.phase)) * 0.012 * this.scale;
      a.body.rotation.z = Math.sin(t * 9 + a.phase) * 0.06;
    }
    for (const c of this.carts) {
      c.angle -= (c.speed * dt) / c.r;
      c.obj.position.set(Math.sin(c.angle) * c.r, 0, Math.cos(c.angle) * c.r);
      c.obj.rotation.y = c.angle - Math.PI / 2;
      for (const w of c.wheels) w.rotation.x -= (c.speed * dt) / 0.05;
    }
  }

  clear() {
    for (const a of this.agents) this.group.remove(a.obj);
    for (const c of this.carts) this.group.remove(c.obj);
    for (const m of this.mats) m.dispose();
    this.mats = [];
    this.agents = [];
    this.carts = [];
  }

  dispose() {
    this.clear();
    for (const g of Object.values(this.geo)) g.dispose();
    this.skin.dispose();
    this.timber.dispose();
    this.oxMat.dispose();
    this.metal.dispose();
    this.torchMat.dispose();
  }
}
