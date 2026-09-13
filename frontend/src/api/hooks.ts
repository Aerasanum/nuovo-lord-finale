import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, get, post, put, syncServerTime } from "./client";

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
  owner_house_crest?: CrestDto | null;
  owner_alliance_tag?: string | null;
  skin?: string | null;
  faction: "OWN" | "ALLY" | "ENEMY" | "NEUTRAL" | "RESERVED_SLOT";
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
  unlock: { min_settlement_level: number; required_research_key: string | null; required_research_name: string | null; level_ok: boolean; research_ok: boolean };
  next?: { level: number; cost: Resources; duration_min: number; fast_applied: boolean; base_cost: Resources; base_time_min: number; research_time_reduction: number; effect?: string };
  missing?: Partial<Resources>;
  job?: JobDto;
  /** «Santuario Mitico» only (Bible §12): player-wide 5-level table + Unicorn ritual state. */
  mythic?: { is_mother: boolean; levels: { level: number; cost: Resources; duration_min: number; effect: string }[]; unicorn: UnicornDto };
};

export type UnicornDto = {
  state: "NONE" | "QUEUED" | "READY" | "IN_FLIGHT" | "COOLDOWN";
  ready_at: string | null;
  cooldown_until: string | null;
  march_id?: string | null;
  cost: Resources;
  summon_days: number;
  cooldown_hours: number;
  event_seconds: number;
  sanctuary_level: number;
  can_summon: boolean;
};

export type MythicDto = {
  sanctuary: { level: number; max_level: number; unlocked: boolean; unlock: BuildingEntry["unlock"]; levels: { level: number; cost: Resources; duration_min: number; effect: string }[]; job: JobDto | null; mother_settlement_id: string | null };
  unicorn: UnicornDto;
};

export function useMythic(worldId?: string | null) {
  return useQuery({ queryKey: ["mythic", worldId], queryFn: () => get<MythicDto>(`/worlds/${worldId}/mythic`), enabled: !!worldId, refetchInterval: 30_000 });
}

export function useUnicornSummon(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post<{ unicorn: UnicornDto }>(`/worlds/${worldId}/unicorn/summon`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mythic", worldId] });
      qc.invalidateQueries({ queryKey: qk.me(worldId) });
      qc.invalidateQueries({ queryKey: ["buildings"] });
      qc.invalidateQueries({ queryKey: ["settlement"] });
    },
  });
}

/** One-time contextual hints (research / alliance / marches): dismissed once per Player/World, optimistic on /me. */
export function useHintSeen(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => post<{ hints_seen: string[] }>(`/worlds/${worldId}/hints/${key}/seen`, {}),
    onMutate: (key) => {
      qc.setQueryData(qk.me(worldId), (d: any) => (d?.player ? { ...d, player: { ...d.player, hints_seen: [...(d.player.hints_seen ?? []), key] } } : d));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.me(worldId) }),
  });
}

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
  unlock: { min_settlement_level: number; required_research_key: string | null; required_research_name: string | null; producer_building: string; level_ok: boolean; research_ok: boolean; producer_ok: boolean };
  count: number;
  batch_cap: number;
  effective_time_s: number | null;
  state: string;
  job?: JobDto;
  /** Legendaries only (Bible §10): max 3 per type per Metropolis = garrison + queue + in flight. */
  legendary_cap?: { max: number; used: number; garrison: number; queued: number; in_flight: number; free: number };
};

export type CrestDto = {
  shield_base: "heater" | "round" | "kite" | "square";
  primary_symbol: "circle" | "diamond" | "cross" | "star" | "chevron" | "tower" | "crescent" | "triangle";
  secondary_mark: "none" | "dot" | "stripe" | "bar";
  border: "none" | "thin" | "thick";
  colors: { base: string; primary: string; secondary: string; border: string };
};

export type MarchSkin = "classic" | "dragon" | "elephant" | "falcon";
export type HouseDto = { house_name: string; motto: string | null; description: string | null; crest: CrestDto; march_skin: MarchSkin; prestige: number; history: unknown[] };
export type CrestCatalog = { shield_bases: CrestDto["shield_base"][]; symbols: CrestDto["primary_symbol"][]; marks: CrestDto["secondary_mark"][]; borders: CrestDto["border"][]; palette: string[]; march_skins: { key: MarchSkin; requires_unit: string | null; prestige_required: number | null }[] };

/** Bible §34.10 disclosure — only the fields the intel tier reveals are non-null. */
export type IntelDto = {
  detected_at: string;
  entry_tile: [number, number] | null;
  entry_index: number;
  intel_score: number;
  tier: { min_score: number; max_score: number; reveal: string[] };
  heading: string | null;
  mission_class: "OFFENSIVE" | "SUPPORT" | null;
  mission_family: string | null;
  eta_error_pct: number | null;
  eta_range: [string, string] | null;
  troop_error_pct: number | null;
  troops_total_range: [number, number] | null;
  unit_categories: string[] | null;
  category_bands: Record<string, number> | null;
  composition: Record<string, [number, number]> | null;
  flags: { siege_cart: boolean; legendary: boolean } | null;
};

