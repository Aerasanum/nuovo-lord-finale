/**
 * Live 3D preview of a single castle (skin / level / crest) — same procedural parts as the world map, slowly orbiting.
 */
import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import React, { useCallback, useEffect, useRef } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import * as THREE from "three";

import type { CrestDto, SettlementPublic } from "@/src/api/hooks";
import { useTheme } from "@/src/theme";

import { disposeGroup, EntityFactory } from "./entities";
import { SmokeSystem } from "./smoke";
import { makeRoofTexture, makeStoneTexture } from "./textures";

type Props = { skin: string; level: number; crest?: CrestDto | null; style?: StyleProp<ViewStyle>; testID?: string };

type Rig = { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; factory: EntityFactory; smoke: SmokeSystem; castle: THREE.Group | null; raf: number; gl: ExpoWebGLRenderingContext };

export function CastlePreview({ skin, level, crest, style, testID }: Props) {
  const { colors } = useTheme();
  const rig = useRef<Rig | null>(null);
  const props = useRef({ skin, level, crest });
  props.current = { skin, level, crest };

  const rebuild = useCallback(() => {
    const r = rig.current;
    if (!r) return;
    if (r.castle) {
      r.scene.remove(r.castle);
      disposeGroup(r.castle);
    }
    const { skin: sk, level: lv, crest: cr } = props.current;
    const fake: SettlementPublic = { settlement_id: "preview", kind: "PLAYER", name: "", x: -1, y: -1, terrain: "plain", terrain_defender_bonus_pct: 0, region: "", port_eligible: false, level: lv, owner_player_id: "me", owner_house_crest: cr ?? null, skin: sk, faction: "OWN", wall_level: 0 };
    const built = r.factory.buildSettlements([fake], () => 0);
    built.group.position.set(0.5, 0, 0.5); // tile (-1,-1) centre → origin
    r.castle = built.group;
    r.scene.add(built.group);
    r.smoke.setEmitters(built.emitters.map((e) => ({ ...e, x: e.x + 0.5, z: e.z + 0.5 })));
  }, []);

  useEffect(() => {
    rebuild();
  }, [skin, level, crest, rebuild]);

  const onContextCreate = useCallback(
    (gl: ExpoWebGLRenderingContext) => {
      if (rig.current) {
        cancelAnimationFrame(rig.current.raf);
        rig.current.renderer.dispose();
      }
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const canvas: any = { width: w, height: h, style: {}, addEventListener: () => {}, removeEventListener: () => {}, clientHeight: h, getContext: () => gl };
      const renderer = new THREE.WebGLRenderer({ canvas, context: gl as any, antialias: true, alpha: false });
      renderer.setPixelRatio(1);
      renderer.setSize(w, h, false);
      renderer.setClearColor(new THREE.Color(colors.surfaceSecondary), 1);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.shadowMap.enabled = true;
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xcfd8ea, 0x4a3f33, 0.85));
      const sun = new THREE.DirectionalLight(0xfff0d2, 1.7);
      sun.position.set(0.68, 0.78, 0.3).multiplyScalar(20);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.left = sun.shadow.camera.bottom = -4;
      sun.shadow.camera.right = sun.shadow.camera.top = 4;
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 60;
      sun.shadow.normalBias = 0.05;
      scene.add(sun);
      const ground = new THREE.Mesh(new THREE.CircleGeometry(2.6, 40), new THREE.MeshLambertMaterial({ color: new THREE.Color(colors.terrainPlain) }));
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.01;
      ground.receiveShadow = true;
      scene.add(ground);
      const camera = new THREE.PerspectiveCamera(38, w / Math.max(1, h), 0.1, 100);
      const pal = { own: new THREE.Color(colors.factionOwn), enemy: new THREE.Color(colors.factionEnemy), neutral: new THREE.Color(colors.factionNeutral), ally: new THREE.Color(colors.factionAlly), snow: new THREE.Color(colors.onSurface) };
      const factory = new EntityFactory(pal, { stone: makeStoneTexture(), roof: makeRoofTexture() });
      const smoke = new SmokeSystem(pal.snow.clone().multiplyScalar(0.8));
      scene.add(smoke.mesh);
      const r: Rig = { renderer, scene, camera, factory, smoke, castle: null, raf: 0, gl };
      rig.current = r;
      rebuild();
      const start = Date.now();
      const loop = () => {
        if (rig.current !== r) return;
        r.raf = requestAnimationFrame(loop);
        const bw = gl.drawingBufferWidth;
        const bh = gl.drawingBufferHeight;
        if (!bw || !bh) return;
        if (bw !== renderer.domElement.width || bh !== renderer.domElement.height) {
          renderer.setSize(bw, bh, false);
          camera.aspect = bw / bh;
          camera.updateProjectionMatrix();
        }
        const t = (Date.now() - start) / 1000;
        const a = t * 0.35;
        const dist = 5.2 + Math.min(30, props.current.level) * 0.07;
        camera.position.set(Math.sin(a) * dist, 1.6 + dist * 0.28, Math.cos(a) * dist);
        camera.lookAt(0, 1.35, 0);
        factory.tick(t);
        smoke.update(t, 0, 0);
        renderer.render(scene, camera);
        gl.endFrameEXP();
      };
      r.raf = requestAnimationFrame(loop);
    },
    [colors, rebuild],
  );

  useEffect(
    () => () => {
      const r = rig.current;
      if (!r) return;
      cancelAnimationFrame(r.raf);
      if (r.castle) disposeGroup(r.castle);
      r.smoke.dispose();
      r.renderer.dispose();
      rig.current = null;
    },
    [],
  );

  return (
    <View style={[styles.box, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }, style]} testID={testID}>
      <GLView style={styles.fill} onContextCreate={onContextCreate} msaaSamples={2} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: 280, borderRadius: 12, overflow: "hidden", borderWidth: 1 },
  fill: { flex: 1 },
});
