import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import type { BattleDto, MarchDto } from "@/src/api/hooks";
import { useMarchMutations } from "@/src/api/hooks";
import { Crest } from "@/src/components/Crest";
import { useToast } from "@/src/components/overlay";
import { Button, Countdown, Icon, Panel, ProgressBar, Row, StatePill, T } from "@/src/components/ui";
import { cargoLine, cargoTotal } from "@/src/game/caravans";
import { formatNumber, type StringKey, useI18n } from "@/src/i18n";
import { missionLabel } from "@/src/map3d/MapLabels";
import { useGame } from "@/src/state/useGame";
import { radius, spacing, useTheme } from "@/src/theme";

function fmtRange(r: [number, number] | null | undefined): string | null {
  return r ? `${formatNumber(r[0])}–${formatNumber(r[1])}` : null;
}

function headingLabel(h: string | null, t: (k: StringKey) => string): string {
  return h ?? t("unknown");
}

/** Map selection card for a march. Own marches show exact data; detected hostile marches show ONLY the intel tier's
 * disclosure (Bible §34.10) — nothing is fabricated for hidden fields, they read "n/d". */
export function MarchCard({ march, onClose, onRecall }: { march: MarchDto; onClose: () => void; onRecall: (id: string) => void }) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const router = useRouter();
  if (march.caravan) return <DetectedCaravanCard march={march} onClose={onClose} />;
  const own = !march.hostile;
  const accent = own ? colors.factionOwn : colors.factionEnemy;
  const intel = march.intel;
  const returning = march.status === "RETURNING";
  const logistics = march.mission === "CARAVAN" || march.mission === "INTERCEPT";

  return (
    <Panel glass testID="map-selection-card">
      <Row>
        {march.house_crest ? <Crest crest={march.house_crest} size={28} testID="march-card-crest" /> : <Icon name={returning ? "undo-variant" : march.naval ? "ferry" : logistics ? "truck-delivery" : "sword-cross"} size={22} color={accent} />}
        <View style={styles.name}>
          <T v="heading" numberOfLines={1} testID="map-selection-name">
            {own ? `${missionLabel(march.mission, t)} → ${march.target_name}` : `${t("hostileMarch")} → ${march.target_name}`}
          </T>
          <T v="caption" numberOfLines={1}>
            {own
              ? (march.mission === "CARAVAN" ? `${t("cargo")} ${formatNumber(cargoTotal(march.cargo))}${Object.keys(march.units).length ? " · " : ""}` : "") +
                Object.entries(march.units)
                  .map(([u, c]) => `${u} ${formatNumber(c)}`)
                  .join(" · ") +
                (march.result ? ` · ${march.result}` : "")
              : `${march.house_name ?? t("enemy")} · ${t("intelScore")} ${intel?.intel_score ?? 0}/100`}
          </T>
        </View>
        <StatePill state={own ? march.status : "HOSTILE"} />
        <Pressable onPress={onClose} style={styles.close} testID="map-selection-close">
          <Icon name="close" size={20} color={colors.muted} />
        </Pressable>
      </Row>

      {own ? (
        <>
          {march.mission === "CARAVAN" ? <CaravanCargoLines march={march} lang={lang} /> : null}
          <Row style={styles.spread}>
            <T v="caption">
              {returning ? t("returning") : t("arrival")} · {march.path.length} {t("tiles")} · {march.speed_tph} {t("speedTph")}
            </T>
            <Countdown endsAt={returning ? march.return_at : march.arrival_at} testID="map-selection-march-eta" />
          </Row>
          <View style={styles.actions}>
            <Button title={logistics ? t("caravans") : t("activeMarches")} icon={logistics ? "truck-delivery" : "flag"} variant="secondary" style={styles.flex} onPress={() => router.push(logistics ? "/caravans" : "/marches")} testID="map-selection-march-list" />
            {march.battle_id ? <Button title={t("battle")} icon="sword-cross" variant="secondary" style={styles.flex} onPress={() => router.push({ pathname: "/battle/[id]", params: { id: march.battle_id! } })} testID="map-selection-march-battle" /> : null}
            {march.status === "OUTBOUND" ? <Button title={t("recall")} icon="undo" style={styles.flex} onPress={() => onRecall(march.march_id)} testID="map-selection-march-recall" /> : null}
          </View>
        </>
      ) : (
        <View testID="map-selection-intel">
          <View style={styles.grid}>
            <IntelCell label={t("heading")} value={headingLabel(intel?.heading ?? null, t)} testID="intel-heading" />
            <IntelCell label={t("entryTile")} value={intel?.entry_tile ? `${intel.entry_tile[0]},${intel.entry_tile[1]}` : t("unknown")} testID="intel-entry" />
            <IntelCell label={t("missionClass")} value={intel?.mission_family ? missionLabel(intel.mission_family, t) : intel?.mission_class ? t(intel.mission_class === "OFFENSIVE" ? "offensive" : "support") : t("unknown")} testID="intel-mission" />
            <IntelCell label={t("troopsEstimate")} value={fmtRange(intel?.troops_total_range) ?? t("unknown")} sub={intel?.troop_error_pct != null ? `±${intel.troop_error_pct}%` : undefined} testID="intel-troops" />
          </View>
          <Row style={styles.spread}>
            <T v="caption">
              {t("etaEstimate")}
              {intel?.eta_error_pct != null ? ` (±${intel.eta_error_pct}%)` : ""}
            </T>
            {intel?.eta_range ? (
              <Row style={{ gap: 4 }}>
                <Countdown endsAt={intel.eta_range[0]} testID="intel-eta-lo" />
                <T v="caption">–</T>
                <Countdown endsAt={intel.eta_range[1]} testID="intel-eta-hi" />
              </Row>
            ) : (
              <T v="caption" testID="intel-eta-unknown">
                {t("unknown")}
              </T>
            )}
          </Row>
          {intel?.unit_categories ? (
            <T v="caption" style={styles.line}>
              {t("unitCategories")}: {intel.unit_categories.join(", ")}
              {intel.category_bands ? ` · ${Object.entries(intel.category_bands).map(([c, p]) => `${c} ~${p}%`).join(", ")}` : ""}
            </T>
          ) : null}
          {intel?.composition ? (
            <T v="caption" style={styles.line}>
              {t("composition")}: {Object.entries(intel.composition).map(([u, r]) => `${u} ${fmtRange(r)}`).join(" · ")}
            </T>
          ) : null}
          {intel?.flags ? (
            <T v="caption" style={styles.line}>
              {t("siegeCart")}: {intel.flags.siege_cart ? "✓" : "—"} · {t("legendary")}: {intel.flags.legendary ? "✓" : "—"}
            </T>
          ) : null}
          <T v="caption" style={[styles.line, { color: colors.muted }]}>
            {t("intelHint")}
          </T>
          <View style={styles.actions}>
            <Button title={t("activeMarches")} icon="flag" variant="secondary" style={styles.flex} onPress={() => router.push("/marches")} testID="map-selection-march-list" />
          </View>
        </View>
      )}
    </Panel>
  );
}