export type MarchDto = {
  march_id: string;
  house_name?: string | null;
  house_crest?: CrestDto | null;
  skin?: MarchSkin;
  origin_settlement_id: string | null;
  target_settlement_id: string | null;
  target_sentinel_id: string | null;
  target_pyramid?: boolean;
  pyramid_id?: string | null;
  speed_multiplier?: number;
  target_name: string;
  target_xy?: [number, number] | null;
  mission: string;
  units: Record<string, number>;
  ships: number;
  naval: boolean;
  /** Unicorn power (Bible §12.2): straight rainbow, 10 s event, owner change on victory. */
  rainbow?: boolean;
  path: [number, number][];
  departed_at: string;
  arrival_at: string | null;
  return_at: string | null;
  recalled_at?: string | null;
  eta_seconds: number | null;
  speed_tph: number | null;
  status: string;
  battle_id: string | null;
  loot: Partial<Resources> | null;
  result: string | null;
  player_id: string;
  hostile: boolean;
  intel: IntelDto | null;
  // logistics (Bible §13): caravans / interceptors share the march shape
  cargo?: Partial<Resources> | null;
  caravans_assigned?: number | null;
  capacity?: number | null;
  delivered?: Partial<Resources> | null;
  target_caravan_id?: string | null;
  caravan?: DetectedCaravan | null; // client-side: a detected foreign caravan rendered as a hostile marker
};

export type DetectedCaravan = { caravan_id: string; house_name: string | null; house_crest: CrestDto | null; position: [number, number]; heading: string | null; escorted: boolean; escort_band: [number, number] | null; cargo_band: [number, number] | null; arrival_at: string; remaining_path: [number, number][]; intel_score: number; distance: number; target_xy: [number, number] | null };
export type CaravanInfo = { unlocked: boolean; research_unlock_key: string; caravanserai_level: number; caravans_per_march: number; capacity_per_caravan: number; max_capacity: number; unescorted_speed_tph: number; max_outgoing: number; interception_unlocked: boolean; search_radius: number; destinations: { settlement_id: string; name: string; x: number; y: number; level: number }[]; resources: Resources };

export function useCaravanInfo(worldId?: string | null, sid?: string | null) {
  return useQuery<CaravanInfo>({ queryKey: ["caravan-info", worldId || "", sid || ""], queryFn: () => get(`/worlds/${worldId}/settlements/${sid}/caravans/info`), enabled: !!worldId && !!sid });
}

export function useCaravanSearch(worldId?: string | null, sid?: string | null) {
  return useQuery<{ radius: number; interception_unlocked: boolean; caravans: DetectedCaravan[] }>({ queryKey: ["caravan-search", worldId || "", sid || ""], queryFn: () => get(`/worlds/${worldId}/settlements/${sid}/caravans/search`), enabled: !!worldId && !!sid, refetchInterval: 30000 });
}

export function useCaravanMutations(worldId: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.marches(worldId) });
    qc.invalidateQueries({ queryKey: ["caravan-info"] });
    qc.invalidateQueries({ queryKey: ["caravan-search"] });
    qc.invalidateQueries({ queryKey: ["army"] });
    qc.invalidateQueries({ queryKey: qk.me(worldId) });
  };
  const send = useMutation({ mutationFn: (body: { origin_settlement_id: string; target_settlement_id: string; cargo: Record<string, number>; caravans_assigned: number; escort: Record<string, number>; idempotency_key: string }) => post<MarchDto>(`/worlds/${worldId}/caravans`, body), onSuccess: invalidate });
  const intercept = useMutation({ mutationFn: (body: { origin_settlement_id: string; caravan_id: string; units: Record<string, number>; idempotency_key: string }) => post<MarchDto>(`/worlds/${worldId}/caravans/intercept`, body), onSuccess: invalidate });
  return { send, intercept };
}

export type ChunkDto = {
  cx: number;
  cy: number;
  size: number;
  terrain_b64: string;
  settlements: SettlementPublic[];
  sentinels: SentinelDto[];
  territory: { x: number; y: number; faction: "OWN" | "ALLY" | "ENEMY" | "RESERVED" }[];
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
  owner_house_crest?: CrestDto | null;
  owner_alliance_tag?: string | null;
  skin?: string | null; // castle skin id (see src/map3d/castle.ts CASTLE_SKINS); null → default
  faction: "OWN" | "ALLY" | "ENEMY" | "NEUTRAL" | "RESERVED_SLOT";
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

/** Bible §14 Natural Boundary: a Sentinel slot on water / off the map — the sector is owned without a tower. */
export type NaturalSlotDto = { direction: string; ring: "INNER" | "OUTER"; x: number; y: number; off_map: boolean; eligible: boolean; tiles?: number };

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
  target_pyramid?: boolean;
  attacker_house_name?: string | null;
  attacker_alliance_tag?: string | null;
  defender_alliance_tag?: string | null;
  origin_settlement_id?: string | null;
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
  house: (w: string) => ["house", w] as const,
  battles: (w: string) => ["battles", w] as const,
  battle: (w: string, id: string) => ["battle", w, id] as const,
  inbox: (w: string) => ["inbox", w] as const,
  publicSettlement: (w: string, id: string) => ["public", w, id] as const,
  catalog: ["catalog"] as const,
};

export type GmRegion = { index: number; code: string; name: string; lang: string; mid_deg: number; half_deg: number; r_in: number; r_land: number; r_out: number; bbox: [number, number, number, number]; center: [number, number]; pyramid_anchor: [number, number] | null; player_slots: number; player_count: number; free: number; full: boolean; at_war: boolean };
export type GmWarConfig = { regions: string[] | null; speed_multiplier: number; opened_at?: string | null };
export type GrandeMondoDto = {
  phase: "ISOLATION" | "WAR";
  cycle: number;
  phase_since: string | null;
  phase_until: string | null;
  seconds_left: number | null;
  fog_up: boolean;
  my_fog_up: boolean;
  isolation_days: number;
  war_days: number;
  pyramid_hold_hours: number;
  regions: GmRegion[];
  center: { x: number; y: number; radius: number; pyramid_anchor: [number, number] } | null;
  war: GmWarConfig | null;
  next_war: GmWarConfig;
  speed_multipliers: number[];
  my_region: string | null;
  view_all: boolean;
  is_admin: boolean;
  pyramids?: PyramidSummary[];
  grand_pyramid?: PyramidSummary | null;
  my_pyramid?: PyramidSummary | null;
  regional_first_open_day?: number | null;
  regional_overrides?: Record<string, Record<string, any>>;
  grand_wins?: { cycle_id: number; gm_cycle: number; alliance_id: string; tag: string; name: string; region_code: string | null; at: string | null; reward_until: string | null }[];
};

