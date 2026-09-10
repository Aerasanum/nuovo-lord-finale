/**
 * World water plane: one draw call, vertex waves + shimmer in-shader, fog aware. Sits at WATER_LEVEL so land corners
 * next to water (which dip to ~-0.16) are submerged, giving irregular natural coastlines without extra geometry.
 */
import * as THREE from "three";

import { WATER_LEVEL } from "./terrain";

const VERT = /* glsl */ `
uniform float uTime;
varying vec3 vWorld;
varying float vWave;
varying float vDepth;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float w = sin(wp.x * 0.35 + uTime * 0.9) * 0.5 + cos(wp.z * 0.29 - uTime * 0.7) * 0.5;
  wp.y += w * 0.045;
  vWave = w;
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  vDepth = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform float uTime;
varying vec3 vWorld;
varying float vWave;
varying float vDepth;
#include <fog_pars_fragment>
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec2 p = vWorld.xz;
  float n = vnoise(p * 0.45 + vec2(uTime * 0.12, -uTime * 0.08)) * 0.55 + vnoise(p * 1.6 - vec2(uTime * 0.2, uTime * 0.14)) * 0.45;
  float far = clamp(vDepth / 140.0, 0.0, 1.0);
  float caps = smoothstep(0.66, 0.9, n) * 0.14 * (1.0 - far * 0.75);
  vec3 col = mix(uDeep, uShallow, 0.35 + 0.35 * vWave + 0.3 * n);
  col += caps;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function createWater(world: number, deep: THREE.Color, shallow: THREE.Color): { mesh: THREE.Mesh; update: (tSeconds: number) => void } {
  const pad = 120;
  const geo = new THREE.PlaneGeometry(world + pad * 2, world + pad * 2, 48, 48);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uDeep: { value: deep.clone() }, uShallow: { value: shallow.clone() } }]),
    fog: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(world / 2, WATER_LEVEL, world / 2);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return {
    mesh,
    update: (t) => {
      mat.uniforms.uTime.value = t;
    },
  };
}
