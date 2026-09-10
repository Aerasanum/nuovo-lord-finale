/**
 * Terrain shader: vertex-blended base colour + in-shader micro detail (grass/dirt grain that fades with distance),
 * slope-driven rock, noisy snow line, sun + hemisphere lighting and scene fog. No textures → identical on Android/web.
 */
import * as THREE from "three";

import type { TerrainPalette } from "./terrain";

const VERT = /* glsl */ `
varying vec3 vColor;
varying vec3 vNormalW;
varying vec3 vWorld;
varying float vDepth;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vColor = color;
  vec4 mvPosition = viewMatrix * wp;
  vDepth = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uRock;
uniform vec3 uSnow;
uniform float uSnowHeight;
uniform float uDetail;
varying vec3 vColor;
varying vec3 vNormalW;
varying vec3 vWorld;
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
  vec3 n = normalize(vNormalW);
  vec3 col = vColor;
  float far = clamp(vDepth / 110.0, 0.0, 1.0);
  // micro grain: two octaves, fades out with distance so far terrain stays calm
  float d = vnoise(vWorld.xz * 2.3) * 0.6 + vnoise(vWorld.xz * 7.9) * 0.4;
  col *= 1.0 + (d - 0.5) * 0.26 * uDetail * (1.0 - far);
  // broad meadow / soil patches, always on
  float p = vnoise(vWorld.xz * 0.075 + 13.0);
  col *= 0.94 + 0.13 * p;
  // low-frequency edge noise for rock / snow boundaries (keeps them organic, not speckled)
  float e = vnoise(vWorld.xz * 0.55 + 41.0) - 0.5;
  // exposed rock on steep slopes
  float slope = 1.0 - n.y;
  float rockMix = smoothstep(0.18, 0.45, slope + e * 0.18);
  col = mix(col, uRock * (0.68 + 0.55 * d), rockMix);
  // snow above the snow line (except cliffs)
  float snowMix = smoothstep(uSnowHeight - 0.3, uSnowHeight + 0.3, vWorld.y + e * 0.8) * (1.0 - smoothstep(0.45, 0.75, slope));
  col = mix(col, uSnow * (0.92 + 0.12 * d), snowMix);
  // lighting: warm sun + sky/ground hemisphere
  float ndl = max(dot(n, uSunDir), 0.0);
  vec3 hemi = mix(uGroundColor, uSkyColor, n.y * 0.5 + 0.5);
  vec3 light = uSunColor * (ndl * 0.8 + 0.2 * sqrt(ndl)) + hemi;
  col *= light;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export type TerrainLight = { sunDir: THREE.Vector3; sunColor: THREE.Color; skyColor: THREE.Color; groundColor: THREE.Color };

export function createTerrainMaterial(pal: TerrainPalette, light: TerrainLight, opts: { detail: number; polygonOffset?: boolean; snowHeight?: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    vertexColors: true,
    fog: true,
    polygonOffset: !!opts.polygonOffset,
    polygonOffsetFactor: opts.polygonOffset ? 2 : 0,
    polygonOffsetUnits: opts.polygonOffset ? 4 : 0,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uSunDir: { value: light.sunDir.clone().normalize() },
        uSunColor: { value: light.sunColor.clone() },
        uSkyColor: { value: light.skyColor.clone() },
        uGroundColor: { value: light.groundColor.clone() },
        uRock: { value: pal.rock.clone() },
        uSnow: { value: pal.snow.clone() },
        uSnowHeight: { value: opts.snowHeight ?? 3.9 },
        uDetail: { value: opts.detail },
      },
    ]),
  });
}
