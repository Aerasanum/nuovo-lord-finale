import { useRouter } from "expo-router";
import React from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { BuildingEntry, JobDto } from "@/src/api/hooks";
import { useBuildings, useSettlementMutations } from "@/src/api/hooks";
import { Crest } from "@/src/components/Crest";
import { Screen, useToast } from "@/src/components/overlay";
import { Button, CostRow, Countdown, Icon, Loading, Panel, ProgressBar, RES_ICONS, resourceColor, Row, StatePill, T } from "@/src/components/ui";
import { formatDuration, formatNumber, RESOURCE_LABELS, useI18n } from "@/src/i18n";
import { useAuth } from "@/src/state/AuthContext";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  content: { padding: spacing.md, gap: spacing.md },
  resGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  resCell: { width: "48%", flexGrow: 1, backgroundColor: c.surfaceTertiary, borderRadius: radius.md, padding: spacing.sm, gap: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  bCard: { width: "48%", flexGrow: 1, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: spacing.sm, gap: 6, minHeight: 96 },
  bCardAvail: { borderColor: c.brandSecondary },
  lvl: { width: 28, height: 28, borderRadius: 14, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  lvlText: { color: c.onBrandTertiary, fontSize: 12, fontWeight: "700" },
  hdrBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  jobRow: { gap: 6, paddingVertical: 6 },
  queueDots: { flexDirection: "row", gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.border },
  dotActive: { backgroundColor: c.brandPrimary },
  quick: { flexDirection: "row", gap: spacing.sm },
}));

