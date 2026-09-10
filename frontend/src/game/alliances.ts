/** Presentation helpers for alliances (Bible §19 / §40) — pure functions. */
import type { AllianceKind, AllianceRole, ContractDto, RelationDto } from "@/src/api/hooks";
import type { StringKey } from "@/src/i18n";

type Tr = (k: StringKey) => string;

export function roleLabel(t: Tr, role: AllianceRole | "SYSTEM" | null | undefined): string {
  if (!role) return "";
  return t(`role${role}` as StringKey);
}

export function kindLabel(t: Tr, kind: AllianceKind | null | undefined): string {
  return kind === "MERCENARY" ? t("kindMercenary") : t("kindStructured");
}

export function relationLabel(t: Tr, state: RelationDto["state"] | string): string {
  return t(`rel${state}` as StringKey);
}

export function contractStatusLabel(t: Tr, status: ContractDto["status"]): string {
  return t(`contract${status}` as StringKey);
}

export function diplomacyStateLabel(t: Tr, state: string): string {
  const k = `dipState_${state}` as StringKey;
  const v = t(k);
  return v === k ? state : v;
}

export const ROLE_ORDER: AllianceRole[] = ["LEADER", "VICE", "DIPLOMAT", "MEMBER"];
