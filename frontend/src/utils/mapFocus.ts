import type { useRouter } from "expo-router";

type Router = ReturnType<typeof useRouter>;

/**
 * Open the world map centred on a tile.
 *
 * `ft` is a cache-buster: without a changing parameter, tapping the same tile twice is the same route and the map
 * never re-centres. Lives outside the components so the timestamp is read when the user taps, never during render.
 */
export function focusOnMap(router: Router, x: number, y: number, mode: "push" | "replace" = "push"): void {
  const params = { fx: String(x), fy: String(y), ft: String(Date.now()) };
  if (mode === "replace") router.replace({ pathname: "/(tabs)/map", params });
  else router.push({ pathname: "/(tabs)/map", params });
}
