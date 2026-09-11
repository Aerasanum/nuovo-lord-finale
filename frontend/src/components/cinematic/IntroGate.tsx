/**
 * Intro cinematic gate (spec.cinematics.intro): the first time a Player enters a World the 24 s intro plays once
 * (skippable after 2 s, never blocks server timers); watching or skipping marks it seen server-side so it is never
 * auto-played again on any device. Replay lives in the Chronicle and in the cinematics gallery.
 */
import { useEffect, useRef } from "react";

import { useIntroSeen } from "@/src/api/hooks";
import { useCinematic } from "@/src/components/cinematic/Cinematic";
import { useGame } from "@/src/state/useGame";

export function introSpec(player: any, worldName: string | null) {
  return { kind: "INTRO" as const, units: {}, crest: player?.house?.crest ?? null, houseName: player?.house_name ?? null, allianceTag: player?.alliance?.tag ?? null, targetName: worldName };
}

export function IntroGate() {
  const { worldId, player, world } = useGame();
  const cinematic = useCinematic();
  const seen = useIntroSeen(worldId ?? "");
  const fired = useRef<string | null>(null);
  useEffect(() => {
    if (!worldId || !player || player.intro_seen || fired.current === worldId) return;
    fired.current = worldId;
    cinematic.play(introSpec(player, world?.name ?? null));
    seen.mutate();
  }, [worldId, player, world, cinematic, seen]);
  return null;
}
