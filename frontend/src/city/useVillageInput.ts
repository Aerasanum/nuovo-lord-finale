import { useMemo } from "react";

import { useBuildings } from "@/src/api/hooks";
import { useGame } from "@/src/state/useGame";

import type { VillageInput } from "./village";

/** Assembles the 3D village input for the active settlement (null until the settlement DTO is loaded). */
export function useVillageInput(): VillageInput | null {
  const { worldId, settlementId, settlement, player } = useGame();
  const buildings = useBuildings(worldId, settlementId);
  const d = settlement.data;
  const list = buildings.data?.buildings;
  return useMemo(() => {
    if (!d || !settlementId) return null;
    const unlocked = (list ?? []).filter((b) => b.state !== "LOCKED").map((b) => b.name);
    return {
      settlementId,
      level: d.level,
      buildings: d.buildings ?? {},
      unlocked,
      wallLevel: d.wall?.level ?? d.buildings?.Mura ?? 0,
      skin: d.skin ?? "classic",
      crest: player?.house?.crest ?? d.owner_house_crest ?? null,
      portEligible: !!d.port_eligible,
      terrain: d.terrain,
    };
  }, [d, list, settlementId, player?.house?.crest]);
}
