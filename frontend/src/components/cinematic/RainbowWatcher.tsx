/**
 * Rainbow watcher (Bible §12.2): while my Unicorn is IN_FLIGHT the app polls the battle log fast; as soon as the
 * Rainbow Bridge battle is committed in my favour the «castle taken under the rainbow» cinematic plays once
 * (shared SEEN list with the battle-report page, so opening the report later does not replay it).
 */
import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useRef } from "react";

import { get } from "@/src/api/client";
import { type BattleDto, useMe } from "@/src/api/hooks";
import { useCinematic } from "@/src/components/cinematic/Cinematic";
import { storage } from "@/src/utils/storage";
import { useGame } from "@/src/state/useGame";

const SEEN_KEY = "eld.cinematic.conquest.seen";

export function RainbowWatcher() {
  const { worldId, player } = useGame();
  const cinematic = useCinematic();
  const me = useMe(worldId);
  const state = player?.unicorn?.state as string | undefined;
  const armed = useRef(false);
  const playing = useRef(false);
  if (state === "IN_FLIGHT") armed.current = true;
  const active = !!worldId && (state === "IN_FLIGHT" || (armed.current && state === "COOLDOWN"));
  const battles = useQuery<{ battles: BattleDto[] }>({
    queryKey: ["rainbow-watch", worldId],
    queryFn: () => get(`/worlds/${worldId}/battles`),
    enabled: active,
    refetchInterval: active ? 4000 : false,
  });
  useEffect(() => {
    if (state === "IN_FLIGHT") {
      const t = setInterval(() => me.refetch(), 5000); // the Unicorn state flips ~10 s after launch
      return () => clearInterval(t);
    }
  }, [state, me]);
  useEffect(() => {
    if (!active || playing.current || !player || !battles.data) return;
    const hit = battles.data.battles.find((b) => b.mission === "RAINBOW_BRIDGE" && b.attacker_player_id === player.player_id && b.ownership_result?.changed);
    if (!hit) return;
    playing.current = true;
    storage.getItem<string>(SEEN_KEY, "[]").then(async (raw) => {
      const seen: string[] = JSON.parse(raw || "[]");
      if (seen.includes(hit.battle_id)) {
        armed.current = false;
        return;
      }
      await storage.setItem(SEEN_KEY, JSON.stringify([...seen, hit.battle_id].slice(-50)));
      const full = await get<BattleDto>(`/worlds/${worldId}/battles/${hit.battle_id}`).catch(() => hit);
      const r = (full as any).report ?? {};
      cinematic.play({ kind: "CONQUEST", rainbow: true, units: r.attacker_survivors ?? {}, missionLabel: null, targetName: hit.target_name, etaSeconds: null, crest: player.house?.crest ?? null, houseName: player.house_name ?? null, allianceTag: player.alliance?.tag ?? null, newLevel: hit.ownership_result?.new_level ?? null });
      armed.current = false;
    });
  }, [active, battles.data, player, worldId, cinematic]);
  return null;
}
