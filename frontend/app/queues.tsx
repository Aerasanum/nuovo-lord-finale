import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSettlementMutations } from "@/src/api/hooks";
import { Screen, useToast } from "@/src/components/overlay";
import { Empty, Icon, LoadState, Panel, Row, T } from "@/src/components/ui";
import { useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, spacing, useTheme } from "@/src/theme";

import { JobLine } from "./(tabs)/settlement";

const useStyles = makeStyles(() => ({
  content: { padding: spacing.md, gap: spacing.md },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
}));

export default function QueuesScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { worldId, settlementId, settlement } = useGame();
  const m = useSettlementMutations(worldId ?? "", settlementId ?? "");
  const { showError } = useToast();
  const d = settlement.data;
  if (!worldId || !settlementId) return null;
  const groups: [string, string[]][] = [
    [t("constructionQueues"), ["BUILDING", "SETTLEMENT_UPGRADE", "SENTINEL_BUILD"]],
    [t("researchQueues"), ["RESEARCH"]],
    [t("recruit"), ["RECRUIT", "SHIP"]],
  ];
  return (
    <Screen
      title={`${t("queues")} · ${t("timers")}`}
      testID="queues-screen"
      left={
        <Pressable style={s.back} onPress={() => router.back()} testID="queues-back-button">
          <Icon name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
      }
    >
      {!d ? (
        <LoadState query={settlement} />
      ) : d.jobs.length === 0 ? (
        <Empty icon="timer-sand-empty" title="—" subtitle={t("serverAuthority")} testID="queues-empty" />
      ) : (
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]}>
          {groups.map(([title, kinds]) => {
            const jobs = d.jobs.filter((j) => kinds.includes(j.kind));
            return (
              <Panel key={title} testID={`queues-group-${kinds[0]}`}>
                <Row style={{ justifyContent: "space-between" }}>
                  <T v="heading">{title}</T>
                  <T v="caption">
                    {jobs.length}
                    {kinds[0] === "BUILDING" ? `/${d.construction_queues}` : kinds[0] === "RESEARCH" ? `/${d.research_queues}` : ""}
                  </T>
                </Row>
                {jobs.length === 0 ? <T v="caption">—</T> : jobs.map((j) => <JobLine key={j.job_id} job={j} onCancel={() => m.cancelJob.mutateAsync(j.job_id).catch(showError)} />)}
              </Panel>
            );
          })}
          <View>
            <T v="caption">{`server_time ${d.server_time}`}</T>
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}