export function useGrandeMondoAdmin(worldId: string) {
  const qc = useQueryClient();
  const done = () => {
    qc.invalidateQueries({ queryKey: ["grande-mondo", worldId] });
    qc.invalidateQueries({ queryKey: qk.me(worldId) });
    qc.invalidateQueries({ queryKey: qk.worlds });
    qc.invalidateQueries({ queryKey: ["pyramid", worldId] });
    qc.invalidateQueries({ queryKey: ["pyramids", worldId] });
  };
  const warConfig = useMutation({ mutationFn: (body: { regions: string[] | null; speed_multiplier: number }) => post<GrandeMondoDto>(`/worlds/${worldId}/grande-mondo/admin/war-config`, body), onSuccess: done });
  const phase = useMutation({ mutationFn: (to: "WAR" | "ISOLATION") => post<GrandeMondoDto>(`/worlds/${worldId}/grande-mondo/admin/phase`, { to }), onSuccess: done });
  const grandPyramid = useMutation({ mutationFn: (action: "OPEN" | "CLOSE") => post<GrandeMondoDto>(`/worlds/${worldId}/grande-mondo/admin/grand-pyramid`, { action }), onSuccess: done });
  const regionalPyramidConfig = useMutation({ mutationFn: (body: { region: string | null; config: Record<string, any> }) => post<GrandeMondoDto>(`/worlds/${worldId}/grande-mondo/admin/regional-pyramid-config`, body), onSuccess: done });
  return { warConfig, phase, grandPyramid, regionalPyramidConfig };
}
export type InactivityRule = { phase: "EARLY" | "MATURE"; timeout_days: number; mode: "REMOVE" | "NEUTRAL"; early_phase_until: string; early_phase_days: number; early_timeout_days: number; timeout_days_after: number };
export type WorldDto = { world_id: string; name: string; kind: "REALM" | "GRANDE_MONDO"; status: string; size: number; player_count: number; player_slots: number; age_days: number; spec_version: string; spec_hash: string; inactivity: InactivityRule | null; grande_mondo: GrandeMondoDto | null; joined?: boolean; house_name?: string | null; house_crest?: any };

export type TeleportCandidate = { slot_id: string; x: number; y: number; terrain: string | null; landmass: string | null; port_eligible: boolean; distance_from_mother: number };
export type TeleportCandidatesDto = { settlement_id: string; from: [number, number]; region_code: string; mother: [number, number]; price_rubies: number; rubies: number; needs_port: boolean; blocked: string | null; candidates: TeleportCandidate[]; total: number };
export type TeleportResult = { settlement_id: string; from: [number, number]; to: [number, number]; x: number; y: number; price_rubies: number; rubies: number; replayed: boolean };

export function useTeleportCandidates(worldId?: string | null, sid?: string | null, enabled = true) {
  return useQuery<TeleportCandidatesDto>({ queryKey: ["teleport", worldId || "", sid || ""], queryFn: () => get(`/worlds/${worldId}/settlements/${sid}/teleport`), enabled: !!worldId && !!sid && enabled });
}

export function useTeleportMutation(worldId: string, sid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slot_id: string) => post<TeleportResult>(`/worlds/${worldId}/settlements/${sid}/teleport`, { slot_id, idempotency_key: idem() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.me(worldId) });
      qc.invalidateQueries({ queryKey: ["settlement"] });
      qc.invalidateQueries({ queryKey: ["teleport"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: qk.sentinels(worldId, sid) });
    },
  });
}

export function useGrandeMondo(worldId?: string | null, enabled = true) {
  return useQuery<GrandeMondoDto & { server_time: string }>({ queryKey: ["grande-mondo", worldId || ""], queryFn: () => get(`/worlds/${worldId}/grande-mondo`).then(sync), enabled: !!worldId && enabled, refetchInterval: 30000 });
}

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
  return useQuery<{ sentinels: SentinelDto[]; natural: NaturalSlotDto[]; outer_unlocked: boolean; garrison_cap: number; command_level: number }>({
    queryKey: qk.sentinels(worldId || "", sid || ""),
    queryFn: () => get(`/worlds/${worldId}/settlements/${sid}/sentinels`),
    enabled: !!worldId && !!sid,
    refetchInterval: 15000,
  });
}

export function useMarches(worldId?: string | null) {
  return useQuery<{ marches: MarchDto[]; incoming: MarchDto[]; server_time: string }>({ queryKey: qk.marches(worldId || ""), queryFn: () => get(`/worlds/${worldId}/marches`).then(sync), enabled: !!worldId, refetchInterval: 10000 });
}

export function useHouse(worldId?: string | null) {
  return useQuery<{ house: HouseDto; catalog: CrestCatalog; march_skin_unlocks: Record<MarchSkin, boolean> }>({ queryKey: qk.house(worldId || ""), queryFn: () => get(`/worlds/${worldId}/house`), enabled: !!worldId });
}

export function useHouseMutations(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { motto?: string | null; crest?: CrestDto; description?: string | null; march_skin?: MarchSkin }) => put<{ house: HouseDto }>(`/worlds/${worldId}/house`, body),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.house(worldId) });
      qc.invalidateQueries({ queryKey: qk.me(worldId) });
      qc.invalidateQueries({ queryKey: qk.marches(worldId) });
    },
  });
}

