/**
 * Cinematic scenes on top of CinematicWorld.
 *  DepartureScene — the real formation marches along the road; camera keyframes (front 3/4 → side → high rear);
 *                   a legendary flyer descends and advances with the army, breathing fire; a Falcon scouts ahead.
 *  ConquestScene  — the taken monument (castle or Pyramid) at dawn: enemy banner falls in smoke, the house banner
 *                   rises, golden bursts, survivors cheer at the gate, slow orbit + pull-back.
 * All motion is a function of the elapsed seconds → deterministic and skip-safe.
 */
import * as THREE from "three";

import type { CrestDto, SettlementPublic } from "@/src/api/hooks";
import { disposeGroup } from "@/src/map3d/entities";
import { PyramidMonument } from "@/src/map3d/pyramid";

import { Army } from "./army";
import { Burst, Dragon, Falcon, type Legendary } from "./creatures";
import { CinematicWorld, ease } from "./world";

export type SceneSpec = { units: Record<string, number>; legendary: Legendary | null; falcon: boolean; durationMs: number; crest?: CrestDto | null; pyramid?: boolean; newLevel?: number | null; skin?: string | null };

export interface CinematicSceneRig {
  update(t: number): void;
  dispose(): void;
}

const MARCH_SPEED = 2.1; // m/s

function lerpV(out: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, u: number) {
  return out.copy(a).lerp(b, u);
}

// ------------------------------------------------------------------------------------------------ departure
export class DepartureScene implements CinematicSceneRig {
  private army: Army;
  private banner: THREE.Group;
  private dragon: Dragon | null = null;
  private falcon: Falcon | null = null;
  private torch: THREE.PointLight;
  private D: number;
  private keys: { at: number; pos: THREE.Vector3; look: THREE.Vector3 }[];
  private _a = new THREE.Vector3();
  private _b = new THREE.Vector3();
  private _pos = new THREE.Vector3();
  private _look = new THREE.Vector3();

  constructor(private world: CinematicWorld, spec: SceneSpec) {
    this.D = spec.durationMs / 1000;
    this.army = new Army(spec.units, world.own, "march");
    world.scene.add(this.army.group);
    world.smoke.setEmitters(this.army.dust);
    // standard bearer: house banner carried at the front centre of the column
    this.banner = world.factory.buildBanner(spec.crest ?? null, world.own, false);
    this.banner.scale.setScalar(1.35);
    world.scene.add(this.banner);
    this.torch = new THREE.PointLight(0xffb347, 2.2, 12, 2);
    world.scene.add(this.torch);
    if (spec.legendary) {
      this.dragon = new Dragon(spec.legendary);
      this.dragon.group.scale.setScalar(0.9);
      world.scene.add(this.dragon.group);
    }
    if (spec.falcon) {
      this.falcon = new Falcon();
      world.scene.add(this.falcon.group);
    }
    const dragonLift = spec.legendary ? 2.0 : 0;
    // camera keyframes relative to the formation centre (x)
    this.keys = [
      { at: 0.0, pos: new THREE.Vector3(9.5, 1.7, 6.8), look: new THREE.Vector3(-1.5, 0.9, 0) },
      { at: 0.36, pos: new THREE.Vector3(2.5, 2.4, 7.4), look: new THREE.Vector3(-1, 1.0 + dragonLift * 0.6, -0.5) },
      { at: 0.7, pos: new THREE.Vector3(-4.5, 4.2 + dragonLift, 8.8), look: new THREE.Vector3(1.5, 1.4 + dragonLift, -1.2) },
      { at: 1.0, pos: new THREE.Vector3(-15, 6.5 + dragonLift * 0.5, 6.5), look: new THREE.Vector3(6, 1.2 + dragonLift * 0.8, -2.5) },
    ];
  }

