/**
 * Skippable attack cinematics (Bible §41.2 — Major Attack 6s / Conquest Success 8s; standard departure 4s).
 *
 *  DEPARTURE  — played when the player launches a march: the real formation marches out under the house crest and
 *               the Alliance banner. Variants: a Dragon/Angel/Demon descends from the sky and advances with the
 *               army (legendary → Major Attack), a Falcon sweeps ahead when Falcons are in the march.
 *  CONQUEST   — played when an ownership change is committed in the player's favour (settlement or Pyramid):
 *               the enemy banner falls, the house crest rises, survivors are listed.
 *
 * Pure presentation: the overlay never blocks server timers; "Salta" is available after one second.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { Easing, FadeIn, FadeInDown, FadeInUp, FadeOut, type SharedValue, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Ellipse, Path } from "react-native-svg";

import type { CrestDto } from "@/src/api/hooks";
import { Crest } from "@/src/components/Crest";
import { Icon, type IconName } from "@/src/components/ui";
import { fmt, formatDuration, formatNumber, useI18n } from "@/src/i18n";
import { fonts, radius, spacing, useTheme } from "@/src/theme";

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
const MAX_SPRITES = 14;

// Scene palette: physical colours of the painted backdrop / creatures — identical in every theme by design.
const SKY_TOP = "#0B1020";
const SKY_MID = "#1C2A44";
const SKY_HORIZON = "#5A3A2E";
const HILL = "#141B14";
const HILL_FAR = "#1F2B22";
const GROUND = "#2A3A22";
const ROAD = "#4A3A28";
const MOON = "#F2E9DC";
const FIRE = "#FF8A2A";
const FIRE_CORE = "#FFD166";
const DRAGON = { dragon: "#2F4F3A", angel: "#F2E9DC", demon: "#4A1414" } as const;
const WING = { dragon: "#233B2C", angel: "#E2D7C2", demon: "#3A0F0F" } as const;
const GLOW = { dragon: FIRE, angel: "#FFE9A8", demon: "#FF3B1F" } as const;

export function cinematicPlan(spec: CinematicSpec) {
  const total = Object.values(spec.units).reduce((a, c) => a + (c || 0), 0);
  const legendary = (Object.keys(spec.units).find((u) => LEGENDARY[u] && spec.units[u] > 0) ? LEGENDARY[Object.keys(spec.units).find((u) => LEGENDARY[u] && spec.units[u] > 0)!] : null) as Legendary | null;
  const falcon = (spec.units.Falco ?? 0) > 0;
  const major = !!legendary || total >= MAJOR_UNITS;
  const durationMs = spec.kind === "CONQUEST" ? 8000 : major ? 6000 : 4000;
  return { total, legendary, falcon, major, durationMs };
}

/** Largest-remainder allocation of MAX_SPRITES marching figures over the ground units (flyers are drawn apart). */
function allocateSprites(units: Record<string, number>): { unit: string; icon: IconName }[] {
  const ground = Object.entries(units).filter(([u, c]) => c > 0 && u !== "Falco" && !LEGENDARY[u]);
  const total = ground.reduce((a, [, c]) => a + c, 0);
  if (!total) return [];
  const raw = ground.map(([u, c]) => ({ u, exact: (c / total) * MAX_SPRITES }));
  const base = raw.map((r) => ({ u: r.u, n: Math.max(1, Math.floor(r.exact)), rem: r.exact - Math.floor(r.exact) }));
  let left = MAX_SPRITES - base.reduce((a, b) => a + b.n, 0);
  for (const b of [...base].sort((a, b) => b.rem - a.rem)) {
    if (left <= 0) break;
    b.n += 1;
    left -= 1;
  }
  const out: { unit: string; icon: IconName }[] = [];
  for (const b of base) for (let i = 0; i < b.n; i++) out.push({ unit: b.u, icon: UNIT_ICON[b.u] ?? "sword" });
  return out.slice(0, MAX_SPRITES);
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
  const { width: W, height: H } = useWindowDimensions();
  const plan = useMemo(() => cinematicPlan(spec), [spec]);
  const [canSkip, setCanSkip] = useState(false);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: plan.durationMs, easing: Easing.linear });
    const skip = setTimeout(() => setCanSkip(true), 1000);
    const end = setTimeout(onDone, plan.durationMs + 250);
    return () => {
      clearTimeout(skip);
      clearTimeout(end);
    };
  }, [plan.durationMs, onDone, progress]);

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
      <Backdrop W={W} H={H} />
      {spec.kind === "DEPARTURE" ? <DepartureScene spec={spec} plan={plan} W={W} H={H} /> : <ConquestScene spec={spec} plan={plan} W={W} H={H} />}

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

