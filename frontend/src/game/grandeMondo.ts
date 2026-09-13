import type { GmRegion, GrandeMondoDto } from "@/src/api/hooks";
import type { FogBounds, FogZones } from "@/src/map3d/fog";

/** Grande Mondo helpers shared by the worlds picker, the map HUD and the info screen (Bibbia GM). */
export const REGION_FLAG: Record<string, string> = { IT: "🇮🇹", FR: "🇫🇷", ES: "🇪🇸", DE: "🇩🇪", AT: "🇦🇹", RU: "🇷🇺", CN: "🇨🇳", UK: "🇬🇧", PT: "🇵🇹" };

export function regionFlag(code: string): string {
  return REGION_FLAG[code] ?? "🏳️";
}

/** i18n key of a region language ("zh-CN" → lang_zh). */
export function langKey(lang: string): string {
  return `lang_${lang.split("-")[0]}`;
}

/** Zone of a tile: 0 = central disc, k = region k (sector k-1). Mirrors the server's `sector_index`. */
export function zoneAt(gm: GrandeMondoDto | null | undefined, x: number, y: number): number | null {
  if (!gm?.center || !gm.regions.length) return null;
  const dx = x - gm.center.x;
  const dy = y - gm.center.y;
  if (Math.hypot(dx, dy) < gm.center.radius) return 0;
  const n = gm.regions.length;
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  const k = Math.floor((((ang + 90 + 180 / n) % 360) + 360) % 360 / (360 / n)) % n;
  return k + 1;
}

export function regionAt(gm: GrandeMondoDto | null | undefined, x: number, y: number): GmRegion | null {
  const z = zoneAt(gm, x, y);
  if (!gm || z == null || z === 0) return null;
  return gm.regions[z - 1] ?? null;
}

export function regionByCode(gm: GrandeMondoDto | null | undefined, code: string | null | undefined): GmRegion | null {
  if (!gm || !code) return null;
  return gm.regions.find((r) => r.code === code) ?? null;
}

/**
 * Zones a movement from `zone` may use — mirrors the server (`grande_mondo.allowed_zones`):
 * ISOLATION → own zone; WAR → the admitted regions + the centre (null = everything) or own zone if left out.
 */
export function allowedZones(gm: GrandeMondoDto, zone: number): Set<number> | null {
  if (gm.phase !== "WAR") return new Set([zone]);
  const codes = gm.war?.regions ?? null;
  if (!codes || !codes.length) return null;
  const zones = new Set<number>([0]);
  for (const r of gm.regions) if (codes.includes(r.code)) zones.add(r.index + 1);
  return zones.has(zone) ? zones : new Set([zone]);
}

/** Camera / minimap bounds of a set of zones (bbox union + margin of open sea); null = whole realm. */
export function zonesBounds(gm: GrandeMondoDto, zones: Set<number>, margin = 40): FogBounds | null {
  if (!gm.center) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (bx0: number, by0: number, bx1: number, by1: number) => {
    x0 = Math.min(x0, bx0);
    y0 = Math.min(y0, by0);
    x1 = Math.max(x1, bx1);
    y1 = Math.max(y1, by1);
  };
  for (const z of zones) {
    if (z === 0) add(gm.center.x - gm.center.radius, gm.center.y - gm.center.radius, gm.center.x + gm.center.radius, gm.center.y + gm.center.radius);
    else {
      const r = gm.regions[z - 1];
      if (r) add(r.bbox[0], r.bbox[1], r.bbox[2], r.bbox[3]);
    }
  }
  if (!Number.isFinite(x0)) return null;
  return { x0: x0 - margin, y0: y0 - margin, x1: x1 + margin, y1: y1 + margin };
}

export function fogZonesFor(gm: GrandeMondoDto, allowed: Set<number>): FogZones | null {
  if (!gm.center || !gm.regions.length) return null;
  const r = gm.regions[0];
  return { cx: gm.center.x, cy: gm.center.y, rIn: gm.center.radius, rOut: r.r_out, n: gm.regions.length, allowed: [...allowed] };
}

/** "119g 23h" / "5h 12m" / "3m" countdown from seconds. */
export function formatCountdown(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}g ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Seconds left computed from `phase_until` and the (server-synced) clock — the DTO's own value ages between refetches. */
export function secondsLeft(gm: GrandeMondoDto | null | undefined, nowMs: number): number | null {
  if (!gm?.phase_until) return null;
  return Math.max(0, Math.floor((new Date(gm.phase_until).getTime() - nowMs) / 1000));
}
