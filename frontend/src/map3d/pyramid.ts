/**
 * Pyramid endgame monument (Bible §21): a fixed 15×15-tile stepped pyramid on the reserved central plateau.
 * One instance per map; its look follows the cycle state:
 *   DORMANT / DORMANT_INITIAL → dark, sleeping stone, no fire
 *   OPEN (neutral Guardian)   → sandstone, gold trim, lit braziers, pulsing apex + light pillar
 *   OPEN (held) / REWARD_LOCK → as OPEN plus faction ring + banners in the holder's colour (own / enemy)
 * Local frame: origin at the anchor tile centre on the ground; the grand stair faces +z.
 */
import * as THREE from "three";

import { mergeGeos, place } from "./geo";

export type PyramidCycleState = "DORMANT_INITIAL" | "OPEN" | "REWARD_LOCK" | "DORMANT";
export type PyramidLook = { state: PyramidCycleState; faction: "OWN" | "ENEMY" | "NEUTRAL" };

export const PYRAMID_HALF = 7.5; // 15 tiles
export const PYRAMID_TOP = 7.3; // label anchor (local units)

// Asset colours (physical materials of the 3D model, not UI tokens) — identical in every scheme by design.
const STONE = "#C9A46A";
const STONE_DARK = "#8F7248";
const STONE_SLEEP = "#6E655A";
const STONE_SLEEP_DARK = "#4C453D";
const TRIM = "#E8C56E";
const TRIM_SLEEP = "#857A66";
const FIRE = "#FFB347";
const SHADOW = "#000000";

const TIERS: { w: number; h: number }[] = [
  { w: 13.2, h: 1.25 },
  { w: 10.6, h: 1.15 },
  { w: 8.1, h: 1.05 },
  { w: 5.7, h: 0.95 },
  { w: 3.4, h: 0.85 },
];

