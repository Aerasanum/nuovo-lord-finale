/**
 * expo-gl host for the cinematic 3D scenes (departure / conquest). The scene clock starts once the GPU has actually
 * finished the first frame (`onReady`) so shader compilation never eats into the show; the picture is then a pure
 * function of elapsed time. The HUD (crest, title, composition, Salta) is rendered above by the overlay.
 */
import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import React, { useCallback, useEffect, useRef } from "react";
import { StyleSheet } from "react-native";

import { useTheme } from "@/src/theme";

import { ConquestScene, DepartureScene, type CinematicSceneRig, type SceneSpec } from "./scene3d/scenes";
import { CinematicWorld } from "./scene3d/world";

type Props = { kind: "DEPARTURE" | "CONQUEST"; spec: SceneSpec; onReady: (startedAt: number) => void };

type Rig = { world: CinematicWorld; scene: CinematicSceneRig; raf: number; t0: number };

const SYNC_PIXEL = new Uint8Array(4);

export function CinematicGL({ kind, spec, onReady }: Props) {
  const { colors } = useTheme();
  const rig = useRef<Rig | null>(null);
  const propsRef = useRef({ kind, spec, onReady });
  propsRef.current = { kind, spec, onReady };

  const onContextCreate = useCallback(
    (gl: ExpoWebGLRenderingContext) => {
      if (rig.current) {
        cancelAnimationFrame(rig.current.raf);
        rig.current.scene.dispose();
        rig.current.world.dispose();
      }
      const { kind: k, spec: sp } = propsRef.current;
      const world = new CinematicWorld(gl, colors, k === "CONQUEST" ? "dawn" : "night");
      const scene = k === "CONQUEST" ? new ConquestScene(world, sp) : new DepartureScene(world, sp);
      const r: Rig = { world, scene, raf: 0, t0: 0 };
      rig.current = r;
      const loop = () => {
        if (rig.current !== r) return;
        r.raf = requestAnimationFrame(loop);
        if (!world.resizeIfNeeded()) return;
        if (!r.t0) {
          // first frame at t=0 compiles every shader; a 1-pixel readback is the one portable GPU sync point
          // (browsers treat gl.finish() as a flush) — the clock starts only when the picture is really on screen
          scene.update(0);
          world.render();
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, SYNC_PIXEL);
          r.t0 = Date.now();
          propsRef.current.onReady(r.t0);
          return;
        }
        scene.update((Date.now() - r.t0) / 1000);
        world.render();
      };
      r.raf = requestAnimationFrame(loop);
    },
    [colors],
  );

  useEffect(
    () => () => {
      const r = rig.current;
      if (!r) return;
      cancelAnimationFrame(r.raf);
      r.scene.dispose();
      r.world.dispose();
      rig.current = null;
    },
    [],
  );

  return <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} msaaSamples={2} />;
}
