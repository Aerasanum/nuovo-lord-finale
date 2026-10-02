/**
 * Device-side push registration (spec.production_hardening.mobile_client_core_behavior_tests_required).
 *
 * What we hold it to: a phone that cannot receive pushes says so instead of throwing, a refused permission is
 * remembered rather than asked again on every screen, and the server is always told which token to forget.
 */
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";

import { post } from "@/src/api/client";
import * as push from "@/src/push/push";
import { storage } from "@/src/utils/storage";

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
  AndroidImportance: { HIGH: 4 },
  AndroidNotificationVisibility: { PRIVATE: 0 },
}));

jest.mock("@/src/api/client", () => ({ post: jest.fn().mockResolvedValue({}) }));

// jest-expo exposes `expoConfig` as a getter, so the EAS project id cannot be varied per test without replacing
// the module with something writable.
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }));

const notifications = Notifications as jest.Mocked<typeof Notifications>;
const sent = post as jest.MockedFunction<typeof post>;
const TOKEN = "ExponentPushToken[abcdefghijklmnop]";

const withProject = (projectId: string | null) => {
  (Constants as any).expoConfig = { extra: projectId ? { eas: { projectId } } : {} };
};

beforeEach(async () => {
  await storage.removeItem("eld.push.enabled");
  await storage.removeItem("eld.push.token");
  withProject("project-under-test");
  notifications.setNotificationChannelAsync.mockResolvedValue(null as any);
  notifications.getPermissionsAsync.mockResolvedValue({ status: "granted", canAskAgain: true } as any);
  notifications.requestPermissionsAsync.mockResolvedValue({ status: "granted", canAskAgain: true } as any);
  notifications.getExpoPushTokenAsync.mockResolvedValue({ data: TOKEN, type: "expo" } as any);
  notifications.getLastNotificationResponseAsync.mockResolvedValue(null);
  notifications.addNotificationResponseReceivedListener.mockReturnValue({ remove: jest.fn() } as any);
  sent.mockResolvedValue({});
});

describe("a build with no EAS project", () => {
  // `eas init` is what writes the id into app.json. Until then Expo has no project to route a push through, which
  // is a missing step and not a bug: the settings panel hides itself instead of showing a broken switch.
  beforeEach(() => withProject(null));

  it("reports itself unavailable and asks the player nothing", async () => {
    expect(push.supported()).toBe(false);
    await expect(push.enable("it")).resolves.toBe("unavailable");
    await expect(push.sync("it")).resolves.toBe("unavailable");
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(sent).not.toHaveBeenCalled();
  });

  it("has no launch notification to follow and no listener to install", async () => {
    await expect(push.openedBy()).resolves.toBeNull();
    push.onTap(() => {})();
    expect(notifications.addNotificationResponseReceivedListener).not.toHaveBeenCalled();
  });
});

describe("enabling", () => {
  it("registers the token for the account and remembers it for later", async () => {
    await expect(push.enable("it")).resolves.toBe("on");
    expect(sent).toHaveBeenCalledWith("/push/register", { token: TOKEN, platform: expect.any(String), lang: "it" });
    expect(await storage.getItem("eld.push.token", "")).toBe(TOKEN);
    expect(await push.preference()).toBe(true);
  });

  it("does not ask again once the system has been asked and refused for good", async () => {
    notifications.getPermissionsAsync.mockResolvedValue({ status: "denied", canAskAgain: false } as any);
    await expect(push.enable("en")).resolves.toBe("denied");
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(sent).not.toHaveBeenCalled();
    // Remembered as off, so the next launch does not try again behind the player's back.
    expect(await push.preference()).toBe(false);
  });

  it("asks the system when it still may be asked", async () => {
    notifications.getPermissionsAsync.mockResolvedValue({ status: "undetermined", canAskAgain: true } as any);
    notifications.requestPermissionsAsync.mockResolvedValue({ status: "denied", canAskAgain: false } as any);
    await expect(push.enable("en")).resolves.toBe("denied");
    expect(notifications.requestPermissionsAsync).toHaveBeenCalled();
  });

  it("turns a token service that is down into a state, not a crash", async () => {
    notifications.getExpoPushTokenAsync.mockRejectedValue(new Error("no Firebase config"));
    await expect(push.enable("en")).resolves.toBe("unavailable");
    expect(sent).not.toHaveBeenCalled();
  });
});

describe("disabling", () => {
  it("tells the server which device to forget and drops the stored token", async () => {
    await push.enable("it");
    sent.mockClear();
    await push.disable();
    expect(sent).toHaveBeenCalledWith("/push/unregister", { token: TOKEN });
    expect(await storage.getItem("eld.push.token", "")).toBe("");
    expect(await push.preference()).toBe(false);
  });

  it("keeps the player's choice when it is signing out rather than switching off", async () => {
    await push.enable("it");
    await push.disable(true);
    expect(await push.preference()).toBe(true);
  });

  it("still forgets the device locally when the unregister call cannot go out", async () => {
    await push.enable("it");
    sent.mockRejectedValue(new Error("offline"));
    await expect(push.disable()).resolves.toBeUndefined();
    expect(await storage.getItem("eld.push.token", "")).toBe("");
  });
});

describe("syncing on launch", () => {
  it("re-registers a rotated token, because the server only knows the one it was told", async () => {
    await push.enable("it");
    const rotated = "ExponentPushToken[rotated000000000]";
    notifications.getExpoPushTokenAsync.mockResolvedValue({ data: rotated, type: "expo" } as any);
    sent.mockClear();
    await expect(push.sync("it")).resolves.toBe("on");
    expect(sent).toHaveBeenCalledWith("/push/register", { token: rotated, platform: expect.any(String), lang: "it" });
  });

  it("stays quiet when the player turned notifications off", async () => {
    await push.disable();
    await expect(push.sync("it")).resolves.toBe("off");
    expect(notifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(sent).not.toHaveBeenCalled();
  });

  it("reports a permission revoked in the phone's settings without asking for it again", async () => {
    await storage.setItem("eld.push.enabled", true);
    notifications.getPermissionsAsync.mockResolvedValue({ status: "denied", canAskAgain: true } as any);
    await expect(push.sync("it")).resolves.toBe("denied");
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe("following a tap", () => {
  it("hands the notification's data to the caller and unsubscribes when told", () => {
    const remove = jest.fn();
    notifications.addNotificationResponseReceivedListener.mockReturnValue({ remove } as any);
    const seen: push.PushData[] = [];
    const stop = push.onTap((data) => seen.push(data));
    const listener = notifications.addNotificationResponseReceivedListener.mock.calls[0][0];
    listener({ notification: { request: { content: { data: { event: "SENTINEL_LOST", deep_link: "map/sentinel" } } } } } as any);
    expect(seen).toEqual([{ event: "SENTINEL_LOST", deep_link: "map/sentinel" }]);
    stop();
    expect(remove).toHaveBeenCalled();
  });

  it("reads the notification the app was launched from", async () => {
    notifications.getLastNotificationResponseAsync.mockResolvedValue({
      notification: { request: { content: { data: { event: "OWNERSHIP_CHANGED", deep_link: "settlement", world_id: "world_2" } } } },
    } as any);
    await expect(push.openedBy()).resolves.toEqual({ event: "OWNERSHIP_CHANGED", deep_link: "settlement", world_id: "world_2" });
  });
});
