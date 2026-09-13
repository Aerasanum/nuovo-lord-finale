/**
 * First-login tour gate: once the intro cinematic is done and no cinematic is on screen, a Player who has never seen
 * the guided tour gets it (Mappa → Città → Missioni → Piramidi). Finishing or skipping marks it seen server-side so it
 * never auto-runs again on any device; Settings → «Rivedi la guida» replays it on demand.
 */
import React, { useEffect, useRef } from "react";

import { useTourSeen } from "@/src/api/hooks";
import { useCinematic } from "@/src/components/cinematic/Cinematic";
import { TourOverlay } from "@/src/components/tour/TourOverlay";
import { useGame } from "@/src/state/useGame";
import { tour } from "@/src/state/tour";

export function TourGate() {
  const { worldId, player } = useGame();
  const cinematic = useCinematic();
  const seen = useTourSeen(worldId ?? "");
  const fired = useRef<string | null>(null);
  useEffect(() => {
    if (!worldId || !player || !player.intro_seen || player.tour_seen || cinematic.active || fired.current === worldId) return;
    fired.current = worldId;
    const t = setTimeout(() => tour.start(), 700);
    return () => clearTimeout(t);
  }, [worldId, player, cinematic.active]);
  return <TourOverlay onDone={() => (player && !player.tour_seen ? seen.mutate() : undefined)} />;
}
