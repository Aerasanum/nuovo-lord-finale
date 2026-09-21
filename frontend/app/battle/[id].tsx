import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBattle } from "@/src/api/hooks";
import { type CinematicSpec, useCinematic } from "@/src/components/cinematic/Cinematic";
import { Screen } from "@/src/components/overlay";
import { Button, CostRow, Icon, LoadState, Panel, Row, T } from "@/src/components/ui";
import { UNIT_ICON } from "@/src/game/units";
import { formatNumber, tDyn, useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { storage } from "@/src/utils/storage";

const SEEN_KEY = "eld.cinematic.conquest.seen";

const useStyles = makeStyles((c) => ({
  content: { padding: spacing.md, gap: spacing.md },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  side: { flex: 1, gap: 4 },
  table: { borderTopWidth: 1, borderColor: c.divider },
  tr: { flexDirection: "row", paddingVertical: 4, alignItems: "center" },
  trUnit: { borderBottomWidth: 1, borderColor: c.divider, paddingBottom: 4 },
  td: { flex: 1 },
  tdNum: { width: 64, alignItems: "flex-end", textAlign: "right" },
  bar: { height: 4, borderRadius: 2, backgroundColor: c.surfaceTertiary, overflow: "hidden" },
  barFill: { height: 4, borderRadius: 2 },
  banner: { padding: spacing.md, borderRadius: radius.lg, alignItems: "center", gap: 4, borderWidth: 1 },
  powerBar: { height: 12, borderRadius: 6, overflow: "hidden", flexDirection: "row", backgroundColor: c.surfaceTertiary, marginTop: spacing.sm },
  sideHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  modChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, height: 24, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border },
  mods: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm },
}));

