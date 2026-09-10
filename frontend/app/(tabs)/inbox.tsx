import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { BattleDto, InboxItem } from "@/src/api/hooks";
import { useBattles, useInbox, useInboxMutations } from "@/src/api/hooks";
import { Screen } from "@/src/components/overlay";
import { Button, Chip, chipRowStyles, Empty, Icon, Loading, Row, T, type IconName } from "@/src/components/ui";
import { useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  item: { marginHorizontal: spacing.md, marginBottom: spacing.sm, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: spacing.sm, gap: 4 },
  unread: { borderColor: c.brandSecondary },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.brandPrimary },
  tabs: { flexDirection: "row", paddingHorizontal: spacing.md, gap: spacing.sm, height: 56, alignItems: "center" },
}));

const EVENT_ICON: Record<string, IconName> = {
  BUILD_JOB_STATE: "hammer",
  SETTLEMENT_UPGRADE_STATE: "castle",
  RESEARCH_JOB_STATE: "flask",
  RECRUITMENT_JOB_STATE: "account-plus",
  MARCH_DEPARTED: "flag",
  MARCH_ARRIVED: "flag-checkered",
  MARCH_RETURNED: "home",
  BATTLE_REPORT_READY: "sword-cross",
  OWNERSHIP_CHANGED: "crown",
  SENTINEL_LOST: "tower-fire",
  LOYALTY_CHANGED: "heart-broken",
  HOSTILE_MARCH_DETECTED: "alert-octagon",
};

