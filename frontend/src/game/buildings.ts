/** Building presentation helpers (icons, current-benefit read-outs) — canonical names from spec.buildings. */
import type { BuildingEntry, SettlementDto } from "@/src/api/hooks";
import type { IconName } from "@/src/components/ui";

const ICONS: Record<string, IconName> = {
  "Castello / Fortezza": "castle",
  Fattoria: "barley",
  Boscaiolo: "pine-tree",
  "Cava d'Argilla": "cube",
  "Miniera di Ferro": "anvil",
  "Miniera d'Oro": "gold",
  Magazzino: "warehouse",
  Mercato: "storefront",
  Caravanserraglio: "truck-delivery",
  Caserma: "sword",
  Arcieria: "bow-arrow",
  Scuderia: "horse-variant",
  Officina: "hammer-wrench",
  "Officina d'Assedio": "hammer-wrench",
  Mura: "wall",
  Torre: "tower-fire",
  "Sala di Guerra": "shield-sword",
  Universita: "school",
  Università: "school",
  Porto: "sail-boat",
  Cantiere: "anchor",
  "Cantiere Navale": "anchor",
  Tempio: "temple-hindu",
  Santuario: "creation",
  Ambasciata: "handshake",
  Ospedale: "hospital-box",
  Recinto: "paw",
  "Recinto delle Bestie": "paw",
  Taverna: "glass-mug-variant",
};
const CATEGORY_ICONS: Record<string, IconName> = { core: "castle", economy: "barley", military: "sword-cross", defense: "shield-half-full", logistics: "truck-fast", special: "star-four-points" };

export function buildingIcon(b: Pick<BuildingEntry, "name" | "category">): IconName {
  return ICONS[b.name] ?? CATEGORY_ICONS[b.category] ?? "office-building";
}

export type BenefitReadout = { icon: IconName; label: string; value: string };
/** What the building currently yields for THIS settlement (server numbers, no formulas re-implemented). */
export function currentBenefits(b: Pick<BuildingEntry, "name">, s: SettlementDto | undefined, t: (k: any) => string): BenefitReadout[] {
  if (!s) return [];
  const res: Record<string, keyof SettlementDto["production_per_h"]> = { Fattoria: "grain", Boscaiolo: "wood", "Cava d'Argilla": "clay", "Miniera di Ferro": "iron", "Miniera d'Oro": "gold" };
  const out: BenefitReadout[] = [];
  const key = res[b.name];
  if (key) out.push({ icon: ICONS[b.name] ?? "barley", label: t("production"), value: `${Math.round(s.production_per_h[key] ?? 0)}/h` });
  if (b.name === "Magazzino") out.push({ icon: "warehouse", label: t("warehouse"), value: String(s.warehouse_capacity ?? 0) });
  if (b.name === "Sala di Guerra") out.push({ icon: "shield-sword", label: t("marchCapacity"), value: String(s.march_capacity ?? 0) });
  return out;
}
