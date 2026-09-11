/**
 * Key-art cinematic player: epic film stills (bundled JPEGs, generated once at development time) brought to life
 * with slow Ken Burns camera moves, cross-dissolve cuts with a light flash, drifting embers, letterbox bars, optional
 * narrative captions and a subtle handheld sway for the legendary variants. The whole picture is a pure function of
 * the show clock (`t` in ms) → deterministic and skip-safe; `onReady` fires when the first still is decoded so the
 * HUD timers start only when there is a picture on screen.
 */
import React, { useEffect, useMemo, useState } from "react";
import { type ImageSourcePropType, StyleSheet, Text, useWindowDimensions } from "react-native";
import Animated, { Easing, Extrapolation, interpolate, type SharedValue, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { fonts, spacing } from "@/src/theme";

export type ArtVariant = "standard" | "falcon" | "major" | "dragon" | "angel" | "demon" | "conquest" | "pyramid" | "intro";

const ART: Record<ArtVariant, ImageSourcePropType[]> = {
  standard: [require("../../../assets/cinematics/standard_0.jpg"), require("../../../assets/cinematics/standard_1.jpg")],
  falcon: [require("../../../assets/cinematics/falcon_0.jpg"), require("../../../assets/cinematics/falcon_1.jpg")],
  major: [require("../../../assets/cinematics/major_0.jpg"), require("../../../assets/cinematics/major_1.jpg")],
  dragon: [require("../../../assets/cinematics/dragon_0.jpg"), require("../../../assets/cinematics/dragon_1.jpg")],
  angel: [require("../../../assets/cinematics/angel_0.jpg"), require("../../../assets/cinematics/angel_1.jpg")],
  demon: [require("../../../assets/cinematics/demon_0.jpg"), require("../../../assets/cinematics/demon_1.jpg")],
  conquest: [require("../../../assets/cinematics/conquest_0.jpg"), require("../../../assets/cinematics/conquest_1.jpg")],
  pyramid: [require("../../../assets/cinematics/pyramid_0.jpg"), require("../../../assets/cinematics/pyramid_1.jpg")],
  intro: [
    require("../../../assets/cinematics/intro_0.jpg"),
    require("../../../assets/cinematics/intro_1.jpg"),
    require("../../../assets/cinematics/intro_2.jpg"),
    require("../../../assets/cinematics/intro_3.jpg"),
    require("../../../assets/cinematics/intro_4.jpg"),
    require("../../../assets/cinematics/intro_5.jpg"),
  ],
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
  intro: { ember: "#FFD27A", flash: "#FFE9C0" },
};
const CAPTION_COLOR = "#F5EBD6"; // parchment ink on the letterboxed artwork (theme-independent)

const XFADE = 800; // ms cross-dissolve
const EMBERS = 22;

type Props = { variant: ArtVariant; durationMs: number; captions?: string[]; onReady: (startedAt: number) => void };

export function CinematicArt({ variant, durationMs, captions, onReady }: Props) {
  const { width, height } = useWindowDimensions();
  const t = useSharedValue(0);
  const [loaded, setLoaded] = useState(false);
  const shots = ART[variant];
  const mood = MOOD[variant];
  const sway = variant === "dragon" || variant === "demon" || variant === "major" ? 3 : variant === "angel" ? 1.5 : 0.8;
  // shot i is on screen from cuts[i] to cuts[i+1] (+ XFADE overlap)
  const cuts = useMemo(() => shots.map((_, i) => Math.round((durationMs * i) / shots.length)), [shots, durationMs]);

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

  // light flash on every cut + a soft bloom pulse on the opening
  const flash = useAnimatedStyle(() => {
    let o = interpolate(t.value, [0, 250, 900], [0.55, 0.25, 0], Extrapolation.CLAMP);
    for (let i = 1; i < cuts.length; i++) o = Math.max(o, interpolate(t.value, [cuts[i] - 60, cuts[i] + 120, cuts[i] + 700], [0, 0.5, 0], Extrapolation.CLAMP));
    return { opacity: o };
  });
  // letterbox bars slide in during the first half second
  const barH = Math.round(height * 0.065);
  const barTop = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(t.value, [0, 600], [-barH, 0], Extrapolation.CLAMP) }] }));
  const barBottom = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(t.value, [0, 600], [barH, 0], Extrapolation.CLAMP) }] }));

  const embers = useMemo(() => Array.from({ length: EMBERS }, (_, i) => ({ seed: i * 7.13 + variant.length, x: ((i * 61) % 100) / 100, life: 3800 + ((i * 137) % 2600), size: 2 + ((i * 31) % 4) })), [variant]);

  return (
    <>
      {shots.map((src, i) => (
        <Shot key={i} t={t} src={src} start={cuts[i]} end={i + 1 < cuts.length ? cuts[i + 1] : durationMs + XFADE} first={i === 0} last={i === shots.length - 1} pushIn={i % 2 === 0} height={height} sway={sway} onLoad={i === 0 ? () => setLoaded(true) : undefined} />
      ))}
      {embers.map((e, i) => (
        <Ember key={i} t={t} width={width} height={height} color={mood.ember} {...e} />
      ))}
      <Animated.View style={[styles.fill, { backgroundColor: mood.flash }, flash]} pointerEvents="none" />
      {captions?.map((text, i) => (
        <Caption key={i} t={t} text={text} start={cuts[i]} end={i + 1 < cuts.length ? cuts[i + 1] : durationMs} bottom={barH + 120} testID={`cinematic-caption-${i}`} />
      ))}
      <Animated.View style={[styles.bar, { top: 0, height: barH }, barTop]} pointerEvents="none" />
      <Animated.View style={[styles.bar, { bottom: 0, height: barH }, barBottom]} pointerEvents="none" />
    </>
  );
}

