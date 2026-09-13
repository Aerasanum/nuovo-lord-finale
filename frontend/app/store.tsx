/**
 * Negozio — two shelves: Ruby packs sold in € through Google Play (RevenueCat → server webhook → grant; nothing is
 * credited client-side) and premium castle skins bought with Rubies (account-level, usable in every Realm).
 * Pack bonuses: 1.99 € includes one 300-tier castle skin, 4.99 € includes 200 Orsi (claimed into the Mother of the
 * current Realm), 49.99 € pays ×10 Rubies on its first purchase.
 */
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type StorePack, type StoreSkin, useHouse, useSetSkin, useStore, useStoreMutations } from "@/src/api/hooks";
import { BackButton } from "@/src/components/alliance/common";
import { Screen, Sheet, useToast } from "@/src/components/overlay";
import { Button, Chip, Icon, type IconName, Loading, Panel, Row, T } from "@/src/components/ui";
import { fmt, formatNumber, type StringKey, useI18n } from "@/src/i18n";
import { CASTLE_SKINS } from "@/src/map3d/castle";
import { CastlePreview } from "@/src/map3d/CastlePreview";
import { useGame } from "@/src/state/useGame";
import { billingAvailable, configureBilling, loadPackages, purchase, type StorePackage } from "@/src/store/revenuecat";
import { useAuth } from "@/src/state/AuthContext";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  balance: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tabs: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  pack: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, minHeight: 72 },
  packHot: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  gem: { width: 48, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border },
  price: { minWidth: 76, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: c.brandPrimary, paddingHorizontal: 12 },
  priceOff: { backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.borderStrong },
  ribbon: { alignSelf: "flex-start", paddingHorizontal: 8, height: 20, borderRadius: radius.pill, justifyContent: "center", marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  skin: { flexBasis: "30%", flexGrow: 1, alignItems: "center", gap: 4, paddingVertical: spacing.sm, paddingHorizontal: 6, borderRadius: radius.md, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surfaceSecondary },
  swatches: { flexDirection: "row", gap: 3 },
  swatch: { width: 12, height: 22, borderRadius: 3 },
  tierChip: { paddingHorizontal: 6, height: 18, borderRadius: radius.pill, justifyContent: "center", backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border },
  reward: { borderColor: c.success },
}));

const PACK_ICON: Record<string, IconName> = { s: "diamond-outline", m: "diamond", l: "treasure-chest", xl: "treasure-chest", xxl: "crown" };
const SKIN_ICON: Record<string, IconName> = { frost: "snowflake", sylvan: "pine-tree", ocean: "waves", light: "white-balance-sunny", sun: "crown", night: "weather-night", dragon: "fire", demon: "emoticon-devil", volcano: "volcano" };

function bonusLine(p: StorePack, t: (k: StringKey) => string): { text: string; hot: boolean } | null {
  const b = p.bonus;
  if (!b) return null;
  if (b.type === "CASTLE_SKIN") return { text: fmt(t("storeBonusSkin"), { n: b.tier }), hot: false };
  if (b.type === "UNITS") return { text: Object.entries(b.units).map(([u, n]) => `+${formatNumber(n)} ${u}`).join(" · "), hot: false };
  return b.available ? { text: fmt(t("storeBonusFirst"), { n: b.mult }), hot: true } : { text: t("storeBonusFirstUsed"), hot: false };
}

