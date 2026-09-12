import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSentinels, useSettlementMutations } from "@/src/api/hooks";
import { Screen, useToast } from "@/src/components/overlay";
import { Button, Countdown, Icon, Loading, Panel, Row, StatePill, T } from "@/src/components/ui";
import { formatNumber, useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  content: { padding: spacing.md, gap: spacing.md },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  dir: { width: "48%", flexGrow: 1, height: 48, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  card: { gap: 6 },
}));

const INNER = ["N", "E", "S", "W"];
const OUTER = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export default function SentinelsScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { worldId, settlementId, settlement } = useGame();
  const q = useSentinels(worldId, settlementId);
  const m = useSettlementMutations(worldId ?? "", settlementId ?? "");
  const { showError, show } = useToast();
  if (!worldId || !settlementId) return null;
  const cmd = settlement.data?.buildings?.["Comando Sentinelle"] ?? 0;
  const it = lang === "it";
  const taken = new Set((q.data?.sentinels ?? []).map((x) => `${x.ring}:${x.direction}`));
  const natural = new Map((q.data?.natural ?? []).map((n) => [`${n.ring}:${n.direction}`, n]));
  const outerUnlocked = !!q.data?.outer_unlocked;
  const build = (direction: string, ring: "INNER" | "OUTER") =>
    m.buildSentinel
      .mutateAsync({ direction, ring })
      .then(() => show(`${t("buildSentinel")} ${direction}`, "success"))
      .catch(showError);
  const slotGrid = (dirs: string[], ring: "INNER" | "OUTER", locked: boolean) => (
    <View style={s.grid}>
      {dirs.map((dir) => {
        const key = `${ring}:${dir}`;
        const nat = natural.get(key);
        const disabled = locked || taken.has(key) || !!nat || cmd < 1 || m.buildSentinel.isPending;
        return (
          <Pressable key={key} style={[s.dir, (taken.has(key) || locked) && { opacity: 0.4 }, nat && { borderColor: colors.info, backgroundColor: colors.glass }]} disabled={disabled} onPress={() => build(dir, ring)} testID={ring === "INNER" ? `sentinel-build-${dir}` : `sentinel-build-outer-${dir}`}>
            <Icon name={nat ? "waves" : "tower-fire"} size={18} color={nat ? colors.info : colors.brandPrimary} />
            <T v="body">
              {dir} · {ring === "INNER" ? "r3" : "r5"}
              {nat ? (it ? " · confine naturale" : " · natural boundary") : taken.has(key) ? " ✓" : ""}
            </T>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <Screen
      title={t("sentinels")}
      testID="sentinels-screen"
      left={
        <Pressable style={s.back} onPress={() => router.back()} testID="sentinels-back-button">
          <Icon name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
      }
    >
      {q.isLoading ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Panel>
            <T v="body">
              Comando Sentinelle L{cmd} · {t("garrison")} cap {formatNumber(q.data?.garrison_cap ?? 0)} · 210/330/300/180/24 · 18 min
            </T>
            <T v="caption">{lang === "it" ? "Nessun HP, nessuna mura. Senza presidio: grazia 24h poi rimozione." : "No HP, no walls. Unguarded: 24h grace, then removal."}</T>
          </Panel>
          <T v="heading">{t("buildSentinel")}</T>
          <T v="caption">{it ? "Anello interno · 4 Sentinelle a raggio 3: ognuna possiede uno spicchio del quadrato 7×7 intorno al castello." : "Inner ring · 4 Sentinels at radius 3: each owns a wedge of the 7×7 square around the castle."}</T>
          {slotGrid(INNER, "INNER", false)}
          <T v="caption">{it ? `Anello esterno · 8 Sentinelle a raggio 5 (fascia 4–5, fino a 11×11)${outerUnlocked ? "" : " — richiede la ricerca Perimetro Avanzato"}.` : `Outer ring · 8 Sentinels at radius 5 (band 4–5, up to 11×11)${outerUnlocked ? "" : " — requires the Perimetro Avanzato research"}.`}</T>
          {slotGrid(OUTER, "OUTER", !outerUnlocked)}
          {natural.size > 0 ? (
            <Panel testID="sentinels-natural-panel">
              <Row style={{ gap: 6 }}>
                <Icon name="waves" size={18} color={colors.info} />
                <T v="body">{it ? "Confine naturale" : "Natural boundary"}</T>
              </Row>
              <T v="caption">
                {it
                  ? "Dove la torre cadrebbe in acqua (o fuori mappa) la Sentinella non serve: quel settore è tuo senza costruire nulla, non ha presidio e non scade. La montagna non è un confine naturale."
                  : "Where the tower would stand on water (or off the map) no Sentinel is needed: that sector is yours with nothing to build, no garrison and no expiry. Mountains are never a natural boundary."}
              </T>
              <T v="caption">
                {[...natural.values()].map((n) => `${n.direction} (${n.ring === "INNER" ? "r3" : "r5"})${n.eligible ? "" : it ? " · non ancora attivo" : " · not yet active"}`).join(" · ")}
              </T>
            </Panel>
          ) : null}
          {cmd < 1 ? (
            <T v="caption" style={{ color: colors.warning }}>
              {it ? "Richiede Comando Sentinelle (insediamento L3)." : "Requires Comando Sentinelle (settlement L3)."}
            </T>
          ) : null}
          <T v="heading">{t("state")}</T>
          {(q.data?.sentinels ?? []).length === 0 ? <T v="caption">—</T> : null}
          {(q.data?.sentinels ?? []).map((sen) => (
            <Panel key={sen.sentinel_id} style={s.card} testID={`sentinel-card-${sen.sentinel_id}`}>
              <Row style={{ justifyContent: "space-between" }}>
                <T v="heading">
                  {sen.direction} · {sen.ring === "OUTER" ? "r5" : "r3"} · {sen.x},{sen.y}
                </T>
                <StatePill state={sen.state} testID={`sentinel-${sen.sentinel_id}-state`} />
              </Row>
              <T v="caption">
                {t("garrison")}: {Object.entries(sen.garrison).map(([u, c]) => `${u} ${c}`).join(", ") || "—"} / {formatNumber(sen.garrison_cap ?? 0)}
              </T>
              {sen.grace_deadline ? (
                <Row style={{ justifyContent: "space-between" }}>
                  <T v="caption">{t("graceDeadline")}</T>
                  <Countdown endsAt={sen.grace_deadline} testID={`sentinel-${sen.sentinel_id}-grace`} />
                </Row>
              ) : null}
              {sen.state !== "BUILDING" ? <Button title={t("missionGarrison")} variant="secondary" icon="shield-plus" onPress={() => router.push({ pathname: "/march/new", params: { sentinel: sen.sentinel_id } })} testID={`sentinel-${sen.sentinel_id}-garrison`} /> : null}
            </Panel>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}
