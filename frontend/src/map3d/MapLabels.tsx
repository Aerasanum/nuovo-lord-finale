import React, { memo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Countdown, Icon, T } from "@/src/components/ui";
import { useI18n } from "@/src/i18n";
import { fonts, radius, useTheme } from "@/src/theme";

import type { MapLabel } from "./engine";

export function missionLabel(mission: string, t: (k: any) => string): string {
  const key = ({ ATTACK: "missionAttack", RAID: "missionRaid", CONQUEST: "missionConquest", REINFORCE: "missionReinforce", GARRISON: "missionGarrison", CARAVAN: "missionCaravan", INTERCEPT: "missionIntercept" } as Record<string, string>)[mission];
  return key ? t(key) : mission;
}

/** Crisp RN text chips projected from the 3D scene: settlement names/levels and marching armies with live ETA. */
export const MapLabels = memo(function MapLabels({ labels }: { labels: MapLabel[] }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [width, setWidth] = useState(0);
  // absolutely positioned chips shrink-to-fit against the right edge (web): keep them fully on screen instead
  const clampX = (x: number, lo: number, hi: number) => (width ? Math.max(lo, Math.min(width - hi, x)) : x);
  return (
    <View style={styles.layer} testID="map-labels" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {labels.map((l) => {
        const accent = l.faction === "OWN" ? colors.factionOwn : l.faction === "ENEMY" ? colors.factionEnemy : l.faction === "ALLY" ? colors.factionAlly : colors.factionNeutral;
        if (l.kind === "MARCH") {
          const returning = l.status === "RETURNING";
          return (
            <View key={l.id} style={[styles.chip, styles.march, { left: clampX(l.x, 60, 112), top: l.y, borderColor: accent, backgroundColor: colors.glass }]} testID={`map-label-${l.id}`}>
              <Icon name={returning ? "undo-variant" : "sword-cross"} size={11} color={accent} />
              <T numberOfLines={1} style={[styles.name, { color: colors.onSurface }]}>
                {returning ? t("returning") : missionLabel(l.name, t)}
              </T>
              {l.endsAt ? (
                <Countdown endsAt={l.endsAt} style={[styles.level, { color: accent }]} />
              ) : (
                <T style={[styles.level, { color: accent }]}>?</T>
              )}
            </View>
          );
        }
        const isPlayer = l.kind === "PLAYER";
        if (l.kind === "PYRAMID") {
          const awake = l.status === "OPEN" || l.status === "REWARD_LOCK";
          return (
            <View key={l.id} style={[styles.chip, styles.pyramid, { left: clampX(l.x, 70, 130), top: l.y, borderColor: awake ? accent : colors.borderStrong, backgroundColor: colors.glass }]} testID="map-label-pyramid">
              <Icon name="pyramid" size={12} color={awake ? colors.brandPrimary : colors.muted} />
              <T numberOfLines={1} style={[styles.name, { color: colors.onSurface, fontWeight: "700" }]}>
                {l.name}
              </T>
              {l.endsAt ? <Countdown endsAt={l.endsAt} style={[styles.level, { color: accent }]} /> : <T style={[styles.level, { color: accent }]}>{t(l.status === "OPEN" ? "pyramidOpenShort" : "pyramidDormantShort")}</T>}
            </View>
          );
        }
        return (
          <View key={l.id} style={[styles.chip, { left: clampX(l.x, 40, 100), top: l.y, borderColor: accent, backgroundColor: colors.glass, opacity: isPlayer ? 1 : 0.82 }]} testID={`map-label-${l.id}`}>
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
  march: { maxWidth: 170, transform: [{ translateX: -60 }, { translateY: -46 }] },
  pyramid: { maxWidth: 200, height: 24, transform: [{ translateX: -70 }, { translateY: -30 }] },
  name: { fontFamily: fonts.body, fontSize: 10, maxWidth: 96 },
  level: { fontFamily: fonts.body, fontSize: 10, fontWeight: "700" },
});
