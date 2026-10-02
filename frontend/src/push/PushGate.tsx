/**
 * Mounted once, renders nothing: it keeps the device's push registration current and takes the player where a
 * tapped notification points.
 *
 * Registration waits for a realm rather than firing at sign-in. The permission prompt then arrives with a reason
 * the player can see — they have a House to lose — instead of on the login screen, where "Allow notifications?" is
 * a question about nothing.
 */
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";

import { routeFor } from "@/src/game/deepLink";
import { useI18n } from "@/src/i18n";
import * as push from "@/src/push/push";
import { useAuth } from "@/src/state/AuthContext";

/** The launch notification stays readable for the life of the process: follow it once, not on every realm switch. */
let launchHandled = false;

export function PushGate() {
  const { account, worldId, selectWorld } = useAuth();
  const { lang } = useI18n();
  const router = useRouter();
  // The tap listener is installed once and lives across realm switches, so it reads the current realm from a ref
  // rather than closing over a stale one.
  const realm = useRef(worldId);
  useEffect(() => {
    realm.current = worldId;
  }, [worldId]);

  useEffect(() => {
    if (!account || !worldId) return;
    push.sync(lang).catch(() => {});
  }, [account, worldId, lang]);

  useEffect(() => {
    if (!account) return;
    const go = async (data: push.PushData) => {
      // The alert may belong to another realm — a Lord can hold several — and opening it in the one on screen would
      // show the wrong map.
      if (data.world_id && data.world_id !== realm.current) await selectWorld(data.world_id);
      const href = routeFor({ event: data.event, deep_link: data.deep_link });
      if (href) router.push(href);
    };
    const follow = (data: push.PushData | null) => {
      if (data) go(data).catch(() => {});
    };
    const stop = push.onTap(follow);
    if (!launchHandled) {
      launchHandled = true;
      // Cold start: the app was launched by the notification, so the tap happened before this listener existed.
      push.openedBy().then(follow).catch(() => {});
    }
    return stop;
  }, [account, selectWorld, router]);

  return null;
}
