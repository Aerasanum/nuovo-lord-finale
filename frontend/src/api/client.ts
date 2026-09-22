import { storage } from "@/src/utils/storage";

/**
 * Expo inlines EXPO_PUBLIC_* at build time. When frontend/.env is missing — or when the bundler reused a cache built
 * before it existed — the value is `undefined` and every request silently goes to "undefined/api/...". Failing here,
 * with the fix in the message, beats debugging a screen full of network errors.
 */
function backendUrl(): string {
  const url = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (!url) {
    throw new Error(
      "EXPO_PUBLIC_BACKEND_URL is not set. Copy frontend/.env.example to frontend/.env and restart the bundler with --clear (Expo bakes this value into the bundle).",
    );
  }
  return url.replace(/\/+$/, "");
}

export const BACKEND_URL = backendUrl();
export const API = `${BACKEND_URL}/api`;

export class ApiError extends Error {
  code: string;
  status: number;
  details: Record<string, unknown>;
  retryable: boolean;
  traceId?: string;
  constructor(status: number, body: any) {
    super(body?.message || `HTTP ${status}`);
    this.status = status;
    this.code = body?.code || "HTTP_ERROR";
    this.details = body?.details || {};
    this.retryable = !!body?.retryable;
    this.traceId = body?.trace_id;
  }
}

/** No answer came back at all — no connection, or none within the deadline. Status 0 is never a real response. */
export const isUnreachable = (e: unknown): boolean => e instanceof ApiError && e.status === 0;

const ACCESS_KEY = "eld.access_token";
const REFRESH_KEY = "eld.refresh_token";
const SESSION_KEY = "eld.session_token";

let accessToken: string | null = null;
let refreshToken: string | null = null;
let sessionToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export const tokenStore = {
  async load() {
    accessToken = (await storage.secureGet<string | null>(ACCESS_KEY, null)) ?? null;
    refreshToken = (await storage.secureGet<string | null>(REFRESH_KEY, null)) ?? null;
    sessionToken = (await storage.secureGet<string | null>(SESSION_KEY, null)) ?? null;
    return !!(accessToken || sessionToken);
  },
  async setJwt(access: string, refresh: string) {
    accessToken = access;
    refreshToken = refresh;
    sessionToken = null;
    await storage.secureSet(ACCESS_KEY, access);
    await storage.secureSet(REFRESH_KEY, refresh);
    await storage.secureRemove(SESSION_KEY);
  },
  async setSession(token: string) {
    sessionToken = token;
    accessToken = null;
    refreshToken = null;
    await storage.secureSet(SESSION_KEY, token);
    await storage.secureRemove(ACCESS_KEY);
    await storage.secureRemove(REFRESH_KEY);
  },
  async clear() {
    accessToken = refreshToken = sessionToken = null;
    await storage.secureRemove(ACCESS_KEY);
    await storage.secureRemove(REFRESH_KEY);
    await storage.secureRemove(SESSION_KEY);
  },
  bearer(): string | null {
    return sessionToken || accessToken;
  },
  refresh(): string | null {
    return refreshToken;
  },
  setUnauthorizedHandler(fn: () => void) {
    onUnauthorized = fn;
  },
};

let refreshing: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const r = await fetch(`${API}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!r.ok) return false;
        const data = await r.json();
        await tokenStore.setJwt(data.access_token, data.refresh_token);
        return true;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

/**
 * A stalled mobile connection does not fail — it hangs. Without a deadline the promise never settles, so React
 * Query stays in `isFetching`, no error is ever raised and the retry screen it would have shown never appears:
 * the player just watches a spinner. Twenty seconds is far longer than any endpoint the client calls.
 */
const REQUEST_TIMEOUT_MS = 20_000;

export type ApiInit = RequestInit & { auth?: boolean; retry?: boolean; timeoutMs?: number };

export async function api<T = any>(path: string, init: ApiInit = {}): Promise<T> {
  const { auth = true, retry = true, timeoutMs = REQUEST_TIMEOUT_MS, ...rest } = init;
  const headers: Record<string, string> = { "Content-Type": "application/json", ...((rest.headers as Record<string, string>) || {}) };
  const bearer = tokenStore.bearer();
  if (auth && bearer) headers.Authorization = `Bearer ${bearer}`;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  let res: Response;
  let text: string;
  try {
    // The body is read inside the deadline too: headers can arrive promptly and then the body stall forever.
    res = await fetch(`${API}${path}`, { ...rest, headers, signal: abort.signal });
    text = await res.text();
  } catch (e: any) {
    if (abort.signal.aborted) throw new ApiError(0, { code: "TIMEOUT", message: `No answer within ${Math.round(timeoutMs / 1000)}s`, retryable: true });
    throw new ApiError(0, { code: "NETWORK_ERROR", message: e?.message || "Network error", retryable: true });
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 && auth && retry) {
    if (await tryRefresh()) return api<T>(path, { ...init, retry: false });
    await tokenStore.clear();
    onUnauthorized?.();
  }
  const body = text ? safeJson(text) : null;
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export const post = <T = any>(path: string, body?: unknown, init?: ApiInit) => api<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body), ...init });
export const put = <T = any>(path: string, body?: unknown, init?: ApiInit) => api<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body), ...init });
export const get = <T = any>(path: string, init?: ApiInit) => api<T>(path, { method: "GET", ...init });

// ---- server clock sync: remaining timers are computed against server_time ----
let serverOffsetMs = 0;
export function syncServerTime(serverTimeIso?: string | null) {
  if (!serverTimeIso) return;
  const server = Date.parse(serverTimeIso);
  if (!Number.isNaN(server)) serverOffsetMs = server - Date.now();
}
export function serverNow(): number {
  return Date.now() + serverOffsetMs;
}
export function secondsUntil(iso?: string | null): number {
  if (!iso) return 0;
  return Math.max(0, (Date.parse(iso) - serverNow()) / 1000);
}