  update(t: number) {
    const u = Math.min(1, t / this.D);
    const headX = 6 + t * MARCH_SPEED;
    this.army.update(t, headX);
    const cx = this.army.centerX;
    this.banner.position.set(headX + 0.45, 0, 0);
    this.banner.position.y = Math.abs(Math.sin(t * Math.PI * 2 * 1.6)) * 0.05;
    this.torch.position.set(headX - 1, 1.7, 0.4);
    this.torch.intensity = 2.0 + Math.sin(t * 17) * 0.4 + Math.sin(t * 5.3) * 0.3;
    this.world.smoke.update(t, cx, 0);
    this.world.factory.tick(t);

    // camera: piecewise smoothstep between keyframes, anchored to the formation centre, gentle handheld sway
    let i = 0;
    while (i < this.keys.length - 2 && u > this.keys[i + 1].at) i++;
    const k0 = this.keys[i];
    const k1 = this.keys[i + 1];
    const s = ease(u, k0.at, k1.at);
    lerpV(this._pos, k0.pos, k1.pos, s);
    lerpV(this._look, k0.look, k1.look, s);
    const cam = this.world.camera;
    cam.position.set(cx + this._pos.x + Math.sin(t * 0.7) * 0.15, this._pos.y + Math.sin(t * 0.9) * 0.08, this._pos.z);
    cam.lookAt(cx + this._look.x, this._look.y, this._look.z);

    if (this.dragon) {
      // descent from the far sky to a hover above and beside the column (never between camera and army), then advance
      const d = ease(u, 0.02, 0.55);
      const swoop = Math.sin(ease(u, 0.5, 0.75) * Math.PI) * 0.8;
      this._a.set(cx - 20, 17, -12);
      this._b.set(cx + 3.5, 6.4, -4.8);
      lerpV(this._pos, this._a, this._b, d);
      this._pos.y -= swoop;
      this._pos.y += Math.sin(t * 1.3) * 0.25 * d;
      const heading = -0.12 + (1 - d) * 0.35;
      const pitch = (1 - d) * -0.28 + Math.sin(t * 1.3) * 0.03;
      const breathing = (u > 0.56 && u < 0.8) || u > 0.88;
      this.dragon.update(t, this._pos, heading, 0.35 + (1 - d) * 0.65, breathing, pitch);
    }
    if (this.falcon) {
      // sweeping ellipse ahead of the column, banking into the turns
      const a = t * 1.5;
      const rx = 5.5;
      const rz = 3.2;
      const fx = cx + 6 + Math.cos(a) * rx;
      const fz = Math.sin(a) * rz;
      const fy = 3.1 + Math.sin(t * 1.9) * 0.6;
      const heading = Math.atan2(Math.cos(a) * rz, -Math.sin(a) * rx);
      this._a.set(fx, fy, fz);
      this.falcon.update(t, this._a, heading, -0.5 * Math.cos(a));
    }
  }

  dispose() {
    this.army.dispose();
    disposeGroup(this.banner);
    this.dragon?.dispose();
    this.falcon?.dispose();
  }
}

// ------------------------------------------------------------------------------------------------ conquest
export class ConquestScene implements CinematicSceneRig {
  private enemyMonument: THREE.Group;
  private ownMonument: THREE.Group;
  private pyramid: PyramidMonument | null = null;
  private enemyBanner: THREE.Group;
  private ownBanner: THREE.Group;
  private survivors: Army;
  private sparks: Burst;
  private dragon: Dragon | null = null;
  private D: number;
  private topY: number;
  private smokeOn = false;
  private _v = new THREE.Vector3();

  constructor(private world: CinematicWorld, spec: SceneSpec) {
    this.D = spec.durationMs / 1000;
    const S = spec.pyramid ? 0.55 : 2.1;
    if (spec.pyramid) {
      this.pyramid = new PyramidMonument({ own: world.own, enemy: world.enemy, neutral: new THREE.Color(0x8a8a8a) });
      this.pyramid.setLook({ state: "OPEN", faction: "ENEMY" });
      this.pyramid.group.scale.setScalar(S);
      world.scene.add(this.pyramid.group);
      this.enemyMonument = this.ownMonument = this.pyramid.group;
      this.topY = 7.3 * S;
    } else {
      const fake = (faction: "OWN" | "ENEMY"): SettlementPublic => ({ settlement_id: `cin_${faction}`, kind: "PLAYER", name: "", x: -1, y: -1, terrain: "plain", terrain_defender_bonus_pct: 0, region: "", port_eligible: false, level: Math.max(1, spec.newLevel ?? 5), owner_player_id: faction, owner_house_crest: faction === "OWN" ? (spec.crest ?? null) : null, skin: spec.skin ?? null, faction, wall_level: 0 });
      const mk = (faction: "OWN" | "ENEMY") => {
        const built = world.factory.buildSettlements([fake(faction)], () => 0);
        built.group.position.set(0.5, 0, 0.5);
        const g = new THREE.Group();
        g.add(built.group);
        g.scale.setScalar(S);
        world.scene.add(g);
        return g;
      };
      this.enemyMonument = mk("ENEMY");
      this.ownMonument = mk("OWN");
      this.ownMonument.visible = false;
      this.topY = 2.95 * S;
    }
    // banners: the enemy's falls, the house banner rises from inside the keep
    this.enemyBanner = world.factory.buildBanner(null, world.enemy, false);
    this.enemyBanner.scale.setScalar(1.6);
    this.enemyBanner.position.set(0, this.topY - 0.6, 0);
    world.scene.add(this.enemyBanner);
    this.ownBanner = world.factory.buildBanner(spec.crest ?? null, world.own, false);
    this.ownBanner.scale.setScalar(2.0);
    this.ownBanner.visible = false;
    world.scene.add(this.ownBanner);
    // survivors cheering in front of the gate (+z side)
    this.survivors = new Army(spec.units, world.own, "cheer", Math.PI);
    this.survivors.group.position.set(0, 0, spec.pyramid ? 6.5 : 4.2);
    world.scene.add(this.survivors.group);
    this.sparks = new Burst(96, 0xff8a2a, 0xffe08a);
    world.scene.add(this.sparks.mesh);
    if (spec.legendary) {
      this.dragon = new Dragon(spec.legendary);
      this.dragon.group.scale.setScalar(0.75);
      world.scene.add(this.dragon.group);
    }
    world.smoke.setEmitters([{ x: 0, y: this.topY - 0.4, z: 0, size: 0.9, rise: 3.2, period: 2.4, puffs: 10, color: new THREE.Color(0x9a9088) }]);
  }

