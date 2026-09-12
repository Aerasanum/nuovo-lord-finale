import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, Pressable, TextInput, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { post } from "@/src/api/client";
import { type GmRegion, qk, useWorlds, type WorldDto } from "@/src/api/hooks";
import { Crest } from "@/src/components/Crest";
import { Screen, Sheet, useToast } from "@/src/components/overlay";
import { Button, Empty, Icon, Loading, Panel, Row, T } from "@/src/components/ui";
import { formatCountdown, langKey, regionFlag } from "@/src/game/grandeMondo";
import { fmt, tDyn, useI18n } from "@/src/i18n";
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
  gmBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, height: 22, borderRadius: radius.pill, backgroundColor: c.brandPrimary },
  gmBadgeText: { color: c.onBrandPrimary, fontSize: 11, fontFamily: fonts.body, fontWeight: "700" },
  regionRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.divider, minHeight: 56 },
  regionDisabled: { opacity: 0.45 },
  flag: { fontSize: 26, width: 36, textAlign: "center" },
  seats: { fontFamily: fonts.body, fontWeight: "700", color: c.brandPrimary },
  seatsFull: { color: c.error },
  chosen: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: c.surfaceTertiary },
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
  const [joining, setJoining] = useState<WorldDto | null>(null);
  const [region, setRegion] = useState<GmRegion | null>(null);
  const [house, setHouse] = useState("");
  const [busy, setBusy] = useState(false);

  const openJoin = (w: WorldDto) => {
    setRegion(null);
    setJoining(w);
  };

  const enter = async (worldId: string) => {
    await selectWorld(worldId);
    router.replace("/(tabs)/map");
  };

  const join = async () => {
    if (!joining) return;
    if (joining.grande_mondo && !region) return;
    setBusy(true);
    try {
      await post(`/worlds/${joining.world_id}/join`, { house_name: house.trim(), ...(region ? { region_code: region.code } : {}) });
      show(t("founded"), "success");
      queryClient.invalidateQueries({ queryKey: qk.worlds });
      const wid = joining.world_id;
      setJoining(null);
      await enter(wid);
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
          renderItem={({ item: w }: { item: WorldDto }) => (
            <Panel style={s.card} testID={`world-card-${w.world_id}`}>
              <Row style={{ justifyContent: "space-between" }}>
                <Row style={{ flex: 1 }}>
                  <Icon name={w.grande_mondo ? "earth" : "map"} size={22} color={colors.brandPrimary} />
                  <T v="heading" style={{ flexShrink: 1 }}>
                    {w.name}
                  </T>
                  {w.grande_mondo ? (
                    <View style={s.gmBadge} testID={`world-gm-badge-${w.world_id}`}>
                      <T style={s.gmBadgeText}>{t("gmTitle").toUpperCase()}</T>
                    </View>
                  ) : null}
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
              {w.grande_mondo ? (
                <T v="caption" testID={`world-gm-sub-${w.world_id}`}>
                  {fmt(t("gmWorldSub"), { n: w.grande_mondo.regions.length, size: w.size })} · {w.grande_mondo.phase === "WAR" ? t("gmPhaseWar") : t("gmPhaseIsolation")} · {formatCountdown(w.grande_mondo.seconds_left)}
                  {w.grande_mondo.my_region ? ` · ${regionFlag(w.grande_mondo.my_region)} ${tDyn(t, `region_${w.grande_mondo.my_region}`, w.grande_mondo.my_region)}` : ""}
                </T>
              ) : null}
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
                <Button title={t("joinWorld")} icon="shield-crown" variant="secondary" disabled={w.status !== "OPEN"} onPress={() => openJoin(w)} testID={`world-join-${w.world_id}`} />
              )}
            </Panel>
          )}
        />
      )}
      <Sheet visible={!!joining} onClose={() => setJoining(null)} title={joining?.grande_mondo && !region ? t("gmChooseRegion") : t("joinWorld")} testID="join-sheet">
        {joining?.grande_mondo && !region ? (
          <View testID="join-region-list">
            <T v="caption">{t("gmRegionHint")}</T>
            {joining.grande_mondo.regions.map((r) => (
              <Pressable key={r.code} style={[s.regionRow, r.full && s.regionDisabled]} disabled={r.full} onPress={() => setRegion(r)} testID={`join-region-${r.code}`}>
                <T style={s.flag}>{regionFlag(r.code)}</T>
                <View style={{ flex: 1 }}>
                  <T v="body">{tDyn(t, `region_${r.code}`, r.name)}</T>
                  <T v="caption">
                    {t("gmLanguage")}: {tDyn(t, langKey(r.lang), r.lang)}
                  </T>
                </View>
                <T style={[s.seats, r.full && s.seatsFull]}>{r.full ? t("gmFull") : `${r.free} ${t("gmSeats")}`}</T>
                <Icon name="chevron-right" size={20} color={colors.onSurfaceSecondary} />
              </Pressable>
            ))}
          </View>
        ) : (
          <>
            {region ? (
              <Pressable style={s.chosen} onPress={() => setRegion(null)} testID="join-region-chosen">
                <T style={s.flag}>{regionFlag(region.code)}</T>
                <View style={{ flex: 1 }}>
                  <T v="body">{tDyn(t, `region_${region.code}`, region.name)}</T>
                  <T v="caption">
                    {t("gmLanguage")}: {tDyn(t, langKey(region.lang), region.lang)} · {region.free} {t("gmSeats")}
                  </T>
                </View>
                <T v="caption" style={{ color: colors.brandPrimary }}>
                  {t("gmBack")}
                </T>
              </Pressable>
            ) : null}
            <T v="body">{t("houseName")}</T>
            <TextInput testID="join-house-input" style={s.input} value={house} onChangeText={setHouse} placeholder="Casa Draghi" placeholderTextColor={colors.muted} maxLength={24} autoFocus />
            <KeyboardStickyView>
              <Button title={t("confirm")} onPress={join} loading={busy} disabled={house.trim().length < 3} testID="join-confirm-button" />
            </KeyboardStickyView>
          </>
        )}
      </Sheet>
    </Screen>
  );
}
