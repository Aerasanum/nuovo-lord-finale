/**
 * RevenueCat (Google Play Billing) — guarded wrapper. Real purchases exist only in a native Android build with
 * EXPO_PUBLIC_RC_ANDROID_KEY set; in Expo Go / web the SDK is never configured and the store shows «in arrivo».
 * The wallet is NEVER credited from here: RevenueCat validates with Google and posts a webhook, the server grants.
 */
import { Platform } from "react-native";

let configuredFor: string | null = null;
let sdk: any | null = null;

function load(): any | null {
  if (sdk) return sdk;
  try {
    sdk = require("react-native-purchases").default;
  } catch {
    sdk = null;
  }
  return sdk;
}

export const RC_KEY = process.env.EXPO_PUBLIC_RC_ANDROID_KEY || "";

/** True when a real Google Play purchase can be started on this device. */
export function billingAvailable(): boolean {
  return Platform.OS === "android" && !!RC_KEY && !!load();
}

export async function configureBilling(accountId: string): Promise<boolean> {
  if (!billingAvailable() || configuredFor === accountId) return configuredFor === accountId;
  const P = load();
  try {
    if (configuredFor) await P.logIn(accountId);
    else P.configure({ apiKey: RC_KEY, appUserID: accountId });
    configuredFor = accountId;
    return true;
  } catch (e) {
    console.warn("[billing] configure failed", e);
    return false;
  }
}

export type StorePackage = { identifier: string; product: { identifier: string; priceString: string; title: string } };

/** Google Play packages of the current offering, keyed by store product id. */
export async function loadPackages(): Promise<Record<string, StorePackage>> {
  if (!billingAvailable() || !configuredFor) return {};
  const P = load();
  const offerings = await P.getOfferings();
  const out: Record<string, StorePackage> = {};
  for (const pkg of offerings.current?.availablePackages ?? []) out[pkg.product.identifier] = pkg;
  return out;
}

/** Starts the native purchase sheet. Resolves when Google confirms; the server grant arrives via webhook shortly after. */
export async function purchase(pkg: StorePackage): Promise<{ cancelled: boolean }> {
  const P = load();
  try {
    await P.purchasePackage(pkg);
    return { cancelled: false };
  } catch (e: any) {
    if (e?.userCancelled) return { cancelled: true };
    throw e;
  }
}
