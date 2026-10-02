/**
 * Where a notification's `deep_link` goes (spec.notification_event_catalog / notification_policy.required_fields).
 *
 * The inbox and a tapped push have to land on the same screen for the same event — they are the same notification,
 * one read from the list and one read from the lock screen — so the mapping lives here instead of inside the inbox
 * screen, which is where it used to be and where the push handler could not reach it.
 */
import type { Href } from "expo-router";

export type Routable = { event?: string; deep_link?: string | null; payload?: Record<string, any> | null };

export function routeFor(n: Routable): Href | null {
  const p = n.payload || {};
  const link = n.deep_link ?? "";
  // A battle report is read as a report, whatever the catalog's deep link says.
  if ((n.event === "BATTLE_REPORT_READY" || n.event === "BATTLE_RESOLVED") && p.battle_id) return { pathname: "/battle/[id]", params: { id: p.battle_id } };
  if (link.startsWith("battle/")) return { pathname: "/battle/[id]", params: { id: link.slice("battle/".length) } };
  if (link.startsWith("pyramid")) {
    const id = link.match(/[?&]id=([^&]+)/)?.[1];
    return id ? { pathname: "/pyramid", params: { id: decodeURIComponent(id) } } : "/pyramid";
  }
  if (link.startsWith("grande-mondo")) return "/grande-mondo";
  if (link.startsWith("research")) return "/research";
  if (link.startsWith("caravans")) return "/caravans";
  if (link === "alliance/diplomacy") return "/alliance/diplomacy";
  if (link === "alliance/treasury") return "/alliance/treasury";
  if (link === "alliance/mercenary") return "/alliance/mercenary";
  if (link.startsWith("alliance")) return "/(tabs)/alliance";
  if (link.startsWith("map")) return "/marches";
  if (link.startsWith("army")) return "/(tabs)/army";
  if (link.startsWith("settlement")) return "/(tabs)/settlement";
  if (link.startsWith("missions")) return "/(tabs)/missions";
  if (link === "house") return "/house";
  if (link === "settings") return "/settings";
  if (link === "store") return "/store";
  // Everything the catalog leaves at "inbox", and anything a future event invents: the inbox holds all of it.
  return link ? "/(tabs)/inbox" : null;
}
