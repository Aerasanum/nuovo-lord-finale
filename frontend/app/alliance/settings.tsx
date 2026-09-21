import { useRouter } from "expo-router";
import React, { useState } from "react";
import { TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAllianceMutations, useMyAlliance } from "@/src/api/hooks";
import { BackButton, KindBadge, TagChip, useAllianceStyles } from "@/src/components/alliance/common";
import { Screen, useToast } from "@/src/components/overlay";
import { Button, Loading, Panel, Row, T } from "@/src/components/ui";
import { useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { spacing, useTheme } from "@/src/theme";

/** Leader settings: alliance name (unique per world) and description. The tag never changes. */
export default function AllianceSettingsScreen() {
  const cs = useAllianceStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { worldId } = useGame();
  const q = useMyAlliance(worldId);
  const mm = useAllianceMutations(worldId ?? "");
  const { show, showError } = useToast();
  const a = q.data?.alliance ?? null;
  const [name, setName] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  // Prefill once, the render the alliance arrives (React's "adjust state during render"; an effect here would
  // render the empty form first and then immediately render it again).
  if (a && name === null) {
    setName(a.name);
    setDescription(a.description ?? "");
  }
  if (!q.data) return <Loading />;
  if (!a || !a.permissions.includes("alliance_settings")) {
    router.back();
    return null;
  }
  const dirty = name !== null && (name.trim() !== a.name || (description ?? "") !== (a.description ?? ""));
  const valid = (name ?? "").trim().length >= 3;

  return (
    <Screen title={t("allianceSettings")} testID="alliance-settings-screen" left={<BackButton testID="alliance-settings-back" />}>
      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }} bottomOffset={24} keyboardShouldPersistTaps="handled">
        <Panel>
          <Row>
            <TagChip tag={a.tag} />
            <KindBadge kind={a.kind} />
          </Row>
          <T v="caption" style={{ marginTop: 6 }}>
            {t("allianceSettingsHint")}
          </T>
          <T v="label" style={{ marginTop: spacing.sm }}>
            {t("allianceName")}
          </T>
          <TextInput style={[cs.input, { marginTop: 6 }]} value={name ?? ""} onChangeText={setName} maxLength={24} placeholderTextColor={colors.muted} testID="alliance-settings-name" />
          <T v="label" style={{ marginTop: spacing.sm }}>
            {t("allianceDescription")}
          </T>
          <TextInput style={[cs.input, { marginTop: 6, minHeight: 88 }]} value={description ?? ""} onChangeText={setDescription} maxLength={200} multiline placeholderTextColor={colors.muted} testID="alliance-settings-description" />
          <View style={{ marginTop: spacing.md }}>
            <Button
              title={t("save")}
              icon="content-save"
              disabled={!dirty || !valid}
              loading={mm.settings.isPending}
              onPress={() =>
                mm.settings
                  .mutateAsync({ name: (name ?? "").trim(), description: (description ?? "").trim() })
                  .then(() => {
                    show(t("saved"), "success");
                    router.back();
                  })
                  .catch(showError)
              }
              testID="alliance-settings-save"
            />
          </View>
        </Panel>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
