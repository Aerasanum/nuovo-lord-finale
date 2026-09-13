/**
 * Mission key-art banners (Bible §22): one epic still per TIMED mission, generated once at development time
 * (backend/scripts/gen_cinematics.py, `mission_*`) and bundled. Renders as a widescreen header that bleeds to the
 * card edges with a scrim so the title stays legible.
 */
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { type ImageSourcePropType, StyleSheet, View } from "react-native";

import { T } from "@/src/components/ui";
import { radius, spacing, textShadow } from "@/src/theme";

const ART: Record<string, ImageSourcePropType> = {
  patrol_local: require("../../assets/cinematics/mission_patrol_local_0.jpg"),
  commercial_escort: require("../../assets/cinematics/mission_commercial_escort_0.jpg"),
  predator_hunt: require("../../assets/cinematics/mission_predator_hunt_0.jpg"),
  border_expedition: require("../../assets/cinematics/mission_border_expedition_0.jpg"),
  distant_recon: require("../../assets/cinematics/mission_distant_recon_0.jpg"),
};

export const COUNCIL_ART: ImageSourcePropType = require("../../assets/cinematics/council_0.jpg");

export function hasMissionArt(key: string): boolean {
  return key in ART;
}

/** Header banner for a mission card; `inset` is the card padding it bleeds through (negative margins). */
export function MissionBanner({ missionKey, title, right, height = 132, inset = spacing.md, testID }: { missionKey: string; title: string; right?: React.ReactNode; height?: number; inset?: number; testID?: string }) {
  const src = ART[missionKey];
  if (!src) return null;
  return (
    <View style={[styles.box, { height, marginHorizontal: -inset, marginTop: -inset, marginBottom: spacing.sm }]} testID={testID}>
      <Image source={src} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
      <LinearGradient colors={["rgba(10,9,8,0.05)", "rgba(10,9,8,0.35)", "rgba(10,9,8,0.9)"]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
      <View style={styles.footer}>
        <T v="title" numberOfLines={1} style={styles.title}>
          {title}
        </T>
        {right}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: "hidden", borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  footer: { position: "absolute", left: spacing.md, right: spacing.md, bottom: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  // key-art overlay text: fixed light ink on the dark scrim in every theme
  title: { flex: 1, color: "#F2E9DC", ...textShadow(1, 6, "rgba(0,0,0,0.7)") },
});
