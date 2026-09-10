import { useRouter } from "expo-router";
import React from "react";
import { FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { MarchDto } from "@/src/api/hooks";
import { useMarches, useMarchMutations } from "@/src/api/hooks";
import { Screen, useToast } from "@/src/components/overlay";
import { Button, Countdown, Empty, Icon, Loading, ProgressBar, Row, StatePill, T } from "@/src/components/ui";
import { formatNumber, useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  item: { marginHorizontal: spacing.md, marginBottom: spacing.sm, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: spacing.sm, gap: 6 },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
}));

function MarchCard({ m }: { m: MarchDto }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { worldId } = useGame();
  const mm = useMarchMutations(worldId ?? "");
  const { showError } = useToast();
  const end = m.status === "RETURNING" ? m.return_at : m.arrival_at;
  const start = m.status === "RETURNING" ? m.arrival_at ?? m.departed_at : m.departed_at;
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const prog = end && start ? Math.max(0, Math.min(1, (now - Date.parse(start)) / Math.max(1, Date.parse(end) - Date.parse(start)))) : 0;
  return (
    <View style={s.item} testID={`march-card-${m.march_id}`}>
      <Row style={{ justifyContent: "space-between" }}>
        <Row>
          <Icon name={m.naval ? "ferry" : "flag"} size={18} color={colors.brandPrimary} />
          <T v="label">
            {m.mission} → {m.target_name}
          </T>
        </Row>
        <StatePill state={m.status} />
      </Row>
      <T v="caption">
        {Object.entries(m.units)
          .map(([u, c]) => `${u} ${formatNumber(c)}`)
          .join(" · ") || "—"}
        {m.ships ? ` · ${t("ships")} ${m.ships}` : ""}
        {m.result ? ` · ${m.result}` : ""}
      </T>
      <ProgressBar value={prog} />
      <Row style={{ justifyContent: "space-between" }}>
        <T v="caption">
          {m.path.length} {t("tiles")} · {m.speed_tph} {t("speedTph")}
        </T>
        <Countdown endsAt={end} testID={`march-${m.march_id}-eta`} />
      </Row>
      <Row style={{ justifyContent: "flex-end", gap: spacing.sm }}>
        {m.battle_id ? <Button title={t("battle")} variant="ghost" icon="sword-cross" onPress={() => router.push({ pathname: "/battle/[id]", params: { id: m.battle_id! } })} testID={`march-${m.march_id}-battle`} /> : null}
        {m.status === "OUTBOUND" ? <Button title={t("recall")} variant="secondary" icon="undo" onPress={() => mm.recall.mutateAsync(m.march_id).catch(showError)} testID={`march-${m.march_id}-recall`} /> : null}
      </Row>
    </View>
  );
}

export default function MarchesScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { worldId } = useGame();
  const q = useMarches(worldId);
  if (!worldId) return null;
  return (
    <Screen
      title={t("activeMarches")}
      testID="marches-screen"
      left={
        <Pressable style={s.back} onPress={() => router.back()} testID="marches-back-button">
          <Icon name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
      }
    >
      {q.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={q.data?.marches ?? []}
          keyExtractor={(m) => m.march_id}
          contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: insets.bottom + spacing.lg }}
          refreshing={q.isRefetching}
          onRefresh={() => q.refetch()}
          ListEmptyComponent={<Empty icon="flag-outline" title={t("noMarches")} subtitle={t("tapTile")} testID="marches-empty" />}
          renderItem={({ item }) => <MarchCard m={item} />}
        />
      )}
    </Screen>
  );
}