function box(w: number, h: number, d: number): THREE.BoxGeometry {
  return new THREE.BoxGeometry(w, h, d);
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
  private apexGlow: THREE.Mesh;
  private ringMesh: THREE.Mesh;
  private bannerGroup = new THREE.Group();
  private look: PyramidLook = { state: "DORMANT_INITIAL", faction: "NEUTRAL" };
  private factionColors: { own: THREE.Color; enemy: THREE.Color; neutral: THREE.Color };

  constructor(factionColors: { own: THREE.Color; enemy: THREE.Color; neutral: THREE.Color }) {
    this.factionColors = factionColors;
    const lit = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });
    this.stone = lit(STONE);
    this.stoneDark = lit(STONE_DARK);
    this.trim = lit(TRIM);
    this.cap = lit(TRIM);
    this.fire = new THREE.MeshBasicMaterial({ color: FIRE });
    this.glow = new THREE.MeshBasicMaterial({ color: FIRE, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
    this.pillar = new THREE.MeshBasicMaterial({ color: TRIM, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.ring = new THREE.MeshBasicMaterial({ color: factionColors.neutral, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
    this.banner = new THREE.MeshBasicMaterial({ color: factionColors.neutral, side: THREE.DoubleSide });

    // ---- platform + shadow ----
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(PYRAMID_HALF * 1.25, 40), new THREE.MeshBasicMaterial({ color: SHADOW, transparent: true, opacity: 0.22, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    this.group.add(shadow);
    const platform = new THREE.Mesh(place(box(PYRAMID_HALF * 2, 1.0, PYRAMID_HALF * 2), 0, -0.2, 0), this.stoneDark); // sinks into the plateau relief
    this.group.add(platform);

    // ---- stepped tiers (dark riser + light tread band) ----
    const risers: THREE.BufferGeometry[] = [];
    const treads: THREE.BufferGeometry[] = [];
    let y = 0.3;
    for (const t of TIERS) {
      risers.push(place(box(t.w, t.h, t.w), 0, y + t.h / 2, 0));
      treads.push(place(box(t.w + 0.12, 0.1, t.w + 0.12), 0, y + t.h - 0.05, 0));
      y += t.h;
    }
    this.group.add(new THREE.Mesh(mergeGeos(risers), this.stone));
    this.group.add(new THREE.Mesh(mergeGeos(treads), this.trim));
    const topY = y;

    // ---- grand stair (+z face) ----
    const stairs: THREE.BufferGeometry[] = [];
    let sy = 0.3;
    for (let i = 0; i < TIERS.length - 1; i++) {
      const t = TIERS[i];
      const depth = (t.w - TIERS[i + 1].w) / 2 + 0.3;
      stairs.push(place(box(2.2, t.h + 0.02, depth), 0, sy + t.h / 2, t.w / 2 - depth / 2 + 0.3));
      sy += t.h;
    }
    this.group.add(new THREE.Mesh(mergeGeos(stairs), this.stoneDark));

    // ---- capstone + apex glow + light pillar ----
    const capGeo = new THREE.ConeGeometry(2.3, 1.5, 4);
    capGeo.rotateY(Math.PI / 4);
    capGeo.translate(0, topY + 0.75, 0);
    this.group.add(new THREE.Mesh(capGeo, this.cap));
    this.apexGlow = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 10), this.glow);
    this.apexGlow.position.y = topY + 1.55;
    this.group.add(this.apexGlow);
    this.pillarMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.55, 14, 10, 1, true), this.pillar);
    this.pillarMesh.position.y = topY + 8;
    this.group.add(this.pillarMesh);

    // ---- corner braziers (bowl + flame + glow) ----
    const bowls: THREE.BufferGeometry[] = [];
    const flames: THREE.BufferGeometry[] = [];
    const glows: THREE.BufferGeometry[] = [];
    const r = PYRAMID_HALF - 0.9;
    for (const [sx, sz] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      bowls.push(place(new THREE.CylinderGeometry(0.42, 0.28, 0.5, 8), sx * r, 0.55, sz * r));
      bowls.push(place(new THREE.CylinderGeometry(0.16, 0.22, 0.6, 6), sx * r, 0.3, sz * r));
      flames.push(place(new THREE.ConeGeometry(0.3, 0.7, 6), sx * r, 1.1, sz * r));
      glows.push(place(new THREE.SphereGeometry(0.75, 8, 6), sx * r, 1.05, sz * r));
    }
    this.fireGroup.add(new THREE.Mesh(mergeGeos(bowls), this.stoneDark));
    this.fireGroup.add(new THREE.Mesh(mergeGeos(flames), this.fire));
    this.fireGroup.add(new THREE.Mesh(mergeGeos(glows), this.glow));
    this.group.add(this.fireGroup);

    // ---- holder insignia: ground ring + four banners on the third tier ----
    this.ringMesh = new THREE.Mesh(new THREE.RingGeometry(PYRAMID_HALF + 0.9, PYRAMID_HALF + 1.5, 48), this.ring);
    this.ringMesh.rotation.x = -Math.PI / 2;
    this.ringMesh.position.y = 0.05;
    this.group.add(this.ringMesh);
    const poles: THREE.BufferGeometry[] = [];
    const flags: THREE.BufferGeometry[] = [];
    const backs: THREE.BufferGeometry[] = [];
    const by = 0.3 + TIERS[0].h + TIERS[1].h + TIERS[2].h;
    const br = TIERS[2].w / 2 - 0.5;
    for (const [sx, sz] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      poles.push(place(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5), sx * br, by + 1.3, sz * br));
      flags.push(place(box(1.1, 0.7, 0.04), sx * br + sx * 0.55, by + 2.2, sz * br));
      backs.push(place(box(1.22, 0.82, 0.02), sx * br + sx * 0.55, by + 2.2, sz * br)); // dark plate: the faction colour reads against the gold trim
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
    if (this.pillarMesh.visible) this.pillar.opacity = 0.12 + 0.1 * p;
  }

  dispose() {
    this.group.traverse((o: any) => {
      if (o.geometry) o.geometry.dispose();
    });
    for (const m of [this.stone, this.stoneDark, this.trim, this.cap, this.fire, this.glow, this.pillar, this.ring, this.banner]) m.dispose();
  }
}
