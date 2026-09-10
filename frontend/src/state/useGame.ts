import { useEffect } from "react";

import { useMe, useSettlement } from "@/src/api/hooks";
import { useAuth } from "@/src/state/AuthContext";

/** World-scoped game context: current player, settlements and the active settlement. */
export function useGame() {
  const { worldId, settlementId, selectSettlement } = useAuth();
  const me = useMe(worldId);
  const settlements = me.data?.settlements ?? [];
  const mother = settlements.find((s: any) => s.is_mother) ?? settlements[0];
  const activeId = settlementId && settlements.some((s: any) => s.settlement_id === settlementId) ? settlementId : mother?.settlement_id ?? null;
  useEffect(() => {
    if (activeId && activeId !== settlementId) selectSettlement(activeId);
  }, [activeId, settlementId, selectSettlement]);
  const settlement = useSettlement(worldId, activeId);
  return { worldId, settlementId: activeId, me, player: me.data?.player, world: me.data?.world, settlements, settlement, unread: me.data?.unread_inbox ?? 0 };
}
