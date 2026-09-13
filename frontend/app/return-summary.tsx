/**
 * «Riepilogo rientro» — what happened while the Lord was away (armed server-side after ≥ 6 h between two sessions).
 * Battles and castles, finished queues, marches home, missions, estimated production, important alerts, with shortcuts.
 */
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useReturnSeen, useReturnSummary } from "@/src/api/hooks";
import { BackButton } from "@/src/components/alliance/common";
import { Screen } from "@/src/components/overlay";
import { Button, CostRow, Icon, type IconName, Loading, Panel, Row, T } from "@/src/components/ui";
import { fmt, formatNumber, type StringKey, tDyn, useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  hero: { alignItems: "center", gap: 4, paddingVertical: spacing.md },
  crown: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", backgroundColor: c.brandTertiary, borderWidth: 2, borderColor: c.brandPrimary },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  stat: { flexBasis: "47%", flexGrow: 1, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceTertiary, padding: spacing.sm, gap: 2 },
  statWarn: { borderColor: c.warning },
  line: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingVertical: 4 },
  chip: { paddingHorizontal: 8, height: 22, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border, justifyContent: "center" },
}));

function Stat({ icon, label, value, warn, testID }: { icon: IconName; label: string; value: string; warn?: boolean; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[s.stat, warn && s.statWarn]} testID={testID}>
      <Row style={{ gap: 6 }}>
        <Icon name={icon} size={16} color={warn ? colors.warning : colors.brandPrimary} />
        <T v="caption">{label}</T>
      </Row>
      <T v="heading">{value}</T>
    </View>
  );
}

