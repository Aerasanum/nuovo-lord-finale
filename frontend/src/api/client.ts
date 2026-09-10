import { storage } from "@/src/utils/storage";

export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL as string;
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

export async function api<T = any>(path: string, init: RequestInit & { auth?: boolean; retry?: boolean } = {}): Promise<T> {
  const { auth = true, retry = true, ...rest } = init;
  const headers: Record<string, string> = { "Content-Type": "application/json", ...((rest.headers as Record<string, string>) || {}) };
  const bearer = tokenStore.bearer();
  if (auth && bearer) headers.Authorization = `Bearer ${bearer}`;
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { ...rest, headers });
  } catch (e: any) {
    throw new ApiError(0, { code: "NETWORK_ERROR", message: e?.message || "Network error", retryable: true });
  }
  if (res.status === 401 && auth && retry) {
    if (await tryRefresh()) return api<T>(path, { ...init, retry: false });
    await tokenStore.clear();
    onUnauthorized?.();
  }
  const text = await res.text();
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

export const post = <T = any>(path: string, body?: unknown, init?: RequestInit) => api<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body), ...init });
export const put = <T = any>(path: string, body?: unknown, init?: RequestInit) => api<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body), ...init });
export const get = <T = any>(path: string, init?: RequestInit) => api<T>(path, { method: "GET", ...init });

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
