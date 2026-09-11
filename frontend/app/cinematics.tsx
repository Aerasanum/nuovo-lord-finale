import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type CinematicSpec, useCinematic } from "@/src/components/cinematic/Cinematic";
import { Screen } from "@/src/components/overlay";
import { Icon, type IconName, Panel, T } from "@/src/components/ui";
import { useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.md, gap: spacing.sm },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary },
  iconWrap: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: c.brandTertiary },
  badge: { paddingHorizontal: 8, height: 22, borderRadius: radius.pill, justifyContent: "center", backgroundColor: c.glass, borderWidth: 1, borderColor: c.border },
}));

type Entry = { id: string; icon: IconName; title: string; subtitle: string; seconds: number; spec: Omit<CinematicSpec, "crest" | "houseName" | "allianceTag"> };

/** Cinematics gallery: replays every variant (Bible §41.2) with the player's own crest and Alliance banner. */
export default function CinematicsScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { player } = useGame();
  const cinematic = useCinematic();

  const entries: Entry[] = [
    { id: "standard", icon: "shield-sword", title: t("cinDeparture"), subtitle: t("cinGalleryStandard"), seconds: 4, spec: { kind: "DEPARTURE", units: { Fanteria: 1200, Arciere: 600, Cavalleria: 300 }, missionLabel: t("missionAttack"), targetName: "Neutrale 12,180", etaSeconds: 3600 } },
    { id: "falcon", icon: "bird", title: t("cinFalcon"), subtitle: t("cinGalleryFalcon"), seconds: 4, spec: { kind: "DEPARTURE", units: { Cavalleria: 800, Falco: 40, Lupo: 120 }, missionLabel: t("missionRaid"), targetName: "Neutrale 9,181", etaSeconds: 2700 } },
    { id: "major", icon: "sword-cross", title: t("cinMajor"), subtitle: t("cinGalleryMajor"), seconds: 6, spec: { kind: "DEPARTURE", units: { Fanteria: 14000, Arciere: 8000, Cavalleria: 4000, Catapulta: 300, "Elefante da Guerra": 60 }, missionLabel: t("missionAttack"), targetName: "Casa Rivale", etaSeconds: 5400 } },
    { id: "dragon", icon: "fire", title: t("cinDragon"), subtitle: t("cinGalleryLegendary"), seconds: 6, spec: { kind: "DEPARTURE", units: { Fanteria: 3000, Cavalleria: 1500, Drago: 1 }, missionLabel: t("missionConquest"), targetName: "Casa Rivale", etaSeconds: 7200 } },
    { id: "angel", icon: "star-four-points", title: t("cinAngel"), subtitle: t("cinGalleryLegendary"), seconds: 6, spec: { kind: "DEPARTURE", units: { Fanteria: 3000, Arciere: 2000, Angelo: 1 }, missionLabel: t("missionAttack"), targetName: "Terza Via", etaSeconds: 7200 } },
    { id: "demon", icon: "emoticon-devil", title: t("cinDemon"), subtitle: t("cinGalleryLegendary"), seconds: 6, spec: { kind: "DEPARTURE", units: { Cavalleria: 2500, Orso: 200, Demone: 1 }, missionLabel: t("missionAttack"), targetName: "Terza Via", etaSeconds: 7200 } },
    { id: "conquest", icon: "crown", title: t("cinConquest"), subtitle: t("cinGalleryConquest"), seconds: 8, spec: { kind: "CONQUEST", units: { Fanteria: 860, Cavalleria: 240, "Carro di Conquista": 1 }, missionLabel: t("missionConquest"), targetName: "Neutrale 12,180", newLevel: 7 } },
    { id: "pyramid", icon: "triangle", title: t("cinConquestPyramid"), subtitle: t("cinGalleryPyramid"), seconds: 8, spec: { kind: "CONQUEST", units: { Fanteria: 9000, Arciere: 4000, Cavalleria: 2000, Drago: 1 }, missionLabel: t("missionAttack"), targetName: t("pyramid"), pyramid: true } },
  ];

  const play = (e: Entry) => cinematic.play({ ...e.spec, crest: player?.house?.crest ?? null, houseName: player?.house_name ?? null, allianceTag: player?.alliance?.tag ?? null });

  return (
    <Screen
      title={t("cinGalleryTitle")}
      testID="cinematics-screen"
      left={
        <Pressable style={s.back} onPress={() => router.back()} testID="cinematics-back-button">
          <Icon name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
      }
    >
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Panel glass>
          <T v="caption">{t("cinGalleryHint")}</T>
        </Panel>
        {entries.map((e) => (
          <Pressable key={e.id} style={[s.card, !player && { opacity: 0.5 }]} disabled={!player} onPress={() => play(e)} testID={`cinematic-play-${e.id}`} accessibilityRole="button">
            <View style={s.iconWrap}>
              <Icon name={e.icon} size={22} color={colors.brandPrimary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="label">{e.title}</T>
              <T v="caption" numberOfLines={2}>
                {e.subtitle}
              </T>
            </View>
            <View style={s.badge}>
              <T v="mono">{e.seconds}s</T>
            </View>
            <Icon name="play-circle" size={26} color={colors.brandPrimary} />
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}
