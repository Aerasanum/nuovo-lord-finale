import { useRouter } from "expo-router";
import React from "react";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type RubyTx, useWallet } from "@/src/api/hooks";
import { BackButton } from "@/src/components/alliance/common";
import { Screen } from "@/src/components/overlay";
import { Button, Empty, Icon, LoadState, Panel, Row, T } from "@/src/components/ui";
import { formatNumber, type StringKey, useI18n } from "@/src/i18n";
import { CASTLE_SKINS } from "@/src/map3d/castle";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  header: { margin: spacing.md, marginBottom: spacing.sm, gap: spacing.sm },
  row: { marginHorizontal: spacing.md, marginBottom: spacing.sm, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 56 },
  amount: { minWidth: 72, alignItems: "flex-end" },
}));

const KIND_ICON: Record<string, string> = { FINISH_JOB: "fast-forward", QA_GRANT: "flask", COSMETIC_HOUSE_RENAME: "rename-box", SPECIALIZATION_CHANGE: "account-star", STORE_PACK: "google-play", CASTLE_SKIN_PURCHASE: "castle", CASTLE_TELEPORT: "swap-horizontal-bold" };

/** Ruby wallet (Bible §23): account-level balance, disabled store notice (empty catalog), append-only transactions. */
export default function WalletScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { worldId } = useGame();
  const q = useWallet();

  const effectLine = (tx: RubyTx) => {
    const e = tx.effect ?? {};
    if (tx.kind === "FINISH_JOB") return `${e.target ?? e.kind}${e.target_level ? ` → L${e.target_level}` : ""}${e.count ? ` ×${e.count}` : ""} · ${e.remaining_minutes} min`;
    if (tx.kind === "COSMETIC_HOUSE_RENAME") return `${e.from} → ${e.to}`;
    if (tx.kind === "SPECIALIZATION_CHANGE") return `${e.from ?? "—"} → ${e.to}`;
    if (tx.kind === "STORE_PACK") return `${e.product_id ?? ""}${e.multiplier && e.multiplier > 1 ? ` · ×${e.multiplier}` : ""}${e.bonus === "CASTLE_SKIN_FALLBACK" ? ` · ${t("storeSkinFallback")}` : ""}`;
    if (tx.kind === "CASTLE_SKIN_PURCHASE") return `${CASTLE_SKINS[e.skin]?.name[lang === "it" ? "it" : "en"] ?? e.skin ?? ""}`;
    return "";
  };

  const render = ({ item: tx }: { item: RubyTx }) => {
    const k = `tx${tx.kind}` as StringKey;
    return (
      <View style={s.row} testID={`wallet-tx-${tx.transaction_id}`}>
        <Icon name={(KIND_ICON[tx.kind] ?? "diamond") as any} size={20} color={tx.amount >= 0 ? colors.success : colors.brandPrimary} />
        <View style={{ flex: 1 }}>
          <T v="label" style={{ color: colors.onSurface }} numberOfLines={1}>
            {t(k) === k ? tx.kind : t(k)}
          </T>
          <T v="caption" numberOfLines={1}>
            {new Date(tx.at).toLocaleString()} {effectLine(tx) ? `· ${effectLine(tx)}` : ""}
          </T>
        </View>
        <View style={s.amount}>
          <T v="label" style={{ color: tx.amount >= 0 ? colors.success : colors.brandPrimary }}>
            {tx.amount >= 0 ? "+" : ""}
            {formatNumber(tx.amount)}
          </T>
          <T v="caption">{formatNumber(tx.balance_after)}</T>
        </View>
      </View>
    );
  };

  return (
    <Screen title={t("wallet")} testID="wallet-screen" left={<BackButton testID="wallet-back" />}>
      {!q.data ? (
        <LoadState query={q} />
      ) : (
        <FlatList
          data={q.data.transactions}
          keyExtractor={(tx) => tx.transaction_id}
          renderItem={render}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          refreshing={q.isRefetching}
          onRefresh={() => q.refetch()}
          ListHeaderComponent={
            <View style={s.header}>
              <Panel testID="wallet-balance">
                <Row style={{ justifyContent: "space-between" }}>
                  <T v="heading">{t("rubies")}</T>
                  <Row>
                    <Icon name="diamond" size={22} color={colors.brandPrimary} />
                    <T v="title" testID="wallet-amount">
                      {formatNumber(q.data.rubies)}
                    </T>
                  </Row>
                </Row>
                <T v="caption" style={{ marginTop: 6, color: colors.muted }}>
                  {t("finishNowHint")}
                </T>
                <Button title={t("store")} icon="storefront" style={{ marginTop: spacing.sm }} onPress={() => router.push("/store")} testID="wallet-store-button" />
                {worldId ? <Button title={t("specialization")} icon="account-star" variant="secondary" style={{ marginTop: spacing.sm }} onPress={() => router.push("/specialization")} testID="wallet-specialization-button" /> : null}
              </Panel>
              <T v="heading">{t("transactions")}</T>
            </View>
          }
          ListEmptyComponent={<Empty icon="diamond-outline" title={t("noTransactions")} testID="wallet-empty" />}
        />
      )}
    </Screen>
  );
}
