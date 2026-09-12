/**
 * Full-screen living city: orbit / zoom the 3D village, tap a building to inspect or open it.
 */
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CityScene } from "@/src/city/CityScene";
import { useVillageInput } from "@/src/city/useVillageInput";
import { Button, Icon, Loading, T } from "@/src/components/ui";
import { useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { position: "absolute", left: spacing.sm, right: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  btn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: c.glass, borderWidth: 1, borderColor: c.borderStrong },
  title: { flex: 1, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.md, backgroundColor: c.glass, borderWidth: 1, borderColor: c.border },
  hint: { position: "absolute", left: spacing.md, right: spacing.md, alignItems: "center" },
  card: { position: "absolute", left: spacing.md, right: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: c.glass, borderWidth: 1, borderColor: c.borderStrong, gap: spacing.sm },
}));

export default function CityScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { settlement } = useGame();
  const input = useVillageInput();
  const [picked, setPicked] = useState<string | null>(null);
  const d = settlement.data;
  const level = picked ? (picked === "Castello / Fortezza" ? d?.level : input?.buildings[picked]) ?? 0 : 0;

  return (
    <View style={s.root} testID="city-screen">
      {input ? <CityScene input={input} onPick={setPicked} style={[StyleSheet.absoluteFill, { borderRadius: 0, borderWidth: 0 }]} testID="city-scene" /> : <Loading />}
      <View style={[s.header, { top: insets.top + spacing.xs }]}>
        <Pressable style={s.btn} onPress={() => router.back()} testID="city-back" accessibilityRole="button" accessibilityLabel={t("back")}>
          <Icon name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={s.title}>
          <T v="label" numberOfLines={1} testID="city-title">
            {d?.name ?? t("tabCity")}
          </T>
          <T v="caption" numberOfLines={1}>
            {t("settlementLevel")} {d?.level ?? "—"} · {t("cityPopulation")} {input ? Math.min(30, 3 + Math.round(input.level * 0.85)) : "—"}
          </T>
        </View>
      </View>
      {!picked ? (
        <View style={[s.hint, { bottom: insets.bottom + spacing.md }]}>
          <T v="caption" style={{ textAlign: "center" }} testID="city-hint">
            {t("cityHint")}
          </T>
        </View>
      ) : (
        <Animated.View entering={FadeInDown.duration(250)} exiting={FadeOutDown.duration(200)} style={[s.card, { bottom: insets.bottom + spacing.md }]} testID="city-picked">
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <Icon name={picked === "Castello / Fortezza" ? "castle" : level > 0 ? "home-city" : "sign-direction"} size={22} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <T v="heading" numberOfLines={1} testID="city-picked-name">
                {picked}
              </T>
              <T v="caption">{level > 0 ? `${t("level")} ${level}` : t("cityVacantLot")}</T>
            </View>
            <Pressable onPress={() => setPicked(null)} style={{ padding: 6 }} testID="city-picked-close" accessibilityLabel={t("close")}>
              <Icon name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>
          {picked !== "Castello / Fortezza" ? <Button title={level > 0 ? t("cityOpenBuilding") : t("build")} icon={level > 0 ? "open-in-new" : "hammer"} onPress={() => router.push({ pathname: "/building/[name]", params: { name: picked } })} testID="city-picked-open" /> : null}
        </Animated.View>
      )}
    </View>
  );
}
