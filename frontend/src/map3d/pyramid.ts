/**
 * Pyramid endgame monument (Bible §21): a fixed 15×15-tile stepped pyramid on the reserved central plateau.
 * One instance per map; its look follows the cycle state:
 *   DORMANT / DORMANT_INITIAL → dark, sleeping stone, no fire
 *   OPEN (neutral Guardian)   → sandstone courses, gold trim, lit braziers, pulsing apex + light pillar
 *   OPEN (held) / REWARD_LOCK → as OPEN plus faction ring + banners in the holder's colour (own / enemy)
 * Seven textured tiers, a grand stair with balustrades and braziers, four obelisks, a summit shrine with columns
 * and a golden pyramidion. Local frame: origin at the anchor tile centre on the ground; the grand stair faces +z.
 */
import * as THREE from "three";

import { mergeGeos, place } from "./geo";

export type PyramidCycleState = "DORMANT_INITIAL" | "OPEN" | "REWARD_LOCK" | "DORMANT";
export type PyramidLook = { state: PyramidCycleState; faction: "OWN" | "ENEMY" | "NEUTRAL" };

export const PYRAMID_HALF = 7.5; // 15 tiles
export const PYRAMID_TOP = 10.6; // label anchor (local units)

// Asset colours (physical materials of the 3D model, not UI tokens) — identical in every scheme by design.
// Stone colours multiply the masonry texture (average brightness ≈ 0.6), hence the bright base tones.
const STONE = "#EDDAB0";
const STONE_DARK = "#B29C78";
const STONE_SLEEP = "#948B7C";
const STONE_SLEEP_DARK = "#625A50";
const TRIM = "#E8C56E";
const TRIM_SLEEP = "#857A66";
const FIRE = "#FFB347";
const SHADOW = "#000000";

const TIERS: { w: number; h: number }[] = [
  { w: 13.6, h: 1.0 },
  { w: 11.7, h: 0.95 },
  { w: 9.9, h: 0.92 },
  { w: 8.2, h: 0.9 },
  { w: 6.6, h: 0.88 },
  { w: 5.1, h: 0.85 },
  { w: 3.7, h: 0.82 },
];
const BASE_H = 0.8;
const STAIR_W = 2.6;

function box(w: number, h: number, d: number): THREE.BoxGeometry {
  return new THREE.BoxGeometry(w, h, d);
}

/** Box whose UVs keep a constant masonry course size on every face (BoxGeometry face order: ±x, ±y, ±z). */
function masonryBox(w: number, h: number, d: number, density = 0.8): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const faceScale: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let i = 0; i < uv.count; i++) {
    const [sx, sy] = faceScale[Math.floor(i / 4)];
    uv.setXY(i, uv.getX(i) * sx * density, uv.getY(i) * sy * density);
  }
  return geo;
}

export class PyramidMonument {
  readonly group = new THREE.Group();
  private stone: THREE.MeshLambertMaterial;
  private stoneDark: THREE.MeshLambertMaterial;
  private trim: THREE.MeshLambertMaterial;
  private cap: THREE.MeshLambertMaterial;
  private fire: THREE.MeshBasicMaterial;
  private glow: THREE.MeshBasicMaterial;
  private pillar: THREE.MeshBasicMaterial;
  private ring: THREE.MeshBasicMaterial;
  private banner: THREE.MeshBasicMaterial;
  private fireGroup = new THREE.Group();
  private pillarMesh: THREE.Mesh;
  private pillarHalo: THREE.Mesh;
  private apexGlow: THREE.Mesh;
  private ringMesh: THREE.Mesh;
  private bannerGroup = new THREE.Group();
  private look: PyramidLook = { state: "DORMANT_INITIAL", faction: "NEUTRAL" };
  private factionColors: { own: THREE.Color; enemy: THREE.Color; neutral: THREE.Color };

