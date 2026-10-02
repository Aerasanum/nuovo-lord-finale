/**
 * Crash reports from the app to our own server.
 *
 * A release build is silent: Hermes ships bytecode with no symbols, nobody is watching a console, and the only
 * report we get today is a player saying "it closed". What is still worth having is the error message, the screen
 * it happened on and the app version — enough to find the bug in a codebase we wrote — so that is what goes, and
 * nothing else. No device id, no user text, no screenshot.
 *
 * Two limits matter more than they look. A render crash usually repeats, often in a loop, so the same error is sent
 * once per session; and a session sends at most a handful of distinct ones. Without that, the first broken screen
 * would turn every affected phone into a small denial of service against our own backend.
 *
 * Nothing here ever throws or awaits: it is called from inside error handling, where a second failure would hide
 * the first.
 */
import Constants from "expo-constants";
import { Platform } from "react-native";

import { post } from "@/src/api/client";

export type CrashKind = "render" | "screen" | "unhandled" | "rejection";

const MAX_DISTINCT_PER_SESSION = 8;
const reported = new Set<string>();

/** The route the player is on, kept here because a global error handler is not inside React and cannot ask. */
let route: string | null = null;

export function setRoute(next: string | null): void {
  route = next;
}

/** In development the error is already on screen and in the console; shipping it would just bury real reports. */
function enabled(): boolean {
  return !__DEV__;
}

export function report(error: unknown, kind: CrashKind, extra?: { stack?: string | null; fatal?: boolean }): void {
  const message = (error instanceof Error ? error.message : String(error ?? "")).trim() || "Unknown error";
  const key = `${kind}|${message}`;
  if (reported.has(key) || reported.size >= MAX_DISTINCT_PER_SESSION) return;
  reported.add(key);
  if (!enabled()) return;
  const stack = [error instanceof Error ? error.stack : null, extra?.stack].filter(Boolean).join("\n").slice(0, 4000);
  post("/telemetry/crash", {
    kind,
    message: message.slice(0, 500),
    stack: stack || null,
    route,
    app_version: Constants.expoConfig?.version ?? null,
    platform: Platform.OS,
    os_version: String(Platform.Version ?? "") || null,
    fatal: !!extra?.fatal,
  }).catch(() => {
    // The app is already crashing; a failed report is not worth a second error.
  });
}

let installed = false;

/**
 * Catch what the error boundaries cannot: a throw outside the React tree, and a promise nobody awaited.
 *
 * The previous global handler is kept and still called — it is the one that shows the red box in development and
 * ends the process in production, and replacing that behaviour would hide crashes rather than report them.
 */
export function installGlobalHandler(): void {
  if (installed) return;
  installed = true;
  const errorUtils = (globalThis as any).ErrorUtils;
  if (errorUtils?.getGlobalHandler && errorUtils?.setGlobalHandler) {
    const previous = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      report(error, "unhandled", { fatal: !!isFatal });
      previous?.(error, isFatal);
    });
  }
  const target = globalThis as unknown as { addEventListener?: (type: string, listener: (event: any) => void) => void };
  target.addEventListener?.("unhandledrejection", (event) => {
    report(event?.reason, "rejection");
  });
}

/** Tests only: a session's memory of what it already sent is module state by design. */
export function resetForTests(): void {
  reported.clear();
  installed = false;
  route = null;
}
