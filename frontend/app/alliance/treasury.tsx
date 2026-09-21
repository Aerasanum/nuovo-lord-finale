import { useRouter } from "expo-router";
import React from "react";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type TreasuryDto, useAllianceTreasury, useMyAlliance } from "@/src/api/hooks";
import { BackButton, TagChip } from "@/src/components/alliance/common";
import { Screen } from "@/src/components/overlay";
import { Empty, Icon, LoadState, Panel, Row, T } from "@/src/components/ui";
import { formatNumber, tDyn, useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  header: { margin: spacing.md, marginBottom: spacing.sm },
  row: { marginHorizontal: spacing.md, marginBottom: spacing.sm, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 56 },
  amount: { minWidth: 72, alignItems: "flex-end" },
}));

const REASON_ICON: Record<string, string> = {
  pvp_defense_win: "shield-check",
  pvp_conquest: "castle",
  first_mission_of_day: "compass-outline",
  mercenary_escrow: "lock",
  mercenary_escrow_refund: "undo",
  mercenary_contract_success: "trophy",
  qa_grant: "flask",
};

/** Emerald treasury (Bible §19 / §40.3): balance + append-only ledger — Leader/Vice only. */
export default function AllianceTreasuryScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { worldId } = useGame();
  const mine = useMyAlliance(worldId);
  const a = mine.data?.alliance ?? null;
  const allowed = !!a && a.permissions.includes("treasury");
  const q = useAllianceTreasury(worldId, allowed);
  if (mine.data && !a) {
    router.back();
    return null;
  }

  const render = ({ item: e }: { item: TreasuryDto["entries"][number] }) => (
    <View style={s.row} testID={`ledger-${e.ledger_id}`}>
      <Icon name={(REASON_ICON[e.reason] ?? "diamond-stone") as any} size={20} color={e.amount >= 0 ? colors.success : colors.warning} />
      <View style={{ flex: 1 }}>
        <T v="label" style={{ color: colors.onSurface }} numberOfLines={1}>
          {tDyn(t, `ledger_${e.reason}`, e.reason.replace(/_/g, " "))}
        </T>
        <T v="caption" numberOfLines={1}>
          {new Date(e.at).toLocaleString()} {e.ref ? `· ${e.ref}` : ""}
        </T>
      </View>
      <View style={s.amount}>
        <T v="label" style={{ color: e.amount >= 0 ? colors.success : colors.warning }}>
          {e.amount >= 0 ? "+" : ""}
          {formatNumber(e.amount)}
        </T>
        <T v="caption">{formatNumber(e.balance_after)}</T>
      </View>
    </View>
  );

  return (
    <Screen title={t("treasury")} testID="alliance-treasury-screen" left={<BackButton testID="alliance-treasury-back" />}>
      {!a ? (
        <LoadState query={mine} />
      ) : !allowed ? (
        <Empty icon="lock" title={t("treasuryPrivate")} testID="alliance-treasury-private" />
      ) : !q.data ? (
        <LoadState query={q} />
      ) : (
        <FlatList
          data={q.data.entries}
          keyExtractor={(e) => e.ledger_id}
          renderItem={render}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          refreshing={q.isRefetching}
          onRefresh={() => q.refetch()}
          ListHeaderComponent={
            <Panel style={s.header} testID="alliance-treasury-balance">
              <Row style={{ justifyContent: "space-between" }}>
                <Row>
                  <TagChip tag={a.tag} />
                  <T v="heading">{t("emeralds")}</T>
                </Row>
                <Row>
                  <Icon name="diamond-stone" size={22} color={colors.success} />
                  <T v="title" testID="alliance-treasury-amount">
                    {formatNumber(q.data.emeralds)}
                  </T>
                </Row>
              </Row>
              <T v="caption" style={{ marginTop: 4 }}>
                {t("treasuryPrivate")}
              </T>
            </Panel>
          }
          ListEmptyComponent={<Empty icon="diamond-stone" title={t("ledger")} subtitle={t("ledgerEmpty")} testID="alliance-ledger-empty" />}
        />
      )}
    </Screen>
  );
}
