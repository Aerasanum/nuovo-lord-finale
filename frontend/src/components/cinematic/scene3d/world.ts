/**
 * Cinematic 3D world (three.js on expo-gl, same stack as the map): sky dome, stars/moon or dawn sun, rolling ground
 * with a dirt road, hill ranges, low-poly trees, fog and lights. Scenes (departure / conquest) add their actors.
 * Everything here is a pure function of the scene clock → skip-safe and deterministic.
 */
import type { ExpoWebGLRenderingContext } from "expo-gl";
import * as THREE from "three";

import { EntityFactory } from "@/src/map3d/entities";
import { SmokeSystem } from "@/src/map3d/smoke";
import type { ThemeColors } from "@/src/theme";

export type Mood = "night" | "dawn";

// Physical scene colours (painted backdrop) — identical in every UI theme by design.
const NIGHT = { top: 0x070b18, horizon: 0x2a2340, ground: 0x24361f, groundDark: 0x18261a, road: 0x4a3a28, hill: 0x1a2a2a, hillFar: 0x24304a, tree: 0x1d3a24, trunk: 0x3a2b1c, star: 0xf2e9dc, moon: 0xf2e9dc };
const DAWN = { top: 0x1b2a55, horizon: 0xe08a4a, ground: 0x3f5a2c, groundDark: 0x2c4224, road: 0x6b5236, hill: 0x2e3a3a, hillFar: 0x5a4a6a, tree: 0x2b5a30, trunk: 0x4a3620, star: 0xf2e9dc, moon: 0xffd9a0 };

/** Cheap 2-octave value noise (deterministic). */
export function noise2(x: number, z: number): number {
  return Math.sin(x * 0.35 + Math.sin(z * 0.21) * 1.7) * 0.6 + Math.sin(z * 0.27 + Math.cos(x * 0.19) * 1.3) * 0.4;
}

export class CinematicWorld {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly factory: EntityFactory;
  readonly smoke: SmokeSystem;
  readonly own: THREE.Color;
  readonly enemy: THREE.Color;
  readonly mood: Mood;
  readonly palette: typeof NIGHT;
  private gl: ExpoWebGLRenderingContext;
  private disposables: { dispose(): void }[] = [];

  constructor(gl: ExpoWebGLRenderingContext, colors: ThemeColors, mood: Mood) {
    this.gl = gl;
    this.mood = mood;
    this.palette = mood === "night" ? NIGHT : DAWN;
    const p = this.palette;
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const canvas: any = { width: w, height: h, style: {}, addEventListener: () => {}, removeEventListener: () => {}, clientHeight: h, getContext: () => gl };
    this.renderer = new THREE.WebGLRenderer({ canvas, context: gl as any, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.renderer.setClearColor(new THREE.Color(p.horizon), 1);
    this.scene.fog = new THREE.Fog(new THREE.Color(p.horizon), mood === "night" ? 26 : 34, mood === "night" ? 120 : 150);
    this.camera = new THREE.PerspectiveCamera(50, w / Math.max(1, h), 0.1, 600);

    this.own = new THREE.Color(colors.factionOwn);
    this.enemy = new THREE.Color(colors.factionEnemy);
    this.factory = new EntityFactory({ own: this.own, enemy: this.enemy, neutral: new THREE.Color(colors.factionNeutral), ally: new THREE.Color(colors.factionAlly), snow: new THREE.Color(colors.onSurface) });
    this.smoke = new SmokeSystem(new THREE.Color(0xb8b0a4));
    this.scene.add(this.smoke.mesh);

    this.buildLights();
    this.buildSky();
    this.buildGround();
    this.buildHills();
    this.buildTrees();
  }

  private track<T extends { dispose(): void }>(d: T): T {
    this.disposables.push(d);
    return d;
  }

  private lit(color: number, extra: Partial<THREE.MeshLambertMaterialParameters> = {}): THREE.MeshLambertMaterial {
    return this.track(new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra }));
  }

  private buildLights() {
    if (this.mood === "night") {
      this.scene.add(new THREE.HemisphereLight(0x6a7ab0, 0x2a2a1e, 1.25));
      const moon = new THREE.DirectionalLight(0xbcc8ff, 1.2);
      moon.position.set(-40, 60, -30);
      this.scene.add(moon);
      this.scene.add(new THREE.AmbientLight(0x2a2a40, 0.6));
    } else {
      this.scene.add(new THREE.HemisphereLight(0xffd9b0, 0x3a3a2a, 1.0));
      const sun = new THREE.DirectionalLight(0xffc48a, 1.6);
      sun.position.set(30, 22, -70);
      this.scene.add(sun);
      this.scene.add(new THREE.AmbientLight(0x604030, 0.5));
    }
  }