  constructor(factionColors: { own: THREE.Color; enemy: THREE.Color; neutral: THREE.Color }, stoneTex: THREE.Texture | null = null) {
    this.factionColors = factionColors;
    const lit = (color: string, map: THREE.Texture | null = null) => new THREE.MeshLambertMaterial({ color, flatShading: true, map });
    this.stone = lit(STONE, stoneTex);
    this.stoneDark = lit(STONE_DARK, stoneTex);
    this.trim = lit(TRIM);
    this.cap = lit(TRIM);
    this.fire = new THREE.MeshBasicMaterial({ color: FIRE });
    this.glow = new THREE.MeshBasicMaterial({ color: FIRE, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
    this.pillar = new THREE.MeshBasicMaterial({ color: TRIM, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.ring = new THREE.MeshBasicMaterial({ color: factionColors.neutral, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
    this.banner = new THREE.MeshBasicMaterial({ color: factionColors.neutral, side: THREE.DoubleSide });
    const solid = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
      return m;
    };

    // ---- ground shadow + plinth (sinks into the plateau relief) ----
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(PYRAMID_HALF * 1.3, 40), new THREE.MeshBasicMaterial({ color: SHADOW, transparent: true, opacity: 0.2, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    this.group.add(shadow);
    solid(place(masonryBox(PYRAMID_HALF * 2, BASE_H + 0.6, PYRAMID_HALF * 2), 0, BASE_H / 2 - 0.3, 0), this.stoneDark);

    // ---- seven textured tiers with a gold edge band around every tread ----
    const risers: THREE.BufferGeometry[] = [];
    const treads: THREE.BufferGeometry[] = [];
    let y = BASE_H;
    for (const t of TIERS) {
      risers.push(place(masonryBox(t.w, t.h, t.w), 0, y + t.h / 2, 0));
      const band = 0.16;
      const ty = y + t.h - 0.03;
      treads.push(place(box(t.w + 0.1, 0.06, band), 0, ty, t.w / 2 + 0.05 - band / 2), place(box(t.w + 0.1, 0.06, band), 0, ty, -(t.w / 2 + 0.05 - band / 2)), place(box(band, 0.06, t.w + 0.1), t.w / 2 + 0.05 - band / 2, ty, 0), place(box(band, 0.06, t.w + 0.1), -(t.w / 2 + 0.05 - band / 2), ty, 0));
      y += t.h;
    }
    solid(mergeGeos(risers), this.stone);
    solid(mergeGeos(treads), this.trim);
    const topY = y;

    // ---- grand stair (+z): steps from the plinth to the summit, balustrades, braziers along the way ----
    const steps: THREE.BufferGeometry[] = [];
    const rails: THREE.BufferGeometry[] = [];
    const stairBottomZ = PYRAMID_HALF - 0.2;
    const stairTopZ = TIERS[TIERS.length - 1].w / 2;
    const rise = topY - BASE_H;
    const run = stairBottomZ - stairTopZ;
    const nSteps = 26;
    for (let i = 0; i < nSteps; i++) {
      const u = i / nSteps;
      const sy = BASE_H + rise * u;
      const sz = stairBottomZ - run * u;
      steps.push(place(masonryBox(STAIR_W, rise / nSteps + 0.04, run / nSteps + 0.12, 1.2), 0, sy + rise / nSteps / 2, sz - run / nSteps / 2));
    }
    const railLen = Math.hypot(rise, run);
    const railAngle = Math.atan2(rise, run);
    for (const sx of [-1, 1]) {
      const rail = box(0.22, 0.34, railLen);
      rail.rotateX(railAngle);
      rail.translate(sx * (STAIR_W / 2 + 0.11), BASE_H + rise / 2 + 0.28, stairTopZ + run / 2);
      rails.push(rail);
    }
    solid(mergeGeos(steps), this.stoneDark);
    solid(mergeGeos(rails), this.trim);

    // ---- four obelisks on the plinth corners, gold pyramidions ----
    const obelisks: THREE.BufferGeometry[] = [];
    const pyramidions: THREE.BufferGeometry[] = [];
    const or = PYRAMID_HALF - 0.85;
    for (const [sx, sz] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      const shaft = new THREE.CylinderGeometry(0.22, 0.34, 3.6, 4);
      shaft.rotateY(Math.PI / 4);
      obelisks.push(place(shaft, sx * or, BASE_H + 1.8, sz * or), place(masonryBox(0.9, 0.35, 0.9), sx * or, BASE_H + 0.17, sz * or));
      const tip = new THREE.ConeGeometry(0.24, 0.5, 4);
      tip.rotateY(Math.PI / 4);
      pyramidions.push(place(tip, sx * or, BASE_H + 3.85, sz * or));
    }
    solid(mergeGeos(obelisks), this.stone);
    solid(mergeGeos(pyramidions), this.trim);

    // ---- summit shrine: columns, roof slab, golden pyramidion; apex glow + light pillar ----
    const tw = TIERS[TIERS.length - 1].w;
    const cols: THREE.BufferGeometry[] = [];
    const cr = tw / 2 - 0.45;
    for (const [sx, sz] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ])
      cols.push(place(new THREE.CylinderGeometry(0.16, 0.19, 1.5, 8), sx * cr, topY + 0.75, sz * cr));
    solid(mergeGeos(cols), this.stone);
    solid(place(masonryBox(tw - 0.3, 0.3, tw - 0.3), 0, topY + 1.65, 0), this.stoneDark);
    const capGeo = new THREE.ConeGeometry((tw - 0.3) * 0.72, 1.5, 4);
    capGeo.rotateY(Math.PI / 4);
    capGeo.translate(0, topY + 1.8 + 0.75, 0);
    solid(capGeo, this.cap);
    const altar = solid(place(box(0.9, 0.5, 0.9), 0, topY + 0.25, 0), this.trim);
    altar.castShadow = false;
    this.apexGlow = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 10), this.glow);
    this.apexGlow.position.y = topY + 2.75;
    this.group.add(this.apexGlow);
    this.pillarMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.5, 16, 12, 1, true), this.pillar);
    this.pillarMesh.position.y = topY + 10;
    this.group.add(this.pillarMesh);
    this.pillarHalo = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.4, 16, 12, 1, true), this.pillar);
    this.pillarHalo.position.y = topY + 10;
    this.pillarHalo.scale.set(1, 1, 1);
    this.group.add(this.pillarHalo);

    // ---- braziers: plinth corners beside the obelisks + three pairs along the stair ----
    const bowls: THREE.BufferGeometry[] = [];
    const flames: THREE.BufferGeometry[] = [];
    const glows: THREE.BufferGeometry[] = [];
    const brazier = (x: number, yb: number, z: number, s = 1) => {
      bowls.push(place(new THREE.CylinderGeometry(0.4 * s, 0.26 * s, 0.45 * s, 8), x, yb + 0.5 * s, z), place(new THREE.CylinderGeometry(0.14 * s, 0.2 * s, 0.55 * s, 6), x, yb + 0.27 * s, z));
      flames.push(place(new THREE.ConeGeometry(0.28 * s, 0.7 * s, 6), x, yb + 1.0 * s, z));
      glows.push(place(new THREE.SphereGeometry(0.42 * s, 8, 6), x, yb + 0.95 * s, z));
    };
    for (const sx of [-1, 1]) {
      brazier(sx * (or - 1.3), BASE_H, or, 1.1);
      brazier(sx * (or - 1.3), BASE_H, -or, 1.1);
      for (const u of [0.25, 0.55, 0.85]) brazier(sx * (STAIR_W / 2 + 0.11), BASE_H + rise * u + 0.3, stairBottomZ - run * u, 0.7);
    }
    this.fireGroup.add(new THREE.Mesh(mergeGeos(bowls), this.stoneDark));
    this.fireGroup.add(new THREE.Mesh(mergeGeos(flames), this.fire));
    this.fireGroup.add(new THREE.Mesh(mergeGeos(glows), this.glow));
    this.group.add(this.fireGroup);

    // ---- holder insignia: ground ring + four tall banners on the third tier ----
    this.ringMesh = new THREE.Mesh(new THREE.RingGeometry(PYRAMID_HALF + 0.9, PYRAMID_HALF + 1.5, 48), this.ring);
    this.ringMesh.rotation.x = -Math.PI / 2;
    this.ringMesh.position.y = 0.05;
    this.group.add(this.ringMesh);
    const poles: THREE.BufferGeometry[] = [];
    const flags: THREE.BufferGeometry[] = [];
    const backs: THREE.BufferGeometry[] = [];
    const by = BASE_H + TIERS[0].h + TIERS[1].h + TIERS[2].h;
    const br = TIERS[2].w / 2 - 0.5;
    for (const [sx, sz] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      poles.push(place(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 5), sx * br, by + 1.6, sz * br));
      flags.push(place(box(1.2, 0.8, 0.04), sx * br + sx * 0.6, by + 2.7, sz * br));
      backs.push(place(box(1.32, 0.92, 0.02), sx * br + sx * 0.6, by + 2.7, sz * br)); // dark plate: the faction colour reads against the gold trim
    }
    this.bannerGroup.add(new THREE.Mesh(mergeGeos(poles), new THREE.MeshBasicMaterial({ color: "#3A2F1B" })));
    this.bannerGroup.add(new THREE.Mesh(mergeGeos(backs), new THREE.MeshBasicMaterial({ color: "#1A1512", side: THREE.DoubleSide })));
    this.bannerGroup.add(new THREE.Mesh(mergeGeos(flags), this.banner));
    this.group.add(this.bannerGroup);

