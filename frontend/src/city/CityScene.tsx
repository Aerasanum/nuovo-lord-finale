/**
 * Living 3D city (expo-gl + three): castle + procedural village (village.ts) + villagers (villagers.ts), realm
 * day/night lighting, smoke, one-finger orbit, pinch zoom, tap-to-pick a building. Rendering pauses while the hosting
 * screen is not focused and the world map is put on render hold so only one GL scene draws at a time.
 */
import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as THREE from "three";

import { serverNow } from "@/src/api/client";
import { daylightAt, realmHour } from "@/src/map3d/daylight";
import { setMapRenderHold } from "@/src/map3d/engine";
import { EntityFactory } from "@/src/map3d/entities";
import { SmokeSystem } from "@/src/map3d/smoke";
import { makeRoofTexture, makeStoneTexture } from "@/src/map3d/textures";
import { useTheme } from "@/src/theme";

import { buildVillage, type Village, type VillageInput } from "./village";
import { createSky, type Sky } from "./sky";
import { Villagers } from "./villagers";

type Props = { input: VillageInput; onPick?: (building: string | null) => void; style?: StyleProp<ViewStyle>; testID?: string; interactive?: boolean };

type Rig = {
  gl: ExpoWebGLRenderingContext;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  factory: EntityFactory;
  smoke: SmokeSystem;
  villagers: Villagers;
  sky: Sky;
  village: Village | null;
  raf: number;
  lastMs: number;
  daylightMinute: number;
  night: number;
};

