import { useRouter } from "expo-router";
import React from "react";
import { Pressable, View } from "react-native";

import type { AllianceKind, AllianceRole } from "@/src/api/hooks";
import { Icon, T } from "@/src/components/ui";
import { kindLabel, roleLabel } from "@/src/game/alliances";
import { useI18n } from "@/src/i18n";
import { makeStyles, radius, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, height: 22, borderRadius: radius.pill },
  tag: { paddingHorizontal: 6, height: 22, borderRadius: radius.sm, justifyContent: "center", backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.borderStrong },
  input: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surfaceTertiary, color: c.onSurface, paddingHorizontal: 12, fontSize: 15 },
}));

export function BackButton({ testID }: { testID: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <Pressable style={s.back} onPress={() => router.back()} testID={testID}>
      <Icon name="arrow-left" size={22} color={colors.onSurface} />
    </Pressable>
  );
}

/** [TAG] chip — monospace-ish, faction-neutral. */
export function TagChip({ tag, testID }: { tag: string | null | undefined; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  if (!tag) return null;
  return (
    <View style={s.tag} testID={testID}>
      <T v="caption" style={{ color: colors.onSurface, fontWeight: "700" }}>
        [{tag}]
      </T>
    </View>
  );
}

/** Structured (gold shield) vs Mercenary (red sword) — the two kinds are never mixed (user rule). */
export function KindBadge({ kind, testID }: { kind: AllianceKind | null | undefined; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const merc = kind === "MERCENARY";
  return (
    <View style={[s.badge, { backgroundColor: merc ? colors.factionEnemy : colors.brandPrimary }]} testID={testID}>
      <Icon name={merc ? "sword" : "shield-crown"} size={12} color={merc ? colors.onError : colors.onBrandPrimary} />
      <T v="caption" style={{ color: merc ? colors.onError : colors.onBrandPrimary, fontWeight: "700" }}>
        {kindLabel(t, kind)}
      </T>
    </View>
  );
}

export function RoleBadge({ role, testID }: { role: AllianceRole | "SYSTEM" | null | undefined; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  if (!role) return null;
  const bg = role === "LEADER" ? colors.brandPrimary : role === "VICE" ? colors.brandSecondary : role === "DIPLOMAT" ? colors.info : colors.surfaceTertiary;
  const fg = role === "LEADER" ? colors.onBrandPrimary : role === "VICE" ? colors.onBrandSecondary : role === "DIPLOMAT" ? colors.onInfo : colors.onSurfaceTertiary;
  return (
    <View style={[s.badge, { backgroundColor: bg }]} testID={testID}>
      <T v="caption" style={{ color: fg, fontWeight: "700" }}>
        {roleLabel(t, role)}
      </T>
    </View>
  );
}

export const useAllianceStyles = useStyles;
