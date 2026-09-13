/**
 * One-time contextual hint: a dismissible card shown the first time a Player opens a screen (research / alliance /
 * marches). Dismissal is remembered server-side per Player/World (`players.hints_seen`), so it never comes back on any
 * device. Renders nothing once seen.
 */
import React from "react";
import { View } from "react-native";

import { useHintSeen } from "@/src/api/hooks";
import { Button, Icon, type IconName, Row, T } from "@/src/components/ui";
import { type StringKey, useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export type HintKey = "research" | "alliance" | "marches";
const ICON: Record<HintKey, IconName> = { research: "flask", alliance: "shield-half-full", marches: "flag" };

const useStyles = makeStyles((c) => ({
  card: { borderRadius: radius.lg, borderWidth: 1, borderColor: c.brandPrimary, backgroundColor: c.brandTertiary, padding: spacing.md, gap: spacing.sm },
  badge: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
}));

export function Hint({ id, style }: { id: HintKey; style?: object }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const { worldId, player } = useGame();
  const seen = useHintSeen(worldId ?? "");
  if (!worldId || !player || (player.hints_seen ?? []).includes(id)) return null;
  return (
    <View style={[s.card, style]} testID={`hint-${id}`}>
      <Row style={{ alignItems: "flex-start" }}>
        <View style={s.badge}>
          <Icon name={ICON[id]} size={20} color={colors.onBrandPrimary} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <T v="heading" style={{ color: colors.onBrandTertiary }} testID={`hint-${id}-title`}>
            {t(`hint_${id}_title` as StringKey)}
          </T>
          <T v="body" style={{ color: colors.onBrandTertiary }}>
            {t(`hint_${id}_body` as StringKey)}
          </T>
        </View>
      </Row>
      <Button title={t("hintGotIt")} icon="check" variant="secondary" style={{ alignSelf: "flex-end" }} onPress={() => seen.mutate(id)} testID={`hint-${id}-dismiss`} />
    </View>
  );
}
