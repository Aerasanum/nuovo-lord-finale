import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type ChronicleEntry, type MissionCatalogEntry, type MissionDto, type ProgressTrack, useChronicle, useHouse, useMissions } from "@/src/api/hooks";
import { useCinematic } from "@/src/components/cinematic/Cinematic";
import { introSpec } from "@/src/components/cinematic/IntroGate";
import { Crest } from "@/src/components/Crest";
import { hasMissionArt, MissionBanner } from "@/src/components/MissionArt";
import { Screen } from "@/src/components/overlay";
import { Button, Chip, Countdown, Empty, Icon, Loading, Panel, ProgressBar, Row, T } from "@/src/components/ui";
import { missionDesc, missionName, requirementLines, rewardLines } from "@/src/game/missions";
import { fmt, formatNumber, type StringKey, tDyn, useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  content: { padding: spacing.md, gap: spacing.md },
  tabs: { flexDirection: "row", paddingHorizontal: spacing.md, gap: spacing.sm, height: 56, alignItems: "center" },
  card: { gap: 6 },
  kv: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pill: { paddingHorizontal: 8, height: 22, borderRadius: radius.pill, justifyContent: "center" },
  slot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: c.borderStrong },
  trackRow: { gap: 4, paddingVertical: 6 },
  chrRow: { flexDirection: "row", gap: spacing.sm, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border },
  histRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
}));

type Seg = "missions" | "house" | "chronicle";

