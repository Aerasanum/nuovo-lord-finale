/**
 * Terrain shader: vertex-blended base colour + tileable detail textures (grass/soil grain, ridged rock, fine grain)
 * fading with distance, slope-driven rock, noisy snow line, sun + hemisphere lighting with real-time sun shadows
 * (three.js shadow-map chunks), ACES tone mapping and scene fog. Textures are procedural (see textures.ts) so the
 * result is identical on Android and web.
 */
import * as THREE from "three";

import type { TerrainPalette } from "./terrain";

const VERT = /* glsl */ `
#include <common>
#include <shadowmap_pars_vertex>
#include <fog_pars_vertex>
varying vec3 vColor;
varying vec3 vNormalW;
varying vec3 vWorld;
varying float vDepth;
void main() {
  vec3 transformed = position;
  vec3 objectNormal = normal;
  vec3 transformedNormal = normalMatrix * objectNormal;
  vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
  vWorld = worldPosition.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vColor = color;
  vec4 mvPosition = viewMatrix * worldPosition;
  vDepth = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
  #include <shadowmap_vertex>
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
#include <common>
#include <packing>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
#include <fog_pars_fragment>
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uRock;
uniform vec3 uSnow;
uniform float uSnowHeight;
uniform float uDetail;
uniform sampler2D uDetailTex;
varying vec3 vColor;
varying vec3 vNormalW;
varying vec3 vWorld;
varying float vDepth;
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
  float far = clamp(vDepth / 120.0, 0.0, 1.0);
  // detail textures: near tiling + macro tiling, fading with distance so far terrain stays calm
  vec4 d1 = texture2D(uDetailTex, vWorld.xz * 0.37);
  vec4 d2 = texture2D(uDetailTex, vWorld.xz * 0.047);
  float g = d1.r * 0.55 + d2.r * 0.45;
  col *= 1.0 + (g - 0.5) * 0.7 * uDetail * (1.0 - far * 0.8);
  col *= 1.0 + (d1.b - 0.5) * 0.16 * uDetail * (1.0 - far);
  // dry soil patches where the macro noise is low: warmer, less saturated grass
  col = mix(col, col * vec3(1.1, 0.97, 0.7), smoothstep(0.3, 0.62, 1.0 - d2.r) * 0.55 * uDetail);
  // broad meadow / soil patches, always on
  float p = vnoise(vWorld.xz * 0.075 + 13.0);
  col *= 0.93 + 0.14 * p;
  // low-frequency edge noise for rock / snow boundaries (keeps them organic, not speckled)
  float e = vnoise(vWorld.xz * 0.55 + 41.0) - 0.5;
  // exposed rock on steep slopes, textured with ridged cracks
  float slope = 1.0 - n.y;
  float rockMix = smoothstep(0.16, 0.42, slope + e * 0.18);
  float rd = mix(d1.g, d2.g, 0.35);
  col = mix(col, uRock * (0.55 + 0.75 * rd) * (1.0 + (d1.b - 0.5) * 0.2), rockMix);
  // snow above the snow line (except cliffs)
  float snowMix = smoothstep(uSnowHeight - 0.3, uSnowHeight + 0.3, vWorld.y + e * 0.8) * (1.0 - smoothstep(0.45, 0.75, slope));
  col = mix(col, uSnow * (0.9 + 0.14 * d1.r), snowMix);
  // lighting: warm sun (shadowed) + sky/ground hemisphere, faint valley occlusion from the detail macro channel
  float shadow = getShadowMask();
  float ndl = max(dot(n, uSunDir), 0.0);
  vec3 hemi = mix(uGroundColor, uSkyColor, n.y * 0.5 + 0.5);
  vec3 light = uSunColor * (ndl * 0.85 + 0.15 * sqrt(ndl)) * mix(0.2, 1.0, shadow) + hemi * (0.88 + 0.16 * d2.r);
  col *= light;
  // gritty grade: pull saturation, deepen the darks, faint warm-earth cast (adult "Empire" look, not cartoon green)
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, 0.76);
  col = pow(max(col, vec3(0.0)), vec3(1.12)) * vec3(0.99, 0.955, 0.9);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export type TerrainLight = { sunDir: THREE.Vector3; sunColor: THREE.Color; skyColor: THREE.Color; groundColor: THREE.Color };

export function createTerrainMaterial(pal: TerrainPalette, light: TerrainLight, detailTex: THREE.Texture, opts: { detail: number; polygonOffset?: boolean; snowHeight?: number }): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    vertexColors: true,
    fog: true,
    lights: true,
    polygonOffset: !!opts.polygonOffset,
    polygonOffsetFactor: opts.polygonOffset ? 2 : 0,
    polygonOffsetUnits: opts.polygonOffset ? 4 : 0,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.lights,
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
        uDetailTex: { value: null },
      },
    ]),
  });
  mat.uniforms.uDetailTex.value = detailTex; // assigned after merge so the texture is shared, not cloned
  return mat;
}
