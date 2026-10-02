/**
 * Device side of the PUSH channel (spec.notification_event_catalog).
 *
 * The server decides what deserves a push; this decides whether this phone is listening. Three things have to hold
 * for a token to exist, and all three can fail for ordinary reasons — the player refused the permission, the build
 * has no EAS project to route through, the app is running on the web — so every entry point returns a state rather
 * than throwing, and the caller shows that state instead of an error.
 *
 * The token is stored locally for one reason: signing out, or turning notifications off, has to be able to tell the
 * server *which* device to forget, and by then `getExpoPushTokenAsync` may no longer be callable.
 */
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { post } from "@/src/api/client";
import { storage } from "@/src/utils/storage";

const TOKEN_KEY = "eld.push.token";
const PREF_KEY = "eld.push.enabled";

/** Matches the `channelId` the server sends. An Android notification with no matching channel is silent. */
export const CHANNEL_ID = "alerts";

export type PushState =
  | "on" // a token is registered for this account
  | "off" // the player turned notifications off
  | "denied" // the operating system refused, and only its own settings can undo that
  | "unavailable"; // web, or a build with no EAS project: there is nothing to ask for

export type PushData = { event?: string; deep_link?: string; world_id?: string; notification_id?: string };

export function supported(): boolean {
  return (Platform.OS === "ios" || Platform.OS === "android") && !!projectId();
}

/**
 * Expo routes a push through the project that owns the token, so the id has to be in the build. `eas init` writes it
 * into app.json; until then there is no push to be had, which is why this is a state and not an error.
 */
function projectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId ?? null;
}

let configured = false;

/** Foreground behaviour and the Android channel. Idempotent, and safe to call where push is unavailable. */
export function configure(): void {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    // A banner while the player is looking at the game would cover the board they are playing on; the inbox badge
    // is the right place for it, and the server already sends the unread count.
    handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true }),
  });
  if (Platform.OS === "android") {
    Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Alerts",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    }).catch(() => {});
  }
}

export async function preference(): Promise<boolean> {
  // Default on: the events that push are the ones a player is angry to have missed. The operating system still has
  // to agree, and `enable` is where that is asked.
  return (await storage.getItem<boolean>(PREF_KEY, true)) ?? true;
}

/** Ask for the permission if needed, take a token and hand it to the server. Never throws. */
export async function enable(lang: string): Promise<PushState> {
  if (!supported()) return "unavailable";
  configure();
  try {
    let { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status !== "granted" && canAskAgain) ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== "granted") {
      await storage.setItem(PREF_KEY, false);
      return "denied";
    }
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() as string });
    await post("/push/register", { token, platform: Platform.OS, lang });
    await storage.setItem(TOKEN_KEY, token);
    await storage.setItem(PREF_KEY, true);
    return "on";
  } catch {
    // A missing Firebase config, Expo Go on Android, a token service that is down: all of them mean the same thing
    // to the player, and none of them should look like a bug in the game.
    return "unavailable";
  }
}

/** Stop pushing to this device and remember that choice. Also used on sign-out, where the choice is not changed. */
export async function disable(keepPreference = false): Promise<void> {
  const token = await storage.getItem<string>(TOKEN_KEY, "");
  if (token) {
    try {
      await post("/push/unregister", { token });
    } catch {
      // Offline, or the account is already gone (erasure forgets every device server-side): nothing left to do.
    }
  }
  await storage.removeItem(TOKEN_KEY);
  if (!keepPreference) await storage.setItem(PREF_KEY, false);
}

/**
 * Called on every launch with an account signed in. A push token is not forever — a restored backup, a reinstall or
 * a cleared app can rotate it — and the server only knows the one it was told, so re-registering is what keeps the
 * channel alive. Silent by design: nobody asked, so nothing is reported.
 */
export async function sync(lang: string): Promise<PushState> {
  if (!supported()) return "unavailable";
  configure();
  if (!(await preference())) return "off";
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") return "denied";
  return enable(lang);
}

/** What the player tapped, if the app was opened by a notification rather than from the launcher. */
export async function openedBy(): Promise<PushData | null> {
  if (!supported()) return null;
  const response = await Notifications.getLastNotificationResponseAsync();
  return (response?.notification.request.content.data as PushData | undefined) ?? null;
}

/** Taps while the app is already running. Returns the unsubscribe, or a no-op where there is nothing to listen to. */
export function onTap(handler: (data: PushData) => void): () => void {
  if (!supported()) return () => {};
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    handler((response.notification.request.content.data as PushData | undefined) ?? {});
  });
  return () => subscription.remove();
}
