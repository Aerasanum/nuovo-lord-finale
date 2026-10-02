/**
 * "Primi passi": the checklist a new Lord gets on the Missioni tab until the basics are done.
 *
 * It reads game state and shows nothing the player has not earned — no new rules and no rewards, because balance is
 * not ours to invent. Each line says what to do, why it is worth doing, and goes to the screen where it happens.
 *
 * It ends two ways: every box ticked, which leaves one card saying so, or the player hiding it. Hiding is stored
 * server-side with the other one-time hints (`players.hints_seen`, per Player/World), so it never comes back on any
 * device of that realm.
 */
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { View } from "react-native";

import { useHintSeen, useMissions } from "@/src/api/hooks";
import { Button, Icon, Panel, ProgressBar, Row, T } from "@/src/components/ui";
import { allDone, firstSteps } from "@/src/game/firstSteps";
import { fmt, type StringKey, useI18n } from "@/src/i18n";
import * as push from "@/src/push/push";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export const FIRST_STEPS_HINT = "first_steps";

const useStyles = makeStyles((c) => ({
  step: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: c.border },
  mark: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceTertiary },
  markDone: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  badge: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
}));

export function FirstSteps() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { worldId, player, settlement } = useGame();
  const missions = useMissions(worldId);
  const hint = useHintSeen(worldId ?? "");
  const [pushState, setPushState] = useState<push.PushState | null>(null);

  useEffect(() => {
    let alive = true;
    push.state().then((state) => {
      if (alive) setPushState(state);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!worldId || !player || (player.hints_seen ?? []).includes(FIRST_STEPS_HINT)) return null;

  const steps = firstSteps({ settlement: settlement.data, alliance: player.alliance, missions: missions.data, push: pushState });
  const done = steps.filter((step) => step.done).length;
  const finished = allDone(steps);
  const hide = () => hint.mutate(FIRST_STEPS_HINT);

  return (
    <Panel testID="first-steps">
      <Row style={{ justifyContent: "space-between" }}>
        <Row>
          <View style={s.badge}>
            <Icon name={finished ? "check-decagram" : "flag-variant"} size={20} color={colors.brandPrimary} />
          </View>
          <View>
            <T v="heading" testID="first-steps-title">
              {t("firstStepsTitle")}
            </T>
            <T v="caption" testID="first-steps-progress">
              {fmt(t("firstStepsProgress"), { n: done, total: steps.length })}
            </T>
          </View>
        </Row>
        <Button title={t("firstStepsHide")} variant="ghost" onPress={hide} testID="first-steps-hide" />
      </Row>
      <View style={{ marginTop: spacing.sm }}>
        <ProgressBar value={done / steps.length} color={finished ? colors.success : undefined} />
      </View>

      {finished ? (
        <T v="body" style={{ marginTop: spacing.sm, color: colors.onSurfaceSecondary }} testID="first-steps-complete">
          {t("firstStepsComplete")}
        </T>
      ) : (
        <>
          <T v="caption" style={{ marginTop: spacing.xs }}>
            {t("firstStepsLead")}
          </T>
          {steps.map((step) => (
            <View key={step.id} style={s.step} testID={`first-step-${step.id}`}>
              <View style={[s.mark, step.done && s.markDone]}>
                <Icon name={step.done ? "check" : step.icon} size={16} color={step.done ? colors.onBrandPrimary : colors.muted} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T v="label" style={step.done ? { color: colors.muted, textDecorationLine: "line-through" } : undefined}>
                  {t(`fs_${step.id}_title` as StringKey)}
                </T>
                {step.done ? null : <T v="caption">{t(`fs_${step.id}_body` as StringKey)}</T>}
              </View>
              {step.done || !step.href ? null : (
                <Button title={t("firstStepsGo")} variant="secondary" onPress={() => router.push(step.href!)} testID={`first-step-${step.id}-go`} />
              )}
            </View>
          ))}
        </>
      )}
    </Panel>
  );
}
