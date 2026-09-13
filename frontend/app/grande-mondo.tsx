import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { serverNow } from "@/src/api/client";
import { type GmRegion, useGrandeMondo, useGrandeMondoAdmin } from "@/src/api/hooks";
import { Screen, Sheet, useToast } from "@/src/components/overlay";
import { BackButton } from "@/src/components/alliance/common";
import { Button, Chip, Empty, Icon, Loading, Panel, ProgressBar, Row, T } from "@/src/components/ui";
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
  war: { paddingHorizontal: 8, height: 22, borderRadius: radius.pill, backgroundColor: c.factionEnemy, justifyContent: "center" },
  warText: { color: c.onBrandSecondary, fontSize: 11, fontFamily: fonts.body, fontWeight: "600" },
  rule: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
}));

export default function GrandeMondoScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { show, showError } = useToast();
  const { worldId, world } = useGame();
  const gm = useGrandeMondo(worldId, world?.kind === "GRANDE_MONDO");
  const admin = useGrandeMondoAdmin(worldId || "");
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

  // ---- administrator draft (regions admitted to the next war + interregional speed) ----
  const [draftRegions, setDraftRegions] = useState<string[] | null | undefined>(undefined);
  const [draftSpeed, setDraftSpeed] = useState<number | undefined>(undefined);
  const [confirm, setConfirm] = useState<"WAR" | "ISOLATION" | null>(null);
  const regions = useMemo(() => (draftRegions === undefined ? (d?.next_war.regions ?? null) : draftRegions), [draftRegions, d?.next_war.regions]);
  const speed = draftSpeed ?? d?.next_war.speed_multiplier ?? 1;
  const allCodes = d?.regions.map((r) => r.code) ?? [];
  const toggleRegion = (code: string) => {
    const cur = regions ?? allCodes;
    const next = cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code];
    setDraftRegions(next.length >= allCodes.length ? null : next);
  };
  const saveWar = () => {
    if (regions && regions.length < 2) {
      show(t("gmMinTwo"), "error");
      return;
    }
    admin.warConfig
      .mutateAsync({ regions, speed_multiplier: speed })
      .then(() => {
        show(t("gmSaved"), "success");
        setDraftRegions(undefined);
        setDraftSpeed(undefined);
      })
      .catch(showError);
  };
  const forcePhase = async (to: "WAR" | "ISOLATION") => {
    try {
      if (to === "WAR") await admin.warConfig.mutateAsync({ regions, speed_multiplier: speed }); // the draft becomes the war's setting
      await admin.phase.mutateAsync(to);
      setConfirm(null);
      setDraftRegions(undefined);
      setDraftSpeed(undefined);
    } catch (e) {
      showError(e);
    }
  };

  const showOnMap = (x: number, y: number) => router.push({ pathname: "/(tabs)/map", params: { fx: String(x), fy: String(y), ft: String(Date.now()) } });
  const warLabel = (cfg: { regions: string[] | null; speed_multiplier: number } | null | undefined) => (cfg ? `${cfg.regions ? cfg.regions.map(regionFlag).join(" ") : t("gmWarAll")} · ×${cfg.speed_multiplier}` : "—");

  return (
    <Screen title={t("gmTitle")} left={<BackButton testID="grande-mondo-back" />} testID="grande-mondo-screen">
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
                <T v="caption" testID="gm-war-summary">
                  {war ? t("gmCurrentWar") : t("gmNextWar")}: {warLabel(war ? d.war : d.next_war)}
                  {war && d.my_fog_up ? ` · ${t("gmNotAtWar")}` : ""}
                </T>
                {d.view_all ? (
                  <T v="caption" style={{ color: colors.brandPrimary }} testID="gm-observer">
                    {t("gmObserver")}
                  </T>
                ) : null}
                {d.center ? <Button title={`${t("gmCenterPyramid")} · ${t("gmShowOnMap")}`} icon="pyramid" variant="secondary" onPress={() => showOnMap(d.center!.pyramid_anchor[0], d.center!.pyramid_anchor[1])} testID="gm-center-pyramid" /> : null}
              </Panel>
              {d.is_admin ? (
                <Panel style={s.card} testID="gm-admin">
                  <Row>
                    <Icon name="shield-crown" size={20} color={colors.brandPrimary} />
                    <T v="heading" style={{ flex: 1 }}>
                      {t("gmAdminTitle")}
                    </T>
                  </Row>
                  <T v="caption">{t("gmAdminHint")}</T>
                  <T v="label">{t("gmWarRegions")}</T>
                  <View style={s.chips}>
                    <Chip label={t("gmWarAll")} selected={regions === null} onPress={() => setDraftRegions(null)} testID="gm-admin-region-ALL" />
                    {d.regions.map((r) => (
                      <Chip key={r.code} label={`${regionFlag(r.code)} ${r.code}`} selected={regions === null || regions.includes(r.code)} onPress={() => toggleRegion(r.code)} testID={`gm-admin-region-${r.code}`} />
                    ))}
                  </View>
                  <T v="label">{t("gmWarSpeed")}</T>
                  <View style={s.chips}>
                    {d.speed_multipliers.map((m) => (
                      <Chip key={m} label={`×${m}`} selected={speed === m} onPress={() => setDraftSpeed(m)} testID={`gm-admin-speed-${m}`} />
                    ))}
                  </View>
                  <Button title={t("gmSaveWar")} icon="content-save" onPress={saveWar} loading={admin.warConfig.isPending} testID="gm-admin-save" />
                  {war ? (
                    <Button title={t("gmRaiseFog")} icon="weather-fog" variant="secondary" onPress={() => setConfirm("ISOLATION")} testID="gm-admin-raise-fog" />
                  ) : (
                    <Button title={t("gmDropFog")} icon="sword-cross" variant="secondary" onPress={() => setConfirm("WAR")} testID="gm-admin-drop-fog" />
                  )}
                </Panel>
              ) : null}
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
          renderItem={({ item: r }) => {
            const reachable = !d.my_fog_up || d.view_all || r.code === d.my_region || (war && r.at_war && !d.my_fog_up);
            return (
              <Pressable style={[s.regionRow, { marginHorizontal: spacing.md }]} onPress={() => showOnMap(r.center[0], r.center[1])} disabled={!reachable} testID={`gm-region-${r.code}`}>
                <T style={s.flag}>{regionFlag(r.code)}</T>
                <View style={{ flex: 1 }}>
                  <Row style={{ gap: 6 }}>
                    <T v="body">{tDyn(t, `region_${r.code}`, r.name)}</T>
                    {r.code === d.my_region ? (
                      <View style={s.mine} testID="gm-my-region">
                        <T style={s.mineText}>{t("gmYourRegion")}</T>
                      </View>
                    ) : null}
                    {r.at_war ? (
                      <View style={s.war} testID={`gm-region-war-${r.code}`}>
                        <T style={s.warText}>{t("gmWarChip")}</T>
                      </View>
                    ) : null}
                  </Row>
                  <T v="caption">
                    {tDyn(t, langKey(r.lang), r.lang)} · {r.player_count}/{r.player_slots} {t("gmPlayers")}
                  </T>
                </View>
                <Icon name={reachable ? "map-marker-radius" : "weather-fog"} size={20} color={reachable ? colors.onSurfaceSecondary : colors.muted} />
              </Pressable>
            );
          }}
        />
      )}
      <Sheet visible={!!confirm} onClose={() => setConfirm(null)} title={confirm === "WAR" ? t("gmDropFog") : t("gmRaiseFog")} testID="gm-admin-confirm-sheet">
        <T v="body">{confirm === "WAR" ? t("gmConfirmDropFog") : t("gmConfirmRaiseFog")}</T>
        {confirm === "WAR" ? <T v="caption">{warLabel({ regions, speed_multiplier: speed })}</T> : null}
        <Row style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <Button title={t("cancel")} variant="secondary" onPress={() => setConfirm(null)} style={{ flex: 1 }} testID="gm-admin-confirm-cancel" />
          <Button title={t("confirm")} onPress={() => confirm && forcePhase(confirm)} loading={admin.phase.isPending} style={{ flex: 1 }} testID="gm-admin-confirm-button" />
        </Row>
      </Sheet>
    </Screen>
  );
}
