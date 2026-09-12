import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { idem, useArmy, useCaravanInfo, useCaravanMutations, useMarches } from "@/src/api/hooks";
import { Screen, useToast } from "@/src/components/overlay";
import { Button, Chip, Icon, Loading, Panel, ProgressBar, Row, T } from "@/src/components/ui";
import { formatNumber, RESOURCE_LABELS, useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const RES = ["grain", "wood", "clay", "iron", "gold"] as const;

const useStyles = makeStyles((c) => ({
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.border },
  stepBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surfaceSecondary },
  input: { width: 84, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, color: c.onSurface, textAlign: "center", backgroundColor: c.surfaceSecondary },
  maxBtn: { paddingHorizontal: 10, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: c.brandTertiary },
  kv: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
}));

/** Caravan composer (Bible §13): destination among own settlements, logistic slots, cargo within convoy capacity, optional escort. */
export default function NewCaravanScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { target } = useLocalSearchParams<{ target?: string }>();
  const { worldId, settlementId } = useGame();
  const info = useCaravanInfo(worldId, settlementId);
  const army = useArmy(worldId, settlementId);
  const { send } = useCaravanMutations(worldId ?? "");
  const marches = useMarches(worldId);
  const { show, showError } = useToast();
  const [dest, setDest] = useState<string | null>(target ?? null);
  const [slots, setSlots] = useState(1);
  const [cargo, setCargo] = useState<Record<string, number>>({});
  const [escortOn, setEscortOn] = useState(false);
  const [escort, setEscort] = useState<Record<string, number>>({});

  useEffect(() => {
    if (info.data && !dest && info.data.destinations.length === 1) setDest(info.data.destinations[0].settlement_id);
  }, [info.data, dest]);

  const capacity = useMemo(() => (info.data ? info.data.capacity_per_caravan * slots : 0), [info.data, slots]);
  const total = Object.values(cargo).reduce((a, b) => a + b, 0);
  const escortUnits = Object.fromEntries(Object.entries(escort).filter(([, n]) => n > 0));

  if (!worldId || !settlementId) return null;
  if (!info.data) return <Loading />;
  const d = info.data;
  const avail = (r: string) => Math.floor((d.resources as any)[r] ?? 0);
  const setRes = (r: string, n: number) => {
    const others = total - (cargo[r] ?? 0);
    setCargo((p) => ({ ...p, [r]: Math.max(0, Math.min(avail(r), capacity - others, Math.floor(n) || 0)) }));
  };
  const setEsc = (u: string, n: number) => setEscort((p) => ({ ...p, [u]: Math.max(0, Math.min(army.data?.army[u] ?? 0, Math.floor(n) || 0)) }));
  // Bible §13 caps, checked up-front so the button explains itself instead of failing on the server
  const outgoing = (marches.data?.marches ?? []).filter((m) => m.origin_settlement_id === settlementId && m.status === "OUTBOUND");
  const caravanOut = outgoing.some((m) => m.mission === "CARAVAN");
  const capOut = outgoing.length >= 5;
  const blocker = !d.unlocked ? t("caravanLocked") : !d.destinations.length ? t("caravanNoDestinations") : caravanOut ? t("caravanAlreadyOutbound") : capOut ? t("outgoingCapReached") : !dest ? t("caravanDestination") : total <= 0 ? t("caravanCargo") : total > capacity ? t("caravanCapacity") : null;

  const submit = () =>
    send
      .mutateAsync({ origin_settlement_id: settlementId, target_settlement_id: dest!, cargo: Object.fromEntries(Object.entries(cargo).filter(([, n]) => n > 0)), caravans_assigned: slots, escort: escortOn ? escortUnits : {}, idempotency_key: idem() })
      .then(() => {
        show(t("caravanSent"), "success");
        router.back();
      })
      .catch(showError);

  return (
    <Screen
      title={t("sendCaravan")}
      testID="caravan-new-screen"
      left={
        <Pressable style={s.back} onPress={() => router.back()} testID="caravan-new-back">
          <Icon name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
      }
    >
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}>
        {!d.unlocked ? (
          <Panel testID="caravan-locked">
            <Row>
              <Icon name="lock" size={18} color={colors.warning} />
              <T v="caption" style={{ flex: 1 }}>
                {t("caravanLocked")} ({d.research_unlock_key}, Caravanserraglio L{d.caravanserai_level})
              </T>
            </Row>
          </Panel>
        ) : null}

        <Panel>
          <T v="heading" style={{ marginBottom: 6 }}>
            {t("caravanDestination")}
          </T>
          {d.destinations.length === 0 ? <T v="caption">{t("caravanNoDestinations")}</T> : null}
          <View style={s.chips}>
            {d.destinations.map((x) => (
              <Chip key={x.settlement_id} label={`${x.name} (${x.x},${x.y})`} selected={dest === x.settlement_id} onPress={() => setDest(x.settlement_id)} testID={`caravan-dest-${x.settlement_id}`} />
            ))}
          </View>
        </Panel>

        <Panel>
          <View style={s.kv}>
            <T v="heading">{t("caravanSlots")}</T>
            <Row>
              <Pressable style={s.stepBtn} onPress={() => setSlots((v) => Math.max(1, v - 1))} testID="caravan-slots-minus">
                <Icon name="minus" size={18} color={colors.onSurface} />
              </Pressable>
              <T v="label" style={{ minWidth: 44, textAlign: "center" }} testID="caravan-slots-value">
                {slots} / {d.caravans_per_march}
              </T>
              <Pressable style={s.stepBtn} onPress={() => setSlots((v) => Math.min(Math.max(1, d.caravans_per_march), v + 1))} testID="caravan-slots-plus">
                <Icon name="plus" size={18} color={colors.onSurface} />
              </Pressable>
            </Row>
          </View>
          <View style={[s.kv, { marginTop: 6 }]}>
            <T v="caption">{t("caravanCapacity")}</T>
            <T v="caption" style={{ color: total > capacity ? colors.error : colors.onSurface }} testID="caravan-capacity">
              {formatNumber(total)} / {formatNumber(capacity)}
            </T>
          </View>
          <ProgressBar value={capacity ? Math.min(1, total / capacity) : 0} />
          <T v="caption" style={{ marginTop: 4 }}>
            Caravanserraglio L{d.caravanserai_level} · {formatNumber(d.capacity_per_caravan)} / {t("caravan").toLowerCase()} · {t("caravanSpeed")} {escortOn && Object.keys(escortUnits).length ? "≤" : ""}
            {d.unescorted_speed_tph} {t("speedTph")}
          </T>
        </Panel>

        <Panel testID="caravan-cargo">
          <T v="heading" style={{ marginBottom: 4 }}>
            {t("caravanCargo")}
          </T>
          {RES.map((r) => (
            <View key={r} style={s.row} testID={`caravan-res-${r}`}>
              <View style={{ flex: 1 }}>
                <T v="label" style={{ color: colors.onSurface }}>
                  {RESOURCE_LABELS[lang][r]}
                </T>
                <T v="caption">
                  {t("available")}: {formatNumber(avail(r))}
                </T>
              </View>
              <TextInput style={s.input} keyboardType="number-pad" value={String(cargo[r] ?? 0)} onChangeText={(v) => setRes(r, Number(v.replace(/\D/g, "")))} testID={`caravan-res-${r}-input`} />
              <Pressable style={s.maxBtn} onPress={() => setRes(r, avail(r))} testID={`caravan-res-${r}-max`}>
                <T v="caption" style={{ color: colors.brandPrimary }}>
                  MAX
                </T>
              </Pressable>
            </View>
          ))}
          <T v="caption" style={{ color: colors.muted, marginTop: 6 }}>
            {t("caravanOverflowNote")} {t("caravanOutgoingMax")}
          </T>
        </Panel>

        <Panel testID="caravan-escort">
          <View style={s.kv}>
            <T v="heading">{t("caravanEscort")}</T>
            <Chip label={escortOn ? "ON" : "OFF"} selected={escortOn} onPress={() => setEscortOn((v) => !v)} testID="caravan-escort-toggle" />
          </View>
          <T v="caption" style={{ marginTop: 4 }}>
            {t("caravanEscortHint")}
          </T>
          {escortOn && !Object.keys(escortUnits).length ? (
            <T v="caption" style={{ marginTop: 4, color: colors.warning }} testID="caravan-escort-empty">
              {t("escortEmptyHint")}
            </T>
          ) : null}
          {escortOn
            ? Object.entries(army.data?.army ?? {})
                .filter(([, n]) => n > 0)
                .map(([u, n]) => (
                  <View key={u} style={s.row} testID={`caravan-escort-${u}`}>
                    <View style={{ flex: 1 }}>
                      <T v="label" style={{ color: colors.onSurface }}>
                        {u}
                      </T>
                      <T v="caption">
                        {t("available")}: {formatNumber(n)}
                      </T>
                    </View>
                    <TextInput style={s.input} keyboardType="number-pad" value={String(escort[u] ?? 0)} onChangeText={(v) => setEsc(u, Number(v.replace(/\D/g, "")))} testID={`caravan-escort-${u}-input`} />
                    <Pressable style={s.maxBtn} onPress={() => setEsc(u, n)} testID={`caravan-escort-${u}-max`}>
                      <T v="caption" style={{ color: colors.brandPrimary }}>
                        MAX
                      </T>
                    </Pressable>
                  </View>
                ))
            : null}
        </Panel>

        {blocker ? (
          <T v="caption" style={{ color: colors.warning }} testID="caravan-new-blocker">
            {blocker}
          </T>
        ) : null}
        <Button title={t("sendCaravan")} icon="truck-delivery" disabled={!!blocker || send.isPending} loading={send.isPending} onPress={submit} testID="caravan-new-submit" />
      </ScrollView>
    </Screen>
  );
}
