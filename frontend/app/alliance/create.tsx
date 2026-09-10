import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type AllianceKind, useAllianceMutations } from "@/src/api/hooks";
import { BackButton, useAllianceStyles } from "@/src/components/alliance/common";
import { Screen, useToast } from "@/src/components/overlay";
import { Button, Icon, Panel, Row, T } from "@/src/components/ui";
import { useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  content: { padding: spacing.md, gap: spacing.md },
  kind: { flex: 1, borderRadius: radius.md, borderWidth: 2, padding: spacing.sm, gap: 4, backgroundColor: c.surfaceTertiary, minHeight: 44 },
}));

/** Found a new alliance: name, tag and — irrevocably — its kind (Structured vs Mercenary, Bible §19). */
export default function CreateAllianceScreen() {
  const s = useStyles();
  const cs = useAllianceStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { worldId } = useGame();
  const mm = useAllianceMutations(worldId ?? "");
  const { show, showError } = useToast();
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [kind, setKind] = useState<AllianceKind>("STRUCTURED");
  const [description, setDescription] = useState("");
  const valid = name.trim().length >= 3 && /^[A-Za-z0-9]{2,5}$/.test(tag.trim());

  const submit = async () => {
    try {
      await mm.create.mutateAsync({ name: name.trim(), tag: tag.trim().toUpperCase(), kind, description: description.trim() || null });
      show(t("allianceCreated"), "success");
      router.back();
    } catch (e) {
      showError(e);
    }
  };

  return (
    <Screen title={t("createAlliance")} testID="alliance-create-screen" left={<BackButton testID="alliance-create-back" />}>
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
        <Panel>
          <T v="label">{t("allianceKind")}</T>
          <Row style={{ marginTop: spacing.sm, alignItems: "stretch" }}>
            {(["STRUCTURED", "MERCENARY"] as AllianceKind[]).map((k) => {
              const sel = kind === k;
              const merc = k === "MERCENARY";
              return (
                <Pressable key={k} onPress={() => setKind(k)} style={[s.kind, { borderColor: sel ? (merc ? colors.factionEnemy : colors.brandPrimary) : colors.border }]} testID={`alliance-kind-${k}`}>
                  <Row>
                    <Icon name={merc ? "sword" : "shield-crown"} size={18} color={merc ? colors.factionEnemy : colors.brandPrimary} />
                    <T v="label" style={{ color: colors.onSurface }}>
                      {merc ? t("kindMercenary") : t("kindStructured")}
                    </T>
                  </Row>
                  <T v="caption">{merc ? t("kindMercenaryDesc") : t("kindStructuredDesc")}</T>
                </Pressable>
              );
            })}
          </Row>
        </Panel>
        <Panel>
          <T v="label">{t("allianceName")}</T>
          <TextInput style={[cs.input, { marginTop: 6 }]} value={name} onChangeText={setName} maxLength={24} placeholder="Lords of the Dragon" placeholderTextColor={colors.muted} testID="alliance-name-input" />
          <T v="label" style={{ marginTop: spacing.sm }}>
            {t("allianceTag")}
          </T>
          <TextInput style={[cs.input, { marginTop: 6 }]} value={tag} onChangeText={(v) => setTag(v.toUpperCase())} maxLength={5} autoCapitalize="characters" placeholder="LOTD" placeholderTextColor={colors.muted} testID="alliance-tag-input" />
          <T v="label" style={{ marginTop: spacing.sm }}>
            {t("allianceDescription")}
          </T>
          <TextInput style={[cs.input, { marginTop: 6, minHeight: 72 }]} value={description} onChangeText={setDescription} maxLength={200} multiline placeholderTextColor={colors.muted} testID="alliance-description-input" />
        </Panel>
        <View>
          <Button title={t("createAlliance")} icon="shield-plus" disabled={!valid} loading={mm.create.isPending} onPress={submit} testID="alliance-create-submit" />
        </View>
      </ScrollView>
    </Screen>
  );
}