// --------------------------------------------------------------------------------------------- backdrop
function Backdrop({ W, H }: { W: number; H: number }) {
  const stars = useMemo(() => Array.from({ length: 28 }, (_, i) => ({ x: ((i * 73) % 97) / 97, y: ((i * 41) % 53) / 53, r: 1 + (i % 3) * 0.6 })), []);
  const horizon = H * 0.6;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={{ position: "absolute", left: 0, right: 0, top: 0, height: horizon, backgroundColor: SKY_TOP }} />
      <View style={{ position: "absolute", left: 0, right: 0, top: horizon * 0.45, height: horizon * 0.55, backgroundColor: SKY_MID, opacity: 0.9 }} />
      <View style={{ position: "absolute", left: 0, right: 0, top: horizon * 0.8, height: horizon * 0.2, backgroundColor: SKY_HORIZON, opacity: 0.55 }} />
      {stars.map((st, i) => (
        <View key={i} style={{ position: "absolute", left: st.x * W, top: st.y * horizon * 0.7, width: st.r * 2, height: st.r * 2, borderRadius: st.r, backgroundColor: MOON, opacity: 0.35 + (i % 4) * 0.15 }} />
      ))}
      <View style={{ position: "absolute", right: W * 0.14, top: horizon * 0.14, width: 46, height: 46, borderRadius: 23, backgroundColor: MOON, opacity: 0.85 }} />
      <View style={{ position: "absolute", right: W * 0.14 - 10, top: horizon * 0.14 - 6, width: 46, height: 46, borderRadius: 23, backgroundColor: SKY_TOP }} />
      <View style={{ position: "absolute", left: -W * 0.2, top: horizon - 70, width: W * 0.9, height: 140, borderRadius: 999, backgroundColor: HILL_FAR }} />
      <View style={{ position: "absolute", right: -W * 0.25, top: horizon - 46, width: W * 0.95, height: 120, borderRadius: 999, backgroundColor: HILL }} />
      <View style={{ position: "absolute", left: 0, right: 0, top: horizon, bottom: 0, backgroundColor: GROUND }} />
      <View style={{ position: "absolute", left: 0, right: 0, top: horizon + 62, height: 54, backgroundColor: ROAD, opacity: 0.85 }} />
    </View>
  );
}

