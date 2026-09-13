/**
 * Daily reward gate: once per app session, when today's reward is claimable and no cinematic is on screen, open the
 * vault (`/daily`). Never fires during the intro; the Player can always reopen the vault from the map / city HUD.
 */
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";

import { useDaily } from "@/src/api/hooks";
import { useCinematic } from "@/src/components/cinematic/Cinematic";
import { useTour } from "@/src/state/tour";
import { useGame } from "@/src/state/useGame";

let shownFor: string | null = null; // module-level: survives tab remounts within the session

export function DailyGate() {
  const { worldId, player } = useGame();
  const cinematic = useCinematic();
  const { active: tourActive } = useTour();
  const daily = useDaily(worldId);
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // order of the session gates: intro cinematic → guided tour → «Riepilogo rientro» → daily vault
    if (!worldId || !player || !player.intro_seen || !player.tour_seen || player.return_pending || tourActive || cinematic.active || !daily.data?.claimable || shownFor === worldId) return;
    shownFor = worldId;
    timer.current = setTimeout(() => router.push("/daily"), 900);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [worldId, player, tourActive, cinematic.active, daily.data?.claimable, router]);
  return null;
}