function Shot({ t, src, start, end, first, last, pushIn, height, sway, onLoad }: { t: SharedValue<number>; src: ImageSourcePropType; start: number; end: number; first: boolean; last: boolean; pushIn: boolean; height: number; sway: number; onLoad?: () => void }) {
  const style = useAnimatedStyle(() => {
    const fadeIn = first ? [0, 400] : [start, start + XFADE];
    const opacity = last ? interpolate(t.value, [fadeIn[0], fadeIn[1]], [0, 1], Extrapolation.CLAMP) : interpolate(t.value, [fadeIn[0], fadeIn[1], end, end + XFADE], [0, 1, 1, 0], Extrapolation.CLAMP);
    const span: [number, number] = [start, end + XFADE];
    const scale = pushIn ? interpolate(t.value, span, [1.04, 1.22], Extrapolation.CLAMP) : interpolate(t.value, span, [1.26, 1.06], Extrapolation.CLAMP);
    const drift = pushIn ? interpolate(t.value, span, [height * 0.02, -height * 0.035], Extrapolation.CLAMP) : interpolate(t.value, span, [-height * 0.03, height * 0.025], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ translateY: drift + Math.sin(t.value / 900 + start) * sway }, { translateX: Math.cos(t.value / 1300 + start) * sway * 0.6 }, { scale }],
    };
  });
  return <Animated.Image source={src} style={[styles.fill, style]} resizeMode="cover" onLoad={onLoad} fadeDuration={0} />;
}

function Caption({ t, text, start, end, bottom, testID }: { t: SharedValue<number>; text: string; start: number; end: number; bottom: number; testID: string }) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [start + 300, start + 900, end - 500, end], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(t.value, [start + 300, start + 900], [10, 0], Extrapolation.CLAMP) }],
  }));
  return (
    <Animated.View style={[styles.caption, { bottom }, style]} pointerEvents="none" testID={testID}>
      <Text style={styles.captionText}>{text}</Text>
    </Animated.View>
  );
}

function Ember({ t, width, height, color, seed, x, life, size }: { t: SharedValue<number>; width: number; height: number; color: string; seed: number; x: number; life: number; size: number }) {
  const style = useAnimatedStyle(() => {
    const u = ((((t.value + seed * 397) / life) % 1) + 1) % 1; // 0 → 1 over one life
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
  caption: { position: "absolute", left: spacing.lg, right: spacing.lg, alignItems: "center" },
  captionText: { fontFamily: fonts.display, fontSize: 20, lineHeight: 28, textAlign: "center", color: CAPTION_COLOR, textShadowColor: "rgba(0,0,0,0.85)", textShadowRadius: 10, textShadowOffset: { width: 0, height: 2 } },
});
