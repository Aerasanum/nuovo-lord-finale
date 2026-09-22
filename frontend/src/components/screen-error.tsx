// Per-screen crash panel (spec.error_ux.local_error_boundary_per_core_route).
//
// Passed to each navigator as `unstable_screenErrorBoundary`, so a render crash is contained to the screen that
// threw it: the tab bar, the chat dock and the player's place in the app all survive, and going back works. Before
// this, one bad screen blanked the whole app and the only way out was a full reload.
//
// It lives apart from src/components/error-boundary.tsx on purpose. That one is the last resort, mounted above the
// providers, so it has to keep working when the theme or the translations are what failed — which is why its text
// is hardcoded English and its only offer is a reload. This one renders inside the providers and can use them.

import { useRouter } from "expo-router";
import type { ErrorBoundaryProps } from "expo-router";
import { View } from "react-native";

import { Button, Icon, T } from "@/src/components/ui";
import { useI18n } from "@/src/i18n";
import { makeStyles, useTheme } from "@/src/theme";

export function ScreenErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  return (
    <View style={styles.container} testID="screen-error">
      <Icon name="alert-circle-outline" size={40} color={colors.muted} />
      <T v="heading">{t("error")}</T>
      <T v="caption">{t("errorScreen")}</T>
      {__DEV__ ? <T v="caption">{error.message}</T> : null}
      <View style={styles.actions}>
        <Button title={t("retry")} icon="refresh" onPress={() => retry()} testID="screen-error-retry" />
        {router.canGoBack() ? (
          <Button title={t("back")} icon="arrow-left" variant="secondary" onPress={() => router.back()} testID="screen-error-back" />
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 24,
    backgroundColor: colors.surface,
  },
  actions: {
    marginTop: 8,
    gap: 8,
    alignSelf: "stretch",
    // Full width is right on a phone; on a tablet or the web preview it would stretch the buttons across the view.
    maxWidth: 420,
    width: "100%",
    marginHorizontal: "auto",
  },
}));
