import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { FadeInUp, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCaravanSearch, useMarches, useMarchMutations, usePyramid, useSettlementBattles } from "@/src/api/hooks";
import { Crest } from "@/src/components/Crest";
import { BattleHistory, MarchCard } from "@/src/components/MarchCard";
import { useToast } from "@/src/components/overlay";
import { PyramidActions, PyramidAlertBanner, PyramidPhase, PyramidStatePill, pyramidDescription } from "@/src/components/PyramidCard";
import { Button, CostRow, Icon, Panel, Row, StatePill, T } from "@/src/components/ui";
import { caravanAsMarch } from "@/src/game/caravans";
import { formatNumber, useI18n } from "@/src/i18n";
import type { MapEngine, Selection } from "@/src/map3d/engine";
import { MapView3D } from "@/src/map3d/MapView";
import { MiniMapFrame } from "@/src/map3d/MiniMap";
import { useAuth } from "@/src/state/AuthContext";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  hud: { position: "absolute", left: spacing.sm, right: spacing.sm },
  topBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm },
  resBar: { flexDirection: "row", gap: spacing.sm, alignItems: "center", flex: 1, flexWrap: "wrap" },
  iconBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: c.glass, borderWidth: 1, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
  right: { position: "absolute", right: spacing.sm, gap: spacing.sm },
  bottom: { position: "absolute", left: spacing.sm, right: spacing.sm },
  coord: { position: "absolute", left: spacing.sm, backgroundColor: c.glass, paddingHorizontal: 8, height: 24, borderRadius: radius.sm, justifyContent: "center", borderWidth: 1, borderColor: c.border },
  selName: { flex: 1 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  legend: { gap: 4 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  chipRow: { flexDirection: "row", gap: spacing.xs },
  settChip: { paddingHorizontal: 10, height: 30, borderRadius: radius.pill, backgroundColor: c.glass, borderWidth: 1, borderColor: c.border, justifyContent: "center" },
  settChipActive: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
}));

