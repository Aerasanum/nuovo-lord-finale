/**
 * Skippable attack cinematics (Bible §41.2 — Major Attack 6s / Conquest Success 8s; standard departure 4s).
 *
 *  DEPARTURE  — played when the player launches a march: the real formation marches out under the house crest and
 *               the Alliance banner. Variants: a Dragon/Angel/Demon descends from the sky and advances with the
 *               army (legendary → Major Attack), a Falcon sweeps ahead when Falcons are in the march.
 *  CONQUEST   — played when an ownership change is committed in the player's favour (settlement or Pyramid):
 *               the enemy banner falls, the house crest rises, survivors are listed.
 *
 * The picture is a real-time 3D scene (three.js on expo-gl — see ./scene3d): night march with a low-poly army,
 * procedural dragon, falcon, fire particles; dawn conquest with the taken castle/Pyramid. This file keeps the
 * provider, the variant plan and the 2D HUD (crest, title, composition, Salta, progress).
 * Pure presentation: the overlay never blocks server timers; "Salta" is available after one second.
 */
import { LinearGradient } from "expo-linear-gradient";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, FadeIn, FadeInDown, FadeInUp, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import type { CrestDto } from "@/src/api/hooks";
import { Crest } from "@/src/components/Crest";
import { Icon, type IconName } from "@/src/components/ui";
import { fmt, formatDuration, formatNumber, useI18n } from "@/src/i18n";
import { setMapRenderHold } from "@/src/map3d/engine";
import { fonts, radius, spacing, useTheme } from "@/src/theme";

import { CinematicGL } from "./CinematicGL";

export type CinematicSpec = {
  kind: "DEPARTURE" | "CONQUEST";
  units: Record<string, number>;
  missionLabel?: string | null;
  targetName?: string | null;
  etaSeconds?: number | null;
  crest?: CrestDto | null;
  houseName?: string | null;
  allianceTag?: string | null;
  pyramid?: boolean;
  newLevel?: number | null;
  skin?: string | null;
};

type Legendary = "dragon" | "angel" | "demon";
const LEGENDARY: Record<string, Legendary> = { Drago: "dragon", Angelo: "angel", Demone: "demon" };
const UNIT_ICON: Record<string, IconName> = {
  Fanteria: "shield-sword",
  Arciere: "bow-arrow",
  Cavalleria: "horse-variant",
  Catapulta: "arrow-projectile-multiple",
  "Carro di Conquista": "flag-variant",
  Orso: "paw",
  Leone: "cat",
  Falco: "bird",
  Lupo: "dog-side",
  "Elefante da Guerra": "elephant",
  Drago: "fire",
  Angelo: "star-four-points",
  Demone: "emoticon-devil",
};
const MAJOR_UNITS = 25000; // spec.cinematics.major_attack.trigger_any.total_units_gte
const SCRIM = "rgba(7, 11, 24, 0.78)"; // matches the night backdrop of the GL scene (identical in every theme)

export function cinematicPlan(spec: CinematicSpec) {
  const total = Object.values(spec.units).reduce((a, c) => a + (c || 0), 0);
  const legendary = (Object.keys(spec.units).find((u) => LEGENDARY[u] && spec.units[u] > 0) ? LEGENDARY[Object.keys(spec.units).find((u) => LEGENDARY[u] && spec.units[u] > 0)!] : null) as Legendary | null;
  const falcon = (spec.units.Falco ?? 0) > 0;
  const major = !!legendary || total >= MAJOR_UNITS;
  const durationMs = spec.kind === "CONQUEST" ? 8000 : major ? 6000 : 4000;
  return { total, legendary, falcon, major, durationMs };
}

// --------------------------------------------------------------------------------------------- provider
const Ctx = createContext<{ play: (spec: CinematicSpec) => void }>({ play: () => {} });

export function CinematicProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<{ spec: CinematicSpec; seq: number } | null>(null);
  const play = useCallback((spec: CinematicSpec) => setCurrent((c) => ({ spec, seq: (c?.seq ?? 0) + 1 })), []);
  const done = useCallback(() => setCurrent(null), []);
  const value = useMemo(() => ({ play }), [play]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {current ? <CinematicOverlay key={current.seq} spec={current.spec} onDone={done} /> : null}
    </Ctx.Provider>
  );
}

export function useCinematic() {
  return useContext(Ctx);
}

