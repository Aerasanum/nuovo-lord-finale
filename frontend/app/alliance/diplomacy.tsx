import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type RelationDto, type VoteDto, useAllianceMutations, useMyAlliance } from "@/src/api/hooks";
import { BackButton, KindBadge, TagChip } from "@/src/components/alliance/common";
import { Screen, useToast } from "@/src/components/overlay";
import { Button, Countdown, Empty, Icon, Loading, Panel, ProgressBar, Row, T } from "@/src/components/ui";
import { relationLabel } from "@/src/game/alliances";
import { useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  content: { padding: spacing.md, gap: spacing.md },
  kv: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rel: { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: c.border, gap: 4, minHeight: 44 },
  vote: { gap: 6, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: c.border },
}));

/** Relations (PNA / war / peace with timers) and open 12h war votes of my alliance. */
export default function AllianceDiplomacyScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { worldId, player } = useGame();
  const q = useMyAlliance(worldId);
  const mm = useAllianceMutations(worldId ?? "");
  const { show, showError } = useToast();
  const a = q.data?.alliance;
  if (!q.data) return <Loading />;
  if (!a) {
    router.back();
    return null;
  }
  const canVote = a.permissions.includes("war_vote");

  const stateColor = (st: RelationDto["state"]) => (st === "WAR" ? colors.error : st === "PNA" ? colors.success : st === "PEACE_PENDING" || st === "PNA_NOTICE" ? colors.warning : colors.muted);

  const renderRel = (r: RelationDto) => (
    <Pressable key={r.relation_id} style={s.rel} onPress={() => r.alliance_id && router.push({ pathname: "/alliance/[id]", params: { id: r.alliance_id } })} testID={`relation-${r.alliance_id}`}>
      <Row style={s.kv}>
        <Row style={{ flex: 1 }}>
          <TagChip tag={r.tag} />
          <T v="label" style={{ flex: 1, color: colors.onSurface }} numberOfLines={1}>
            {r.name}
          </T>
          <KindBadge kind={r.kind} />
        </Row>
      </Row>
      <Row style={s.kv}>
        <Row>
          <Icon name={r.state === "WAR" ? "sword-cross" : r.state === "PNA" ? "handshake" : r.state === "PEACE_PENDING" ? "peace" : "handshake-outline"} size={16} color={stateColor(r.state)} />
          <T v="label" style={{ color: stateColor(r.state) }} testID={`relation-${r.alliance_id}-state`}>
            {relationLabel(t, r.state)}
            {r.state === "WAR" && r.war_reason ? ` (${r.war_reason === "MERCENARY_CONTRACT" ? t("warByContract") : t("warByVote")})` : ""}
          </T>
        </Row>
        {r.until ? <Countdown endsAt={r.until} testID={`relation-${r.alliance_id}-until`} /> : null}
      </Row>
      {r.pna_proposal ? <T v="caption">{r.pna_proposal.mine ? t("pnaProposalPending") : `${t("pnaProposalReceived")} ${r.pna_proposal.by_name ?? r.name}`}</T> : null}
      {r.peace_proposal ? <T v="caption">{r.peace_proposal.mine ? t("peaceProposalPending") : `${t("peaceProposalReceived")} ${r.peace_proposal.by_name ?? r.name}`}</T> : null}
      {r.locked_by_contract_id ? (
        <T v="caption" style={{ color: colors.warning }}>
          {t("peaceLocked")}
        </T>
      ) : null}
    </Pressable>
  );

  const renderVote = (v: VoteDto) => {
    const myVote = player?.player_id ? v.votes[player.player_id] : undefined;
    return (
      <View key={v.vote_id} style={s.vote} testID={`vote-${v.vote_id}`}>
        <Row style={s.kv}>
          <Row style={{ flex: 1 }}>
            <Icon name="sword-cross" size={16} color={colors.error} />
            <T v="label" style={{ flex: 1, color: colors.onSurface }} numberOfLines={1}>
              {t("relWAR")} → [{v.target_tag}] {v.target_name}
            </T>
          </Row>
          <Countdown endsAt={v.closes_at} testID={`vote-${v.vote_id}-closes`} />
        </Row>
        <ProgressBar value={v.needed ? Math.min(1, v.yes / v.needed) : 0} />
        <Row style={s.kv}>
          <T v="caption" testID={`vote-${v.vote_id}-tally`}>
            ✓ {v.yes} · ✗ {v.no} · {v.needed} {t("votesNeeded")} · {v.proposed_by_house}
          </T>
          {myVote !== undefined ? (
            <T v="caption" style={{ color: colors.onSurface }} testID={`vote-${v.vote_id}-mine`}>
              {t("voted")}: {myVote ? "✓" : "✗"}
            </T>
          ) : null}
        </Row>
        {canVote && myVote === undefined ? (
          <Row style={{ justifyContent: "flex-end", gap: spacing.sm }}>
            <Button title={t("voteNo")} variant="ghost" onPress={() => mm.vote.mutateAsync({ vote_id: v.vote_id, yes: false }).catch(showError)} testID={`vote-${v.vote_id}-no`} />
            <Button title={t("voteYes")} icon="check" variant="danger" onPress={() => mm.vote.mutateAsync({ vote_id: v.vote_id, yes: true }).then((r) => (r.status === "PASSED" ? show(t("dipState_WAR"), "success") : undefined)).catch(showError)} testID={`vote-${v.vote_id}-yes`} />
          </Row>
        ) : null}
      </View>
    );
  };

  return (
    <Screen title={t("diplomacy")} testID="alliance-diplomacy-screen" left={<BackButton testID="alliance-diplomacy-back" />}>
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Panel testID="alliance-relations">
          <Row style={s.kv}>
            <T v="heading">{t("relations")}</T>
            <Button title={t("allianceDirectory")} variant="ghost" icon="magnify" onPress={() => router.push("/alliance/browse")} testID="alliance-diplomacy-browse" />
          </Row>
          {a.relations.length === 0 ? (
            <T v="caption" style={{ marginTop: 4 }} testID="alliance-relations-empty">
              {t("noRelations")}
            </T>
          ) : (
            a.relations.map(renderRel)
          )}
          <T v="caption" style={{ marginTop: spacing.sm, color: colors.muted }}>
            {t("hostileBlocked")}
          </T>
        </Panel>
        <Panel testID="alliance-votes">
          <T v="heading">
            {t("warVotes")} ({a.open_votes.length})
          </T>
          {a.kind === "MERCENARY" ? (
            <T v="caption" style={{ marginTop: 4 }} testID="alliance-votes-mercenary">
              {t("onlyStructuredWar")}
            </T>
          ) : a.open_votes.length === 0 ? (
            <Empty icon="vote-outline" title={t("warVotes")} subtitle={`${t("votesNeeded")}: ${a.war_vote_roles.map((r) => t(`role${r}`)).join(", ")}`} testID="alliance-votes-empty" />
          ) : (
            a.open_votes.map(renderVote)
          )}
        </Panel>
      </ScrollView>
    </Screen>
  );
}
