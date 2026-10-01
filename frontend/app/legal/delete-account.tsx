/**
 * Account erasure notice. Public route: Google's User Data policy wants a deletion path a person can follow
 * without installing the app, so this page has to explain the whole thing to a visitor who is not signed in —
 * and offer the shortcut to anyone who is.
 */
import { useRouter } from "expo-router";
import React from "react";

import { Button, Panel, T } from "@/src/components/ui";
import { useI18n } from "@/src/i18n";
import { deletionNotice } from "@/src/legal/content";
import { LegalPage } from "@/src/legal/LegalPage";
import { useAuth } from "@/src/state/AuthContext";
import { spacing } from "@/src/theme";

export default function DeleteAccountScreen() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const { account } = useAuth();
  const doc = deletionNotice(lang);

  return (
    <LegalPage
      title={t("deleteAccount")}
      updated={doc.updated}
      intro={doc.intro}
      sections={doc.sections}
      testID="deletion-screen"
      footer={
        <Panel>
          {account ? (
            <>
              <T v="caption">{t("deleteAccountSignedIn")}</T>
              <Button
                title={t("settings")}
                icon="cog-outline"
                variant="secondary"
                style={{ marginTop: spacing.sm }}
                onPress={() => router.push("/settings")}
                testID="deletion-to-settings"
              />
            </>
          ) : (
            <>
              <T v="caption">{t("deleteAccountSignIn")}</T>
              <Button title={t("login")} icon="login" variant="secondary" style={{ marginTop: spacing.sm }} onPress={() => router.push("/login")} testID="deletion-to-login" />
            </>
          )}
        </Panel>
      }
    />
  );
}