export function CityScene({ input, onPick, style, testID, interactive = true }: Props) {
  const { colors } = useTheme();
  const rig = useRef<Rig | null>(null);
  const inputRef = useRef(input);
  inputRef.current = input;
  const cam = useRef({ yaw: 0.6, pitch: 0.62, dist: 0, auto: true, lastTouch: 0 });
  const size = useRef({ width: 1, height: 1 });
  const focused = useRef(true);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      setMapRenderHold(true);
      return () => {
        focused.current = false;
        setMapRenderHold(false);
      };
    }, []),
  );

  const rebuild = useCallback(() => {
    const r = rig.current;
    if (!r) return;
    if (r.village) {
      r.scene.remove(r.village.group);
      r.village.dispose();
    }
    const inp = inputRef.current;
    const v = buildVillage(inp, r.factory, new THREE.Color(colors.factionOwn), new THREE.Color(colors.terrainPlain));
    r.scene.add(v.group);
    r.smoke.setEmitters(v.emitters);
    r.villagers.populate(inp.level, v.waypoints, v.ring, v.wallR, inp.wallLevel > 0);
    r.village = v;
  }, [colors.factionOwn, colors.terrainPlain]);

  // rebuild when the settlement shape changes (level, any building level, wall, skin, crest)
  const shape = `${input.settlementId}|${input.level}|${input.wallLevel}|${input.skin}|${JSON.stringify(input.buildings)}|${input.unlocked.length}|${JSON.stringify(input.crest)}|${input.portEligible}`;
  useEffect(() => {
    rebuild();
  }, [shape, rebuild]);

  const applyDaylight = (r: Rig, nowMs: number) => {
    const minute = Math.floor(nowMs / 60000);
    if (minute === r.daylightMinute) return;
    r.daylightMinute = minute;
    const d = daylightAt(realmHour(nowMs));
    r.sun.color.copy(d.sunColor);
    r.sun.intensity = d.sunIntensity;
    r.sun.position.copy(d.sunDir).multiplyScalar(30);
    r.hemi.color.copy(d.skyColor);
    r.hemi.groundColor.copy(d.groundColor);
    r.hemi.intensity = Math.max(d.hemiIntensity, 0.55 + d.night * 0.35);
    r.renderer.toneMappingExposure = d.exposure;
    const horizon = new THREE.Color(colors.skyHorizon).lerp(d.horizonTint, d.horizonMix);
    r.renderer.setClearColor(horizon, 1);
    (r.scene.fog as THREE.Fog).color.copy(horizon);
    r.sky.apply(d, horizon);
    r.factory.setNight(d.night);
    r.night = d.night;
    if (r.village) for (const m of r.village.nightMats) m.emissiveIntensity = 0.15 + d.night * 1.4;
  };

  const onContextCreate = useCallback(
    (gl: ExpoWebGLRenderingContext) => {
      if (rig.current) {
        cancelAnimationFrame(rig.current.raf);
        rig.current.village?.dispose();
        rig.current.villagers.dispose();
        rig.current.sky.dispose();
        rig.current.renderer.dispose();
      }
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const canvas: any = { width: w, height: h, style: {}, addEventListener: () => {}, removeEventListener: () => {}, clientHeight: h, getContext: () => gl };
      const renderer = new THREE.WebGLRenderer({ canvas, context: gl as any, antialias: true, alpha: false });
      renderer.setPixelRatio(1);
      renderer.setSize(w, h, false);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      const scene = new THREE.Scene();
      // haze only kicks in on the far hills so the town itself stays crisp and saturated
      scene.fog = new THREE.Fog(new THREE.Color(colors.skyHorizon), 26, 70);
      const hemi = new THREE.HemisphereLight(0xbfe1ff, 0x7c9a58, 1.0);
      scene.add(hemi);
      const sun = new THREE.DirectionalLight(0xfff3dc, 2.05);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.left = sun.shadow.camera.bottom = -10;
      sun.shadow.camera.right = sun.shadow.camera.top = 10;
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 80;
      sun.shadow.normalBias = 0.03;
      sun.shadow.radius = 3;
      scene.add(sun);
      scene.add(sun.target);
      const sky = createSky(70, 15);
      scene.add(sky.group);
      const camera = new THREE.PerspectiveCamera(40, w / Math.max(1, h), 0.1, 160);
      const pal = { own: new THREE.Color(colors.factionOwn), enemy: new THREE.Color(colors.factionEnemy), neutral: new THREE.Color(colors.factionNeutral), ally: new THREE.Color(colors.factionAlly), snow: new THREE.Color(colors.onSurface) };
      const factory = new EntityFactory(pal, { stone: makeStoneTexture(), roof: makeRoofTexture() });
      const smoke = new SmokeSystem(new THREE.Color("#f0ece6"));
      scene.add(smoke.mesh);
      const villagers = new Villagers(pal.own, 1.45);
      scene.add(villagers.group);
      const r: Rig = { gl, renderer, scene, camera, sun, hemi, factory, smoke, villagers, sky, village: null, raf: 0, lastMs: Date.now(), daylightMinute: -1, night: 0 };
      rig.current = r;
      rebuild();
      const loop = () => {
        if (rig.current !== r) return;
        r.raf = requestAnimationFrame(loop);
        if (!focused.current) return;
        const bw = gl.drawingBufferWidth;
        const bh = gl.drawingBufferHeight;
        if (!bw || !bh) return;
        if (bw !== renderer.domElement.width || bh !== renderer.domElement.height) {
          renderer.setSize(bw, bh, false);
          camera.aspect = bw / bh;
          camera.updateProjectionMatrix();
        }
        const nowMs = Date.now();
        const dt = Math.min(0.1, (nowMs - r.lastMs) / 1000);
        r.lastMs = nowMs;
        const t = nowMs / 1000;
        applyDaylight(r, serverNow());
        // camera: slow auto-orbit until the Player touches the scene; first frame frames the whole walled town
        const c = cam.current;
        if (!c.dist && r.village) c.dist = (r.village.wallR * 1.55 + 1.2) * (camera.aspect < 0.8 ? 1.3 : 1);
        if (c.auto || nowMs - c.lastTouch > 6000) c.yaw += dt * 0.08;
        const cp = Math.cos(c.pitch);
        const ty = 0.55;
        camera.position.set(Math.sin(c.yaw) * cp * c.dist, ty + Math.sin(c.pitch) * c.dist, Math.cos(c.yaw) * cp * c.dist);
        camera.lookAt(0, ty, 0);
        // animate
        factory.tick(t);
        smoke.update(t, 0, 0, 40);
        villagers.update(dt, t, r.night);
        sky.tick(dt);
        const v = r.village;
        if (v) {
          for (const hub of v.animated.windmills) hub.rotation.z += dt * 0.9;
          if (v.animated.crystal) {
            v.animated.crystal.rotation.y += dt * 0.8;
            v.animated.crystal.position.y += Math.sin(t * 1.6) * 0.0015;
          }
          if (v.animated.boat) {
            v.animated.boat.position.y = 0.02 + Math.sin(t * 1.3) * 0.008;
            v.animated.boat.rotation.z = Math.sin(t * 1.1) * 0.04;
          }
        }
        renderer.render(scene, camera);
        gl.endFrameEXP();
      };
      r.raf = requestAnimationFrame(loop);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colors, rebuild],
  );

  useEffect(
    () => () => {
      const r = rig.current;
      if (!r) return;
      cancelAnimationFrame(r.raf);
      r.village?.dispose();
      r.villagers.dispose();
      r.smoke.dispose();
      r.sky.dispose();
      r.renderer.dispose();
      rig.current = null;
    },
    [],
  );

  const pick = (px: number, py: number) => {
    const r = rig.current;
    if (!r?.village) return;
    const { width, height } = size.current;
    const ndc = new THREE.Vector2((px / width) * 2 - 1, -(py / height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, r.camera);
    const hits = ray.intersectObjects(r.village.pickables, false);
    if (hits.length) {
      onPickRef.current?.(hits[0].object.userData.building as string);
      return;
    }
    // fallback: nearest anchor in screen space
    const v = new THREE.Vector3();
    let best: { d: number; name: string } | null = null;
    for (const a of r.village.anchors) {
      v.set(a.x, 0.3, a.z).project(r.camera);
      const d = Math.hypot(((v.x + 1) / 2) * width - px, ((1 - v.y) / 2) * height - py);
      if (d < 34 && (!best || d < best.d)) best = { d, name: a.name };
    }
    onPickRef.current?.(best?.name ?? null);
  };

  const lastPan = useRef({ x: 0, y: 0 });
  const pan = Gesture.Pan()
    .enabled(interactive)
    .maxPointers(1)
    .runOnJS(true)
    .onBegin(() => {
      lastPan.current = { x: 0, y: 0 };
      cam.current.auto = false;
      cam.current.lastTouch = Date.now();
    })
    .onUpdate((e) => {
      const dx = e.translationX - lastPan.current.x;
      const dy = e.translationY - lastPan.current.y;
      lastPan.current = { x: e.translationX, y: e.translationY };
      cam.current.yaw -= dx * 0.008;
      cam.current.pitch = Math.max(0.26, Math.min(1.25, cam.current.pitch + dy * 0.005));
      cam.current.lastTouch = Date.now();
    });
  const lastScale = useRef(1);
  const pinch = Gesture.Pinch()
    .enabled(interactive)
    .runOnJS(true)
    .onBegin(() => {
      lastScale.current = 1;
      cam.current.auto = false;
    })
    .onUpdate((e) => {
      const f = e.scale / lastScale.current;
      lastScale.current = e.scale;
      const v = rig.current?.village;
      const min = 3.5;
      const max = (v?.wallR ?? 6) * 2.4 + 4;
      cam.current.dist = Math.max(min, Math.min(max, cam.current.dist / f));
      cam.current.lastTouch = Date.now();
    });
  const tap = Gesture.Tap()
    .enabled(interactive)
    .maxDuration(250)
    .maxDistance(10)
    .runOnJS(true)
    .onEnd((e) => pick(e.x, e.y));
  const composed = Gesture.Race(tap, Gesture.Simultaneous(pan, pinch));

  return (
    <GestureDetector gesture={composed}>
      <View
        style={[styles.box, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }, style ?? styles.defaultHeight]}
        testID={testID}
        onLayout={(e) => {
          size.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
        }}
      >
        <GLView style={styles.fill} onContextCreate={onContextCreate} msaaSamples={2} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 12, overflow: "hidden", borderWidth: 1 },
  defaultHeight: { height: 300 },
  fill: { flex: 1 },
});
