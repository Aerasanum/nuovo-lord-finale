/**
 * The first six things to do in a realm.
 *
 * The guided tour says where the screens are; it does not say what to do, and this game asks a lot of a new Lord
 * before anything happens: five resource buildings, a settlement upgrade with its own requirements, a research
 * tree, missions, alliances. A checklist is the cheapest honest answer — not new rules, not new rewards, just a
 * reading of state the client already has, so it can never disagree with the server about what is done.
 *
 * A step counts as done the moment the work is *ordered*, not when it finishes. An upgrade takes hours; a box that
 * stays empty after the player did the thing reads as a bug, and the next advice would arrive hours late.
 */
import type { Href } from "expo-router";

import type { JobDto, SettlementDto } from "@/src/api/hooks";
import type { IconName } from "@/src/components/ui";
import type { PushState } from "@/src/push/push";

export type FirstStepId = "resource" | "castle" | "research" | "mission" | "alliance" | "push";

/** spec.player_bootstrap prebuilds all five at level 1, so "upgrade one" is a real step and not already done. */
export const RESOURCE_BUILDINGS = ["Fattoria", "Boscaiolo", "Cava d'Argilla", "Miniera di Ferro", "Miniera d'Oro"];

export type FirstStep = { id: FirstStepId; icon: IconName; done: boolean; href: Href | null };

export type FirstStepsInput = {
  settlement?: SettlementDto | null;
  alliance?: unknown;
  missions?: { active?: unknown[]; history?: unknown[] } | null;
  /** null while the device is still being asked; "unavailable" drops the step rather than showing one nobody can do. */
  push?: PushState | null;
};

const queued = (jobs: JobDto[] | undefined, kind: JobDto["kind"], target?: (name: string) => boolean): boolean =>
  (jobs ?? []).some((j) => j.kind === kind && (!target || target(j.target)));

export function firstSteps(input: FirstStepsInput): FirstStep[] {
  const s = input.settlement;
  const buildings = s?.buildings ?? {};
  const research = s?.research ?? {};
  const jobs = s?.jobs;

  const steps: FirstStep[] = [
    {
      id: "resource",
      icon: "barley",
      done: RESOURCE_BUILDINGS.some((name) => (buildings[name] ?? 0) >= 2) || queued(jobs, "BUILDING", (t) => RESOURCE_BUILDINGS.includes(t)),
      href: "/(tabs)/settlement",
    },
    {
      id: "castle",
      icon: "castle",
      done: (s?.level ?? 1) >= 2 || !!s?.settlement_upgrade?.job || queued(jobs, "SETTLEMENT_UPGRADE"),
      href: "/(tabs)/settlement",
    },
    {
      id: "research",
      icon: "flask",
      done: Object.values(research).some((level) => (level ?? 0) >= 1) || queued(jobs, "RESEARCH"),
      href: "/research",
    },
    {
      id: "mission",
      icon: "compass-outline",
      // The panel lives on the missions screen, so this step has nowhere to send anyone.
      done: (input.missions?.active?.length ?? 0) > 0 || (input.missions?.history?.length ?? 0) > 0,
      href: null,
    },
    { id: "alliance", icon: "shield-half-full", done: !!input.alliance, href: "/(tabs)/alliance" },
  ];

  // Not on the web, and not in a build with no EAS project: a step nobody can complete is not advice.
  if (input.push && input.push !== "unavailable") {
    steps.push({ id: "push", icon: "bell-ring-outline", done: input.push === "on", href: "/settings" });
  }
  return steps;
}

export const allDone = (steps: FirstStep[]): boolean => steps.every((step) => step.done);
