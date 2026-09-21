import { useRouter } from "expo-router";
import React from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { DetectedCaravan } from "@/src/api/hooks";
import { useCaravanSearch } from "@/src/api/hooks";
import { Crest } from "@/src/components/Crest";
import { Screen } from "@/src/components/overlay";
import { Button, Countdown, Icon, LoadState, Panel, Row, T, useNow } from "@/src/components/ui";
import { fmt, formatNumber, useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { focusOnMap } from "@/src/utils/mapFocus";

/** "Carovane nei dintorni": foreign convoys travelling within the realm's search radius of the active settlement,
 * nearest first, each with a Raid (intercept) action and a "show on map" deep link. */
const useStyles = makeStyles((c) => ({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: c.glass, borderWidth: 1, borderColor: c.border },
  body: { padding: spacing.md, gap: spacing.md },
  row: { gap: spacing.sm },
  kv: { justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  dist: { minWidth: 56, alignItems: "flex-end" },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  empty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
}));

export default function NearbyCaravansScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { worldId, settlementId, settlement } = useGame();
  const q = useCaravanSearch(worldId, settlementId);
  if (!worldId || !settlementId) return null;
  const list = q.data?.caravans ?? [];
  const canRaid = !!q.data?.interception_unlocked;
  const showOnMap = (xy: [number, number]) => focusOnMap(router, xy[0], xy[1]);
  return (
    <Screen testID="nearby-caravans-screen">
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable style={s.back} onPress={() => router.back()} testID="nearby-caravans-back" accessibilityLabel={t("back")}>
          <Icon name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <T v="heading">{t("nearbyCaravans")}</T>
          <T v="caption" testID="nearby-caravans-radius">
            {settlement.data?.name ?? ""} · {t("searchRadius")}: {q.data?.radius ?? "—"} · {list.length}
          </T>
        </View>
        <Pressable style={s.back} onPress={() => q.refetch()} testID="nearby-caravans-refresh" accessibilityLabel={t("retry")}>
          <Icon name="refresh" size={22} color={colors.onSurface} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + spacing.xl }]} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.brandPrimary} />}>
        <T v="caption">{fmt(t("nearbyCaravansHint"), { r: q.data?.radius ?? 50 })}</T>
        <T v="caption">{t("reachHint")}</T>
        {!canRaid ? (
          <T v="caption" style={{ color: colors.warning }} testID="nearby-caravans-locked">
            {t("interceptLocked")}
          </T>
        ) : null}
        {q.isLoading || q.isError ? <LoadState query={q} /> : null}
        {!q.isLoading && !list.length ? (
          <Panel>
            <View style={s.empty}>
              <Icon name="binoculars" size={36} color={colors.muted} />
              <T v="body" style={{ textAlign: "center" }}>
                {t("noDetectedCaravans")}
              </T>
            </View>
          </Panel>
        ) : null}
        {list.map((c) => (
          <NearbyRow key={c.caravan_id} c={c} canRaid={canRaid} onRaid={() => router.push({ pathname: "/caravan/intercept", params: { caravan: c.caravan_id } })} onMap={() => showOnMap(c.position)} />
        ))}
      </ScrollView>
    </Screen>
  );
}

function NearbyRow({ c, canRaid, onRaid, onMap }: { c: DetectedCaravan; canRaid: boolean; onRaid: () => void; onMap: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const now = useNow();
  // feasibility estimate: fastest land unit (cavalry, 3 tiles/h) must reach the convoy before it is delivered
  const etaH = Math.max(0, (new Date(c.arrival_at).getTime() - now) / 3.6e6);
  const reachable = c.distance / 3 <= etaH;
  return (
    <Panel testID={`nearby-caravan-${c.caravan_id}`}>
      <View style={s.row}>
        <Row>
          {c.house_crest ? <Crest crest={c.house_crest} size={28} /> : <Icon name="truck-delivery" size={22} color={colors.factionEnemy} />}
          <View style={{ flex: 1 }}>
            <T v="label" numberOfLines={1} style={{ color: colors.onSurface }}>
              {c.house_name ?? t("foreignCaravan")}
            </T>
            <T v="caption" numberOfLines={2}>
              {t("position")} {c.position[0]},{c.position[1]}
              {c.target_xy ? ` · ${t("headingTo")} ${c.target_xy[0]},${c.target_xy[1]}` : ""} · {c.escorted ? t("escorted") : t("unescorted")} · {t("intelScore")} {c.intel_score}
            </T>
          </View>
          <View style={s.dist}>
            <T v="label" style={{ color: colors.brandPrimary }} testID={`nearby-caravan-${c.caravan_id}-distance`}>
              {c.distance}
            </T>
            <T v="caption">{t("distanceTiles")}</T>
            <T v="caption" style={{ color: reachable ? colors.success : colors.warning }} testID={`nearby-caravan-${c.caravan_id}-reach`}>
              {reachable ? t("reachable") : t("outOfReach")}
            </T>
          </View>
        </Row>
        <Row style={s.kv}>
          <T v="caption">
            {t("cargoEstimate")}: {c.cargo_band ? `${formatNumber(c.cargo_band[0])}–${formatNumber(c.cargo_band[1])}` : t("unknown")}
            {c.escort_band ? ` · ${t("caravanEscortShort")} ${formatNumber(c.escort_band[0])}–${formatNumber(c.escort_band[1])}` : ""}
          </T>
          <Countdown endsAt={c.arrival_at} testID={`nearby-caravan-${c.caravan_id}-eta`} />
        </Row>
        <View style={s.actions}>
          <Button title={t("showOnMap")} icon="map-marker-radius" variant="secondary" style={{ flex: 1 }} onPress={onMap} testID={`nearby-caravan-${c.caravan_id}-map`} />
          <Button title={t("raidCaravan")} icon="sword" style={{ flex: 1 }} disabled={!canRaid} onPress={onRaid} testID={`nearby-caravan-${c.caravan_id}-raid`} />
        </View>
      </View>
    </Panel>
  );
}
