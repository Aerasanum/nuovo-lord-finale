import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePyramid } from "@/src/api/hooks";
import { BackButton } from "@/src/components/alliance/common";
import { Screen } from "@/src/components/overlay";
import { PyramidActions, PyramidPhase, PyramidStatePill, pyramidDescription } from "@/src/components/PyramidCard";
import { Countdown, Divider, Icon, Loading, Panel, Row, T } from "@/src/components/ui";
import { fmt, formatNumber, useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  content: { padding: spacing.md, gap: spacing.md },
  hero: { gap: spacing.sm },
  heroTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  heroIcon: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.borderStrong },
  stat: { flex: 1, minWidth: 100, backgroundColor: c.surfaceTertiary, borderRadius: radius.md, padding: spacing.sm, gap: 2 },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  unitRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  rewardRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6 },
  rewardVal: { minWidth: 56, alignItems: "flex-end" },
  step: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  stepDot: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", marginTop: 2 },
  stepLine: { position: "absolute", left: 12, top: 28, bottom: -8, width: 2, backgroundColor: c.border },
  histRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 8 },
  battleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 8 },
  rewardBanner: { backgroundColor: c.brandTertiary, borderColor: c.borderStrong },
  incoming: { backgroundColor: c.surfaceTertiary, borderRadius: radius.sm, padding: spacing.sm, gap: 4 },
}));

