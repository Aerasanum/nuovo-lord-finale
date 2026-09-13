/**
 * «Santuario Mitico» detail (Bible §12): the five dedicated levels with their effects and, at level 5, the Unicorn
 * ritual (summon → 7 days → READY → Ponte Arcobaleno from any enemy castle card → 720 h cooldown).
 */
import React from "react";
import { View } from "react-native";

import { type BuildingEntry, useUnicornSummon } from "@/src/api/hooks";
import { useToast } from "@/src/components/overlay";
import { Button, CostRow, Countdown, Icon, Panel, Row, T } from "@/src/components/ui";
import { fmt, formatDuration, type StringKey, useI18n } from "@/src/i18n";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceTertiary },
  rowDone: { borderColor: c.success },
  rowNext: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  lvl: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  lvlDone: { backgroundColor: c.success, borderColor: c.success },
  lvlNext: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  unicorn: { alignItems: "center", gap: spacing.sm },
  horn: { width: 84, height: 84, borderRadius: 42, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceTertiary, borderWidth: 2, borderColor: c.brandSecondary },
  hornReady: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
}));

export function MythicPanel({ b, worldId, isMother }: { b: BuildingEntry; worldId: string; isMother: boolean }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const { showError, show } = useToast();
  const summon = useUnicornSummon(worldId);
  const m = b.mythic;
  if (!m) return null;
  const u = m.unicorn;
  const summonNow = () =>
    summon
      .mutateAsync()
      .then(() => show(t("unicornSummon"), "success"))
      .catch(showError);
  return (
    <>
      <Panel testID="mythic-levels">
        <T v="caption">{t("mythicIntro")}</T>
        <T v="heading" style={{ marginTop: spacing.sm }}>
          {t("mythicLevels")}
        </T>
        <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
          {m.levels.map((row) => {
            const done = row.level <= b.level;
            const next = row.level === b.level + 1;
            return (
              <View key={row.level} style={[s.row, done && s.rowDone, next && s.rowNext]} testID={`mythic-level-${row.level}`}>
                <View style={[s.lvl, done && s.lvlDone, next && s.lvlNext]}>
                  {done ? <Icon name="check-bold" size={18} color={colors.onSuccess} /> : <T v="label" style={{ color: next ? colors.onBrandPrimary : colors.onSurface }}>{row.level}</T>}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Row style={{ justifyContent: "space-between" }}>
                    <T v="label" style={{ flex: 1 }}>
                      {row.effect}
                    </T>
                    <Row style={{ gap: 4 }}>
                      <Icon name="clock-outline" size={14} color={colors.onSurfaceSecondary} />
                      <T v="caption">{formatDuration(row.duration_min * 60)}</T>
                    </Row>
                  </Row>
                  <CostRow cost={row.cost} />
                </View>
              </View>
            );
          })}
        </View>
      </Panel>

      <Panel testID="mythic-unicorn">
        <View style={s.unicorn}>
          <View style={[s.horn, (u.state === "READY" || u.state === "IN_FLIGHT") && s.hornReady]}>
            <Icon name="unicorn-variant" size={44} color={u.state === "READY" ? colors.brandPrimary : colors.onSurfaceSecondary} />
          </View>
          <T v="heading" testID="unicorn-state">
            {t("unicornTitle")} · {u.state === "NONE" ? "—" : t(`unicornState_${u.state}` as StringKey)}
          </T>
          {u.state === "NONE" ? (
            <T v="caption" style={{ textAlign: "center" }}>
              {fmt(t("unicornNone"), { days: u.summon_days })}
            </T>
          ) : u.state === "QUEUED" && u.ready_at ? (
            <Row>
              <T v="caption">{t("unicornQueued")}</T>
              <Countdown endsAt={u.ready_at} testID="unicorn-ready-countdown" />
            </Row>
          ) : u.state === "READY" ? (
            <T v="caption" style={{ textAlign: "center", color: colors.success }}>
              {t("unicornReady")}
            </T>
          ) : u.state === "IN_FLIGHT" ? (
            <T v="caption" style={{ textAlign: "center" }}>
              {t("unicornInFlight")}
            </T>
          ) : u.cooldown_until ? (
            <Row>
              <T v="caption">{t("unicornCooldown")}</T>
              <Countdown endsAt={u.cooldown_until} testID="unicorn-cooldown" />
            </Row>
          ) : null}
          <T v="caption" style={{ textAlign: "center", color: colors.onSurfaceSecondary }}>
            {fmt(t("unicornRules"), { hours: u.cooldown_hours })}
          </T>
          <View style={{ width: "100%", gap: spacing.xs }}>
            <T v="label">{t("cost")}</T>
            <CostRow cost={u.cost} testID="unicorn-cost" />
            {u.sanctuary_level < 5 ? (
              <T v="caption" style={{ color: colors.warning }}>
                {t("unicornNeedsSanctuary")} ({u.sanctuary_level}/5)
              </T>
            ) : null}
            <Button title={t("unicornSummon")} icon="creation" disabled={!u.can_summon || !isMother} loading={summon.isPending} onPress={summonNow} testID="unicorn-summon-button" />
          </View>
        </View>
      </Panel>
    </>
  );
}
