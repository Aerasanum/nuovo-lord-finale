import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useToast } from "@/src/components/overlay";
import { Button, Icon, Row, T } from "@/src/components/ui";
import { LANGS, useI18n } from "@/src/i18n";
import { useAuth } from "@/src/state/AuthContext";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  hero: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.xs },
  card: { marginHorizontal: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing.md, gap: spacing.sm },
  input: { height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surfaceTertiary, color: c.onSurface, paddingHorizontal: spacing.md, fontFamily: fonts.body, fontSize: 15 },
  switch: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.xs },
  tab: { flex: 1, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceTertiary },
  tabActive: { backgroundColor: c.brandTertiary, borderWidth: 1, borderColor: c.brandPrimary },
  divider: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginVertical: spacing.xs },
  line: { flex: 1, height: 1, backgroundColor: c.divider },
  lang: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "center", marginTop: spacing.md },
  langBtn: { paddingHorizontal: 12, height: 32, borderRadius: radius.pill, justifyContent: "center", borderWidth: 1, borderColor: c.border },
  langActive: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
}));

export default function LoginScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const { account, login, register, loginWithGoogle } = useAuth();
  const { showError } = useToast();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  // auth gate: Google login (deep link / hot link on Android) sets the account without going through submit()
  useEffect(() => {
    if (account) router.replace("/worlds");
  }, [account]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === "login") await login(email.trim(), password);
      else await register(email.trim(), password, name.trim() || undefined);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root} testID="login-screen">
      <KeyboardAwareScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }} bottomOffset={24} keyboardShouldPersistTaps="handled">
        <LinearGradient colors={[colors.brandTertiary, colors.surface]} style={s.hero}>
          <Row>
            <Icon name="chess-rook" size={28} color={colors.brandPrimary} />
            <T v="display" testID="login-title">
              {t("appName")}
            </T>
          </Row>
          <T v="body">{t("tagline")}</T>
        </LinearGradient>
        <View style={s.card}>
          <View style={s.switch}>
            <Pressable style={[s.tab, mode === "login" && s.tabActive]} onPress={() => setMode("login")} testID="login-mode-login">
              <T v="label" style={mode === "login" ? { color: colors.onBrandTertiary } : undefined}>
                {t("login")}
              </T>
            </Pressable>
            <Pressable style={[s.tab, mode === "register" && s.tabActive]} onPress={() => setMode("register")} testID="login-mode-register">
              <T v="label" style={mode === "register" ? { color: colors.onBrandTertiary } : undefined}>
                {t("register")}
              </T>
            </Pressable>
          </View>
          {mode === "register" ? <TextInput testID="login-name-input" style={s.input} placeholder={t("displayName")} placeholderTextColor={colors.muted} value={name} onChangeText={setName} autoCapitalize="words" /> : null}
          <TextInput testID="login-email-input" style={s.input} placeholder={t("email")} placeholderTextColor={colors.muted} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
          <TextInput testID="login-password-input" style={s.input} placeholder={t("password")} placeholderTextColor={colors.muted} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={submit} returnKeyType="go" />
          <Button testID="login-submit-button" title={mode === "login" ? t("login") : t("register")} onPress={submit} loading={busy} disabled={!email || password.length < 8} icon="login" />
          <View style={s.divider}>
            <View style={s.line} />
            <T v="caption">{t("or")}</T>
            <View style={s.line} />
          </View>
          <Button testID="login-google-button" title={t("continueGoogle")} variant="secondary" icon="google" onPress={() => loginWithGoogle().catch(showError)} />
        </View>
        <View style={s.lang}>
          {LANGS.map(({ code: l, flag, label }) => (
            <Pressable key={l} style={[s.langBtn, lang === l && s.langActive]} onPress={() => setLang(l)} testID={`lang-${l}`} accessibilityLabel={label}>
              <T v="caption" style={lang === l ? { color: colors.onBrandTertiary } : undefined}>
                {flag} {label}
              </T>
            </Pressable>
          ))}
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}
