/**
 * Daily login reward (7-day streak, resources + speed-ups only — no Rubies): key-art vault backdrop, the 3D chest
 * on the pedestal (ChestGL) swinging open on claim, a 7-day strip showing what each day pays, and the reveal card.
 * Everything is server-authoritative: the screen only mirrors GET /daily and POST /daily/claim.
 */
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Redirect, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type DailyGrant, type DailyReward, useDaily, useDailyMutations } from "@/src/api/hooks";
import { ChestGL } from "@/src/components/daily/ChestGL";
import { useToast } from "@/src/components/overlay";
import { Button, Countdown, Icon, type IconName, Loading, RES_ICONS, resourceColor, Row, T } from "@/src/components/ui";
import { fmt, formatNumber, RESOURCE_LABELS, useI18n } from "@/src/i18n";
import { setMapRenderHold } from "@/src/map3d/engine";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const VAULT = require("../assets/cinematics/vault_0.jpg");
const REVEAL_DELAY_MS = 1900; // chest lid fully open + burst (see ChestGL timeline)

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.sm },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: c.glass, borderWidth: 1, borderColor: c.borderStrong },
  strip: { flexDirection: "row", gap: 6, paddingHorizontal: spacing.md },
  dayCard: { flex: 1, minWidth: 40, alignItems: "center", gap: 3, paddingVertical: spacing.sm, paddingHorizontal: 2, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.glass },
  dayToday: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  dayDone: { borderColor: c.success },
  dayChest: { minWidth: 52 },
  panel: { marginHorizontal: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: c.glass, borderWidth: 1, borderColor: c.borderStrong, gap: spacing.sm },
  reward: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 4 },
  check: { position: "absolute", top: 4, right: 4 },
}));

