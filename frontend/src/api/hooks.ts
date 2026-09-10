import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { get, post, syncServerTime } from "./client";

export type Resources = Record<"grain" | "wood" | "clay" | "iron" | "gold", number>;

export type JobDto = {
  job_id: string;
  kind: "BUILDING" | "SETTLEMENT_UPGRADE" | "RESEARCH" | "RECRUIT" | "SENTINEL_BUILD" | "SHIP";
  queue: string;
  target: string;
  target_level?: number | null;
  count?: number | null;
  produced_so_far?: number;
  started_at: string;
  ends_at: string;
  remaining_seconds: number;
  progress: number;
  status: string;
  cost_snapshot: Partial<Resources>;
  modifiers_snapshot: Record<string, any>;
};

export type SettlementDto = {
  settlement_id: string;
  world_id: string;
  kind: string;
  name: string;
  x: number;
  y: number;
  terrain: "plain" | "forest" | "mountain" | "water";
  terrain_defender_bonus_pct: number;
  region: string;
  port_eligible: boolean;
  level: number;
  owner_player_id: string | null;
  owner_house_name?: string | null;
  faction: "OWN" | "ENEMY" | "NEUTRAL" | "RESERVED_SLOT";
  wall_level: number;
  garrison_total?: number | null;
  is_mother?: boolean;
  resources: Resources;
  production_per_h: Resources;
  warehouse_capacity: number;
  buildings: Record<string, number>;
  research: Record<string, number>;
  army: Record<string, number>;
  ships: number;
  wall: { level: number; current_hp: number; max_hp: number; defense_bonus_pct: number; static_damage: number };
  loyalty: number;
  development_score: number;
  march_capacity: number;
  outgoing_marches: number;
  outgoing_cap: number;
  jobs: JobDto[];
  construction_queues: number;
  research_queues: number;
  settlement_upgrade: SettlementUpgradeInfo;
  server_time: string;
};

export type SettlementUpgradeInfo = {
  state: string;
  level: number;
  next?: { level: number; stage: string; unlocks: string; cost: Resources; duration_min: number; fast_applied: boolean; base_cost: Resources; base_time_min: number };
  requirements?: { building: string; required: number; have: number; ok: boolean }[];
  missing?: Partial<Resources>;
  job?: JobDto | null;
};

export type BuildingEntry = {
  name: string;
  category: string;
  purpose: string;
  level: number;
  state: string;
  max_level: number;
  unlock: { min_settlement_level: number; required_research_key: string | null; level_ok: boolean; research_ok: boolean };
  next?: { level: number; cost: Resources; duration_min: number; fast_applied: boolean; base_cost: Resources; base_time_min: number; research_time_reduction: number };
  missing?: Partial<Resources>;
  job?: JobDto;
};

export type ResearchEntry = {
  key: string;
  name: string;
  branch: string;
  level: number;
  max_level: number;
  required_university_level: number;
  required_settlement_level: number;
  prerequisites: { key: string; ok: boolean }[];
  cost_class: string;
  effect: string;
  effects: any[];
  state: string;
  next?: { level: number; cost: Resources; duration_min: number; base_time_min: number; research_time_reduction: number };
  missing?: Partial<Resources>;
  job?: JobDto;
};

export type UnitEntry = {
  name: string;
  category: string;
  producer_building: string;
  stats: { atk: number; def: number; hp: number; speed_tph: number; cargo: number; wall_damage: number };
  cost: Resources;
  base_time_s: number;
  role: string;
  unlock: { min_settlement_level: number; required_research_key: string | null; producer_building: string; level_ok: boolean; research_ok: boolean; producer_ok: boolean };
  count: number;
  batch_cap: number;
  effective_time_s: number | null;
  state: string;
  job?: JobDto;
};

export type MarchDto = {
  march_id: string;
  origin_settlement_id: string;
  target_settlement_id: string | null;
  target_sentinel_id: string | null;
  target_name: string;
  mission: string;
  units: Record<string, number>;
  ships: number;
  naval: boolean;
  path: [number, number][];
  departed_at: string;
  arrival_at: string | null;
  return_at: string | null;
  eta_seconds: number;
  speed_tph: number;
  status: string;
  battle_id: string | null;
  loot: Partial<Resources> | null;
  result: string | null;
  player_id: string;
};

export type ChunkDto = {
  cx: number;
  cy: number;
  size: number;
  terrain_b64: string;
  settlements: SettlementPublic[];
  sentinels: SentinelDto[];
  territory: { x: number; y: number; faction: "OWN" | "ENEMY" | "RESERVED" }[];
  server_time: string;
};

export type OverviewDto = {
  world_id: string;
  factor: number;
  size: number;
  terrain_b64: string;
  settlements: SettlementPublic[];
  server_time: string;
};

