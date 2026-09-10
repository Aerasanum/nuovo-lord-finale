import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePublicSettlement } from "@/src/api/hooks";
import { Screen } from "@/src/components/overlay";
import { Button, Icon, Loading, Panel, ProgressBar, Row, T } from "@/src/components/ui";
import { formatNumber, useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  content: { padding: spacing.md, gap: spacing.md },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  kv: { flexDirection: "row", justifyContent: "space-between" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { paddingHorizontal: 10, height: 30, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary, justifyContent: "center", borderWidth: 1, borderColor: c.border },
}));

export default function TargetDetail() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { worldId, settlement } = useGame();
  const q = usePublicSettlement(worldId, id);
  const d = q.data;
  const me = settlement.data;
  const dist = d && me ? Math.max(Math.abs(d.x - me.x), Math.abs(d.y - me.y)) : null;
  const factionLabel = (f?: string) => (f === "OWN" ? t("own") : f === "ENEMY" ? t("enemy") : f === "RESERVED_SLOT" ? t("reservedSlot") : t("neutral"));

  return (
    <Screen
      title={d?.name ?? t("target")}
      testID="target-detail-screen"
      left={
        <Pressable style={s.back} onPress={() => router.back()} testID="target-back-button">
          <Icon name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
      }
    >
      {!d ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Panel testID="target-summary">
            <Row style={{ justifyContent: "space-between" }}>
              <Row>
                <Icon name={d.kind === "NEUTRAL" ? "home-group" : "castle"} size={22} color={d.faction === "ENEMY" ? colors.factionEnemy : d.faction === "OWN" ? colors.factionOwn : colors.factionNeutral} />
                <View>
                  <T v="heading">
                    {factionLabel(d.faction)} · L{d.level}
                  </T>
                  <T v="caption">
                    {d.x},{d.y} · {d.region} · {d.terrain} (+{d.terrain_defender_bonus_pct}%){d.port_eligible ? " · ⚓" : ""}
                  </T>
                </View>
              </Row>
              {dist !== null ? (
                <T v="mono" testID="target-distance">
                  {dist} {t("tiles")}
                </T>
              ) : null}
            </Row>
            {d.owner_house_name ? (
              <T v="caption" style={{ marginTop: 6 }}>
                {t("owner")}: {d.owner_house_name}
                {d.owner_shield_active ? ` · ${t("shieldActive")}` : ""}
              </T>
            ) : null}
          </Panel>

          {d.wall ? (
            <Panel testID="target-wall">
              <View style={s.kv}>
                <T v="label">
                  {t("wall")} L{d.wall.level}
                </T>
                <T v="mono">
                  {formatNumber(d.wall.current_hp)} / {formatNumber(d.wall.max_hp)} HP
                </T>
              </View>
              <View style={{ marginTop: 6 }}>
                <ProgressBar value={d.wall.max_hp ? d.wall.current_hp / d.wall.max_hp : 0} color={colors.info} />
              </View>
            </Panel>
          ) : null}

          {d.garrison ? (
            <Panel testID="target-garrison">
              <Row style={{ justifyContent: "space-between", marginBottom: spacing.sm }}>
                <T v="heading">{t("garrison")}</T>
                <T v="mono">{formatNumber(Object.values(d.garrison).reduce((a, c) => a + c, 0))}</T>
              </Row>
              <View style={s.chips}>
                {Object.entries(d.garrison).map(([u, c]) => (
                  <View key={u} style={s.chip}>
                    <T v="caption">
                      {u} <T v="mono" style={{ fontSize: 12 }}>{formatNumber(c)}</T>
                    </T>
                  </View>
                ))}
              </View>
              {d.next_growth_at ? (
                <T v="caption" style={{ marginTop: 6 }}>
                  Growth tick: {new Date(d.next_growth_at).toLocaleString(lang)}
                </T>
              ) : null}
            </Panel>
          ) : null}

          {d.buildings ? (
            <Panel>
              <T v="heading" style={{ marginBottom: spacing.sm }}>
                {t("buildings")}
              </T>
              <View style={s.chips}>
                {Object.entries(d.buildings).map(([b, l]) => (
                  <View key={b} style={s.chip}>
                    <T v="caption">
                      {b} L{l}
                    </T>
                  </View>
                ))}
              </View>
            </Panel>
          ) : null}

          {d.faction !== "OWN" && d.kind !== "PLAYER_SLOT" ? (
            <Button title={t("composeMarch")} icon="sword" onPress={() => router.push({ pathname: "/march/new", params: { target: d.settlement_id } })} testID="target-march-button" />
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}
