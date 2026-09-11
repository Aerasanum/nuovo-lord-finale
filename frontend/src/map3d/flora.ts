/**
 * Flora & props: conifers (three-tier), broadleaf trees, bushes and boulders as instanced meshes with per-instance
 * colour variation. `buildFull` is the close-up set (LOD0); `buildSparse` keeps forests readable at mid zoom (LOD1).
 */
import * as THREE from "three";

import { ENTITY_TIME } from "./entities";
import { mergeGeos, place } from "./geo";
import { hash2, type Sampler } from "./terrain";

export type FloraPalette = { forest: THREE.Color; plain: THREE.Color; rock: THREE.Color; wood: THREE.Color };

type Ground = (wx: number, wz: number) => number;

const UP = new THREE.Vector3(0, 1, 0);
const CHUNK = 32;
const CASTERS = new Set(["conifer", "trunk", "broad", "broadTrunk", "rock"]);

/** Deterministic radial jitter of the vertices (irregular silhouettes without extra polygons). */
function jitter(geo: THREE.BufferGeometry, amount: number, seed: number): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const k = 1 + (hash2(Math.round(x * 97) + seed * 13, Math.round(pos.getY(i) * 89) + Math.round(z * 71)) - 0.5) * 2 * amount;
    pos.setXYZ(i, x * k, pos.getY(i) * (1 + (k - 1) * 0.4), z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Bakes a vertical ambient-occlusion gradient into vertex colours (dark near the trunk / ground, bright at the top). */
function bakeAO(geo: THREE.BufferGeometry, yMin: number, yMax: number, dark: number): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const u = Math.min(1, Math.max(0, (pos.getY(i) - yMin) / (yMax - yMin)));
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    const v = dark + (1 - dark) * (0.55 * u + 0.45 * Math.min(1, r * 2.2));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo;
}

