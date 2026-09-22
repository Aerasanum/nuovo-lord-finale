import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleProp, Text, TextStyle, View, ViewStyle } from "react-native";

import { isUnreachable, secondsUntil } from "@/src/api/client";
import { formatDuration, formatNumber, RESOURCE_LABELS, useI18n } from "@/src/i18n";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export type IconName = React.ComponentProps<typeof MaterialDesignIcons>["name"];

export function Icon({ name, size = 20, color, style }: { name: IconName; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  const { colors } = useTheme();
  return <MaterialDesignIcons name={name} size={size} color={color ?? colors.onSurface} style={style} />;
}

// --------------------------------------------------------------------------------------------- text
const useTextStyles = makeStyles((c) => ({
  display: { fontFamily: fonts.display, color: c.onSurface, fontSize: 28, lineHeight: 34 },
  title: { fontFamily: fonts.display, color: c.onSurface, fontSize: 22, lineHeight: 28 },
  heading: { fontFamily: fonts.display, color: c.onSurface, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: fonts.body, color: c.onSurfaceSecondary, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: fonts.body, color: c.onSurfaceTertiary, fontSize: 12, lineHeight: 16, letterSpacing: 0.4 },
  caption: { fontFamily: fonts.body, color: c.muted, fontSize: 11, lineHeight: 14 },
  mono: { fontFamily: fonts.body, color: c.onSurface, fontSize: 14, lineHeight: 18, fontVariant: ["tabular-nums"] },
}));

type Variant = "display" | "title" | "heading" | "body" | "label" | "caption" | "mono";
export function T({ v = "body", style, children, testID, numberOfLines }: { v?: Variant; style?: StyleProp<TextStyle>; children: React.ReactNode; testID?: string; numberOfLines?: number }) {
  const s = useTextStyles();
  return (
    <Text style={[s[v], style]} testID={testID} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

// --------------------------------------------------------------------------------------------- panel
const usePanelStyles = makeStyles((c) => ({
  panel: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing.md },
  glass: { backgroundColor: c.glass, borderRadius: radius.lg, borderWidth: 1, borderColor: c.borderStrong, padding: spacing.sm },
}));
export function Panel({ children, style, glass, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; glass?: boolean; testID?: string }) {
  const s = usePanelStyles();
  return (
    <View style={[glass ? s.glass : s.panel, style]} testID={testID}>
      {children}
    </View>
  );
}

// --------------------------------------------------------------------------------------------- button
const useBtnStyles = makeStyles((c) => ({
  base: { minHeight: 48, borderRadius: radius.md, paddingHorizontal: spacing.md, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: spacing.sm },
  primary: { backgroundColor: c.brandPrimary },
  primaryText: { color: c.onBrandPrimary, fontFamily: fonts.body, fontSize: 15, fontWeight: "600" },
  secondary: { backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.borderStrong },
  secondaryText: { color: c.onSurface, fontFamily: fonts.body, fontSize: 15, fontWeight: "600" },
  ghost: { backgroundColor: "transparent" },
  ghostText: { color: c.brandPrimary, fontFamily: fonts.body, fontSize: 15, fontWeight: "600" },
  danger: { backgroundColor: c.error },
  dangerText: { color: c.onError, fontFamily: fonts.body, fontSize: 15, fontWeight: "600" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
}));
export function Button({ title, onPress, variant = "primary", disabled, loading, icon, style, testID }: { title: string; onPress?: () => void; variant?: "primary" | "secondary" | "ghost" | "danger"; disabled?: boolean; loading?: boolean; icon?: IconName; style?: StyleProp<ViewStyle>; testID?: string }) {
  const s = useBtnStyles();
  const { colors } = useTheme();
  const textStyle = s[`${variant}Text` as const];
  const iconColor = variant === "primary" ? colors.onBrandPrimary : variant === "danger" ? colors.onError : variant === "ghost" ? colors.brandPrimary : colors.onSurface;
  return (
    <Pressable testID={testID} onPress={onPress} disabled={disabled || loading} style={({ pressed }) => [s.base, s[variant], (disabled || loading) && s.disabled, pressed && s.pressed, style]} accessibilityRole="button">
      {loading ? <ActivityIndicator color={iconColor} /> : icon ? <Icon name={icon} size={18} color={iconColor} /> : null}
      <Text style={textStyle}>{title}</Text>
    </Pressable>
  );
}

// --------------------------------------------------------------------------------------------- chips
const useChipStyles = makeStyles((c) => ({
  row: { height: 56, flexGrow: 0, flexShrink: 0 },
  content: { gap: spacing.sm, paddingHorizontal: spacing.md, alignItems: "center" },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border, justifyContent: "center", flexShrink: 0 },
  chipSelected: { backgroundColor: c.brandTertiary, borderColor: c.brandPrimary },
  text: { fontFamily: fonts.body, fontSize: 13, color: c.onSurfaceTertiary },
  textSelected: { color: c.onBrandTertiary },
}));
export function Chip({ label, selected, onPress, testID }: { label: string; selected?: boolean; onPress?: () => void; testID?: string }) {
  const s = useChipStyles();
  return (
    <Pressable testID={testID} onPress={onPress} style={[s.chip, selected && s.chipSelected]}>
      <Text style={[s.text, selected && s.textSelected]}>{label}</Text>
    </Pressable>
  );
}
export const chipRowStyles = useChipStyles;

// --------------------------------------------------------------------------------------------- state pill
const usePillStyles = makeStyles((c) => ({
  pill: { paddingHorizontal: 8, height: 22, borderRadius: radius.pill, justifyContent: "center", alignSelf: "flex-start" },
  text: { fontFamily: fonts.body, fontSize: 11, fontWeight: "600" },
}));
export function StatePill({ state, testID }: { state: string; testID?: string }) {
  const s = usePillStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    AVAILABLE: { bg: colors.success, fg: colors.onSuccess, label: t("available") },
    IN_PROGRESS: { bg: colors.info, fg: colors.onInfo, label: t("inProgress") },
    LOCKED: { bg: colors.surfaceTertiary, fg: colors.muted, label: t("locked") },
    MAXED: { bg: colors.brandTertiary, fg: colors.onBrandTertiary, label: t("maxed") },
    BLOCKED_RESOURCES: { bg: colors.warning, fg: colors.onWarning, label: t("blockedResources") },
    BLOCKED_QUEUE: { bg: colors.warning, fg: colors.onWarning, label: t("blockedQueue") },
    BLOCKED_SETTLEMENT_LEVEL: { bg: colors.surfaceTertiary, fg: colors.onSurfaceTertiary, label: t("blockedLevel") },
    BLOCKED_REQUIREMENTS: { bg: colors.warning, fg: colors.onWarning, label: t("blockedRequirements") },
    BLOCKED_CAP: { bg: colors.warning, fg: colors.onWarning, label: t("blockedCap") },
    MOTHER_ONLY: { bg: colors.surfaceTertiary, fg: colors.onSurfaceSecondary, label: t("motherOnly") },
    GUARDED: { bg: colors.success, fg: colors.onSuccess, label: "GUARDED" },
    UNGUARDED_GRACE: { bg: colors.warning, fg: colors.onWarning, label: "GRACE" },
    BUILDING: { bg: colors.info, fg: colors.onInfo, label: "BUILDING" },
    OUTBOUND: { bg: colors.info, fg: colors.onInfo, label: t("outbound") },
    RETURNING: { bg: colors.brandTertiary, fg: colors.onBrandTertiary, label: t("returning") },
    HOSTILE: { bg: colors.error, fg: colors.onError, label: t("incomingHostile") },
  };
  const m = map[state] || { bg: colors.surfaceTertiary, fg: colors.onSurfaceTertiary, label: state };
  return (
    <View style={[s.pill, { backgroundColor: m.bg }]} testID={testID}>
      <Text style={[s.text, { color: m.fg }]}>{m.label}</Text>
    </View>
  );
}

// --------------------------------------------------------------------------------------------- countdown
/** Wall clock in milliseconds, refreshed every second so progress bars actually advance while a screen is open. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useCountdown(endsAt?: string | null) {
  const [left, setLeft] = useState(() => secondsUntil(endsAt));
  const [trackedEnd, setTrackedEnd] = useState(endsAt);
  if (endsAt !== trackedEnd) {
    // New deadline: show it immediately instead of one stale second (adjusted during render, not in an effect).
    setTrackedEnd(endsAt);
    setLeft(secondsUntil(endsAt));
  }
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setLeft(secondsUntil(endsAt)), 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  return left;
}
export function Countdown({ endsAt, style, testID }: { endsAt?: string | null; style?: StyleProp<TextStyle>; testID?: string }) {
  const left = useCountdown(endsAt);
  return (
    <T v="mono" style={style} testID={testID} numberOfLines={1}>
      {formatDuration(left)}
    </T>
  );
}

// --------------------------------------------------------------------------------------------- progress
const useProgStyles = makeStyles((c) => ({
  track: { height: 6, borderRadius: radius.sm, backgroundColor: c.surfaceTertiary, overflow: "hidden" },
  fill: { height: 6, borderRadius: radius.sm, backgroundColor: c.brandPrimary },
}));
export function ProgressBar({ value, color }: { value: number; color?: string }) {
  const s = useProgStyles();
  return (
    <View style={s.track}>
      <View style={[s.fill, { width: `${Math.max(0, Math.min(100, value * 100))}%` }, color ? { backgroundColor: color } : null]} />
    </View>
  );
}

// --------------------------------------------------------------------------------------------- resource row
const RES_ICONS: Record<string, IconName> = { grain: "barley", wood: "pine-tree", clay: "cube", iron: "anvil", gold: "gold" };
export function resourceColor(colors: ReturnType<typeof useTheme>["colors"], r: string) {
  return { grain: colors.resourceGrain, wood: colors.resourceWood, clay: colors.resourceClay, iron: colors.resourceIron, gold: colors.resourceGold }[r] ?? colors.onSurface;
}
const useResStyles = makeStyles((c) => ({
  row: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  item: { flexDirection: "row", alignItems: "center", gap: 4, minWidth: 64 },
  short: { color: c.error },
}));
export function CostRow({ cost, missing, testID }: { cost: Partial<Record<string, number>>; missing?: Partial<Record<string, number>>; testID?: string }) {
  const s = useResStyles();
  const { colors } = useTheme();
  const { lang } = useI18n();
  return (
    <View style={s.row} testID={testID}>
      {Object.entries(cost)
        .filter(([, v]) => (v ?? 0) > 0)
        .map(([r, v]) => (
          <View key={r} style={s.item} accessibilityLabel={RESOURCE_LABELS[lang][r]}>
            <Icon name={RES_ICONS[r] || "cube"} size={14} color={resourceColor(colors, r)} />
            <T v="mono" style={[{ fontSize: 12 }, missing && missing[r] ? s.short : null]}>
              {formatNumber(v ?? 0)}
            </T>
          </View>
        ))}
    </View>
  );
}
export { RES_ICONS };

// --------------------------------------------------------------------------------------------- misc
const useMiscStyles = makeStyles((c) => ({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  divider: { height: 1, backgroundColor: c.divider, marginVertical: spacing.sm },
}));
export function Loading({ label }: { label?: string }) {
  const s = useMiscStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={s.center} testID="loading-indicator">
      <ActivityIndicator color={colors.brandPrimary} />
      <T v="caption">{label ?? t("loading")}</T>
    </View>
  );
}
export function Empty({ icon, title, subtitle, testID }: { icon: IconName; title: string; subtitle?: string; testID?: string }) {
  const s = useMiscStyles();
  const { colors } = useTheme();
  return (
    <View style={s.center} testID={testID}>
      <Icon name={icon} size={40} color={colors.muted} />
      <T v="heading">{title}</T>
      {subtitle ? <T v="caption">{subtitle}</T> : null}
    </View>
  );
}
/**
 * Placeholder for a screen whose data is not there yet. A failed fetch used to look exactly like a slow one — the
 * spinner never went away and nothing told the player to try again — so pass the query and a failure turns into a
 * message with a retry button.
 */
export function LoadState({ query, label, testID }: { query: QueryState; label?: string; testID?: string }) {
  const s = useMiscStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  if (!query.isError) return <Loading label={label} />;
  const message = isUnreachable(query.error) ? t("errorNetwork") : (query.error as Error | null)?.message;
  return (
    <View style={s.center} testID={testID ?? "load-error"}>
      <Icon name="cloud-off-outline" size={40} color={colors.muted} />
      <T v="heading">{t("error")}</T>
      {message ? <T v="caption">{message}</T> : null}
      <Button title={t("retry")} icon="refresh" variant="secondary" loading={query.isFetching} onPress={() => query.refetch()} testID="load-error-retry" />
    </View>
  );
}
/** The slice of a React Query result LoadState needs; keeps callers from having to widen their query types. */
export type QueryState = { isError: boolean; error: unknown; isFetching: boolean; refetch: () => unknown };

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const s = useMiscStyles();
  return <View style={[s.row, style]}>{children}</View>;
}
export function Divider() {
  const s = useMiscStyles();
  return <View style={s.divider} />;
}
