import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { idem, useArmy, useMissions, useStartMission } from "@/src/api/hooks";
import { MissionBanner } from "@/src/components/MissionArt";
import { Screen, useToast } from "@/src/components/overlay";
import { Button, Icon, Loading, Panel, Row, T } from "@/src/components/ui";
import { eligibleUnits, localBlocker, missionDesc, missionName, requirementLines, rewardLines } from "@/src/game/missions";
import { formatNumber, useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  unitRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.border },
  stepBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surfaceSecondary },
  input: { width: 72, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, color: c.onSurface, textAlign: "center", backgroundColor: c.surfaceSecondary },
  maxBtn: { paddingHorizontal: 10, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: c.brandTertiary },
  kv: { flexDirection: "row", justifyContent: "space-between" },
}));

/** Mission composer: pick the troops of the current settlement (allowed types only) and start a TIMED_MISSION. */
export default function NewMissionScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { key } = useLocalSearchParams<{ key: string }>();
  const { worldId, settlementId, settlement } = useGame();
  const overview = useMissions(worldId);
  const army = useArmy(worldId, settlementId);
  const start = useStartMission(worldId ?? "");
  const { show, showError } = useToast();
  const [units, setUnits] = useState<Record<string, number>>({});
  const entry = overview.data?.catalog.find((m) => m.key === key);
  const eligible = useMemo(() => (entry ? eligibleUnits(entry, army.data?.army ?? {}) : {}), [entry, army.data]);
  if (!worldId || !settlementId) return null;
  if (!entry || !army.data) return <Loading />;

  const setUnit = (u: string, n: number) => setUnits((prev) => ({ ...prev, [u]: Math.max(0, Math.min(eligible[u] ?? 0, Math.floor(n) || 0)) }));
  const chosen = Object.fromEntries(Object.entries(units).filter(([, n]) => n > 0));
  const total = Object.values(chosen).reduce((a, b) => a + b, 0);
  const blocker = localBlocker(t, entry, chosen, settlement.data?.research);
  const busy = !!entry.active_mission_id || (entry.cooldown_until && new Date(entry.cooldown_until).getTime() > Date.now()) || (overview.data?.slots_left ?? 0) <= 0;

  const submit = () =>
    start
      .mutateAsync({ key: entry.key, origin_settlement_id: settlementId, units: chosen, idempotency_key: idem() })
      .then(() => {
        show(t("missionStarted"), "success");
        router.back();
      })
      .catch(showError);

  return (
    <Screen
      title={missionName(t, entry.key, entry.name)}
      testID="mission-new-screen"
      left={
        <Pressable style={s.back} onPress={() => router.back()} testID="mission-new-back">
          <Icon name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
      }
    >
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}>
        <Panel>
          <MissionBanner missionKey={entry.key} title={missionName(t, entry.key, entry.name)} height={160} testID="mission-new-art" />
          {missionDesc(t, entry.key) ? <T v="caption">{missionDesc(t, entry.key)}</T> : null}
          <View style={[s.kv, { marginTop: 6 }]}>
            <T v="caption">{t("missionOrigin")}</T>
            <T v="caption" style={{ color: colors.onSurface }} testID="mission-new-origin">
              {settlement.data?.name} ({settlement.data?.x},{settlement.data?.y})
            </T>
          </View>
          <View style={s.kv}>
            <T v="caption">{t("missionDuration")}</T>
            <T v="caption" style={{ color: colors.onSurface }}>
              {entry.duration_hours}h · {t("missionCooldown")} {entry.cooldown_hours}h
            </T>
          </View>
          <T v="caption" style={{ marginTop: 4 }}>
            {t("missionRequirements")}: {requirementLines(t, entry).join(" · ") || "—"}
          </T>
          <T v="caption" style={{ color: colors.brandPrimary }}>
            {t("missionReward")}: {rewardLines(t, entry).join(" · ")}
          </T>
        </Panel>

        <Panel testID="mission-new-units">
          <Row style={s.kv}>
            <T v="heading">{t("units")}</T>
            <T v="label" style={{ color: colors.brandPrimary }} testID="mission-new-total">
              {formatNumber(total)}
            </T>
          </Row>
          {Object.keys(eligible).length === 0 ? <T v="caption">—</T> : null}
          {Object.entries(eligible).map(([u, avail]) => (
            <View key={u} style={s.unitRow} testID={`mission-unit-${u}`}>
              <View style={{ flex: 1 }}>
                <T v="label" style={{ color: colors.onSurface }}>
                  {u}
                </T>
                <T v="caption">
                  {t("available")}: {formatNumber(avail)}
                </T>
              </View>
              <Pressable style={s.stepBtn} onPress={() => setUnit(u, (units[u] ?? 0) - 10)} testID={`mission-unit-${u}-minus`}>
                <Icon name="minus" size={18} color={colors.onSurface} />
              </Pressable>
              <TextInput style={s.input} keyboardType="number-pad" value={String(units[u] ?? 0)} onChangeText={(v) => setUnit(u, Number(v.replace(/\D/g, "")))} testID={`mission-unit-${u}-input`} />
              <Pressable style={s.stepBtn} onPress={() => setUnit(u, (units[u] ?? 0) + 10)} testID={`mission-unit-${u}-plus`}>
                <Icon name="plus" size={18} color={colors.onSurface} />
              </Pressable>
              <Pressable style={s.maxBtn} onPress={() => setUnit(u, avail)} testID={`mission-unit-${u}-max`}>
                <T v="caption" style={{ color: colors.brandPrimary }}>
                  MAX
                </T>
              </Pressable>
            </View>
          ))}
        </Panel>

        {blocker ? (
          <T v="caption" style={{ color: colors.warning }} testID="mission-new-blocker">
            {blocker}
          </T>
        ) : null}
        <T v="caption" style={{ color: colors.muted }}>
          {t("missionTroopsBusy")}
        </T>
        <Button title={t("startMission")} icon="play" disabled={!!blocker || !!busy || start.isPending} loading={start.isPending} onPress={submit} testID="mission-new-submit" />
      </ScrollView>
    </Screen>
  );
}
