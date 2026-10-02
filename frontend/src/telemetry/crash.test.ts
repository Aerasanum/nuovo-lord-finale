/**
 * Crash reporting from the app (spec.production_hardening.mobile_client_core_behavior_tests_required).
 *
 * What we hold it to: a render loop cannot turn one bug into a flood of requests, the report says which screen it
 * happened on, the previous global handler keeps working, and nothing here ever throws — it runs inside error
 * handling, where a second failure hides the first.
 */
import { post } from "@/src/api/client";
import * as crash from "@/src/telemetry/crash";

jest.mock("@/src/api/client", () => ({ post: jest.fn().mockResolvedValue({}) }));

const sent = post as jest.MockedFunction<typeof post>;
const bodies = () => sent.mock.calls.map((c) => c[1] as Record<string, any>);

beforeEach(() => {
  crash.resetForTests();
  sent.mockResolvedValue({});
  // Development keeps reports local on purpose; these tests are about what a release build does.
  (globalThis as any).__DEV__ = false;
});

afterEach(() => {
  (globalThis as any).__DEV__ = true;
});

describe("a reported crash", () => {
  it("carries what makes a release crash findable, and nothing else", () => {
    crash.setRoute("/(tabs)/map");
    crash.report(new TypeError("Cannot read property 'x' of undefined"), "screen");
    expect(sent).toHaveBeenCalledTimes(1);
    const [path, body] = sent.mock.calls[0];
    expect(path).toBe("/telemetry/crash");
    expect(body).toMatchObject({ kind: "screen", message: "Cannot read property 'x' of undefined", route: "/(tabs)/map", fatal: false });
    expect((body as any).stack).toContain("TypeError");
    expect(Object.keys(body as object).sort()).toEqual(["app_version", "fatal", "kind", "message", "os_version", "platform", "route", "stack"]);
  });

  it("survives something that is not an Error at all", () => {
    crash.report("boom", "unhandled");
    crash.report(undefined, "unhandled");
    expect(bodies().map((b) => b.message)).toEqual(["boom", "Unknown error"]);
  });

  it("keeps the component stack the boundary hands over", () => {
    crash.report(new Error("render failed"), "render", { stack: "\n    in MapScreen\n    in Screen", fatal: true });
    expect(bodies()[0].stack).toContain("in MapScreen");
    expect(bodies()[0].fatal).toBe(true);
  });

  it("is sent once however many times the same crash repeats", () => {
    for (let i = 0; i < 20; i++) crash.report(new Error("same failure"), "render");
    expect(sent).toHaveBeenCalledTimes(1);
  });

  it("stops after a handful of distinct failures, so one bad build is not a flood", () => {
    for (let i = 0; i < 30; i++) crash.report(new Error(`failure ${i}`), "render");
    expect(sent.mock.calls.length).toBeLessThanOrEqual(8);
  });

  it("does not raise when the report itself cannot be delivered", () => {
    sent.mockRejectedValue(new Error("offline"));
    expect(() => crash.report(new Error("the real crash"), "render")).not.toThrow();
  });

  it("stays local in development", () => {
    (globalThis as any).__DEV__ = true;
    crash.report(new Error("work in progress"), "render");
    expect(sent).not.toHaveBeenCalled();
  });
});

describe("the global handler", () => {
  const originalErrorUtils = (globalThis as any).ErrorUtils;

  afterEach(() => {
    (globalThis as any).ErrorUtils = originalErrorUtils;
  });

  it("reports what React never saw and still calls the handler that was there", () => {
    const previous = jest.fn();
    const handlers: ((error: unknown, isFatal?: boolean) => void)[] = [];
    (globalThis as any).ErrorUtils = {
      getGlobalHandler: () => previous,
      setGlobalHandler: (h: (error: unknown, isFatal?: boolean) => void) => handlers.push(h),
    };
    crash.installGlobalHandler();
    crash.installGlobalHandler(); // idempotent: mounted once, but a remount must not chain a second time
    expect(handlers).toHaveLength(1);

    const error = new Error("thrown outside the tree");
    handlers[0](error, true);
    expect(bodies()[0]).toMatchObject({ kind: "unhandled", message: "thrown outside the tree", fatal: true });
    // Replacing the red box in development, or the crash in production, would hide crashes instead of reporting them.
    expect(previous).toHaveBeenCalledWith(error, true);
  });

  it("installs nothing it cannot find", () => {
    delete (globalThis as any).ErrorUtils;
    expect(() => crash.installGlobalHandler()).not.toThrow();
  });
});
