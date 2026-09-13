/**
 * Casata → Specializzazione card (Bible §9.3): the active Attacker/Defender bonus at a glance, or the unlock progress
 * (3 settlements) / cooldown, with a shortcut to the full picker.
 */
import { useRouter } from "expo-router";
import React from "react";
import { View } from "react-native";

import { useSpecialization } from "@/src/api/hooks";
import { Button, Countdown, Icon, Panel, Row, T } from "@/src/components/ui";
import { fmt, type StringKey, useI18n } from "@/src/i18n";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  badge: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceTertiary, borderWidth: 2, borderColor: c.border },
  badgeOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  bonus: { alignSelf: "flex-start", paddingHorizontal: 10, height: 26, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.brandSecondary, justifyContent: "center" },
}));

export function SpecializationCard({ worldId }: { worldId: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const q = useSpecialization(worldId);
  const d = q.data;
  if (!d) return null;
  const cur = d.current;
  const pct = cur ? d.choices[cur]?.bonus_pct ?? 5 : 0;
  return (
    <Panel style={{ marginTop: spacing.md }} testID="house-specialization-panel">
      <Row style={{ gap: spacing.md, alignItems: "flex-start" }}>
        <View style={[s.badge, cur && s.badgeOn]}>
          <Icon name={cur === "DEFENDER" ? "shield" : cur === "ATTACKER" ? "sword" : "account-star"} size={26} color={cur ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <T v="caption">{t("specialization")}</T>
          <T v="heading" testID="house-specialization-current">
            {cur ? t(`spec${cur}` as StringKey) : t("specNone")}
          </T>
          {cur ? (
            <>
              <View style={s.bonus} testID="house-specialization-bonus">
                <T v="label" style={{ color: colors.brandPrimary }}>
                  {t("specActiveBonus")} · +{pct}% {cur === "ATTACKER" ? "ATK" : "DEF"}
                </T>
              </View>
              <T v="caption">{fmt(t(`specBonus${cur}` as StringKey), { n: pct })}</T>
              {d.cooldown_until ? (
                <Row>
                  <Icon name="timer-sand" size={14} color={colors.warning} />
                  <T v="caption">{t("blockCOOLDOWN")}</T>
                  <Countdown endsAt={d.cooldown_until} testID="house-specialization-cooldown" />
                </Row>
              ) : null}
            </>
          ) : d.available ? (
            <T v="caption" style={{ color: colors.success }} testID="house-specialization-available">
              {t("specAvailableNow")}
            </T>
          ) : (
            <T v="caption" style={{ color: colors.warning }} testID="house-specialization-locked">
              {t("specLocked").replace("{n}", String(d.required_settlements))} ({d.settlement_count}/{d.required_settlements})
            </T>
          )}
        </View>
      </Row>
      <Button title={cur ? t("specManage") : t("specChoose")} icon="account-star" variant={cur ? "ghost" : "secondary"} style={{ marginTop: spacing.sm }} onPress={() => router.push("/specialization")} testID="house-specialization-button" />
    </Panel>
  );
}
