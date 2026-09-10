import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBattle } from "@/src/api/hooks";
import { Screen } from "@/src/components/overlay";
import { CostRow, Icon, Loading, Panel, Row, T } from "@/src/components/ui";
import { formatNumber, useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  content: { padding: spacing.md, gap: spacing.md },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  side: { flex: 1, gap: 4 },
  table: { borderTopWidth: 1, borderColor: c.divider },
  tr: { flexDirection: "row", paddingVertical: 4, borderBottomWidth: 1, borderColor: c.divider },
  td: { flex: 1 },
  tdNum: { width: 64, alignItems: "flex-end" },
  banner: { padding: spacing.sm, borderRadius: radius.md, alignItems: "center" },
}));

function LossTable({ start, losses, s }: { start: Record<string, number>; losses: Record<string, number>; s: any }) {
  const { t } = useI18n();
  return (
    <View style={s.table}>
      <View style={s.tr}>
        <T v="caption" style={s.td}>
          {t("units")}
        </T>
        <T v="caption" style={s.tdNum}>
          #
        </T>
        <T v="caption" style={s.tdNum}>
          {t("losses")}
        </T>
        <T v="caption" style={s.tdNum}>
          {t("survivors")}
        </T>
      </View>
      {Object.entries(start).map(([u, c]) => (
        <View key={u} style={s.tr}>
          <T v="body" style={s.td} numberOfLines={1}>
            {u}
          </T>
          <T v="mono" style={[s.tdNum, { fontSize: 12 }]}>
            {formatNumber(c)}
          </T>
          <T v="mono" style={[s.tdNum, { fontSize: 12 }]}>
            {formatNumber(losses[u] ?? 0)}
          </T>
          <T v="mono" style={[s.tdNum, { fontSize: 12 }]}>
            {formatNumber(c - (losses[u] ?? 0))}
          </T>
        </View>
      ))}
    </View>
  );
}

export default function BattleReport() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { worldId, player } = useGame();
  const q = useBattle(worldId, id);
  const b = q.data;
  const r = b?.report;
  const iAmAttacker = b?.attacker_player_id === player?.player_id;
  const won = r && ((r.winner === "ATTACKER" && iAmAttacker) || (r.winner === "DEFENDER" && !iAmAttacker));

  return (
    <Screen
      title={t("battle")}
      testID="battle-report-screen"
      left={
        <Pressable style={s.back} onPress={() => router.back()} testID="battle-back-button">
          <Icon name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
      }
    >
      {!b || !r ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={[s.banner, { backgroundColor: won ? colors.success : colors.error }]} testID="battle-outcome">
            <T v="title" style={{ color: won ? colors.onSuccess : colors.onError }}>
              {t("winner")}: {r.winner === "ATTACKER" ? t("attacker") : t("defender")}
            </T>
            <T v="caption" style={{ color: won ? colors.onSuccess : colors.onError }}>
              {b.mission} · {b.target_name} ({b.target_xy?.join(",")}) · {new Date(b.created_at).toLocaleString(lang)}
            </T>
          </View>

          <Panel testID="battle-power">
            <Row style={{ justifyContent: "space-between" }}>
              <View style={s.side}>
                <T v="label">{t("attacker")}</T>
                <T v="mono">{formatNumber(r.attacker_power)}</T>
                <T v="caption">RNG ×{r.rng?.attacker}</T>
              </View>
              <Icon name="sword-cross" size={24} color={colors.brandPrimary} />
              <View style={[s.side, { alignItems: "flex-end" }]}>
                <T v="label">{t("defender")}</T>
                <T v="mono">{formatNumber(r.defender_power)}</T>
                <T v="caption">RNG ×{r.rng?.defender}</T>
              </View>
            </Row>
            <T v="caption" style={{ marginTop: 6 }}>
              {t("terrain")} {r.terrain} +{Math.round((r.modifiers?.terrain_bonus ?? 0) * 100)}% · {t("wall")} +{((r.modifiers?.wall_def_bonus_effective ?? 0) * 100).toFixed(1)}%
              {r.wall?.before ? ` · HP ${formatNumber(r.wall.before.current_hp)} → ${formatNumber(r.wall.after.current_hp)}` : ""}
              {r.reason ? ` · ${r.reason}` : ""}
            </T>
            {r.winner_loss_fraction != null ? <T v="caption">loss fraction {(r.winner_loss_fraction * 100).toFixed(1)}%</T> : null}
          </Panel>

          <Panel testID="battle-attacker-table">
            <T v="heading">{t("attacker")}</T>
            <LossTable start={r.attacker_start} losses={r.attacker_losses} s={s} />
            {Object.values(r.wall_static_losses || {}).some((v: any) => v > 0) ? (
              <T v="caption" style={{ marginTop: 4 }}>
                {t("wall")} static: {Object.entries(r.wall_static_losses).map(([u, v]) => `${u} ${v}`).join(", ")}
              </T>
            ) : null}
          </Panel>
          <Panel testID="battle-defender-table">
            <T v="heading">{t("defender")}</T>
            <LossTable start={r.defender_start} losses={r.defender_losses} s={s} />
          </Panel>

          {b.loot && Object.keys(b.loot).length ? (
            <Panel testID="battle-loot">
              <T v="heading">{t("loot")}</T>
              <CostRow cost={b.loot} />
            </Panel>
          ) : null}
          {b.ownership_result?.changed ? (
            <Panel testID="battle-ownership">
              <Row>
                <Icon name="crown" size={20} color={colors.brandPrimary} />
                <T v="heading">
                  {t("conquered")} · L{b.ownership_result.new_level}
                </T>
              </Row>
            </Panel>
          ) : null}
          <T v="caption">
            {t("seed")}: {r.seed} · {b.battle_id}
            {b.ships_excluded ? ` · ${t("ships")} ${b.ships_excluded} (no casualties)` : ""}
          </T>
        </ScrollView>
      )}
    </Screen>
  );
}
