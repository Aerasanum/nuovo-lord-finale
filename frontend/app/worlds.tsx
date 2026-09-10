import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, Pressable, TextInput, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { post } from "@/src/api/client";
import { qk, useWorlds } from "@/src/api/hooks";
import { Crest } from "@/src/components/Crest";
import { Screen, Sheet, useToast } from "@/src/components/overlay";
import { Button, Empty, Icon, Loading, Panel, Row, T } from "@/src/components/ui";
import { useI18n } from "@/src/i18n";
import { queryClient } from "@/src/query-client";
import { useAuth } from "@/src/state/AuthContext";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  card: { marginHorizontal: spacing.md, marginBottom: spacing.sm, gap: spacing.sm },
  stat: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap" },
  input: { height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surfaceTertiary, color: c.onSurface, paddingHorizontal: spacing.md, fontFamily: fonts.body, fontSize: 15 },
  badge: { paddingHorizontal: 8, height: 22, borderRadius: radius.pill, backgroundColor: c.success, justifyContent: "center" },
  badgeText: { color: c.onSuccess, fontSize: 11, fontFamily: fonts.body, fontWeight: "600" },
  logout: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
}));

export default function WorldsScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { account, logout, selectWorld } = useAuth();
  const worlds = useWorlds(!!account);
  const { showError, show } = useToast();
  const [joining, setJoining] = useState<string | null>(null);
  const [house, setHouse] = useState("");
  const [busy, setBusy] = useState(false);

  const enter = async (worldId: string) => {
    await selectWorld(worldId);
    router.replace("/(tabs)/map");
  };

  const join = async () => {
    if (!joining) return;
    setBusy(true);
    try {
      await post(`/worlds/${joining}/join`, { house_name: house.trim() });
      show(t("founded"), "success");
      queryClient.invalidateQueries({ queryKey: qk.worlds });
      setJoining(null);
      await enter(joining);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title={t("chooseWorld")}
      testID="worlds-screen"
      right={
        <Pressable onPress={() => logout().then(() => router.replace("/login"))} style={s.logout} testID="worlds-logout-button">
          <Icon name="logout" size={22} color={colors.onSurfaceSecondary} />
        </Pressable>
      }
    >
      {worlds.isLoading ? (
        <Loading />
      ) : worlds.isError ? (
        <Empty icon="cloud-off-outline" title={t("error")} subtitle={String((worlds.error as Error).message)} />
      ) : (
        <FlatList
          data={worlds.data?.worlds ?? []}
          keyExtractor={(w: any) => w.world_id}
          contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: insets.bottom + spacing.lg }}
          ListEmptyComponent={<Empty icon="earth" title={t("worlds")} subtitle={t("generating")} />}
          renderItem={({ item: w }: any) => (
            <Panel style={s.card} testID={`world-card-${w.world_id}`}>
              <Row style={{ justifyContent: "space-between" }}>
                <Row>
                  <Icon name="earth" size={22} color={colors.brandPrimary} />
                  <T v="heading">{w.name}</T>
                </Row>
                {w.joined ? (
                  <Row style={{ gap: 6 }}>
                    {w.house_crest ? <Crest crest={w.house_crest} size={22} testID={`world-crest-${w.world_id}`} /> : null}
                    <View style={s.badge}>
                      <T style={s.badgeText}>{w.house_name}</T>
                    </View>
                  </Row>
                ) : null}
              </Row>
              <View style={s.stat}>
                <T v="caption">
                  {t("players")}: {w.player_count}/{w.player_slots}
                </T>
                <T v="caption">
                  {t("age")}: {Math.floor(w.age_days)} {t("days")}
                </T>
                <T v="caption">
                  {w.status === "OPEN" ? t("open") : t("generating")} · {w.size}×{w.size}
                </T>
              </View>
              <T v="caption" numberOfLines={1}>
                {t("spec")} {w.spec_version} · {String(w.spec_hash).slice(0, 12)}…
              </T>
              {w.joined ? (
                <Button title={t("enter")} icon="login-variant" onPress={() => enter(w.world_id)} testID={`world-enter-${w.world_id}`} />
              ) : (
                <Button title={t("joinWorld")} icon="shield-crown" variant="secondary" disabled={w.status !== "OPEN"} onPress={() => setJoining(w.world_id)} testID={`world-join-${w.world_id}`} />
              )}
            </Panel>
          )}
        />
      )}
      <Sheet visible={!!joining} onClose={() => setJoining(null)} title={t("joinWorld")} testID="join-sheet">
        <T v="body">{t("houseName")}</T>
        <TextInput testID="join-house-input" style={s.input} value={house} onChangeText={setHouse} placeholder="Casa Draghi" placeholderTextColor={colors.muted} maxLength={24} autoFocus />
        <KeyboardStickyView>
          <Button title={t("confirm")} onPress={join} loading={busy} disabled={house.trim().length < 3} testID="join-confirm-button" />
        </KeyboardStickyView>
      </Sheet>
    </Screen>
  );
}