/** Intro cinematic watched/skipped once for this Player/World (spec.cinematics.intro): optimistic on /me. */
export function useIntroSeen(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post<{ intro_seen: boolean }>(`/worlds/${worldId}/intro/seen`, {}),
    onMutate: () => {
      qc.setQueryData(qk.me(worldId), (d: any) => (d?.player ? { ...d, player: { ...d.player, intro_seen: true } } : d));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.me(worldId) }),
  });
}

/** First-login guided tour finished or skipped once for this Player/World: optimistic on /me. */
export function useTourSeen(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post<{ tour_seen: boolean }>(`/worlds/${worldId}/tour/seen`, {}),
    onMutate: () => {
      qc.setQueryData(qk.me(worldId), (d: any) => (d?.player ? { ...d, player: { ...d.player, tour_seen: true } } : d));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.me(worldId) }),
  });
}

export function useBattles(worldId?: string | null) {
  return useQuery<{ battles: BattleDto[] }>({ queryKey: qk.battles(worldId || ""), queryFn: () => get(`/worlds/${worldId}/battles`), enabled: !!worldId, refetchInterval: 20000 });
}

export function useBattle(worldId?: string | null, id?: string | null) {
  return useQuery<BattleDto>({ queryKey: qk.battle(worldId || "", id || ""), queryFn: () => get(`/worlds/${worldId}/battles/${id}`), enabled: !!worldId && !!id });
}

export function useInbox(worldId?: string | null) {
  return useQuery<{ items: InboxItem[]; unread: number; server_time: string }>({ queryKey: qk.inbox(worldId || ""), queryFn: () => get(`/worlds/${worldId}/inbox?limit=200`).then(sync), enabled: !!worldId, refetchInterval: 10000 });
}

export function usePublicSettlement(worldId?: string | null, id?: string | null) {
  return useQuery<SettlementPublic>({ queryKey: qk.publicSettlement(worldId || "", id || ""), queryFn: () => get(`/worlds/${worldId}/settlements/${id}/public`), enabled: !!worldId && !!id });
}

export type SkinCatalog = { current: string; level: number; skins: { id: string; min_level: number; unlocked: boolean }[] };

export function useSettlementSkins(worldId?: string | null, sid?: string | null) {
  return useQuery<SkinCatalog>({ queryKey: ["skins", worldId || "", sid || ""], queryFn: () => get(`/worlds/${worldId}/settlements/${sid}/skins`), enabled: !!worldId && !!sid });
}

export function useSetSkin(worldId: string, sid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (skin: string) => put<SkinCatalog>(`/worlds/${worldId}/settlements/${sid}/skin`, { skin }),
    onSuccess: (data) => qc.setQueryData(["skins", worldId, sid], data),
  });
}

// ---------------------------------------------------------------------------------------------- missions / progress
export type MissionCatalogEntry = { key: string; name: string; kind: string; duration_hours: number; requirements: Record<string, any>; reward: Record<string, any>; cooldown_hours: number; cooldown_until: string | null; active_mission_id: string | null };
export type MissionDto = { mission_id: string; key: string; name: string; origin_settlement_id: string; origin_xy: [number, number] | null; units: Record<string, number>; status: "ACTIVE" | "COMPLETED"; started_at: string | null; ends_at: string | null; completed_at: string | null; reward_result: Record<string, any> | null };
export type ProgressTrack = { track: string; value: number; tier: number; thresholds: number[]; next_threshold: number | null; decoration: string };
export type ProgressDto = { prestige: number; titles: string[]; cosmetics: string[]; tracks: ProgressTrack[]; history: { at: string; kind: string; reason?: string; points?: number; track?: string; tier?: number; decoration?: string; cycle_id?: number; alliance?: string; from?: string; to?: string }[] };
export type MissionsOverview = { catalog: MissionCatalogEntry[]; active: MissionDto[]; slots_left: number; max_simultaneous: number; history: MissionDto[]; progress: ProgressDto; server_time: string };
export type ChronicleEntry = { chronicle_id: string; kind: string; params: Record<string, any>; actors: string[]; at: string };

export function useMissions(worldId?: string | null) {
  return useQuery<MissionsOverview>({ queryKey: ["missions", worldId || ""], queryFn: () => get(`/worlds/${worldId}/missions`), enabled: !!worldId, refetchInterval: 15000 });
}

export function useStartMission(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { key: string; origin_settlement_id: string; units: Record<string, number>; idempotency_key: string }) => post<MissionDto>(`/worlds/${worldId}/missions`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["missions", worldId] });
      qc.invalidateQueries({ queryKey: ["army"] });
      qc.invalidateQueries({ queryKey: qk.me(worldId) });
    },
  });
}

export function useChronicle(worldId?: string | null) {
  return useQuery<{ entries: ChronicleEntry[]; house_names: Record<string, string>; records: Record<string, any> }>({ queryKey: ["chronicle", worldId || ""], queryFn: () => get(`/worlds/${worldId}/chronicle`), enabled: !!worldId, staleTime: 30000 });
}

/** Last battles involving a settlement (as target or as origin of the viewer's marches). */
export function useSettlementBattles(worldId?: string | null, sid?: string | null, limit = 5) {
  return useQuery<{ battles: BattleDto[] }>({ queryKey: ["settlement-battles", worldId || "", sid || "", limit], queryFn: () => get(`/worlds/${worldId}/settlements/${sid}/battles?limit=${limit}`), enabled: !!worldId && !!sid, staleTime: 15000 });
}

