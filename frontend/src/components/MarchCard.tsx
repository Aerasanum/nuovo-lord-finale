import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import type { BattleDto, MarchDto } from "@/src/api/hooks";
import { Crest } from "@/src/components/Crest";
import { Button, Countdown, Icon, Panel, Row, StatePill, T } from "@/src/components/ui";
import { formatNumber, type StringKey, useI18n } from "@/src/i18n";
import { missionLabel } from "@/src/map3d/MapLabels";
import { spacing, useTheme } from "@/src/theme";

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
  const { t } = useI18n();
  const router = useRouter();
  const own = !march.hostile;
  const accent = own ? colors.factionOwn : colors.factionEnemy;
  const intel = march.intel;
  const returning = march.status === "RETURNING";

  return (
    <Panel glass testID="map-selection-card">
      <Row>
        {march.house_crest ? <Crest crest={march.house_crest} size={28} testID="march-card-crest" /> : <Icon name={returning ? "undo-variant" : march.naval ? "ferry" : "sword-cross"} size={22} color={accent} />}
        <View style={styles.name}>
          <T v="heading" numberOfLines={1} testID="map-selection-name">
            {own ? `${missionLabel(march.mission, t)} → ${march.target_name}` : `${t("hostileMarch")} → ${march.target_name}`}
          </T>
          <T v="caption" numberOfLines={1}>
            {own
              ? Object.entries(march.units)
                  .map(([u, c]) => `${u} ${formatNumber(c)}`)
                  .join(" · ") + (march.result ? ` · ${march.result}` : "")
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
          <Row style={styles.spread}>
            <T v="caption">
              {returning ? t("returning") : t("arrival")} · {march.path.length} {t("tiles")} · {march.speed_tph} {t("speedTph")}
            </T>
            <Countdown endsAt={returning ? march.return_at : march.arrival_at} testID="map-selection-march-eta" />
          </Row>
          <View style={styles.actions}>
            <Button title={t("activeMarches")} icon="flag" variant="secondary" style={styles.flex} onPress={() => router.push("/marches")} testID="map-selection-march-list" />
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
});
