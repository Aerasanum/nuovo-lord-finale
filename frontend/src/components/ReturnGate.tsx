/**
 * «Riepilogo rientro» gate: the server arms `player.return_pending` when two sessions are ≥ 6 h apart; the first time the
 * tabs mount in this session (after intro and tour, with no cinematic on screen) the digest opens once. Dismissing it
 * clears the flag server-side; the daily vault waits for it.
 */
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";

import { useCinematic } from "@/src/components/cinematic/Cinematic";
import { useTour } from "@/src/state/tour";
import { useGame } from "@/src/state/useGame";

let shownFor: string | null = null;

export function ReturnGate() {
  const { worldId, player } = useGame();
  const cinematic = useCinematic();
  const { active: tourActive } = useTour();
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!worldId || !player || !player.return_pending || !player.intro_seen || !player.tour_seen || tourActive || cinematic.active || shownFor === worldId) return;
    shownFor = worldId;
    timer.current = setTimeout(() => router.push("/return-summary"), 600);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [worldId, player, tourActive, cinematic.active, router]);
  return null;
}
