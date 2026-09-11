/**
 * March skins (Bible §41.3 cosmetics): the creature leading an own/enemy march marker on the map — Dragon flying
 * above the column, War Elephant at its head, Falcon circling overhead. Tiny low-poly rigs (a few hundred triangles),
 * one per march marker, animated in `animateSkin` from the shared clock. Saddle / howdah cloth takes the faction colour.
 */
import * as THREE from "three";

import { place } from "./geo";

export type MarchSkin = "classic" | "dragon" | "elephant" | "falcon";

// Physical creature colours (identical in every UI theme by design).
const DRAGON_BODY = "#7E2A2A";
const DRAGON_WING = "#4A1818";
const DRAGON_HORN = "#E9D8A6";
const EMBER = "#FFB347";
const ELEPHANT_HIDE = "#8E877F";
const ELEPHANT_TUSK = "#F1E9D2";
const FALCON_BODY = "#6B4A2B";
const FALCON_BELLY = "#D9C9A8";
const FALCON_BEAK = "#3A2A1A";

const lit = (color: string | THREE.Color, extra: Partial<THREE.MeshLambertMaterialParameters> = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

/** Flat wing: triangle fan in the XZ plane, root at the origin, spanning +x (mirrored for the left wing). */
function wing(span: number, chord: number, side: 1 | -1, mat: THREE.Material): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  const v = new Float32Array([0, 0, -chord * 0.35, side * span * 0.55, 0.04, -chord * 0.5, side * span, 0.08, -chord * 0.1, side * span * 0.7, 0.03, chord * 0.35, side * span * 0.25, 0.0, chord * 0.5, 0, 0, chord * 0.45]);
  g.setAttribute("position", new THREE.BufferAttribute(v, 3));
  g.setIndex([0, 1, 5, 1, 4, 5, 1, 2, 3, 1, 3, 4]);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

function buildDragon(faction: THREE.Color): THREE.Group {
  const g = new THREE.Group();
  const body = lit(DRAGON_BODY);
  const wingMat = lit(DRAGON_WING, { side: THREE.DoubleSide });
  const torso = new THREE.SphereGeometry(0.15, 8, 6);
  torso.scale(1.7, 0.75, 0.9);
  g.add(mesh(torso, body));
  const neck = new THREE.CylinderGeometry(0.05, 0.09, 0.32, 6);
  neck.rotateX(-1.1);
  g.add(mesh(place(neck, 0, 0.1, 0.3), body));
  g.add(mesh(place(new THREE.BoxGeometry(0.14, 0.1, 0.24), 0, 0.22, 0.46), body));
  g.add(mesh(place(new THREE.BoxGeometry(0.08, 0.05, 0.14), 0, 0.19, 0.6), body));
  for (const sx of [-1, 1]) {
    const horn = new THREE.ConeGeometry(0.025, 0.14, 4);
    horn.rotateX(-0.6);
    g.add(mesh(place(horn, sx * 0.05, 0.3, 0.38), lit(DRAGON_HORN)));
    g.add(mesh(place(new THREE.SphereGeometry(0.018, 5, 4), sx * 0.05, 0.24, 0.55), new THREE.MeshBasicMaterial({ color: EMBER })));
  }
  const tail = new THREE.ConeGeometry(0.07, 0.62, 6);
  tail.rotateX(Math.PI / 2 + 0.25);
  g.add(mesh(place(tail, 0, 0.02, -0.5), body));
  // saddle cloth in the faction colour
  g.add(mesh(place(new THREE.BoxGeometry(0.16, 0.03, 0.16), 0, 0.12, 0.02), lit(faction)));
  const wl = wing(0.62, 0.42, -1, wingMat);
  wl.name = "wingL";
  wl.position.set(-0.08, 0.06, 0);
  const wr = wing(0.62, 0.42, 1, wingMat);
  wr.name = "wingR";
  wr.position.set(0.08, 0.06, 0);
  g.add(wl, wr);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: EMBER, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.position.set(0, 0.17, 0.68);
  glow.name = "glow";
  g.add(glow);
  g.scale.setScalar(0.9);
  return g;
}

function buildElephant(faction: THREE.Color): THREE.Group {
  const g = new THREE.Group();
  const hide = lit(ELEPHANT_HIDE);
  const torso = new THREE.SphereGeometry(0.19, 8, 6);
  torso.scale(1.0, 0.85, 1.35);
  g.add(mesh(place(torso, 0, 0.33, 0), hide));
  g.add(mesh(place(new THREE.SphereGeometry(0.12, 8, 6), 0, 0.4, 0.27), hide));
  for (const sx of [-1, 1]) {
    g.add(mesh(place(new THREE.BoxGeometry(0.04, 0.16, 0.12), sx * 0.13, 0.4, 0.24), hide));
    const tusk = new THREE.ConeGeometry(0.018, 0.16, 4);
    tusk.rotateX(-1.9);
    g.add(mesh(place(tusk, sx * 0.05, 0.3, 0.4), lit(ELEPHANT_TUSK)));
    for (const sz of [-1, 1]) g.add(mesh(place(new THREE.CylinderGeometry(0.045, 0.05, 0.22, 6), sx * 0.1, 0.11, sz * 0.15), hide));
  }
  const trunk = new THREE.CylinderGeometry(0.025, 0.04, 0.26, 5);
  trunk.rotateX(0.35);
  const tr = mesh(place(trunk, 0, 0.26, 0.42), hide);
  tr.name = "trunk";
  g.add(tr);
  // howdah in the faction colour with a small pennant
  g.add(mesh(place(new THREE.BoxGeometry(0.22, 0.1, 0.24), 0, 0.53, -0.02), lit(faction)));
  g.add(mesh(place(new THREE.BoxGeometry(0.26, 0.02, 0.28), 0, 0.47, -0.02), lit(DRAGON_HORN)));
  g.add(mesh(place(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), 0.08, 0.72, -0.1), lit("#3A2F1B")));
  g.add(mesh(place(new THREE.BoxGeometry(0.1, 0.06, 0.01), 0.13, 0.84, -0.1), lit(faction, { side: THREE.DoubleSide })));
  return g;
}