// --------------------------------------------------------------------------------------------- departure
function DepartureScene({ spec, plan, W, H }: { spec: CinematicSpec; plan: ReturnType<typeof cinematicPlan>; W: number; H: number }) {
  const sprites = useMemo(() => allocateSprites(spec.units), [spec.units]);
  const groundY = H * 0.6 + 40;
  const x = useSharedValue(-W * 0.9);
  useEffect(() => {
    x.value = withTiming(W * 0.1, { duration: plan.durationMs * 0.85, easing: Easing.out(Easing.cubic) });
  }, [W, plan.durationMs, x]);
  const formation = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[{ position: "absolute", top: groundY, left: 0, flexDirection: "column", gap: 6 }, formation]} testID="cinematic-formation">
        <View style={{ flexDirection: "row", gap: 10, paddingLeft: 18 }}>
          {sprites.filter((_, i) => i % 2 === 0).map((sp, i) => (
            <Sprite key={`a${i}`} icon={sp.icon} delay={i * 70} size={26} />
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {sprites.filter((_, i) => i % 2 === 1).map((sp, i) => (
            <Sprite key={`b${i}`} icon={sp.icon} delay={i * 70 + 35} size={30} />
          ))}
        </View>
      </Animated.View>
      {plan.legendary ? <Flyer kind={plan.legendary} W={W} H={H} durationMs={plan.durationMs} /> : null}
      {plan.falcon ? <Falcon W={W} H={H} /> : null}
    </View>
  );
}

function Sprite({ icon, delay, size }: { icon: IconName; delay: number; size: number }) {
  const { colors } = useTheme();
  const bob = useSharedValue(0);
  useEffect(() => {
    bob.value = withDelay(delay, withRepeat(withSequence(withTiming(-4, { duration: 210, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 210, easing: Easing.inOut(Easing.quad) })), -1, false));
  }, [bob, delay]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));
  return (
    <Animated.View style={[{ width: size + 8, height: size + 8, alignItems: "center", justifyContent: "center" }, style]}>
      <View style={{ position: "absolute", bottom: -2, width: size * 0.8, height: 6, borderRadius: 3, backgroundColor: "#000", opacity: 0.35 }} />
      <Icon name={icon} size={size} color={size > 28 ? colors.brandPrimary : colors.onSurface} />
    </Animated.View>
  );
}

/** Legendary flyer: descends from the sky and advances above the formation; wings beat, breath glows. */
function Flyer({ kind, W, H, durationMs }: { kind: Legendary; W: number; H: number; durationMs: number }) {
  const x = useSharedValue(-220);
  const y = useSharedValue(H * 0.04);
  const wing = useSharedValue(1);
  const fire = useSharedValue(0);
  const bob = useSharedValue(0);
  useEffect(() => {
    const descend = durationMs * 0.55;
    x.value = withTiming(W * 0.28, { duration: descend, easing: Easing.out(Easing.quad) });
    y.value = withTiming(H * 0.6 - 150, { duration: descend, easing: Easing.inOut(Easing.cubic) });
    wing.value = withRepeat(withSequence(withTiming(0.55, { duration: 260, easing: Easing.inOut(Easing.quad) }), withTiming(1, { duration: 260, easing: Easing.inOut(Easing.quad) })), -1, false);
    bob.value = withDelay(descend, withRepeat(withSequence(withTiming(-8, { duration: 700, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 700, easing: Easing.inOut(Easing.sin) })), -1, false));
    fire.value = withDelay(descend, withRepeat(withSequence(withTiming(0.95, { duration: 90 }), withTiming(0.45, { duration: 140 })), -1, true));
  }, [W, H, durationMs, x, y, wing, fire, bob]);
  const body = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value + bob.value }] }));
  const wings = useAnimatedStyle(() => ({ transform: [{ scaleY: wing.value }] }));
  const breath = useAnimatedStyle(() => ({ opacity: fire.value, transform: [{ scaleX: 0.7 + fire.value * 0.6 }] }));
  const color = DRAGON[kind];
  const wingColor = WING[kind];
  const glow = GLOW[kind];
  return (
    <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: 220, height: 130 }, body]} testID={`cinematic-${kind}`}>
      {/* glow halo */}
      <View style={{ position: "absolute", left: 40, top: 30, width: 150, height: 80, borderRadius: 75, backgroundColor: glow, opacity: kind === "angel" ? 0.22 : 0.12 }} />
      {/* wings: pivot at the shoulders (bottom of the wing box) */}
      <Animated.View style={[{ position: "absolute", left: 30, top: 8, width: 150, height: 62, transformOrigin: "50% 100%" }, wings]}>
        <Svg width={150} height={62} viewBox="0 0 150 62">
          <Path d="M75 60 C62 30, 40 10, 4 2 C34 20, 50 38, 62 60 Z" fill={wingColor} />
          <Path d="M75 60 C90 28, 112 8, 148 0 C118 20, 100 38, 88 60 Z" fill={wingColor} />
        </Svg>
      </Animated.View>
      {/* body, neck, head, tail, legs */}
      <Svg width={220} height={70} viewBox="0 0 220 70" style={{ position: "absolute", left: 0, top: 58 }}>
        <Path d="M6 40 C30 22, 60 20, 96 26 C124 31, 146 28, 168 22 C180 18, 190 14, 200 12 C206 10, 214 12, 218 18 L212 20 L216 26 L206 26 L200 32 C190 36, 178 34, 166 36 C146 40, 124 46, 96 44 C64 42, 40 50, 6 40 Z" fill={color} />
        <Path d="M96 44 L90 60 L100 58 L104 46 Z M128 44 L124 60 L134 58 L138 46 Z" fill={color} />
        <Path d="M6 40 C-2 44, -4 52, 2 58 C4 50, 8 46, 14 44 Z" fill={color} />
        <Ellipse cx={206} cy={18} rx={2.2} ry={2.2} fill={glow} />
      </Svg>
      {/* breath: tapered flame from the jaws */}
      <Animated.View style={[{ position: "absolute", left: 214, top: 60, width: 84, height: 30, transformOrigin: "0% 50%" }, breath]} testID="cinematic-breath">
        <Svg width={84} height={30} viewBox="0 0 84 30">
          <Path d="M0 13 C14 2, 40 -4, 82 8 C60 14, 40 22, 26 20 C16 19, 8 17, 0 17 Z" fill={glow} opacity={0.85} />
          <Path d="M2 14 C14 8, 32 6, 56 10 C34 14, 20 17, 2 16 Z" fill={kind === "angel" ? MOON : FIRE_CORE} opacity={0.95} />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

