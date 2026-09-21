/**
 * 3D treasure chest for the daily reward reveal: iron-banded oak chest on a stone pedestal, lid swinging open on a
 * hinge, golden light bursting out, coins and sparks fountaining up and settling. Pure function of elapsed seconds
 * (deterministic, skip-safe); transparent canvas so the key-art vault behind shows through.
 */
import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import React, { useCallback, useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import * as THREE from "three";

import { disposeGroup } from "@/src/map3d/entities";

// Physical asset colours (identical in every UI theme by design)
const OAK = "#4A2E16";
const OAK_DARK = "#33200E";
const IRON = "#3B3A3F";
const GOLD = "#F4C542";
const GOLD_DEEP = "#C9922A";
const LIGHT = "#FFE6A3";

type Rig = { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; lid: THREE.Group; glow: THREE.Mesh; rays: THREE.Mesh; coins: THREE.InstancedMesh; sparks: THREE.InstancedMesh; light: THREE.PointLight; raf: number; t0: number };

/** The chest is built from scratch on every context, so its geometries and materials have to go back with it. */
function disposeRig(r: Rig) {
  cancelAnimationFrame(r.raf);
  disposeGroup(r.scene);
  r.renderer.dispose();
}

const COINS = 90;
const SPARKS = 70;
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

function seeded(i: number, k: number): number {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function ChestGL({ playing, anchorY = 0.5, widthFrac = 0.42 }: { playing: boolean; anchorY?: number; widthFrac?: number }) {
  const rig = useRef<Rig | null>(null);
  const playingRef = useRef(playing);
  const frame = useRef({ anchorY, widthFrac });
  // Read by the animation loop after the commit, so refresh them after the commit too (never during render).
  useEffect(() => {
    playingRef.current = playing;
    frame.current = { anchorY, widthFrac };
  });
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (playing) startRef.current = Date.now();
  }, [playing]);

  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    if (rig.current) disposeRig(rig.current);
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const canvas: any = { width: w, height: h, style: {}, addEventListener: () => {}, removeEventListener: () => {}, clientHeight: h, getContext: () => gl };
    const renderer = new THREE.WebGLRenderer({ canvas, context: gl as any, antialias: true, alpha: true, premultipliedAlpha: false });
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffd9a8, 0x2a1d10, 0.55));
    const key = new THREE.DirectionalLight(0xffe0b0, 1.2);
    key.position.set(2, 4, 3);
    scene.add(key);
    const light = new THREE.PointLight(LIGHT, 0, 6, 1.6);
    light.position.set(0, 0.9, 0);
    scene.add(light);
    const FOV = 34;
    const camera = new THREE.PerspectiveCamera(FOV, w / Math.max(1, h), 0.1, 80);

    const lit = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...extra });
    const gold = lit(GOLD, { roughness: 0.3, metalness: 0.85, emissive: GOLD_DEEP, emissiveIntensity: 0.15 });
    const iron = lit(IRON, { roughness: 0.5, metalness: 0.7 });
    // soft contact shadow on the key-art pedestal (no 3D pedestal: the painted one behind is the stage)
    const contact = new THREE.Mesh(new THREE.CircleGeometry(1.15, 28), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = 0.005;
    contact.scale.set(1.1, 0.75, 1);
    scene.add(contact);
    // chest body
    const body = new THREE.Group();
    body.add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 1.0), lit(OAK)));
    for (const x of [-0.55, 0, 0.55]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.82, 1.02), iron);
      band.position.x = x;
      body.add(band);
    }
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.06), gold);
    lock.position.set(0, 0.2, 0.53);
    body.add(lock);
    body.position.y = 0.4;
    scene.add(body);
    // lid: hinge at the back-top edge
    const lid = new THREE.Group();
    lid.position.set(0, 0.8, -0.5);
    const lidMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.6, 20, 1, false, 0, Math.PI), lit(OAK_DARK));
    lidMesh.rotation.z = Math.PI / 2;
    lidMesh.position.set(0, 0, 0.5);
    lid.add(lidMesh);
    for (const x of [-0.55, 0, 0.55]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.515, 0.515, 0.1, 20, 1, false, 0, Math.PI), iron);
      band.rotation.z = Math.PI / 2;
      band.position.set(x, 0, 0.5);
      lid.add(band);
    }
    scene.add(lid);
    // inner glow + light rays (additive)
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), new THREE.MeshBasicMaterial({ color: LIGHT, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.set(0, 0.85, 0);
    scene.add(glow);
    const rays = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.2, 24, 1, true), new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    rays.position.set(0, 2.4, 0);
    scene.add(rays);
    // coins + sparks
    const coins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 12), gold, COINS);
    coins.count = 0;
    scene.add(coins);
    const sparks = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 6, 5), new THREE.MeshBasicMaterial({ color: LIGHT, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }), SPARKS);
    sparks.count = 0;
    scene.add(sparks);

    const r: Rig = { renderer, scene, camera, lid, glow, rays, coins, sparks, light, raf: 0, t0: Date.now() };
    rig.current = r;
    const loop = () => {
      if (rig.current !== r) return;
      r.raf = requestAnimationFrame(loop);
      const idle = (Date.now() - r.t0) / 1000;
      const t = playingRef.current && startRef.current ? (Date.now() - startRef.current) / 1000 : 0;
      // idle: gentle bob + camera drift; play: lid opens 0.4→1.4 s, burst at 1.0 s, coins 1.0→4 s
      const open = Math.min(1, Math.max(0, (t - 0.4) / 1.0));
      const eased = 1 - Math.pow(1 - open, 3);
      lid.rotation.x = -eased * 1.9;
      body.position.y = 0.4 + Math.sin(idle * 1.4) * 0.015;
      lid.position.y = body.position.y + 0.4;
      const burst = Math.max(0, Math.min(1, (t - 0.9) / 0.5));
      (glow.material as THREE.MeshBasicMaterial).opacity = burst * (0.26 + 0.08 * Math.sin(idle * 9));
      glow.scale.setScalar(0.5 + burst * 0.7 + 0.05 * Math.sin(idle * 7));
      (rays.material as THREE.MeshBasicMaterial).opacity = burst * 0.06 * (0.8 + 0.2 * Math.sin(idle * 5));
      rays.rotation.y = idle * 0.6;
      light.intensity = burst * 6 * (0.85 + 0.15 * Math.sin(idle * 11));
      // coins fountain
      let n = 0;
      if (t > 1.0) {
        for (let i = 0; i < COINS; i++) {
          const delay = seeded(i, 1) * 1.2;
          const life = t - 1.0 - delay;
          if (life < 0 || life > 3.2) continue;
          const ang = seeded(i, 2) * Math.PI * 2;
          const speed = 1.6 + seeded(i, 3) * 1.6;
          const vy = 3.2 + seeded(i, 4) * 2.2;
          const x = Math.cos(ang) * speed * life * 0.35;
          const z = Math.sin(ang) * speed * life * 0.35;
          const y = 0.9 + vy * life - 4.9 * life * life;
          if (y < -0.05) continue;
          _p.set(x, Math.max(0.0, y), z);
          _e.set(life * (2 + seeded(i, 5) * 4), life * 3, 0);
          _q.setFromEuler(_e);
          _s.setScalar(1);
          _m.compose(_p, _q, _s);
          coins.setMatrixAt(n++, _m);
        }
      }
      coins.count = n;
      coins.instanceMatrix.needsUpdate = true;
      let m = 0;
      if (t > 0.95) {
        for (let i = 0; i < SPARKS; i++) {
          const life = ((t - 0.95) * (0.6 + seeded(i, 6) * 0.8) + seeded(i, 7)) % 1;
          const ang = seeded(i, 8) * Math.PI * 2 + idle * 0.4;
          const rad = 0.2 + life * 1.4;
          _p.set(Math.cos(ang) * rad, 0.9 + life * 2.6, Math.sin(ang) * rad);
          _s.setScalar(1.2 - life);
          _m.compose(_p, _q.identity(), _s);
          sparks.setMatrixAt(m++, _m);
        }
      }
      sparks.count = m;
      sparks.instanceMatrix.needsUpdate = true;
      // framing: the chest (1.6 wide) spans `widthFrac` of the canvas and its base sits at `anchorY` of the height —
      // the camera orbits gently around the chest, the frustum is panned with a view offset so the base lands on the
      // painted pedestal behind the transparent canvas whatever the screen size
      const bw = gl.drawingBufferWidth;
      const bh = gl.drawingBufferHeight;
      if (bw && bh && (bw !== renderer.domElement.width || bh !== renderer.domElement.height)) {
        renderer.setSize(bw, bh, false);
        camera.aspect = bw / bh;
      }
      const { anchorY: ay, widthFrac: wf } = frame.current;
      const halfTan = Math.tan((FOV / 2) * (Math.PI / 180));
      const dist = 1.75 / (Math.max(0.15, wf) * halfTan * Math.max(0.3, camera.aspect)) * 0.5 + 0.6;
      const yaw = Math.sin(idle * 0.25) * 0.28;
      camera.position.set(Math.sin(yaw) * dist * 0.9, dist * 0.46 + Math.sin(idle * 0.4) * 0.04, Math.cos(yaw) * dist * 0.9);
      camera.lookAt(0, 0.06, 0);
      camera.setViewOffset(bw || w, bh || h, 0, (0.5 - ay) * (bh || h), bw || w, bh || h);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      gl.endFrameEXP();
    };
    r.raf = requestAnimationFrame(loop);
  }, []);

  useEffect(
    () => () => {
      if (rig.current) disposeRig(rig.current);
      rig.current = null;
    },
    [],
  );

  return <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} msaaSamples={2} />;
}