/** Missioni tab (Bible §22 / §39): personal missions, Casata progression (Prestige, achievement tiers, titles) and the World Chronicle. */
export default function MissionsScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { worldId, player, world } = useGame();
  const cinematic = useCinematic();
  const q = useMissions(worldId);
  const chr = useChronicle(worldId);
  const house = useHouse(worldId);
  const [seg, setSeg] = useState<Seg>("missions");
  if (!worldId) return null;
  const data = q.data;

  const statusOf = (m: MissionCatalogEntry): { label: string; color: string; kind: "active" | "cooldown" | "ready" } => {
    if (m.active_mission_id) return { label: t("missionInProgress"), color: colors.brandPrimary, kind: "active" };
    if (m.cooldown_until && new Date(m.cooldown_until).getTime() > Date.now()) return { label: t("missionOnCooldown"), color: colors.warning, kind: "cooldown" };
    return { label: t("missionReady"), color: colors.success, kind: "ready" };
  };

  const renderMissions = () => {
    if (!data) return <Loading />;
    return (
      <View style={s.content}>
        <Panel testID="missions-active-panel">
          <Row style={s.kv}>
            <T v="heading">{t("activeMissions")}</T>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }} testID="missions-slots">
              <T v="caption">{t("missionSlots")}</T>
              {Array.from({ length: data.max_simultaneous }).map((_, i) => (
                <View key={i} style={[s.slot, i < data.active.length && { backgroundColor: colors.brandPrimary }]} />
              ))}
            </View>
          </Row>
          {data.active.length === 0 ? (
            <T v="caption" style={{ marginTop: 6 }} testID="missions-none-active">
              {t("noActiveMissions")}
            </T>
          ) : (
            data.active.map((m) => <ActiveMission key={m.mission_id} m={m} />)
          )}
        </Panel>

        <T v="heading">{t("missionCatalog")}</T>
        {data.catalog.map((m) => {
          const st = statusOf(m);
          const desc = missionDesc(t, m.key);
          const withArt = hasMissionArt(m.key);
          const statusPill = (
            <View style={[s.pill, { backgroundColor: st.color }]} testID={`mission-card-${m.key}-status`}>
              <T v="caption" style={{ color: colors.surface }}>
                {st.label}
              </T>
            </View>
          );
          return (
            <Panel key={m.key} testID={`mission-card-${m.key}`}>
              <View style={s.card}>
                {withArt ? (
                  <MissionBanner missionKey={m.key} title={missionName(t, m.key, m.name)} right={statusPill} testID={`mission-card-${m.key}-art`} />
                ) : (
                  <Row style={s.kv}>
                    <T v="label" style={{ color: colors.onSurface }}>
                      {missionName(t, m.key, m.name)}
                    </T>
                    {statusPill}
                  </Row>
                )}
                {desc ? <T v="caption">{desc}</T> : null}
                <Row style={{ flexWrap: "wrap" }}>
                  <Icon name="clock-outline" size={14} color={colors.muted} />
                  <T v="caption">
                    {t("missionDuration")} {m.duration_hours}h · {t("missionCooldown")} {m.cooldown_hours}h
                  </T>
                </Row>
                <T v="caption" style={{ color: colors.onSurface }}>
                  {t("missionRequirements")}: {requirementLines(t, m).join(" · ") || "—"}
                </T>
                <T v="caption" style={{ color: colors.brandPrimary }}>
                  {t("missionReward")}: {rewardLines(t, m).join(" · ")}
                </T>
                {st.kind === "cooldown" ? (
                  <Row>
                    <T v="caption">{t("missionOnCooldown")}:</T>
                    <Countdown endsAt={m.cooldown_until} testID={`mission-card-${m.key}-cooldown`} />
                  </Row>
                ) : null}
                <Button title={t("missionStart")} icon="play" disabled={st.kind !== "ready" || data.slots_left <= 0} onPress={() => router.push({ pathname: "/mission/new", params: { key: m.key } })} testID={`mission-card-${m.key}-start`} />
              </View>
            </Panel>
          );
        })}

        {data.history.length ? (
          <Panel testID="missions-history">
            <T v="heading" style={{ marginBottom: 4 }}>
              {t("missionHistory")}
            </T>
            {data.history.map((m) => (
              <View key={m.mission_id} style={s.histRow} testID={`mission-history-${m.mission_id}`}>
                <T v="caption" style={{ color: colors.onSurface, flex: 1 }} numberOfLines={1}>
                  {missionName(t, m.key, m.name)} · {m.completed_at ? new Date(m.completed_at).toLocaleString(lang, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                </T>
                <T v="caption" style={{ color: colors.brandPrimary }}>
                  {m.reward_result?.disbanded ? "—" : `+${m.reward_result?.prestige ?? 0} ★`}
                </T>
              </View>
            ))}
          </Panel>
        ) : null}
        <T v="caption" style={{ color: colors.muted }}>
          {t("missionTroopsBusy")} {t("missionOverflowNote")}
        </T>
      </View>
    );
  };

  const renderHouse = () => {
    if (!data) return <Loading />;
    const p = data.progress;
    return (
      <View style={s.content}>
        <Panel testID="progress-panel">
          <Row style={{ gap: spacing.md }}>
            {house.data ? <Crest crest={house.data.house.crest} size={56} testID="progress-crest" /> : null}
            <View style={{ flex: 1 }}>
              <T v="heading">{player?.house_name}</T>
              <Row>
                <Icon name="star" size={16} color={colors.brandPrimary} />
                <T v="label" style={{ color: colors.brandPrimary }} testID="progress-prestige">
                  {t("prestige")} {formatNumber(p.prestige)}
                </T>
              </Row>
              <T v="caption" testID="progress-titles">
                {t("titles")}: {p.titles.length ? p.titles.join(" · ") : t("noTitles")}
              </T>
            </View>
          </Row>
        </Panel>
        <Panel testID="achievements-panel">
          <T v="heading" style={{ marginBottom: 4 }}>
            {t("achievements")}
          </T>
          {p.tracks.map((tr) => (
            <TrackRow key={tr.track} tr={tr} />
          ))}
        </Panel>
        <Panel testID="house-history-panel">
          <T v="heading" style={{ marginBottom: 4 }}>
            {t("houseHistory")}
          </T>
          {p.history.length === 0 ? <T v="caption">—</T> : null}
          {p.history.map((h, i) => (
            <View key={i} style={s.histRow}>
              <T v="caption" style={{ color: colors.onSurface, flex: 1 }} numberOfLines={1}>
                {h.kind === "PRESTIGE" ? tDyn(t, `prestigeReason_${h.reason}`, h.reason?.startsWith("mission_") ? missionName(t, h.reason.slice(8), h.reason.slice(8)) : (h.reason ?? "")) : `${tDyn(t, `track_${h.track}`, h.track ?? "")} · ${t("achievementTier")} ${h.tier}`}
              </T>
              <T v="caption" style={{ color: colors.brandPrimary }}>
                {h.kind === "PRESTIGE" ? `+${h.points} ★` : h.decoration}
              </T>
            </View>
          ))}
        </Panel>
      </View>
    );
  };

  const renderChronicle = () => {
    if (!chr.data) return <Loading />;
    const names = chr.data.house_names;
    const nm = (id?: string | null) => (id ? names[id] ?? id : "—");
    const line = (e: ChronicleEntry) => {
      const p = e.params;
      const key = (e.kind === "SETTLEMENT_CONQUERED" && p.pvp ? "chr_SETTLEMENT_CONQUERED_PVP" : `chr_${e.kind}`) as StringKey;
      const tpl = t(key);
      if (tpl === key) return `${e.kind} ${JSON.stringify(p).slice(0, 60)}`;
      return fmt(tpl, { a: nm(p.new_owner ?? p.player_id ?? p.attacker ?? e.actors[0]), b: nm(p.old_owner ?? p.defender ?? e.actors[1]), x: p.x ?? "", y: p.y ?? "", p: p.power ?? "" });
    };
    const rec = chr.data.records || {};
    return (
      <View style={s.content}>
        <Panel testID="records-panel">
          <T v="heading" style={{ marginBottom: 4 }}>
            {t("records")}
          </T>
          <View style={s.kv}>
            <T v="caption">{t("recordLargestBattle")}</T>
            <T v="caption" style={{ color: colors.onSurface }}>
              {rec.largest_battle ? `${formatNumber(rec.largest_battle.power)} · ${nm(rec.largest_battle.holder)}` : "—"}
            </T>
          </View>
          <View style={s.kv}>
            <T v="caption">{t("recordFirstMetropolis")}</T>
            <T v="caption" style={{ color: colors.onSurface }}>
              {rec.first_metropolis ? nm(rec.first_metropolis.player_id) : "—"}
            </T>
          </View>
        </Panel>
        <Panel testID="chronicle-panel">
          <Row style={{ justifyContent: "space-between", marginBottom: 4 }}>
            <T v="heading">{t("chronicle")}</T>
            <Button title={t("cinIntroReplay")} icon="movie-open-play" variant="ghost" onPress={() => cinematic.play(introSpec(player, world?.name ?? null))} testID="chronicle-intro-replay" />
          </Row>
          {chr.data.entries.length === 0 ? <Empty icon="book-open-variant" title={t("chronicleEmpty")} testID="chronicle-empty" /> : null}
          {chr.data.entries.map((e) => (
            <View key={e.chronicle_id} style={s.chrRow} testID={`chronicle-${e.chronicle_id}`}>
              <Icon name={e.kind === "LARGEST_BATTLE" ? "sword-cross" : e.kind === "FIRST_METROPOLIS" ? "city" : e.kind === "PATH_OF_CONQUERORS" ? "crown" : "flag"} size={18} color={colors.brandPrimary} />
              <View style={{ flex: 1 }}>
                <T v="body" style={{ color: colors.onSurface }}>
                  {line(e)}
                </T>
                <T v="caption">{new Date(e.at).toLocaleString(lang, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</T>
              </View>
            </View>
          ))}
        </Panel>
      </View>
    );
  };

  return (
    <Screen title={t("missions")} testID="missions-screen">
      <View style={s.tabs}>
        <Chip label={t("missions")} selected={seg === "missions"} onPress={() => setSeg("missions")} testID="missions-seg-missions" />
        <Chip label={t("missionsSegHouse")} selected={seg === "house"} onPress={() => setSeg("house")} testID="missions-seg-house" />
        <Chip label={t("missionsSegChronicle")} selected={seg === "chronicle"} onPress={() => setSeg("chronicle")} testID="missions-seg-chronicle" />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}>{seg === "missions" ? renderMissions() : seg === "house" ? renderHouse() : renderChronicle()}</ScrollView>
    </Screen>
  );
}

