import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBuildings, useSettlementMutations } from "@/src/api/hooks";
import { FinishNowButton } from "@/src/components/FinishNow";
import { Screen, useToast } from "@/src/components/overlay";
import { MythicPanel } from "@/src/components/MythicPanel";
import { Button, CostRow, Countdown, Icon, Loading, Panel, ProgressBar, Row, StatePill, T } from "@/src/components/ui";
import { buildingIcon, currentBenefits } from "@/src/game/buildings";
import { formatDuration, tDyn, unlockLine, useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  content: { padding: spacing.md, gap: spacing.md },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  kv: { flexDirection: "row", justifyContent: "space-between" },
  hero: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  heroIcon: { width: 72, height: 72, borderRadius: radius.lg, backgroundColor: c.brandTertiary, borderWidth: 1, borderColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  levelRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  levelBox: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border },
  levelBoxNext: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  levelNum: { fontSize: 24, fontWeight: "800", color: c.onSurface },
  tiles: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  tile: { flexGrow: 1, minWidth: 100, flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border },
  reqRow: { flexDirection: "row", alignItems: "center", gap: 6 },
}));

export default function BuildingDetail() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { name } = useLocalSearchParams<{ name: string }>();
  const { worldId, settlementId, settlement } = useGame();
  const buildings = useBuildings(worldId, settlementId);
  const m = useSettlementMutations(worldId ?? "", settlementId ?? "");
  const { showError, show } = useToast();
  const b = buildings.data?.buildings.find((x) => x.name === name);
  if (!worldId || !settlementId) return null;

  const upgrade = () =>
    m.upgradeBuilding
      .mutateAsync(name!)
      .then(() => {
        show(`${name} → L${(b?.level ?? 0) + 1}`, "success");
        router.back();
      })
      .catch(showError);
  const benefits = b ? currentBenefits(b, settlement.data, t) : [];
  const settlementLevel = settlement.data?.level ?? 0;

  return (
    <Screen
      title={name}
      testID="building-detail-screen"
      left={
        <Pressable style={s.back} onPress={() => router.back()} testID="building-back-button">
          <Icon name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
      }
    >
      {!b ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Panel>
            <View style={s.hero}>
              <View style={s.heroIcon}>
                <Icon name={buildingIcon(b)} size={38} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <T v="caption">{tDyn(t, `buildingCategory_${b.category}`, b.category)}</T>
                <T v="body">{b.purpose}</T>
                <StatePill state={b.state} testID="building-state" />
              </View>
            </View>
            {/* current → next level */}
            <View style={s.levelRow}>
              <View style={s.levelBox}>
                <T v="caption">{t("level")}</T>
                <T style={s.levelNum} testID="building-level">
                  {b.level}
                </T>
              </View>
              <Icon name="arrow-right-bold" size={26} color={b.next && b.state !== "MAXED" ? colors.brandPrimary : colors.muted} />
              <View style={[s.levelBox, b.next && b.state !== "MAXED" && s.levelBoxNext]}>
                <T v="caption">{t("nextLevel")}</T>
                <T style={[s.levelNum, b.next && b.state !== "MAXED" && { color: colors.onBrandTertiary }]}>{b.next && b.state !== "MAXED" ? b.next.level : "—"}</T>
              </View>
              <View style={s.levelBox}>
                <T v="caption">Max</T>
                <T style={s.levelNum}>{b.max_level}</T>
              </View>
            </View>
            <View style={{ marginTop: spacing.sm }}>
              <ProgressBar value={b.level / b.max_level} />
            </View>
            {benefits.length ? (
              <View style={[s.tiles, { marginTop: spacing.sm }]} testID="building-benefits">
                {benefits.map((x) => (
                  <View key={x.label} style={s.tile}>
                    <Icon name={x.icon} size={20} color={colors.success} />
                    <View>
                      <T v="caption">{x.label}</T>
                      <T v="mono">{x.value}</T>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </Panel>

          {b.job ? (
            <Panel testID="building-job">
              <T v="heading">
                {t("inProgress")} → L{b.job.target_level}
              </T>
              <Row style={{ justifyContent: "space-between", marginTop: spacing.sm }}>
                <Countdown endsAt={b.job.ends_at} />
                <FinishNowButton job={b.job} />
                <Button title={t("cancel")} variant="danger" onPress={() => m.cancelJob.mutateAsync(b.job!.job_id).then(() => router.back()).catch(showError)} testID="building-cancel-button" />
              </Row>
              <T v="caption" style={{ marginTop: 6 }}>
                {t("cost")}: <CostRow cost={b.job.cost_snapshot} /> · 70% refund
              </T>
            </Panel>
          ) : b.next && b.state !== "MAXED" ? (
            <Panel testID="building-next">
              <Row style={{ justifyContent: "space-between" }}>
                <T v="heading">
                  {t("nextLevel")} {b.next.level}
                </T>
                <Row style={{ gap: 6 }}>
                  <Icon name="clock-outline" size={16} color={colors.brandPrimary} />
                  <T v="mono">{formatDuration(b.next.duration_min * 60)}</T>
                </Row>
              </Row>
              <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
                <T v="label">{t("requirements")}</T>
                <View style={s.reqRow}>
                  <Icon name={b.unlock.level_ok && b.state !== "BLOCKED_SETTLEMENT_LEVEL" ? "check-circle" : "close-circle"} size={16} color={b.state === "BLOCKED_SETTLEMENT_LEVEL" || !b.unlock.level_ok ? colors.error : colors.success} />
                  <T v="caption">
                    {t("settlementLevel")} {b.state === "BLOCKED_SETTLEMENT_LEVEL" ? `≥ ${b.next.level}` : b.mythic ? `≥ ${b.unlock.min_settlement_level}` : settlementLevel}
                  </T>
                </View>
                {b.mythic && !b.mythic.is_mother ? (
                  <T v="caption" style={{ color: colors.warning }} testID="building-mother-only">
                    {t("motherOnly")}
                  </T>
                ) : null}
                {b.unlock.required_research_key ? (
                  <View style={s.reqRow}>
                    <Icon name={b.unlock.research_ok ? "check-circle" : "close-circle"} size={16} color={b.unlock.research_ok ? colors.success : colors.error} />
                    <T v="caption">
                      {t("research")}: {b.unlock.required_research_name ?? b.unlock.required_research_key}
                    </T>
                  </View>
                ) : null}
                {b.state === "LOCKED" ? (
                  <T v="caption" style={{ color: colors.warning }}>
                    {unlockLine(t, b.unlock)}
                  </T>
                ) : null}
                <T v="label">{t("cost")}</T>
                <CostRow cost={b.next.cost} missing={b.missing} testID="building-next-cost" />
                {b.next.fast_applied || b.next.research_time_reduction ? (
                  <T v="caption">
                    {t("time")}: {formatDuration(b.next.duration_min * 60)}
                    {b.next.fast_applied ? ` · ⚡ ${t("fastBuild")} (${formatDuration(b.next.base_time_min * 60)} → ${formatDuration(b.next.duration_min * 60)})` : ""}
                    {b.next.research_time_reduction ? ` · -${Math.round(b.next.research_time_reduction * 100)}%` : ""}
                  </T>
                ) : null}
                <Button title={b.level === 0 ? t("build") : `${t("upgrade")} → L${b.next.level}`} icon="hammer" disabled={b.state !== "AVAILABLE"} loading={m.upgradeBuilding.isPending} onPress={upgrade} testID="building-upgrade-button" />
              </View>
            </Panel>
          ) : null}
          {b.name === "Santuario Mitico" && worldId ? <MythicPanel b={b} worldId={worldId} isMother={!!b.mythic?.is_mother} /> : null}
        </ScrollView>
      )}
    </Screen>
  );
}
