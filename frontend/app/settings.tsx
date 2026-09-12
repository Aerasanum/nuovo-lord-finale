/**
 * Profile & settings: account, language, world switch and the sign-out that used to be reachable only from the
 * worlds screen.
 */
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import React from "react";
import { Alert, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Crest } from "@/src/components/Crest";
import { Screen, useToast } from "@/src/components/overlay";
import { Button, Chip, Icon, Panel, Row, T } from "@/src/components/ui";
import { LANGS, useI18n } from "@/src/i18n";
import { useAuth } from "@/src/state/AuthContext";
import { useGame } from "@/src/state/useGame";
import { spacing, useTheme } from "@/src/theme";

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { t, lang, setLang } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { account, logout } = useAuth();
  const { player, world } = useGame();
  const { show } = useToast();

  const doLogout = () =>
    logout().then(() => {
      show(t("loggedOut"), "success");
      router.replace("/login");
    });
  const confirmLogout = () => {
    if (Platform.OS === "web") {
      doLogout();
      return;
    }
    Alert.alert(t("logout"), t("logoutConfirm"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("logout"), style: "destructive", onPress: doLogout },
    ]);
  };

  return (
    <Screen title={t("settings")} testID="settings-screen">
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}>
        <Panel testID="settings-account">
          <Row style={{ gap: spacing.md }}>
            {player?.house?.crest ? <Crest crest={player.house.crest} size={56} /> : <Icon name="account-circle" size={56} color={colors.brandPrimary} />}
            <View style={{ flex: 1 }}>
              <T v="heading" numberOfLines={1}>
                {player?.house_name ?? account?.display_name ?? ""}
              </T>
              <T v="caption" numberOfLines={1} testID="settings-email">
                {account?.email ?? ""}
              </T>
              {world ? (
                <T v="caption" numberOfLines={1} testID="settings-world">
                  {t("world")}: {world.name}
                </T>
              ) : null}
            </View>
          </Row>
        </Panel>

        <Panel testID="settings-language">
          <T v="label" style={{ marginBottom: spacing.sm }}>
            {t("language")}
          </T>
          <Row>
            {LANGS.map((l) => (
              <Chip key={l.code} label={`${l.flag} ${l.label}`} selected={lang === l.code} onPress={() => setLang(l.code)} testID={`settings-lang-${l.code}`} />
            ))}
          </Row>
        </Panel>

        <Panel testID="settings-actions">
          <View style={{ gap: spacing.sm }}>
            <Button title={t("changeWorld")} icon="earth" variant="secondary" onPress={() => router.push("/worlds")} testID="settings-change-world" />
            <Button title={t("house")} icon="shield-half-full" variant="secondary" onPress={() => router.push("/house")} testID="settings-house" />
            <Button title={t("logout")} icon="logout" variant="danger" onPress={confirmLogout} testID="settings-logout" />
          </View>
        </Panel>

        <T v="caption" style={{ textAlign: "center" }} testID="settings-version">
          Empire Lords Dragon · {t("appVersion")} {Constants.expoConfig?.version ?? "1.0.0"}
        </T>
      </ScrollView>
    </Screen>
  );
}