export default function MapScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { selectSettlement } = useAuth();
  const { worldId, settlementId, settlement, settlements, player } = useGame();
  const marches = useMarches(worldId);
  const caravanSearch = useCaravanSearch(worldId, settlementId);
  const pyramid = usePyramid(worldId);
  const marchMut = useMarchMutations(worldId ?? "");
  const { showError } = useToast();
  const engineRef = useRef<MapEngine | null>(null);
  const [sel, setSel] = useState<Selection | null>(null);
  const [legend, setLegend] = useState(false);
  const [labelsOn, setLabelsOn] = useState(true);
  const [cam, setCam] = useState({ tx: 200, tz: 200, dist: 38 });
  const active = settlement.data;
  const home = useMemo(() => (active ? { x: active.x, y: active.y } : null), [active?.x, active?.y]); // eslint-disable-line react-hooks/exhaustive-deps
  const onSelect = useCallback((v: Selection | null) => setSel(v), []);
  const onCam = useCallback((c: { tx: number; tz: number; dist: number }) => setCam(c), []);
  // own marches + detected hostile marches (intel-disclosed by the server) + foreign caravans detected by the active
  // settlement's search radius (Bible §34.9) share one marker layer
  const allMarches = useMemo(
    () => [...(marches.data?.marches ?? []), ...(marches.data?.incoming ?? []), ...(caravanSearch.data?.caravans ?? []).map(caravanAsMarch)],
    [marches.data, caravanSearch.data],
  );
  const selS = sel?.settlement;
  const selM = sel?.march;
  const selP = sel?.pyramid ? (pyramid.data ?? sel.pyramid) : null;
  const history = useSettlementBattles(worldId, selS && selS.kind !== "PLAYER_SLOT" ? selS.settlement_id : null);

  if (!worldId) return null;
  const distance = selS && active ? Math.max(Math.abs(selS.x - active.x), Math.abs(selS.y - active.y)) : null;
  const factionLabel = (f?: string) => (f === "OWN" ? t("own") : f === "ALLY" ? t("ally") : f === "ENEMY" ? t("enemy") : f === "RESERVED_SLOT" ? t("reservedSlot") : t("neutral"));
  const terrainLabel = (tr?: string) => (tr === "forest" ? t("forest") : tr === "mountain" ? t("mountain") : tr === "water" ? t("water") : t("plain"));

  return (
    <View style={s.root} testID="map-screen">
      <MapView3D worldId={worldId} home={home} marches={allMarches} pyramid={pyramid.data ?? null} onSelect={onSelect} onEngine={(e) => (engineRef.current = e)} onCameraChange={onCam} showLabels={labelsOn} />

      {/* top HUD: resources of the active settlement */}
      <View style={[s.hud, { top: insets.top + spacing.xs, pointerEvents: "box-none" }]}>
        <Panel glass style={s.topBar} testID="map-hud-resources">
          <View style={s.resBar}>
            {active ? <CostRow cost={active.resources} /> : <T v="caption">{t("loading")}</T>}
          </View>
          <Pressable style={s.iconBtn} onPress={() => router.push("/marches")} testID="map-marches-button">
            <Icon name="flag-checkered" size={20} color={colors.onSurface} />
            {marches.data?.marches?.length ? <View style={{ position: "absolute", top: 6, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brandPrimary }} /> : null}
          </Pressable>
        </Panel>
        <PyramidAlertBanner dto={pyramid.data} onPress={() => router.push("/pyramid")} style={{ marginTop: spacing.xs }} />
        {settlements.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[s.chipRow, { paddingHorizontal: spacing.xs, paddingTop: spacing.xs }]}>
            {settlements.map((st: any) => (
              <Pressable key={st.settlement_id} style={[s.settChip, st.settlement_id === settlementId && s.settChipActive]} onPress={() => selectSettlement(st.settlement_id)} testID={`map-settlement-chip-${st.settlement_id}`}>
                <T v="caption" style={st.settlement_id === settlementId ? { color: colors.onBrandTertiary } : undefined}>
                  {st.is_mother ? "★ " : ""}
                  {st.name} L{st.level}
                </T>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>

      <View style={[s.coord, { top: insets.top + 64 + (settlements.length > 1 ? 40 : 0), pointerEvents: "none" }]}>
        <T v="caption" testID="map-camera-coords">
          {Math.round(cam.tx)},{Math.round(cam.tz)} · ×{Math.round(cam.dist)}
        </T>
      </View>

      {/* right controls */}
      <View style={[s.right, { top: insets.top + 110 + (settlements.length > 1 ? 40 : 0) }]}>
        <Pressable style={s.iconBtn} onPress={() => active && engineRef.current?.centerOn(active.x, active.y, 30)} testID="map-center-home-button" accessibilityLabel={t("centerOnHome")}>
          <Icon name="home-map-marker" size={22} color={colors.brandPrimary} />
        </Pressable>
        <Pressable style={s.iconBtn} onPress={() => engineRef.current?.centerOn(pyramid.data?.anchor[0] ?? 200, pyramid.data?.anchor[1] ?? 200, 44)} testID="map-center-pyramid-button" accessibilityLabel={t("pyramidCenter")}>
          <Icon name="pyramid" size={22} color={pyramid.data?.state === "OPEN" ? colors.brandPrimary : colors.onSurface} />
        </Pressable>
        <Pressable style={s.iconBtn} onPress={() => engineRef.current?.zoomBy(1.4)} testID="map-zoom-in-button">
          <Icon name="plus" size={22} color={colors.onSurface} />
        </Pressable>
        <Pressable style={s.iconBtn} onPress={() => engineRef.current?.zoomBy(1 / 1.4)} testID="map-zoom-out-button">
          <Icon name="minus" size={22} color={colors.onSurface} />
        </Pressable>
        <Pressable style={s.iconBtn} onPress={() => engineRef.current?.rotateBy(Math.PI / 8)} testID="map-rotate-button">
          <Icon name="rotate-3d-variant" size={22} color={colors.onSurface} />
        </Pressable>
        <Pressable style={s.iconBtn} onPress={() => setLegend((v) => !v)} testID="map-legend-button">
          <Icon name="map-legend" size={22} color={colors.onSurface} />
        </Pressable>
        <Pressable style={s.iconBtn} onPress={() => setLabelsOn((v) => !v)} testID="map-labels-button" accessibilityLabel={t("toggleLabels")}>
          <Icon name={labelsOn ? "tag-text" : "tag-off-outline"} size={22} color={labelsOn ? colors.brandPrimary : colors.onSurface} />
        </Pressable>
      </View>

      {/* legend */}
      {legend ? (
        <Animated.View entering={FadeInUp} exiting={FadeOutDown} style={[s.bottom, { bottom: spacing.md, right: 64 }]}>
          <Panel glass style={s.legend} testID="map-legend">
            {[
              [colors.terrainPlain, t("plain")],
              [colors.terrainForest, t("forest")],
              [colors.terrainMountain, t("mountain")],
              [colors.terrainWater, t("water")],
              [colors.factionOwn, t("own")],
              [colors.factionAlly, t("ally")],
              [colors.factionEnemy, t("enemy")],
              [colors.factionNeutral, t("neutral")],
            ].map(([c, label]) => (
              <View key={label} style={s.legendRow}>
                <View style={[s.swatch, { backgroundColor: c }]} />
                <T v="caption">{label}</T>
              </View>
            ))}
          </Panel>
        </Animated.View>
      ) : null}

      {/* minimap (hidden while a selection card or the legend occupies the bottom) */}
      {!sel && !legend ? <MiniMapFrame engine={engineRef} style={{ right: spacing.sm, bottom: spacing.md + 26 }} /> : null}

      {/* selection card */}
      {sel && selM ? (
        <Animated.View entering={FadeInUp} exiting={FadeOutDown} style={[s.bottom, { bottom: spacing.md }]}>
          <MarchCard march={selM} onClose={() => engineRef.current?.select(null)} onRecall={(id) => marchMut.recall.mutateAsync(id).catch(showError)} />
        </Animated.View>
      ) : sel && selP ? (
        <Animated.View entering={FadeInUp} exiting={FadeOutDown} style={[s.bottom, { bottom: spacing.md }]}>
          <Panel glass testID="map-pyramid-card">
            <Row>
              <Icon name="pyramid" size={24} color={selP.faction === "OWN" ? colors.factionOwn : selP.faction === "ENEMY" ? colors.factionEnemy : colors.brandPrimary} />
              <View style={s.selName}>
                <T v="heading" numberOfLines={1} testID="map-pyramid-name">
                  {selP.name}
                  {selP.owner ? ` · [${selP.owner.tag}]` : ""}
                </T>
                <T v="caption" numberOfLines={2}>
                  {pyramidDescription(t, selP)}
                </T>
              </View>
              <PyramidStatePill dto={selP} testID="map-pyramid-state" />
              <Pressable onPress={() => engineRef.current?.select(null)} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }} testID="map-selection-close">
                <Icon name="close" size={20} color={colors.muted} />
              </Pressable>
            </Row>
            <View style={{ marginTop: spacing.sm }}>
              <PyramidPhase dto={selP} />
            </View>
            <PyramidActions dto={selP} compact onDetails={() => router.push("/pyramid")} onAttack={() => router.push({ pathname: "/march/new", params: { pyramid: "1", mission: "ATTACK" } })} onReinforce={() => router.push({ pathname: "/march/new", params: { pyramid: "1", mission: "REINFORCE" } })} />
          </Panel>
        </Animated.View>
      ) : sel ? (
        <Animated.View entering={FadeInUp} exiting={FadeOutDown} style={[s.bottom, { bottom: spacing.md }]}>
          <Panel glass testID="map-selection-card">
            <Row>
              {selS?.owner_house_crest ? <Crest crest={selS.owner_house_crest} size={28} testID="map-selection-crest" /> : <Icon name={selS ? (selS.faction === "NEUTRAL" ? "home-group" : "castle") : sel.sentinel ? "tower-fire" : "map-marker"} size={22} color={selS?.faction === "OWN" ? colors.factionOwn : selS?.faction === "ALLY" ? colors.factionAlly : selS?.faction === "ENEMY" ? colors.factionEnemy : colors.factionNeutral} />}
              <View style={s.selName}>
                <T v="heading" numberOfLines={1} testID="map-selection-name">
                  {selS ? selS.name : sel.sentinel ? `${t("sentinels")} ${sel.sentinel.direction}` : `${terrainLabel(undefined)} ${sel.x},${sel.y}`}
                </T>
                <T v="caption">
                  {selS ? `${selS.owner_alliance_tag ? `[${selS.owner_alliance_tag}] ` : ""}${factionLabel(selS.faction)} · L${selS.level} · ${terrainLabel(selS.terrain)} (+${selS.terrain_defender_bonus_pct}%) · ${selS.x},${selS.y}` : sel.sentinel ? `${sel.sentinel.state} · ${sel.x},${sel.y}` : `${sel.x},${sel.y}`}
                  {distance !== null ? ` · ${distance} ${t("tiles")}` : ""}
                </T>
              </View>
              {sel.sentinel ? <StatePill state={sel.sentinel.state} /> : null}
              <Pressable onPress={() => engineRef.current?.select(null)} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }} testID="map-selection-close">
                <Icon name="close" size={20} color={colors.muted} />
              </Pressable>
            </Row>
            {selS && selS.kind !== "PLAYER_SLOT" ? (
              <View style={s.actions}>
                {selS.faction === "OWN" ? (
                  <Button title={t("tabCity")} icon="castle" variant="secondary" style={{ flex: 1 }} onPress={() => selectSettlement(selS.settlement_id).then(() => router.push("/(tabs)/settlement"))} testID="map-selection-open-city" />
                ) : (
                  <>
                    <Button title={t("target")} icon="information-outline" variant="secondary" style={{ flex: 1 }} onPress={() => router.push({ pathname: "/target/[id]", params: { id: selS.settlement_id } })} testID="map-selection-detail" />
                    <Button title={selS.faction === "ALLY" ? t("missionReinforce") : t("march")} icon={selS.faction === "ALLY" ? "shield-plus" : "sword"} style={{ flex: 1 }} onPress={() => router.push({ pathname: "/march/new", params: { target: selS.settlement_id } })} testID="map-selection-march" />
                  </>
                )}
              </View>
            ) : sel.sentinel ? (
              <View style={s.actions}>
                <Button title={sel.sentinel.faction === "OWN" ? t("missionGarrison") : t("attack")} icon={sel.sentinel.faction === "OWN" ? "shield-plus" : "sword"} style={{ flex: 1 }} onPress={() => router.push({ pathname: "/march/new", params: { sentinel: sel.sentinel!.sentinel_id } })} testID="map-selection-sentinel-march" />
              </View>
            ) : null}
            {selS?.garrison_total != null ? (
              <T v="caption" style={{ marginTop: 4 }}>
                {t("garrison")}: {formatNumber(selS.garrison_total)} · {t("wall")} L{selS.wall_level}
              </T>
            ) : null}
            {selS && selS.kind !== "PLAYER_SLOT" ? <BattleHistory battles={history.data?.battles ?? []} viewerPlayerId={player?.player_id ?? null} loading={history.isLoading} /> : null}
          </Panel>
        </Animated.View>
      ) : (
        <View style={[s.bottom, { bottom: spacing.md, pointerEvents: "none" }]}>
          <Panel glass style={{ alignItems: "center" }}>
            <T v="caption">{t("tapTile")}</T>
            {player?.shield_active ? (
              <T v="caption" style={{ color: colors.success }}>
                {t("shieldActive")}
              </T>
            ) : null}
          </Panel>
        </View>
      )}
      <View style={{ position: "absolute", bottom: 2, left: 6, pointerEvents: "none" }}>
        <T v="caption" style={{ fontSize: 9 }}>
          {`3D · LOD ${cam.dist < 34 ? "0" : cam.dist < 100 ? "1" : "2"}`}
        </T>
      </View>
    </View>
  );
}
