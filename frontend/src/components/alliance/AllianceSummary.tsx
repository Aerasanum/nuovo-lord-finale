import { useRouter } from "expo-router";
import React from "react";
import { View } from "react-native";

import { useAllianceMutations, useMyAlliance, usePyramid } from "@/src/api/hooks";
import { KindBadge, RoleBadge, TagChip } from "@/src/components/alliance/common";
import { useToast } from "@/src/components/overlay";
import { PyramidAlertBanner, PyramidPhase, PyramidStatePill, pyramidDescription } from "@/src/components/PyramidCard";
import { Button, Countdown, Icon, LoadState, Panel, Row, T } from "@/src/components/ui";
import { formatNumber, useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  content: { padding: spacing.md, gap: spacing.md },
  kv: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tile: { width: "48%", flexGrow: 1, backgroundColor: c.surfaceTertiary, borderRadius: radius.md, padding: spacing.sm, gap: 2 },
  nav: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  navBtn: { width: "48%", flexGrow: 1 },
  inviteRow: { gap: 6, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: c.border },
}));

/** "Alleanza" segment of the Regno tab: lone-wolf state (invites / found / browse) or the alliance dashboard with
 * navigation to members, diplomacy, chat, treasury and the mercenary market. */
export function AllianceSummary() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { worldId } = useGame();
  const q = useMyAlliance(worldId);
  const mm = useAllianceMutations(worldId ?? "");
  const pyramid = usePyramid(worldId);
  const { show, showError } = useToast();
  if (!q.data) return <LoadState query={q} />;
  const { alliance: a, invites, join_cooldown_until } = q.data;

  if (!a) {
    return (
      <View style={s.content} testID="alliance-none">
        <Panel>
          <Row>
            <Icon name="paw" size={22} color={colors.brandPrimary} />
            <T v="heading">{t("noAlliance")}</T>
          </Row>
          <T v="caption" style={{ marginTop: 4 }}>
            {t("noAllianceHint")}
          </T>
          {join_cooldown_until ? (
            <Row style={{ marginTop: spacing.sm }}>
              <Icon name="timer-sand" size={16} color={colors.warning} />
              <T v="caption" testID="alliance-cooldown">
                {t("joinCooldown")}
              </T>
              <Countdown endsAt={join_cooldown_until} />
            </Row>
          ) : null}
          <View style={[s.nav, { marginTop: spacing.md }]}>
            <Button title={t("createAlliance")} icon="shield-plus" style={s.navBtn} disabled={!!join_cooldown_until} onPress={() => router.push("/alliance/create")} testID="alliance-create-button" />
            <Button title={t("browseAlliances")} icon="magnify" variant="secondary" style={s.navBtn} onPress={() => router.push("/alliance/browse")} testID="alliance-browse-button" />
          </View>
        </Panel>
        <Panel testID="alliance-invites">
          <T v="heading">
            {t("invites")} ({invites.length})
          </T>
          {invites.length === 0 ? (
            <T v="caption" style={{ marginTop: 4 }} testID="alliance-invites-empty">
              {t("noInvites")}
            </T>
          ) : (
            invites.map((i) => (
              <View key={i.invite_id} style={s.inviteRow} testID={`invite-${i.invite_id}`}>
                <Row>
                  <TagChip tag={i.alliance_tag} />
                  <T v="label" style={{ flex: 1, color: colors.onSurface }} numberOfLines={1}>
                    {i.alliance_name}
                  </T>
                  <KindBadge kind={i.alliance_kind} />
                </Row>
                <T v="caption">
                  {t("role")}: {t(`role${i.role}`)} · {t("invitedBy")} {i.sender_house} · <Countdown endsAt={i.expires_at} />
                </T>
                <Row style={{ justifyContent: "flex-end", gap: spacing.sm }}>
                  <Button title={t("decline")} variant="ghost" onPress={() => mm.respond.mutateAsync({ invite_id: i.invite_id, accept: false }).catch(showError)} testID={`invite-${i.invite_id}-decline`} />
                  <Button title={t("accept")} icon="check" disabled={!!join_cooldown_until} onPress={() => mm.respond.mutateAsync({ invite_id: i.invite_id, accept: true }).then(() => show(t("allianceCreated"), "success")).catch(showError)} testID={`invite-${i.invite_id}-accept`} />
                </Row>
              </View>
            ))
          )}
        </Panel>
      </View>
    );
  }

  const me = a.members.find((m) => m.is_me);
  const can = (p: string) => a.permissions.includes(p);
  return (
    <View style={s.content} testID="alliance-dashboard">
      <Panel>
        <Row>
          <TagChip tag={a.tag} testID="alliance-tag" />
          <T v="heading" style={{ flex: 1 }} numberOfLines={1} testID="alliance-name">
            {a.name}
          </T>
          <KindBadge kind={a.kind} testID="alliance-kind" />
        </Row>
        <Row style={[s.kv, { marginTop: 6 }]}>
          <Row>
            <T v="caption">{t("role")}:</T>
            <RoleBadge role={a.my_role} testID="alliance-my-role" />
          </Row>
          <T v="caption">{a.pyramid_eligible ? t("pyramidEligible") : t("pyramidNotEligible")}</T>
        </Row>
        {a.description ? (
          <T v="caption" style={{ marginTop: 6 }} numberOfLines={3}>
            {a.description}
          </T>
        ) : null}
        <View style={[s.grid, { marginTop: spacing.sm }]}>
          <View style={s.tile}>
            <T v="caption">{t("members")}</T>
            <T v="label" testID="alliance-members-count">
              {a.member_count} / {a.cap}
            </T>
          </View>
          <View style={s.tile}>
            <T v="caption">{t("emeralds")}</T>
            <T v="label" testID="alliance-emeralds">
              {a.emeralds === null ? "—" : formatNumber(a.emeralds)}
            </T>
          </View>
          <View style={s.tile}>
            <T v="caption">{t("diplomacy")}</T>
            <T v="label" style={{ color: a.at_war ? colors.error : colors.onSurface }} testID="alliance-war-state">
              {a.at_war ? t("atWar") : t("relNEUTRAL")}
              {a.open_votes.length ? ` · ${a.open_votes.length} ${t("warVotes").toLowerCase()}` : ""}
            </T>
          </View>
          <View style={s.tile}>
            <T v="caption">{t("mercenaries")}</T>
            <T v="label" testID="alliance-contracts-count">
              {a.contracts_active} {t("contractsActive")}
            </T>
          </View>
        </View>
        {me?.leaving_at ? (
          <Row style={{ marginTop: spacing.sm }}>
            <Icon name="exit-run" size={16} color={colors.warning} />
            <T v="caption" testID="alliance-leaving">
              {t("leavePending")}
            </T>
            <Countdown endsAt={me.leaving_at} />
            <Button title={t("cancelLeave")} variant="ghost" onPress={() => mm.cancelLeave.mutateAsync().catch(showError)} testID="alliance-cancel-leave" />
          </Row>
        ) : null}
      </Panel>

      <PyramidAlertBanner dto={pyramid.data} onPress={() => router.push("/pyramid")} />
      {pyramid.data ? (
        <Panel testID="alliance-pyramid-tile">
          <Row>
            <Icon name="pyramid" size={20} color={pyramid.data.faction === "OWN" ? colors.factionOwn : pyramid.data.state === "OPEN" ? colors.brandPrimary : colors.muted} />
            <T v="heading" style={{ flex: 1 }}>
              {pyramid.data.name}
              {pyramid.data.owner ? ` · [${pyramid.data.owner.tag}]` : ""}
            </T>
            <PyramidStatePill dto={pyramid.data} />
          </Row>
          <T v="caption" style={{ marginTop: 4 }} numberOfLines={2}>
            {pyramidDescription(t, pyramid.data)}
          </T>
          <View style={{ marginTop: spacing.sm }}>
            <PyramidPhase dto={pyramid.data} />
          </View>
          <Button title={t("pyramidDetails")} icon="pyramid" variant="secondary" style={{ marginTop: spacing.sm }} onPress={() => router.push("/pyramid")} testID="alliance-pyramid-button" />
        </Panel>
      ) : null}

      <View style={s.nav}>
        <Button title={t("members")} icon="account-group" variant="secondary" style={s.navBtn} onPress={() => router.push("/alliance/members")} testID="alliance-nav-members" />
        <Button title={t("diplomacy")} icon="handshake" variant="secondary" style={s.navBtn} onPress={() => router.push("/alliance/diplomacy")} testID="alliance-nav-diplomacy" />
        <Button title={t("chat")} icon="forum" variant="secondary" style={s.navBtn} onPress={() => router.push("/alliance/chat")} testID="alliance-nav-chat" />
        <Button title={t("treasury")} icon="diamond-stone" variant="secondary" style={s.navBtn} disabled={!can("treasury")} onPress={() => router.push("/alliance/treasury")} testID="alliance-nav-treasury" />
        <Button title={t("mercenaries")} icon="sword" variant="secondary" style={s.navBtn} onPress={() => router.push("/alliance/mercenary")} testID="alliance-nav-mercenary" />
        <Button title={t("allianceDirectory")} icon="magnify" variant="secondary" style={s.navBtn} onPress={() => router.push("/alliance/browse")} testID="alliance-nav-browse" />
        {can("alliance_settings") ? <Button title={t("allianceSettings")} icon="cog-outline" variant="secondary" style={s.navBtn} onPress={() => router.push("/alliance/settings")} testID="alliance-nav-settings" /> : null}
      </View>
    </View>
  );
}
