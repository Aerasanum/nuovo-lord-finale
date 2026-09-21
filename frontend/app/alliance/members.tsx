import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type AllianceMember, type AllianceRole, useAllianceMutations, useMyAlliance } from "@/src/api/hooks";
import { BackButton, KindBadge, RoleBadge, TagChip, useAllianceStyles } from "@/src/components/alliance/common";
import { Crest } from "@/src/components/Crest";
import { Screen, useToast } from "@/src/components/overlay";
import { Button, Chip, Countdown, Icon, LoadState, Panel, Row, T } from "@/src/components/ui";
import { ROLE_ORDER, roleLabel } from "@/src/game/alliances";
import { useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  content: { padding: spacing.md, gap: spacing.md },
  kv: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  member: { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: c.border, gap: 6 },
  danger: { gap: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
}));

/** Members, roles, invitations, leave / dissolve (Bible §19 roles & permissions, STC-30). */
export default function AllianceMembersScreen() {
  const s = useStyles();
  const cs = useAllianceStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { worldId } = useGame();
  const q = useMyAlliance(worldId);
  const mm = useAllianceMutations(worldId ?? "");
  const { show, showError } = useToast();
  const [house, setHouse] = useState("");
  const [inviteRole, setInviteRole] = useState<AllianceRole>("MEMBER");
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDissolve, setConfirmDissolve] = useState(false);
  const a = q.data?.alliance;
  if (!q.data) return <LoadState query={q} />;
  if (!a) {
    router.back();
    return null;
  }
  const can = (p: string) => a.permissions.includes(p);
  const me = a.members.find((m) => m.is_me);

  const invite = () =>
    mm.invite
      .mutateAsync({ house_name: house.trim(), role: inviteRole })
      .then(() => {
        show(t("inviteSent"), "success");
        setHouse("");
      })
      .catch(showError);

  const renderMember = (m: AllianceMember) => {
    const canEditRoles = can("roles") && !m.is_me && m.role !== "LEADER";
    const canKick = can("remove_member") && !m.is_me && m.role !== "LEADER";
    const canTransfer = can("transfer_leadership") && !m.is_me;
    return (
      <View key={m.player_id} style={s.member} testID={`member-${m.player_id}`}>
        <Row style={s.kv}>
          <Row style={{ flex: 1 }}>
            {m.house_crest ? <Crest crest={m.house_crest} size={24} /> : <Icon name="account" size={20} color={colors.muted} />}
            <T v="label" style={{ flex: 1, color: colors.onSurface }} numberOfLines={1}>
              {m.house_name}
              {m.is_me ? ` (${t("own").toLowerCase()})` : ""}
            </T>
          </Row>
          <RoleBadge role={m.role} testID={`member-${m.player_id}-role`} />
        </Row>
        <Row style={s.kv}>
          <T v="caption">
            {t("memberSince")} {new Date(m.joined_at).toLocaleDateString()}
            {m.leaving_at ? ` · ${t("leavePending")} ` : ""}
          </T>
          {m.leaving_at ? <Countdown endsAt={m.leaving_at} /> : null}
        </Row>
        {canEditRoles || canKick || canTransfer ? (
          <Row style={{ justifyContent: "flex-end", gap: spacing.sm, flexWrap: "wrap" }}>
            {canEditRoles ? <Button title={t("promote")} variant="ghost" icon="account-cog" onPress={() => setEditing(editing === m.player_id ? null : m.player_id)} testID={`member-${m.player_id}-edit`} /> : null}
            {canTransfer ? <Button title={t("transferLeadership")} variant="ghost" icon="crown" onPress={() => mm.setRole.mutateAsync({ player_id: m.player_id, role: "LEADER" }).catch(showError)} testID={`member-${m.player_id}-transfer`} /> : null}
            {canKick ? <Button title={t("kickMember")} variant="danger" icon="account-remove" onPress={() => mm.kick.mutateAsync(m.player_id).catch(showError)} testID={`member-${m.player_id}-kick`} /> : null}
          </Row>
        ) : null}
        {editing === m.player_id ? (
          <View style={s.chips}>
            {ROLE_ORDER.filter((r) => r !== "LEADER").map((r) => (
              <Chip key={r} label={roleLabel(t, r)} selected={m.role === r} onPress={() => mm.setRole.mutateAsync({ player_id: m.player_id, role: r }).then(() => setEditing(null)).catch(showError)} testID={`member-${m.player_id}-role-${r}`} />
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <Screen title={t("members")} testID="alliance-members-screen" left={<BackButton testID="alliance-members-back" />}>
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
        <Panel>
          <Row>
            <TagChip tag={a.tag} />
            <T v="heading" style={{ flex: 1 }} numberOfLines={1}>
              {a.name}
            </T>
            <KindBadge kind={a.kind} />
          </Row>
          <T v="caption" style={{ marginTop: 4 }} testID="alliance-members-count">
            {t("members")} {a.member_count}/{a.cap}
          </T>
          {a.members.map(renderMember)}
        </Panel>

        {can("invite") ? (
          <Panel testID="alliance-invite-panel">
            <T v="heading">{t("inviteMember")}</T>
            <TextInput style={[cs.input, { marginTop: spacing.sm }]} value={house} onChangeText={setHouse} placeholder={t("inviteHouseName")} placeholderTextColor={colors.muted} maxLength={40} testID="alliance-invite-input" />
            <View style={[s.chips, { marginTop: spacing.sm }]}>
              {(["MEMBER", "DIPLOMAT", "VICE"] as AllianceRole[]).map((r) => (
                <Chip key={r} label={roleLabel(t, r)} selected={inviteRole === r} onPress={() => setInviteRole(r)} testID={`alliance-invite-role-${r}`} />
              ))}
            </View>
            <Button title={t("inviteMember")} icon="account-plus" style={{ marginTop: spacing.sm }} disabled={house.trim().length < 1 || a.member_count >= a.cap} loading={mm.invite.isPending} onPress={invite} testID="alliance-invite-submit" />
            {a.pending_invites.length ? (
              <View style={{ marginTop: spacing.sm }}>
                <T v="caption">
                  {t("invites")}: {a.pending_invites.map((i) => `${i.house_name} (${roleLabel(t, i.role)})`).join(" · ")}
                </T>
              </View>
            ) : null}
          </Panel>
        ) : null}

        <Panel testID="alliance-danger-panel">
          <View style={s.danger}>
            {me?.leaving_at ? (
              <Button title={t("cancelLeave")} icon="undo" variant="secondary" onPress={() => mm.cancelLeave.mutateAsync().catch(showError)} testID="alliance-cancel-leave" />
            ) : (
              <>
                <T v="caption">{t("leaveHint")}</T>
                <Button title={t("leaveAlliance")} icon="exit-run" variant="secondary" onPress={() => mm.leave.mutateAsync().catch(showError)} testID="alliance-leave" />
              </>
            )}
            {can("dissolve") ? (
              confirmDissolve ? (
                <Row style={{ gap: spacing.sm }}>
                  <Button title={t("dissolveAlliance")} variant="danger" icon="alert" style={{ flex: 1 }} onPress={() => mm.dissolve.mutateAsync().then(() => router.back()).catch(showError)} testID="alliance-dissolve-confirm" />
                  <Button title={t("cancel")} variant="ghost" onPress={() => setConfirmDissolve(false)} testID="alliance-dissolve-cancel" />
                </Row>
              ) : (
                <>
                  <T v="caption">{t("dissolveConfirm")}</T>
                  <Button title={t("dissolveAlliance")} variant="danger" icon="alert-octagon" onPress={() => setConfirmDissolve(true)} testID="alliance-dissolve" />
                </>
              )
            ) : null}
          </View>
        </Panel>
      </ScrollView>
    </Screen>
  );
}