export default function ReturnSummaryScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { worldId } = useGame();
  const q = useReturnSummary(worldId);
  const seen = useReturnSeen(worldId ?? "");
  const d = q.data;
  const close = () => {
    if (d?.pending) seen.mutate();
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/map");
  };
  const quiet = d && d.battles.total === 0 && Object.values(d.jobs.counts).every((n) => !n) && d.marches.completed === 0 && d.missions_completed === 0 && d.alerts.length === 0;
  return (
    <Screen title={t("returnTitle")} testID="return-summary-screen" left={<BackButton testID="return-summary-back" onPress={close} />}>
      {!d ? (
        q.isError ? (
          <View style={{ padding: spacing.lg }}>
            <T v="body">{t("returnNothing")}</T>
            <Button title={t("returnOpen")} icon="map" style={{ marginTop: spacing.md }} onPress={close} testID="return-summary-open" />
          </View>
        ) : (
          <Loading />
        )
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}>
          <View style={s.hero}>
            <View style={s.crown}>
              <Icon name="crown" size={32} color={colors.brandPrimary} />
            </View>
            <T v="caption" testID="return-summary-away">
              {fmt(t("returnAway"), { h: d.hours_away })}
            </T>
          </View>

          {quiet ? (
            <Panel testID="return-summary-quiet">
              <T v="body">{t("returnNothing")}</T>
            </Panel>
          ) : null}

          <View style={s.grid}>
            <Stat icon="sword-cross" label={t("returnBattles")} value={`${d.battles.total} · ${d.battles.won} ${t("returnWon")} / ${d.battles.lost} ${t("returnLost")}`} warn={d.battles.lost > 0} testID="return-summary-battles" />
            <Stat icon="hammer-wrench" label={t("returnQueues")} value={String(Object.values(d.jobs.counts).reduce((a, b) => a + b, 0))} testID="return-summary-queues" />
            <Stat icon="flag-checkered" label={t("returnMarches")} value={String(d.marches.completed)} testID="return-summary-marches" />
            <Stat icon="compass-outline" label={t("returnMissions")} value={String(d.missions_completed)} testID="return-summary-missions" />
          </View>

          {d.marches.incoming_hostile > 0 ? (
            <Panel style={{ borderColor: colors.error }} testID="return-summary-incoming">
              <Row>
                <Icon name="alert-octagon" size={18} color={colors.error} />
                <T v="label" style={{ color: colors.error }}>
                  {t("returnIncoming")}: {d.marches.incoming_hostile}
                </T>
              </Row>
              <Button title={t("marches")} icon="flag" variant="danger" style={{ marginTop: spacing.sm }} onPress={() => router.push("/marches")} testID="return-summary-incoming-open" />
            </Panel>
          ) : null}

          {d.battles.castles_won.length || d.battles.castles_lost.length ? (
            <Panel testID="return-summary-castles">
              {d.battles.castles_won.map((c) => (
                <Pressable key={c.battle_id} style={s.line} onPress={() => router.push({ pathname: "/battle/[id]", params: { id: c.battle_id } })} testID={`return-summary-castle-won-${c.settlement_id}`}>
                  <Icon name="castle" size={16} color={colors.success} />
                  <T v="label" style={{ color: colors.success }}>
                    {t("returnCastlesWon")}: {c.name ?? c.settlement_id}
                  </T>
                  <Icon name="chevron-right" size={16} color={colors.muted} />
                </Pressable>
              ))}
              {d.battles.castles_lost.map((c) => (
                <Pressable key={c.battle_id} style={s.line} onPress={() => router.push({ pathname: "/battle/[id]", params: { id: c.battle_id } })} testID={`return-summary-castle-lost-${c.settlement_id}`}>
                  <Icon name="castle" size={16} color={colors.error} />
                  <T v="label" style={{ color: colors.error }}>
                    {t("returnCastlesLost")}: {c.name ?? c.settlement_id}
                  </T>
                  <Icon name="chevron-right" size={16} color={colors.muted} />
                </Pressable>
              ))}
            </Panel>
          ) : null}

          {d.battles.recent.length ? (
            <Panel testID="return-summary-recent">
              <T v="label">{t("returnBattles")}</T>
              {d.battles.recent.map((b) => (
                <Pressable key={b.battle_id} style={s.line} onPress={() => router.push({ pathname: "/battle/[id]", params: { id: b.battle_id } })} testID={`return-summary-battle-${b.battle_id}`}>
                  <Icon name={b.won ? "trophy" : "shield-off"} size={16} color={b.won ? colors.success : colors.error} />
                  <T v="caption" style={{ flex: 1 }}>
                    {b.attacker ? "⚔" : "🛡"} {b.target_name ?? ""} · {b.won ? t("returnWon") : t("returnLost")}
                  </T>
                  <Icon name="chevron-right" size={16} color={colors.muted} />
                </Pressable>
              ))}
            </Panel>
          ) : null}

          {Object.values(d.jobs.counts).some((n) => n > 0) ? (
            <Panel testID="return-summary-jobs">
              <T v="label">{t("returnQueues")}</T>
              {(["BUILDING", "RESEARCH", "RECRUIT", "SETTLEMENT"] as const).map((k) =>
                d.jobs.counts[k] ? (
                  <View key={k} style={{ marginTop: 6 }}>
                    <Row style={{ justifyContent: "space-between" }}>
                      <T v="caption">{tDyn(t, `jobKind_${k}`, k)}</T>
                      <View style={s.chip}>
                        <T v="caption">{d.jobs.counts[k]}</T>
                      </View>
                    </Row>
                    <T v="caption" style={{ color: colors.onSurfaceSecondary }}>
                      {d.jobs.done[k].map((j) => `${j.target}${j.level ? ` L${j.level}` : ""}${j.count ? ` ×${j.count}` : ""}`).join(" · ")}
                    </T>
                  </View>
                ) : null,
              )}
            </Panel>
          ) : null}

          <Panel testID="return-summary-produced">
            <T v="label">{t("returnProduced")}</T>
            <CostRow cost={d.resources_produced} testID="return-summary-produced-row" />
          </Panel>

          {d.alerts.length ? (
            <Panel testID="return-summary-alerts">
              <T v="label">{t("returnAlerts")}</T>
              {d.alerts.map((a, i) => (
                <View key={i} style={s.line}>
                  <Icon name={a.severity === "CRITICAL" ? "alert-octagon" : "alert"} size={16} color={a.severity === "CRITICAL" ? colors.error : colors.warning} />
                  <T v="caption" style={{ flex: 1 }}>
                    {tDyn(t, `evt_${a.event}` as StringKey, a.event)}
                  </T>
                </View>
              ))}
              <Button title={t("returnSeeInbox")} icon="email-outline" variant="ghost" onPress={() => router.replace("/(tabs)/inbox")} testID="return-summary-inbox" />
            </Panel>
          ) : null}

          {d.unread ? (
            <T v="caption" style={{ textAlign: "center" }} testID="return-summary-unread">
              {fmt(t("returnUnread"), { n: formatNumber(d.unread) })}
            </T>
          ) : null}

          <Button title={t("returnOpen")} icon="map" onPress={close} testID="return-summary-open" />
        </ScrollView>
      )}
    </Screen>
  );
}
