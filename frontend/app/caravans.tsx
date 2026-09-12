import { useRouter } from "expo-router";
import React from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { DetectedCaravan } from "@/src/api/hooks";
import { useCaravanInfo, useCaravanSearch, useMarches } from "@/src/api/hooks";
import { Crest } from "@/src/components/Crest";
import { MarchListCard } from "@/src/components/MarchCard";
import { Screen } from "@/src/components/overlay";
import { Button, Countdown, Icon, Loading, Panel, Row, T } from "@/src/components/ui";
import { isLogistics } from "@/src/game/caravans";
import { formatNumber, useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.md, gap: spacing.md },
  kv: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stat: { flex: 1, minWidth: "45%", backgroundColor: c.surfaceTertiary, borderRadius: radius.md, padding: spacing.sm, gap: 2 },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  detected: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: spacing.sm, marginTop: spacing.sm, gap: 6 },
}));

/** Caravans hub (Bible §13 / §34.9): Caravanserraglio status, own convoys & interceptors, detected foreign caravans. */
export default function CaravansScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { worldId, settlementId, settlement } = useGame();
  const info = useCaravanInfo(worldId, settlementId);
  const search = useCaravanSearch(worldId, settlementId);
  const marches = useMarches(worldId);
  if (!worldId || !settlementId) return null;
  const d = info.data;
  const mine = (marches.data?.marches ?? []).filter(isLogistics);
  const detected = search.data?.caravans ?? [];
  const refreshing = info.isRefetching || search.isRefetching || marches.isRefetching;
  const refresh = () => {
    info.refetch();
    search.refetch();
    marches.refetch();
  };

  return (
    <Screen
      title={t("caravans")}
      testID="caravans-screen"
      left={
        <Pressable style={s.back} onPress={() => router.back()} testID="caravans-back">
          <Icon name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
      }
    >
      {!d ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.xl }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brandPrimary} />}>
          <Panel testID="caravans-info">
            <Row style={s.kv}>
              <T v="heading" numberOfLines={1} style={{ flex: 1 }}>
                {t("caravanserai")} L{d.caravanserai_level} · {settlement.data?.name}
              </T>
              <Icon name="truck-delivery" size={20} color={d.unlocked && d.caravanserai_level > 0 ? colors.brandPrimary : colors.muted} />
            </Row>
            <View style={[s.stats, { marginTop: spacing.sm }]}>
              <View style={s.stat}>
                <T v="caption">{t("caravanSlots")}</T>
                <T v="label" testID="caravans-slots">
                  {d.caravans_per_march}
                </T>
              </View>
              <View style={s.stat}>
                <T v="caption">{t("caravanCapacity")}</T>
                <T v="label" testID="caravans-capacity">
                  {formatNumber(d.capacity_per_caravan)} {t("perCaravan")}
                </T>
              </View>
              <View style={s.stat}>
                <T v="caption">{t("caravanSpeed")}</T>
                <T v="label">
                  {d.unescorted_speed_tph} {t("speedTph")}
                </T>
              </View>
              <View style={s.stat}>
                <T v="caption">{t("searchRadius")}</T>
                <T v="label" testID="caravans-radius">
                  {d.search_radius} {t("tiles")}
                </T>
              </View>
            </View>
            {!d.unlocked || d.caravanserai_level < 1 ? (
              <Row style={{ marginTop: spacing.sm }}>
                <Icon name="lock" size={16} color={colors.warning} />
                <T v="caption" style={{ flex: 1 }} testID="caravans-locked">
                  {t("caravanLocked")}
                </T>
              </Row>
            ) : d.destinations.length === 0 ? (
              <T v="caption" style={{ marginTop: spacing.sm, color: colors.warning }} testID="caravans-no-destinations">
                {t("caravanNoDestinations")}
              </T>
            ) : null}
            <Button title={t("sendCaravan")} icon="truck-delivery" style={{ marginTop: spacing.sm }} disabled={!d.unlocked || d.caravanserai_level < 1} onPress={() => router.push("/caravan/new")} testID="caravans-send-button" />
          </Panel>

          <View>
            <T v="heading" style={{ marginBottom: spacing.sm }}>
              {t("myCaravans")} ({mine.length})
            </T>
            {mine.length === 0 ? (
              <T v="caption" testID="caravans-mine-empty">
                {t("noCaravans")}
              </T>
            ) : (
              mine.map((m) => <MarchListCard key={m.march_id} m={m} />)
            )}
          </View>

          <Panel testID="caravans-detected">
            <Row style={s.kv}>
              <T v="heading">{t("detectedCaravans")}</T>
              <T v="caption">
                {t("searchRadius")} {search.data?.radius ?? d.search_radius}
              </T>
            </Row>
            {!d.interception_unlocked ? (
              <T v="caption" style={{ marginTop: 4, color: colors.muted }} testID="caravans-intercept-locked">
                {t("interceptLocked")}
              </T>
            ) : null}
            {search.isLoading ? (
              <Loading />
            ) : detected.length === 0 ? (
              <T v="caption" style={{ marginTop: spacing.sm }} testID="caravans-detected-empty">
                {t("noDetectedCaravans")}
              </T>
            ) : (
              detected.map((c) => <DetectedRow key={c.caravan_id} c={c} canIntercept={d.interception_unlocked} onIntercept={() => router.push({ pathname: "/caravan/intercept", params: { caravan: c.caravan_id } })} />)
            )}
          </Panel>
        </ScrollView>
      )}
    </Screen>
  );
}

function DetectedRow({ c, canIntercept, onIntercept }: { c: DetectedCaravan; canIntercept: boolean; onIntercept: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={s.detected} testID={`detected-caravan-${c.caravan_id}`}>
      <Row>
        {c.house_crest ? <Crest crest={c.house_crest} size={24} /> : <Icon name="truck-delivery" size={20} color={colors.factionEnemy} />}
        <View style={{ flex: 1 }}>
          <T v="label" numberOfLines={1} style={{ color: colors.onSurface }}>
            {c.house_name ?? t("foreignCaravan")}
          </T>
          <T v="caption" numberOfLines={1}>
            {t("position")} {c.position[0]},{c.position[1]} · {t("heading")} {c.heading ?? t("unknown")} · {c.escorted ? t("escorted") : t("unescorted")} · {t("intelScore")} {c.intel_score}
          </T>
        </View>
        <Countdown endsAt={c.arrival_at} testID={`detected-caravan-${c.caravan_id}-eta`} />
      </Row>
      <Row style={s.kv}>
        <T v="caption">
          {t("cargoEstimate")}: {c.cargo_band ? `${formatNumber(c.cargo_band[0])}–${formatNumber(c.cargo_band[1])}` : t("unknown")}
          {c.escort_band ? ` · ${t("caravanEscort")} ${formatNumber(c.escort_band[0])}–${formatNumber(c.escort_band[1])}` : ""}
        </T>
        <Button title={t("raidCaravan")} icon="sword" variant="secondary" disabled={!canIntercept} onPress={onIntercept} testID={`detected-caravan-${c.caravan_id}-intercept`} />
      </Row>
    </View>
  );
}