export type SettlementPublic = {
  settlement_id: string;
  kind: string;
  name: string;
  x: number;
  y: number;
  terrain: string;
  terrain_defender_bonus_pct: number;
  region: string;
  port_eligible: boolean;
  level: number;
  owner_player_id: string | null;
  owner_house_name?: string | null;
  faction: "OWN" | "ENEMY" | "NEUTRAL" | "RESERVED_SLOT";
  wall_level: number;
  garrison_total?: number | null;
  garrison?: Record<string, number>;
  wall?: { level: number; current_hp: number; max_hp: number };
  buildings?: Record<string, number>;
  next_growth_at?: string | null;
  owner_shield_active?: boolean;
};

export type SentinelDto = {
  sentinel_id: string;
  settlement_id: string;
  owner_player_id: string;
  x: number;
  y: number;
  direction: string;
  ring: string;
  state: string;
  garrison: Record<string, number>;
  garrison_cap: number | null;
  grace_deadline: string | null;
  generation: number;
  faction?: string;
};

export type InboxItem = {
  notification_id: string;
  event: string;
  severity: string;
  payload: Record<string, any>;
  deep_link: string;
  created_at_utc: string;
  read_at: string | null;
};

export type BattleDto = {
  battle_id: string;
  march_id: string;
  attacker_player_id: string;
  defender_player_id: string | null;
  target_settlement_id: string | null;
  target_sentinel_id: string | null;
  target_name: string;
  target_xy: [number, number];
  mission: string;
  report: any;
  loot: Partial<Resources> | null;
  ownership_result: { changed: boolean; reason?: string; new_level?: number };
  loyalty: any;
  ships_excluded: number;
  created_at: string;
};

const sync = <T extends { server_time?: string }>(d: T) => {
  syncServerTime(d?.server_time);
  return d;
};

export const qk = {
  worlds: ["worlds"] as const,
  me: (w: string) => ["me", w] as const,
  settlement: (w: string, s: string) => ["settlement", w, s] as const,
  buildings: (w: string, s: string) => ["buildings", w, s] as const,
  research: (w: string, s: string) => ["research", w, s] as const,
  army: (w: string, s: string) => ["army", w, s] as const,
  sentinels: (w: string, s: string) => ["sentinels", w, s] as const,
  marches: (w: string) => ["marches", w] as const,
  battles: (w: string) => ["battles", w] as const,
  battle: (w: string, id: string) => ["battle", w, id] as const,
  inbox: (w: string) => ["inbox", w] as const,
  publicSettlement: (w: string, id: string) => ["public", w, id] as const,
  catalog: ["catalog"] as const,
};

export function useWorlds(enabled = true) {
  return useQuery({ queryKey: qk.worlds, queryFn: () => get("/worlds").then(sync), enabled, refetchInterval: 15000 });
}

export function useMe(worldId?: string | null) {
  return useQuery({ queryKey: qk.me(worldId || ""), queryFn: () => get(`/worlds/${worldId}/me`).then(sync), enabled: !!worldId, refetchInterval: 20000 });
}

export function useSettlement(worldId?: string | null, sid?: string | null) {
  return useQuery<SettlementDto>({ queryKey: qk.settlement(worldId || "", sid || ""), queryFn: () => get(`/worlds/${worldId}/settlements/${sid}`).then(sync), enabled: !!worldId && !!sid, refetchInterval: 10000 });
}

export function useBuildings(worldId?: string | null, sid?: string | null) {
  return useQuery<{ buildings: BuildingEntry[]; settlement_upgrade: SettlementUpgradeInfo; jobs: JobDto[]; resources: Resources; server_time: string }>({
    queryKey: qk.buildings(worldId || "", sid || ""),
    queryFn: () => get(`/worlds/${worldId}/settlements/${sid}/buildings`).then(sync),
    enabled: !!worldId && !!sid,
    refetchInterval: 10000,
  });
}

export function useResearch(worldId?: string | null, sid?: string | null) {
  return useQuery<{ branches: string[]; nodes: ResearchEntry[]; queues: number; active: number; resources: Resources; server_time: string }>({
    queryKey: qk.research(worldId || "", sid || ""),
    queryFn: () => get(`/worlds/${worldId}/settlements/${sid}/research`).then(sync),
    enabled: !!worldId && !!sid,
    refetchInterval: 15000,
  });
}

export function useArmy(worldId?: string | null, sid?: string | null) {
  return useQuery<{ army: Record<string, number>; ships: number; units: UnitEntry[]; resources: Resources; server_time: string }>({
    queryKey: qk.army(worldId || "", sid || ""),
    queryFn: () => get(`/worlds/${worldId}/settlements/${sid}/army`).then(sync),
    enabled: !!worldId && !!sid,
    refetchInterval: 10000,
  });
}

export function useSentinels(worldId?: string | null, sid?: string | null) {
  return useQuery<{ sentinels: SentinelDto[]; garrison_cap: number; command_level: number }>({
    queryKey: qk.sentinels(worldId || "", sid || ""),
    queryFn: () => get(`/worlds/${worldId}/settlements/${sid}/sentinels`),
    enabled: !!worldId && !!sid,
    refetchInterval: 15000,
  });
}

