import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { BattleDto, InboxItem } from "@/src/api/hooks";
import { useBattles, useInbox, useInboxMutations } from "@/src/api/hooks";
import { Screen } from "@/src/components/overlay";
import { Button, Chip, chipRowStyles, Empty, Icon, Loading, Row, T, type IconName } from "@/src/components/ui";
import { diplomacyStateLabel } from "@/src/game/alliances";
import { cargoLine, cargoTotal } from "@/src/game/caravans";
import { missionName } from "@/src/game/missions";
import { fmt, formatNumber, tDyn, useI18n } from "@/src/i18n";
import { missionLabel } from "@/src/map3d/MapLabels";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  item: { marginHorizontal: spacing.md, marginBottom: spacing.sm, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: spacing.sm, gap: 4 },
  unread: { borderColor: c.brandSecondary },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.brandPrimary },
  tabs: { flexDirection: "row", paddingHorizontal: spacing.md, gap: spacing.sm, height: 56, alignItems: "center" },
}));

const EVENT_ICON: Record<string, IconName> = {
  PYRAMID_STATE_CHANGED: "pyramid",
  PYRAMID_ATTACK_INCOMING: "alert-octagon",
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
  NEGOTIATION_MESSAGE: "handshake",
  HOSTILE_MARCH_DETECTED: "alert-octagon",
  MISSION_COMPLETED: "compass-outline",
  CARAVAN_STATE: "truck-delivery",
  BATTLE_RESOLVED: "sword-cross",
  ALLIANCE_INVITE: "shield-plus",
  DIPLOMACY_STATE_CHANGED: "handshake",
  MERCENARY_OFFER: "sword",
  MERCENARY_CONTRACT_ACTIVE: "sword-cross",
  MERCENARY_CONTRACT_ENDED: "trophy",
  EMERALD_TREASURY_MOVEMENT: "diamond-stone",
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

  const humanize = (code: unknown) => String(code ?? "").replace(/_/g, " ").toLowerCase();
  const jobState = (st: unknown) => tDyn(t, `jobState_${st}`, humanize(st));
  const describe = (n: InboxItem) => {
    const p = n.payload || {};
    switch (n.event) {
      case "BUILD_JOB_STATE":
        return `${p.target ?? t("evt_BUILD_JOB_STATE")}${p.target_level ? ` ${t("level")} ${p.target_level}` : ""} · ${jobState(p.state)}`;
      case "SETTLEMENT_UPGRADE_STATE":
        return `${tDyn(t, `settlementState_${p.state}`, jobState(p.state))}${p.new_level ? ` · ${t("settlementLevel")} ${p.new_level}` : ""}`;
      case "RESEARCH_JOB_STATE":
        return `${p.research_name ?? p.research_key ?? t("evt_RESEARCH_JOB_STATE")}${p.level ? ` ${t("level")} ${p.level}` : ""} · ${jobState(p.state)}`;
      case "RECRUITMENT_JOB_STATE":
        return `${p.unit_key ?? ""}${p.batch ? ` ×${formatNumber(p.batch)}` : ""} · ${jobState(p.state)}`;
      case "MARCH_DEPARTED":
        return `${missionLabel(p.mission_type ?? "", t)} → ${p.target_name ?? ""}`;
      case "MARCH_ARRIVED":
        return `${tDyn(t, `marchResult_${p.result}`, humanize(p.result))}${p.returned && Object.keys(p.returned).length ? ` · ${t("returning")} ${formatNumber(Object.values(p.returned as Record<string, number>).reduce((a, c) => a + c, 0))} ${t("unitsShort")}` : ""}`;
      case "MARCH_RETURNED":
        return `${t("returning")} · ${Object.entries(p.units || {}).map(([u, c]) => `${u} ${c}`).join(", ") || "—"}${p.reason ? ` · ${tDyn(t, `returnReason_${p.reason}`, humanize(p.reason))}` : ""}`;
      case "BATTLE_REPORT_READY":
        return `${missionLabel(p.mission ?? "", t)} · ${p.target_name ?? ""} · ${t("winner")}: ${p.winner === "ATTACKER" ? t("attacker") : t("defender")}`;
      case "BATTLE_RESOLVED":
        return `${missionLabel(p.mission ?? "", t)} · ${t("winner")}: ${p.winner === "ATTACKER" ? t("attacker") : t("defender")}${cargoTotal(p.loot) > 0 ? ` · ${t("loot")} ${cargoLine(p.loot, lang)}` : ""}`;
      case "OWNERSHIP_CHANGED":
        return p.lost ? `${t("enemy")} · ${p.x},${p.y}` : `${t("conquered")} · ${p.x},${p.y} · ${t("level")} ${p.new_level}`;
      case "SENTINEL_LOST":
        return `${p.sector} · ${tDyn(t, `sentinelState_${p.state ?? "GRACE"}`, humanize(p.state ?? "GRACE"))}${p.grace_deadline ? ` · ${new Date(p.grace_deadline).toLocaleString(lang)}` : ""}`;
      case "LOYALTY_CHANGED":
        return fmt(t("loyaltyChangedLine"), { loyalty: p.loyalty ?? "", reduction: p.reduction ?? "" });
      case "HOSTILE_MARCH_DETECTED": {
        const it = p.intel_disclosure || {};
        return `${t("hostileMarchDetected")} → ${p.target_name ?? ""} · ${t("heading")} ${p.heading ?? t("unknown")} · ${t("entryTile")} ${p.entry_tile ? `${p.entry_tile[0]},${p.entry_tile[1]}` : t("unknown")} · ${t("intelScore")} ${it.intel_score ?? 0}`;
      }
      case "MISSION_COMPLETED": {
        const r = p.reward || {};
        const key = String(p.mission_key ?? "");
        const name = p.name ?? (key.startsWith("achievement:") ? `${t("achievements")} · ${tDyn(t, `track_${key.slice(12)}`, humanize(key.slice(12)))}` : tDyn(t, `prestigeReason_${key}`, missionName(t, key, humanize(key))));
        const bits = [name, r.prestige ? `+${r.prestige} ★` : null, r.title ? r.title : null, r.cosmetic_unlock ?? r.heraldic_unlock ?? null].filter(Boolean);
        return bits.join(" · ");
      }
      case "ALLIANCE_INVITE":
        return `${t("inviteEvent")} [${p.tag}] ${p.alliance_name} · ${p.kind === "MERCENARY" ? t("kindMercenary") : t("kindStructured")} · ${t("role")}: ${t(`role${p.role}` as any)} · ${t("invitedBy")} ${p.sender_house}`;
      case "DIPLOMACY_STATE_CHANGED":
        return `${diplomacyStateLabel(t, p.state)}${p.other_name ? ` · [${p.other_tag}] ${p.other_name}` : p.alliance_name ? ` · ${p.alliance_name}` : ""}`;
      case "MERCENARY_OFFER":
        return `${t("offerEvent")}: ${p.client_name} → ${t("contractTarget")} ${p.target_name} · ${formatNumber(p.emerald_offer)} ${t("emeralds")} · ${p.duration_hours}${t("hours")}`;
      case "MERCENARY_CONTRACT_ACTIVE":
        return `${t("contractActiveEvent")}: ${p.provider_name} vs ${p.target_name} (${t("client")} ${p.client_name}) · ${formatNumber(p.escrow)} ${t("emeralds")} · ${p.duration_hours}${t("hours")}`;
      case "MERCENARY_CONTRACT_ENDED":
        return `${t("contractEndedEvent")}: ${tDyn(t, `contractResult_${p.result}`, humanize(p.result))} · ${formatNumber(p.escrow)} ${t("emeralds")}${p.prestige_delta ? ` · +${p.prestige_delta} ★` : ""}`;
      case "EMERALD_TREASURY_MOVEMENT":
        return `${t("treasuryEvent")}: ${p.amount > 0 ? "+" : ""}${formatNumber(p.amount)} ${t("emeralds")} · ${tDyn(t, `ledger_${p.reason}`, humanize(p.reason))} · ${formatNumber(p.balance_after)}`;
      case "CARAVAN_STATE": {
        if (p.state === "DELIVERED") return `${t("caravanDelivered")} → ${p.target_name ?? ""} · ${cargoLine(p.delivered, lang) || "—"}${cargoTotal(p.overflow) > 0 ? ` · ${t("overflowReturning")} ${formatNumber(cargoTotal(p.overflow))}` : ""}`;
        if (p.state === "INTERCEPTED") return `${t("caravanIntercepted")} · ${t("losses")} ${formatNumber(cargoTotal(p.lost))}${cargoTotal(p.returning) > 0 ? ` · ${t("caravanReturning")} ${formatNumber(cargoTotal(p.returning))}` : ""}`;
        return `${t("caravan")} → ${p.target_name ?? ""} · ${cargoLine(p.cargo, lang) || "—"}`;
      }
      case "PYRAMID_ATTACK_INCOMING":
        return `${t("pyramidAttackIncomingEvent")}${p.attacker_alliance_tag ? ` · ${t("pyramidAlertFrom")} [${p.attacker_alliance_tag}]` : ""}${p.eta ? ` · ${new Date(p.eta).toLocaleString(lang)}` : ""}`;
      case "PYRAMID_STATE_CHANGED":
        return `${t("pyramid")} · ${t(`pyrState_${p.state}` as any)}${p.owner_tag ? ` · [${p.owner_tag}]` : ""}${p.deadline ? ` · ${new Date(p.deadline).toLocaleString(lang)}` : ""}`;
      case "NEGOTIATION_MESSAGE":
        return `[${p.from_tag ?? ""}] ${p.house_name ?? p.from_alliance ?? ""}: ${p.preview ?? ""}`;
      default:
        return [p.target_name, p.name, p.state ? jobState(p.state) : null].filter(Boolean).join(" · ") || humanize(n.event);
    }
  };

  const open = (n: InboxItem) => {
    if (!n.read_at) mut.read.mutate(n.notification_id);
    if ((n.event === "BATTLE_REPORT_READY" || n.event === "BATTLE_RESOLVED") && n.payload?.battle_id) router.push({ pathname: "/battle/[id]", params: { id: n.payload.battle_id } });
    else if (n.deep_link?.startsWith("battle/")) router.push({ pathname: "/battle/[id]", params: { id: n.deep_link.slice("battle/".length) } });
    else if (n.deep_link?.startsWith("pyramid")) router.push("/pyramid");
    else if (n.deep_link?.startsWith("research")) router.push("/research");
    else if (n.deep_link?.startsWith("caravans")) router.push("/caravans");
    else if (n.deep_link === "alliance/diplomacy") router.push("/alliance/diplomacy");
    else if (n.deep_link === "alliance/treasury") router.push("/alliance/treasury");
    else if (n.deep_link === "alliance/mercenary") router.push("/alliance/mercenary");
    else if (n.deep_link?.startsWith("alliance")) router.push("/(tabs)/alliance");
    else if (n.deep_link?.startsWith("map")) router.push("/marches");
    else if (n.deep_link?.startsWith("army")) router.push("/(tabs)/army");
    else if (n.deep_link?.startsWith("settlement")) router.push("/(tabs)/settlement");
    else if (n.deep_link?.startsWith("missions")) router.push("/(tabs)/missions");
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
                    <T v="label">{tDyn(t, `evt_${n.event}`, humanize(n.event))}</T>
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
                    {missionLabel(b.mission, t)} · {b.target_name}
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
