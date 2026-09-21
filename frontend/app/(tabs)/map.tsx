import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeInUp, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { serverNow } from "@/src/api/client";
import { useCaravanSearch, useDaily, useMarches, useMarchMutations, usePyramid, usePyramids, useSettlementBattles } from "@/src/api/hooks";
import { Crest } from "@/src/components/Crest";
import { BattleHistory, MarchCard } from "@/src/components/MarchCard";
import { useToast } from "@/src/components/overlay";
import { PyramidActions, PyramidAlertBanner, PyramidPhase, PyramidStatePill, pyramidDescription, pyramidName } from "@/src/components/PyramidCard";
import { SettlementSwitcher } from "@/src/components/SettlementSwitcher";
import { Button, CostRow, Icon, type IconName, Loading, Panel, Row, StatePill, T } from "@/src/components/ui";
import { caravanAsMarch } from "@/src/game/caravans";
import { formatNumber, type StringKey, useI18n } from "@/src/i18n";
import { realmHour, timeOfDay, type TimeOfDay } from "@/src/map3d/daylight";
import type { MapEngine, Selection } from "@/src/map3d/engine";
import { allowedZones, fogZonesFor, formatCountdown, regionAt, regionByCode, regionFlag, secondsLeft, zoneAt, zonesBounds } from "@/src/game/grandeMondo";
import { MapView3D } from "@/src/map3d/MapView";
import { MiniMapFrame } from "@/src/map3d/MiniMap";
import { useAuth } from "@/src/state/AuthContext";
import { useTourTarget } from "@/src/state/tour";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const TOD_ICON: Record<TimeOfDay, IconName> = { dawn: "weather-sunset-up", day: "weather-sunny", dusk: "weather-sunset-down", night: "weather-night" };

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  hud: { position: "absolute", left: spacing.sm, right: spacing.sm },
  clock: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  topBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm },
  resBar: { flexDirection: "row", gap: spacing.sm, alignItems: "center", flex: 1, flexWrap: "wrap" },
  iconBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: c.glass, borderWidth: 1, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.factionEnemy, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeText: { color: c.onBrandSecondary, fontSize: 10, fontWeight: "700" },
  right: { position: "absolute", right: spacing.sm, gap: spacing.sm },
  bottom: { position: "absolute", left: spacing.sm, right: spacing.sm },
  coord: { position: "absolute", left: spacing.sm, backgroundColor: c.glass, paddingHorizontal: 8, height: 24, borderRadius: radius.sm, justifyContent: "center", borderWidth: 1, borderColor: c.border },
  selName: { flex: 1 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, flexWrap: "wrap" },
  legend: { gap: 4 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  gmChip: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: spacing.xs, paddingHorizontal: 10, height: 30, borderRadius: radius.pill, backgroundColor: c.glass, borderWidth: 1, borderColor: c.borderStrong },
  gmChipWar: { borderColor: c.factionEnemy },
}));

