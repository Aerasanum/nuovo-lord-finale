/**
 * Renderer shared by the privacy notice and the erasure notice.
 *
 * These two routes are the only ones a stranger can open: Play Console links straight to them, so the visitor
 * usually has no account, no history to go back to and no realm loaded. Nothing here may read game state.
 */
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "@/src/components/overlay";
import { Icon, Panel, T } from "@/src/components/ui";
import { useI18n } from "@/src/i18n";
import type { LegalSection } from "@/src/legal/content";
import { spacing, useTheme } from "@/src/theme";

export function LegalPage({
  title,
  updated,
  intro,
  sections,
  footer,
  testID,
}: {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
  footer?: React.ReactNode;
  testID: string;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Opened from a store listing there is nothing behind this screen; send the visitor into the app instead of
  // leaving a dead arrow in the corner.
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));

  return (
    <Screen
      title={title}
      left={
        <Pressable onPress={leave} testID={`${testID}-back`} style={{ padding: spacing.sm }}>
          <Icon name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
      }
      testID={testID}
    >
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl, maxWidth: 720, width: "100%", alignSelf: "center" }}>
        <Panel>
          <T v="caption" testID={`${testID}-updated`}>
            {t("legalUpdated")} {updated}
          </T>
          <T v="body" style={{ marginTop: spacing.sm }}>
            {intro}
          </T>
        </Panel>

        {sections.map((s) => (
          <Panel key={s.title}>
            <T v="heading">{s.title}</T>
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              {s.body.map((p, i) => (
                <T key={i} v="body">
                  {p}
                </T>
              ))}
            </View>
          </Panel>
        ))}

        {footer}
      </ScrollView>
    </Screen>
  );
}
