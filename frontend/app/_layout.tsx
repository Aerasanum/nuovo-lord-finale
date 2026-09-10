import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { ToastProvider } from "@/src/components/overlay";
import { I18nProvider } from "@/src/i18n";
import { queryClient } from "@/src/query-client";
import { AuthProvider } from "@/src/state/AuthContext";
import { useTheme } from "@/src/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const { colors } = useTheme();
  // Prewarm fonts + icon glyph font so icons render on first frame in Expo Go (Android).
  const [fontsLoaded, fontError] = useFonts({
    EBGaramond: require("../assets/fonts/EBGaramond.ttf"),
    Manrope: require("../assets/fonts/Manrope.ttf"),
    MaterialDesignIcons: require("@react-native-vector-icons/material-design-icons/fonts/MaterialDesignIcons.ttf"),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: colors.surface }} />;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.surface }}>
        <SafeAreaProvider>
          <KeyboardProvider>
            <QueryClientProvider client={queryClient}>
              <I18nProvider>
                <AuthProvider>
                  <ToastProvider>
                    <StatusBar style="light" />
                    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface }, animation: "fade" }}>
                      <Stack.Screen name="index" />
                      <Stack.Screen name="login" />
                      <Stack.Screen name="worlds" />
                      <Stack.Screen name="(tabs)" />
                      <Stack.Screen name="research" options={{ animation: "slide_from_right" }} />
                      <Stack.Screen name="queues" options={{ animation: "slide_from_right" }} />
                      <Stack.Screen name="marches" options={{ animation: "slide_from_right" }} />
                      <Stack.Screen name="sentinels" options={{ animation: "slide_from_right" }} />
                      <Stack.Screen name="building/[name]" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
                      <Stack.Screen name="target/[id]" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
                      <Stack.Screen name="march/new" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
                      <Stack.Screen name="battle/[id]" options={{ animation: "slide_from_right" }} />
                      <Stack.Screen name="auth/callback" />
                    </Stack>
                  </ToastProvider>
                </AuthProvider>
              </I18nProvider>
            </QueryClientProvider>
          </KeyboardProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