export default function StoreScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { account } = useAuth();
  const { worldId, settlementId, settlement } = useGame();
  const store = useStore();
  const house = useHouse(worldId);
  const { buySkin, claim } = useStoreMutations(worldId);
  const setSkin = useSetSkin(worldId ?? "", settlementId ?? "");
  const { show, showError } = useToast();
  const [tab, setTab] = useState<"rubies" | "skins">("rubies");
  const [picked, setPicked] = useState<string>("dragon");
  const [confirm, setConfirm] = useState<StoreSkin | null>(null);
  const [info, setInfo] = useState(false);
  const [packages, setPackages] = useState<Record<string, StorePackage>>({});
  const [buying, setBuying] = useState<string | null>(null);
  const d = store.data;
  const live = d?.billing.status === "LIVE" && billingAvailable();

  useEffect(() => {
    if (!live || !account?.account_id) return;
    configureBilling(account.account_id)
      .then((ok) => (ok ? loadPackages() : {}))
      .then(setPackages)
      .catch((e) => console.warn("[billing] offerings", e));
  }, [live, account?.account_id]);

  const level = settlement.data?.level ?? 10;
  const skinName = (id: string) => CASTLE_SKINS[id]?.name[lang === "it" ? "it" : "en"] ?? id;
  const pickedSkin = useMemo(() => d?.skins.find((k) => k.id === picked) ?? null, [d, picked]);
  const pending = d?.pending_rewards ?? [];

  const buyPack = async (p: StorePack) => {
    if (!live) {
      setInfo(true);
      return;
    }
    const pkg = packages[p.product_id];
    if (!pkg) {
      show(t("storeProductMissing"), "error");
      return;
    }
    setBuying(p.product_id);
    try {
      const r = await purchase(pkg);
      if (!r.cancelled) {
        show(t("storePurchasePending"), "success");
        setTimeout(() => store.refetch(), 4000);
        setTimeout(() => store.refetch(), 12000);
      }
    } catch (e) {
      showError(e);
    } finally {
      setBuying(null);
    }
  };

  return (
    <Screen
      title={t("store")}
      testID="store-screen"
      left={<BackButton testID="store-back" />}
      right={
        <Pressable style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }} onPress={() => router.push("/wallet")} testID="store-wallet-button" accessibilityLabel={t("wallet")}>
          <Icon name="history" size={22} color={colors.onSurfaceSecondary} />
        </Pressable>
      }
    >
      {!d ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}>
          <Panel testID="store-balance">
            <View style={s.balance}>
              <View>
                <T v="caption">{t("rubies")}</T>
                <Row>
                  <Icon name="diamond" size={22} color={colors.brandPrimary} />
                  <T v="title" testID="store-rubies">
                    {formatNumber(d.rubies)}
                  </T>
                </Row>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Row style={{ gap: 4 }}>
                  <Icon name="google-play" size={14} color={live ? colors.success : colors.muted} />
                  <T v="caption" style={{ color: live ? colors.success : colors.muted }} testID="store-billing-status">
                    {live ? t("storeBillingLive") : t("storeBillingSoon")}
                  </T>
                </Row>
                {d.purchases ? <T v="caption">{fmt(t("storePurchases"), { n: d.purchases })}</T> : null}
              </View>
            </View>
          </Panel>

          {pending.length ? (
            <Panel style={s.reward} testID="store-pending">
              <Row>
                <Icon name="gift-open" size={18} color={colors.success} />
                <T v="heading">{t("storePendingTitle")}</T>
              </Row>
              <T v="caption" style={{ marginTop: 4 }} testID="store-pending-units">
                {pending.map((r) => Object.entries(r.units).map(([u, n]) => `${formatNumber(n)} ${u}`).join(", ")).join(" · ")}
              </T>
              <T v="caption" style={{ color: colors.muted }}>
                {t("storePendingHint")}
              </T>
              <Button title={t("storeClaim")} icon="download" disabled={!worldId || claim.isPending} loading={claim.isPending} style={{ marginTop: spacing.sm }} onPress={() => claim.mutateAsync().then((r) => show(fmt(t("storeClaimed"), { name: r.settlement_name ?? "" }), "success")).catch(showError)} testID="store-claim-button" />
            </Panel>
          ) : null}

          <View style={s.tabs}>
            <Chip label={t("storeTabRubies")} selected={tab === "rubies"} onPress={() => setTab("rubies")} testID="store-tab-rubies" />
            <Chip label={t("storeTabSkins")} selected={tab === "skins"} onPress={() => setTab("skins")} testID="store-tab-skins" />
          </View>

          {tab === "rubies" ? (
            <View style={{ gap: spacing.sm }} testID="store-packs">
              {d.packs.map((p) => {
                const bonus = bonusLine(p, t);
                return (
                  <Pressable key={p.product_id} style={[s.pack, bonus?.hot && s.packHot]} onPress={() => buyPack(p)} disabled={buying !== null} testID={`store-pack-${p.key}`} accessibilityRole="button">
                    <View style={s.gem}>
                      <Icon name={PACK_ICON[p.key] ?? "diamond"} size={26} color={colors.brandPrimary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <T v="label">{t(`storePack_${p.key}` as StringKey)}</T>
                      <Row style={{ gap: 4 }}>
                        <Icon name="diamond" size={13} color={colors.brandPrimary} />
                        <T v="body" style={{ fontWeight: "700" }} testID={`store-pack-${p.key}-rubies`}>
                          {formatNumber(p.rubies)}
                        </T>
                        <T v="caption">{t("rubies")}</T>
                      </Row>
                      {bonus ? (
                        <View style={[s.ribbon, { backgroundColor: bonus.hot ? colors.brandPrimary : colors.surfaceTertiary }]} testID={`store-pack-${p.key}-bonus`}>
                          <T v="caption" style={{ color: bonus.hot ? colors.onBrandPrimary : colors.onSurfaceSecondary, fontWeight: "700" }}>
                            {bonus.text}
                          </T>
                        </View>
                      ) : null}
                    </View>
                    <View style={[s.price, !live && s.priceOff]} testID={`store-pack-${p.key}-price`}>
                      <T v="label" style={{ color: live ? colors.onBrandPrimary : colors.onSurface }}>
                        {packages[p.product_id]?.product.priceString ?? `€ ${p.price_eur.toFixed(2).replace(".", ",")}`}
                      </T>
                    </View>
                  </Pressable>
                );
              })}
              <T v="caption" style={{ color: colors.muted, textAlign: "center" }} testID="store-packs-hint">
                {t("storePacksHint")}
              </T>
            </View>
          ) : (
            <View testID="store-skins">
              <CastlePreview skin={picked} level={level} crest={house.data?.house.crest ?? null} testID="store-skin-preview" />
              <Row style={{ justifyContent: "space-between", marginTop: spacing.sm }}>
                <T v="heading" testID="store-skin-name">
                  {skinName(picked)}
                </T>
                {pickedSkin ? (
                  <Row style={{ gap: 4 }}>
                    <Icon name={pickedSkin.owned ? "check-decagram" : "diamond"} size={16} color={pickedSkin.owned ? colors.success : colors.brandPrimary} />
                    <T v="label" style={{ color: pickedSkin.owned ? colors.success : colors.brandPrimary }} testID="store-skin-price">
                      {pickedSkin.owned ? t("storeOwned") : formatNumber(pickedSkin.price_rubies)}
                    </T>
                  </Row>
                ) : null}
              </Row>
              <T v="caption" style={{ color: colors.muted }}>
                {t("storeSkinsHint")}
              </T>
              <View style={s.grid}>
                {d.skins.map((k) => {
                  const def = CASTLE_SKINS[k.id];
                  const sel = k.id === picked;
                  return (
                    <Pressable key={k.id} onPress={() => setPicked(k.id)} style={[s.skin, { borderColor: sel ? colors.brandPrimary : colors.border, backgroundColor: sel ? colors.brandTertiary : colors.surfaceSecondary }]} testID={`store-skin-${k.id}`} accessibilityState={{ selected: sel }}>
                      <Icon name={SKIN_ICON[k.id] ?? "castle"} size={20} color={sel ? colors.brandPrimary : colors.onSurface} />
                      <View style={s.swatches}>
                        {[def?.stone, def?.roof, def?.glow ?? def?.trim].map((hex, i) => (
                          <View key={i} style={[s.swatch, { backgroundColor: hex ?? colors.surfaceTertiary }]} />
                        ))}
                      </View>
                      <T v="caption" style={{ textAlign: "center", color: colors.onSurface }} numberOfLines={2}>
                        {skinName(k.id)}
                      </T>
                      {k.owned ? (
                        <Row style={{ gap: 2 }}>
                          <Icon name="check-decagram" size={12} color={colors.success} />
                          <T v="caption" style={{ color: colors.success }} testID={`store-skin-${k.id}-state`}>
                            {t("storeOwned")}
                          </T>
                        </Row>
                      ) : (
                        <View style={s.tierChip}>
                          <Row style={{ gap: 2 }}>
                            <Icon name="diamond" size={10} color={colors.brandPrimary} />
                            <T v="caption" testID={`store-skin-${k.id}-state`}>
                              {formatNumber(k.price_rubies)}
                            </T>
                          </Row>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
              <Panel style={{ marginTop: spacing.md }}>
                {pickedSkin?.owned ? (
                  <Button
                    title={settlement.data?.skin === picked ? t("skinCurrent") : t("storeApplySkin")}
                    icon="castle"
                    disabled={!worldId || !settlementId || settlement.data?.skin === picked || setSkin.isPending}
                    loading={setSkin.isPending}
                    onPress={() =>
                      setSkin
                        .mutateAsync(picked)
                        .then(() => show(t("skinApplied"), "success"))
                        .catch(showError)
                    }
                    testID="store-skin-apply"
                  />
                ) : (
                  <Button title={`${t("storeBuy")} · ${formatNumber(pickedSkin?.price_rubies ?? 0)}`} icon="diamond" disabled={!pickedSkin || d.rubies < (pickedSkin?.price_rubies ?? 0)} onPress={() => pickedSkin && setConfirm(pickedSkin)} testID="store-skin-buy" />
                )}
                {pickedSkin && !pickedSkin.owned && d.rubies < pickedSkin.price_rubies ? (
                  <T v="caption" style={{ color: colors.warning, marginTop: 6, textAlign: "center" }} testID="store-skin-missing">
                    {fmt(t("storeMissingRubies"), { n: formatNumber(pickedSkin.price_rubies - d.rubies) })}
                  </T>
                ) : null}
              </Panel>
            </View>
          )}
        </ScrollView>
      )}

      <Sheet
        visible={!!confirm}
        onClose={() => setConfirm(null)}
        title={t("storeConfirmTitle")}
        testID="store-confirm-sheet"
        footer={
          <Row style={{ gap: spacing.sm }}>
            <Button title={t("cancel")} variant="ghost" style={{ flex: 1 }} onPress={() => setConfirm(null)} testID="store-confirm-cancel" />
            <Button
              title={`${t("storeBuy")} · ${formatNumber(confirm?.price_rubies ?? 0)}`}
              icon="diamond"
              style={{ flex: 1 }}
              loading={buySkin.isPending}
              disabled={buySkin.isPending}
              onPress={() =>
                confirm &&
                buySkin
                  .mutateAsync(confirm.id)
                  .then((r) => {
                    setConfirm(null);
                    show(fmt(t("storeBought"), { name: skinName(r.bought) }), "success");
                  })
                  .catch(showError)
              }
              testID="store-confirm-buy"
            />
          </Row>
        }
      >
        {confirm ? (
          <View style={{ gap: spacing.xs }}>
            <T v="body">{fmt(t("storeConfirmBody"), { name: skinName(confirm.id), n: formatNumber(confirm.price_rubies) })}</T>
            <T v="caption" style={{ color: colors.muted }}>
              {t("storeSkinsHint")}
            </T>
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={info} onClose={() => setInfo(false)} title={t("storeBillingSoon")} testID="store-info-sheet" footer={<Button title={t("ok")} onPress={() => setInfo(false)} testID="store-info-ok" />}>
        <T v="body">{t("storeBillingSoonBody")}</T>
      </Sheet>
    </Screen>
  );
}
