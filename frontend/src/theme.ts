// Design tokens for Empire Lords Dragon — dark medieval palette (Obsidian Court) from /app/design_guidelines.json.
// The app ships a single dark scheme: both `light` and `dark` resolve to the same token set so native chrome and
// device settings never flip the UI to a light canvas.
//
// Usage:
//   const useStyles = makeStyles((colors) => ({ card: { backgroundColor: colors.surfaceSecondary } }));
//   const { colors } = useTheme();   // for icon colors / non-style props

import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const obsidian = {
  // Surfaces
  surface: "#0A0908",
  onSurface: "#F2E9DC",
  surfaceSecondary: "#171412",
  onSurfaceSecondary: "#E5D9C7",
  surfaceTertiary: "#26221F",
  onSurfaceTertiary: "#C4B8A5",
  surfaceInverse: "#F2E9DC",
  onSurfaceInverse: "#0A0908",
  muted: "#8C8074",
  glass: "rgba(23, 20, 18, 0.82)",

  // Brand (aged gold)
  brand: "#C89B3C",
  onBrand: "#0A0908",
  brandPrimary: "#C89B3C",
  onBrandPrimary: "#0A0908",
  brandSecondary: "#8B6A25",
  onBrandSecondary: "#F2E9DC",
  brandTertiary: "#3A2F1B",
  onBrandTertiary: "#E8C56E",

  // Status
  success: "#3F8F5A",
  onSuccess: "#0A0908",
  warning: "#D28A2C",
  onWarning: "#0A0908",
  error: "#9E2B25",
  onError: "#F2E9DC",
  info: "#3F6E9E",
  onInfo: "#F2E9DC",

  // Lines
  border: "#2E2925",
  borderStrong: "#5A4C36",
  divider: "#1F1B18",

  // Resources
  resourceGrain: "#D9B44A",
  resourceWood: "#8C6239",
  resourceClay: "#B5533C",
  resourceIron: "#8E9AA5",
  resourceGold: "#E8C56E",

  // Terrain (3D map + legend)
  terrainPlain: "#5E7A3B",
  terrainForest: "#2F4A2A",
  terrainMountain: "#7A7168",
  terrainWater: "#1F3D5C",

  // Factions
  factionOwn: "#C89B3C",
  factionAlly: "#3F8F5A",
  factionEnemy: "#9E2B25",
  factionNeutral: "#8C8074",
};

export type ThemeColors = typeof obsidian;

export const defaultScheme = "dark" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark: ThemeColors } = { light: obsidian, dark: obsidian };

export function setColorScheme(scheme: ColorScheme) {
  Appearance.setColorScheme?.(scheme);
}

setColorScheme("dark");

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system === "light" || system === "dark" ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.dark };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

// Typography + spacing tokens (design_guidelines.json)
export const fonts = {
  display: "EBGaramond",
  body: "Manrope",
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 4, md: 8, lg: 12, pill: 999 } as const;
