import React, { memo } from "react";
import { StyleSheet, View } from "react-native";

import { T } from "@/src/components/ui";
import { fonts, radius, useTheme } from "@/src/theme";

import type { MapLabel } from "./engine";

/** Crisp RN text chips projected from the 3D scene (names/levels of visible settlements). */
export const MapLabels = memo(function MapLabels({ labels }: { labels: MapLabel[] }) {
  const { colors } = useTheme();
  return (
    <View style={styles.layer} testID="map-labels">
      {labels.map((l) => {
        const accent = l.faction === "OWN" ? colors.factionOwn : l.faction === "ENEMY" ? colors.factionEnemy : colors.factionNeutral;
        const isPlayer = l.kind === "PLAYER";
        return (
          <View key={l.id} style={[styles.chip, { left: l.x, top: l.y, borderColor: accent, backgroundColor: colors.glass, opacity: isPlayer ? 1 : 0.82 }]} testID={`map-label-${l.id}`}>
            <T numberOfLines={1} style={[styles.name, { color: isPlayer ? colors.onSurface : colors.onSurfaceSecondary }]}>
              {l.name}
            </T>
            <T style={[styles.level, { color: accent }]}>L{l.level}</T>
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  layer: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0, pointerEvents: "none" },
  chip: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    height: 20,
    borderRadius: radius.pill,
    borderWidth: 1,
    transform: [{ translateX: -40 }, { translateY: -22 }],
    maxWidth: 140,
  },
  name: { fontFamily: fonts.body, fontSize: 10, maxWidth: 96 },
  level: { fontFamily: fonts.body, fontSize: 10, fontWeight: "700" },
});