// --------------------------------------------------------------------------------------------- overlay
function CinematicOverlay({ spec, onDone }: { spec: CinematicSpec; onDone: () => void }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const plan = useMemo(() => cinematicPlan(spec), [spec]);
  const sceneSpec = useMemo(() => ({ units: spec.units, legendary: plan.legendary, falcon: plan.falcon, durationMs: plan.durationMs, crest: spec.crest ?? null, pyramid: !!spec.pyramid, newLevel: spec.newLevel ?? null, skin: spec.skin ?? null }), [spec, plan]);
  // the show clock starts on the first rendered GL frame (or after a grace period if GL never comes up)
  const [started, setStarted] = useState<number | null>(null);
  const onReady = useCallback((t0: number) => setStarted((s) => s ?? t0), []);
  const [canSkip, setCanSkip] = useState(false);
  const progress = useSharedValue(0);

  useEffect(() => {
    // the map underneath stops drawing for the whole show (one GL context at a time, no wasted GPU on device)
    setMapRenderHold(true);
    const skip = setTimeout(() => setCanSkip(true), 1000); // "Salta" never depends on the GPU coming up
    const grace = setTimeout(() => setStarted((s) => s ?? Date.now()), 6000);
    return () => {
      clearTimeout(skip);
      clearTimeout(grace);
      setMapRenderHold(false);
    };
  }, []);
  useEffect(() => {
    if (started === null) return;
    const elapsed = Math.max(0, Date.now() - started);
    progress.value = withTiming(1, { duration: Math.max(0, plan.durationMs - elapsed), easing: Easing.linear });
    const end = setTimeout(onDone, Math.max(0, plan.durationMs + 250 - elapsed));
    return () => clearTimeout(end);
  }, [started, plan.durationMs, onDone, progress]);

  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  const title =
    spec.kind === "CONQUEST"
      ? t(spec.pyramid ? "cinConquestPyramid" : "cinConquest")
      : plan.legendary === "dragon"
        ? t("cinDragon")
        : plan.legendary === "angel"
          ? t("cinAngel")
          : plan.legendary === "demon"
            ? t("cinDemon")
            : plan.major
              ? t("cinMajor")
              : plan.falcon
                ? t("cinFalcon")
                : t("cinDeparture");
  const composition = Object.entries(spec.units).filter(([, c]) => c > 0);

  return (
    <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(400)} style={[StyleSheet.absoluteFill, styles.root]} testID="cinematic-overlay" accessibilityViewIsModal>
      <CinematicGL kind={spec.kind} spec={sceneSpec} onReady={onReady} />
      {/* scrims: keep the HUD legible over a bright dawn sky or a dark night (scene colours are theme-independent) */}
      <LinearGradient colors={[SCRIM, "transparent"]} style={[styles.scrim, { top: 0, height: 220 }]} pointerEvents="none" />
      <LinearGradient colors={["transparent", SCRIM]} style={[styles.scrim, { bottom: 0, height: 200 }]} pointerEvents="none" />
      {/* semantic markers for the variant on stage (the scene itself is a GL canvas) */}
      <View style={styles.marker} testID={spec.kind === "CONQUEST" ? "cinematic-conquest" : "cinematic-departure"} pointerEvents="none" />
      {plan.legendary ? <View style={styles.marker} testID={`cinematic-${plan.legendary}`} pointerEvents="none" /> : null}
      {plan.falcon ? <View style={styles.marker} testID="cinematic-falcon" pointerEvents="none" /> : null}

      {/* HUD: crest + house + alliance banner */}
      <Animated.View entering={FadeInDown.duration(500)} style={[styles.hud, { top: spacing.xl + 8 }]} pointerEvents="none">
        <View style={styles.houseRow}>
          {spec.crest ? <Crest crest={spec.crest} size={44} testID="cinematic-crest" /> : <Icon name="shield" size={40} color={colors.brandPrimary} />}
          <View style={{ flex: 1 }}>
            <Text style={[styles.house, { color: colors.onSurface }]} numberOfLines={1}>
              {spec.houseName ?? ""}
            </Text>
            {spec.allianceTag ? (
              <View style={[styles.tag, { backgroundColor: colors.brandTertiary, borderColor: colors.borderStrong }]} testID="cinematic-alliance-banner">
                <Icon name="flag-variant" size={12} color={colors.onBrandTertiary} />
                <Text style={[styles.tagText, { color: colors.onBrandTertiary }]}>[{spec.allianceTag}]</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Animated.Text entering={FadeInUp.delay(350).duration(600)} style={[styles.title, { color: colors.brandPrimary }]} testID="cinematic-title" numberOfLines={2}>
          {title}
        </Animated.Text>
        <Animated.Text entering={FadeInUp.delay(600).duration(600)} style={[styles.subtitle, { color: colors.onSurfaceSecondary }]} numberOfLines={2}>
          {spec.kind === "DEPARTURE"
            ? `${spec.missionLabel ?? ""}${spec.targetName ? ` ${t("cinTowards")} ${spec.targetName}` : ""}${spec.etaSeconds ? ` · ${fmt(t("cinEta"), { eta: formatDuration(spec.etaSeconds) })}` : ""}`
            : `${spec.targetName ?? ""}${spec.newLevel ? ` · L${spec.newLevel}` : ""}`}
        </Animated.Text>
      </Animated.View>

      {/* composition (actual army) */}
      <Animated.View entering={FadeInUp.delay(spec.kind === "CONQUEST" ? 3400 : 900).duration(600)} style={[styles.bottom, { bottom: spacing.xl + 52 }]} pointerEvents="none">
        <Text style={[styles.compTitle, { color: colors.onSurfaceSecondary }]}>{spec.kind === "CONQUEST" ? t("cinSurvivors") : fmt(t("cinUnitsTotal"), { n: formatNumber(plan.total) })}</Text>
        <View style={styles.chips} testID="cinematic-composition">
          {composition.map(([u, c]) => (
            <View key={u} style={[styles.chip, { backgroundColor: colors.glass, borderColor: LEGENDARY[u] ? colors.brandPrimary : colors.border }]}>
              <Icon name={UNIT_ICON[u] ?? "sword"} size={13} color={LEGENDARY[u] ? colors.brandPrimary : colors.onSurface} />
              <Text style={[styles.chipText, { color: colors.onSurface }]}>
                {u} {formatNumber(c)}
              </Text>
            </View>
          ))}
        </View>
      </Animated.View>

      {/* skip + progress */}
      {canSkip ? (
        <Animated.View entering={FadeIn.duration(250)} style={[styles.skipWrap, { bottom: spacing.xl + 10 }]}>
          <Pressable onPress={onDone} style={[styles.skip, { backgroundColor: colors.glass, borderColor: colors.borderStrong }]} testID="cinematic-skip" accessibilityRole="button">
            <Text style={[styles.skipText, { color: colors.onSurface }]}>{t("cinSkip")}</Text>
            <Icon name="skip-next" size={16} color={colors.onSurface} />
          </Pressable>
        </Animated.View>
      ) : null}
      <View style={[styles.bar, { backgroundColor: colors.surfaceTertiary }]}>
        <Animated.View style={[styles.barFill, { backgroundColor: colors.brandPrimary }, barStyle]} />
      </View>
    </Animated.View>
  );
}

// --------------------------------------------------------------------------------------------- styles
const styles = StyleSheet.create({
  root: { zIndex: 1000, elevation: 1000, backgroundColor: "#070B18", overflow: "hidden" },
  scrim: { position: "absolute", left: 0, right: 0 },
  marker: { position: "absolute", width: 1, height: 1, opacity: 0 },
  hud: { position: "absolute", left: spacing.md, right: spacing.md, gap: 6 },
  houseRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  house: { fontFamily: fonts.display, fontSize: 18 },
  tag: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, height: 22, borderRadius: radius.pill, borderWidth: 1, marginTop: 2 },
  tagText: { fontFamily: fonts.body, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  title: { fontFamily: fonts.display, fontSize: 27, lineHeight: 33, marginTop: spacing.sm },
  subtitle: { fontFamily: fonts.body, fontSize: 14 },
  bottom: { position: "absolute", left: spacing.md, right: spacing.md, gap: 6 },
  compTitle: { fontFamily: fonts.body, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, height: 28, borderRadius: radius.pill, borderWidth: 1 },
  chipText: { fontFamily: fonts.body, fontSize: 12, fontWeight: "700" },
  skipWrap: { position: "absolute", right: spacing.md },
  skip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, height: 44, borderRadius: radius.pill, borderWidth: 1 },
  skipText: { fontFamily: fonts.body, fontSize: 14, fontWeight: "700" },
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, height: 3 },
  barFill: { height: 3 },
});