/** Wind: canopies sway with height, phase seeded by the instance position so a forest never moves in lockstep. */
function sway<T extends THREE.Material>(mat: T): T {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = ENTITY_TIME;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 seedp = instanceMatrix[3].xz;
        #else
          vec2 seedp = modelMatrix[3].xz;
        #endif
        float ph = seedp.x * 1.7 + seedp.y * 2.3;
        float h = max(0.0, transformed.y - 0.25);
        transformed.x += sin(uTime * 1.1 + ph) * 0.035 * h;
        transformed.z += cos(uTime * 0.9 + ph * 1.3) * 0.03 * h;`,
      );
  };
  mat.customProgramCacheKey = () => "sway";
  return mat;
}

export class FloraFactory {
  private geos: Record<string, THREE.BufferGeometry>;
  private mats: Record<string, THREE.Material>;
  private pal: FloraPalette;

  constructor(pal: FloraPalette) {
    this.pal = pal;
    // conifer: four irregular tiers (jittered rims) with baked ambient occlusion towards the trunk
    const tier = (r: number, h: number, y: number, seed: number) => jitter(place(new THREE.ConeGeometry(r, h, 7), 0, y, 0), 0.07, seed);
    const conifer = bakeAO(mergeGeos([tier(0.42, 0.62, 0.5, 1), tier(0.34, 0.58, 0.86, 2), tier(0.25, 0.52, 1.2, 3), tier(0.15, 0.42, 1.5, 4)]), 0.2, 1.7, 0.55);
    const trunk = place(new THREE.CylinderGeometry(0.05, 0.08, 0.45, 5), 0, 0.22, 0);
    // broadleaf: rounded canopy from five overlapping blobs + forked trunk
    const blob = (r: number, x: number, y: number, z: number, seed: number) => jitter(place(new THREE.IcosahedronGeometry(r, 1), x, y, z), 0.05, seed);
    const broad = bakeAO(mergeGeos([blob(0.36, 0, 0.86, 0, 5), blob(0.28, 0.24, 0.72, 0.12, 6), blob(0.27, -0.22, 0.76, -0.14, 7), blob(0.24, 0.05, 0.66, -0.26, 8), blob(0.22, -0.06, 1.08, 0.1, 9)]), 0.45, 1.3, 0.5);
    const broadTrunk = mergeGeos([place(new THREE.CylinderGeometry(0.05, 0.09, 0.6, 5), 0, 0.3, 0), place(new THREE.CylinderGeometry(0.025, 0.04, 0.32, 4).rotateZ(0.6), 0.14, 0.62, 0.05), place(new THREE.CylinderGeometry(0.025, 0.04, 0.3, 4).rotateZ(-0.7), -0.13, 0.6, -0.06)]);
    const bush = jitter(new THREE.IcosahedronGeometry(0.18, 1), 0.04, 11);
    bush.scale(1, 0.7, 1);
    bush.translate(0, 0.1, 0);
    const rock = jitter(new THREE.DodecahedronGeometry(0.17, 0), 0.05, 12);
    rock.translate(0, 0.08, 0);
    this.geos = { conifer, trunk, broad, broadTrunk, bush, rock };
    const lit = (extra: Partial<THREE.MeshLambertMaterialParameters> = {}) => new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, ...extra });
    this.mats = { canopy: sway(lit({ vertexColors: true })), trunk: lit(), broad: sway(lit({ vertexColors: true })), bush: sway(lit()), rock: lit() };
    for (const g of Object.values(this.geos)) g.userData.shared = true;
    for (const m of Object.values(this.mats)) m.userData.shared = true;
  }

  private static isEdge(sampler: Sampler, gx: number, gz: number): boolean {
    return sampler(gx + 1, gz) === 0 || sampler(gx - 1, gz) === 0 || sampler(gx, gz + 1) === 0 || sampler(gx, gz - 1) === 0;
  }

  private static nearForest(sampler: Sampler, gx: number, gz: number): boolean {
    return sampler(gx + 1, gz) === 1 || sampler(gx - 1, gz) === 1 || sampler(gx, gz + 1) === 1 || sampler(gx, gz - 1) === 1;
  }

  /** Close-up vegetation and props for one chunk (LOD0). */
  buildFull(cx: number, cy: number, sampler: Sampler, blocked: Set<number>, ground: Ground): THREE.Group {
    const b = new Batch(this.geos, this.mats, this.pal, ground);
    const ox = cx * CHUNK;
    const oz = cy * CHUNK;
    for (let i = 0; i < CHUNK * CHUNK; i++) {
      if (blocked.has(i)) continue;
      const gx = ox + (i % CHUNK);
      const gz = oz + Math.floor(i / CHUNK);
      const t = sampler(gx, gz);
      const r = hash2(gx * 11 + 3, gz * 13 + 7);
      if (t === 1) {
        const edge = FloraFactory.isEdge(sampler, gx, gz);
        b.conifer(gx, gz, 0);
        b.conifer(gx, gz, 1);
        if (edge && r < 0.6) b.broad(gx, gz, 2);
        else b.conifer(gx, gz, 2);
      } else if (t === 0) {
        if (FloraFactory.nearForest(sampler, gx, gz)) {
          if (r < 0.42) b.broad(gx, gz, 0);
        } else if (r < 0.035) b.broad(gx, gz, 0);
        if (r > 0.9) b.bush(gx, gz, 0);
        if (r > 0.96) b.bush(gx, gz, 1);
      } else if (t === 2) {
        if (r < 0.13) b.rock(gx, gz, 0);
        else if (r < 0.22 && ground(gx + 0.5, gz + 0.5) < 2.3) b.conifer(gx, gz, 0, 0.8);
      }
    }
    return b.finish();
  }

  /** Mid-zoom forest silhouettes (LOD1): one large conifer on roughly a third of forest tiles. */
  buildSparse(cx: number, cy: number, sampler: Sampler, blocked: Set<number>, ground: Ground): THREE.Group | null {
    const b = new Batch(this.geos, this.mats, this.pal, ground);
    const ox = cx * CHUNK;
    const oz = cy * CHUNK;
    let any = false;
    for (let i = 0; i < CHUNK * CHUNK; i++) {
      if (blocked.has(i)) continue;
      const gx = ox + (i % CHUNK);
      const gz = oz + Math.floor(i / CHUNK);
      if (sampler(gx, gz) !== 1 || hash2(gx * 17 + 1, gz * 19 + 5) > 0.34) continue;
      b.conifer(gx, gz, 0, 1.45);
      any = true;
    }
    return any ? b.finish() : null;
  }
}

/** Collects instances per kind, then materialises InstancedMeshes in one go. */
class Batch {
  private items: Record<string, { m: THREE.Matrix4; c: THREE.Color }[]> = { conifer: [], trunk: [], broad: [], broadTrunk: [], bush: [], rock: [] };
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();

  constructor(
    private geos: Record<string, THREE.BufferGeometry>,
    private mats: Record<string, THREE.Material>,
    private pal: FloraPalette,
    private ground: Ground,
  ) {}

  private add(kind: string, x: number, y: number, z: number, sc: number, rot: number, color: THREE.Color, sy = sc) {
    this.p.set(x, y, z);
    this.q.setFromAxisAngle(UP, rot);
    this.s.set(sc, sy, sc);
    this.items[kind].push({ m: new THREE.Matrix4().compose(this.p, this.q, this.s), c: color });
  }

  private spot(gx: number, gz: number, j: number): { x: number; z: number; y: number; sc: number; rot: number; r: number } {
    const r1 = hash2(gx * 2 + j * 31, gz * 3 + j * 17);
    const r2 = hash2(gx * 5 + j * 13, gz * 7 + j * 29);
    const x = gx + 0.15 + r1 * 0.7;
    const z = gz + 0.15 + r2 * 0.7;
    return { x, z, y: this.ground(x, z), sc: 0.75 + 0.5 * hash2(gx + j, gz - j), rot: r1 * Math.PI * 2, r: r2 };
  }

  conifer(gx: number, gz: number, j: number, k = 1) {
    const s = this.spot(gx, gz, j);
    const c = this.pal.forest.clone().offsetHSL((s.r - 0.5) * 0.05, (s.r - 0.5) * 0.12, (hash2(gx * 3 + j, gz * 9) - 0.5) * 0.12);
    this.add("conifer", s.x, s.y, s.z, s.sc * k, s.rot, c);
    this.add("trunk", s.x, s.y, s.z, s.sc * k, s.rot, this.pal.wood);
  }

  broad(gx: number, gz: number, j: number) {
    const s = this.spot(gx, gz, j);
    const autumn = hash2(gx * 23 + j, gz * 29) < 0.05;
    const c = autumn ? this.pal.forest.clone().offsetHSL(-0.27, 0.35, 0.08) : this.pal.forest.clone().lerp(this.pal.plain, 0.3).offsetHSL((s.r - 0.5) * 0.03, 0.12, 0.04 + (s.r - 0.5) * 0.08);
    this.add("broad", s.x, s.y, s.z, s.sc, s.rot, c);
    this.add("broadTrunk", s.x, s.y, s.z, s.sc, s.rot, this.pal.wood);
  }

  bush(gx: number, gz: number, j: number) {
    const s = this.spot(gx, gz, j + 5);
    this.add("bush", s.x, s.y, s.z, s.sc, s.rot, this.pal.forest.clone().lerp(this.pal.plain, 0.5).offsetHSL(0.01, 0.1, 0.02 + (s.r - 0.5) * 0.08));
  }

  rock(gx: number, gz: number, j: number) {
    const s = this.spot(gx, gz, j + 9);
    this.add("rock", s.x, s.y, s.z, 0.5 + s.sc * 0.6, s.rot, this.pal.rock.clone().offsetHSL(0, 0, (s.r - 0.5) * 0.14), 0.4 + s.sc * 0.4);
  }

  finish(): THREE.Group {
    const g = new THREE.Group();
    const matFor: Record<string, string> = { conifer: "canopy", trunk: "trunk", broad: "broad", broadTrunk: "trunk", bush: "bush", rock: "rock" };
    for (const [kind, list] of Object.entries(this.items)) {
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(this.geos[kind], this.mats[matFor[kind]], list.length);
      list.forEach((it, i) => {
        mesh.setMatrixAt(i, it.m);
        mesh.setColorAt(i, it.c);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
      mesh.castShadow = CASTERS.has(kind);
      g.add(mesh);
    }
    return g;
  }
}