  private buildSky() {
    const p = this.palette;
    const geo = this.track(new THREE.SphereGeometry(420, 24, 12));
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const top = new THREE.Color(p.top);
    const hor = new THREE.Color(p.horizon);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = Math.max(0, pos.getY(i) / 420);
      c.copy(hor).lerp(top, Math.pow(y, 0.55));
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const sky = new THREE.Mesh(geo, this.track(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })));
    this.scene.add(sky);

    if (this.mood === "night") {
      const n = 420;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const e = Math.asin(0.05 + Math.random() * 0.95);
        arr[i * 3] = Math.cos(a) * Math.cos(e) * 380;
        arr[i * 3 + 1] = Math.sin(e) * 380;
        arr[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 380;
      }
      const sg = this.track(new THREE.BufferGeometry());
      sg.setAttribute("position", new THREE.BufferAttribute(arr, 3));
      this.scene.add(new THREE.Points(sg, this.track(new THREE.PointsMaterial({ color: p.star, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0.8, fog: false }))));
      const moon = new THREE.Mesh(this.track(new THREE.SphereGeometry(10, 16, 12)), this.track(new THREE.MeshBasicMaterial({ color: p.moon, fog: false })));
      moon.position.set(140, 120, -260);
      this.scene.add(moon);
      const glow = new THREE.Mesh(this.track(new THREE.SphereGeometry(22, 16, 12)), this.track(new THREE.MeshBasicMaterial({ color: p.moon, transparent: true, opacity: 0.12, fog: false, blending: THREE.AdditiveBlending, depthWrite: false })));
      glow.position.copy(moon.position);
      this.scene.add(glow);
    } else {
      const sun = new THREE.Mesh(this.track(new THREE.SphereGeometry(14, 16, 12)), this.track(new THREE.MeshBasicMaterial({ color: 0xffb060, fog: false })));
      sun.position.set(60, 18, -300);
      this.scene.add(sun);
      const glow = new THREE.Mesh(this.track(new THREE.SphereGeometry(40, 16, 12)), this.track(new THREE.MeshBasicMaterial({ color: 0xff9a40, transparent: true, opacity: 0.18, fog: false, blending: THREE.AdditiveBlending, depthWrite: false })));
      glow.position.copy(sun.position);
      this.scene.add(glow);
    }
  }

  private buildGround() {
    const p = this.palette;
    const size = 260;
    const geo = this.track(new THREE.PlaneGeometry(size, size, 104, 104));
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const grass = new THREE.Color(p.ground);
    const dark = new THREE.Color(p.groundDark);
    const road = new THREE.Color(p.road);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const onRoad = Math.abs(z) < 1.9;
      const n = noise2(x, z);
      const y = onRoad ? 0 : Math.max(0, n) * 0.45 * Math.min(1, (Math.abs(z) - 1.9) / 3);
      pos.setY(i, y);
      c.copy(grass).lerp(dark, 0.5 + 0.5 * Math.sin(x * 0.9 + z * 1.3 + n * 2));
      if (onRoad) c.copy(road).offsetHSL(0, 0, (Math.sin(x * 2.1) * 0.5 + 0.5) * 0.05);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    this.scene.add(new THREE.Mesh(geo, this.lit(0xffffff, { vertexColors: true })));
  }

  private buildHills() {
    const p = this.palette;
    const near = this.lit(p.hill);
    const far = this.lit(p.hillFar);
    const cone = this.track(new THREE.ConeGeometry(1, 1, 7));
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(cone, i % 3 === 0 ? far : near);
      const x = -90 + i * 14 + Math.sin(i * 3.1) * 6;
      const z = i % 3 === 0 ? -78 - Math.cos(i) * 8 : -46 - Math.sin(i * 1.7) * 9;
      const r = 16 + (i % 4) * 5;
      const h = (i % 3 === 0 ? 14 : 7) + (i % 5) * 1.6;
      m.position.set(x, -0.5, z);
      m.scale.set(r, h, r);
      this.scene.add(m);
    }
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(cone, near);
      m.position.set(-70 + i * 30, -0.5, 42 + Math.sin(i * 2.3) * 8);
      m.scale.set(18, 5 + (i % 3) * 1.5, 18);
      this.scene.add(m);
    }
  }

  private buildTrees() {
    const p = this.palette;
    const crown = this.track(new THREE.ConeGeometry(0.9, 2.4, 6));
    crown.translate(0, 1.9, 0);
    const trunk = this.track(new THREE.CylinderGeometry(0.12, 0.16, 0.9, 5));
    trunk.translate(0, 0.45, 0);
    const n = 90;
    const crowns = new THREE.InstancedMesh(crown, this.lit(p.tree), n);
    const trunks = new THREE.InstancedMesh(trunk, this.lit(p.trunk), n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      const x = -70 + ((i * 37) % 160) + Math.sin(i * 7.3) * 3;
      const z = side * (4.5 + ((i * 53) % 23) + Math.cos(i * 3.7) * 2);
      const sc = 0.8 + ((i * 29) % 10) / 12;
      v.set(x, Math.max(0, noise2(x, z)) * 0.4, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.3);
      s.set(sc, sc * (0.9 + ((i * 11) % 5) / 10), sc);
      m.compose(v, q, s);
      crowns.setMatrixAt(i, m);
      trunks.setMatrixAt(i, m);
    }
    crowns.frustumCulled = false;
    trunks.frustumCulled = false;
    this.scene.add(crowns, trunks);
  }

  resizeIfNeeded() {
    const bw = this.gl.drawingBufferWidth;
    const bh = this.gl.drawingBufferHeight;
    if (!bw || !bh) return false;
    if (bw !== this.renderer.domElement.width || bh !== this.renderer.domElement.height) {
      this.renderer.setSize(bw, bh, false);
      this.camera.aspect = bw / bh;
      this.camera.updateProjectionMatrix();
    }
    return true;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
    this.gl.endFrameEXP();
  }

  dispose() {
    this.smoke.dispose();
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
  }
}

/** smoothstep-eased 0..1 over [a, b]. */
export function ease(t: number, a: number, b: number): number {
  const u = Math.max(0, Math.min(1, (t - a) / Math.max(1e-6, b - a)));
  return u * u * (3 - 2 * u);
}
