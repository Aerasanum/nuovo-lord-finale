import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type CrestDto, useHouse, useHouseMutations, usePremiumMutations } from "@/src/api/hooks";
import { Crest } from "@/src/components/Crest";
import { Screen, useToast } from "@/src/components/overlay";
import { Button, Chip, Icon, Loading, Panel, Row, T } from "@/src/components/ui";
import { formatNumber, type StringKey, useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  input: { height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surfaceTertiary, color: c.onSurface, paddingHorizontal: spacing.md, fontFamily: fonts.body, fontSize: 15 },
  swatch: { width: 34, height: 34, borderRadius: radius.pill, borderWidth: 2, marginRight: spacing.xs, marginBottom: spacing.xs },
  section: { marginTop: spacing.md, gap: spacing.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  preview: { alignItems: "center", paddingVertical: spacing.md },
}));

const LAYER_LABEL: Record<string, StringKey> = { none: "none" };

/** Casata panel (Bible §20 / §40.4): name, motto, prestige and the layered crest editor with live preview. */
export default function HouseScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { worldId, rubies } = useGame();
  const q = useHouse(worldId);
  const mut = useHouseMutations(worldId ?? "");
  const pm = usePremiumMutations(worldId ?? "");
  const { showError, show } = useToast();
  const [motto, setMotto] = useState("");
  const [description, setDescription] = useState("");
  const [newName, setNewName] = useState("");
  const [crest, setCrest] = useState<CrestDto | null>(null);
  const RENAME_PRICE = 500;

  useEffect(() => {
    if (q.data && !crest) {
      setCrest(q.data.house.crest);
      setMotto(q.data.house.motto ?? "");
      setDescription(q.data.house.description ?? "");
    }
  }, [q.data, crest]);

  if (!worldId) return null;
  const cat = q.data?.catalog;
  const dirty = !!q.data && (JSON.stringify(crest) !== JSON.stringify(q.data.house.crest) || motto !== (q.data.house.motto ?? "") || description !== (q.data.house.description ?? ""));
  const renameValid = newName.trim().length >= 3 && newName.trim() !== q.data?.house.house_name;
  const invalid = !!crest && crest.colors.base === crest.colors.primary;

  const setColor = (k: keyof CrestDto["colors"], hex: string) => setCrest((c) => (c ? { ...c, colors: { ...c.colors, [k]: hex } } : c));
  const label = (v: string) => (LAYER_LABEL[v] ? t(LAYER_LABEL[v]) : v);

  const swatches = (k: keyof CrestDto["colors"], title: StringKey) => (
    <View style={s.section}>
      <T v="label">{t(title)}</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {(cat?.palette ?? []).map((hex) => (
          <Pressable key={hex} onPress={() => setColor(k, hex)} style={[s.swatch, { backgroundColor: hex, borderColor: crest?.colors[k] === hex ? colors.onSurface : colors.border }]} accessibilityLabel={`${t(title)} ${hex}`} testID={`crest-${k}-${hex.slice(1)}`} />
        ))}
      </View>
    </View>
  );
  const chips = (title: StringKey, values: string[], current: string, onPick: (v: string) => void, prefix: string) => (
    <View style={s.section}>
      <T v="label">{t(title)}</T>
      <View style={s.chips}>
        {values.map((v) => (
          <Chip key={v} label={label(v)} selected={current === v} onPress={() => onPick(v)} testID={`crest-${prefix}-${v}`} />
        ))}
      </View>
    </View>
  );

  return (
    <Screen
      title={t("house")}
      testID="house-screen"
      left={
        <Pressable style={s.back} onPress={() => router.back()} testID="house-back-button">
          <Icon name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
      }
    >
      {!q.data || !crest ? (
        <Loading />
      ) : (
        <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + spacing.xl }} bottomOffset={24} keyboardShouldPersistTaps="handled">
          <Panel>
            <View style={s.preview}>
              <Crest crest={crest} size={120} testID="house-crest-preview" />
              <T v="title" style={{ marginTop: spacing.sm }} testID="house-name">
                {q.data.house.house_name}
              </T>
              <T v="caption">
                {t("prestige")} {q.data.house.prestige}
              </T>
            </View>
            <T v="label">{t("motto")}</T>
            <TextInput testID="house-motto-input" style={s.input} value={motto} onChangeText={setMotto} placeholder="Fortis et fidelis" placeholderTextColor={colors.muted} maxLength={60} />
            <T v="label" style={{ marginTop: spacing.sm }}>
              {t("houseDescription")}
            </T>
            <TextInput testID="house-description-input" style={[s.input, { height: undefined, minHeight: 80, paddingVertical: 10 }]} value={description} onChangeText={setDescription} multiline maxLength={300} placeholderTextColor={colors.muted} />
            <T v="caption" style={{ marginTop: spacing.xs, color: colors.muted }}>
              {t("crestHint")}
            </T>
            <Button
              title={t("save")}
              icon="content-save"
              style={{ marginTop: spacing.sm }}
              disabled={!dirty || invalid || mut.isPending}
              loading={mut.isPending}
              onPress={() =>
                mut
                  .mutateAsync({ motto, crest, description })
                  .then(() => show(t("saved"), "success"))
                  .catch(showError)
              }
              testID="house-save-top-button"
            />
          </Panel>

          <Panel style={{ marginTop: spacing.md }} testID="house-rename-panel">
            <Row style={{ justifyContent: "space-between" }}>
              <Row>
                <Icon name="rename-box" size={18} color={colors.brandPrimary} />
                <T v="heading">{t("renameHouse")}</T>
              </Row>
              <Row>
                <Icon name="diamond" size={14} color={colors.brandPrimary} />
                <T v="caption" testID="house-rename-price">
                  {RENAME_PRICE} · {formatNumber(rubies)}
                </T>
              </Row>
            </Row>
            <T v="caption" style={{ marginTop: 4 }}>
              {t("renameHouseHint")}
            </T>
            <TextInput testID="house-rename-input" style={[s.input, { marginTop: spacing.sm }]} value={newName} onChangeText={setNewName} placeholder={t("newName")} placeholderTextColor={colors.muted} maxLength={40} />
            <Button
              title={`${t("renameHouse")} · ${RENAME_PRICE}`}
              icon="diamond"
              variant="secondary"
              style={{ marginTop: spacing.sm }}
              disabled={!renameValid || rubies < RENAME_PRICE || pm.rename.isPending}
              loading={pm.rename.isPending}
              onPress={() =>
                pm.rename
                  .mutateAsync(newName.trim())
                  .then(() => {
                    show(t("renamed"), "success");
                    setNewName("");
                  })
                  .catch(showError)
              }
              testID="house-rename-button"
            />
            <Button title={t("specialization")} icon="account-star" variant="ghost" style={{ marginTop: spacing.xs }} onPress={() => router.push("/specialization")} testID="house-specialization-button" />
          </Panel>

          <Panel style={{ marginTop: spacing.md }}>
            <Row>
              <Icon name="shield-half-full" size={18} color={colors.brandPrimary} />
              <T v="heading">{t("editCrest")}</T>
            </Row>
            {chips("shieldBase", cat?.shield_bases ?? [], crest.shield_base, (v) => setCrest({ ...crest, shield_base: v as CrestDto["shield_base"] }), "base")}
            {chips("primarySymbol", cat?.symbols ?? [], crest.primary_symbol, (v) => setCrest({ ...crest, primary_symbol: v as CrestDto["primary_symbol"] }), "symbol")}
            {chips("secondaryMark", cat?.marks ?? [], crest.secondary_mark, (v) => setCrest({ ...crest, secondary_mark: v as CrestDto["secondary_mark"] }), "mark")}
            {chips("border", cat?.borders ?? [], crest.border, (v) => setCrest({ ...crest, border: v as CrestDto["border"] }), "border")}
            {swatches("base", "colorBase")}
            {swatches("primary", "colorPrimary")}
            {swatches("secondary", "colorSecondary")}
            {swatches("border", "colorBorder")}
            {invalid ? (
              <T v="caption" style={{ color: colors.error, marginTop: spacing.sm }} testID="house-crest-invalid">
                {t("colorPrimary")} ≠ {t("colorBase")}
              </T>
            ) : null}
            <Button
              title={t("save")}
              icon="content-save"
              style={{ marginTop: spacing.md }}
              disabled={!dirty || invalid || mut.isPending}
              loading={mut.isPending}
              onPress={() =>
                mut
                  .mutateAsync({ motto, crest, description })
                  .then(() => show(t("saved"), "success"))
                  .catch(showError)
              }
              testID="house-save-button"
            />
          </Panel>
        </KeyboardAwareScrollView>
      )}
    </Screen>
  );
}
