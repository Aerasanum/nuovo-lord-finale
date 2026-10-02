/**
 * Profile & settings: account, language, world switch and the sign-out that used to be reachable only from the
 * worlds screen.
 */
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, Platform, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDeleteAccount } from "@/src/api/hooks";
import { Crest } from "@/src/components/Crest";
import { Screen, Sheet, useToast } from "@/src/components/overlay";
import { BackButton } from "@/src/components/alliance/common";
import { Button, Chip, Icon, Panel, Row, T } from "@/src/components/ui";
import { fmt, LANGS, localeOf, useI18n } from "@/src/i18n";
import * as push from "@/src/push/push";
import { useAuth } from "@/src/state/AuthContext";
import { tour } from "@/src/state/tour";
import { useGame } from "@/src/state/useGame";
import { fonts, radius, spacing, useTheme } from "@/src/theme";

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { t, lang, setLang } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { account, logout } = useAuth();
  const { player, world } = useGame();
  const { show, showError } = useToast();
  const [erasing, setErasing] = useState(false);
  const [password, setPassword] = useState("");
  const [pushState, setPushState] = useState<push.PushState | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const erase = useDeleteAccount();
  // A Google account has no password of ours to re-type; the sheet itself is the confirmation there.
  const needsPassword = (account?.provider ?? "password") === "password";

  // Reading the current state needs the operating system's answer, which is async; until it arrives the panel is
  // not drawn rather than drawn wrong.
  useEffect(() => {
    let alive = true;
    push.state().then((state) => {
      if (alive) setPushState(state);
    });
    return () => {
      alive = false;
    };
  }, []);

  const togglePush = async () => {
    setPushBusy(true);
    try {
      if (pushState === "on") {
        await push.disable();
        setPushState("off");
        return;
      }
      const state = await push.enable(lang);
      setPushState(state);
      if (state === "denied") show(t("pushDenied"), "error");
      if (state === "unavailable") show(t("pushUnavailable"), "error");
    } finally {
      setPushBusy(false);
    }
  };

  const doLogout = () =>
    // The device stops being this account's: a token left registered would keep delivering their alerts to whoever
    // signs in next. The player's own on/off choice is left alone.
    push
      .disable(true)
      .catch(() => {})
      .then(() => logout())
      .then(() => {
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

  const doErase = async () => {
    try {
      await erase.mutateAsync(needsPassword ? password : undefined);
    } catch (e) {
      showError(e);
      return;
    }
    // The account is gone server-side; logout is only here to clear what this device still holds.
    setErasing(false);
    setPassword("");
    await logout();
    show(t("deleteAccountDone"), "success");
    router.replace("/login");
  };

  return (
    <Screen title={t("settings")} left={<BackButton testID="settings-back" />} testID="settings-screen">
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
            <Button
              title={t("tourReplay")}
              icon="compass-outline"
              variant="secondary"
              onPress={() => {
                router.replace("/(tabs)/map");
                setTimeout(() => tour.start(), 600);
              }}
              testID="settings-tour-replay"
            />
            <Button title={t("logout")} icon="logout" variant="danger" onPress={confirmLogout} testID="settings-logout" />
          </View>
        </Panel>

        {pushState && pushState !== "unavailable" ? (
          <Panel testID="settings-push">
            <Row>
              <Icon name={pushState === "on" ? "bell-ring-outline" : "bell-off-outline"} size={18} color={pushState === "on" ? colors.brandPrimary : colors.muted} />
              <T v="label">{t("pushTitle")}</T>
            </Row>
            <T v="caption" style={{ marginTop: 6 }} testID="settings-push-state">
              {pushState === "on" ? t("pushOn") : pushState === "denied" ? t("pushDenied") : t("pushOff")}
            </T>
            <T v="caption" style={{ marginTop: 4 }}>
              {t("pushLead")}
            </T>
            <Button
              title={pushState === "on" ? t("pushDisable") : t("pushEnable")}
              icon={pushState === "on" ? "bell-off-outline" : "bell-ring-outline"}
              variant="secondary"
              loading={pushBusy}
              style={{ marginTop: spacing.sm }}
              onPress={togglePush}
              testID="settings-push-toggle"
            />
          </Panel>
        ) : null}

        {world?.inactivity ? (
          <Panel testID="settings-inactivity">
            <Row>
              <Icon name="account-clock-outline" size={18} color={colors.warning} />
              <T v="label">{t("inactivityTitle")}</T>
            </Row>
            <T v="caption" style={{ marginTop: 6 }} testID="settings-inactivity-rule">
              {world.inactivity.phase === "EARLY"
                ? fmt(t("inactivityEarly"), { days: world.inactivity.early_phase_days, date: new Date(world.inactivity.early_phase_until).toLocaleDateString(localeOf(lang)), n: world.inactivity.early_timeout_days })
                : fmt(t("inactivityMature"), { n: world.inactivity.timeout_days_after })}
            </T>
            {player?.last_active_at ? (
              <T v="caption" style={{ marginTop: 4 }} testID="settings-last-active">
                {t("inactivityLastActive")}: {new Date(player.last_active_at).toLocaleString(localeOf(lang))}
              </T>
            ) : null}
          </Panel>
        ) : null}

        <Panel testID="settings-privacy">
          <View style={{ gap: spacing.sm }}>
            <Button title={t("privacyTitle")} icon="shield-lock-outline" variant="secondary" onPress={() => router.push("/legal/privacy")} testID="settings-privacy-link" />
            <Button title={t("deleteAccount")} icon="account-remove-outline" variant="danger" onPress={() => setErasing(true)} testID="settings-delete-account" />
          </View>
        </Panel>

        <T v="caption" style={{ textAlign: "center" }} testID="settings-version">
          Empire Lords Dragon · {t("appVersion")} {Constants.expoConfig?.version ?? "1.0.0"}
        </T>
      </ScrollView>

      <Sheet
        visible={erasing}
        onClose={() => {
          setErasing(false);
          setPassword("");
        }}
        title={t("deleteAccount")}
        testID="delete-account-sheet"
        footer={
          <Row style={{ gap: spacing.sm }}>
            <Button
              title={t("cancel")}
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => {
                setErasing(false);
                setPassword("");
              }}
              testID="delete-account-cancel"
            />
            <Button
              title={t("deleteAccountCta")}
              variant="danger"
              style={{ flex: 1 }}
              loading={erase.isPending}
              disabled={needsPassword && password.length < 8}
              onPress={doErase}
              testID="delete-account-confirm"
            />
          </Row>
        }
      >
        <View style={{ gap: spacing.sm }}>
          <Row style={{ gap: spacing.sm }}>
            <Icon name="alert-octagon-outline" size={22} color={colors.error} />
            <T v="label" style={{ flex: 1, color: colors.error }}>
              {t("deleteAccountWarning")}
            </T>
          </Row>
          <T v="caption">{t("deleteAccountLead")}</T>
          {needsPassword ? (
            <TextInput
              testID="delete-account-password"
              style={{ height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceTertiary, color: colors.onSurface, paddingHorizontal: spacing.md, fontFamily: fonts.body, fontSize: 15 }}
              placeholder={t("password")}
              placeholderTextColor={colors.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
            />
          ) : null}
          <Button
            title={t("deleteAccountHow")}
            icon="text-box-outline"
            variant="ghost"
            onPress={() => {
              setErasing(false);
              router.push("/legal/delete-account");
            }}
            testID="delete-account-details"
          />
        </View>
      </Sheet>
    </Screen>
  );
}
