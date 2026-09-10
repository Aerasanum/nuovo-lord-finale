import { useRouter } from "expo-router";
import React from "react";
import { Pressable, RefreshControl, ScrollView } from "react-native";

import { useMyAlliance } from "@/src/api/hooks";
import { AllianceSummary } from "@/src/components/alliance/AllianceSummary";
import { Screen } from "@/src/components/overlay";
import { Icon } from "@/src/components/ui";
import { useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { useTheme } from "@/src/theme";

/** Alliance tab (Bible §19): lone-wolf state or the alliance dashboard; settings gear for the Leader. */
export default function AllianceTab() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { worldId } = useGame();
  const q = useMyAlliance(worldId);
  const a = q.data?.alliance ?? null;
  const canSettings = !!a && a.permissions.includes("alliance_settings");
  return (
    <Screen
      title={a ? `[${a.tag}] ${a.name}` : t("alliance")}
      testID="alliance-tab-screen"
      right={
        canSettings ? (
          <Pressable style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }} onPress={() => router.push("/alliance/settings")} testID="alliance-settings-button" accessibilityLabel={t("allianceSettings")}>
            <Icon name="cog-outline" size={22} color={colors.onSurfaceSecondary} />
          </Pressable>
        ) : undefined
      }
    >
      <ScrollView refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.brandPrimary} />} contentContainerStyle={{ paddingBottom: 32 }}>
        <AllianceSummary />
      </ScrollView>
    </Screen>
  );
}
