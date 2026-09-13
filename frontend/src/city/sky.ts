/**
 * Stylised sky for the 3D city: a gradient dome (zenith → horizon, sun glow, stars at night) and a slow ring of
 * puffy low-poly clouds. `apply` follows the realm daylight so dawn/dusk tint the whole sky, `tick` drifts the clouds.
 */
import * as THREE from "three";

import type { Daylight } from "@/src/map3d/daylight";

export type Sky = { group: THREE.Group; apply(d: Daylight, horizon: THREE.Color): void; tick(dt: number): void; dispose(): void };

const ZENITH_DAY = new THREE.Color("#3d8ee6");
const ZENITH_NIGHT = new THREE.Color("#1c3372");
const CLOUD_DAY = new THREE.Color("#ffffff");
const CLOUD_NIGHT = new THREE.Color("#5a6a99");

function hash(i: number, j: number): number {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** One puffy cloud: a few jittered icosahedron blobs flattened at the base, merged into one geometry. */
function cloudGeometry(seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = 4 + Math.floor(hash(seed, 1) * 3);
  for (let i = 0; i < n; i++) {
    const r = 0.55 + hash(seed, i + 2) * 0.55;
    const g = new THREE.IcosahedronGeometry(r, 1);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < pos.count; v++) {
      const k = 1 + (hash(seed * 7 + i, v) - 0.5) * 0.22;
      const y = pos.getY(v);
      pos.setXYZ(v, pos.getX(v) * k, y < 0 ? y * 0.35 : y * k, pos.getZ(v) * k);
    }
    g.translate((i - (n - 1) / 2) * 0.72 + (hash(seed, i + 9) - 0.5) * 0.3, (hash(seed, i + 13) - 0.5) * 0.25 + (i % 2) * 0.12, (hash(seed, i + 17) - 0.5) * 0.5);
    g.computeVertexNormals();
    parts.push(g.index ? g.toNonIndexed() : g);
  }
  let total = 0;
  for (const g of parts) total += g.attributes.position.count;
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  let off = 0;
  for (const g of parts) {
    positions.set(g.attributes.position.array as Float32Array, off * 3);
    normals.set(g.attributes.normal.array as Float32Array, off * 3);
    off += g.attributes.position.count;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  return geo;
}

export function createSky(radius = 60, cloudRadius = 14): Sky {
  const group = new THREE.Group();
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: ZENITH_DAY.clone() },
      uHorizon: { value: new THREE.Color("#bfe3ff") },
      uSun: { value: new THREE.Vector3(0.5, 0.8, 0.3) },
      uSunColor: { value: new THREE.Color("#fff1c9") },
      uNight: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uSun;
      uniform vec3 uSunColor;
      uniform float uNight;
      varying vec3 vDir;
      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      void main() {
        vec3 d = normalize(vDir);
        float t = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uZenith, pow(t, 0.5));
        float sd = max(dot(d, normalize(uSun)), 0.0);
        col += uSunColor * (pow(sd, 64.0) * 1.2 + pow(sd, 5.0) * 0.14) * (1.0 - uNight * 0.75);
        vec2 sp = d.xz / max(0.12, d.y + 0.15) * 36.0;
        float star = step(0.994, hash12(floor(sp))) * smoothstep(0.05, 0.45, d.y) * (0.6 + 0.4 * hash12(floor(sp) + 7.0));
        col += vec3(star) * uNight;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 12), domeMat);
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  group.add(dome);

  const cloudMat = new THREE.MeshLambertMaterial({ color: CLOUD_DAY, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.18, fog: false });
  const clouds = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 10; i++) {
    const g = cloudGeometry(i + 1);
    geos.push(g);
    const m = new THREE.Mesh(g, cloudMat);
    const a = (i / 10) * Math.PI * 2 + hash(i, 40) * 0.5;
    const r = cloudRadius * (0.75 + hash(i, 41) * 0.6);
    const s = 0.9 + hash(i, 42) * 0.9;
    m.position.set(Math.sin(a) * r, 5.2 + hash(i, 43) * 3.2, Math.cos(a) * r);
    m.scale.set(s * 1.3, s * 0.75, s);
    m.rotation.y = hash(i, 44) * Math.PI;
    clouds.add(m);
  }
  group.add(clouds);

  return {
    group,
    apply(d, horizon) {
      const u = domeMat.uniforms;
      (u.uHorizon.value as THREE.Color).copy(horizon);
      (u.uZenith.value as THREE.Color).copy(ZENITH_DAY).lerp(ZENITH_NIGHT, d.night).lerp(d.horizonTint, d.horizonMix * 0.25);
      (u.uSun.value as THREE.Vector3).copy(d.sunDir);
      (u.uSunColor.value as THREE.Color).copy(d.sunColor);
      u.uNight.value = d.night;
      cloudMat.color.copy(CLOUD_DAY).lerp(CLOUD_NIGHT, d.night).lerp(d.horizonTint, d.horizonMix * 0.35);
      cloudMat.emissiveIntensity = 0.18 * (1 - d.night);
    },
    tick(dt) {
      clouds.rotation.y += dt * 0.006;
    },
    dispose() {
      dome.geometry.dispose();
      domeMat.dispose();
      cloudMat.dispose();
      for (const g of geos) g.dispose();
    },
  };
}