export function useCatalog() {
  return useQuery({ queryKey: qk.catalog, queryFn: () => get("/spec/catalog"), staleTime: Infinity });
}

export function idem() {
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
  const buildSentinel = useMutation({ mutationFn: (slot: { direction: string; ring: "INNER" | "OUTER" }) => post(`/worlds/${worldId}/settlements/${sid}/sentinels`, { direction: slot.direction, ring: slot.ring, idempotency_key: idem() }), onSettled: invalidate });
  return { upgradeBuilding, upgradeSettlement, cancelJob, startResearch, recruit, buildSentinel, invalidate };
}

export function useMarchMutations(worldId: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.marches(worldId) });
    qc.invalidateQueries({ queryKey: ["settlement", worldId] });
    qc.invalidateQueries({ queryKey: ["army", worldId] });
    qc.invalidateQueries({ queryKey: qk.inbox(worldId) });
    qc.invalidateQueries({ queryKey: ["pyramid", worldId] });
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

// ---------------------------------------------------------------------------------------------- alliances (Bible §19 / §40)
export type AllianceKind = "STRUCTURED" | "MERCENARY";
export type AllianceRole = "LEADER" | "VICE" | "DIPLOMAT" | "MEMBER";
export type AlliancePublic = { alliance_id: string; name: string; tag: string; kind: AllianceKind; description: string; member_count: number; cap: number; leader_house: string | null; mercenary_prestige: number; contracts_completed: number; created_at: string; relation?: string | null; members?: { house_name: string; role: AllianceRole }[] };
export type AllianceMember = { player_id: string; house_name: string; house_crest: CrestDto | null; role: AllianceRole; joined_at: string; leaving_at: string | null; is_me: boolean };
export type RelationDto = { relation_id: string; alliance_id: string | null; name: string | null; tag: string | null; kind: AllianceKind | null; state: "NEUTRAL" | "PNA" | "PNA_NOTICE" | "WAR" | "PEACE_PENDING"; since: string | null; until: string | null; war_reason: string | null; locked_by_contract_id: string | null; pna_proposal: { by: string; by_name: string | null; mine: boolean; at: string } | null; peace_proposal: { by: string; by_name: string | null; mine: boolean; expires_at: string } | null };
export type VoteDto = { vote_id: string; target_alliance_id: string; target_name: string | null; target_tag: string | null; proposed_by_house: string | null; opened_at: string; closes_at: string; eligible: number; needed: number; yes: number; no: number; votes: Record<string, boolean>; status: "OPEN" | "PASSED" | "FAILED" };
export type InviteDto = { invite_id: string; alliance_id: string; alliance_name: string | null; alliance_tag: string | null; alliance_kind: AllianceKind | null; player_id: string; house_name: string | null; sender_house: string | null; role: AllianceRole; status: string; expires_at: string };
export type AllianceFull = Omit<AlliancePublic, "members"> & { my_role: AllianceRole | null; permissions: string[]; members: AllianceMember[]; emeralds: number | null; relations: RelationDto[]; open_votes: VoteDto[]; pending_invites: InviteDto[]; contracts_active: number; at_war: boolean; pyramid_eligible: boolean; war_vote_roles: AllianceRole[]; server_time: string };
export type MyAllianceDto = { alliance: AllianceFull | null; invites: InviteDto[]; join_cooldown_until: string | null; server_time: string };
export type ChatMessage = { message_id: string; player_id: string | null; house_name: string | null; role: AllianceRole | "SYSTEM"; text: string; at: string };
export type ContractDto = { contract_id: string; client_alliance_id: string; client_name: string | null; client_tag: string | null; target_alliance_id: string; target_name: string | null; target_tag: string | null; provider_alliance_id: string | null; provider_name: string | null; provider_tag: string | null; directed_to?: string | null; directed_to_name?: string | null; directed_to_tag?: string | null; emeralds: number; duration_hours: number; status: "OFFERED" | "ACTIVE" | "COMPLETED" | "FAILED" | "CANCELLED"; result: string | null; offered_at: string | null; accepted_at: string | null; ends_at: string | null; ended_at: string | null };
export type MarketDto = { offers: ContractDto[]; contracts: ContractDto[]; durations_hours: number[]; escrow_min: number; escrow_max: number; max_active: number; bonuses: { single_march_capacity_pct: number; attack_pct: number } };
export type TreasuryDto = { emeralds: number; entries: { ledger_id: string; amount: number; reason: string; ref: string | null; balance_after: number; at: string }[] };
export type DiplomacyAction = "pna_propose" | "pna_accept" | "pna_decline" | "pna_terminate" | "war_propose" | "peace_propose" | "peace_accept";

export function useMyAlliance(worldId?: string | null) {
  return useQuery<MyAllianceDto>({ queryKey: ["alliance", worldId], queryFn: () => get(`/worlds/${worldId}/alliance`).then(sync), enabled: !!worldId, refetchInterval: 15000 });
}
export function useAlliances(worldId?: string | null) {
  return useQuery<{ alliances: AlliancePublic[]; caps: Record<string, number> }>({ queryKey: ["alliances", worldId], queryFn: () => get(`/worlds/${worldId}/alliances`), enabled: !!worldId });
}
export function useAlliancePublic(worldId?: string | null, id?: string | null) {
  return useQuery<AlliancePublic>({ queryKey: ["alliance-public", worldId, id], queryFn: () => get(`/worlds/${worldId}/alliances/${id}`), enabled: !!worldId && !!id });
}
export function useAllianceChat(worldId?: string | null, enabled = true) {
  return useQuery<{ messages: ChatMessage[] }>({ queryKey: ["alliance-chat", worldId], queryFn: () => get(`/worlds/${worldId}/alliance/chat?limit=100`), enabled: !!worldId && enabled, refetchInterval: 5000 });
}
// ---- realm chat (world / negotiations) + mercenary hire directory ----
export type RealmChatMessage = { message_id: string; channel: string; player_id: string | null; house_name: string | null; alliance_tag: string | null; alliance_id: string | null; role: AllianceRole | null; text: string; at: string };
export type NegoRoom = { channel: string; alliance_id: string; name: string | null; tag: string | null; kind: AllianceKind | null; last: RealmChatMessage };
export type ChatSummary = { world: { channel: string; last: RealmChatMessage | null }; alliance: { channel: string; last: ChatMessage | null } | null; negotiations: NegoRoom[] };
export type MercenaryEntry = AlliancePublic & { active_contracts: number; max_active: number; contracts_failed: number; available: boolean };