function LossTable({ start, losses, s, tone }: { start: Record<string, number>; losses: Record<string, number>; s: any; tone: string }) {
  const { t } = useI18n();
  const { colors } = useTheme();
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
      {Object.entries(start).map(([u, c]) => {
        const lost = losses[u] ?? 0;
        const alive = Math.max(0, c - lost);
        return (
          <View key={u} style={s.trUnit}>
            <View style={s.tr}>
              <Row style={[s.td, { gap: 6 }]}>
                <Icon name={UNIT_ICON[u] ?? "sword"} size={16} color={tone} />
                <T v="body" numberOfLines={1} style={{ flex: 1 }}>
                  {tDyn(t, `unit_${u}`, u)}
                </T>
              </Row>
              <T v="mono" style={[s.tdNum, { fontSize: 12 }]}>
                {formatNumber(c)}
              </T>
              <T v="mono" style={[s.tdNum, { fontSize: 12, color: lost ? colors.error : colors.onSurfaceSecondary }]}>
                {lost ? `-${formatNumber(lost)}` : "0"}
              </T>
              <T v="mono" style={[s.tdNum, { fontSize: 12, color: colors.success }]}>
                {formatNumber(alive)}
              </T>
            </View>
            <View style={s.bar}>
              <View style={[s.barFill, { width: `${c ? Math.round((alive / c) * 100) : 0}%`, backgroundColor: tone }]} />
            </View>
          </View>
        );
      })}
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
  const attTone = iAmAttacker ? colors.factionOwn : colors.factionEnemy;
  const defTone = iAmAttacker ? colors.factionEnemy : colors.factionOwn;
  const attShare = r ? Math.round((100 * (r.attacker_power || 0)) / Math.max(1, (r.attacker_power || 0) + (r.defender_power || 0))) : 50;
  const cinematic = useCinematic();
  const conquered = !!b?.ownership_result?.changed && iAmAttacker;
  const autoPlayed = useRef(false);
  const missionLabel = (m: string) => ({ ATTACK: t("missionAttack"), RAID: t("missionRaid"), CONQUEST: t("missionConquest"), REINFORCE: t("missionReinforce"), RAINBOW_BRIDGE: t("missionRainbow") })[m] ?? m;
  const buildSpec = (kind: CinematicSpec["kind"]): CinematicSpec | null => {
    if (!b || !r) return null;
    const mine = iAmAttacker;
    const units = kind === "CONQUEST" ? r.attacker_survivors ?? {} : mine ? r.attacker_start ?? {} : r.defender_start ?? {};
    const crest = mine ? (player?.house?.crest ?? null) : null;
    return { kind, units, rainbow: b.mission === "RAINBOW_BRIDGE", missionLabel: missionLabel(b.mission), targetName: b.target_name, etaSeconds: null, crest, houseName: mine ? (player?.house_name ?? null) : (b.attacker_house_name ?? null), allianceTag: mine ? (player?.alliance?.tag ?? null) : (b.attacker_alliance_tag ?? null), pyramid: !!b.target_pyramid, newLevel: b.ownership_result?.new_level ?? null };
  };
  // Conquest Success (Bible §41.2): auto-play once per battle when the owner change was committed in my favour
  useEffect(() => {
    if (!conquered || autoPlayed.current || !b) return;
    autoPlayed.current = true;
    storage.getItem<string>(SEEN_KEY, "[]").then((raw) => {
      const seen: string[] = JSON.parse(raw || "[]");
      if (seen.includes(b.battle_id)) return;
      storage.setItem(SEEN_KEY, JSON.stringify([...seen, b.battle_id].slice(-50)));
      const spec = buildSpec("CONQUEST");
      if (spec) cinematic.play(spec);
    });
  }, [conquered, b]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <LoadState query={q} />
      ) : (
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={[s.banner, { backgroundColor: won ? colors.success : colors.error, borderColor: colors.brandPrimary }]} testID="battle-outcome">
            <Icon name={won ? "trophy" : "shield-off"} size={28} color={won ? colors.onSuccess : colors.onError} />
            <T v="title" style={{ color: won ? colors.onSuccess : colors.onError }}>
              {won ? t("victory") : t("defeat")}
            </T>
            <T v="caption" style={{ color: won ? colors.onSuccess : colors.onError }}>
              {t("winner")}: {r.winner === "ATTACKER" ? t("attacker") : t("defender")} · {missionLabel(b.mission)} · {b.target_name} ({b.target_xy?.join(",")})
            </T>
            <T v="caption" style={{ color: won ? colors.onSuccess : colors.onError }}>
              {new Date(b.created_at).toLocaleString(lang)}
            </T>
          </View>

          <Panel testID="battle-power">
            <Row style={{ justifyContent: "space-between" }}>
              <View style={s.side}>
                <View style={s.sideHead}>
                  <Icon name="sword" size={16} color={attTone} />
                  <T v="label">{t("attacker")}</T>
                </View>
                <T v="mono" style={{ color: attTone }}>
                  {formatNumber(r.attacker_power)}
                </T>
                <T v="caption">
                  {b.attacker_house_name ?? ""}
                  {b.attacker_alliance_tag ? ` [${b.attacker_alliance_tag}]` : ""} · {t("luckRoll")} ×{r.rng?.attacker}
                </T>
              </View>
              <Icon name="sword-cross" size={28} color={colors.brandPrimary} />
              <View style={[s.side, { alignItems: "flex-end" }]}>
                <View style={s.sideHead}>
                  <T v="label">{t("defender")}</T>
                  <Icon name="shield" size={16} color={defTone} />
                </View>
                <T v="mono" style={{ color: defTone }}>
                  {formatNumber(r.defender_power)}
                </T>
                <T v="caption">
                  {b.defender_alliance_tag ? `[${b.defender_alliance_tag}] · ` : ""}
                  {t("luckRoll")} ×{r.rng?.defender}
                </T>
              </View>
            </Row>
            <View style={s.powerBar} testID="battle-power-bar">
              <View style={{ width: `${attShare}%`, backgroundColor: attTone }} />
              <View style={{ flex: 1, backgroundColor: defTone }} />
            </View>
            <View style={s.mods}>
              <View style={s.modChip}>
                <Icon name="terrain" size={14} color={colors.onSurfaceSecondary} />
                <T v="caption">
                  {tDyn(t, String(r.terrain ?? ""), String(r.terrain ?? ""))} +{Math.round((r.modifiers?.terrain_bonus ?? 0) * 100)}%
                </T>
              </View>
              <View style={s.modChip}>
                <Icon name="wall" size={14} color={colors.onSurfaceSecondary} />
                <T v="caption">
                  {t("wall")} +{((r.modifiers?.wall_def_bonus_effective ?? 0) * 100).toFixed(1)}%
                  {r.wall?.before ? ` · HP ${formatNumber(r.wall.before.current_hp)} → ${formatNumber(r.wall.after.current_hp)}` : ""}
                </T>
              </View>
              {r.reason ? (
                <View style={s.modChip}>
                  <Icon name="information-outline" size={14} color={colors.onSurfaceSecondary} />
                  <T v="caption">{tDyn(t, `battleReason_${r.reason}`, String(r.reason).replace(/_/g, " ").toLowerCase())}</T>
                </View>
              ) : null}
              {r.winner_loss_fraction != null ? (
                <View style={s.modChip}>
                  <Icon name="percent" size={14} color={colors.onSurfaceSecondary} />
                  <T v="caption">
                    {t("winnerLossFraction")} {(r.winner_loss_fraction * 100).toFixed(1)}%
                  </T>
                </View>
              ) : null}
            </View>
          </Panel>

          <Panel testID="battle-attacker-table">
            <Row style={{ gap: 6 }}>
              <Icon name="sword" size={18} color={attTone} />
              <T v="heading">{t("attacker")}</T>
            </Row>
            <LossTable start={r.attacker_start} losses={r.attacker_losses} s={s} tone={attTone} />
            {Object.values(r.wall_static_losses || {}).some((v: any) => v > 0) ? (
              <T v="caption" style={{ marginTop: 4 }}>
                {t("wall")}: {Object.entries(r.wall_static_losses).map(([u, v]) => `${tDyn(t, `unit_${u}`, u)} ${v}`).join(", ")}
              </T>
            ) : null}
          </Panel>
          <Panel testID="battle-defender-table">
            <Row style={{ gap: 6 }}>
              <Icon name="shield" size={18} color={defTone} />
              <T v="heading">{t("defender")}</T>
            </Row>
            <LossTable start={r.defender_start} losses={r.defender_losses} s={s} tone={defTone} />
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
                  {t("conquered")}
                  {b.ownership_result.new_level ? ` · L${b.ownership_result.new_level}` : b.target_pyramid ? ` · ${t("pyramid")}` : ""}
                </T>
              </Row>
            </Panel>
          ) : null}
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button title={t("cinReplayDeparture")} icon="movie-open-play" variant="secondary" style={{ flex: 1 }} onPress={() => { const sp = buildSpec("DEPARTURE"); if (sp) cinematic.play(sp); }} testID="battle-cinematic-departure" />
            {conquered ? <Button title={t("cinReplay")} icon="crown" style={{ flex: 1 }} onPress={() => { const sp = buildSpec("CONQUEST"); if (sp) cinematic.play(sp); }} testID="battle-cinematic-conquest" /> : null}
          </View>
          {b.ships_excluded ? (
            <T v="caption">
              {t("ships")} {b.ships_excluded} · {t("shipsNoCasualties")}
            </T>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}