export function useMarches(worldId?: string | null) {
  return useQuery<{ marches: MarchDto[]; server_time: string }>({ queryKey: qk.marches(worldId || ""), queryFn: () => get(`/worlds/${worldId}/marches`).then(sync), enabled: !!worldId, refetchInterval: 10000 });
}

export function useBattles(worldId?: string | null) {
  return useQuery<{ battles: BattleDto[] }>({ queryKey: qk.battles(worldId || ""), queryFn: () => get(`/worlds/${worldId}/battles`), enabled: !!worldId, refetchInterval: 20000 });
}

export function useBattle(worldId?: string | null, id?: string | null) {
  return useQuery<BattleDto>({ queryKey: qk.battle(worldId || "", id || ""), queryFn: () => get(`/worlds/${worldId}/battles/${id}`), enabled: !!worldId && !!id });
}

export function useInbox(worldId?: string | null) {
  return useQuery<{ items: InboxItem[]; unread: number; server_time: string }>({ queryKey: qk.inbox(worldId || ""), queryFn: () => get(`/worlds/${worldId}/inbox`).then(sync), enabled: !!worldId, refetchInterval: 10000 });
}

export function usePublicSettlement(worldId?: string | null, id?: string | null) {
  return useQuery<SettlementPublic>({ queryKey: qk.publicSettlement(worldId || "", id || ""), queryFn: () => get(`/worlds/${worldId}/settlements/${id}/public`), enabled: !!worldId && !!id });
}

export function useCatalog() {
  return useQuery({ queryKey: qk.catalog, queryFn: () => get("/spec/catalog"), staleTime: Infinity });
}

function idem() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useSettlementMutations(worldId: string, sid: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.settlement(worldId, sid) });
    qc.invalidateQueries({ queryKey: qk.buildings(worldId, sid) });
    qc.invalidateQueries({ queryKey: qk.research(worldId, sid) });
    qc.invalidateQueries({ queryKey: qk.army(worldId, sid) });
    qc.invalidateQueries({ queryKey: qk.sentinels(worldId, sid) });
    qc.invalidateQueries({ queryKey: qk.inbox(worldId) });
    qc.invalidateQueries({ queryKey: qk.me(worldId) });
  };
  const upgradeBuilding = useMutation({ mutationFn: (name: string) => post(`/worlds/${worldId}/settlements/${sid}/buildings/${encodeURIComponent(name)}/upgrade`, { idempotency_key: idem() }), onSettled: invalidate });
  const upgradeSettlement = useMutation({ mutationFn: () => post(`/worlds/${worldId}/settlements/${sid}/upgrade`, { idempotency_key: idem() }), onSettled: invalidate });
  const cancelJob = useMutation({ mutationFn: (jobId: string) => post(`/worlds/${worldId}/jobs/${jobId}/cancel`, {}), onSettled: invalidate });
  const startResearch = useMutation({ mutationFn: (key: string) => post(`/worlds/${worldId}/settlements/${sid}/research/${encodeURIComponent(key)}/start`, { idempotency_key: idem() }), onSettled: invalidate });
  const recruit = useMutation({ mutationFn: (v: { unit: string; count: number }) => post(`/worlds/${worldId}/settlements/${sid}/recruit`, { ...v, idempotency_key: idem() }), onSettled: invalidate });
  const buildSentinel = useMutation({ mutationFn: (direction: string) => post(`/worlds/${worldId}/settlements/${sid}/sentinels`, { direction, idempotency_key: idem() }), onSettled: invalidate });
  return { upgradeBuilding, upgradeSettlement, cancelJob, startResearch, recruit, buildSentinel, invalidate };
}

export function useMarchMutations(worldId: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.marches(worldId) });
    qc.invalidateQueries({ queryKey: ["settlement", worldId] });
    qc.invalidateQueries({ queryKey: ["army", worldId] });
    qc.invalidateQueries({ queryKey: qk.inbox(worldId) });
  };
  const launch = useMutation({ mutationFn: (body: any) => post(`/worlds/${worldId}/marches`, { ...body, idempotency_key: idem() }), onSettled: invalidate });
  const preview = useMutation({ mutationFn: (body: any) => post(`/worlds/${worldId}/marches/preview`, body) });
  const recall = useMutation({ mutationFn: (id: string) => post(`/worlds/${worldId}/marches/${id}/recall`, {}), onSettled: invalidate });
  return { launch, preview, recall };
}

export function useInboxMutations(worldId: string) {
  const qc = useQueryClient();
  const readAll = useMutation({ mutationFn: () => post(`/worlds/${worldId}/inbox/read-all`, {}), onSettled: () => qc.invalidateQueries({ queryKey: qk.inbox(worldId) }) });
  const read = useMutation({ mutationFn: (id: string) => post(`/worlds/${worldId}/inbox/${id}/read`, {}), onSettled: () => qc.invalidateQueries({ queryKey: qk.inbox(worldId) }) });
  return { readAll, read };
}
