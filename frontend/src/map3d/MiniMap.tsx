import React, { useEffect, useRef } from "react";
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from "react-native";

import { T } from "@/src/components/ui";
import { useI18n } from "@/src/i18n";
import { fonts, radius, useTheme } from "@/src/theme";

import type { MapEngine } from "./engine";

export const MINIMAP_SIZE = 120;

/**
 * Frame + touch surface for the minimap. The picture itself is drawn by the engine in a second scissored pass of the
 * same GL canvas (north-up ortho view: terrain, player settlements, active marches, camera footprint), so this
 * component only reports its rectangle and forwards taps → camera jumps.
 */
export function MiniMapFrame({ engine, style }: { engine: React.MutableRefObject<MapEngine | null>; style?: object }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const rect = useRef({ x: 0, y: 0, w: MINIMAP_SIZE, h: MINIMAP_SIZE });
  const win = useRef({ x: 0, y: 0 });
  const viewRef = useRef<View>(null);
  useEffect(() => () => engine.current?.setMinimapRect(null), [engine]);
  const onLayout = (e: LayoutChangeEvent) => {
    const { x, y, width, height } = e.nativeEvent.layout;
    rect.current = { x, y, w: width, h: height };
    engine.current?.setMinimapRect(rect.current);
    viewRef.current?.measureInWindow((wx, wy) => {
      win.current = { x: wx, y: wy };
    });
  };
  return (
    <View ref={viewRef} style={[styles.frame, { borderColor: colors.borderStrong }, style]} onLayout={onLayout} testID="minimap">
      <Pressable
        style={styles.fill}
        accessibilityLabel={t("minimap")}
        testID="minimap-touch"
        onPress={(e) => {
          // RN Web does not always populate locationX/Y: fall back to page coordinates minus the frame's window origin
          const ne = e.nativeEvent as any;
          const lx = Number.isFinite(ne.locationX) ? ne.locationX : Number.isFinite(ne.pageX) ? ne.pageX - win.current.x : NaN;
          const ly = Number.isFinite(ne.locationY) ? ne.locationY : Number.isFinite(ne.pageY) ? ne.pageY - win.current.y : NaN;
          const w = engine.current?.minimapToWorld(rect.current.x + lx, rect.current.y + ly);
          if (w) engine.current?.centerOn(w.x, w.y);
        }}
      />
      <View style={[styles.tag, { backgroundColor: colors.glass }]}>
        <T style={[styles.tagText, { color: colors.onSurfaceSecondary }]}>N</T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { position: "absolute", width: MINIMAP_SIZE, height: MINIMAP_SIZE, borderWidth: 1, borderRadius: radius.md, overflow: "hidden" },
  fill: { flex: 1 },
  tag: { position: "absolute", top: 2, left: 4, paddingHorizontal: 4, borderRadius: radius.sm, pointerEvents: "none" },
  tagText: { fontFamily: fonts.body, fontSize: 9, fontWeight: "700" },
});