export function useChatSummary(worldId?: string | null) {
  return useQuery<ChatSummary>({ queryKey: ["chat-summary", worldId], queryFn: () => get(`/worlds/${worldId}/chat/summary`), enabled: !!worldId, refetchInterval: 8000 });
}
export function useWorldChat(worldId?: string | null, enabled = true) {
  return useQuery<{ messages: RealmChatMessage[] }>({ queryKey: ["world-chat", worldId], queryFn: () => get(`/worlds/${worldId}/chat/world?limit=100`), enabled: !!worldId && enabled, refetchInterval: 5000 });
}
export function useNegotiation(worldId?: string | null, allianceId?: string | null) {
  return useQuery<{ channel: string; alliance: AlliancePublic; messages: RealmChatMessage[] }>({ queryKey: ["nego-chat", worldId, allianceId], queryFn: () => get(`/worlds/${worldId}/chat/negotiations/${allianceId}?limit=100`), enabled: !!worldId && !!allianceId, refetchInterval: 5000 });
}
export function useMercenaryDirectory(worldId?: string | null, enabled = true) {
  return useQuery<{ mercenaries: MercenaryEntry[] }>({ queryKey: ["mercenaries", worldId], queryFn: () => get(`/worlds/${worldId}/mercenaries`), enabled: !!worldId && enabled, refetchInterval: 30000 });
}
export function useRealmChatMutations(worldId: string) {
  const qc = useQueryClient();
  const w = `/worlds/${worldId}`;
  return {
    world: useMutation({ mutationFn: (text: string) => post<RealmChatMessage>(`${w}/chat/world`, { text }), onSuccess: () => qc.invalidateQueries({ queryKey: ["world-chat"] }) }),
    nego: useMutation({ mutationFn: (v: { allianceId: string; text: string }) => post<RealmChatMessage>(`${w}/chat/negotiations/${v.allianceId}`, { text: v.text }), onSuccess: () => qc.invalidateQueries({ queryKey: ["nego-chat"] }) }),
  };
}

export function useAllianceTreasury(worldId?: string | null, enabled = true) {
  return useQuery<TreasuryDto>({ queryKey: ["alliance-treasury", worldId], queryFn: () => get(`/worlds/${worldId}/alliance/treasury`), enabled: !!worldId && enabled });
}
export function useMercenaryMarket(worldId?: string | null, enabled = true) {
  return useQuery<MarketDto>({ queryKey: ["alliance-market", worldId], queryFn: () => get(`/worlds/${worldId}/alliance/mercenary`), enabled: !!worldId && enabled, refetchInterval: 20000 });
}

export function useAllianceMutations(worldId: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    for (const k of ["alliance", "alliances", "alliance-public", "alliance-chat", "alliance-treasury", "alliance-market"]) qc.invalidateQueries({ queryKey: [k] });
    qc.invalidateQueries({ queryKey: qk.me(worldId) });
    qc.invalidateQueries({ queryKey: qk.inbox(worldId) });
  };
  const w = `/worlds/${worldId}`;
  return {
    create: useMutation({ mutationFn: (body: { name: string; tag: string; kind: AllianceKind; description?: string | null }) => post<AllianceFull>(`${w}/alliances`, body), onSuccess: invalidate }),
    invite: useMutation({ mutationFn: (body: { house_name: string; role: AllianceRole }) => post<InviteDto>(`${w}/alliance/invites`, body), onSuccess: invalidate }),
    respond: useMutation({ mutationFn: (v: { invite_id: string; accept: boolean }) => post(`${w}/alliance/invites/${v.invite_id}/respond`, { accept: v.accept }), onSuccess: invalidate }),
    leave: useMutation({ mutationFn: () => post(`${w}/alliance/leave`), onSuccess: invalidate }),
    cancelLeave: useMutation({ mutationFn: () => post(`${w}/alliance/leave/cancel`), onSuccess: invalidate }),
    setRole: useMutation({ mutationFn: (v: { player_id: string; role: AllianceRole }) => post(`${w}/alliance/members/${v.player_id}/role`, { role: v.role }), onSuccess: invalidate }),
    kick: useMutation({ mutationFn: (player_id: string) => api(`${w}/alliance/members/${player_id}`, { method: "DELETE" }), onSuccess: invalidate }),
    settings: useMutation({ mutationFn: (body: { description?: string; name?: string }) => put(`${w}/alliance/settings`, body), onSuccess: invalidate }),
    dissolve: useMutation({ mutationFn: () => post(`${w}/alliance/dissolve`), onSuccess: invalidate }),
    diplomacy: useMutation({ mutationFn: (v: { other_id: string; action: DiplomacyAction }) => post<RelationDto | VoteDto>(`${w}/alliance/diplomacy/${v.other_id}/${v.action}`), onSuccess: invalidate }),
    vote: useMutation({ mutationFn: (v: { vote_id: string; yes: boolean }) => post<VoteDto>(`${w}/alliance/votes/${v.vote_id}`, { yes: v.yes }), onSuccess: invalidate }),
    chat: useMutation({ mutationFn: (text: string) => post<ChatMessage>(`${w}/alliance/chat`, { text }), onSuccess: () => qc.invalidateQueries({ queryKey: ["alliance-chat"] }) }),
    offer: useMutation({ mutationFn: (body: { target_alliance_id: string; emeralds: number; duration_hours: number; provider_alliance_id?: string | null }) => post<ContractDto>(`${w}/alliance/mercenary/offers`, body), onSuccess: invalidate }),
    acceptOffer: useMutation({ mutationFn: (contract_id: string) => post<ContractDto>(`${w}/alliance/mercenary/offers/${contract_id}/accept`), onSuccess: invalidate }),
    withdrawOffer: useMutation({ mutationFn: (contract_id: string) => post<ContractDto>(`${w}/alliance/mercenary/offers/${contract_id}/withdraw`), onSuccess: invalidate }),
  };
}


