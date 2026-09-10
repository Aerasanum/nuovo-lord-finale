/**
 * Pyramid endgame shared UI (Bible §21): state pill, phase countdown, hold progress and the contextual actions
 * (Details / Attack / Reinforce). Used by the map selection card, the Alliance tab tile and the /pyramid screen.
 */
import React from "react";
import { Text, View } from "react-native";

import type { PyramidDto } from "@/src/api/hooks";
import { Button, Countdown, Icon, ProgressBar, T } from "@/src/components/ui";
import { fmt, formatNumber, useI18n, type StringKey } from "@/src/i18n";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  pill: { paddingHorizontal: 10, height: 24, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4 },
  pillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  phase: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  hint: { color: c.muted, marginTop: 4 },
}));

export function pyramidStateLabel(t: (k: StringKey) => string, state: PyramidDto["state"]): string {
  return t(`pyrState_${state}` as StringKey);
}

export function PyramidStatePill({ dto, testID }: { dto: PyramidDto; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const held = dto.state === "OPEN" && !!dto.owner;
  const bg = dto.state === "OPEN" ? (held ? (dto.faction === "OWN" ? colors.factionOwn : colors.factionEnemy) : colors.success) : dto.state === "REWARD_LOCK" ? colors.brandTertiary : colors.surfaceTertiary;
  const fg = dto.state === "OPEN" ? (held ? (dto.faction === "OWN" ? colors.onBrand : colors.onError) : colors.onSuccess) : dto.state === "REWARD_LOCK" ? colors.onBrandTertiary : colors.onSurfaceTertiary;
  return (
    <View style={[s.pill, { backgroundColor: bg }]} testID={testID}>
      <Icon name={dto.state === "OPEN" ? "fire" : dto.state === "REWARD_LOCK" ? "trophy" : "sleep"} size={12} color={fg} />
      <Text style={[s.pillText, { color: fg }]}>{pyramidStateLabel(t, dto.state).toUpperCase()}</Text>
    </View>
  );
}

/** The one countdown that matters for the current phase (opening / hold / rewards / next opening). */
export function PyramidPhase({ dto, testID }: { dto: PyramidDto; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  if (dto.state === "OPEN" && dto.hold && dto.owner) {
    return (
      <View testID={testID}>
        <View style={s.phase}>
          <Icon name="timer-sand" size={14} color={colors.brandPrimary} />
          <T v="caption" style={{ flex: 1 }}>
            {t("pyramidHoldEnds")} · [{dto.owner.tag}]
          </T>
          <Countdown endsAt={dto.hold.deadline} style={{ color: colors.brandPrimary }} testID="pyramid-hold-countdown" />
        </View>
        <View style={{ marginTop: 6 }}>
          <ProgressBar value={dto.hold.progress} color={dto.faction === "OWN" ? colors.factionOwn : colors.factionEnemy} />
        </View>
      </View>
    );
  }
  if (dto.state === "OPEN") {
    return (
      <View style={s.phase} testID={testID}>
        <Icon name="shield-sword" size={14} color={colors.success} />
        <T v="caption" style={{ flex: 1 }}>
          {t("pyramidGuardian")} · {formatNumber(dto.garrison_total)} {t("units")}
        </T>
      </View>
    );
  }
  const label = dto.state === "REWARD_LOCK" ? t("pyramidLockEnds") : dto.state === "DORMANT" ? t("pyramidNextOpen") : t("pyramidOpensIn");
  return (
    <View style={s.phase} testID={testID}>
      <Icon name={dto.state === "REWARD_LOCK" ? "trophy-outline" : "clock-outline"} size={14} color={colors.muted} />
      <T v="caption" style={{ flex: 1 }}>
        {label}
        {dto.state === "REWARD_LOCK" && dto.winner ? ` · [${dto.winner.tag}]` : ""}
      </T>
      <Countdown endsAt={dto.deadline} style={{ color: colors.onSurface }} testID="pyramid-phase-countdown" />
    </View>
  );
}

export function pyramidDescription(t: (k: StringKey) => string, dto: PyramidDto): string {
  const c = dto.config;
  if (dto.state === "DORMANT_INITIAL") return fmt(t("pyrDesc_DORMANT_INITIAL"), { day: c.first_open_day });
  if (dto.state === "OPEN") return dto.owner ? fmt(t("pyrDesc_OPEN_HELD"), { tag: dto.owner.tag ?? "" }) : fmt(t("pyrDesc_OPEN_NEUTRAL"), { hours: c.hold_hours });
  if (dto.state === "REWARD_LOCK") return fmt(t("pyrDesc_REWARD_LOCK"), { tag: dto.winner?.tag ?? "", cycle: dto.cycle_id, days: c.reward_days });
  return fmt(t("pyrDesc_DORMANT"), { days: c.dormant_days });
}

export function PyramidActions({ dto, onDetails, onAttack, onReinforce, compact }: { dto: PyramidDto; onDetails?: () => void; onAttack: () => void; onReinforce: () => void; compact?: boolean }) {
  const s = useStyles();
  const { t } = useI18n();
  const me = dto.me;
  return (
    <View>
      <View style={s.actions}>
        {onDetails ? <Button title={t("pyramidDetails")} icon="pyramid" variant="secondary" style={{ flex: 1 }} onPress={onDetails} testID="pyramid-details-button" /> : null}
        {me.can_reinforce ? <Button title={compact ? t("reinforce") : t("pyramidReinforce")} icon="shield-plus" style={{ flex: 1 }} onPress={onReinforce} testID="pyramid-reinforce-button" /> : null}
        {me.can_attack ? <Button title={compact ? t("attack") : t("pyramidAttack")} icon="sword" style={{ flex: 1 }} onPress={onAttack} testID="pyramid-attack-button" /> : null}
      </View>
      {!me.eligible ? (
        <T v="caption" style={s.hint} testID="pyramid-not-eligible">
          {t("pyramidNotEligibleHint")}
        </T>
      ) : dto.state !== "OPEN" ? (
        <T v="caption" style={s.hint} testID="pyramid-not-open">
          {t("pyramidNotOpen")}
        </T>
      ) : null}
    </View>
  );
}
