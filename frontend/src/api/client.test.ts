/**
 * Core client behaviour (spec.production_hardening.mobile_client_core_behavior_tests_required).
 *
 * Everything here fails silently when it breaks: a request with no deadline leaves a spinner forever, a second
 * refresh spends a token the server has already consumed and logs the player out, and a wrong clock offset makes
 * every timer in the game count down to the wrong moment. None of it shows up in a typecheck.
 */
import type { ApiError as ApiErrorType } from "./client";

type ClientModule = typeof import("./client");

/** Fresh module state per test: the token store and the clock offset are module-level. */
async function loadClient(): Promise<ClientModule> {
  let mod: ClientModule = null as unknown as ClientModule;
  jest.isolateModules(() => {
    // isolateModules runs its callback synchronously, so the module has to come in through require, not import().
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("./client");
  });
  return mod;
}

/** A fetch that never answers but honours its abort signal, the way a stalled connection behaves. */
function hangingFetch() {
  return jest.fn((_url: string, init: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" })));
    }),
  );
}

function jsonResponse(status: number, body: unknown): Response {
  // Both readers matter: api() goes through text() so it can survive a non-JSON body, the refresh call uses json().
  return { status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(body), json: async () => body } as Response;
}

describe("request deadline", () => {
  afterEach(() => jest.useRealTimers());

  it("gives up on a connection that never answers", async () => {
    jest.useFakeTimers();
    const client = await loadClient();
    global.fetch = hangingFetch() as unknown as typeof fetch;

    const pending = client.get("/worlds", { auth: false });
    const assertion = expect(pending).rejects.toMatchObject({ code: "TIMEOUT", status: 0, retryable: true });
    jest.advanceTimersByTime(20_000);
    await assertion;
  });

  it("does not give up early on a slow but answering connection", async () => {
    jest.useFakeTimers();
    const client = await loadClient();
    global.fetch = jest.fn(async () => jsonResponse(200, { ok: true })) as unknown as typeof fetch;

    await expect(client.get("/worlds", { auth: false })).resolves.toEqual({ ok: true });
  });

  it("reports an outright connection failure as unreachable, not as an HTTP error", async () => {
    const client = await loadClient();
    global.fetch = jest.fn(async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;

    await expect(client.get("/worlds", { auth: false })).rejects.toMatchObject({ code: "NETWORK_ERROR", status: 0 });
  });
});

describe("isUnreachable", () => {
  it("separates 'no answer' from an answer the server chose to give", async () => {
    const client = await loadClient();
    global.fetch = jest.fn(async () => jsonResponse(403, { code: "FORBIDDEN", message: "no" })) as unknown as typeof fetch;

    const refused = await client.get("/worlds", { auth: false }).catch((e: ApiErrorType) => e);
    expect(client.isUnreachable(refused)).toBe(false);

    global.fetch = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const silent = await client.get("/worlds", { auth: false }).catch((e: ApiErrorType) => e);
    expect(client.isUnreachable(silent)).toBe(true);
  });
});

describe("expired access token", () => {
  it("refreshes once and replays the original request", async () => {
    const client = await loadClient();
    await client.tokenStore.setJwt("stale-access", "refresh-1");
    const calls: string[] = [];
    global.fetch = jest.fn(async (url: string) => {
      calls.push(url);
      if (url.endsWith("/auth/refresh")) return jsonResponse(200, { access_token: "fresh-access", refresh_token: "refresh-2" });
      return calls.filter((u) => u.endsWith("/me")).length === 1
        ? jsonResponse(401, { code: "UNAUTHORIZED" })
        : jsonResponse(200, { player: "ok" });
    }) as unknown as typeof fetch;

    await expect(client.get("/me")).resolves.toEqual({ player: "ok" });
    expect(calls.filter((u) => u.endsWith("/auth/refresh"))).toHaveLength(1);
    expect(client.tokenStore.bearer()).toBe("fresh-access");
    expect(client.tokenStore.refresh()).toBe("refresh-2");
  });

  it("spends the refresh token exactly once when the whole screen 401s at the same moment", async () => {
    // The server consumes a refresh token on use, so a second concurrent refresh would present a spent token and
    // log the player out. Around twenty polling queries can hit 401 in the same tick.
    const client = await loadClient();
    await client.tokenStore.setJwt("stale-access", "refresh-1");
    let refreshes = 0;
    global.fetch = jest.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/auth/refresh")) {
        refreshes += 1;
        return jsonResponse(200, { access_token: "fresh-access", refresh_token: "refresh-2" });
      }
      const bearer = (init.headers as Record<string, string>).Authorization;
      return bearer === "Bearer stale-access" ? jsonResponse(401, { code: "UNAUTHORIZED" }) : jsonResponse(200, { ok: url });
    }) as unknown as typeof fetch;

    const results = await Promise.all(["/me", "/marches", "/inbox", "/army", "/alliance"].map((p) => client.get(p)));
    expect(refreshes).toBe(1);
    expect(results).toHaveLength(5);
  });

  it("logs the player out when the refresh token is no longer good", async () => {
    const client = await loadClient();
    await client.tokenStore.setJwt("stale-access", "refresh-1");
    const onUnauthorized = jest.fn();
    client.tokenStore.setUnauthorizedHandler(onUnauthorized);
    global.fetch = jest.fn(async (url: string) =>
      url.endsWith("/auth/refresh") ? jsonResponse(401, { code: "INVALID_REFRESH_TOKEN" }) : jsonResponse(401, { code: "UNAUTHORIZED" }),
    ) as unknown as typeof fetch;

    await expect(client.get("/me")).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(client.tokenStore.bearer()).toBeNull();
  });

  it("leaves a 403 alone: being refused is not being expired", async () => {
    const client = await loadClient();
    await client.tokenStore.setJwt("good-access", "refresh-1");
    global.fetch = jest.fn(async () => jsonResponse(403, { code: "FORBIDDEN" })) as unknown as typeof fetch;

    await expect(client.get("/me")).rejects.toMatchObject({ status: 403 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("server clock", () => {
  it("counts down against the server's time, not the phone's", async () => {
    const client = await loadClient();
    const phoneNow = Date.now();
    jest.spyOn(Date, "now").mockReturnValue(phoneNow);

    // A phone running five minutes behind must not show five extra minutes on every timer.
    client.syncServerTime(new Date(phoneNow + 300_000).toISOString());
    expect(client.serverNow()).toBeCloseTo(phoneNow + 300_000, -2);
    expect(client.secondsUntil(new Date(phoneNow + 360_000).toISOString())).toBeCloseTo(60, 1);
  });

  it("never reports a negative remaining time", async () => {
    const client = await loadClient();
    expect(client.secondsUntil(new Date(Date.now() - 10_000).toISOString())).toBe(0);
    expect(client.secondsUntil(null)).toBe(0);
  });

  it("ignores a timestamp it cannot read instead of corrupting the offset", async () => {
    const client = await loadClient();
    client.syncServerTime("not a date");
    client.syncServerTime(null);
    expect(client.serverNow()).toBeCloseTo(Date.now(), -2);
  });
});
