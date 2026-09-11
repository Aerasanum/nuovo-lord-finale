/**
 * Instanced procedural entities (castles, camps, sentinels, pins) and free-standing march markers.
 * One InstancedMesh per part per chunk keeps draw calls ≈ 20 per chunk regardless of settlement count.
 * Shared geometries/materials are flagged `userData.shared` so chunk disposal leaves them alone.
 */
import * as THREE from "three";

import type { CrestDto, SentinelDto, SettlementPublic } from "@/src/api/hooks";

import { BANNER_Y, BRAZIER, buildCastleParts, type CastleSkin, CHIMNEY, FLAG_W, SHADOW_COLOR, settlementScale, skinFor, TORCH_COLOR, TORCHES, TOWER_RADIUS, towerAngles } from "./castle";
import type { SmokeEmitter } from "./smoke";

export { CASTLE_TOP, settlementScale } from "./castle";

/** Shared animation clock (seconds) for waving flags and flickering fire; the engine advances it every frame. */
export const ENTITY_TIME = { value: 0 };
const SMOKE_COLOR = new THREE.Color("#D8D3CB");
const TORCH_SMOKE_COLOR = new THREE.Color("#6E665E");

/**
 * Cloth wave for flag-like meshes (instanced or not): displacement grows from the pole (local x = -xOffset) to the fly
 * end, phase seeded by the instance/world position so banners never wave in lockstep.
 */
