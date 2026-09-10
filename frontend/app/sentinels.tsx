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
const OUTER = ["NE", "SE", "SW", "NW"];

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
  const taken = new Set((q.data?.sentinels ?? []).map((x) => x.direction));
  const build = (dir: string) =>
    m.buildSentinel
      .mutateAsync(dir)
      .then(() => show(`${t("buildSentinel")} ${dir}`, "success"))
      .catch(showError);

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
          <View style={s.grid}>
            {[...INNER, ...OUTER].map((dir) => (
              <Pressable key={dir} style={[s.dir, taken.has(dir) && { opacity: 0.4 }]} disabled={taken.has(dir) || cmd < 1 || m.buildSentinel.isPending} onPress={() => build(dir)} testID={`sentinel-build-${dir}`}>
                <Icon name="tower-fire" size={18} color={colors.brandPrimary} />
                <T v="body">
                  {dir} {INNER.includes(dir) ? "· r3" : "· r5"}
                </T>
              </Pressable>
            ))}
          </View>
          {cmd < 1 ? (
            <T v="caption" style={{ color: colors.warning }}>
              {lang === "it" ? "Richiede Comando Sentinelle (insediamento L3)." : "Requires Comando Sentinelle (settlement L3)."}
            </T>
          ) : null}
          <T v="heading">{t("state")}</T>
          {(q.data?.sentinels ?? []).length === 0 ? <T v="caption">—</T> : null}
          {(q.data?.sentinels ?? []).map((sen) => (
            <Panel key={sen.sentinel_id} style={s.card} testID={`sentinel-card-${sen.sentinel_id}`}>
              <Row style={{ justifyContent: "space-between" }}>
                <T v="heading">
                  {sen.direction} · {sen.x},{sen.y}
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
