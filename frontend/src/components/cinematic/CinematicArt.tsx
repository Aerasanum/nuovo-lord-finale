/**
 * Key-art cinematic player: two epic film stills per variant (bundled JPEGs, generated once at development time)
 * brought to life with slow Ken Burns camera moves, a cross-dissolve cut with a light flash, drifting embers,
 * letterbox bars and a subtle handheld sway for the legendary variants. The whole picture is a pure function of the
 * show clock (`t` in ms) → deterministic and skip-safe; `onReady` fires when the first still is decoded so the HUD
 * timers start only when there is a picture on screen.
 */
import React, { useEffect, useMemo, useState } from "react";
import { type ImageSourcePropType, StyleSheet, useWindowDimensions } from "react-native";
import Animated, { Easing, Extrapolation, interpolate, type SharedValue, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

export type ArtVariant = "standard" | "falcon" | "major" | "dragon" | "angel" | "demon" | "conquest" | "pyramid";

const ART: Record<ArtVariant, [ImageSourcePropType, ImageSourcePropType]> = {
  standard: [require("../../../assets/cinematics/standard_0.jpg"), require("../../../assets/cinematics/standard_1.jpg")],
  falcon: [require("../../../assets/cinematics/falcon_0.jpg"), require("../../../assets/cinematics/falcon_1.jpg")],
  major: [require("../../../assets/cinematics/major_0.jpg"), require("../../../assets/cinematics/major_1.jpg")],
  dragon: [require("../../../assets/cinematics/dragon_0.jpg"), require("../../../assets/cinematics/dragon_1.jpg")],
  angel: [require("../../../assets/cinematics/angel_0.jpg"), require("../../../assets/cinematics/angel_1.jpg")],
  demon: [require("../../../assets/cinematics/demon_0.jpg"), require("../../../assets/cinematics/demon_1.jpg")],
  conquest: [require("../../../assets/cinematics/conquest_0.jpg"), require("../../../assets/cinematics/conquest_1.jpg")],
  pyramid: [require("../../../assets/cinematics/pyramid_0.jpg"), require("../../../assets/cinematics/pyramid_1.jpg")],
};

// Physical palette of the artwork (embers / flash) — identical in every UI theme by design.
const MOOD: Record<ArtVariant, { ember: string; flash: string }> = {
  standard: { ember: "#FFB067", flash: "#FFD9A0" },
  falcon: { ember: "#FFC98A", flash: "#FFE2B8" },
  major: { ember: "#FFA24D", flash: "#FFD08A" },
  dragon: { ember: "#FF8A2A", flash: "#FFB56B" },
  angel: { ember: "#FFF2C8", flash: "#FFFFFF" },
  demon: { ember: "#FF4A1F", flash: "#FF7A45" },
  conquest: { ember: "#FFD97A", flash: "#FFF0C0" },
  pyramid: { ember: "#FFE08A", flash: "#FFF4D0" },
};

const XFADE = 800; // ms cross-dissolve
const EMBERS = 22;

type Props = { variant: ArtVariant; durationMs: number; onReady: (startedAt: number) => void };

export function CinematicArt({ variant, durationMs, onReady }: Props) {
  const { width, height } = useWindowDimensions();
  const t = useSharedValue(0);
  const [loaded, setLoaded] = useState(false);
  const cut = Math.round(durationMs * 0.55);
  const mood = MOOD[variant];
  const sway = variant === "dragon" || variant === "demon" || variant === "major" ? 3 : variant === "angel" ? 1.5 : 0.8;

  // the clock starts when the first still is decoded (or after a short grace period)
  useEffect(() => {
    if (!loaded) return;
    const t0 = Date.now();
    t.value = 0;
    t.value = withTiming(durationMs + XFADE, { duration: durationMs + XFADE, easing: Easing.linear });
    onReady(t0);
  }, [loaded, durationMs, onReady, t]);
  useEffect(() => {
    const grace = setTimeout(() => setLoaded(true), 1500);
    return () => clearTimeout(grace);
  }, []);

  // shot 1: slow push-in with a gentle rise; shot 2: pull-back reveal drifting down
  const shotA = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 400, cut, cut + XFADE], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(t.value, [0, cut + XFADE], [height * 0.02, -height * 0.035], Extrapolation.CLAMP) + Math.sin(t.value / 900) * sway },
      { translateX: Math.cos(t.value / 1300) * sway * 0.6 },
      { scale: interpolate(t.value, [0, cut + XFADE], [1.04, 1.22], Extrapolation.CLAMP) },
    ],
  }));
  const shotB = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [cut, cut + XFADE, durationMs + 200], [0, 1, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(t.value, [cut, durationMs + XFADE], [-height * 0.03, height * 0.025], Extrapolation.CLAMP) + Math.sin(t.value / 1100 + 2) * sway },
      { translateX: Math.cos(t.value / 1500 + 1) * sway * 0.6 },
      { scale: interpolate(t.value, [cut, durationMs + XFADE], [1.26, 1.06], Extrapolation.CLAMP) },
    ],
  }));
  // light flash on the cut + a soft bloom pulse on the opening
  const flash = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 250, 900, cut - 60, cut + 120, cut + 700], [0.55, 0.25, 0, 0, 0.5, 0], Extrapolation.CLAMP),
  }));
  // letterbox bars slide in during the first half second
  const barH = Math.round(height * 0.065);
  const barTop = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(t.value, [0, 600], [-barH, 0], Extrapolation.CLAMP) }] }));
  const barBottom = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(t.value, [0, 600], [barH, 0], Extrapolation.CLAMP) }] }));

  const embers = useMemo(() => Array.from({ length: EMBERS }, (_, i) => ({ seed: i * 7.13 + variant.length, x: ((i * 61) % 100) / 100, life: 3800 + ((i * 137) % 2600), size: 2 + ((i * 31) % 4) })), [variant]);

  return (
    <>
      <Animated.Image source={ART[variant][0]} style={[styles.fill, shotA]} resizeMode="cover" onLoad={() => setLoaded(true)} fadeDuration={0} />
      <Animated.Image source={ART[variant][1]} style={[styles.fill, shotB]} resizeMode="cover" fadeDuration={0} />
      {embers.map((e, i) => (
        <Ember key={i} t={t} width={width} height={height} color={mood.ember} {...e} />
      ))}
      <Animated.View style={[styles.fill, { backgroundColor: mood.flash }, flash]} pointerEvents="none" />
      <Animated.View style={[styles.bar, { top: 0, height: barH }, barTop]} pointerEvents="none" />
      <Animated.View style={[styles.bar, { bottom: 0, height: barH }, barBottom]} pointerEvents="none" />
    </>
  );
}

function Ember({ t, width, height, color, seed, x, life, size }: { t: SharedValue<number>; width: number; height: number; color: string; seed: number; x: number; life: number; size: number }) {
  const style = useAnimatedStyle(() => {
    const u = (((t.value + seed * 397) / life) % 1 + 1) % 1; // 0 → 1 over one life
    const rise = height * 0.95 - u * height * 1.05;
    const drift = Math.sin(u * Math.PI * 2 * 1.3 + seed) * width * 0.06;
    const fade = Math.sin(Math.min(1, Math.max(0, u)) * Math.PI);
    return { opacity: fade * 0.85, transform: [{ translateX: x * width + drift }, { translateY: rise }, { scale: 0.7 + fade * 0.6 }] };
  });
  return <Animated.View style={[styles.ember, { width: size, height: size, borderRadius: size / 2, backgroundColor: color, shadowColor: color }, style]} pointerEvents="none" />;
}

const styles = StyleSheet.create({
  fill: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, width: "100%", height: "100%" },
  bar: { position: "absolute", left: 0, right: 0, backgroundColor: "#000000" },
  ember: { position: "absolute", left: 0, top: 0, shadowOpacity: 0.9, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
});