function ActiveMission({ m }: { m: MissionDto }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const total = Object.values(m.units).reduce((a, b) => a + b, 0);
  const started = m.started_at ? new Date(m.started_at).getTime() : Date.now();
  const ends = m.ends_at ? new Date(m.ends_at).getTime() : Date.now();
  const frac = ends > started ? Math.min(1, Math.max(0, (Date.now() - started) / (ends - started))) : 1;
  return (
    <View style={{ marginTop: spacing.sm, gap: 4 }} testID={`mission-active-${m.mission_id}`}>
      <Row style={{ justifyContent: "space-between" }}>
        <T v="label" style={{ color: colors.onSurface }}>
          {missionName(t, m.key, m.name)}
        </T>
        <Countdown endsAt={m.ends_at} testID={`mission-active-${m.mission_id}-eta`} />
      </Row>
      <ProgressBar value={frac} />
      <T v="caption">
        {formatNumber(total)} {t("units")} · {m.origin_xy ? `${m.origin_xy[0]},${m.origin_xy[1]}` : ""}
      </T>
    </View>
  );
}

function TrackRow({ tr }: { tr: ProgressTrack }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const prev = tr.tier > 0 ? tr.thresholds[tr.tier - 1] : 0;
  const next = tr.next_threshold ?? tr.thresholds[tr.thresholds.length - 1];
  const frac = next > prev ? Math.min(1, (tr.value - prev) / (next - prev)) : 1;
  return (
    <View style={s.trackRow} testID={`track-${tr.track}`}>
      <Row style={s.kv}>
        <T v="label" style={{ color: colors.onSurface }}>
          {tDyn(t, `track_${tr.track}`, tr.track)}
        </T>
        <Row>
          {Array.from({ length: tr.thresholds.length }).map((_, i) => (
            <Icon key={i} name={i < tr.tier ? "shield-star" : "shield-outline"} size={14} color={i < tr.tier ? colors.brandPrimary : colors.muted} />
          ))}
        </Row>
      </Row>
      <ProgressBar value={frac} />
      <Row style={s.kv}>
        <T v="caption">
          {formatNumber(tr.value)}
          {tr.next_threshold ? ` / ${formatNumber(tr.next_threshold)}` : ""}
        </T>
        <T v="caption">
          {tr.decoration} {tr.tier > 0 ? `· ${t("achievementTier")} ${tr.tier}` : ""}
        </T>
      </Row>
    </View>
  );
}
