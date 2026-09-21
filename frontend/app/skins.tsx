import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type SkinCatalog, useHouse, useSetSkin, useSettlementSkins } from "@/src/api/hooks";
import { Screen, useToast } from "@/src/components/overlay";
import { Button, Icon, Loading, Panel, Row, T } from "@/src/components/ui";
import { formatNumber, useI18n } from "@/src/i18n";
import { CASTLE_SKINS } from "@/src/map3d/castle";
import { CastlePreview } from "@/src/map3d/CastlePreview";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  list: { gap: spacing.sm, marginTop: spacing.md },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary },
  cardSelected: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  cardLocked: { opacity: 0.6 },
  swatches: { flexDirection: "row", gap: 3 },
  swatch: { width: 14, height: 26, borderRadius: 3 },
  badge: { paddingHorizontal: 8, height: 22, borderRadius: radius.pill, justifyContent: "center" },
}));

/** Castle skin picker (per settlement): live 3D preview + level-gated catalogue from the server. */
export default function SkinsScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { worldId, settlementId, settlement } = useGame();
  const q = useSettlementSkins(worldId, settlementId);
  const house = useHouse(worldId);
  const set = useSetSkin(worldId ?? "", settlementId ?? "");
  const { showError, show } = useToast();
  const [picked, setPicked] = useState<string | null>(null);

  // Start on the skin currently in use, as soon as the catalog arrives (adjusted during render, not in an effect).
  if (q.data && !picked) setPicked(q.data.current);

  if (!worldId || !settlementId) return null;
  const cat = q.data;
  const level = cat?.level ?? settlement.data?.level ?? 1;
  const current = cat?.current ?? "classic";
  const sel = picked ?? current;
  const selEntry = cat?.skins.find((k) => k.id === sel);
  const canApply = !!selEntry && selEntry.unlocked && sel !== current;
  const lockedLine = (k: SkinCatalog["skins"][number]) => (k.premium ? `${t("store")} · ${formatNumber(k.price_rubies ?? 0)} ${t("rubies")}` : `${t("skinUnlockAt")} ${k.min_level}`);

  return (
    <Screen
      title={t("castleSkin")}
      testID="skins-screen"
      left={
        <Pressable style={s.back} onPress={() => router.back()} testID="skins-back-button">
          <Icon name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
      }
    >
      {!cat ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + spacing.xl }}>
          <CastlePreview skin={sel} level={level} crest={house.data?.house.crest ?? null} testID="skins-preview" />
          <Row style={{ justifyContent: "space-between", marginTop: spacing.sm }}>
            <T v="caption">
              {t("skinPreview")}: {CASTLE_SKINS[sel]?.name[lang === "it" ? "it" : "en"] ?? sel}
            </T>
            <T v="caption" testID="skins-level">
              {t("yourLevel")} {level}
            </T>
          </Row>
          <T v="caption" style={{ color: colors.muted, marginTop: spacing.xs }}>
            {t("castleSkinHint")}
          </T>
          <Button title={t("storeSkinsCta")} icon="storefront" variant="secondary" style={{ marginTop: spacing.sm }} onPress={() => router.push("/store")} testID="skins-store-button" />

          <View style={s.list}>
            {cat.skins.map((k) => {
              const def = CASTLE_SKINS[k.id];
              const isCurrent = k.id === current;
              const isSel = k.id === sel;
              return (
                <Pressable key={k.id} onPress={() => setPicked(k.id)} style={[s.card, isSel && s.cardSelected, !k.unlocked && s.cardLocked]} testID={`skin-card-${k.id}`} accessibilityState={{ selected: isSel, disabled: !k.unlocked }}>
                  <View style={s.swatches}>
                    {[def?.stone, def?.roof, def?.glow ?? def?.trim].map((hex, i) => (
                      <View key={i} style={[s.swatch, { backgroundColor: hex ?? colors.surfaceTertiary }]} />
                    ))}
                  </View>
                  <View style={{ flex: 1 }}>
                    <T v="label">{def?.name[lang === "it" ? "it" : "en"] ?? k.id}</T>
                    <T v="caption" testID={`skin-card-${k.id}-req`}>
                      {k.unlocked ? (k.premium ? t("storeOwned") : `${t("settlementLevel")} ≥ ${k.min_level}`) : lockedLine(k)}
                    </T>
                  </View>
                  {isCurrent ? (
                    <View style={[s.badge, { backgroundColor: colors.success }]} testID={`skin-card-${k.id}-current`}>
                      <T v="caption" style={{ color: colors.onSuccess }}>
                        {t("skinCurrent")}
                      </T>
                    </View>
                  ) : !k.unlocked ? (
                    <Icon name="lock" size={18} color={colors.muted} />
                  ) : (
                    <Icon name={isSel ? "check-circle" : "circle-outline"} size={20} color={isSel ? colors.brandPrimary : colors.muted} />
                  )}
                </Pressable>
              );
            })}
          </View>

          <Panel style={{ marginTop: spacing.md }}>
            <Button
              title={selEntry && !selEntry.unlocked ? (selEntry.premium ? `${t("storeBuy")} · ${formatNumber(selEntry.price_rubies ?? 0)}` : `${t("skinLocked")} · ${t("skinUnlockAt")} ${selEntry.min_level}`) : t("skinApply")}
              icon={selEntry && !selEntry.unlocked ? (selEntry.premium ? "storefront" : "lock") : "check"}
              disabled={(!canApply && !(selEntry && !selEntry.unlocked && selEntry.premium)) || set.isPending}
              loading={set.isPending}
              onPress={() =>
                selEntry && !selEntry.unlocked && selEntry.premium
                  ? router.push("/store")
                  : set
                      .mutateAsync(sel)
                      .then(() => show(t("skinApplied"), "success"))
                      .catch(showError)
              }
              testID="skins-apply-button"
            />
          </Panel>
        </ScrollView>
      )}
    </Screen>
  );
}
