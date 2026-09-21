import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type ContractDto, useAllianceMutations, useAlliances, useMercenaryDirectory, useMercenaryMarket, useMyAlliance } from "@/src/api/hooks";
import { BackButton, KindBadge, TagChip, useAllianceStyles } from "@/src/components/alliance/common";
import { openChat } from "@/src/components/chat/ChatDock";
import { Screen, useToast } from "@/src/components/overlay";
import { Button, Chip, Countdown, Icon, LoadState, Panel, Row, T } from "@/src/components/ui";
import { contractStatusLabel } from "@/src/game/alliances";
import { formatNumber, tDyn, useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  content: { padding: spacing.md, gap: spacing.md },
  kv: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  contract: { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: c.border, gap: 4 },
  pill: { paddingHorizontal: 8, height: 22, borderRadius: radius.pill, justifyContent: "center" },
}));

/** Mercenary contract market (Bible §19 / spec.mercenary_contract): hire (escrow) · accept (Mercenary only) · history. */
export default function MercenaryMarketScreen() {
  const s = useStyles();
  const cs = useAllianceStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { target: presetTarget } = useLocalSearchParams<{ target?: string }>();
  const { worldId } = useGame();
  const mine = useMyAlliance(worldId);
  const a = mine.data?.alliance ?? null;
  const q = useMercenaryMarket(worldId, !!a);
  const dir = useAlliances(worldId);
  const mm = useAllianceMutations(worldId ?? "");
  const { show, showError } = useToast();
  const [target, setTarget] = useState<string | null>(presetTarget ?? null);
  const [provider, setProvider] = useState<string | null>(null); // directed offer → only this Mercenary alliance sees it
  const mercs = useMercenaryDirectory(worldId, !!a);
  const [escrow, setEscrow] = useState("1000");
  const [duration, setDuration] = useState<number | null>(null);
  if (mine.data && !a) {
    router.back();
    return null;
  }
  if (!a || !q.data) return <LoadState query={q} />;
  const m = q.data;
  const can = a.permissions.includes("mercenary");
  const isMerc = a.kind === "MERCENARY";
  const dur = duration ?? m.durations_hours[0];
  const escrowN = parseInt(escrow || "0", 10) || 0;
  const targets = (dir.data?.alliances ?? []).filter((x) => x.alliance_id !== a.alliance_id);
  const canHire = can && !!target && escrowN >= m.escrow_min && escrowN <= m.escrow_max && (a.emeralds ?? 0) >= escrowN;

  const hire = () =>
    mm.offer
      .mutateAsync({ target_alliance_id: target!, emeralds: escrowN, duration_hours: dur, provider_alliance_id: provider })
      .then(() => {
        show(t("offerSent"), "success");
        setTarget(null);
        setProvider(null);
      })
      .catch(showError);

  const statusColor = (st: ContractDto["status"]) => (st === "ACTIVE" ? colors.error : st === "COMPLETED" ? colors.success : st === "OFFERED" ? colors.info : colors.muted);

  const renderContract = (c: ContractDto, offer = false) => (
    <View key={c.contract_id} style={s.contract} testID={`contract-${c.contract_id}`}>
      <Row style={s.kv}>
        <T v="label" style={{ flex: 1, color: colors.onSurface }} numberOfLines={1}>
          {t("client")} [{c.client_tag}] → {t("contractTarget")} [{c.target_tag}]{c.provider_tag ? ` · ${t("provider")} [${c.provider_tag}]` : ""}
        </T>
        <View style={[s.pill, { backgroundColor: statusColor(c.status) }]}>
          <T v="caption" style={{ color: colors.onError, fontWeight: "700" }} testID={`contract-${c.contract_id}-status`}>
            {contractStatusLabel(t, c.status)}
          </T>
        </View>
      </Row>
      <Row style={s.kv}>
        <T v="caption">
          <Icon name="diamond-stone" size={12} color={colors.success} /> {formatNumber(c.emeralds)} · {c.duration_hours}
          {t("hours")}
          {c.result ? ` · ${tDyn(t, `contractResult_${c.result}`, String(c.result).toLowerCase())}` : ""}
        </T>
        {c.directed_to_tag && c.status === "OFFERED" ? (
          <T v="caption" style={{ color: colors.brandPrimary }} testID={`contract-${c.contract_id}-directed`}>
            {t("hireDirectedTo")} [{c.directed_to_tag}]
          </T>
        ) : null}
        {c.status === "ACTIVE" && c.ends_at ? <Countdown endsAt={c.ends_at} testID={`contract-${c.contract_id}-ends`} /> : null}
      </Row>
      {offer && isMerc && can ? <Button title={t("acceptContract")} icon="sword" variant="danger" onPress={() => mm.acceptOffer.mutateAsync(c.contract_id).then(() => show(t("contractAccepted"), "success")).catch(showError)} testID={`contract-${c.contract_id}-accept`} /> : null}
      {c.status === "OFFERED" && c.client_alliance_id === a.alliance_id && can ? <Button title={t("withdrawOffer")} icon="undo" variant="ghost" onPress={() => mm.withdrawOffer.mutateAsync(c.contract_id).catch(showError)} testID={`contract-${c.contract_id}-withdraw`} /> : null}
    </View>
  );

  return (
    <Screen title={t("mercenaryMarket")} testID="alliance-mercenary-screen" left={<BackButton testID="alliance-mercenary-back" />}>
      <KeyboardAwareScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.xl }]} bottomOffset={24} keyboardShouldPersistTaps="handled">
        <Panel>
          <Row>
            <TagChip tag={a.tag} />
            <T v="heading" style={{ flex: 1 }} numberOfLines={1}>
              {a.name}
            </T>
            <KindBadge kind={a.kind} />
          </Row>
          <T v="caption" style={{ marginTop: 4 }}>
            {t("targetBonus")} · {t("escrow")} {formatNumber(m.escrow_min)}–{formatNumber(m.escrow_max)} · {t("duration")} {m.durations_hours.join("/")}
            {t("hours")}
          </T>
          {isMerc ? (
            <T v="caption" style={{ marginTop: 2 }}>
              {t("mercPrestige")} {a.mercenary_prestige} · {a.contracts_completed} {t("contractsCompleted")} · {a.contracts_active}/{m.max_active} {t("contractsActive")}
            </T>
          ) : null}
        </Panel>

        {isMerc ? (
          <Panel testID="mercenary-offers">
            <T v="heading">
              {t("openOffers")} ({m.offers.length})
            </T>
            {m.offers.length === 0 ? (
              <T v="caption" style={{ marginTop: 4 }} testID="mercenary-offers-empty">
                {t("noOffers")}
              </T>
            ) : (
              m.offers.map((c) => renderContract(c, true))
            )}
          </Panel>
        ) : null}

        {!isMerc ? (
          <Panel testID="mercenary-directory">
            <Row>
              <Icon name="account-cash" size={18} color={colors.brandPrimary} />
              <T v="heading" style={{ flex: 1 }}>
                {t("mercDirectory")} ({mercs.data?.mercenaries.length ?? 0})
              </T>
            </Row>
            <T v="caption" style={{ marginTop: 4 }}>
              {t("mercDirectoryHint")}
            </T>
            {mercs.data?.mercenaries.length === 0 ? (
              <T v="caption" style={{ marginTop: 6 }} testID="mercenary-directory-empty">
                {t("mercDirectoryEmpty")}
              </T>
            ) : null}
            {(mercs.data?.mercenaries ?? []).map((x) => (
              <View key={x.alliance_id} style={[s.contract, provider === x.alliance_id && { borderColor: colors.brandPrimary }]} testID={`merc-${x.alliance_id}`}>
                <Row>
                  <TagChip tag={x.tag} />
                  <T v="label" style={{ flex: 1 }} numberOfLines={1}>
                    {x.name}
                  </T>
                  <View style={[s.pill, { backgroundColor: x.available ? colors.success : colors.warning }]} testID={`merc-${x.alliance_id}-availability`}>
                    <T v="caption" style={{ color: x.available ? colors.onSuccess : colors.onWarning, fontWeight: "700" }}>
                      {x.available ? t("mercAvailable") : t("mercBusy")}
                    </T>
                  </View>
                </Row>
                <T v="caption" style={{ marginTop: 2 }}>
                  {t("mercPrestige")} {x.mercenary_prestige} · {x.contracts_completed} {t("contractsCompleted")} · {x.contracts_failed} {t("contractsFailed")} · {x.active_contracts}/{x.max_active} {t("contractsActive")} · {x.member_count} {t("members")}
                </T>
                <Row style={{ marginTop: 6, gap: spacing.xs, flexWrap: "wrap" }}>
                  {can ? <Button title={provider === x.alliance_id ? t("mercProposeSelected") : t("mercPropose")} icon="handshake" variant={provider === x.alliance_id ? "primary" : "secondary"} onPress={() => setProvider(provider === x.alliance_id ? null : x.alliance_id)} testID={`merc-${x.alliance_id}-propose`} /> : null}
                  <Button title={t("chatOpen")} icon="forum-outline" variant="ghost" onPress={() => openChat({ kind: "nego", allianceId: x.alliance_id, label: `[${x.tag}] ${x.name}` })} testID={`merc-${x.alliance_id}-chat`} />
                </Row>
              </View>
            ))}
          </Panel>
        ) : null}

        {can ? (
          <Panel testID="mercenary-hire">
            <T v="heading">{t("hireMercenaries")}</T>
            {provider ? (
              <Row style={{ marginTop: 4 }}>
                <Icon name="handshake" size={14} color={colors.brandPrimary} />
                <T v="caption" style={{ flex: 1 }} testID="hire-directed-note">
                  {t("hireDirectedTo")} {(() => { const p = mercs.data?.mercenaries.find((x) => x.alliance_id === provider); return p ? `[${p.tag}] ${p.name}` : ""; })()}
                </T>
                <Pressable onPress={() => setProvider(null)} testID="hire-directed-clear" accessibilityRole="button" hitSlop={8}>
                  <Icon name="close" size={16} color={colors.muted} />
                </Pressable>
              </Row>
            ) : null}
            <T v="caption" style={{ marginTop: 4 }}>
              {t("hireHint")}
            </T>
            <T v="label" style={{ marginTop: spacing.sm }}>
              {t("contractTarget")}
            </T>
            <View style={[s.chips, { marginTop: 6 }]}>
              {targets.map((x) => (
                <Chip key={x.alliance_id} label={`[${x.tag}] ${x.name}`} selected={target === x.alliance_id} onPress={() => setTarget(x.alliance_id)} testID={`hire-target-${x.alliance_id}`} />
              ))}
            </View>
            <T v="label" style={{ marginTop: spacing.sm }}>
              {t("escrow")} ({t("emeralds")}: {a.emeralds === null ? "—" : formatNumber(a.emeralds)})
            </T>
            <TextInput style={[cs.input, { marginTop: 6 }]} value={escrow} onChangeText={(v) => setEscrow(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholderTextColor={colors.muted} testID="hire-escrow-input" />
            <T v="label" style={{ marginTop: spacing.sm }}>
              {t("duration")}
            </T>
            <View style={[s.chips, { marginTop: 6 }]}>
              {m.durations_hours.map((h) => (
                <Chip key={h} label={`${h}${t("hours")}`} selected={dur === h} onPress={() => setDuration(h)} testID={`hire-duration-${h}`} />
              ))}
            </View>
            <Button title={t("hireMercenaries")} icon="sword" style={{ marginTop: spacing.sm }} disabled={!canHire} loading={mm.offer.isPending} onPress={hire} testID="hire-submit" />
          </Panel>
        ) : null}

        <Panel testID="mercenary-contracts">
          <T v="heading">
            {t("myContracts")} ({m.contracts.length})
          </T>
          {m.contracts.length === 0 ? (
            <T v="caption" style={{ marginTop: 4 }} testID="mercenary-contracts-empty">
              {t("noContracts")}
            </T>
          ) : (
            m.contracts.map((c) => renderContract(c))
          )}
        </Panel>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
