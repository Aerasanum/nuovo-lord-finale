import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { PixelRatio, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { get, serverNow } from "@/src/api/client";
import type { ChunkDto, MarchDto, OverviewDto, PyramidDto } from "@/src/api/hooks";
import { useTheme } from "@/src/theme";

import { MapEngine, MapLabel, Selection, setEngineServerOffset } from "./engine";
import { MapLabels } from "./MapLabels";

type Props = {
  worldId: string;
  /** realm size in tiles (world DTO) — the GL scene is created only once it is known */
  worldSize: number;
  home?: { x: number; y: number } | null;
  marches?: MarchDto[];
  pyramid?: PyramidDto | null;
  onSelect: (sel: Selection | null) => void;
  onEngine?: (engine: MapEngine | null) => void;
  onCameraChange?: (cam: { tx: number; tz: number; dist: number }) => void;
  refreshToken?: number;
  showLabels?: boolean;
};

export function MapView3D({ worldId, worldSize, home, marches, pyramid, onSelect, onEngine, onCameraChange, refreshToken, showLabels = true }: Props) {
  const { colors } = useTheme();
  const engineRef = useRef<MapEngine | null>(null);
  const sizeRef = useRef({ width: 1, height: 1 });
  const centeredRef = useRef(false);
  const chunkCache = useRef(new Map<string, Promise<ChunkDto>>());
  const [labels, setLabels] = useState<MapLabel[]>([]);

  const fetchChunk = useCallback(
    (cx: number, cy: number) => {
      const key = `${cx}:${cy}`;
      let p = chunkCache.current.get(key);
      if (!p) {
        p = get<ChunkDto>(`/worlds/${worldId}/map/chunk/${cx}/${cy}`);
        chunkCache.current.set(key, p);
        p.catch(() => chunkCache.current.delete(key));
        // chunk entities change over time (conquests, growth): drop from cache after 60s
        setTimeout(() => chunkCache.current.delete(key), 60000);
      }
      return p;
    },
    [worldId],
  );
  const fetchOverview = useCallback(() => get<OverviewDto>(`/worlds/${worldId}/map/overview`), [worldId]);

  const onContextCreate = useCallback(
    (gl: ExpoWebGLRenderingContext) => {
      engineRef.current?.dispose();
      const engine = new MapEngine({
        gl,
        width: sizeRef.current.width,
        height: sizeRef.current.height,
        pixelRatio: PixelRatio.get(),
        colors,
        fetchChunk,
        fetchOverview,
        onSelect,
        onCameraChange,
        onLabels: setLabels,
        worldSize,
        pyramidXY: pyramid?.anchor ? [pyramid.anchor[0], pyramid.anchor[1]] : undefined,
      });
      engineRef.current = engine;
      if (home) {
        engine.centerOn(home.x, home.y, 30, false);
        engine.setHome(home.x, home.y);
        centeredRef.current = true;
      }
      if (marches) engine.setMarches(marches);
      if (pyramid) engine.setPyramid(pyramid);
      onEngine?.(engine);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchChunk, fetchOverview, worldSize],
  );

  useEffect(() => {
    if (home && engineRef.current) {
      engineRef.current.setHome(home.x, home.y);
      if (!centeredRef.current) {
        engineRef.current.centerOn(home.x, home.y, 30);
        centeredRef.current = true;
      }
    }
  }, [home?.x, home?.y]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setEngineServerOffset(serverNow() - Date.now());
    engineRef.current?.setMarches(marches ?? []);
  }, [marches]);

  useEffect(() => {
    engineRef.current?.setPyramid(pyramid ?? null);
  }, [pyramid]);

  useEffect(() => {
    if (refreshToken) {
      chunkCache.current.clear();
      engineRef.current?.invalidateChunks();
    }
  }, [refreshToken]);

  useEffect(
    () => () => {
      engineRef.current?.dispose();
      engineRef.current = null;
      onEngine?.(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const lastPan = useRef({ x: 0, y: 0 });
  const pan = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .runOnJS(true)
    .onBegin(() => {
      lastPan.current = { x: 0, y: 0 };
      engineRef.current?.stopInertia();
    })
    .onUpdate((e) => {
      const dx = e.translationX - lastPan.current.x;
      const dy = e.translationY - lastPan.current.y;
      lastPan.current = { x: e.translationX, y: e.translationY };
      engineRef.current?.pan(dx, dy);
    })
    .onEnd((e) => {
      const clamp = (v: number) => Math.max(-2500, Math.min(2500, v));
      engineRef.current?.flingPan(clamp(e.velocityX), clamp(e.velocityY));
    });
  const twoFingerPan = Gesture.Pan()
    .minPointers(2)
    .maxPointers(2)
    .runOnJS(true)
    .onBegin(() => {
      lastPan.current = { x: 0, y: 0 };
    })
    .onUpdate((e) => {
      const dy = e.translationY - lastPan.current.y;
      lastPan.current = { x: e.translationX, y: e.translationY };
      engineRef.current?.tiltBy(dy * 0.004);
    });
  const lastScale = useRef(1);
  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onBegin(() => {
      lastScale.current = 1;
      engineRef.current?.stopInertia();
    })
    .onUpdate((e) => {
      const f = e.scale / lastScale.current;
      lastScale.current = e.scale;
      engineRef.current?.zoomBy(f, e.focalX, e.focalY);
    });
  const lastRot = useRef(0);
  const rotation = Gesture.Rotation()
    .runOnJS(true)
    .onBegin(() => {
      lastRot.current = 0;
    })
    .onUpdate((e) => {
      const d = e.rotation - lastRot.current;
      lastRot.current = e.rotation;
      engineRef.current?.rotateBy(-d);
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(300)
    .runOnJS(true)
    .onEnd((e) => {
      engineRef.current?.zoomBy(1.8, e.x, e.y);
    });
  const tap = Gesture.Tap()
    .maxDuration(250)
    .maxDistance(10)
    .runOnJS(true)
    .onEnd((e) => {
      engineRef.current?.tap(e.x, e.y);
    });
  const composed = Gesture.Race(Gesture.Simultaneous(tap, doubleTap), Gesture.Simultaneous(pan, pinch, rotation, twoFingerPan));

  return (
    <GestureDetector gesture={composed}>
      <View
        style={styles.fill}
        testID="map-3d-view"
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          sizeRef.current = { width, height };
          engineRef.current?.resize(width, height);
        }}
      >
        <GLView style={styles.fill} onContextCreate={onContextCreate} msaaSamples={2} />
        {showLabels ? <MapLabels labels={labels} /> : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
