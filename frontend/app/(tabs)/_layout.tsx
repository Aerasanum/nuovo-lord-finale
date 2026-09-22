import { BottomTabBar } from "expo-router/build/react-navigation/bottom-tabs";
import { Redirect, Tabs } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import React, { useRef } from "react";
import { Platform, View } from "react-native";

import { ChatDock } from "@/src/components/chat/ChatDock";
import { IntroGate } from "@/src/components/cinematic/IntroGate";
import { RainbowWatcher } from "@/src/components/cinematic/RainbowWatcher";
import { ReturnGate } from "@/src/components/ReturnGate";
import { ScreenErrorBoundary } from "@/src/components/screen-error";
import { DailyGate } from "@/src/components/daily/DailyGate";
import { TourGate } from "@/src/components/tour/TourGate";
import { Icon } from "@/src/components/ui";
import { useI18n } from "@/src/i18n";
import { useAuth } from "@/src/state/AuthContext";
import { tour } from "@/src/state/tour";
import { useGame } from "@/src/state/useGame";
import { fonts, useTheme } from "@/src/theme";

const isIOS26 =
  Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 26;

/** Tab order = spotlight targets of the first-login tour (src/state/tour.ts). */
const TAB_IDS = ["tab-map", "tab-settlement", "tab-army", "tab-alliance", "tab-missions", "tab-inbox"];

function MeasuredTabBar(props: React.ComponentProps<typeof BottomTabBar>) {
  const ref = useRef<View>(null);
  const measure = () =>
    ref.current?.measureInWindow((x, y, width, height) => {
      if (width <= 0 || height <= 0) return;
      const w = width / TAB_IDS.length;
      TAB_IDS.forEach((id, i) => tour.setTarget(id, { x: x + i * w, y, width: w, height }));
    });
  return (
    <View ref={ref} onLayout={measure}>
      <BottomTabBar {...props} />
    </View>
  );
}

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
      <>
        <IntroGate />
        <RainbowWatcher />
        <TourGate />
        <ReturnGate />
        <DailyGate />
        <ChatDock floating />
        <NativeTabs unstable_screenErrorBoundary={ScreenErrorBoundary}>
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
          <NativeTabs.Trigger name="alliance">
            <NativeTabs.Trigger.Icon sf="person.3.fill" />
            <NativeTabs.Trigger.Label>
              {t("tabAlliance")}
            </NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="missions">
            <NativeTabs.Trigger.Icon sf="scroll.fill" />
            <NativeTabs.Trigger.Label>
              {t("tabMissions")}
            </NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="inbox">
            <NativeTabs.Trigger.Icon sf="tray.fill" />
            <NativeTabs.Trigger.Label>{t("tabInbox")}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        </NativeTabs>
      </>
    );
  }

  return (
    <>
      <IntroGate />
      <RainbowWatcher />
      <ReturnGate />
      <DailyGate />
      <Tabs
        unstable_screenErrorBoundary={ScreenErrorBoundary}
        tabBar={(props) => (
          <View>
            <ChatDock />
            <MeasuredTabBar {...props} />
          </View>
        )}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.brandPrimary,
          tabBarInactiveTintColor: colors.muted,
          tabBarStyle: {
            backgroundColor: colors.surfaceSecondary,
            borderTopColor: colors.border,
            ...(Platform.OS === "web" ? { height: 64 } : {}),
          },
          tabBarItemStyle: { alignSelf: "center" },
          tabBarLabelStyle: { fontFamily: fonts.body, fontSize: 10 },
          sceneStyle: { backgroundColor: colors.surface },
        }}
      >
        <Tabs.Screen
          name="map"
          options={{
            title: t("tabMap"),
            tabBarIcon: ({ color, size }) => (
              <Icon name="map" size={size} color={String(color)} />
            ),
            tabBarButtonTestID: "tab-map",
          }}
        />
        <Tabs.Screen
          name="settlement"
          options={{
            title: t("tabCity"),
            tabBarIcon: ({ color, size }) => (
              <Icon name="castle" size={size} color={String(color)} />
            ),
            tabBarButtonTestID: "tab-settlement",
          }}
        />
        <Tabs.Screen
          name="army"
          options={{
            title: t("tabArmy"),
            tabBarIcon: ({ color, size }) => (
              <Icon name="sword-cross" size={size} color={String(color)} />
            ),
            tabBarButtonTestID: "tab-army",
          }}
        />
        <Tabs.Screen
          name="alliance"
          options={{
            title: t("tabAlliance"),
            tabBarIcon: ({ color, size }) => (
              <Icon name="shield-crown" size={size} color={String(color)} />
            ),
            tabBarButtonTestID: "tab-alliance",
          }}
        />
        <Tabs.Screen
          name="missions"
          options={{
            title: t("tabMissions"),
            tabBarIcon: ({ color, size }) => (
              <Icon name="compass-outline" size={size} color={String(color)} />
            ),
            tabBarButtonTestID: "tab-missions",
          }}
        />
        <Tabs.Screen
          name="inbox"
          options={{
            title: t("tabInbox"),
            tabBarButtonTestID: "tab-inbox",
            tabBarIcon: ({ color, size }) => (
              <View>
                <Icon name="email-outline" size={size} color={String(color)} />
                {unread > 0 ? (
                  <View
                    style={{
                      position: "absolute",
                      right: -4,
                      top: -2,
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: colors.error,
                    }}
                  />
                ) : null}
              </View>
            ),
          }}
        />
      </Tabs>
      <TourGate />
    </>
  );
}