/** Cargo / delivered / residue lines of an own caravan (Bible §13: overflow stays on the convoy and returns). */
function CaravanCargoLines({ march, lang }: { march: MarchDto; lang: "it" | "en" }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const delivered = cargoTotal(march.delivered) > 0;
  return (
    <View testID="caravan-cargo-lines">
      {!delivered && cargoTotal(march.cargo) > 0 ? (
        <T v="caption" style={styles.line} numberOfLines={2}>
          {t("cargo")}: {cargoLine(march.cargo, lang)}
          {march.caravans_assigned ? ` · ${march.caravans_assigned} × ${formatNumber(march.capacity ?? 0)}` : ""}
        </T>
      ) : null}
      {delivered ? (
        <T v="caption" style={[styles.line, { color: colors.success }]} numberOfLines={2}>
          {t("caravanDelivered")}: {cargoLine(march.delivered, lang)}
        </T>
      ) : null}
      {delivered && cargoTotal(march.cargo) > 0 ? (
        <T v="caption" style={[styles.line, { color: colors.warning }]} numberOfLines={2}>
          {t("overflowReturning")}: {cargoLine(march.cargo, lang)}
        </T>
      ) : null}
      {march.result === "INTERCEPTED" ? (
        <T v="caption" style={[styles.line, { color: colors.error }]}>
          {t("caravanIntercepted")}
          {cargoTotal(march.cargo) > 0 ? ` · ${t("caravanReturning")}: ${cargoLine(march.cargo, lang)}` : ""}
        </T>
      ) : null}
    </View>
  );
}