function waving<T extends THREE.Material>(mat: T, xOffset: number): T {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = ENTITY_TIME;
    shader.uniforms.uXOffset = { value: xOffset };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uXOffset;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 seedp = instanceMatrix[3].xz;
        #else
          vec2 seedp = modelMatrix[3].xz;
        #endif
        float fx = clamp((transformed.x + uXOffset) / ${FLAG_W.toFixed(3)}, 0.0, 1.0);
        float ph = seedp.x * 1.7 + seedp.y * 2.3;
        transformed.z += sin(uTime * 5.5 + fx * 8.0 + ph) * 0.05 * fx;
        transformed.y += cos(uTime * 3.2 + fx * 5.0 + ph) * 0.014 * fx;`,
      );
  };
  mat.customProgramCacheKey = () => `wave${xOffset}`;
  return mat;
}

export type EntityPalette = {
  own: THREE.Color;
  enemy: THREE.Color;
  neutral: THREE.Color;
  ally: THREE.Color;
  snow: THREE.Color;
};

type Part = { geo: THREE.BufferGeometry; mat: THREE.Material };

const Y_AXIS = new THREE.Vector3(0, 1, 0);
export const CREST_SYMBOLS: CrestDto["primary_symbol"][] = ["circle", "diamond", "cross", "star", "chevron", "tower", "crescent", "triangle"];
const WINDOW_COLOR = new THREE.Color("#15110E");
const WINDOW_LIT = new THREE.Color("#FFC46A"); // candle-lit windows after dusk

/** Flat symbol geometry in flag-local units (centred, ~0.16 tall) — mirrors the SVG crest so 2D and 3D agree. */
function symbolGeometry(kind: CrestDto["primary_symbol"]): THREE.BufferGeometry {
  const s = 0.085; // half-size
  const poly = (pts: [number, number][]) => new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x * s, y * s))));
  switch (kind) {
    case "circle":
      return new THREE.CircleGeometry(s * 0.8, 14);
    case "diamond":
      return poly([
        [0, 1],
        [0.9, 0],
        [0, -1],
        [-0.9, 0],
      ]);
    case "cross":
      return poly([
        [-0.28, 1],
        [0.28, 1],
        [0.28, 0.28],
        [1, 0.28],
        [1, -0.28],
        [0.28, -0.28],
        [0.28, -1],
        [-0.28, -1],
        [-0.28, -0.28],
        [-1, -0.28],
        [-1, 0.28],
        [-0.28, 0.28],
      ]);
    case "star": {
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 1 : 0.45;
        const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      return poly(pts);
    }
    case "chevron":
      return poly([
        [-1, -0.7],
        [0, 0.8],
        [1, -0.7],
        [0.6, -0.7],
        [0, 0.15],
        [-0.6, -0.7],
      ]);
    case "tower":
      return poly([
        [-0.65, -1],
        [-0.65, 0.5],
        [-0.4, 0.5],
        [-0.4, 0.85],
        [-0.15, 0.85],
        [-0.15, 0.5],
        [0.15, 0.5],
        [0.15, 0.85],
        [0.4, 0.85],
        [0.4, 0.5],
        [0.65, 0.5],
        [0.65, -1],
      ]);
    case "crescent": {
      const shape = new THREE.Shape();
      shape.absarc(0, 0, s, Math.PI * 0.5, Math.PI * 1.5, false);
      shape.absarc(s * 0.45, 0, s * 0.8, Math.PI * 1.5, Math.PI * 0.5, true);
      return new THREE.ShapeGeometry(shape, 10);
    }
    default:
      return poly([
        [0, 1],
        [1, -0.85],
        [-1, -0.85],
      ]);
  }
}

export class EntityFactory {
  private parts: Record<string, Part>;
  private pal: EntityPalette;
  private colorCache = new Map<string, THREE.Color>();

  constructor(pal: EntityPalette, textures?: { stone: THREE.Texture; roof: THREE.Texture }) {
    this.pal = pal;
    const geos = buildCastleParts();
    const lit = (extra: Partial<THREE.MeshLambertMaterialParameters> = {}) => new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, ...extra });
    const basic = (extra: Partial<THREE.MeshBasicMaterialParameters> = {}) => new THREE.MeshBasicMaterial({ color: 0xffffff, ...extra });
    // masonry: stone courses on every wall-like part, tiles on the roofs (skins tint them through the instance colour)
    // textured parts: the masonry/tile maps average ≈0.6 brightness, the boosted base colour compensates
    const boost = new THREE.Color(1.7, 1.7, 1.7);
    const stone = (extra: Partial<THREE.MeshLambertMaterialParameters> = {}) => lit(textures ? { map: textures.stone, color: boost, ...extra } : extra);
    const roof = () => lit(textures ? { map: textures.roof, color: boost } : {});
    const symMat = basic({ side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.parts = {
      shadow: { geo: geos.shadow, mat: basic({ color: SHADOW_COLOR, transparent: true, opacity: 0.28, depthWrite: false }) },
      factionRing: { geo: geos.factionRing, mat: basic({ transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }) },
      plinth: { geo: geos.plinth, mat: stone() },
      wall: { geo: geos.wall, mat: stone({ side: THREE.DoubleSide }) },
      keep: { geo: geos.keep, mat: stone() },
      windows: { geo: geos.windows, mat: basic({ color: WINDOW_COLOR }) },
      keepRoof_pyramid: { geo: geos.keepRoof_pyramid, mat: roof() },
      keepRoof_cone: { geo: geos.keepRoof_cone, mat: roof() },
      keepRoof_onion: { geo: geos.keepRoof_onion, mat: lit({ flatShading: false }) },
      turrets: { geo: geos.turrets, mat: stone() },
      tower: { geo: geos.tower, mat: stone() },
      towerRoof_cone: { geo: geos.towerRoof_cone, mat: roof() },
      towerRoof_pyramid: { geo: geos.towerRoof_pyramid, mat: roof() },
      gate: { geo: geos.gate, mat: stone() },
      gateDoor: { geo: geos.gateDoor, mat: lit() },
      gateRoof: { geo: geos.gateRoof, mat: roof() },
      torch: { geo: geos.torch, mat: basic({ color: TORCH_COLOR }) },
      torchGlow: { geo: geos.torchGlow, mat: basic({ color: TORCH_COLOR, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }) },
      senGlow: { geo: geos.senGlow, mat: basic({ transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }) },
      wallBanner: { geo: geos.wallBanner, mat: basic({ side: THREE.DoubleSide }) },
      pole: { geo: geos.pole, mat: basic() },
      flag: { geo: geos.flag, mat: waving(basic({ side: THREE.DoubleSide }), 0) },
      flagBorder: { geo: geos.flagBorder, mat: waving(basic({ side: THREE.DoubleSide }), 0) },
      tent: { geo: geos.tent, mat: lit({ transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }) },
      senTower: { geo: geos.senTower, mat: lit() },
      senFire: { geo: geos.senFire, mat: basic() },
      pin: { geo: geos.pin, mat: basic({ transparent: true, opacity: 0.9 }) },
      army: { geo: geos.army, mat: lit() },
    };
    for (const k of CREST_SYMBOLS) this.parts[`sym_${k}`] = { geo: symbolGeometry(k), mat: waving(symMat.clone(), FLAG_W / 2) };
    symMat.dispose();
    for (const p of Object.values(this.parts)) {
      p.geo.userData.shared = true;
      p.mat.userData.shared = true;
    }
  }

  private night = 0;

  /** 0 by day → 1 at night: fire glows stronger and the windows light up (daylight.ts drives it). */
  setNight(k: number) {
    this.night = Math.max(0, Math.min(1, k));
    (this.parts.windows.mat as THREE.MeshBasicMaterial).color.copy(WINDOW_COLOR).lerp(WINDOW_LIT, this.night);
  }

  /** Per-frame fire flicker (shared materials → one write per frame). */
  tick(t: number) {
    ENTITY_TIME.value = t;
    const flicker = (0.24 + 0.14 * (0.5 + 0.5 * Math.sin(t * 9.1)) * 0.6 + 0.08 * Math.sin(t * 23.3)) * (1 + 1.3 * this.night);
    (this.parts.torchGlow.mat as THREE.MeshBasicMaterial).opacity = Math.min(0.95, flicker);
    (this.parts.senGlow.mat as THREE.MeshBasicMaterial).opacity = Math.min(0.95, flicker * 1.1);
  }

  factionColor(f?: string): THREE.Color {
    return f === "OWN" ? this.pal.own : f === "ENEMY" ? this.pal.enemy : f === "ALLY" ? this.pal.ally : this.pal.neutral;
  }

  private hex(h: string): THREE.Color {
    let c = this.colorCache.get(h);
    if (!c) {
      c = new THREE.Color(h);
      this.colorCache.set(h, c);
    }
    return c;
  }

  /** Free-standing banner (pole + crest flag) for march markers. */
  buildBanner(crest: CrestDto | null | undefined, fallback: THREE.Color, faded: boolean): THREE.Group {
    const g = new THREE.Group();
    // pole geometry is baked at castle height (2.03..2.88): drop and stretch it so it spans ~0.4..1.8 over the soldiers
    const DROP = -1.05;
    const pole = new THREE.Mesh(this.parts.pole.geo, new THREE.MeshBasicMaterial({ color: this.pal.snow }));
    pole.position.y = -1.35;
    pole.scale.set(1, 1.6, 1);
    g.add(pole);
    const baseColor = crest ? this.hex(crest.colors.base) : fallback;
    const flag = new THREE.Mesh(this.parts.flag.geo, waving(new THREE.MeshBasicMaterial({ color: faded ? baseColor.clone().lerp(this.pal.snow, 0.45) : baseColor, side: THREE.DoubleSide, transparent: faded, opacity: faded ? 0.75 : 1 }), 0));
    flag.position.y = DROP;
    g.add(flag);
    if (crest) {
      if (crest.border !== "none") {
        const border = new THREE.Mesh(this.parts.flagBorder.geo, waving(new THREE.MeshBasicMaterial({ color: this.hex(crest.colors.border), side: THREE.DoubleSide }), 0));
        border.position.y = DROP;
        g.add(border);
      }
      const sym = new THREE.Mesh(this.parts[`sym_${crest.primary_symbol}`].geo, waving(new THREE.MeshBasicMaterial({ color: this.hex(crest.colors.primary), side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), FLAG_W / 2));
      sym.position.set(FLAG_W / 2, BANNER_Y + DROP, 0.006);
      g.add(sym);
    }
    return g;
  }

  /** Marching army (soldier wedge + shadow) for march markers; the banner is added by the caller. */
  buildArmy(color: THREE.Color, faded: boolean): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.parts.army.geo, new THREE.MeshLambertMaterial({ color: faded ? color.clone().lerp(this.pal.snow, 0.35) : color, flatShading: true, transparent: faded, opacity: faded ? 0.8 : 1 }));
    g.add(body);
    const shadow = new THREE.Mesh(this.parts.shadow.geo, new THREE.MeshBasicMaterial({ color: SHADOW_COLOR, transparent: true, opacity: 0.22, depthWrite: false }));
    shadow.scale.setScalar(0.42);
    g.add(shadow);
    return g;
  }

  private static CASTERS = new Set(["plinth", "wall", "keep", "keepRoof_pyramid", "keepRoof_cone", "keepRoof_onion", "turrets", "tower", "towerRoof_cone", "towerRoof_pyramid", "gate", "gateRoof", "senTower", "army"]);

  private make(part: string, count: number): THREE.InstancedMesh {
    const p = this.parts[part];
    const m = new THREE.InstancedMesh(p.geo, p.mat, Math.max(1, count));
    m.count = 0;
    m.frustumCulled = false;
    if (EntityFactory.CASTERS.has(part)) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    return m;
  }

  /** Settlements (PLAYER / NEUTRAL castles, PLAYER_SLOT tents) of one chunk. Smoke emitters are returned alongside. */
  buildSettlements(list: SettlementPublic[], heightAt: (x: number, y: number) => number): { group: THREE.Group; emitters: SmokeEmitter[] } {
    const g = new THREE.Group();
    const emitters: SmokeEmitter[] = [];
    const castles = list.filter((s) => s.kind !== "PLAYER_SLOT");
    const slots = list.filter((s) => s.kind === "PLAYER_SLOT");
    const skins = new Map<SettlementPublic, CastleSkin>(castles.map((s) => [s, skinFor(s)]));
    const count = (pred: (s: SettlementPublic, k: CastleSkin) => number) => castles.reduce((acc, s) => acc + pred(s, skins.get(s)!), 0);
    const towers = count((s) => towerAngles(s.level).length);
    const crested = castles.filter((s) => s.owner_house_crest);
    const mesh: Record<string, THREE.InstancedMesh> = {
      shadow: this.make("shadow", castles.length),
      factionRing: this.make("factionRing", castles.length),
      plinth: this.make("plinth", castles.length),
      wall: this.make("wall", castles.length),
      keep: this.make("keep", castles.length),
      windows: this.make("windows", castles.length),
      keepRoof_pyramid: this.make("keepRoof_pyramid", count((_, k) => (k.keepRoof === "pyramid" ? 1 : 0))),
      keepRoof_cone: this.make("keepRoof_cone", count((_, k) => (k.keepRoof === "cone" ? 1 : 0))),
      keepRoof_onion: this.make("keepRoof_onion", count((_, k) => (k.keepRoof === "onion" ? 1 : 0))),
      turrets: this.make("turrets", count((s) => (s.level >= 20 ? 1 : 0))),
      tower: this.make("tower", towers),
      towerRoof_cone: this.make("towerRoof_cone", count((s, k) => (k.towerRoof === "cone" ? towerAngles(s.level).length : 0))),
      towerRoof_pyramid: this.make("towerRoof_pyramid", count((s, k) => (k.towerRoof === "pyramid" ? towerAngles(s.level).length : 0))),
      gate: this.make("gate", castles.length),
      gateDoor: this.make("gateDoor", castles.length),
      gateRoof: this.make("gateRoof", castles.length),
      torch: this.make("torch", count((_, k) => (k.torches ? 1 : 0))),
      torchGlow: this.make("torchGlow", count((_, k) => (k.torches ? 1 : 0))),
      wallBanner: this.make("wallBanner", count((s) => (s.level >= 10 ? 1 : 0))),
      pole: this.make("pole", castles.length),
      flag: this.make("flag", castles.length),
      flagBorder: this.make("flagBorder", crested.filter((s) => s.owner_house_crest!.border !== "none").length),
      tent: this.make("tent", slots.length),
    };
    for (const k of CREST_SYMBOLS) {
      const n = crested.filter((s) => s.owner_house_crest!.primary_symbol === k).length;
      if (n) mesh[`sym_${k}`] = this.make(`sym_${k}`, n);
    }
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
    for (const s of castles) {
      const skin = skins.get(s)!;
      const h = heightAt(s.x, s.y);
      const cx = s.x + 0.5;
      const cz = s.y + 0.5;
      const sc = settlementScale(s.level);
      const fac = this.factionColor(s.faction);
      const stone = this.hex(skin.stone);
      const stoneDark = this.hex(skin.stoneDark);
      const roof = this.hex(skin.roof);
      const trim = this.hex(skin.trim);
      const wood = this.hex(skin.wood);
      put(mesh.shadow, cx, h, cz, sc, this.pal.snow);
      put(mesh.factionRing, cx, h, cz, sc, fac);
      put(mesh.plinth, cx, h, cz, sc, stoneDark);
      put(mesh.wall, cx, h, cz, sc, stone);
      put(mesh.keep, cx, h, cz, sc, stone);
      put(mesh.windows, cx, h, cz, sc, this.pal.snow);
      put(mesh[`keepRoof_${skin.keepRoof}`], cx, h, cz, sc, roof);
      if (s.level >= 20) put(mesh.turrets, cx, h, cz, sc, stone);
      for (const a of towerAngles(s.level)) {
        const tx = cx + Math.sin(a) * TOWER_RADIUS * sc;
        const tz = cz + Math.cos(a) * TOWER_RADIUS * sc;
        put(mesh.tower, tx, h, tz, sc, stone);
        put(mesh[`towerRoof_${skin.towerRoof}`], tx, h, tz, sc, roof);
      }
      put(mesh.gate, cx, h, cz, sc, stoneDark);
      put(mesh.gateDoor, cx, h, cz, sc, wood);
      put(mesh.gateRoof, cx, h, cz, sc, roof);
      if (skin.torches) {
        put(mesh.torch, cx, h, cz, sc, this.pal.snow);
        put(mesh.torchGlow, cx, h, cz, sc, this.pal.snow);
        for (const tp of TORCHES) emitters.push({ x: cx + tp.x * sc, y: h + (tp.y + 0.06) * sc, z: cz + tp.z * sc, size: 0.05 * sc, rise: 0.45 * sc, period: 2.6, puffs: 3, color: TORCH_SMOKE_COLOR });
      }
      emitters.push({ x: cx + CHIMNEY.x * sc, y: h + CHIMNEY.y * sc, z: cz + CHIMNEY.z * sc, size: 0.15 * sc, rise: 1.7 * sc, period: 5, puffs: 5, color: SMOKE_COLOR });
      const crest = s.owner_house_crest;
      if (s.level >= 10) put(mesh.wallBanner, cx, h, cz, sc, crest ? this.hex(crest.colors.base) : fac);
      put(mesh.pole, cx, h, cz, sc, trim);
      if (crest) {
        // Casata crest on the keep's banner (Bible §38.4 / §40.4): base → border → symbol
        put(mesh.flag, cx, h, cz, sc, this.hex(crest.colors.base));
        if (crest.border !== "none") put(mesh.flagBorder, cx, h, cz, sc, this.hex(crest.colors.border));
        put(mesh[`sym_${crest.primary_symbol}`], cx + (FLAG_W / 2) * sc, h + BANNER_Y * sc, cz + 0.006 * sc, sc, this.hex(crest.colors.primary));
      } else put(mesh.flag, cx, h, cz, sc, fac);
    }
    for (const s of slots) put(mesh.tent, s.x + 0.5, heightAt(s.x, s.y), s.y + 0.5, 1, this.pal.neutral);
    for (const im of Object.values(mesh)) {
      if (!im.count) continue;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      g.add(im);
    }
    return { group: g, emitters };
  }

  buildSentinels(list: SentinelDto[], heightAt: (x: number, y: number) => number): { group: THREE.Group; emitters: SmokeEmitter[] } | null {
    if (!list.length) return null;
    const g = new THREE.Group();
    const emitters: SmokeEmitter[] = [];
    const tower = this.make("senTower", list.length);
    const fire = this.make("senFire", list.length);
    const glow = this.make("senGlow", list.length);
    const shadow = this.make("shadow", list.length);
    const M = new THREE.Matrix4();
    const stone = new THREE.Color("#8B8378");
    for (const s of list) {
      const h = heightAt(s.x, s.y);
      M.makeTranslation(s.x + 0.5, h, s.y + 0.5);
      tower.setMatrixAt(tower.count, M);
      tower.setColorAt(tower.count, stone);
      tower.count++;
      const fireColor = s.state === "GUARDED" ? this.factionColor(s.faction) : this.pal.neutral;
      fire.setMatrixAt(fire.count, M);
      fire.setColorAt(fire.count, fireColor);
      fire.count++;
      if (s.state === "GUARDED") {
        glow.setMatrixAt(glow.count, M);
        glow.setColorAt(glow.count, fireColor);
        glow.count++;
        emitters.push({ x: s.x + 0.5 + BRAZIER.x, y: h + BRAZIER.y, z: s.y + 0.5 + BRAZIER.z, size: 0.07, rise: 0.7, period: 3.2, puffs: 4, color: TORCH_SMOKE_COLOR });
      }
      M.makeScale(0.35, 1, 0.35).setPosition(s.x + 0.5, h, s.y + 0.5);
      shadow.setMatrixAt(shadow.count, M);
      shadow.setColorAt(shadow.count, this.pal.snow);
      shadow.count++;
    }
    for (const im of [shadow, tower, fire, glow]) {
      if (!im.count) continue;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      g.add(im);
    }
    return { group: g, emitters };
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

/** Dispose everything a group owns, skipping factory-shared geometries/materials. */
export function disposeGroup(root: THREE.Object3D) {
  root.traverse((o: any) => {
    if (o.isInstancedMesh) o.dispose?.();
    if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) if (!m.userData?.shared) m.dispose?.();
  });
}