export default function MapScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { ref: pyramidButtonRef, onLayout: measurePyramidButton } = useTourTarget<View>("map-pyramid-button"); // spotlight of the first-login tour
  const router = useRouter();
  const { selectSettlement } = useAuth();
  const { worldId, settlementId, settlement, settlements, player, world } = useGame();
  const marches = useMarches(worldId);
  const caravanSearch = useCaravanSearch(worldId, settlementId);
  const pyramid = usePyramid(worldId); // the viewer's own Pyramid (alert banner, centre button)
  const pyramidsQ = usePyramids(worldId);
  const daily = useDaily(worldId);
  const marchMut = useMarchMutations(worldId ?? "");
  const { showError } = useToast();
  const engineRef = useRef<MapEngine | null>(null);
  const focus = useLocalSearchParams<{ fx?: string; fy?: string; ft?: string }>();
  const focusedRef = useRef<string | null>(null);
  const [sel, setSel] = useState<Selection | null>(null);
  const [legend, setLegend] = useState(false);
  // realm clock (Italian time, shared by every player) — drives the map daylight, refreshed twice a minute
  const [realmNow, setRealmNow] = useState(() => serverNow());
  useEffect(() => {
    const iv = setInterval(() => setRealmNow(serverNow()), 30000);
    return () => clearInterval(iv);
  }, []);
  const hour = realmHour(realmNow);
  const tod = timeOfDay(hour);
  const clockLabel = `${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.floor((hour % 1) * 60)).padStart(2, "0")}`;
  const [labelsOn, setLabelsOn] = useState(true);
  const [cam, setCam] = useState({ tx: 200, tz: 200, dist: 38 });
  const active = settlement.data;
  const home = useMemo(() => (active ? { x: active.x, y: active.y } : null), [active?.x, active?.y]); // eslint-disable-line react-hooks/exhaustive-deps
  // Grande Mondo: while the fog wall is up the map is confined to the active settlement's region (Bibbia GM)
  const gm = world?.grande_mondo ?? null;
  const myRegion = useMemo(() => (active ? regionAt(gm, active.x, active.y) : null) ?? regionByCode(gm, gm?.my_region), [gm, active?.x, active?.y]); // eslint-disable-line react-hooks/exhaustive-deps
  // reachable zones from the active settlement (mirrors the server); observers (QA) see the whole Grande Mondo
  const reach = useMemo(() => {
    if (!gm || gm.view_all) return null;
    const z = active ? zoneAt(gm, active.x, active.y) : myRegion ? myRegion.index + 1 : null;
    return z == null ? null : allowedZones(gm, z);
  }, [gm, active?.x, active?.y, myRegion]); // eslint-disable-line react-hooks/exhaustive-deps
  const viewBounds = useMemo(() => (gm && reach ? zonesBounds(gm, reach) : null), [gm, reach]);
  const fogZones = useMemo(() => (gm && reach ? fogZonesFor(gm, reach) : null), [gm, reach]);
  const gmLeft = secondsLeft(gm, realmNow);
  // fog fell / returned: foreign castles become visible / hidden → refetch chunks and the far LOD
  const phaseRef = useRef<string | null>(null);
  const warKey = `${gm?.phase ?? ""}|${(gm?.war?.regions ?? []).join(",")}`;
  useEffect(() => {
    if (phaseRef.current && gm && phaseRef.current !== warKey) engineRef.current?.invalidateChunks();
    phaseRef.current = warKey;
  }, [warKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const onSelect = useCallback((v: Selection | null) => setSel(v), []);
  // deep link from "Carovane nei dintorni": /map?fx=..&fy=..&ft=<nonce> → centre the camera on that tile once
  useEffect(() => {
    const key = focus.fx && focus.fy ? `${focus.fx}:${focus.fy}:${focus.ft ?? ""}` : null;
    if (!key || focusedRef.current === key) return;
    const tryFocus = () => {
      if (!engineRef.current) return false;
      engineRef.current.centerOn(Number(focus.fx), Number(focus.fy), 24);
      focusedRef.current = key;
      return true;
    };
    if (!tryFocus()) {
      const id = setInterval(() => tryFocus() && clearInterval(id), 400);
      return () => clearInterval(id);
    }
  }, [focus.fx, focus.fy, focus.ft]);

  const onCam = useCallback((c: { tx: number; tz: number; dist: number }) => setCam(c), []);
  // own marches + detected hostile marches (intel-disclosed by the server) + foreign caravans detected by the active
  // settlement's search radius (Bible §34.9) share one marker layer
  const allMarches = useMemo(
    () => [...(marches.data?.marches ?? []), ...(marches.data?.incoming ?? []), ...(caravanSearch.data?.caravans ?? []).map(caravanAsMarch)],
    [marches.data, caravanSearch.data],
  );
  const selS = sel?.settlement;
  const selM = sel?.march;
  // monuments: every Pyramid the viewer may see (fog up → only the ones inside the reachable zones), localised names for the labels
  const pyramids = useMemo(() => {
    const all = (pyramidsQ.data?.pyramids ?? []).map((p) => ({ ...p, name: pyramidName(t, p) }));
    if (!gm || !reach) return all;
    return all.filter((p) => {
      const z = zoneAt(gm, p.anchor[0], p.anchor[1]);
      return z != null && reach.has(z);
    });
  }, [pyramidsQ.data, gm, reach, t]);
  const selPyr = usePyramid(sel?.pyramid ? worldId : null, sel?.pyramid?.id ?? null);
  const selP = sel?.pyramid ? (selPyr.data && selPyr.data.id === sel.pyramid.id ? selPyr.data : null) : null;
  const selPSummary = sel?.pyramid ?? null;
  const history = useSettlementBattles(worldId, selS && selS.kind !== "PLAYER_SLOT" ? selS.settlement_id : null);

  if (!worldId) return null;
  const distance = selS && active ? Math.max(Math.abs(selS.x - active.x), Math.abs(selS.y - active.y)) : null;
  const factionLabel = (f?: string) => (f === "OWN" ? t("own") : f === "ALLY" ? t("ally") : f === "ENEMY" ? t("enemy") : f === "RESERVED_SLOT" ? t("reservedSlot") : t("neutral"));
  const terrainLabel = (tr?: string) => (tr === "forest" ? t("forest") : tr === "mountain" ? t("mountain") : tr === "water" ? t("water") : t("plain"));

  return (
    <View style={s.root} testID="map-screen">
      {world?.size ? <MapView3D worldId={worldId} worldSize={world.size} home={home} marches={allMarches} pyramids={pyramids} onSelect={onSelect} onEngine={(e) => (engineRef.current = e)} onCameraChange={onCam} showLabels={labelsOn} viewBounds={viewBounds} fogZones={fogZones} /> : null}

      {/* top HUD: resources of the active settlement */}
      <View style={[s.hud, { top: insets.top + spacing.xs, pointerEvents: "box-none" }]}>
        <Panel glass style={s.topBar} testID="map-hud-resources">
          <View style={s.resBar}>
            {active ? <CostRow cost={active.resources} /> : <T v="caption">{t("loading")}</T>}
          </View>
          <Pressable style={s.iconBtn} onPress={() => router.push("/daily")} testID="map-daily-button" accessibilityLabel={t("daily")}>
            <Icon name={daily.data?.claimable ? "gift" : "gift-outline"} size={20} color={daily.data?.claimable ? colors.brandPrimary : colors.onSurface} />
            {daily.data?.claimable ? <View style={{ position: "absolute", top: 6, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.error }} testID="map-daily-dot" /> : null}
          </Pressable>
          <Pressable style={s.iconBtn} onPress={() => router.push("/marches")} testID="map-marches-button">
            <Icon name="flag-checkered" size={20} color={colors.onSurface} />
            {marches.data?.marches?.length ? <View style={{ position: "absolute", top: 6, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brandPrimary }} /> : null}
          </Pressable>
        </Panel>
        {gm ? (
          <Pressable style={[s.gmChip, gm.phase === "WAR" && s.gmChipWar]} onPress={() => router.push("/grande-mondo")} testID="map-gm-chip" accessibilityLabel={t("gmTitle")}>
            <Icon name={gm.phase === "WAR" && !gm.my_fog_up ? "sword-cross" : "weather-fog"} size={16} color={gm.phase === "WAR" ? colors.factionEnemy : colors.brandPrimary} />
            <T v="caption" testID="map-gm-chip-text">
              {gm.phase === "WAR" ? (gm.my_fog_up ? `${t("gmWarChip")} · ${t("gmNotAtWar")}` : `${t("gmWarChip")}${gm.war?.speed_multiplier && gm.war.speed_multiplier > 1 ? ` ×${gm.war.speed_multiplier}` : ""}`) : t("gmFogChip")} · {formatCountdown(gmLeft)}
              {myRegion ? ` · ${regionFlag(myRegion.code)} ${myRegion.code}` : ""}
            </T>
          </Pressable>
        ) : null}
        <PyramidAlertBanner dto={pyramid.data} onPress={() => router.push({ pathname: "/pyramid", params: pyramid.data ? { id: pyramid.data.id } : {} })} style={{ marginTop: spacing.xs }} />
        {settlements.length > 1 ? (
          <SettlementSwitcher
            settlements={settlements}
            activeId={settlementId}
            onSelect={(id) => {
              void selectSettlement(id);
              const st = settlements.find((x: any) => x.settlement_id === id);
              if (st) engineRef.current?.centerOn(st.x, st.y, 30);
            }}
          />
        ) : null}
      </View>

      <View style={[s.coord, { top: insets.top + 64 + (settlements.length > 1 ? 40 : 0) + (gm ? 44 : 0), pointerEvents: "none" }]}>
        <T v="caption" testID="map-camera-coords">
          {Math.round(cam.tx)},{Math.round(cam.tz)} · ×{Math.round(cam.dist)}
        </T>
        <View style={s.clock} testID="map-realm-clock" accessibilityLabel={t("realmTime")}>
          <Icon name={TOD_ICON[tod]} size={13} color={colors.brandPrimary} />
          <T v="caption">
            {clockLabel} · {t(`tod_${tod}` as StringKey)}
          </T>
        </View>
      </View>

      {/* right controls */}
      <View style={[s.right, { top: insets.top + 110 + (settlements.length > 1 ? 40 : 0) + (gm ? 44 : 0) }]}>
        <Pressable style={s.iconBtn} onPress={() => active && engineRef.current?.centerOn(active.x, active.y, 30)} testID="map-center-home-button" accessibilityLabel={t("centerOnHome")}>
          <Icon name="home-map-marker" size={22} color={colors.brandPrimary} />
        </Pressable>
        <Pressable
          ref={pyramidButtonRef}
          onLayout={measurePyramidButton}
          style={s.iconBtn}
          onPress={() => {
            // the viewer's own Pyramid (Grande Mondo: the region's Piccola Piramide — the Grande Piramide lies beyond the fog)
            const target = pyramid.data?.anchor ?? myRegion?.pyramid_anchor ?? [200, 200];
            engineRef.current?.centerOn(target[0], target[1], 44);
          }}
          testID="map-center-pyramid-button"
          accessibilityLabel={t("pyramidCenter")}
        >
          <Icon name="pyramid" size={22} color={pyramid.data?.state === "OPEN" ? colors.brandPrimary : colors.onSurface} />
        </Pressable>
        <Pressable style={s.iconBtn} onPress={() => router.push("/caravan/nearby")} testID="map-nearby-caravans-button" accessibilityLabel={t("nearbyCaravans")}>
          <Icon name="binoculars" size={22} color={(caravanSearch.data?.caravans.length ?? 0) > 0 ? colors.brandPrimary : colors.onSurface} />
          {(caravanSearch.data?.caravans.length ?? 0) > 0 ? (
            <View style={s.badge} testID="map-nearby-caravans-badge">
              <T style={s.badgeText}>{caravanSearch.data!.caravans.length}</T>
            </View>
          ) : null}
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
      {!sel && !legend ? <MiniMapFrame engine={engineRef} style={{ left: spacing.sm, bottom: spacing.md + 26 }} /> : null}

      {/* selection card */}
      {sel && selM ? (
        <Animated.View entering={FadeInUp} exiting={FadeOutDown} style={[s.bottom, { bottom: spacing.md }]}>
          <MarchCard march={selM} onClose={() => engineRef.current?.select(null)} onRecall={(id) => marchMut.recall.mutateAsync(id).catch(showError)} />
        </Animated.View>
      ) : sel && selPSummary ? (
        <Animated.View entering={FadeInUp} exiting={FadeOutDown} style={[s.bottom, { bottom: spacing.md }]}>
          <Panel glass testID="map-pyramid-card">
            <Row>
              <Icon name="pyramid" size={24} color={selPSummary.faction === "OWN" ? colors.factionOwn : selPSummary.faction === "ENEMY" ? colors.factionEnemy : colors.brandPrimary} />
              <View style={s.selName}>
                <T v="heading" numberOfLines={1} testID="map-pyramid-name">
                  {pyramidName(t, selPSummary)}
                  {selPSummary.owner ? ` · [${selPSummary.owner.tag}]` : ""}
                </T>
                <T v="caption" numberOfLines={2}>
                  {selP ? pyramidDescription(t, selP) : selPSummary.kind === "REGIONAL" ? t("pyramidRegionalHint") : selPSummary.kind === "GRAND" ? t("pyramidGrandHint") : ""}
                </T>
              </View>
              <PyramidStatePill dto={selPSummary} testID="map-pyramid-state" />
              <Pressable onPress={() => engineRef.current?.select(null)} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }} testID="map-selection-close">
                <Icon name="close" size={20} color={colors.muted} />
              </Pressable>
            </Row>
            {selP ? (
              <>
                <View style={{ marginTop: spacing.sm }}>
                  <PyramidPhase dto={selP} />
                </View>
                <PyramidActions dto={selP} compact onDetails={() => router.push({ pathname: "/pyramid", params: { id: selP.id } })} onAttack={() => router.push({ pathname: "/march/new", params: { pyramid: selP.id, mission: "ATTACK" } })} onReinforce={() => router.push({ pathname: "/march/new", params: { pyramid: selP.id, mission: "REINFORCE" } })} />
              </>
            ) : (
              <Loading />
            )}
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
                  <>
                    <Button title={t("tabCity")} icon="castle" variant="secondary" style={{ flex: 1 }} onPress={() => selectSettlement(selS.settlement_id).then(() => router.push("/(tabs)/settlement"))} testID="map-selection-open-city" />
                    {selS.settlement_id !== settlementId ? (
                      <Button title={t("reinforceOwn")} icon="shield-plus" variant="secondary" style={{ flex: 1 }} onPress={() => router.push({ pathname: "/march/new", params: { target: selS.settlement_id } })} testID="map-selection-reinforce" />
                    ) : null}
                  </>
                ) : (
                  <>
                    <Button title={t("target")} icon="information-outline" variant="secondary" style={{ flex: 1 }} onPress={() => router.push({ pathname: "/target/[id]", params: { id: selS.settlement_id } })} testID="map-selection-detail" />
                    <Button title={selS.faction === "ALLY" ? t("missionReinforce") : t("march")} icon={selS.faction === "ALLY" ? "shield-plus" : "sword"} style={{ flex: 1 }} onPress={() => router.push({ pathname: "/march/new", params: { target: selS.settlement_id } })} testID="map-selection-march" />
                  </>
                )}
                {/* Caravans (Bible §13): resource convoys to own or allied settlements only — interceptable when detected */}
                {(selS.faction === "OWN" && selS.settlement_id !== settlementId) || selS.faction === "ALLY" ? (
                  <Button title={t("caravan")} icon="cart" variant={selS.faction === "OWN" ? "primary" : "secondary"} style={{ flex: 1 }} onPress={() => router.push({ pathname: "/caravan/new", params: { target: selS.settlement_id } })} testID="map-selection-caravan" />
                ) : null}
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