/** Map selection card for a detected foreign caravan (Bible §34.9): disclosed position/heading/bands + Intercept. */
function DetectedCaravanCard({ march, onClose }: { march: MarchDto; onClose: () => void }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const c = march.caravan!;
  return (
    <Panel glass testID="map-selection-card">
      <Row>
        {c.house_crest ? <Crest crest={c.house_crest} size={28} testID="march-card-crest" /> : <Icon name="truck-delivery" size={22} color={colors.factionEnemy} />}
        <View style={styles.name}>
          <T v="heading" numberOfLines={1} testID="map-selection-name">
            {t("foreignCaravan")} · {c.house_name ?? t("enemy")}
          </T>
          <T v="caption" numberOfLines={1}>
            {t("position")} {c.position[0]},{c.position[1]} · {t("heading")} {c.heading ?? t("unknown")} · {t("intelScore")} {c.intel_score}/100
          </T>
        </View>
        <StatePill state="HOSTILE" />
        <Pressable onPress={onClose} style={styles.close} testID="map-selection-close">
          <Icon name="close" size={20} color={colors.muted} />
        </Pressable>
      </Row>
      <View style={styles.grid} testID="map-selection-caravan">
        <IntelCell label={t("cargoEstimate")} value={fmtRange(c.cargo_band) ?? t("unknown")} testID="caravan-cargo-band" />
        <IntelCell label={t("caravanEscortShort")} value={c.escorted ? (fmtRange(c.escort_band) ?? t("escorted")) : t("unescorted")} testID="caravan-escort-band" />
      </View>
      <Row style={styles.spread}>
        <T v="caption">{t("arrival")}</T>
        <Countdown endsAt={c.arrival_at} testID="caravan-eta" />
      </Row>
      <View style={styles.actions}>
        <Button title={t("caravans")} icon="truck-delivery" variant="secondary" style={styles.flex} onPress={() => router.push("/caravans")} testID="map-selection-march-list" />
        <Button title={t("intercept")} icon="sword" style={styles.flex} onPress={() => router.push({ pathname: "/caravan/intercept", params: { caravan: c.caravan_id } })} testID="map-selection-intercept" />
      </View>
    </Panel>
  );
}

/** List card (Marce attive / Carovane): mission, troops or cargo, live progress, ETA, battle / recall actions. */
export function MarchListCard({ m }: { m: MarchDto }) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const router = useRouter();
  const { worldId } = useGame();
  const mm = useMarchMutations(worldId ?? "");
  const { showError } = useToast();
  const end = m.status === "RETURNING" ? m.return_at : m.arrival_at;
  const start = m.status === "RETURNING" ? m.recalled_at ?? m.arrival_at ?? m.departed_at : m.departed_at;
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const prog = end && start ? Math.max(0, Math.min(1, (now - Date.parse(start)) / Math.max(1, Date.parse(end) - Date.parse(start)))) : 0;
  return (
    <View style={[styles.listItem, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]} testID={`march-card-${m.march_id}`}>
      <Row style={styles.spread}>
        <Row style={styles.flex}>
          <Icon name={m.naval ? "ferry" : m.mission === "CARAVAN" ? "truck-delivery" : m.mission === "INTERCEPT" ? "sword" : "flag"} size={18} color={colors.brandPrimary} />
          <T v="label" numberOfLines={1} style={styles.flex}>
            {missionLabel(m.mission, t)} → {m.target_name}
          </T>
        </Row>
        <StatePill state={m.status} />
      </Row>
      <T v="caption">
        {Object.entries(m.units)
          .map(([u, c]) => `${u} ${formatNumber(c)}`)
          .join(" · ") || (m.mission === "CARAVAN" ? t("unescorted") : "—")}
        {m.ships ? ` · ${t("ships")} ${m.ships}` : ""}
        {m.result ? ` · ${m.result}` : ""}
      </T>
      {m.mission === "CARAVAN" ? <CaravanCargoLines march={m} lang={lang} /> : null}
      <ProgressBar value={prog} />
      <Row style={styles.spread}>
        <T v="caption">
          {m.path.length} {t("tiles")} · {m.speed_tph} {t("speedTph")}
        </T>
        <Countdown endsAt={end} testID={`march-${m.march_id}-eta`} />
      </Row>
      <Row style={{ justifyContent: "flex-end", gap: spacing.sm }}>
        {m.battle_id ? <Button title={t("battle")} variant="ghost" icon="sword-cross" onPress={() => router.push({ pathname: "/battle/[id]", params: { id: m.battle_id! } })} testID={`march-${m.march_id}-battle`} /> : null}
        {m.status === "OUTBOUND" ? <Button title={t("recall")} variant="secondary" icon="undo" onPress={() => mm.recall.mutateAsync(m.march_id).catch(showError)} testID={`march-${m.march_id}-recall`} /> : null}
      </Row>
    </View>
  );
}

