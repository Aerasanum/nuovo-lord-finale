import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useArmy, useMarchMutations, usePublicSettlement, usePyramid } from "@/src/api/hooks";
import { useCinematic } from "@/src/components/cinematic/Cinematic";
import { Screen, useToast } from "@/src/components/overlay";
import { Button, Chip, chipRowStyles, Icon, Loading, Panel, Row, T } from "@/src/components/ui";
import { formatDuration, formatNumber, useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  content: { padding: spacing.md, gap: spacing.md },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  unitRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6 },
  input: { width: 84, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surfaceTertiary, color: c.onSurface, paddingHorizontal: spacing.sm, fontFamily: fonts.body, fontSize: 15, textAlign: "right" },
  small: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },
  kv: { flexDirection: "row", justifyContent: "space-between" },
}));

const MISSIONS = ["ATTACK", "RAID", "CONQUEST", "REINFORCE"] as const;

export default function MarchComposer() {
  const s = useStyles();
  const cs = chipRowStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ target?: string; sentinel?: string; pyramid?: string; mission?: string }>();
  const { target, sentinel } = params;
  const isPyramid = params.pyramid === "1";
  const { worldId, settlementId, settlement, player } = useGame();
  const cinematic = useCinematic();
  const army = useArmy(worldId, settlementId);
  const pub = usePublicSettlement(worldId, target);
  const pyr = usePyramid(isPyramid ? worldId : null);
  const mm = useMarchMutations(worldId ?? "");
  const { showError, show } = useToast();
  const [mission, setMission] = useState<string>(sentinel ? "GARRISON_SENTINEL" : isPyramid ? (params.mission === "REINFORCE" ? "REINFORCE" : "ATTACK") : "ATTACK");
  const [units, setUnits] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<any>(null);
  const friendly = pub.data?.faction === "OWN" || pub.data?.faction === "ALLY";
  useEffect(() => {
    if (friendly && mission !== "REINFORCE") setMission("REINFORCE");
  }, [friendly, mission]);

  const available = army.data?.army ?? {};
  const totalUnits = Object.values(units).reduce((a, c) => a + c, 0);
  const cap = settlement.data?.march_capacity ?? 0;
  const body = useMemo(() => ({ origin_settlement_id: settlementId, target_settlement_id: target ?? null, target_sentinel_id: sentinel ?? null, target_pyramid: isPyramid, mission, units }), [settlementId, target, sentinel, isPyramid, mission, units]);

  useEffect(() => {
    if (!settlementId || (!target && !sentinel && !isPyramid)) return;
    const h = setTimeout(() => {
      mm.preview
        .mutateAsync(body)
        .then(setPreview)
        .catch((e) => setPreview({ error: e }));
    }, 300);
    return () => clearTimeout(h);
  }, [body, settlementId, target, sentinel, isPyramid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!worldId || !settlementId) return null;
  const setUnit = (u: string, v: number) => setUnits((prev) => ({ ...prev, [u]: Math.max(0, Math.min(available[u] ?? 0, v)) }));
  const launch = async () => {
    try {
      const r = await mm.launch.mutateAsync(body);
      show(`${t("march")} → ${r.march.target_name} · ${formatDuration(r.march.eta_seconds)}`, "success");
      // departure cinematic (Bible §41.2): real composition, house crest, Alliance banner; skippable
      cinematic.play({ kind: "DEPARTURE", units: r.march.units, missionLabel: missionLabel(r.march.mission), targetName: r.march.target_name, etaSeconds: r.march.eta_seconds, crest: player?.house?.crest ?? null, houseName: player?.house_name ?? null, allianceTag: player?.alliance?.tag ?? null });
      router.replace("/marches");
    } catch (e) {
      showError(e);
    }
  };
  const missionLabel = (m: string) => ({ ATTACK: t("missionAttack"), RAID: t("missionRaid"), CONQUEST: t("missionConquest"), REINFORCE: t("missionReinforce"), GARRISON_SENTINEL: t("missionGarrison") })[m] ?? m;
  const targetName = isPyramid ? (pyr.data?.name ?? t("pyramid")) : (pub.data?.name ?? (sentinel ? `${t("sentinels")}` : "…"));
  // Pyramid (Bible §21): ATTACK while another Alliance/the Guardian holds it, REINFORCE only while ours holds it
  const pyramidMissions = pyr.data ? ([pyr.data.me.can_reinforce ? "REINFORCE" : null, pyr.data.me.can_attack ? "ATTACK" : null].filter(Boolean) as string[]) : [];
  const canLaunch = totalUnits > 0 && !!preview && !preview.error && !mm.launch.isPending && totalUnits <= cap;

  return (
    <Screen
      title={t("composeMarch")}
      testID="march-composer-screen"
      left={
        <Pressable style={s.back} onPress={() => router.back()} testID="march-back-button">
          <Icon name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
      }
    >
      <KeyboardAwareScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.xl }]} bottomOffset={24}>
        <Panel testID="march-target">
          <Row style={{ justifyContent: "space-between" }}>
            <Row>
              <Icon name={isPyramid ? "pyramid" : "target"} size={20} color={colors.brandPrimary} />
              <View>
                <T v="heading" testID="march-target-name">
                  {targetName}
                </T>
                <T v="caption">
                  {pub.data ? `${pub.data.faction} · L${pub.data.level} · ${pub.data.terrain} (+${pub.data.terrain_defender_bonus_pct}%)` : ""}
                  {pub.data?.garrison_total != null ? ` · ${t("garrison")} ${formatNumber(pub.data.garrison_total)}` : ""}
                  {pyr.data ? `${pyr.data.owner ? `[${pyr.data.owner.tag}]` : t("pyramidGuardian")} · ${t("pyramidGarrison")} ${formatNumber(pyr.data.garrison_total)}` : ""}
                </T>
              </View>
            </Row>
            <T v="caption">
              {settlement.data?.name} → {pub.data ? `${pub.data.x},${pub.data.y}` : pyr.data ? `${pyr.data.anchor[0]},${pyr.data.anchor[1]}` : ""}
            </T>
          </Row>
        </Panel>

        {!sentinel ? (
          <View style={cs.row}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[cs.content, { paddingHorizontal: 0 }]}>
              {(isPyramid ? pyramidMissions : MISSIONS.filter((m) => (friendly ? m === "REINFORCE" : m !== "REINFORCE"))).map((m) => (
                <Chip key={m} label={missionLabel(m)} selected={mission === m} onPress={() => setMission(m)} testID={`march-mission-${m}`} />
              ))}
            </ScrollView>
          </View>
        ) : (
          <T v="label">{missionLabel(mission)}</T>
        )}

        <Panel testID="march-units">
          <Row style={{ justifyContent: "space-between", marginBottom: spacing.xs }}>
            <T v="heading">{t("selectUnits")}</T>
            <T v="caption" style={totalUnits > cap ? { color: colors.error } : undefined}>
              {formatNumber(totalUnits)} / {formatNumber(cap)}
            </T>
          </Row>
          {army.isLoading ? <Loading /> : null}
          {Object.keys(available).length === 0 && !army.isLoading ? <T v="caption">—</T> : null}
          {Object.entries(available).map(([u, have]) => (
            <View key={u} style={s.unitRow} testID={`march-unit-${u}`}>
              <View style={{ flex: 1 }}>
                <T v="body" style={{ color: colors.onSurface }}>
                  {u}
                </T>
                <T v="caption">
                  {t("available")}: {formatNumber(have)}
                </T>
              </View>
              <Pressable style={s.small} onPress={() => setUnit(u, (units[u] ?? 0) - 10)} testID={`march-unit-${u}-minus`}>
                <Icon name="minus" size={18} />
              </Pressable>
              <TextInput style={s.input} keyboardType="number-pad" value={String(units[u] ?? 0)} onChangeText={(v) => setUnit(u, parseInt(v.replace(/[^0-9]/g, "") || "0", 10))} testID={`march-unit-${u}-input`} />
              <Pressable style={s.small} onPress={() => setUnit(u, (units[u] ?? 0) + 10)} testID={`march-unit-${u}-plus`}>
                <Icon name="plus" size={18} />
              </Pressable>
              <Pressable style={s.small} onPress={() => setUnit(u, have)} testID={`march-unit-${u}-max`}>
                <T v="caption">MAX</T>
              </Pressable>
            </View>
          ))}
        </Panel>

        <Panel testID="march-preview">
          <T v="heading" style={{ marginBottom: spacing.xs }}>
            {t("preview")}
          </T>
          {preview?.error ? (
            <T v="caption" style={{ color: colors.error }} testID="march-preview-error">
              {preview.error.code}: {preview.error.message}
            </T>
          ) : preview ? (
            <View style={{ gap: 4 }}>
              <View style={s.kv}>
                <T v="label">{t("path")}</T>
                <T v="mono">
                  {preview.path?.length ?? 0} {t("tiles")} · cost {preview.path_cost}
                </T>
              </View>
              <View style={s.kv}>
                <T v="label">{t("speed")}</T>
                <T v="mono">
                  {preview.speed_tph} {t("speedTph")}
                </T>
              </View>
              <View style={s.kv}>
                <T v="label">{t("eta")}</T>
                <T v="mono" testID="march-preview-eta">
                  {preview.eta_seconds ? formatDuration(preview.eta_seconds) : "—"}
                </T>
              </View>
              <View style={s.kv}>
                <T v="label">{t("marchCapacity")}</T>
                <T v="mono">
                  {preview.weighted_units} / {preview.march_capacity}
                </T>
              </View>
              <View style={s.kv}>
                <T v="label">{t("terrain")}</T>
                <T v="mono">+{preview.terrain_defender_bonus_pct}% DEF</T>
              </View>
            </View>
          ) : (
            <T v="caption">{t("loading")}</T>
          )}
        </Panel>
        <Button title={t("launch")} icon="flag" disabled={!canLaunch} loading={mm.launch.isPending} onPress={launch} testID="march-launch-button" />
      </KeyboardAwareScrollView>
    </Screen>
  );
}
