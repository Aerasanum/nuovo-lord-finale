import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type DiplomacyAction, useAllianceMutations, useAlliancePublic, useMyAlliance } from "@/src/api/hooks";
import { BackButton, KindBadge, RoleBadge, TagChip } from "@/src/components/alliance/common";
import { Screen, useToast } from "@/src/components/overlay";
import { Button, Countdown, Icon, LoadState, Panel, Row, T } from "@/src/components/ui";
import { relationLabel } from "@/src/game/alliances";
import { useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  content: { padding: spacing.md, gap: spacing.md },
  kv: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  memberRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6, borderTopWidth: 1, borderTopColor: c.border, minHeight: 40 },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
}));

/** Public alliance page + the diplomacy actions my alliance can take towards it (Bible §19: PNA, war vote, peace, hire). */
export default function AlliancePublicScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { worldId } = useGame();
  const q = useAlliancePublic(worldId, id);
  const mineQ = useMyAlliance(worldId);
  const mm = useAllianceMutations(worldId ?? "");
  const { show, showError } = useToast();
  const a = q.data;
  const mine = mineQ.data?.alliance ?? null;
  if (!a) return <LoadState query={q} />;
  const isMine = mine?.alliance_id === a.alliance_id;
  const rel = mine?.relations.find((r) => r.alliance_id === a.alliance_id) ?? null;
  const state = rel?.state ?? "NEUTRAL";
  const can = (p: string) => !!mine && mine.permissions.includes(p);
  const act = (action: DiplomacyAction, msg?: string) => () =>
    mm.diplomacy
      .mutateAsync({ other_id: a.alliance_id, action })
      .then(() => (msg ? show(msg, "success") : undefined))
      .catch(showError);
  const peaceLocked = !!rel?.locked_by_contract_id;

  return (
    <Screen title={a.name} testID="alliance-public-screen" left={<BackButton testID="alliance-public-back" />}>
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Panel>
          <Row>
            <TagChip tag={a.tag} testID="alliance-public-tag" />
            <T v="heading" style={{ flex: 1 }} numberOfLines={1} testID="alliance-public-name">
              {a.name}
            </T>
            <KindBadge kind={a.kind} testID="alliance-public-kind" />
          </Row>
          {a.description ? (
            <T v="caption" style={{ marginTop: 6 }}>
              {a.description}
            </T>
          ) : null}
          <T v="caption" style={{ marginTop: 6 }}>
            {t("members")} {a.member_count}/{a.cap} · {t("leader")} {a.leader_house ?? "—"}
            {a.kind === "MERCENARY" ? ` · ${t("mercPrestige")} ${a.mercenary_prestige} · ${a.contracts_completed} ${t("contractsCompleted")}` : ""}
          </T>
          <T v="caption">{a.kind === "STRUCTURED" ? t("pyramidEligible") : t("pyramidNotEligible")}</T>
        </Panel>

        {mine && !isMine ? (
          <Panel testID="alliance-public-diplomacy">
            <Row style={s.kv}>
              <T v="heading">{t("diplomacy")}</T>
              <Row>
                <Icon name={state === "WAR" ? "sword-cross" : state === "PNA" ? "handshake" : "circle-outline"} size={16} color={state === "WAR" ? colors.error : state === "PNA" ? colors.success : colors.muted} />
                <T v="label" style={{ color: state === "WAR" ? colors.error : colors.onSurface }} testID="alliance-public-relation">
                  {relationLabel(t, state)}
                </T>
                {rel?.until ? <Countdown endsAt={rel.until} /> : null}
              </Row>
            </Row>
            {rel?.pna_proposal ? (
              <T v="caption" style={{ marginTop: 4 }} testID="alliance-public-pna-proposal">
                {rel.pna_proposal.mine ? t("pnaProposalPending") : `${t("pnaProposalReceived")} ${rel.pna_proposal.by_name ?? a.name}`}
              </T>
            ) : null}
            {rel?.peace_proposal ? (
              <T v="caption" style={{ marginTop: 4 }} testID="alliance-public-peace-proposal">
                {rel.peace_proposal.mine ? t("peaceProposalPending") : `${t("peaceProposalReceived")} ${rel.peace_proposal.by_name ?? a.name}`} · <Countdown endsAt={rel.peace_proposal.expires_at} />
              </T>
            ) : null}
            {["PNA", "PNA_NOTICE", "PEACE_PENDING"].includes(state) ? (
              <T v="caption" style={{ marginTop: 4, color: colors.warning }}>
                {t("hostileBlocked")}
              </T>
            ) : null}
            <View style={s.actions}>
              {state === "NEUTRAL" && !rel?.pna_proposal && can("pna") ? <Button title={t("proposePna")} icon="handshake" variant="secondary" onPress={act("pna_propose")} testID="alliance-public-pna-propose" /> : null}
              {state === "NEUTRAL" && rel?.pna_proposal && !rel.pna_proposal.mine && can("pna") ? (
                <Row style={{ gap: spacing.sm }}>
                  <Button title={t("acceptPna")} icon="check" style={{ flex: 1 }} onPress={act("pna_accept", t("dipState_PNA"))} testID="alliance-public-pna-accept" />
                  <Button title={t("declinePna")} variant="ghost" style={{ flex: 1 }} onPress={act("pna_decline")} testID="alliance-public-pna-decline" />
                </Row>
              ) : null}
              {state === "NEUTRAL" && rel?.pna_proposal?.mine && can("pna") ? <Button title={t("withdrawOffer")} variant="ghost" onPress={act("pna_decline")} testID="alliance-public-pna-withdraw" /> : null}
              {state === "PNA" && can("pna") ? <Button title={t("terminatePna")} icon="handshake-outline" variant="secondary" onPress={act("pna_terminate")} testID="alliance-public-pna-terminate" /> : null}
              {!["WAR", "PEACE_PENDING"].includes(state) && can("war_proposal") ? (
                mine.kind === "STRUCTURED" ? (
                  <Button title={t("proposeWar")} icon="sword-cross" variant="danger" onPress={act("war_propose", t("dipState_WAR_VOTE_OPEN"))} testID="alliance-public-war-propose" />
                ) : (
                  <T v="caption" style={{ color: colors.muted }} testID="alliance-public-war-blocked">
                    {t("onlyStructuredWar")}
                  </T>
                )
              ) : null}
              {state === "WAR" && !rel?.peace_proposal && can("peace_proposal") && !peaceLocked ? <Button title={t("proposePeace")} icon="peace" variant="secondary" onPress={act("peace_propose")} testID="alliance-public-peace-propose" /> : null}
              {state === "WAR" && rel?.peace_proposal && !rel.peace_proposal.mine && can("peace") && !peaceLocked ? <Button title={t("acceptPeace")} icon="peace" onPress={act("peace_accept", t("dipState_PEACE_PENDING"))} testID="alliance-public-peace-accept" /> : null}
              {state === "WAR" && peaceLocked ? (
                <Row>
                  <Icon name="lock" size={14} color={colors.warning} />
                  <T v="caption" testID="alliance-public-peace-locked">
                    {t("peaceLocked")}
                  </T>
                </Row>
              ) : null}
              {can("mercenary") ? <Button title={t("hireMercenaries")} icon="sword" variant="secondary" onPress={() => router.push({ pathname: "/alliance/mercenary", params: { target: a.alliance_id } })} testID="alliance-public-hire" /> : null}
            </View>
          </Panel>
        ) : null}

        <Panel testID="alliance-public-members">
          <T v="heading">
            {t("members")} ({a.members?.length ?? a.member_count})
          </T>
          {(a.members ?? []).map((m, i) => (
            <View key={`${m.house_name}-${i}`} style={s.memberRow}>
              <T v="label" style={{ color: colors.onSurface }} numberOfLines={1}>
                {m.house_name}
              </T>
              <RoleBadge role={m.role} />
            </View>
          ))}
        </Panel>
      </ScrollView>
    </Screen>
  );
}
