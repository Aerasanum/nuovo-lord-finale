import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { serverNow } from "@/src/api/client";
import { type GmRegion, useGrandeMondo } from "@/src/api/hooks";
import { Screen } from "@/src/components/overlay";
import { Button, Empty, Icon, Loading, Panel, ProgressBar, Row, T } from "@/src/components/ui";
import { formatCountdown, langKey, regionFlag, secondsLeft } from "@/src/game/grandeMondo";
import { fmt, tDyn, useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  card: { marginHorizontal: spacing.md, marginBottom: spacing.sm, gap: spacing.sm },
  phaseRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  countdown: { fontFamily: fonts.display, fontSize: 30, color: c.brandPrimary },
  pill: { paddingHorizontal: 10, height: 26, borderRadius: radius.pill, justifyContent: "center", borderWidth: 1 },
  pillFog: { backgroundColor: c.surfaceTertiary, borderColor: c.borderStrong },
  pillWar: { backgroundColor: c.factionEnemy, borderColor: c.factionEnemy },
  regionRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.divider },
  flag: { fontSize: 26, width: 36, textAlign: "center" },
  mine: { paddingHorizontal: 8, height: 22, borderRadius: radius.pill, backgroundColor: c.success, justifyContent: "center" },
  mineText: { color: c.onSuccess, fontSize: 11, fontFamily: fonts.body, fontWeight: "600" },
  rule: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
}));

export default function GrandeMondoScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { worldId, world } = useGame();
  const gm = useGrandeMondo(worldId, world?.kind === "GRANDE_MONDO");
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const iv = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(iv);
  }, []);
  const d = gm.data;
  const left = secondsLeft(d, now);
  const war = d?.phase === "WAR";
  const total = d ? (war ? d.war_days : d.isolation_days) * 86400 : 0;
  const progress = d && left != null && total > 0 ? Math.min(1, Math.max(0, 1 - left / total)) : 0;

  const showOnMap = (x: number, y: number) => router.push({ pathname: "/(tabs)/map", params: { fx: String(x), fy: String(y), ft: String(Date.now()) } });

  return (
    <Screen title={t("gmTitle")} testID="grande-mondo-screen">
      {gm.isLoading ? (
        <Loading />
      ) : !d ? (
        <Empty icon="earth-off" title={t("gmTitle")} subtitle={t("error")} />
      ) : (
        <FlatList
          data={d.regions}
          keyExtractor={(r: GmRegion) => r.code}
          contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: insets.bottom + spacing.lg }}
          ListHeaderComponent={
            <>
              <Panel style={s.card} testID="gm-phase-card">
                <View style={s.phaseRow}>
                  <Icon name={war ? "sword-cross" : "weather-fog"} size={26} color={war ? colors.factionEnemy : colors.brandPrimary} />
                  <T v="heading" style={{ flex: 1 }} testID="gm-phase-title">
                    {war ? t("gmPhaseWar") : t("gmPhaseIsolation")}
                  </T>
                  <View style={[s.pill, war ? s.pillWar : s.pillFog]} testID="gm-phase-pill">
                    <T v="caption" style={war ? { color: colors.onBrandSecondary } : undefined}>
                      {t("gmCycle")} {d.cycle}
                    </T>
                  </View>
                </View>
                <T v="caption">{war ? t("gmWarEndsIn") : t("gmFogFallsIn")}</T>
                <T style={s.countdown} testID="gm-countdown">
                  {formatCountdown(left)}
                </T>
                <ProgressBar value={progress} color={war ? colors.factionEnemy : colors.brandPrimary} />
                {d.center ? <Button title={`${t("gmCenterPyramid")} · ${t("gmShowOnMap")}`} icon="pyramid" variant="secondary" onPress={() => showOnMap(d.center!.pyramid_anchor[0], d.center!.pyramid_anchor[1])} testID="gm-center-pyramid" /> : null}
              </Panel>
              <Panel style={s.card} testID="gm-rules">
                <T v="heading">{t("gmRulesTitle")}</T>
                {[
                  ["weather-fog", fmt(t("gmRule1"), { days: d.isolation_days })],
                  ["sword-cross", fmt(t("gmRule2"), { days: d.war_days })],
                  ["pyramid", fmt(t("gmRule3"), { hours: d.pyramid_hold_hours })],
                ].map(([icon, text]) => (
                  <View key={icon} style={s.rule}>
                    <Icon name={icon as any} size={18} color={colors.brandPrimary} />
                    <T v="caption" style={{ flex: 1 }}>
                      {text}
                    </T>
                  </View>
                ))}
              </Panel>
              <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.xs }}>
                <T v="heading">
                  {t("gmRegions")} · {d.regions.length}
                </T>
              </View>
            </>
          }
          renderItem={({ item: r }) => (
            <Pressable style={[s.regionRow, { marginHorizontal: spacing.md }]} onPress={() => showOnMap(r.center[0], r.center[1])} disabled={d.fog_up && r.code !== d.my_region} testID={`gm-region-${r.code}`}>
              <T style={s.flag}>{regionFlag(r.code)}</T>
              <View style={{ flex: 1 }}>
                <Row style={{ gap: 6 }}>
                  <T v="body">{tDyn(t, `region_${r.code}`, r.name)}</T>
                  {r.code === d.my_region ? (
                    <View style={s.mine} testID="gm-my-region">
                      <T style={s.mineText}>{t("gmYourRegion")}</T>
                    </View>
                  ) : null}
                </Row>
                <T v="caption">
                  {tDyn(t, langKey(r.lang), r.lang)} · {r.player_count}/{r.player_slots} {t("gmPlayers")}
                </T>
              </View>
              {!d.fog_up || r.code === d.my_region ? <Icon name="map-marker-radius" size={20} color={colors.onSurfaceSecondary} /> : <Icon name="weather-fog" size={20} color={colors.muted} />}
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}
