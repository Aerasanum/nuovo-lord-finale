import { Redirect, Tabs } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import React from "react";
import { Platform, View } from "react-native";

import { Icon } from "@/src/components/ui";
import { useI18n } from "@/src/i18n";
import { useAuth } from "@/src/state/AuthContext";
import { useGame } from "@/src/state/useGame";
import { fonts, useTheme } from "@/src/theme";

const isIOS26 = Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 26;

export default function TabsLayout() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { ready, account, worldId } = useAuth();
  const { unread } = useGame();
  if (!ready) return null;
  if (!account) return <Redirect href="/login" />;
  if (!worldId) return <Redirect href="/worlds" />;

  if (isIOS26) {
    return (
      <NativeTabs>
        <NativeTabs.Trigger name="map">
          <NativeTabs.Trigger.Icon sf="map.fill" />
          <NativeTabs.Trigger.Label>{t("tabMap")}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settlement">
          <NativeTabs.Trigger.Icon sf="building.columns.fill" />
          <NativeTabs.Trigger.Label>{t("tabCity")}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="army">
          <NativeTabs.Trigger.Icon sf="shield.fill" />
          <NativeTabs.Trigger.Label>{t("tabArmy")}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="inbox">
          <NativeTabs.Trigger.Icon sf="tray.fill" />
          <NativeTabs.Trigger.Label>{t("tabInbox")}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surfaceSecondary, borderTopColor: colors.border, ...(Platform.OS === "web" ? { height: 64 } : {}) },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontFamily: fonts.body, fontSize: 11 },
        sceneStyle: { backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen name="map" options={{ title: t("tabMap"), tabBarIcon: ({ color, size }) => <Icon name="map" size={size} color={String(color)} />, tabBarButtonTestID: "tab-map" }} />
      <Tabs.Screen name="settlement" options={{ title: t("tabCity"), tabBarIcon: ({ color, size }) => <Icon name="castle" size={size} color={String(color)} />, tabBarButtonTestID: "tab-settlement" }} />
      <Tabs.Screen name="army" options={{ title: t("tabArmy"), tabBarIcon: ({ color, size }) => <Icon name="sword-cross" size={size} color={String(color)} />, tabBarButtonTestID: "tab-army" }} />
      <Tabs.Screen name="missions" options={{ title: t("tabMissions"), tabBarIcon: ({ color, size }) => <Icon name="compass-outline" size={size} color={String(color)} />, tabBarButtonTestID: "tab-missions" }} />
      <Tabs.Screen
        name="inbox"
        options={{
          title: t("tabInbox"),
          tabBarButtonTestID: "tab-inbox",
          tabBarIcon: ({ color, size }) => (
            <View>
              <Icon name="email-outline" size={size} color={String(color)} />
              {unread > 0 ? <View style={{ position: "absolute", right: -4, top: -2, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.error }} /> : null}
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