function buildFalcon(faction: THREE.Color): THREE.Group {
  const g = new THREE.Group();
  const body = lit(FALCON_BODY);
  const torso = new THREE.SphereGeometry(0.06, 7, 5);
  torso.scale(1.0, 0.8, 1.9);
  g.add(mesh(torso, body));
  g.add(mesh(place(new THREE.SphereGeometry(0.035, 6, 5), 0, 0.02, 0.1), body));
  const belly = new THREE.SphereGeometry(0.05, 6, 4);
  belly.scale(0.9, 0.5, 1.5);
  g.add(mesh(place(belly, 0, -0.03, 0.01), lit(FALCON_BELLY)));
  const beak = new THREE.ConeGeometry(0.012, 0.05, 4);
  beak.rotateX(Math.PI / 2);
  g.add(mesh(place(beak, 0, 0.015, 0.145), lit(FALCON_BEAK)));
  g.add(mesh(place(new THREE.BoxGeometry(0.08, 0.008, 0.12), 0, 0, -0.12), body));
  const wingMat = lit(FALCON_BODY, { side: THREE.DoubleSide });
  const wl = wing(0.3, 0.14, -1, wingMat);
  wl.name = "wingL";
  const wr = wing(0.3, 0.14, 1, wingMat);
  wr.name = "wingR";
  g.add(wl, wr);
  // jess ribbon in the faction colour
  g.add(mesh(place(new THREE.BoxGeometry(0.02, 0.05, 0.006), 0.02, -0.06, 0.02), lit(faction)));
  return g;
}

/** Skin rig for a march marker (null for the classic banner-only column). Animated by `animateSkin`. */
export function buildSkin(skin: MarchSkin | undefined, faction: THREE.Color): THREE.Group | null {
  if (!skin || skin === "classic") return null;
  const g = skin === "dragon" ? buildDragon(faction) : skin === "elephant" ? buildElephant(faction) : buildFalcon(faction);
  g.name = "skin";
  g.userData.skin = skin;
  if (skin === "dragon") g.position.set(0, 0.85, -0.05);
  if (skin === "elephant") g.position.set(0, 0, 0.42);
  if (skin === "falcon") g.position.set(0.5, 1.05, 0);
  return g;
}

export function animateSkin(g: THREE.Object3D, now: number) {
  const skin = g.userData.skin as MarchSkin;
  const wl = g.getObjectByName("wingL");
  const wr = g.getObjectByName("wingR");
  if (skin === "dragon") {
    g.position.y = 0.85 + Math.sin(now / 320) * 0.07;
    g.rotation.x = Math.sin(now / 640) * 0.06;
    const flap = 0.3 + Math.sin(now / 150) * 0.55;
    if (wl) wl.rotation.z = -flap;
    if (wr) wr.rotation.z = flap;
    const glow = g.getObjectByName("glow") as THREE.Mesh | undefined;
    if (glow) glow.scale.setScalar(0.8 + 0.4 * (0.5 + 0.5 * Math.sin(now / 90)));
  } else if (skin === "falcon") {
    const a = now / 1100;
    g.position.set(Math.cos(a) * 0.55, 1.05 + Math.sin(now / 500) * 0.05, Math.sin(a) * 0.55);
    g.rotation.y = -a; // fly along the circle, nose first
    g.rotation.z = -0.35; // bank into the turn
    const flap = Math.sin(now / 110) * 0.35 * (0.5 + 0.5 * Math.sin(now / 900));
    if (wl) wl.rotation.z = -flap;
    if (wr) wr.rotation.z = flap;
  } else if (skin === "elephant") {
    g.rotation.z = Math.sin(now / 380) * 0.04;
    const trunk = g.getObjectByName("trunk");
    if (trunk) trunk.rotation.x = 0.35 + Math.sin(now / 420) * 0.15;
  }
}
