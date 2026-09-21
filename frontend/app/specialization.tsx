import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePremiumMutations, useSpecialization } from "@/src/api/hooks";
import { BackButton } from "@/src/components/alliance/common";
import { Screen, useToast } from "@/src/components/overlay";
import { Button, Countdown, Icon, LoadState, Panel, Row, T } from "@/src/components/ui";
import { formatNumber, type StringKey, useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  content: { padding: spacing.md, gap: spacing.md },
  card: { borderRadius: radius.md, borderWidth: 2, padding: spacing.md, gap: 6, backgroundColor: c.surfaceTertiary, minHeight: 44 },
}));

/** Player specialization (spec.player_specialization / Bible §23): Attacker +5% ATK or Defender +5% DEF; unlocked at 3
 * settlements, first pick free, change 2.500 Rubies with a 7-day cooldown and competitive locks. */
export default function SpecializationScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { worldId } = useGame();
  const q = useSpecialization(worldId);
  const mm = usePremiumMutations(worldId ?? "");
  const { show, showError } = useToast();
  const d = q.data;
  if (!d) return <LoadState query={q} />;
  const blocked = d.blocked.length > 0;

  return (
    <Screen title={t("specialization")} testID="specialization-screen" left={<BackButton testID="specialization-back" />}>
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Panel testID="specialization-state">
          <Row style={{ justifyContent: "space-between" }}>
            <T v="heading" testID="specialization-current">
              {d.current ? t(`spec${d.current}` as StringKey) : t("specNone")}
            </T>
            <Row>
              <Icon name="diamond" size={16} color={colors.brandPrimary} />
              <T v="label" testID="specialization-rubies">
                {formatNumber(d.rubies)}
              </T>
            </Row>
          </Row>
          <T v="caption" style={{ marginTop: 6 }}>
            {t("specHint")}
          </T>
          {!d.available ? (
            <T v="caption" style={{ marginTop: 6, color: colors.warning }} testID="specialization-locked">
              {t("specLocked").replace("{n}", String(d.required_settlements))} ({d.settlement_count}/{d.required_settlements})
            </T>
          ) : null}
          {d.cooldown_until ? (
            <Row style={{ marginTop: 6 }}>
              <Icon name="timer-sand" size={14} color={colors.warning} />
              <T v="caption">{t("blockCOOLDOWN")}</T>
              <Countdown endsAt={d.cooldown_until} testID="specialization-cooldown" />
            </Row>
          ) : null}
          {d.blocked.filter((b) => b !== "COOLDOWN").map((b) => (
            <T key={b} v="caption" style={{ color: colors.error }} testID={`specialization-block-${b}`}>
              {t(`block${b}` as StringKey)}
            </T>
          ))}
        </Panel>
        <Row style={{ alignItems: "stretch", gap: spacing.sm }}>
          {Object.entries(d.choices).map(([key, c]) => {
            const active = d.current === key;
            const atk = key === "ATTACKER";
            return (
              <Pressable key={key} style={[s.card, { flex: 1, borderColor: active ? colors.brandPrimary : colors.border }]} disabled testID={`specialization-card-${key}`}>
                <Icon name={atk ? "sword" : "shield"} size={26} color={active ? colors.brandPrimary : colors.onSurfaceSecondary} />
                <T v="heading">{t(`spec${key}` as StringKey)}</T>
                <T v="caption">
                  +{c.bonus_pct}% {atk ? "ATK" : "DEF"}
                </T>
                <View style={{ flex: 1 }} />
                <Button
                  title={active ? "✓" : d.current ? `${t("specChange")} · ${formatNumber(d.price_rubies)}` : t("specChoose")}
                  variant={active ? "ghost" : "primary"}
                  disabled={active || !d.available || blocked || (d.price_rubies > 0 && d.rubies < d.price_rubies)}
                  loading={mm.specialize.isPending}
                  onPress={() => mm.specialize.mutateAsync(key).then(() => show(t("saved"), "success")).catch(showError)}
                  testID={`specialization-pick-${key}`}
                />
              </Pressable>
            );
          })}
        </Row>
      </ScrollView>
    </Screen>
  );
}
