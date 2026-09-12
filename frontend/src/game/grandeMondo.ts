import type { GmRegion, GrandeMondoDto } from "@/src/api/hooks";
import type { FogBounds } from "@/src/map3d/fog";

/** Grande Mondo helpers shared by the worlds picker, the map HUD and the info screen (Bibbia GM). */
export const REGION_FLAG: Record<string, string> = { IT: "🇮🇹", FR: "🇫🇷", ES: "🇪🇸", DE: "🇩🇪", AT: "🇦🇹", RU: "🇷🇺", CN: "🇨🇳", UK: "🇬🇧", PT: "🇵🇹" };

export function regionFlag(code: string): string {
  return REGION_FLAG[code] ?? "🏳️";
}

/** i18n key of a region language ("zh-CN" → lang_zh). */
export function langKey(lang: string): string {
  return `lang_${lang.split("-")[0]}`;
}

export function regionAt(gm: GrandeMondoDto | null | undefined, x: number, y: number): GmRegion | null {
  if (!gm) return null;
  for (const r of gm.regions) if (x >= r.x0 && x < r.x0 + r.size && y >= r.y0 && y < r.y0 + r.size) return r;
  return null;
}

export function regionByCode(gm: GrandeMondoDto | null | undefined, code: string | null | undefined): GmRegion | null {
  if (!gm || !code) return null;
  return gm.regions.find((r) => r.code === code) ?? null;
}

/** Camera / fog bounds of a region: the square plus a margin of open sea so the fog wall itself stays in view. */
export function regionBounds(r: GmRegion, margin = 40): FogBounds {
  return { x0: r.x0 - margin, y0: r.y0 - margin, x1: r.x0 + r.size + margin, y1: r.y0 + r.size + margin };
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