// ---------------------------------------------------------------------------------------------- pyramid (Bible §21)
export type PyramidState = "DORMANT_INITIAL" | "OPEN" | "REWARD_LOCK" | "DORMANT";
export type PyramidKind = "CLASSIC" | "GRAND" | "REGIONAL";
export type PyramidBattle = { battle_id: string; at: string; attacker_house_name: string | null; attacker_alliance_tag: string | null; defender_alliance_tag: string | null; winner: "ATTACKER" | "DEFENDER" | null; captured: boolean; attacker_losses: number; defender_losses: number; mine: boolean };
export type PyramidHistoryEntry = { cycle_id: number; alliance_id: string; tag: string; name: string; region_code: string | null; member_count: number; won_at: string | null; reward_until: string | null };
export type PyramidReward = { production_pct: number; research_pct: number; training_pct: number; caravan_capacity_pct: number; until: string | null; cycle_id: number | null; tag: string | null };
export type PyramidOwner = { alliance_id: string; tag: string | null; name: string | null; region_code: string | null };
/** Compact per-instance view (GET /pyramids): monument anchors for the map, state and owner. */
export type PyramidSummary = {
  id: string;
  kind: PyramidKind;
  region_code: string | null;
  name: string;
  anchor: [number, number];
  footprint: [number, number];
  state: PyramidState;
  cycle_id: number;
  faction: "OWN" | "ENEMY" | "NEUTRAL";
  owner: PyramidOwner | null;
  deadline: string | null;
  hold_deadline: string | null;
  garrison_total: number;
  manual_open: boolean;
  winner: { tag: string | null; region_code: string | null; reward_until: string | null } | null;
  mine: boolean;
};
export type PyramidDto = {
  id: string;
  world_id: string;
  kind: PyramidKind;
  region_code: string | null;
  name: string;
  anchor: [number, number];
  footprint: [number, number];
  state: PyramidState;
  cycle_id: number;
  state_since: string | null;
  deadline: string | null;
  opens_at: string | null;
  lock_until: string | null;
  dormant_until: string | null;
  owner: PyramidOwner | null;
  faction: "OWN" | "ENEMY" | "NEUTRAL";
  hold: { started_at: string | null; deadline: string | null; hours: number; progress: number } | null;
  garrison_total: number;
  garrison: Record<string, number> | null;
  garrison_cap: number;
  guardian: { target_power: number | null; unit_count: number | null; sample_size: number | null } | null;
  participants: number;
  winner: { cycle_id: number; alliance_id: string; tag: string; name: string; region_code: string | null; member_count: number; won_at: string | null; reward_until: string | null } | null;
  history: PyramidHistoryEntry[];
  recent_battles: PyramidBattle[];
  incoming: { march_id: string; attacker_alliance_tag: string | null; arrival_at: string | null }[];
  me: { alliance_id: string | null; alliance_kind: AllianceKind | null; eligible: boolean; in_region: boolean; is_owner: boolean; can_attack: boolean; can_reinforce: boolean; participated: boolean; my_garrison: Record<string, number>; reward: PyramidReward | null };
  config: { first_open_day: number; manual_open: boolean; reward_scope: "ALLIANCE" | "REGION"; hold_hours: number; reward_days: number; dormant_days: number; garrison_cap_units: number; reward: Record<string, number>; emeralds: { participation: number; victory: number }; prestige: { participation: number; victory: number }; title: string };
  server_time: string;
};

/** One Pyramid: `id` = "<world>" (classic / Grande Piramide) or "<world>:<REG>" (Piccola Piramide); default = the viewer's own. */
export function usePyramid(worldId?: string | null, id?: string | null) {
  return useQuery<PyramidDto>({ queryKey: ["pyramid", worldId, id ?? "mine"], queryFn: () => get(`/worlds/${worldId}/pyramid${id ? `?id=${encodeURIComponent(id)}` : ""}`).then(sync), enabled: !!worldId, refetchInterval: 15000 });
}

/** Every Pyramid of the realm (Grande Piramide + Piccole Piramidi) — monuments on the map. */
export function usePyramids(worldId?: string | null) {
  return useQuery<{ pyramids: PyramidSummary[]; server_time: string }>({ queryKey: ["pyramids", worldId], queryFn: () => get(`/worlds/${worldId}/pyramids`).then(sync), enabled: !!worldId, refetchInterval: 20000 });
}