function IntelCell({ label, value, sub, testID }: { label: string; value: string; sub?: string; testID: string }) {
  return (
    <View style={styles.cell} testID={testID}>
      <T v="caption">{label}</T>
      <T style={{ fontWeight: "700" }}>
        {value}
        {sub ? <T v="caption"> {sub}</T> : null}
      </T>
    </View>
  );
}

/** Compact battle history of a settlement (viewer's perspective): outcome, mission, date, losses and loot; tap → report. */
export function BattleHistory({ battles, viewerPlayerId, loading }: { battles: BattleDto[]; viewerPlayerId: string | null; loading?: boolean }) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const router = useRouter();
  const sum = (o: Record<string, number> | undefined | null) => Object.values(o ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  const when = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(lang === "it" ? "it-IT" : "en-GB", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString(lang === "it" ? "it-IT" : "en-GB", { hour: "2-digit", minute: "2-digit" });
  };
  return (
    <View style={styles.battleWrap} testID="map-selection-battles">
      <Row style={styles.spread}>
        <T v="label">{t("battleHistory")}</T>
        {loading ? <T v="caption">…</T> : null}
      </Row>
      {!loading && !battles.length ? (
        <T v="caption" style={{ color: colors.muted }} testID="map-selection-no-battles">
          {t("noBattles")}
        </T>
      ) : null}
      {battles.map((b) => {
        const r = b.report ?? {};
        const attackerIsMe = b.attacker_player_id === viewerPlayerId;
        const won = r.winner === (attackerIsMe ? "ATTACKER" : "DEFENDER");
        const myLosses = sum(attackerIsMe ? r.attacker_losses : r.defender_losses);
        const loot = sum(b.loot);
        return (
          <Pressable key={b.battle_id} onPress={() => router.push({ pathname: "/battle/[id]", params: { id: b.battle_id } })} style={[styles.battleRow, { borderColor: colors.border }]} testID={`battle-row-${b.battle_id}`} accessibilityRole="button">
            <Icon name={won ? "trophy" : "skull"} size={18} color={won ? colors.success : colors.factionEnemy} />
            <View style={styles.flex}>
              <T v="caption" numberOfLines={1} style={{ color: colors.onSurface }}>
                {won ? t("victory") : t("defeat")} · {missionLabel(b.mission, t)} · {when(b.created_at)}
              </T>
              <T v="caption" numberOfLines={1}>
                {t("losses")} −{formatNumber(myLosses)}
                {loot > 0 ? ` · ${t("loot")} ${attackerIsMe ? "+" : "−"}${formatNumber(loot)}` : ""}
                {b.ownership_result?.changed ? ` · ${t("conquered")}` : ""}
              </T>
            </View>
            <Icon name="chevron-right" size={18} color={colors.muted} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  name: { flex: 1, marginLeft: spacing.sm },
  close: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  spread: { justifyContent: "space-between", marginTop: 4 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  flex: { flex: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: spacing.xs },
  cell: { width: "50%", paddingVertical: 2 },
  line: { marginTop: 4 },
  battleWrap: { marginTop: spacing.sm },
  battleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6, borderTopWidth: 1, minHeight: 44 },
  listItem: { marginBottom: spacing.sm, borderRadius: radius.md, borderWidth: 1, padding: spacing.sm, gap: 6 },
});
