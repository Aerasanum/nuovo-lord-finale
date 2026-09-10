/** Presentation helpers for caravans (Bible §13) — pure functions, no fetching. */
import { serverNow } from "@/src/api/client";
import type { DetectedCaravan, MarchDto } from "@/src/api/hooks";
import { formatNumber, type Lang, RESOURCE_LABELS } from "@/src/i18n";

/** "Grano 1.200 · Legno 300" for a cargo / delivered map (zero entries skipped). */
export function cargoLine(cargo: Partial<Record<string, number>> | null | undefined, lang: Lang): string {
  return Object.entries(cargo ?? {})
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([r, n]) => `${RESOURCE_LABELS[lang][r] ?? r} ${formatNumber(n ?? 0)}`)
    .join(" · ");
}

export function cargoTotal(cargo: Partial<Record<string, number>> | null | undefined): number {
  return Object.values(cargo ?? {}).reduce<number>((a, b) => a + (b ?? 0), 0);
}

export function isLogistics(m: MarchDto): boolean {
  return m.mission === "CARAVAN" || m.mission === "INTERCEPT";
}

/** A detected foreign caravan rendered through the hostile-march marker layer of the 3D map: the disclosed remaining
 * route is the path, `departed_at` is the detection time (SERVER clock — the engine animates on server time) and the
 * ETA band collapses on the known arrival. */
export function caravanAsMarch(c: DetectedCaravan): MarchDto {
  const detected = new Date(serverNow()).toISOString();
  const path = c.remaining_path.length >= 2 ? c.remaining_path : [c.position, c.position];
  return {
    march_id: `caravan:${c.caravan_id}`,
    house_name: c.house_name,
    house_crest: c.house_crest,
    origin_settlement_id: null,
    target_settlement_id: null,
    target_sentinel_id: null,
    target_name: "?",
    target_xy: path[path.length - 1],
    mission: "CARAVAN",
    units: {},
    ships: 0,
    naval: false,
    path,
    departed_at: detected,
    arrival_at: c.arrival_at,
    return_at: null,
    eta_seconds: null,
    speed_tph: null,
    status: "OUTBOUND",
    battle_id: null,
    loot: null,
    result: null,
    player_id: "",
    hostile: true,
    intel: {
      detected_at: detected,
      entry_tile: c.position,
      entry_index: 0,
      intel_score: c.intel_score,
      tier: { min_score: 0, max_score: 100, reveal: [] },
      heading: c.heading,
      mission_class: null,
      mission_family: "CARAVAN",
      eta_error_pct: 0,
      eta_range: [c.arrival_at, c.arrival_at],
      troop_error_pct: null,
      troops_total_range: c.escort_band,
      unit_categories: null,
      category_bands: null,
      composition: null,
      flags: null,
    },
    caravan: c,
  };
}
