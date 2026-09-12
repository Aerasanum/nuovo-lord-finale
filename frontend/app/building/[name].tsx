import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBuildings, useSettlementMutations } from "@/src/api/hooks";
import { FinishNowButton } from "@/src/components/FinishNow";
import { Screen, useToast } from "@/src/components/overlay";
import { Button, CostRow, Countdown, Icon, Loading, Panel, ProgressBar, Row, StatePill, T } from "@/src/components/ui";
import { formatDuration, tDyn, unlockLine, useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles(() => ({
  content: { padding: spacing.md, gap: spacing.md },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  kv: { flexDirection: "row", justifyContent: "space-between" },
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
            <Row style={{ justifyContent: "space-between" }}>
              <View style={{ flex: 1 }}>
                <T v="caption">{tDyn(t, `buildingCategory_${b.category}`, b.category)}</T>
                <T v="body">{b.purpose}</T>
              </View>
              <StatePill state={b.state} testID="building-state" />
            </Row>
            <View style={{ marginTop: spacing.sm, gap: 6 }}>
              <View style={s.kv}>
                <T v="label">{t("level")}</T>
                <T v="mono" testID="building-level">
                  {b.level} / {b.max_level}
                </T>
              </View>
              <ProgressBar value={b.level / b.max_level} />
              <View style={s.kv}>
                <T v="label">{t("settlementLevel")}</T>
                <T v="mono">{settlement.data?.level}</T>
              </View>
            </View>
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
              <T v="heading">
                {t("nextLevel")} {b.next.level}
              </T>
              <View style={{ marginTop: spacing.sm, gap: 6 }}>
                <T v="label">{t("cost")}</T>
                <CostRow cost={b.next.cost} missing={b.missing} testID="building-next-cost" />
                <View style={s.kv}>
                  <T v="label">{t("time")}</T>
                  <T v="mono">
                    {formatDuration(b.next.duration_min * 60)}
                    {b.next.fast_applied ? " · FAST (×0.7 / ×0.5)" : ""}
                    {b.next.research_time_reduction ? ` · -${Math.round(b.next.research_time_reduction * 100)}%` : ""}
                  </T>
                </View>
                {b.next.fast_applied ? (
                  <T v="caption">
                    base {formatDuration(b.next.base_time_min * 60)} · {Object.values(b.next.base_cost).join("/")}
                  </T>
                ) : null}
                {b.state === "LOCKED" ? (
                  <T v="caption" style={{ color: colors.warning }}>
                    {unlockLine(t, b.unlock)}
                  </T>
                ) : null}
                {b.state === "BLOCKED_SETTLEMENT_LEVEL" ? (
                  <T v="caption" style={{ color: colors.warning }}>
                    {t("blockedLevel")}: L{b.next.level}
                  </T>
                ) : null}
                <Button title={b.level === 0 ? t("build") : t("upgrade")} icon="hammer" disabled={b.state !== "AVAILABLE"} loading={m.upgradeBuilding.isPending} onPress={upgrade} testID="building-upgrade-button" />
              </View>
            </Panel>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}