    this.setLook(this.look);
  }

  setLook(look: PyramidLook) {
    this.look = look;
    const awake = look.state === "OPEN" || look.state === "REWARD_LOCK";
    this.stone.color.set(awake ? STONE : STONE_SLEEP);
    this.stoneDark.color.set(awake ? STONE_DARK : STONE_SLEEP_DARK);
    this.trim.color.set(awake ? TRIM : TRIM_SLEEP);
    this.cap.color.set(awake ? TRIM : STONE_SLEEP);
    this.fireGroup.visible = awake;
    this.apexGlow.visible = awake;
    this.pillarMesh.visible = look.state === "OPEN";
    this.pillarHalo.visible = look.state === "OPEN";
    const held = look.faction !== "NEUTRAL";
    const fc = look.faction === "OWN" ? this.factionColors.own : look.faction === "ENEMY" ? this.factionColors.enemy : this.factionColors.neutral;
    this.ring.color.copy(fc);
    this.ring.opacity = held ? 0.85 : awake ? 0.35 : 0.15;
    this.banner.color.copy(fc);
    this.bannerGroup.visible = held && awake;
  }

  /** Per-frame pulse of fire / apex / pillar (cheap: material writes only). */
  tick(t: number) {
    if (!this.apexGlow.visible) return;
    const p = 0.5 + 0.5 * Math.sin(t * 2.4);
    this.glow.opacity = 0.28 + 0.18 * p + 0.06 * Math.sin(t * 17.3);
    this.apexGlow.scale.setScalar(1 + 0.18 * p);
    if (this.pillarMesh.visible) {
      this.pillar.opacity = 0.11 + 0.09 * p;
      this.pillarHalo.rotation.y = t * 0.3;
    }
  }

  dispose() {
    this.group.traverse((o: any) => {
      if (o.geometry) o.geometry.dispose();
    });
    for (const m of [this.stone, this.stoneDark, this.trim, this.cap, this.fire, this.glow, this.pillar, this.ring, this.banner]) m.dispose();
  }
}
