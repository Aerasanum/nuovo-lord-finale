/**
 * Troop picker card used by the mission and march composers: unit identity on the first line, a wide stepper on the
 * second (never squeezes the name on narrow phones), ½ / MAX shortcuts and a fill bar for the share committed.
 */
import React from "react";
import { Pressable, TextInput, View } from "react-native";

import { Icon, T } from "@/src/components/ui";
import { UNIT_ICON } from "@/src/game/units";
import { formatNumber, useI18n } from "@/src/i18n";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  card: { borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, padding: spacing.sm, gap: spacing.sm },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  badge: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: c.brandTertiary, borderWidth: 1, borderColor: c.borderStrong },
  controls: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  step: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.borderStrong },
  input: { flex: 1, minWidth: 56, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surfaceTertiary, color: c.onSurface, textAlign: "center", fontFamily: fonts.body, fontSize: 16, fontWeight: "700" },
  quick: { height: 44, minWidth: 44, paddingHorizontal: 10, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: c.brandTertiary, borderWidth: 1, borderColor: c.borderStrong },
  bar: { height: 4, borderRadius: 2, backgroundColor: c.surfaceTertiary, overflow: "hidden" },
  fill: { height: 4, backgroundColor: c.brandPrimary },
}));

type Props = { unit: string; available: number; value: number; onChange: (n: number) => void; testIDPrefix: string; step?: number; subtitle?: string };

export function UnitStepper({ unit, available, value, onChange, testIDPrefix, step = 10, subtitle }: Props) {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const clamp = (n: number) => Math.max(0, Math.min(available, Math.floor(Number.isFinite(n) ? n : 0)));
  const share = available > 0 ? Math.min(1, value / available) : 0;
  const id = `${testIDPrefix}-${unit}`;
  return (
    <View style={s.card} testID={id}>
      <View style={s.head}>
        <View style={s.badge}>
          <Icon name={UNIT_ICON[unit] ?? "sword"} size={18} color={colors.brandPrimary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T v="label" style={{ color: colors.onSurface }} numberOfLines={1}>
            {unit}
          </T>
          <T v="caption" numberOfLines={1}>
            {t("available")}: {formatNumber(available)}
            {subtitle ? ` · ${subtitle}` : ""}
          </T>
        </View>
        <T v="mono" style={{ color: value > 0 ? colors.brandPrimary : colors.muted }} testID={`${id}-value`}>
          {formatNumber(value)}
        </T>
      </View>
      <View style={s.controls}>
        <Pressable style={s.step} onPress={() => onChange(clamp(value - step))} testID={`${id}-minus`} accessibilityLabel="−">
          <Icon name="minus" size={18} color={colors.onSurface} />
        </Pressable>
        <TextInput style={s.input} keyboardType="number-pad" value={String(value)} onChangeText={(v) => onChange(clamp(parseInt(v.replace(/\D/g, "") || "0", 10)))} selectTextOnFocus testID={`${id}-input`} />
        <Pressable style={s.step} onPress={() => onChange(clamp(value + step))} testID={`${id}-plus`} accessibilityLabel="+">
          <Icon name="plus" size={18} color={colors.onSurface} />
        </Pressable>
        <Pressable style={s.quick} onPress={() => onChange(clamp(Math.floor(available / 2)))} testID={`${id}-half`}>
          <T v="caption" style={{ color: colors.brandPrimary, fontWeight: "700" }}>
            ½
          </T>
        </Pressable>
        <Pressable style={s.quick} onPress={() => onChange(clamp(available))} testID={`${id}-max`}>
          <T v="caption" style={{ color: colors.brandPrimary, fontWeight: "700" }}>
            MAX
          </T>
        </Pressable>
      </View>
      <View style={s.bar}>
        <View style={[s.fill, { width: `${Math.round(share * 100)}%` }]} />
      </View>
    </View>
  );
}
