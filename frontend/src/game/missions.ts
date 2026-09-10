/** Presentation helpers for the mission catalogue (names, requirement / reward lines) — pure functions, no fetching. */
import type { MissionCatalogEntry } from "@/src/api/hooks";
import { fmt, type StringKey, tDyn } from "@/src/i18n";

type Tr = (k: StringKey) => string;

export function missionName(t: Tr, key: string, fallback: string): string {
  return tDyn(t, `missionName_${key}`, fallback);
}

export function missionDesc(t: Tr, key: string): string | null {
  const v = tDyn(t, `missionDesc_${key}`, "");
  return v || null;
}

export function requirementLines(t: Tr, m: MissionCatalogEntry): string[] {
  const r = m.requirements || {};
  const out: string[] = [];
  if (r.minimum_units) out.push(fmt(t("missionUnitsMin"), { n: r.minimum_units }));
  if (r.allowed_units) out.push(fmt(t("missionUnitsAllowed"), { u: (r.allowed_units as string[]).join(", ") }));
  if (r.mixed_units_required) out.push(t("missionMixed"));
  if (r.Falco_min) out.push(fmt(t("missionFalco"), { n: r.Falco_min }));
  if (r.research_key) out.push(fmt(t("missionResearch"), { k: r.research_key, l: r.research_min_level ?? 1 }));
  return out;
}

export function rewardLines(t: Tr, m: MissionCatalogEntry): string[] {
  const rw = m.reward || {};
  const out: string[] = [];
  if (rw.local_production_hours_all_5_resources) out.push(fmt(t("rewardProductionHours"), { h: rw.local_production_hours_all_5_resources }));
  if (rw.additional_gold_production_hours) out.push(fmt(t("rewardGoldHours"), { h: rw.additional_gold_production_hours }));
  if (rw.intelligence_snapshot) out.push(t("rewardIntel"));
  if (rw.prestige) out.push(fmt(t("rewardPrestige"), { p: rw.prestige }));
  if (rw.seeded_cosmetic_chance_pct) out.push(fmt(t("rewardCosmeticChance"), { p: rw.seeded_cosmetic_chance_pct, f: rw.fallback_if_no_cosmetic?.prestige ?? 0 }));
  return out;
}

/** Units the composer may offer for a mission (allowed list, else everything in the garrison). */
export function eligibleUnits(m: MissionCatalogEntry, army: Record<string, number>): Record<string, number> {
  const allowed: string[] | undefined = m.requirements?.allowed_units;
  const out: Record<string, number> = {};
  for (const [u, n] of Object.entries(army)) if (n > 0 && (!allowed || allowed.includes(u))) out[u] = n;
  return out;
}

/** Client-side mirror of the server checks so the Start button can explain itself before the round-trip. */
export function localBlocker(t: Tr, m: MissionCatalogEntry, units: Record<string, number>, research: Record<string, number> | undefined): string | null {
  const r = m.requirements || {};
  const total = Object.values(units).reduce((a, b) => a + b, 0);
  if (total < (r.minimum_units ?? 1)) return fmt(t("missionUnitsMin"), { n: r.minimum_units ?? 1 });
  if (r.mixed_units_required && Object.values(units).filter((n) => n > 0).length < 2) return t("missionMixed");
  if (r.Falco_min && (units.Falco ?? 0) < r.Falco_min) return fmt(t("missionFalco"), { n: r.Falco_min });
  if (r.research_key && (research?.[r.research_key] ?? 0) < (r.research_min_level ?? 1)) return fmt(t("missionResearch"), { k: r.research_key, l: r.research_min_level ?? 1 });
  return null;
}
