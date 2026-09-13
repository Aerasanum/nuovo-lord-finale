import React, { useState } from "react";
import { Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { UnitEntry } from "@/src/api/hooks";
import { useArmy, useSettlementMutations } from "@/src/api/hooks";
import { FinishNowButton } from "@/src/components/FinishNow";
import { Screen, Sheet, useToast } from "@/src/components/overlay";
import { Button, CostRow, Countdown, Icon, Loading, Panel, Row, StatePill, T } from "@/src/components/ui";
import { UNIT_ICON } from "@/src/game/units";
import { formatDuration, formatNumber, tDyn, unlockLine, useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  content: { padding: spacing.md, gap: spacing.sm },
  unit: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: spacing.sm, gap: 6 },
  unitAvail: { borderColor: c.brandSecondary },
  stats: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  stat: { flexDirection: "row", alignItems: "center", gap: 3 },
  count: { minWidth: 44, alignItems: "flex-end" },
  input: { height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surfaceTertiary, color: c.onSurface, paddingHorizontal: spacing.md, fontFamily: fonts.body, fontSize: 16, flex: 1 },
  stepper: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },
  garrison: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  gCell: { paddingHorizontal: 10, height: 30, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary, justifyContent: "center", borderWidth: 1, borderColor: c.border },
  capBox: { borderRadius: radius.sm, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceTertiary, padding: spacing.xs, gap: 2 },
  capFull: { borderColor: c.warning },
  capPip: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.border, marginLeft: 3 },
  capPipOn: { backgroundColor: c.brandPrimary },
  capPipFull: { backgroundColor: c.warning },
}));


