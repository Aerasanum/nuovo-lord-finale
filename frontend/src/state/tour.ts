/**
 * First-login guided tour — tiny external store (module-level, survives tab remounts) shared by the overlay, the
 * gate, the settings "replay" button and the screens that register spotlight targets (`useTourTarget`).
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { View } from "react-native";

export type TourRect = { x: number; y: number; width: number; height: number };
export type TourStepId = "map" | "city" | "missions" | "pyramid";
export const TOUR_STEPS: { id: TourStepId; target: string }[] = [
  { id: "map", target: "tab-map" },
  { id: "city", target: "tab-settlement" },
  { id: "missions", target: "tab-missions" },
  { id: "pyramid", target: "map-pyramid-button" },
];

type State = { active: boolean; step: number; targets: Record<string, TourRect> };
let state: State = { active: false, step: 0, targets: {} };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  emit();
};

export const tour = {
  start: () => set({ active: true, step: 0 }),
  next: () => (state.step + 1 >= TOUR_STEPS.length ? set({ active: false, step: 0 }) : set({ step: state.step + 1 })),
  stop: () => set({ active: false, step: 0 }),
  setTarget: (id: string, rect: TourRect) => {
    const cur = state.targets[id];
    if (cur && cur.x === rect.x && cur.y === rect.y && cur.width === rect.width && cur.height === rect.height) return;
    set({ targets: { ...state.targets, [id]: rect } });
  },
};

export function useTour() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

/** Attach to a View: its window rect becomes the spotlight target `id` (re-measured on every layout). */
export function useTourTarget<T extends View>(id: string) {
  const ref = useRef<T | null>(null);
  const measure = useCallback(() => {
    ref.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) tour.setTarget(id, { x, y, width, height });
    });
  }, [id]);
  useEffect(() => {
    const t = setTimeout(measure, 300); // after the first paint / safe-area settle
    return () => clearTimeout(t);
  }, [measure]);
  return { ref, onLayout: measure };
}