/** Scout Falcon: two fast sweeps ahead of the army. */
function Falcon({ W, H }: { W: number; H: number }) {
  const x = useSharedValue(-40);
  const y = useSharedValue(0);
  useEffect(() => {
    x.value = withRepeat(withSequence(withTiming(W + 40, { duration: 2000, easing: Easing.inOut(Easing.quad) }), withTiming(-40, { duration: 1 })), -1, false);
    y.value = withRepeat(withSequence(withTiming(-16, { duration: 330, easing: Easing.inOut(Easing.sin) }), withTiming(16, { duration: 330, easing: Easing.inOut(Easing.sin) })), -1, true);
  }, [W, x, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }] }));
  return (
    <Animated.View style={[{ position: "absolute", top: H * 0.6 - 200 }, style]} testID="cinematic-falcon">
      <Icon name="bird" size={30} color={MOON} />
    </Animated.View>
  );
}

// --------------------------------------------------------------------------------------------- conquest
function ConquestScene({ spec, plan, W, H }: { spec: CinematicSpec; plan: ReturnType<typeof cinematicPlan>; W: number; H: number }) {
  const { colors } = useTheme();
  const fall = useSharedValue(0);
  const rise = useSharedValue(0);
  const burst = useSharedValue(0);
  useEffect(() => {
    fall.value = withDelay(900, withTiming(1, { duration: 1500, easing: Easing.in(Easing.quad) }));
    rise.value = withDelay(2300, withSpring(1, { damping: 9, stiffness: 90 }));
    burst.value = withDelay(2300, withTiming(1, { duration: 2200, easing: Easing.out(Easing.cubic) }));
  }, [fall, rise, burst]);
  const enemyFlag = useAnimatedStyle(() => ({ opacity: 1 - fall.value, transform: [{ translateY: fall.value * 90 }, { rotate: `${fall.value * 75}deg` }] }));
  const crest = useAnimatedStyle(() => ({ opacity: rise.value, transform: [{ scale: rise.value }, { translateY: (1 - rise.value) * 40 }] }));
  const sparks = useMemo(() => Array.from({ length: 12 }, (_, i) => ({ a: (i / 12) * Math.PI * 2, r: 70 + (i % 3) * 22 })), []);
  const cx = W / 2;
  const cy = H * 0.6 - 60;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="cinematic-conquest">
      {/* victory glow behind the monument */}
      <View style={{ position: "absolute", left: cx - 120, top: cy - 90, width: 240, height: 240, borderRadius: 120, backgroundColor: colors.brandPrimary, opacity: 0.12 }} />
      <View style={{ position: "absolute", left: cx - 80, top: cy - 50, width: 160, height: 160, borderRadius: 80, backgroundColor: colors.brandPrimary, opacity: 0.12 }} />
      <View style={{ position: "absolute", left: cx - 80, top: cy - 70, width: 160, height: 150, alignItems: "center", justifyContent: "flex-end" }}>
        {spec.pyramid ? (
          <Svg width={160} height={120} viewBox="0 0 160 120">
            <Path d="M80 4 L156 110 L4 110 Z" fill="#C9A46A" />
            <Path d="M80 4 L156 110 L80 110 Z" fill="#8F7248" />
            <Path d="M22 84 L138 84 L134 78 L26 78 Z M38 60 L122 60 L118 54 L42 54 Z M54 36 L106 36 L102 30 L58 30 Z" fill="#E8C56E" opacity={0.9} />
            <Path d="M70 110 L80 82 L90 110 Z" fill="#4C453D" />
          </Svg>
        ) : (
          <Icon name="castle" size={120} color="#8C8074" />
        )}
      </View>
      <Animated.View style={[{ position: "absolute", left: cx + 46, top: cy - 100, alignItems: "flex-start" }, enemyFlag]}>
        <View style={{ width: 3, height: 64, backgroundColor: "#5A4C36" }} />
        <View style={{ position: "absolute", left: 3, top: 0, width: 32, height: 20, backgroundColor: colors.factionEnemy }} />
      </Animated.View>
      {sparks.map((sp, i) => (
        <Spark key={i} cx={cx} cy={cy - 30} angle={sp.a} radius={sp.r} progress={burst} color={i % 2 ? colors.brandPrimary : FIRE_CORE} />
      ))}
      <Animated.View style={[{ position: "absolute", left: cx - 44, top: cy - 128, alignItems: "center" }, crest]} testID="cinematic-conquest-crest">
        {spec.crest ? <Crest crest={spec.crest} size={88} /> : <Icon name="crown" size={80} color={colors.brandPrimary} />}
        {spec.allianceTag ? (
          <View style={{ marginTop: 4, paddingHorizontal: 10, height: 22, borderRadius: radius.pill, backgroundColor: colors.brandPrimary, justifyContent: "center" }}>
            <Text style={{ fontFamily: fonts.body, fontSize: 11, fontWeight: "800", color: colors.onBrand }}>[{spec.allianceTag}]</Text>
          </View>
        ) : null}
      </Animated.View>
      {plan.legendary ? <Flyer kind={plan.legendary} W={W} H={H} durationMs={plan.durationMs} /> : null}
    </View>
  );
}

function Spark({ cx, cy, angle, radius, progress, color }: { cx: number; cy: number; angle: number; radius: number; progress: SharedValue<number>; color: string }) {
  const style = useAnimatedStyle(() => ({ opacity: progress.value === 0 ? 0 : 1 - progress.value, transform: [{ translateX: Math.cos(angle) * radius * progress.value }, { translateY: Math.sin(angle) * radius * progress.value - progress.value * 30 }] }));
  return <Animated.View style={[{ position: "absolute", left: cx - 4, top: cy - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: color }, style]} />;
}

// --------------------------------------------------------------------------------------------- styles
const styles = StyleSheet.create({
  root: { zIndex: 1000, elevation: 1000, backgroundColor: SKY_TOP, overflow: "hidden" },
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
