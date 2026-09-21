import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { serverNow } from "@/src/api/client";
import { type GmRegion, type PyramidSummary, useGrandeMondo, useGrandeMondoAdmin } from "@/src/api/hooks";
import { Screen, Sheet, useToast } from "@/src/components/overlay";
import { BackButton } from "@/src/components/alliance/common";
import { PyramidStatePill, pyramidName } from "@/src/components/PyramidCard";
import { Button, Chip, Countdown, Empty, Icon, Loading, Panel, ProgressBar, Row, T } from "@/src/components/ui";
import { formatCountdown, langKey, regionFlag, secondsLeft } from "@/src/game/grandeMondo";
import { fmt, tDyn, useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { focusOnMap } from "@/src/utils/mapFocus";

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
  pyrRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 8 },
  pyrIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.borderStrong },
  daysInput: { minWidth: 72, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceTertiary, color: c.onSurface, paddingHorizontal: spacing.sm, fontFamily: fonts.body, fontSize: 16, textAlign: "center" },
  winRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6 },
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

  const showOnMap = (x: number, y: number) => focusOnMap(router, x, y);
  const warLabel = (cfg: { regions: string[] | null; speed_multiplier: number } | null | undefined) => (cfg ? `${cfg.regions ? cfg.regions.map(regionFlag).join(" ") : t("gmWarAll")} · ×${cfg.speed_multiplier}` : "—");

  // ---- Pyramids: my Piccola Piramide + the Grande Piramide; admin: open/close the Grande, tune the Piccole ----
  const grand = d?.grand_pyramid ?? null;
  const mine = d?.my_pyramid ?? null;
  const pyramidOf = (code: string) => d?.pyramids?.find((p) => p.kind === "REGIONAL" && p.region_code === code) ?? null;
  const [daysDraft, setDaysDraft] = useState<string | undefined>(undefined);
  const [scope, setScope] = useState<string | null>(null); // null = every region
  const days = daysDraft ?? String(d?.regional_first_open_day ?? 90);
  const saveRegionalDays = () => {
    const n = Number(days.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) {
      show(t("gmInvalidDays"), "error");
      return;
    }
    admin.regionalPyramidConfig
      .mutateAsync({ region: scope, config: { first_open_day: n } })
      .then(() => {
        show(t("gmSaved"), "success");
        setDaysDraft(undefined);
      })
      .catch(showError);
  };
  const grandAction = (action: "OPEN" | "CLOSE") =>
    admin.grandPyramid
      .mutateAsync(action)
      .then(() => show(t(action === "OPEN" ? "gmGrandOpened" : "gmGrandClosed"), "success"))
      .catch(showError);
  const pyramidRow = (p: PyramidSummary, testID: string) => (
    <Pressable style={s.pyrRow} onPress={() => router.push({ pathname: "/pyramid", params: { id: p.id } })} testID={testID}>
      <View style={s.pyrIcon}>
        <Icon name="pyramid" size={22} color={p.faction === "OWN" ? colors.factionOwn : p.faction === "ENEMY" ? colors.factionEnemy : colors.brandPrimary} />
      </View>
      <View style={{ flex: 1 }}>
        <T v="body" numberOfLines={1}>
          {pyramidName(t, p)}
          {p.owner ? ` · [${p.owner.tag}]${p.owner.region_code ? ` ${regionFlag(p.owner.region_code)}` : ""}` : ""}
        </T>
        <Row style={{ gap: 6 }}>
          <T v="caption">{p.state === "OPEN" && p.hold_deadline ? t("pyramidHoldEnds") : p.state === "REWARD_LOCK" ? t("pyramidLockEnds") : p.state === "DORMANT_INITIAL" || p.state === "DORMANT" ? (p.manual_open ? t("gmGrandWaitsAdmin") : t("pyramidOpensIn")) : t("pyramidGuardian")}</T>
          {p.state === "OPEN" && p.hold_deadline ? <Countdown endsAt={p.hold_deadline} style={{ color: colors.brandPrimary }} /> : p.deadline ? <Countdown endsAt={p.deadline} style={{ color: colors.onSurface }} /> : null}
        </Row>
      </View>
      <PyramidStatePill dto={p} />
      <Icon name="chevron-right" size={18} color={colors.muted} />
    </Pressable>
  );

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
              {mine || grand ? (
                <Panel style={s.card} testID="gm-pyramids">
                  <Row>
                    <Icon name="pyramid" size={20} color={colors.brandPrimary} />
                    <T v="heading" style={{ flex: 1 }}>
                      {t("gmPyramidsTitle")}
                    </T>
                  </Row>
                  <T v="caption">{t("gmPyramidsHint")}</T>
                  {mine ? pyramidRow(mine, "gm-my-pyramid") : null}
                  {grand ? pyramidRow(grand, "gm-grand-pyramid") : null}
                  {d.grand_wins?.length ? (
                    <>
                      <T v="label" style={{ marginTop: spacing.xs }}>
                        {t("gmGrandWinners")}
                      </T>
                      {d.grand_wins.slice(0, 5).map((w) => (
                        <View key={`${w.cycle_id}-${w.at}`} style={s.winRow} testID={`gm-grand-win-${w.cycle_id}`}>
                          <Icon name="crown" size={16} color={colors.brandPrimary} />
                          <T v="caption" style={{ flex: 1 }}>
                            {w.region_code ? `${regionFlag(w.region_code)} ${w.region_code} · ` : ""}[{w.tag}] {w.name} · {t("gmCycle")} {w.gm_cycle}
                          </T>
                        </View>
                      ))}
                    </>
                  ) : null}
                </Panel>
              ) : null}
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
                  {grand ? (
                    <>
                      <T v="label" style={{ marginTop: spacing.xs }}>
                        {t("gmCenterPyramid")} · {t(`pyrState_${grand.state}` as any)}
                      </T>
                      <T v="caption">{t("gmGrandAdminHint")}</T>
                      {grand.state === "OPEN" || grand.state === "REWARD_LOCK" ? (
                        <Button title={t("gmGrandClose")} icon="lock" variant="secondary" onPress={() => grandAction("CLOSE")} loading={admin.grandPyramid.isPending} disabled={grand.state !== "OPEN"} testID="gm-admin-grand-close" />
                      ) : (
                        <Button title={t("gmGrandOpen")} icon="fire" onPress={() => grandAction("OPEN")} loading={admin.grandPyramid.isPending} disabled={!war} testID="gm-admin-grand-open" />
                      )}
                      {!war && grand.state !== "OPEN" ? <T v="caption">{t("gmGrandNeedsWar")}</T> : null}
                    </>
                  ) : null}
                  <T v="label" style={{ marginTop: spacing.xs }}>
                    {t("gmRegionalPyramidsAdmin")}
                  </T>
                  <T v="caption">{t("gmRegionalPyramidsAdminHint")}</T>
                  <View style={s.chips}>
                    <Chip label={t("gmWarAll")} selected={scope === null} onPress={() => setScope(null)} testID="gm-admin-pyr-scope-ALL" />
                    {d.regions.map((r) => (
                      <Chip key={r.code} label={`${regionFlag(r.code)} ${r.code}`} selected={scope === r.code} onPress={() => setScope(r.code)} testID={`gm-admin-pyr-scope-${r.code}`} />
                    ))}
                  </View>
                  <Row style={{ gap: spacing.sm }}>
                    <T v="body" style={{ flex: 1 }}>
                      {t("gmFirstOpenDay")}
                    </T>
                    <TextInput value={days} onChangeText={setDaysDraft} keyboardType="decimal-pad" style={s.daysInput} testID="gm-admin-pyr-days" />
                    <Button title={t("gmApply")} icon="check" onPress={saveRegionalDays} loading={admin.regionalPyramidConfig.isPending} testID="gm-admin-pyr-save" />
                  </Row>
                </Panel>
              ) : null}
              <Panel style={s.card} testID="gm-rules">
                <T v="heading">{t("gmRulesTitle")}</T>
                {[
                  ["weather-fog", fmt(t("gmRule1"), { days: d.isolation_days })],
                  ["sword-cross", fmt(t("gmRule2"), { days: d.war_days })],
                  ["pyramid", fmt(t("gmRule3"), { hours: d.pyramid_hold_hours })],
                  ["pyramid", fmt(t("gmRule4"), { day: d.regional_first_open_day ?? 90 })],
                ].map(([icon, text]) => (
                  <View key={text} style={s.rule}>
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
            const rp = pyramidOf(r.code);
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
                    {rp ? ` · ${t("pyramidSmall")}: ${t(`pyrState_${rp.state}` as any)}${rp.owner?.tag ? ` [${rp.owner.tag}]` : ""}` : ""}
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