// ---------------------------------------------------------------------------------------------- premium / rubies (Bible §23)
export type RubyTx = { transaction_id: string; kind: string; amount: number; balance_after: number; effect: Record<string, any> | null; world_id: string | null; at: string };
export type WalletDto = { rubies: number; store: { status: string; products: unknown[]; channels: string[] }; cosmetics: { version: string; items: Record<string, { price_rubies: number; label: string }> }; transactions: RubyTx[]; server_time: string };
export type FinishQuote = { job_id: string; kind: string; target: string | null; allowed: boolean; reason: string | null; rubies: number; price_rubies?: number; remaining_minutes?: number; rule?: string; affordable?: boolean; lock?: { reason: string; arrival_at?: string } };
export type SpecializationDto = { current: "ATTACKER" | "DEFENDER" | null; choices: Record<string, { bonus_pct: number; effect: string }>; available: boolean; required_settlements: number; settlement_count: number; price_rubies: number; cooldown_until: string | null; blocked: string[]; rubies: number };

export const FINISH_RATES: Record<string, { min: number; perMinute: number }> = {
  BUILDING: { min: 100, perMinute: 3.0 },
  SETTLEMENT_UPGRADE: { min: 100, perMinute: 3.0 },
  RESEARCH: { min: 150, perMinute: 4.0 },
  RECRUIT: { min: 100, perMinute: 2.5 },
};

export function useWallet(enabled = true) {
  return useQuery<WalletDto>({ queryKey: ["wallet"], queryFn: () => get("/wallet"), enabled, refetchInterval: 30000 });
}
export function useSpecialization(worldId?: string | null) {
  return useQuery<SpecializationDto>({ queryKey: ["specialization", worldId], queryFn: () => get(`/worlds/${worldId}/specialization`), enabled: !!worldId });
}
// ---- daily login reward (resources only) ----
export type DailyReward = { day: number; kind: "RESOURCES" | "CHEST"; mult: number; resources: Partial<Resources> };
export type DailyStatus = { day: number; claimable: boolean; streak: number; next_reset_at: string; rewards: DailyReward[]; capital_settlement_id: string | null };
export type DailyGrant = { day: number; kind: DailyReward["kind"]; mult: number; resources: Partial<Resources> | null; discarded: Partial<Resources> | null };
export function useDaily(worldId?: string | null) {
  return useQuery<DailyStatus>({ queryKey: ["daily", worldId], queryFn: () => get(`/worlds/${worldId}/daily`), enabled: !!worldId, refetchInterval: 60000 });
}
export function useDailyMutations(worldId: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["daily"] });
    qc.invalidateQueries({ queryKey: ["settlement"] });
    qc.invalidateQueries({ queryKey: qk.me(worldId) });
  };
  return {
    claim: useMutation({ mutationFn: () => post<{ granted: DailyGrant; status: DailyStatus }>(`/worlds/${worldId}/daily/claim`, {}), onSettled: invalidate }),
  };
}

export function usePremiumMutations(worldId: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["wallet"] });
    qc.invalidateQueries({ queryKey: ["specialization"] });
    qc.invalidateQueries({ queryKey: qk.me(worldId) });
    qc.invalidateQueries({ queryKey: ["settlement"] });
    qc.invalidateQueries({ queryKey: ["army"] });
    qc.invalidateQueries({ queryKey: ["research"] });
    qc.invalidateQueries({ queryKey: qk.house(worldId) });
    qc.invalidateQueries({ queryKey: ["alliance"] });
  };
  return {
    finish: useMutation({ mutationFn: (job_id: string) => post<{ job: JobDto; price_rubies: number; rubies: number; replayed: boolean }>(`/worlds/${worldId}/jobs/${job_id}/finish`, { idempotency_key: idem() }), onSuccess: invalidate }),
    rename: useMutation({ mutationFn: (house_name: string) => post<{ house: HouseDto; price_rubies: number; rubies: number }>(`/worlds/${worldId}/house/rename`, { house_name, idempotency_key: idem() }), onSuccess: invalidate }),
    specialize: useMutation({ mutationFn: (choice: string) => post<SpecializationDto>(`/worlds/${worldId}/specialization`, { choice, idempotency_key: idem() }), onSuccess: invalidate }),
  };
}

/** «Riepilogo rientro»: digest of the absence window armed by the server (players.return_since). */
export type ReturnSummaryDto = {
  since: string;
  until: string;
  hours_away: number;
  battles: { total: number; won: number; lost: number; as_attacker: number; as_defender: number; castles_won: { settlement_id: string; name: string | null; xy: number[] | null; battle_id: string }[]; castles_lost: { settlement_id: string; name: string | null; xy: number[] | null; battle_id: string }[]; recent: { battle_id: string; mission: string; attacker: boolean; won: boolean; target_name: string | null; at: string | null }[] };
  jobs: { done: Record<string, { target: string; level: number | null; count: number | null; settlement_id: string }[]>; counts: Record<string, number> };
  marches: { completed: number; results: Record<string, number>; active: number; incoming_hostile: number };
  missions_completed: number;
  alerts: { event: string; severity: string; payload: any; deep_link: string | null; at: string | null }[];
  unread: number;
  resources_produced: Resources;
  settlements: number;
  prestige: number;
  pending: boolean;
};

export function useReturnSummary(worldId?: string | null, enabled = true) {
  return useQuery({ queryKey: ["return-summary", worldId], queryFn: () => get<ReturnSummaryDto>(`/worlds/${worldId}/return-summary`), enabled: !!worldId && enabled, staleTime: 60_000, retry: false });
}

export function useReturnSeen(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post<{ return_pending: boolean }>(`/worlds/${worldId}/return-summary/seen`, {}),
    onMutate: () => {
      qc.setQueryData(qk.me(worldId), (d: any) => (d?.player ? { ...d, player: { ...d.player, return_pending: false } } : d));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.me(worldId) }),
  });
}
