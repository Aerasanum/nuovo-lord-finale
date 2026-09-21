import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type TeleportCandidate, useTeleportCandidates, useTeleportMutation } from "@/src/api/hooks";
import { Screen, Sheet, useToast } from "@/src/components/overlay";
import { BackButton } from "@/src/components/alliance/common";
import { Button, Empty, Icon, Loading, Panel, Row, T } from "@/src/components/ui";
import { fmt, formatNumber, tDyn, useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { focusOnMap } from "@/src/utils/mapFocus";

const useStyles = makeStyles((c) => ({
  card: { marginHorizontal: spacing.md, marginBottom: spacing.sm, gap: spacing.sm },
  price: { flexDirection: "row", alignItems: "center", gap: 6 },
  priceText: { fontFamily: fonts.display, fontSize: 22, color: c.brandPrimary },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.divider, minHeight: 60 },
  coord: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  warn: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", padding: spacing.sm, borderRadius: radius.md, backgroundColor: c.surfaceTertiary },
}));

export default function TeleportScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { show, showError } = useToast();
  const { worldId, settlementId, settlement } = useGame();
  const d = settlement.data;
  const isMother = !!d?.is_mother;
  const q = useTeleportCandidates(worldId, settlementId, !!d && !isMother);
  const m = useTeleportMutation(worldId || "", settlementId || "");
  const [pending, setPending] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<TeleportCandidate | null>(null);

  const run = (c: TeleportCandidate) => {
    setPending(c.slot_id);
    m.mutateAsync(c.slot_id)
      .then((r) => {
        setConfirming(null);
        show(fmt(t("tpDone"), { to: `${r.x},${r.y}` }), "success");
        focusOnMap(router, r.x, r.y, "replace");
      })
      .catch(showError)
      .finally(() => setPending(null));
  };

  const showOnMap = (x: number, y: number) => focusOnMap(router, x, y);

  return (
    <Screen title={t("tpTitle")} left={<BackButton testID="teleport-back" />} testID="teleport-screen">
      {!d ? (
        <Loading />
      ) : isMother ? (
        <Empty icon="castle" title={t("tpTitle")} subtitle={t("tpMotherHint")} testID="teleport-mother" />
      ) : q.isLoading ? (
        <Loading />
      ) : !q.data ? (
        <Empty icon="alert" title={t("tpTitle")} subtitle={t("error")} />
      ) : (
        <FlatList
          data={q.data.candidates}
          keyExtractor={(c) => c.slot_id}
          contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: insets.bottom + spacing.lg }}
          ListHeaderComponent={
            <>
              <Panel style={s.card} testID="teleport-intro">
                <Row>
                  <Icon name="swap-horizontal-bold" size={24} color={colors.brandPrimary} />
                  <T v="heading" style={{ flex: 1 }}>
                    {d.name.includes(`${d.x},${d.y}`) ? d.name : `${d.name} · ${d.x},${d.y}`}
                  </T>
                </Row>
                <T v="caption">{t("tpIntro")}</T>
                <Row style={{ justifyContent: "space-between" }}>
                  <T v="label">{t("tpPrice")}</T>
                  <View style={s.price}>
                    <Icon name="diamond-stone" size={18} color={colors.brandPrimary} />
                    <T style={s.priceText} testID="teleport-price">
                      {formatNumber(q.data.price_rubies)}
                    </T>
                    <T v="caption" testID="teleport-rubies">
                      / {formatNumber(q.data.rubies)}
                    </T>
                  </View>
                </Row>
                {q.data.needs_port ? (
                  <View style={s.warn}>
                    <Icon name="anchor" size={16} color={colors.onSurfaceSecondary} />
                    <T v="caption" style={{ flex: 1 }}>
                      {t("tpNeedsPort")}
                    </T>
                  </View>
                ) : null}
                {q.data.blocked ? (
                  <View style={s.warn} testID="teleport-blocked">
                    <Icon name="alert" size={16} color={colors.error} />
                    <T v="caption" style={{ flex: 1 }}>
                      {t("tpBlockedMarches")}
                    </T>
                  </View>
                ) : null}
              </Panel>
              <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xs }}>
                <T v="heading">
                  {t("tpCandidates")} · {q.data.total}
                </T>
              </View>
            </>
          }
          ListEmptyComponent={<Empty icon="castle" title={t("tpCandidates")} subtitle={t("tpNoCandidates")} testID="teleport-empty" />}
          renderItem={({ item: c }) => (
            <View style={s.row} testID={`teleport-candidate-${c.slot_id}`}>
              <Pressable style={s.coord} onPress={() => showOnMap(c.x, c.y)} testID={`teleport-map-${c.slot_id}`} accessibilityLabel={t("gmShowOnMap")}>
                <Icon name="map-marker-radius" size={22} color={colors.onSurfaceSecondary} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <T v="body">
                  {c.x},{c.y}
                </T>
                <T v="caption">
                  {c.distance_from_mother} {t("tiles")} {t("tpFromMother")} · {tDyn(t, c.terrain ?? "", c.terrain ?? "")}
                  {c.port_eligible ? " · ⚓" : ""}
                </T>
              </View>
              <Button title={t("tpChoose")} variant="secondary" disabled={!!q.data?.blocked || (q.data?.rubies ?? 0) < (q.data?.price_rubies ?? 0)} onPress={() => setConfirming(c)} testID={`teleport-choose-${c.slot_id}`} />
            </View>
          )}
        />
      )}
      <Sheet visible={!!confirming} onClose={() => setConfirming(null)} title={t("tpConfirmTitle")} testID="teleport-confirm-sheet">
        {confirming && d && q.data ? (
          <>
            <T v="body" testID="teleport-confirm-body">
              {fmt(t("tpConfirmBody"), { name: d.name, from: `${d.x},${d.y}`, to: `${confirming.x},${confirming.y}`, price: formatNumber(q.data.price_rubies) })}
            </T>
            <Row style={{ gap: spacing.sm, marginTop: spacing.md }}>
              <Button title={t("cancel")} variant="secondary" onPress={() => setConfirming(null)} testID="teleport-cancel-button" style={{ flex: 1 }} />
              <Button title={t("confirm")} icon="swap-horizontal-bold" loading={pending === confirming.slot_id} onPress={() => run(confirming)} testID="teleport-confirm-button" style={{ flex: 1 }} />
            </Row>
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
