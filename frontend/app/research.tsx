import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { ResearchEntry } from "@/src/api/hooks";
import { useResearch, useSettlementMutations } from "@/src/api/hooks";
import { FinishNowButton } from "@/src/components/FinishNow";
import { Screen, Sheet, useToast } from "@/src/components/overlay";
import { branchIcon, ResearchTree, unlockOf } from "@/src/components/ResearchTree";
import { Button, Chip, chipRowStyles, CostRow, Countdown, Icon, Loading, Row, StatePill, T } from "@/src/components/ui";
import { formatDuration, useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  node: { marginHorizontal: spacing.md, marginBottom: spacing.sm, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: spacing.sm, gap: 6 },
  nodeAvail: { borderColor: c.brandSecondary },
  lvl: { paddingHorizontal: 8, height: 24, borderRadius: radius.pill, backgroundColor: c.brandTertiary, justifyContent: "center" },
  lvlText: { color: c.onBrandTertiary, fontSize: 12, fontWeight: "700" },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  summary: { paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  branchHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.xs },
  reqRow: { flexDirection: "row", alignItems: "center", gap: 6 },
}));

export default function ResearchScreen() {
  const s = useStyles();
  const cs = chipRowStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { worldId, settlementId, settlement } = useGame();
  const research = useResearch(worldId, settlementId);
  const m = useSettlementMutations(worldId ?? "", settlementId ?? "");
  const { showError, show } = useToast();
  const [branch, setBranch] = useState<string>("Economia");
  const [pick, setPick] = useState<ResearchEntry | null>(null);

  const nodes = useMemo(() => {
    const all = research.data?.nodes ?? [];
    const filtered = branch === "ALL" ? all : all.filter((n) => n.branch === branch);
    const order: Record<string, number> = { IN_PROGRESS: 0, AVAILABLE: 1, BLOCKED_RESOURCES: 2, BLOCKED_QUEUE: 3, LOCKED: 4, MAXED: 5 };
    return [...filtered].sort((a, b) => (order[a.state] ?? 9) - (order[b.state] ?? 9));
  }, [research.data, branch]);
  const branchNodes = useMemo(() => (research.data?.nodes ?? []).filter((n) => n.branch === branch), [research.data, branch]);
  const branchDone = branchNodes.reduce((a, n) => a + n.level, 0);
  const branchMax = branchNodes.reduce((a, n) => a + n.max_level, 0);

  if (!worldId || !settlementId) return null;
  const start = async () => {
    if (!pick) return;
    try {
      await m.startResearch.mutateAsync(pick.key);
      show(`${t("research")}: ${pick.name}`, "success");
      setPick(null);
    } catch (e) {
      showError(e);
    }
  };
  const uni = settlement.data?.buildings?.Universita ?? 0;

  return (
    <Screen
      title={t("research")}
      testID="research-screen"
      left={
        <Pressable style={s.back} onPress={() => router.back()} testID="research-back-button">
          <Icon name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
      }
      right={
        <T v="caption" testID="research-queues">
          {research.data ? `${research.data.active}/${research.data.queues}` : ""} · Uni L{uni}
        </T>
      }
    >
      <View style={cs.row}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={cs.content}>
          <Chip label={`${t("all")} (114)`} selected={branch === "ALL"} onPress={() => setBranch("ALL")} testID="research-branch-ALL" />
          {(research.data?.branches ?? []).map((b) => (
            <Chip key={b} label={b} selected={branch === b} onPress={() => setBranch(b)} testID={`research-branch-${b}`} />
          ))}
        </ScrollView>
      </View>
      {research.isLoading ? (
        <Loading />
      ) : branch !== "ALL" ? (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }} testID="research-branch-view">
          <View style={s.branchHead}>
            <Icon name={branchIcon(branch)} size={22} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <T v="heading">{branch}</T>
              <T v="caption">
                {branchNodes.length} {t("research").toLowerCase()} · {branchDone}/{branchMax} {t("level").toLowerCase()}
              </T>
            </View>
          </View>
          <View style={s.legend} testID="research-legend">
            {[
              [colors.brandPrimary, t("available")],
              [colors.info, t("inProgress")],
              [colors.success, t("maxed")],
              [colors.borderStrong, t("locked")],
            ].map(([c, label]) => (
              <View key={label} style={s.legendItem}>
                <View style={[s.dot, { backgroundColor: c }]} />
                <T v="caption">{label}</T>
              </View>
            ))}
          </View>
          <ResearchTree nodes={branchNodes} onPick={setPick} />
        </ScrollView>
      ) : (
        <FlatList
          data={nodes}
          keyExtractor={(n) => n.key}
          contentContainerStyle={{ paddingTop: spacing.xs, paddingBottom: insets.bottom + spacing.lg }}
          ListHeaderComponent={
            <View style={s.summary}>
              <T v="caption">
                {t("branches")}: {research.data?.branches.length} · {nodes.length} {t("research").toLowerCase()}
              </T>
            </View>
          }
          renderItem={({ item: n }) => (
            <Pressable style={[s.node, n.state === "AVAILABLE" && s.nodeAvail]} onPress={() => setPick(n)} testID={`research-node-${n.key}`}>
              <Row style={{ justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <T v="body" style={{ color: colors.onSurface }} numberOfLines={1}>
                    {n.name}
                  </T>
                  <T v="caption" numberOfLines={1}>
                    {n.key} · {n.branch} · {n.cost_class}
                  </T>
                </View>
                <View style={s.lvl}>
                  <T style={s.lvlText}>
                    {n.level}/{n.max_level}
                  </T>
                </View>
              </Row>
              <Row style={{ justifyContent: "space-between" }}>
                <StatePill state={n.state} />
                {n.job ? <Countdown endsAt={n.job.ends_at} /> : n.next ? <T v="caption">{formatDuration(n.next.duration_min * 60)}</T> : null}
              </Row>
              <T v="caption" numberOfLines={2}>
                {n.effect}
              </T>
            </Pressable>
          )}
        />
      )}
      <Sheet visible={!!pick} onClose={() => setPick(null)} title={pick?.name} testID="research-sheet">
        {pick ? (
          <>
            <Row style={{ gap: spacing.sm }}>
              <Icon name={branchIcon(pick.branch)} size={20} color={colors.brandPrimary} />
              <T v="caption" style={{ flex: 1 }}>
                {pick.branch} · {t("level")} {pick.level}/{pick.max_level} · {pick.cost_class}
              </T>
              <StatePill state={pick.state} />
            </Row>
            <T v="body">{pick.effect}</T>
            {unlockOf(pick.effect) ? (
              <Row style={{ gap: 6 }}>
                <Icon name="lock-open-variant-outline" size={16} color={colors.brandPrimary} />
                <T v="label" style={{ color: colors.brandPrimary }}>
                  {t("unlocks")}: {unlockOf(pick.effect)}
                </T>
              </Row>
            ) : null}
            <T v="label">{t("requirements")}</T>
            <View style={s.reqRow}>
              <Icon name={uni >= pick.required_university_level ? "check-circle" : "close-circle"} size={16} color={uni >= pick.required_university_level ? colors.success : colors.error} />
              <T v="caption">Università L{pick.required_university_level}</T>
            </View>
            <View style={s.reqRow}>
              <Icon name={(settlement.data?.level ?? 0) >= pick.required_settlement_level ? "check-circle" : "close-circle"} size={16} color={(settlement.data?.level ?? 0) >= pick.required_settlement_level ? colors.success : colors.error} />
              <T v="caption">
                {t("settlementLevel")} {pick.required_settlement_level}
              </T>
            </View>
            {pick.prerequisites.length ? (
              <>
                <T v="label">{t("prerequisites")}</T>
                {pick.prerequisites.map((p) => {
                  const node = research.data?.nodes.find((n) => n.key === p.key);
                  return (
                    <View key={p.key} style={s.reqRow}>
                      <Icon name={p.ok ? "check-circle" : "close-circle"} size={16} color={p.ok ? colors.success : colors.error} />
                      <T v="caption" style={{ color: p.ok ? colors.success : colors.error }}>
                        {node?.name ?? p.key}
                        {node ? ` · ${node.branch}` : ""}
                      </T>
                    </View>
                  );
                })}
              </>
            ) : null}
            {pick.next ? (
              <>
                <T v="label">
                  {t("cost")} · L{pick.next.level} · {formatDuration(pick.next.duration_min * 60)}
                </T>
                <CostRow cost={pick.next.cost} missing={pick.missing} testID="research-sheet-cost" />
              </>
            ) : null}
            {pick.job ? (
              <Row style={{ justifyContent: "space-between" }}>
                <Countdown endsAt={pick.job.ends_at} />
                <FinishNowButton job={pick.job} />
                <Button title={t("cancel")} variant="danger" onPress={() => m.cancelJob.mutateAsync(pick.job!.job_id).then(() => setPick(null)).catch(showError)} testID="research-cancel-button" />
              </Row>
            ) : (
              <Button title={t("start")} icon="flask" disabled={pick.state !== "AVAILABLE"} loading={m.startResearch.isPending} onPress={start} testID="research-start-button" />
            )}
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
