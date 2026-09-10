import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

import { get, post, tokenStore } from "@/src/api/client";
import { queryClient } from "@/src/query-client";
import { storage } from "@/src/utils/storage";

export type Account = { account_id: string; email: string; display_name?: string; picture?: string | null; provider: string };

type AuthState = {
  ready: boolean;
  account: Account | null;
  worldId: string | null;
  settlementId: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  exchangeSession: (sessionId: string) => Promise<void>;
  logout: () => Promise<void>;
  selectWorld: (worldId: string | null) => Promise<void>;
  selectSettlement: (sid: string | null) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);
const EMERGENT_AUTH = "https://auth.emergentagent.com/";
WebBrowser.maybeCompleteAuthSession();

/** session_id arrives in the hash fragment (`#session_id=`) or query; match the raw URL — Linking.parse can't see the hash. */
function extractSessionId(url?: string | null): string | null {
  const m = url?.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
const usedSessionIds = new Set<string>();

function cleanWebUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("session_id");
  if (url.hash) {
    const h = new URLSearchParams(url.hash.slice(1));
    h.delete("session_id");
    url.hash = h.toString();
  }
  window.history.replaceState(window.history.state, "", url.toString());
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [worldId, setWorldId] = useState<string | null>(null);
  const [settlementId, setSettlementId] = useState<string | null>(null);

  const finishAuth = useCallback(async (data: any) => {
    if (data.session_token) await tokenStore.setSession(data.session_token);
    else await tokenStore.setJwt(data.access_token, data.refresh_token);
    setAccount(data.account);
    queryClient.clear();
  }, []);

  const exchangeSession = useCallback(
    async (sessionId: string) => {
      if (usedSessionIds.has(sessionId)) return; // one-time token: never send it twice (re-mount / hot link / auth result)
      usedSessionIds.add(sessionId);
      await finishAuth(await post("/auth/session", { session_id: sessionId }, { auth: false } as any));
      if (Platform.OS === "web") cleanWebUrl();
    },
    [finishAuth],
  );

  useEffect(() => {
    // hot deep links (Android Custom Tabs often returns `dismiss` and delivers the URL here instead)
    const sub =
      Platform.OS !== "web"
        ? Linking.addEventListener("url", (e) => {
            const sid = extractSessionId(e.url);
            if (sid) exchangeSession(sid).catch(() => {});
          })
        : null;
    (async () => {
      const has = await tokenStore.load();
      const w = await storage.getItem<string | null>("eld.world", null);
      const s = await storage.getItem<string | null>("eld.settlement", null);
      setWorldId(w ?? null);
      setSettlementId(s ?? null);
      // a session_id in the launch URL wins over any stored token (fresh Google login / cold start)
      const sid = Platform.OS === "web" ? extractSessionId(typeof window !== "undefined" ? window.location.href : null) : extractSessionId(await Linking.getInitialURL());
      let done = false;
      if (sid) {
        try {
          await exchangeSession(sid);
          done = true;
        } catch {
          done = false;
        }
      }
      if (!done && has) {
        try {
          const me = await get<Account>("/auth/me");
          setAccount(me);
        } catch {
          await tokenStore.clear();
        }
      }
      setReady(true);
    })();
    tokenStore.setUnauthorizedHandler(() => setAccount(null));
    return () => sub?.remove();
  }, [exchangeSession]);

  const login = useCallback(async (email: string, password: string) => finishAuth(await post("/auth/login", { email, password }, { auth: false } as any)), [finishAuth]);
  const register = useCallback(async (email: string, password: string, displayName?: string) => finishAuth(await post("/auth/register", { email, password, display_name: displayName || undefined }, { auth: false } as any)), [finishAuth]);

  const loginWithGoogle = useCallback(async () => {
    if (Platform.OS === "web") {
      const redirect = `${window.location.origin}/`;
      window.location.href = `${EMERGENT_AUTH}?redirect=${encodeURIComponent(redirect)}`;
      return;
    }
    const redirect = Linking.createURL("");
    const result = await WebBrowser.openAuthSessionAsync(`${EMERGENT_AUTH}?redirect=${encodeURIComponent(redirect)}`, redirect);
    // `dismiss` is "maybe succeeded": the url listener / getInitialURL may still deliver the session_id
    const sid = (result.type === "success" ? extractSessionId(result.url) : null) ?? extractSessionId(await Linking.getInitialURL());
    if (sid) await exchangeSession(sid);
  }, [exchangeSession]);

  const logout = useCallback(async () => {
    try {
      await post("/auth/logout", { refresh_token: tokenStore.refresh() });
    } catch {}
    await tokenStore.clear();
    setAccount(null);
    setWorldId(null);
    setSettlementId(null);
    await storage.removeItem("eld.world");
    await storage.removeItem("eld.settlement");
    queryClient.clear();
  }, []);

  const selectWorld = useCallback(async (w: string | null) => {
    setWorldId(w);
    setSettlementId(null);
    if (w) await storage.setItem("eld.world", w);
    else await storage.removeItem("eld.world");
    await storage.removeItem("eld.settlement");
  }, []);

  const selectSettlement = useCallback(async (s: string | null) => {
    setSettlementId(s);
    if (s) await storage.setItem("eld.settlement", s);
    else await storage.removeItem("eld.settlement");
  }, []);

  const value = useMemo<AuthState>(
    () => ({ ready, account, worldId, settlementId, login, register, loginWithGoogle, exchangeSession, logout, selectWorld, selectSettlement }),
    [ready, account, worldId, settlementId, login, register, loginWithGoogle, exchangeSession, logout, selectWorld, selectSettlement],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