export default function SettlementScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { selectSettlement } = useAuth();
  const { worldId, settlementId, settlement, settlements, player } = useGame();
  const buildings = useBuildings(worldId, settlementId);
  const m = useSettlementMutations(worldId ?? "", settlementId ?? "");
  const { showError, show } = useToast();
  const d = settlement.data;

  if (!worldId || !settlementId) return null;
  const jobs = d?.jobs ?? [];
  const constructionJobs = jobs.filter((j) => j.kind === "BUILDING" || j.kind === "SETTLEMENT_UPGRADE" || j.kind === "SENTINEL_BUILD");
  const up = d?.settlement_upgrade;

  const onUpgradeSettlement = () =>
    m.upgradeSettlement
      .mutateAsync()
      .then(() => show(`${t("upgradeSettlement")} → L${(d?.level ?? 0) + 1}`, "success"))
      .catch(showError);

  return (
    <Screen
      testID="settlement-screen"
      title={d ? `${d.name}` : t("tabCity")}
      left={
        settlements.length > 1 ? (
          <Pressable
            style={s.hdrBtn}
            onPress={() => {
              const i = settlements.findIndex((x: any) => x.settlement_id === settlementId);
              selectSettlement(settlements[(i + 1) % settlements.length].settlement_id);
            }}
            testID="settlement-switch-button"
          >
            <Icon name="swap-horizontal" size={22} color={colors.brandPrimary} />
          </Pressable>
        ) : undefined
      }
      right={
        <Row>
          <Pressable style={s.hdrBtn} onPress={() => router.push("/house")} testID="settlement-house-button" accessibilityLabel={t("house")}>
            {player?.house?.crest ? <Crest crest={player.house.crest} size={24} /> : <Icon name="shield-half-full" size={22} color={colors.onSurfaceSecondary} />}
          </Pressable>
          <Pressable style={s.hdrBtn} onPress={() => router.push("/queues")} testID="settlement-queues-button">
            <Icon name="timer-sand" size={22} color={colors.onSurfaceSecondary} />
          </Pressable>
          <Pressable style={s.hdrBtn} onPress={() => router.push("/worlds")} testID="settlement-worlds-button">
            <Icon name="earth" size={22} color={colors.onSurfaceSecondary} />
          </Pressable>
        </Row>
      }
    >
      {!d ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]} refreshControl={<RefreshControl refreshing={settlement.isRefetching} onRefresh={() => settlement.refetch()} tintColor={colors.brandPrimary} />}>
          {/* header stats */}
          <Panel testID="settlement-header">
            <Row style={{ justifyContent: "space-between" }}>
              <Row>
                <View style={s.lvl}>
                  <T style={s.lvlText}>{d.level}</T>
                </View>
                <View>
                  <T v="heading" testID="settlement-level">
                    {t("settlementLevel")} {d.level}
                  </T>
                  <T v="caption">
                    {t("terrain")}: {d.terrain} (+{d.terrain_defender_bonus_pct}%) · {d.x},{d.y} · {t("developmentScore")} {formatNumber(d.development_score)}
                  </T>
                </View>
              </Row>
              <Row>
                {player?.shield_active ? <Icon name="shield-check" size={22} color={colors.success} /> : null}
                <Pressable style={s.hdrBtn} onPress={() => router.push("/skins")} testID="settlement-skins-button" accessibilityLabel={t("castleSkin")}>
                  <Icon name="palette" size={22} color={colors.brandPrimary} />
                </Pressable>
              </Row>
            </Row>
            <View style={{ marginTop: spacing.sm }}>
              <StatePill state={up?.state ?? ""} testID="settlement-upgrade-state" />
            </View>
            {up?.next ? (
              <View style={{ marginTop: spacing.sm, gap: 6 }}>
                <T v="label">
                  {t("nextLevel")} {up.next.level} · {up.next.stage} · {formatDuration(up.next.duration_min * 60)}
                  {up.next.fast_applied ? " · FAST" : ""}
                </T>
                <CostRow cost={up.next.cost} missing={up.missing} testID="settlement-upgrade-cost" />
                <T v="caption" numberOfLines={2}>
                  {t("unlocks")}: {up.next.unlocks}
                </T>
                {up.requirements?.some((r) => !r.ok) ? (
                  <T v="caption" style={{ color: colors.warning }}>
                    {t("requirements")}: {up.requirements.filter((r) => !r.ok).map((r) => `${r.building} ${r.have}/${r.required}`).join(", ")}
                  </T>
                ) : null}
                {up.state === "IN_PROGRESS" && up.job ? (
                  <JobLine job={up.job} onCancel={() => m.cancelJob.mutateAsync(up.job!.job_id).catch(showError)} />
                ) : (
                  <Button title={t("upgradeSettlement")} icon="arrow-up-bold" disabled={up.state !== "AVAILABLE"} loading={m.upgradeSettlement.isPending} onPress={onUpgradeSettlement} testID="settlement-upgrade-button" />
                )}
              </View>
            ) : null}
          </Panel>

          {/* resources */}
          <View>
            <Row style={{ justifyContent: "space-between", marginBottom: spacing.sm }}>
              <T v="heading">{t("resources")}</T>
              <T v="caption" testID="settlement-warehouse-cap">
                {t("warehouse")} {formatNumber(d.warehouse_capacity)}
              </T>
            </Row>
            <View style={s.resGrid}>
              {(["grain", "wood", "clay", "iron", "gold"] as const).map((r) => (
                <View key={r} style={s.resCell} testID={`resource-${r}`}>
                  <Row>
                    <Icon name={RES_ICONS[r]} size={16} color={resourceColor(colors, r)} />
                    <T v="label">{RESOURCE_LABELS[lang][r]}</T>
                  </Row>
                  <T v="mono" testID={`resource-${r}-value`}>
                    {formatNumber(d.resources[r])}
                  </T>
                  <ProgressBar value={d.warehouse_capacity ? d.resources[r] / d.warehouse_capacity : 0} color={d.resources[r] >= d.warehouse_capacity ? colors.warning : resourceColor(colors, r)} />
                  <T v="caption">
                    +{d.production_per_h[r].toFixed(d.production_per_h[r] < 100 ? 1 : 0)}
                    {t("perHour")}
                  </T>
                </View>
              ))}
            </View>
          </View>

          {/* queues */}
          <Panel testID="settlement-queues">
            <Row style={{ justifyContent: "space-between" }}>
              <Row>
                <T v="heading">{t("constructionQueues")}</T>
                <View style={s.queueDots}>
                  {Array.from({ length: d.construction_queues }).map((_, i) => (
                    <View key={i} style={[s.dot, i < constructionJobs.length && s.dotActive]} />
                  ))}
                </View>
              </Row>
              <T v="caption">
                {constructionJobs.length}/{d.construction_queues}
              </T>
            </Row>
            {constructionJobs.length === 0 ? (
              <T v="caption" style={{ marginTop: 4 }}>
                —
              </T>
            ) : (
              constructionJobs.map((j) => <JobLine key={j.job_id} job={j} onCancel={() => m.cancelJob.mutateAsync(j.job_id).catch(showError)} />)
            )}
          </Panel>

          <View style={s.quick}>
            <Button title={t("research")} icon="flask" variant="secondary" style={{ flex: 1 }} onPress={() => router.push("/research")} testID="settlement-research-button" />
            <Button title={t("sentinels")} icon="tower-fire" variant="secondary" style={{ flex: 1 }} onPress={() => router.push("/sentinels")} testID="settlement-sentinels-button" />
            <Button title={t("caravans")} icon="truck-delivery" variant="secondary" style={{ flex: 1 }} onPress={() => router.push("/caravans")} testID="settlement-caravans-button" />
          </View>

          {/* buildings grid */}
          <View>
            <T v="heading" style={{ marginBottom: spacing.sm }}>
              {t("buildings")} ({Object.keys(d.buildings).length}/21)
            </T>
            {buildings.isLoading ? (
              <Loading />
            ) : (
              <View style={s.grid}>
                {(buildings.data?.buildings ?? []).map((b: BuildingEntry) => (
                  <Pressable key={b.name} style={[s.bCard, b.state === "AVAILABLE" && s.bCardAvail]} onPress={() => router.push({ pathname: "/building/[name]", params: { name: b.name } })} testID={`building-card-${b.name}`}>
                    <Row style={{ justifyContent: "space-between" }}>
                      <T v="label" numberOfLines={1} style={{ flex: 1 }}>
                        {b.name}
                      </T>
                      <View style={s.lvl}>
                        <T style={s.lvlText}>{b.level}</T>
                      </View>
                    </Row>
                    <StatePill state={b.state} />
                    {b.job ? <Countdown endsAt={b.job.ends_at} style={{ fontSize: 12 }} /> : b.next && b.state !== "LOCKED" ? <CostRow cost={b.next.cost} missing={b.missing} /> : b.state === "LOCKED" ? <T v="caption">L{b.unlock.min_settlement_level}{b.unlock.required_research_key ? ` · ${b.unlock.required_research_key}` : ""}</T> : null}
                  </Pressable>
                ))}
              </View>
            )}
          </View>
          <T v="caption" style={{ textAlign: "center" }}>
            {t("serverAuthority")}
          </T>
        </ScrollView>
      )}
    </Screen>
  );
}

export function JobLine({ job, onCancel }: { job: JobDto; onCancel?: () => void }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const s = useStyles();
  const label = job.kind === "SETTLEMENT_UPGRADE" ? `${t("upgradeSettlement")} → L${job.target_level}` : job.kind === "RECRUIT" || job.kind === "SHIP" ? `${job.target} ×${job.count}` : `${job.target}${job.target_level ? ` → L${job.target_level}` : ""}`;
  return (
    <View style={s.jobRow} testID={`job-${job.job_id}`}>
      <Row style={{ justifyContent: "space-between" }}>
        <T v="body" numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </T>
        <Countdown endsAt={job.ends_at} testID={`job-${job.job_id}-countdown`} />
        {onCancel ? (
          <Pressable onPress={onCancel} style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }} testID={`job-${job.job_id}-cancel`}>
            <Icon name="close-circle-outline" size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </Row>
      <LiveProgress job={job} />
    </View>
  );
}

function LiveProgress({ job }: { job: JobDto }) {
  const start = Date.parse(job.started_at);
  const end = Date.parse(job.ends_at);
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const v = Math.max(0, Math.min(1, (now - start) / Math.max(1, end - start)));
  return <ProgressBar value={v} />;
}