export default function InboxScreen() {
  const s = useStyles();
  const cs = chipRowStyles();
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { worldId } = useGame();
  const inbox = useInbox(worldId);
  const battles = useBattles(worldId);
  const mut = useInboxMutations(worldId ?? "");
  const [tab, setTab] = useState<"inbox" | "reports">("inbox");
  if (!worldId) return null;

  const describe = (n: InboxItem) => {
    const p = n.payload || {};
    switch (n.event) {
      case "BUILD_JOB_STATE":
        return `${p.target ?? ""}${p.target_level ? ` L${p.target_level}` : ""} · ${p.state}`;
      case "SETTLEMENT_UPGRADE_STATE":
        return `${t("settlementLevel")} ${p.new_level ?? ""} · ${p.state}`;
      case "RESEARCH_JOB_STATE":
        return `${p.research_key} L${p.level} · ${p.state}`;
      case "RECRUITMENT_JOB_STATE":
        return `${p.unit_key} ×${p.batch} · ${p.state}`;
      case "MARCH_DEPARTED":
        return `${p.mission_type} → ${p.target_name}`;
      case "MARCH_ARRIVED":
        return `${p.result}`;
      case "MARCH_RETURNED":
        return `${t("returning")} · ${Object.entries(p.units || {}).map(([u, c]) => `${u} ${c}`).join(", ") || "—"}`;
      case "BATTLE_REPORT_READY":
        return `${p.mission} · ${p.target_name} · ${t("winner")}: ${p.winner}`;
      case "OWNERSHIP_CHANGED":
        return p.lost ? `${t("enemy")} · ${p.x},${p.y}` : `${t("conquered")} · ${p.x},${p.y} · L${p.new_level}`;
      case "SENTINEL_LOST":
        return `${p.sector} · ${p.state ?? "GRACE"}${p.grace_deadline ? ` · ${new Date(p.grace_deadline).toLocaleString(lang)}` : ""}`;
      case "HOSTILE_MARCH_DETECTED": {
        const it = p.intel_disclosure || {};
        return `${t("hostileMarchDetected")} → ${p.target_name ?? ""} · ${t("heading")} ${p.heading ?? t("unknown")} · ${t("entryTile")} ${p.entry_tile ? `${p.entry_tile[0]},${p.entry_tile[1]}` : t("unknown")} · ${t("intelScore")} ${it.intel_score ?? 0}`;
      }
      default:
        return JSON.stringify(p).slice(0, 80);
    }
  };

  const open = (n: InboxItem) => {
    if (!n.read_at) mut.read.mutate(n.notification_id);
    if (n.event === "BATTLE_REPORT_READY" && n.payload?.battle_id) router.push({ pathname: "/battle/[id]", params: { id: n.payload.battle_id } });
    else if (n.deep_link?.startsWith("research")) router.push("/research");
    else if (n.deep_link?.startsWith("map")) router.push("/marches");
    else if (n.deep_link?.startsWith("army")) router.push("/(tabs)/army");
    else if (n.deep_link?.startsWith("settlement")) router.push("/(tabs)/settlement");
  };

  return (
    <Screen
      title={t("inbox")}
      testID="inbox-screen"
      right={tab === "inbox" && (inbox.data?.unread ?? 0) > 0 ? <Button title={t("markAllRead")} variant="ghost" onPress={() => mut.readAll.mutate()} testID="inbox-read-all" /> : undefined}
    >
      <View style={[cs.row, s.tabs]}>
        <Chip label={`${t("inbox")}${inbox.data?.unread ? ` (${inbox.data.unread})` : ""}`} selected={tab === "inbox"} onPress={() => setTab("inbox")} testID="inbox-tab-inbox" />
        <Chip label={t("reports")} selected={tab === "reports"} onPress={() => setTab("reports")} testID="inbox-tab-reports" />
      </View>
      {tab === "inbox" ? (
        inbox.isLoading ? (
          <Loading />
        ) : (
          <FlatList
            data={inbox.data?.items ?? []}
            keyExtractor={(n) => n.notification_id}
            contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: insets.bottom + spacing.lg }}
            refreshing={inbox.isRefetching}
            onRefresh={() => inbox.refetch()}
            ListEmptyComponent={<Empty icon="email-open-outline" title={t("noNotifications")} testID="inbox-empty" />}
            renderItem={({ item: n }) => (
              <Pressable style={[s.item, !n.read_at && s.unread]} onPress={() => open(n)} testID={`inbox-item-${n.notification_id}`}>
                <Row style={{ justifyContent: "space-between" }}>
                  <Row>
                    <Icon name={EVENT_ICON[n.event] ?? "bell"} size={18} color={n.severity === "CRITICAL" || n.severity === "HIGH" ? colors.error : n.severity === "WARNING" ? colors.warning : colors.brandPrimary} />
                    <T v="label">{n.event.replace(/_/g, " ")}</T>
                  </Row>
                  <Row>
                    <T v="caption">{new Date(n.created_at_utc).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" })}</T>
                    {!n.read_at ? <View style={s.dot} /> : null}
                  </Row>
                </Row>
                <T v="body" numberOfLines={2}>
                  {describe(n)}
                </T>
              </Pressable>
            )}
          />
        )
      ) : battles.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={battles.data?.battles ?? []}
          keyExtractor={(b) => b.battle_id}
          contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: insets.bottom + spacing.lg }}
          refreshing={battles.isRefetching}
          onRefresh={() => battles.refetch()}
          ListEmptyComponent={<Empty icon="sword-cross" title={t("noReports")} testID="reports-empty" />}
          renderItem={({ item: b }: { item: BattleDto }) => (
            <Pressable style={s.item} onPress={() => router.push({ pathname: "/battle/[id]", params: { id: b.battle_id } })} testID={`battle-item-${b.battle_id}`}>
              <Row style={{ justifyContent: "space-between" }}>
                <Row>
                  <Icon name="sword-cross" size={18} color={b.report.winner === "ATTACKER" ? colors.success : colors.error} />
                  <T v="label">
                    {b.mission} · {b.target_name}
                  </T>
                </Row>
                <T v="caption">{new Date(b.created_at).toLocaleString(lang, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</T>
              </Row>
              <T v="body">
                {t("winner")}: {b.report.winner === "ATTACKER" ? t("attacker") : t("defender")} · {t("losses")}: {Object.values(b.report.attacker_losses || {}).reduce((a: number, c: any) => a + c, 0)} / {Object.values(b.report.defender_losses || {}).reduce((a: number, c: any) => a + c, 0)}
                {b.ownership_result?.changed ? ` · ${t("conquered")}` : ""}
              </T>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}
