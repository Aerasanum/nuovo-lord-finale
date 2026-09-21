/**
 * Live 3D preview of a march marker (soldier column + Casata banner + the selected creature skin) — the exact rigs
 * the world map draws, on a small grass plate, slowly orbiting. Rebuilds in place when the skin or crest changes.
 */
import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import React, { useCallback, useEffect, useRef } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import * as THREE from "three";

import type { CrestDto, MarchSkin } from "@/src/api/hooks";
import { useTheme } from "@/src/theme";

import { disposeGroup, EntityFactory } from "./entities";
import { animateSkin, buildSkin } from "./markerSkins";
import { makeRoofTexture, makeStoneTexture } from "./textures";

type Props = { skin: MarchSkin; crest?: CrestDto | null; style?: StyleProp<ViewStyle>; testID?: string };
type Rig = { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; factory: EntityFactory; marker: THREE.Group | null; skin: THREE.Group | null; raf: number };

export function MarchSkinPreview({ skin, crest, style, testID }: Props) {
  const { colors } = useTheme();
  const rig = useRef<Rig | null>(null);
  const props = useRef({ skin, crest });
  // Read by the render loop after the commit, so refresh it after the commit too (never during render).
  useEffect(() => {
    props.current = { skin, crest };
  });

  const rebuild = useCallback(() => {
    const r = rig.current;
    if (!r) return;
    if (r.marker) {
      r.scene.remove(r.marker);
      disposeGroup(r.marker);
    }
    const own = r.factory.factionColor("OWN");
    const marker = new THREE.Group();
    marker.add(r.factory.buildArmy(own, false));
    marker.add(r.factory.buildBanner(props.current.crest ?? null, own, false));
    const sk = buildSkin(props.current.skin, own);
    if (sk) marker.add(sk);
    r.skin = sk;
    r.marker = marker;
    r.scene.add(marker);
  }, []);

  useEffect(() => {
    rebuild();
  }, [skin, crest, rebuild]);

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
      renderer.toneMappingExposure = 1.0;
      renderer.shadowMap.enabled = true;
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xb9c2d0, 0x3d3428, 0.75));
      const sun = new THREE.DirectionalLight(0xfff0d2, 1.6);
      sun.position.set(0.68, 0.78, 0.3).multiplyScalar(12);
      sun.castShadow = true;
      sun.shadow.mapSize.set(512, 512);
      sun.shadow.camera.left = sun.shadow.camera.bottom = -2.5;
      sun.shadow.camera.right = sun.shadow.camera.top = 2.5;
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 40;
      sun.shadow.normalBias = 0.04;
      scene.add(sun);
      const ground = new THREE.Mesh(new THREE.CircleGeometry(1.7, 36), new THREE.MeshLambertMaterial({ color: new THREE.Color(colors.terrainPlain) }));
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.01;
      ground.receiveShadow = true;
      scene.add(ground);
      const camera = new THREE.PerspectiveCamera(36, w / Math.max(1, h), 0.1, 60);
      const pal = { own: new THREE.Color(colors.factionOwn), enemy: new THREE.Color(colors.factionEnemy), neutral: new THREE.Color(colors.factionNeutral), ally: new THREE.Color(colors.factionAlly), snow: new THREE.Color(colors.onSurface) };
      const factory = new EntityFactory(pal, { stone: makeStoneTexture(), roof: makeRoofTexture() });
      const r: Rig = { renderer, scene, camera, factory, marker: null, skin: null, raf: 0 };
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
        const now = Date.now();
        const t = (now - start) / 1000;
        const a = t * 0.3;
        camera.position.set(Math.sin(a) * 2.7, 1.45, Math.cos(a) * 2.7);
        camera.lookAt(0, 0.7, 0);
        factory.tick(t);
        if (r.skin) animateSkin(r.skin, now);
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
      if (r.marker) disposeGroup(r.marker);
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
  box: { height: 220, borderRadius: 12, overflow: "hidden", borderWidth: 1 },
  fill: { flex: 1 },
});