/** Pyramid endgame (Bible §21): cycle state, deadlines, holder & garrison, rewards, timeline and history. */
export default function PyramidScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { worldId } = useGame();
  const q = usePyramid(worldId);
  const d = q.data;

  const goMarch = (mission: "ATTACK" | "REINFORCE") => router.push({ pathname: "/march/new", params: { pyramid: "1", mission } });
  const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(lang, { dateStyle: "medium", timeStyle: "short" }) : "—");

  return (
    <Screen title={t("pyramidTitle")} left={<BackButton testID="pyramid-back" />} testID="pyramid-screen">
      {!d ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.xl }]}>
          {/* hero */}
          <Panel style={s.hero} testID="pyramid-hero">
            <View style={s.heroTop}>
              <View style={s.heroIcon}>
                <Icon name="pyramid" size={30} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <T v="heading" testID="pyramid-name">
                  {d.name}
                </T>
                <T v="caption">
                  {fmt(t("pyramidSubtitle"), { cycle: d.cycle_id })} · {d.anchor[0]},{d.anchor[1]} · {d.footprint[0]}×{d.footprint[1]}
                </T>
              </View>
              <PyramidStatePill dto={d} testID="pyramid-state-pill" />
            </View>
            <T v="body" testID="pyramid-description">
              {pyramidDescription(t, d)}
            </T>
            <PyramidPhase dto={d} testID="pyramid-phase" />
            {d.owner ? (
              <Row>
                <Icon name="crown" size={16} color={d.faction === "OWN" ? colors.factionOwn : colors.factionEnemy} />
                <T v="caption" testID="pyramid-holder">
                  {t("pyramidHolder")}: [{d.owner.tag}] {d.owner.name}
                </T>
              </Row>
            ) : null}
            <PyramidActions dto={d} onAttack={() => goMarch("ATTACK")} onReinforce={() => goMarch("REINFORCE")} />
          </Panel>

          {/* my reward window */}
          {d.me.reward ? (
            <Panel style={s.rewardBanner} testID="pyramid-my-reward">
              <Row>
                <Icon name="star-four-points" size={18} color={colors.onBrandTertiary} />
                <View style={{ flex: 1 }}>
                  <T v="label" style={{ color: colors.onBrandTertiary }}>
                    {t("pyramidYourReward")}
                  </T>
                  <T v="caption" style={{ color: colors.onBrandTertiary }}>
                    +{d.me.reward.production_pct}% {t("pyramidRewardProduction").toLowerCase()} · +{d.me.reward.research_pct}% {t("research").toLowerCase()} · +{d.me.reward.training_pct}% {t("pyramidRewardTraining").toLowerCase()} · +{d.me.reward.caravan_capacity_pct}% {t("caravans").toLowerCase()}
                  </T>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <T v="caption" style={{ color: colors.onBrandTertiary }}>
                    {t("pyramidYourRewardUntil")}
                  </T>
                  <Countdown endsAt={d.me.reward.until} style={{ color: colors.onBrandTertiary }} />
                </View>
              </Row>
            </Panel>
          ) : null}

          {/* garrison */}
          <Panel testID="pyramid-garrison">
            <Row>
              <Icon name="shield-sword" size={18} color={colors.onSurface} />
              <T v="heading" style={{ flex: 1 }}>
                {d.owner ? t("pyramidGarrison") : t("pyramidGuardian")}
              </T>
              <T v="mono" testID="pyramid-garrison-total">
                {formatNumber(d.garrison_total)}
              </T>
            </Row>
            <View style={s.stats}>
              {d.guardian && !d.owner ? (
                <View style={s.stat}>
                  <T v="caption">{t("pyramidGuardianPower")}</T>
                  <T v="mono">{formatNumber(Math.round(d.guardian.target_power ?? 0))}</T>
                </View>
              ) : null}
              <View style={s.stat}>
                <T v="caption">{t("pyramidGarrisonCap")}</T>
                <T v="mono">{formatNumber(d.garrison_cap)}</T>
              </View>
              <View style={s.stat}>
                <T v="caption">{t("pyramidParticipants")}</T>
                <T v="mono">{d.participants}</T>
              </View>
            </View>
            {d.garrison ? (
              <View style={{ marginTop: spacing.sm }}>
                {Object.entries(d.garrison).map(([u, n]) => (
                  <View key={u} style={s.unitRow}>
                    <T v="body">{u}</T>
                    <T v="mono">{formatNumber(n)}</T>
                  </View>
                ))}
              </View>
            ) : (
              <T v="caption" style={{ marginTop: spacing.sm, color: colors.muted }}>
                {t("pyramidGarrisonHidden")}
              </T>
            )}
            {Object.keys(d.me.my_garrison).length ? (
              <>
                <Divider />
                <T v="caption">{t("pyramidMyGarrison")}</T>
                {Object.entries(d.me.my_garrison).map(([u, n]) => (
                  <View key={u} style={s.unitRow}>
                    <T v="body">{u}</T>
                    <T v="mono">{formatNumber(n)}</T>
                  </View>
                ))}
              </>
            ) : null}
            {d.incoming.length ? (
              <View style={[s.incoming, { marginTop: spacing.sm }]} testID="pyramid-incoming">
                <Row>
                  <Icon name="alert" size={14} color={colors.warning} />
                  <T v="label">
                    {t("pyramidIncoming")}: {d.incoming.length}
                  </T>
                </Row>
                {d.incoming.slice(0, 5).map((m) => (
                  <Row key={m.march_id}>
                    <T v="caption" style={{ flex: 1 }}>
                      {m.attacker_alliance_tag ? `[${m.attacker_alliance_tag}]` : "?"} · {t("pyramidAlertEta")}
                    </T>
                    <Countdown endsAt={m.arrival_at} style={{ color: colors.warning }} />
                  </Row>
                ))}
              </View>
            ) : null}
          </Panel>

          {/* rewards */}
          <Panel testID="pyramid-rewards">
            <Row>
              <Icon name="trophy" size={18} color={colors.brandPrimary} />
              <T v="heading" style={{ flex: 1 }}>
                {t("pyramidRewards")}
              </T>
            </Row>
            <T v="caption">{fmt(t("pyramidRewardDays"), { days: d.config.reward_days })}</T>
            {[
              ["sprout", t("pyramidRewardProduction"), `+${d.config.reward.production_pct}%`],
              ["flask", t("pyramidRewardResearch"), `+${d.config.reward.research_pct}%`],
              ["sword", t("pyramidRewardTraining"), `+${d.config.reward.training_pct}%`],
              ["truck", t("pyramidRewardCaravans"), `+${d.config.reward.caravan_capacity_pct}%`],
              ["crown", t("pyramidRewardTitle"), d.config.title],
              ["diamond-stone", `${t("pyramidRewardEmeralds")} · ${t("pyramidParticipation")} / ${t("pyramidVictory")}`, `${formatNumber(d.config.emeralds.participation)} / ${formatNumber(d.config.emeralds.victory)}`],
              ["star", `${t("pyramidRewardPrestige")} · ${t("pyramidParticipation")} / ${t("pyramidVictory")}`, `+${d.config.prestige.participation} / +${d.config.prestige.victory}`],
            ].map(([icon, label, val]) => (
              <View key={label} style={s.rewardRow}>
                <Icon name={icon as any} size={16} color={colors.onSurfaceSecondary} />
                <T v="body" style={{ flex: 1 }}>
                  {label}
                </T>
                <View style={s.rewardVal}>
                  <T v="mono" style={{ color: colors.brandPrimary }}>
                    {val}
                  </T>
                </View>
              </View>
            ))}
          </Panel>

          {/* cycle timeline */}
          <Panel testID="pyramid-cycle">
            <Row>
              <Icon name="timeline-clock-outline" size={18} color={colors.onSurface} />
              <T v="heading" style={{ flex: 1 }}>
                {t("pyramidCycle")}
              </T>
            </Row>
            {[
              { k: "OPEN", icon: "fire", title: t("pyramidCycleOpen"), desc: t("pyramidCycleOpenDesc"), active: d.state === "OPEN" && !d.owner },
              { k: "HOLD", icon: "timer-sand", title: t("pyramidCycleHold"), desc: fmt(t("pyramidCycleHoldDesc"), { hours: d.config.hold_hours }), active: d.state === "OPEN" && !!d.owner },
              { k: "LOCK", icon: "trophy", title: t("pyramidCycleLock"), desc: fmt(t("pyramidCycleLockDesc"), { days: d.config.reward_days }), active: d.state === "REWARD_LOCK" },
              { k: "DORMANT", icon: "sleep", title: t("pyramidCycleDormant"), desc: fmt(t("pyramidCycleDormantDesc"), { days: d.config.dormant_days }), active: d.state === "DORMANT" || d.state === "DORMANT_INITIAL" },
            ].map((st, i, arr) => (
              <View key={st.k} style={[s.step, { paddingVertical: 6, position: "relative" }]}>
                {i < arr.length - 1 ? <View style={s.stepLine} /> : null}
                <View style={[s.stepDot, { backgroundColor: st.active ? colors.brandPrimary : colors.surfaceTertiary }]}>
                  <Icon name={st.icon as any} size={14} color={st.active ? colors.onBrand : colors.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <T v="label" style={st.active ? { color: colors.brandPrimary } : undefined}>
                    {st.title}
                  </T>
                  <T v="caption">{st.desc}</T>
                </View>
              </View>
            ))}
          </Panel>

          {/* recent battles */}
          <Panel testID="pyramid-battles">
            <Row>
              <Icon name="sword-cross" size={18} color={colors.onSurface} />
              <T v="heading" style={{ flex: 1 }}>
                {t("pyramidRecentBattles")}
              </T>
            </Row>
            {d.recent_battles.length === 0 ? (
              <T v="caption">{t("pyramidNoBattles")}</T>
            ) : (
              d.recent_battles.map((b) => (
                <Pressable key={b.battle_id} style={s.battleRow} onPress={() => b.mine && router.push({ pathname: "/battle/[id]", params: { id: b.battle_id } })} disabled={!b.mine} testID={`pyramid-battle-${b.battle_id}`}>
                  <Icon name={b.captured ? "flag-variant" : b.winner === "ATTACKER" ? "sword" : "shield-check"} size={16} color={b.captured ? colors.brandPrimary : b.winner === "ATTACKER" ? colors.error : colors.success} />
                  <View style={{ flex: 1 }}>
                    <T v="body" numberOfLines={1}>
                      {b.attacker_alliance_tag ? `[${b.attacker_alliance_tag}] ` : ""}
                      {b.attacker_house_name ?? "?"} → {b.defender_alliance_tag ? `[${b.defender_alliance_tag}]` : t("pyramidGuardian")}
                    </T>
                    <T v="caption">
                      {b.captured ? t("pyramidCaptured") : b.winner === "ATTACKER" ? t("victory") : t("pyramidRepelled")} · −{formatNumber(b.attacker_losses)} / −{formatNumber(b.defender_losses)} · {fmtDate(b.at)}
                    </T>
                  </View>
                  {b.mine ? <Icon name="chevron-right" size={18} color={colors.muted} /> : null}
                </Pressable>
              ))
            )}
          </Panel>

          {/* winners */}
          <Panel testID="pyramid-history">
            <Row>
              <Icon name="history" size={18} color={colors.onSurface} />
              <T v="heading" style={{ flex: 1 }}>
                {t("pyramidHistory")}
              </T>
            </Row>
            {d.history.length === 0 ? (
              <T v="caption">{t("pyramidNoHistory")}</T>
            ) : (
              d.history.map((h) => (
                <View key={h.cycle_id} style={s.histRow}>
                  <Icon name="crown" size={16} color={colors.brandPrimary} />
                  <View style={{ flex: 1 }}>
                    <T v="body">
                      [{h.tag}] {h.name}
                    </T>
                    <T v="caption">
                      {fmt(t("pyramidSubtitle"), { cycle: h.cycle_id })} · {h.member_count} {t("members").toLowerCase()} · {fmtDate(h.won_at)}
                    </T>
                  </View>
                </View>
              ))
            )}
          </Panel>
        </ScrollView>
      )}
    </Screen>
  );
}