export default function ArmyScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { worldId, settlementId, settlement } = useGame();
  const army = useArmy(worldId, settlementId);
  const m = useSettlementMutations(worldId ?? "", settlementId ?? "");
  const { showError, show } = useToast();
  const [pick, setPick] = useState<UnitEntry | null>(null);
  const [count, setCount] = useState("10");

  if (!worldId || !settlementId) return null;
  const d = army.data;
  const n = Math.max(0, parseInt(count || "0", 10) || 0);
  const cap = pick?.batch_cap ?? 0;
  const total = pick ? Object.fromEntries(Object.entries(pick.cost).map(([k, v]) => [k, v * n])) : {};
  const res = d?.resources ?? ({} as any);
  const missing = pick ? Object.fromEntries(Object.entries(total).filter(([k, v]) => (res[k] ?? 0) < (v as number))) : {};
  const canRecruit = pick && n >= 1 && n <= cap && Object.keys(missing).length === 0 && pick.state === "AVAILABLE";

  const recruit = async () => {
    if (!pick) return;
    try {
      await m.recruit.mutateAsync({ unit: pick.name, count: n });
      show(`${t("recruit")}: ${pick.name} ×${n}`, "success");
      setPick(null);
    } catch (e) {
      showError(e);
    }
  };

  return (
    <Screen title={t("army")} testID="army-screen" right={<T v="caption">{settlement.data?.name}</T>}>
      {!d ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]} refreshControl={<RefreshControl refreshing={army.isRefetching} onRefresh={() => army.refetch()} tintColor={colors.brandPrimary} />}>
          <Panel testID="army-garrison">
            <Row style={{ justifyContent: "space-between", marginBottom: spacing.sm }}>
              <T v="heading">{t("garrison")}</T>
              <T v="caption">
                {t("marchCapacity")} {formatNumber(settlement.data?.march_capacity ?? 0)}
              </T>
            </Row>
            <View style={s.garrison}>
              {Object.entries(d.army).length === 0 ? <T v="caption">—</T> : null}
              {Object.entries(d.army).map(([u, c]) => (
                <View key={u} style={s.gCell} testID={`garrison-${u}`}>
                  <Row>
                    <Icon name={UNIT_ICON[u] ?? "sword"} size={14} color={colors.brandPrimary} />
                    <T v="caption">
                      {u} <T v="mono" style={{ fontSize: 12 }}>{formatNumber(c)}</T>
                    </T>
                  </Row>
                </View>
              ))}
              {d.ships > 0 ? (
                <View style={s.gCell}>
                  <T v="caption">
                    {t("ships")} {d.ships}
                  </T>
                </View>
              ) : null}
            </View>
          </Panel>

          <T v="heading">{t("recruit")}</T>
          {d.units.map((u) => (
            <Pressable key={u.name} style={[s.unit, u.state === "AVAILABLE" && s.unitAvail]} onPress={() => u.state !== "LOCKED" && (setPick(u), setCount(String(Math.min(10, u.batch_cap || 1))))} testID={`unit-card-${u.name}`}>
              <Row style={{ justifyContent: "space-between" }}>
                <Row>
                  <Icon name={UNIT_ICON[u.name] ?? "sword"} size={20} color={u.state === "LOCKED" ? colors.muted : colors.brandPrimary} />
                  <View>
                    <T v="body" style={{ color: colors.onSurface }}>
                      {u.name}
                    </T>
                    <T v="caption">
                      {tDyn(t, `unitCategory_${u.category}`, u.category)} · {u.producer_building}
                    </T>
                  </View>
                </Row>
                <View style={s.count}>
                  <StatePill state={u.state} />
                </View>
              </Row>
              <View style={s.stats}>
                {(["atk", "def", "hp", "speed_tph", "cargo", "wall_damage"] as const).map((k) => (
                  <View key={k} style={s.stat}>
                    <T v="caption">{k === "speed_tph" ? t("speed") : k === "wall_damage" ? t("wallDamage") : k === "cargo" ? t("cargo") : k.toUpperCase()}</T>
                    <T v="mono" style={{ fontSize: 12 }}>
                      {u.stats[k]}
                    </T>
                  </View>
                ))}
              </View>
              <Row style={{ justifyContent: "space-between" }}>
                <CostRow cost={u.cost} />
                <T v="caption">{u.effective_time_s ? formatDuration(u.effective_time_s) : formatDuration(u.base_time_s)}/u</T>
              </Row>
              {u.legendary_cap ? (
                <View style={[s.capBox, u.legendary_cap.free === 0 && s.capFull]} testID={`unit-${u.name}-legendary-cap`}>
                  <Row style={{ justifyContent: "space-between" }}>
                    <Row>
                      <Icon name="crown-outline" size={16} color={u.legendary_cap.free === 0 ? colors.warning : colors.brandPrimary} />
                      <T v="label">{t("legendaryCap")}</T>
                    </Row>
                    <Row>
                      {Array.from({ length: u.legendary_cap.max }).map((_, i) => (
                        <View key={i} style={[s.capPip, i < u.legendary_cap!.used && (u.legendary_cap!.free === 0 ? s.capPipFull : s.capPipOn)]} />
                      ))}
                      <T v="mono" style={{ fontSize: 13, marginLeft: 4 }} testID={`unit-${u.name}-legendary-count`}>
                        {u.legendary_cap.used}/{u.legendary_cap.max}
                      </T>
                    </Row>
                  </Row>
                  <T v="caption">
                    {t("garrison")} {u.legendary_cap.garrison} · {t("legendaryQueued")} {u.legendary_cap.queued} · {t("legendaryInFlight")} {u.legendary_cap.in_flight}
                  </T>
                </View>
              ) : null}
              {u.job ? (
                <Row style={{ justifyContent: "space-between" }}>
                  <T v="caption">
                    {u.job.target} {u.job.produced_so_far}/{u.job.count}
                  </T>
                  <Countdown endsAt={u.job.ends_at} />
                  <FinishNowButton job={u.job} />
                  <Pressable onPress={() => m.cancelJob.mutateAsync(u.job!.job_id).catch(showError)} testID={`unit-${u.name}-cancel`}>
                    <Icon name="close-circle-outline" size={20} color={colors.muted} />
                  </Pressable>
                </Row>
              ) : u.state === "LOCKED" ? (
                <T v="caption">{unlockLine(t, u.unlock, !u.unlock.producer_ok ? u.producer_building : null)}</T>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
      )}

      <Sheet visible={!!pick} onClose={() => setPick(null)} title={pick ? `${t("recruit")} ${pick.name}` : ""} testID="recruit-sheet">
        {pick ? (
          <>
            <T v="caption">
              {t("batchCap")}: {cap} · {pick.role}
            </T>
            {pick.legendary_cap ? (
              <T v="caption" style={{ color: pick.legendary_cap.free === 0 ? colors.warning : colors.onSurfaceSecondary }} testID="recruit-legendary-cap">
                {t("legendaryCap")} {pick.legendary_cap.used}/{pick.legendary_cap.max} · {t("legendaryCapHint").replace("{max}", String(pick.legendary_cap.max))}
              </T>
            ) : null}
            <Row>
              <Pressable style={s.stepper} onPress={() => setCount(String(Math.max(1, n - 5)))} testID="recruit-minus">
                <Icon name="minus" size={20} />
              </Pressable>
              <TextInput style={s.input} keyboardType="number-pad" value={count} onChangeText={(v) => setCount(v.replace(/[^0-9]/g, ""))} testID="recruit-count-input" />
              <Pressable style={s.stepper} onPress={() => setCount(String(Math.min(cap, n + 5)))} testID="recruit-plus">
                <Icon name="plus" size={20} />
              </Pressable>
              <Pressable style={s.stepper} onPress={() => setCount(String(cap))} testID="recruit-max">
                <T v="caption">MAX</T>
              </Pressable>
            </Row>
            <T v="label">{t("cost")}</T>
            <CostRow cost={total as any} missing={missing as any} testID="recruit-total-cost" />
            <T v="caption">
              {t("time")}: {formatDuration((pick.effective_time_s ?? pick.base_time_s) * n)}
            </T>
            <KeyboardStickyView>
              <Button title={t("recruit")} icon="account-plus" disabled={!canRecruit} loading={m.recruit.isPending} onPress={recruit} testID="recruit-confirm-button" />
            </KeyboardStickyView>
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