export default function DailyScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const { worldId } = useGame();
  const q = useDaily(worldId);
  const m = useDailyMutations(worldId ?? "");
  const { showError } = useToast();
  const [playing, setPlaying] = useState(false);
  const [granted, setGranted] = useState<DailyGrant | null>(null);
  const [revealed, setRevealed] = useState(false);

  // the vault owns the GPU while it is on screen (the map keeps ticking, it just skips drawing)
  useEffect(() => {
    setMapRenderHold(true);
    return () => setMapRenderHold(false);
  }, []);
  useEffect(() => {
    if (!granted) return;
    const id = setTimeout(() => setRevealed(true), REVEAL_DELAY_MS);
    return () => clearTimeout(id);
  }, [granted]);

  const d = q.data;
  // the painted pedestal top sits at 57.4 % of the key-art height; `cover` + `top` → height-limited on phones,
  // width-limited on wide screens (art is 603×1080)
  const artH = Math.max(height, width * (1080 / 603));
  const pedestalY = Math.round(0.574 * artH);
  const headerH = insets.top + spacing.xs + 48;
  const chestBaseY = Math.min(pedestalY, Math.round(height * 0.6));
  if (!worldId) return <Redirect href="/" />;

  const claim = () => {
    if (!d?.claimable || m.claim.isPending) return;
    setPlaying(true);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    m.claim
      .mutateAsync()
      .then((r) => {
        setGranted(r.granted);
        if (Platform.OS !== "web") setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}), REVEAL_DELAY_MS);
      })
      .catch((e) => {
        setPlaying(false);
        showError(e);
      });
  };

  const kindIcon = (k: DailyReward["kind"]): IconName => (k === "CHEST" ? "treasure-chest" : "sack");
  const dayShort = (r: DailyReward) => `×${Number.isInteger(r.mult) ? r.mult : r.mult.toFixed(2).replace(/0$/, "")}`;
  // day state: claimed days of the current streak sit before the day to claim (or include it once claimed today)
  const claimedThrough = d ? (d.claimable ? d.day - 1 : d.day) : 0;
  const shown = granted ?? null;

  return (
    <View style={s.root} testID="daily-screen">
      <Image source={VAULT} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" transition={300} />
      <LinearGradient colors={["rgba(10,9,8,0.55)", "rgba(10,9,8,0.15)", "rgba(10,9,8,0.92)"]} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} />
      {/* 3D chest: full-screen transparent canvas, framed so the chest base lands on the painted pedestal */}
      <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]} testID="daily-chest-stage">
        <ChestGL playing={playing} anchorY={chestBaseY / height} widthFrac={Math.min(0.42, 138 / width)} />
      </View>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.xs, paddingBottom: insets.bottom + spacing.lg, gap: spacing.md }} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Pressable style={s.close} onPress={() => router.back()} testID="daily-close" accessibilityRole="button" accessibilityLabel={t("close")}>
            <Icon name="close" size={22} color={colors.onSurface} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <T v="title" numberOfLines={1} testID="daily-title">
              {t("dailyTitle")}
            </T>
            <T v="caption" numberOfLines={1}>
              {t("daily")}
              {d ? ` · ${t("dailyStreak")} ${d.streak} ${t("dailyDays")}` : ""}
            </T>
          </View>
        </View>

        {/* keeps the strip below the chest + pedestal */}
        <View style={{ height: Math.max(120, chestBaseY + 28 - headerH - spacing.md) }} />

        {!d ? (
          <Loading />
        ) : (
          <>
            {/* 7-day strip */}
            <View style={s.strip} testID="daily-strip">
              {d.rewards.map((r) => {
                const done = r.day <= claimedThrough;
                const today = r.day === d.day && (d.claimable || !granted ? true : false);
                return (
                  <View key={r.day} style={[s.dayCard, r.kind === "CHEST" && s.dayChest, today && s.dayToday, done && !today && s.dayDone, r.day > d.day && { opacity: 0.6 }]} testID={`daily-day-${r.day}`} accessibilityState={{ selected: today }}>
                    <T v="caption" style={{ fontSize: 10, color: today ? colors.onBrandTertiary : colors.muted }}>
                      {t("dailyDay")} {r.day}
                    </T>
                    <Icon name={kindIcon(r.kind)} size={r.kind === "CHEST" ? 24 : 20} color={done && !today ? colors.success : r.kind === "CHEST" ? colors.resourceGold : today ? colors.brandPrimary : colors.onSurfaceSecondary} />
                    <T v="caption" style={{ fontSize: 10, color: colors.onSurface }} numberOfLines={1}>
                      {dayShort(r)}
                    </T>
                    {done ? <Icon name="check-circle" size={12} color={colors.success} style={s.check} /> : null}
                  </View>
                );
              })}
            </View>

            {/* reveal / claim panel */}
            {shown && revealed ? (
              <Animated.View entering={FadeInUp.duration(500)} style={s.panel} testID="daily-reveal">
                <Row>
                  <Icon name={kindIcon(shown.kind)} size={22} color={colors.brandPrimary} />
                  <T v="heading" style={{ flex: 1 }}>
                    {t("dailyReceived")} · {t("dailyDay")} {shown.day}
                  </T>
                </Row>
                {shown.resources
                  ? (Object.keys(shown.resources) as (keyof typeof shown.resources)[]).map((r) => (
                      <View key={r} style={s.reward} testID={`daily-reward-${r}`}>
                        <Icon name={RES_ICONS[r]} size={18} color={resourceColor(colors, r)} />
                        <T v="body" style={{ flex: 1 }}>
                          {RESOURCE_LABELS[lang][r]}
                        </T>
                        <T v="mono" style={{ color: colors.brandPrimary }}>
                          +{formatNumber(shown.resources![r] ?? 0)}
                        </T>
                      </View>
                    ))
                  : null}
                {shown.discarded && Object.keys(shown.discarded).length ? (
                  <T v="caption" style={{ color: colors.warning }} testID="daily-discarded">
                    {t("dailyDiscarded")}
                  </T>
                ) : null}
                <T v="caption" style={{ color: colors.brandPrimary }} testID="daily-tomorrow">
                  {fmt(t("dailyTomorrow"), { day: (shown.day % 7) + 1 })}
                </T>
                <Button title={t("close")} icon="check" variant="secondary" onPress={() => router.back()} testID="daily-done" />
              </Animated.View>
            ) : (
              <Animated.View entering={FadeInDown.duration(400)} style={s.panel} testID="daily-claim-panel">
                <T v="caption">{t("dailySubtitle")}</T>
                {d.claimable && !granted ? (
                  <>
                    <Row>
                      <Icon name={kindIcon(d.rewards[d.day - 1].kind)} size={20} color={colors.brandPrimary} />
                      <T v="label" style={{ flex: 1 }} testID="daily-today-label">
                        {t("dailyToday")} · {t("dailyDay")} {d.day} · {d.rewards[d.day - 1].kind === "CHEST" ? t("dailyChest") : t("dailyResources")} {dayShort(d.rewards[d.day - 1])}
                      </T>
                    </Row>
                    <Row style={{ flexWrap: "wrap", gap: spacing.sm }}>
                      {(Object.keys(d.rewards[d.day - 1].resources) as (keyof DailyReward["resources"])[]).map((r) => (
                        <Row key={r} style={{ gap: 3 }}>
                          <Icon name={RES_ICONS[r]} size={14} color={resourceColor(colors, r)} />
                          <T v="caption" style={{ color: colors.onSurface }}>
                            {formatNumber(d.rewards[d.day - 1].resources[r] ?? 0)}
                          </T>
                        </Row>
                      ))}
                    </Row>
                    <T v="caption">{t("dailyWarehouseNote")}</T>
                    <Button title={playing ? t("dailyOpening") : t("dailyClaim")} icon="treasure-chest" loading={m.claim.isPending} disabled={playing} onPress={claim} testID="daily-claim" />
                  </>
                ) : (
                  <>
                    <Row>
                      <Icon name={granted ? "treasure-chest" : "check-circle"} size={20} color={colors.success} />
                      <T v="label" style={{ flex: 1 }} testID="daily-claimed-label">
                        {granted ? t("dailyOpening") : t("dailyClaimedToday")}
                      </T>
                    </Row>
                    {!granted ? (
                      <Row>
                        <T v="caption">{t("dailyNextIn")}</T>
                        <Countdown endsAt={d.next_reset_at} testID="daily-next-reset" />
                      </Row>
                    ) : null}
                  </>
                )}
              </Animated.View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