  update(t: number) {
    const u = Math.min(1, t / this.D);
    // enemy banner falls (1.4s → 2.8s) in a puff of smoke; the monument changes hands at 3.3s; the house banner rises
    const fall = ease(t, 1.4, 2.8);
    this.enemyBanner.visible = fall < 1;
    this.enemyBanner.rotation.z = fall * 1.6;
    this.enemyBanner.position.y = this.topY - 0.6 - fall * fall * 3.2;
    this.smokeOn = t > 1.6 && t < 4.6;
    this.world.smoke.update(t, 0, 0);
    this.world.smoke.mesh.visible = this.smokeOn;
    const swap = t > 3.3;
    if (this.pyramid) {
      if (swap) this.pyramid.setLook({ state: "OPEN", faction: "OWN" });
      this.pyramid.tick(t);
    } else {
      this.enemyMonument.visible = !swap;
      this.ownMonument.visible = swap;
    }
    const rise = ease(t, 3.0, 4.1);
    this.ownBanner.visible = rise > 0;
    const pop = 1 + Math.sin(Math.min(1, rise) * Math.PI) * 0.18;
    this.ownBanner.scale.setScalar(2.0 * (0.4 + 0.6 * rise) * pop);
    this.ownBanner.position.set(0, this.topY - 0.6 - (1 - rise) * 2.6, 0);
    this.ownBanner.rotation.y = -0.4 + Math.sin(t * 0.6) * 0.1;
    this._v.set(0, this.topY + 0.8, 0);
    this.sparks.fireworks(t, this._v, [3.35, 4.7, 6.1, 7.2]);
    this.survivors.update(t, 0);
    this.world.factory.tick(t);

    // camera: slow orbit, rising and pulling back for the finale (monument + cheering survivors always framed)
    const a = -0.55 + t * 0.17;
    const back = ease(u, 0.5, 1);
    const r = 12 + back * 7 + (this.pyramid ? 3.5 : 0);
    const h = 4.4 + back * 3.2 + (this.pyramid ? 1.6 : 0);
    const cam = this.world.camera;
    cam.position.set(Math.sin(a) * r, h + Math.sin(t * 0.8) * 0.08, Math.cos(a) * r);
    cam.lookAt(0, this.topY * 0.5 + back * 0.6, 1.2);

    if (this.dragon) {
      // victory lap around the monument
      const da = t * 0.55 + 1.2;
      const dr = 9 + Math.sin(t * 0.4) * 1.5;
      this._v.set(Math.cos(da) * dr, this.topY + 3.5 + Math.sin(t * 0.9) * 0.6, Math.sin(da) * dr);
      const heading = Math.atan2(-Math.sin(da), -Math.cos(da)) + Math.PI / 2;
      this.dragon.update(t, this._v, heading, 0.5, t > 3.4 && t < 4.6, 0.05);
    }
  }

  dispose() {
    this.survivors.dispose();
    this.sparks.dispose();
    this.dragon?.dispose();
    disposeGroup(this.enemyBanner);
    disposeGroup(this.ownBanner);
    if (this.pyramid) this.pyramid.dispose();
    else {
      disposeGroup(this.enemyMonument);
      disposeGroup(this.ownMonument);
    }
  }
}
