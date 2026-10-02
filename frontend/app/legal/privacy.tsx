/** Privacy notice. Public route: Play Console needs a URL that works without an account. */
import { useRouter } from "expo-router";
import React from "react";

import { Button, Panel, T } from "@/src/components/ui";
import { useI18n } from "@/src/i18n";
import { privacyPolicy } from "@/src/legal/content";
import { LegalPage } from "@/src/legal/LegalPage";
import { spacing } from "@/src/theme";

export default function PrivacyScreen() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const doc = privacyPolicy(lang);

  return (
    <LegalPage
      title={t("privacyTitle")}
      updated={doc.updated}
      intro={doc.intro}
      sections={doc.sections}
      testID="privacy-screen"
      footer={
        <Panel>
          <T v="label">{t("deleteAccount")}</T>
          <T v="caption" style={{ marginTop: 4 }}>
            {t("deleteAccountLead")}
          </T>
          <Button
            title={t("deleteAccountHow")}
            icon="account-remove-outline"
            variant="secondary"
            style={{ marginTop: spacing.sm }}
            onPress={() => router.push("/legal/delete-account")}
            testID="privacy-to-deletion"
          />
        </Panel>
      }
    />
  );
}
