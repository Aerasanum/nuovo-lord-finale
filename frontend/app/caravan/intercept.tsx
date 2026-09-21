import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { idem, useArmy, useCaravanMutations, useCaravanSearch } from "@/src/api/hooks";
import { Crest } from "@/src/components/Crest";
import { Screen, useToast } from "@/src/components/overlay";
import { Button, Countdown, Icon, LoadState, Panel, Row, T } from "@/src/components/ui";
import { formatNumber, useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.border },
  stepBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surfaceSecondary },
  input: { width: 72, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, color: c.onSurface, textAlign: "center", backgroundColor: c.surfaceSecondary },
  maxBtn: { paddingHorizontal: 10, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: c.brandTertiary },
  kv: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
}));

/** Interception composer (Bible §34.9): pick ATK units from the current settlement; the server selects the intercept point. */
export default function InterceptScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { caravan: caravanId } = useLocalSearchParams<{ caravan: string }>();
  const { worldId, settlementId, settlement } = useGame();
  const search = useCaravanSearch(worldId, settlementId);
  const army = useArmy(worldId, settlementId);
  const { intercept } = useCaravanMutations(worldId ?? "");
  const { show, showError } = useToast();
  const [units, setUnits] = useState<Record<string, number>>({});
  const caravan = search.data?.caravans.find((c) => c.caravan_id === caravanId);
  const eligible = useMemo(() => (army.data?.units ?? []).filter((u) => u.count > 0 && u.stats.atk > 0), [army.data]);
  if (!worldId || !settlementId) return null;
  if (!search.data) return <LoadState query={search} />;
  if (!army.data) return <LoadState query={army} />;
  const chosen = Object.fromEntries(Object.entries(units).filter(([, n]) => n > 0));
  const total = Object.values(chosen).reduce((a, b) => a + b, 0);
  const setUnit = (u: string, n: number) => setUnits((p) => ({ ...p, [u]: Math.max(0, Math.min(army.data?.army[u] ?? 0, Math.floor(n) || 0)) }));
  const blocker = !search.data.interception_unlocked ? t("interceptLocked") : !caravan ? t("unknown") : total <= 0 ? t("onlyAtkUnits") : null;

  const submit = () =>
    intercept
      .mutateAsync({ origin_settlement_id: settlementId, caravan_id: caravanId!, units: chosen, idempotency_key: idem() })
      .then(() => {
        show(t("interceptSent"), "success");
        router.back();
      })
      .catch(showError);

  return (
    <Screen
      title={t("intercept")}
      testID="intercept-screen"
      left={
        <Pressable style={s.back} onPress={() => router.back()} testID="intercept-back">
          <Icon name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
      }
    >
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}>
        <Panel testID="intercept-target">
          {caravan ? (
            <>
              <Row>
                {caravan.house_crest ? <Crest crest={caravan.house_crest} size={28} /> : <Icon name="truck-delivery" size={22} color={colors.factionEnemy} />}
                <View style={{ flex: 1 }}>
                  <T v="heading" numberOfLines={1}>
                    {t("foreignCaravan")} · {caravan.house_name ?? t("enemy")}
                  </T>
                  <T v="caption">
                    {t("position")} {caravan.position[0]},{caravan.position[1]} · {caravan.escorted ? t("escorted") : t("unescorted")} · {t("intelScore")} {caravan.intel_score}/100
                  </T>
                </View>
              </Row>
              <View style={[s.kv, { marginTop: 6 }]}>
                <T v="caption">{t("cargoEstimate")}</T>
                <T v="caption" style={{ color: colors.onSurface }}>
                  {caravan.cargo_band ? `${formatNumber(caravan.cargo_band[0])}–${formatNumber(caravan.cargo_band[1])}` : t("unknown")}
                </T>
              </View>
              <View style={s.kv}>
                <T v="caption">{t("arrival")}</T>
                <Countdown endsAt={caravan.arrival_at} />
              </View>
            </>
          ) : (
            <T v="caption">{t("unknown")}</T>
          )}
          <T v="caption" style={{ color: colors.muted, marginTop: 6 }}>
            {t("interceptHint")}
          </T>
        </Panel>

        <Panel testID="intercept-units">
          <Row style={s.kv}>
            <T v="heading">
              {t("units")} · {settlement.data?.name}
            </T>
            <T v="label" style={{ color: colors.brandPrimary }} testID="intercept-total">
              {formatNumber(total)}
            </T>
          </Row>
          <T v="caption">{t("onlyAtkUnits")}</T>
          {eligible.map((u) => (
            <View key={u.name} style={s.row} testID={`intercept-unit-${u.name}`}>
              <View style={{ flex: 1 }}>
                <T v="label" style={{ color: colors.onSurface }}>
                  {u.name}
                </T>
                <T v="caption">
                  {t("available")}: {formatNumber(u.count)}
                </T>
              </View>
              <Pressable style={s.stepBtn} onPress={() => setUnit(u.name, (units[u.name] ?? 0) - 10)} testID={`intercept-unit-${u.name}-minus`}>
                <Icon name="minus" size={18} color={colors.onSurface} />
              </Pressable>
              <TextInput style={s.input} keyboardType="number-pad" value={String(units[u.name] ?? 0)} onChangeText={(v) => setUnit(u.name, Number(v.replace(/\D/g, "")))} testID={`intercept-unit-${u.name}-input`} />
              <Pressable style={s.stepBtn} onPress={() => setUnit(u.name, (units[u.name] ?? 0) + 10)} testID={`intercept-unit-${u.name}-plus`}>
                <Icon name="plus" size={18} color={colors.onSurface} />
              </Pressable>
              <Pressable style={s.maxBtn} onPress={() => setUnit(u.name, u.count)} testID={`intercept-unit-${u.name}-max`}>
                <T v="caption" style={{ color: colors.brandPrimary }}>
                  MAX
                </T>
              </Pressable>
            </View>
          ))}
        </Panel>

        {blocker ? (
          <T v="caption" style={{ color: colors.warning }} testID="intercept-blocker">
            {blocker}
          </T>
        ) : null}
        <Button title={t("intercept")} icon="sword" disabled={!!blocker || intercept.isPending} loading={intercept.isPending} onPress={submit} testID="intercept-submit" />
      </ScrollView>
    </Screen>
  );
}
