/**
 * Persistent chat dock (Bible §19 communication): a thin bar above the tab bar previewing the newest message across
 * the channels the Player can read — Realm (everyone in the World), Alliance, Negotiations (private rooms between two
 * Alliances, used to plan Mercenary commissions). Tapping opens the full panel; other screens can deep-open a room
 * through `openChat` (e.g. the Mercenary directory's "Tratta in chat").
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type ChatMessage, type NegoRoom, type RealmChatMessage, useAllianceChat, useAllianceMutations, useChatSummary, useMyAlliance, useNegotiation, useRealmChatMutations, useWorldChat } from "@/src/api/hooks";
import { useToast } from "@/src/components/overlay";
import { Chip, Empty, Icon, Loading, T } from "@/src/components/ui";
import { useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

// ------------------------------------------------------------------------------------------- tiny external store
export type ChatTarget = { kind: "world" } | { kind: "alliance" } | { kind: "nego"; allianceId: string; label?: string };
type DockState = { open: boolean; target: ChatTarget };
let state: DockState = { open: false, target: { kind: "world" } };
const listeners = new Set<() => void>();
function set(next: Partial<DockState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}
export function openChat(target: ChatTarget) {
  set({ open: true, target });
}
function useDock() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

// last-read markers per channel (session memory; the dock dot clears once a channel is opened)
const lastRead = new Map<string, string>();

const useStyles = makeStyles((c) => ({
  bar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, height: 36, backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.border },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.error },
  panel: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.divider, backgroundColor: c.surfaceSecondary },
  tabs: { flexDirection: "row", gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, flexWrap: "wrap" },
  list: { padding: spacing.md, gap: spacing.xs },
  bubble: { maxWidth: "86%", padding: spacing.sm, borderRadius: radius.md, gap: 2 },
  mine: { alignSelf: "flex-end", backgroundColor: c.brandTertiary, borderBottomRightRadius: 4 },
  theirs: { alignSelf: "flex-start", backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderBottomLeftRadius: 4 },
  system: { alignSelf: "center", backgroundColor: c.glass, borderWidth: 1, borderColor: c.border },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: c.divider, backgroundColor: c.surface },
  input: { flex: 1, minHeight: 44, maxHeight: 110, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, color: c.onSurface, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: c.brandPrimary },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
}));

// ------------------------------------------------------------------------------------------- dock bar
export function ChatDock({ floating = false }: { floating?: boolean }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { worldId } = useGame();
  const summary = useChatSummary(worldId);
  const dock = useDock();
  const [, force] = useState(0);

  // newest message across channels + unread flag (newer than the last time that channel was opened)
  const newest = useMemo(() => {
    const items: { channel: string; label: string; text: string; at: string; who: string | null }[] = [];
    const d = summary.data;
    if (d?.world.last) items.push({ channel: d.world.channel, label: t("chatRealm"), text: d.world.last.text, at: d.world.last.at, who: d.world.last.house_name });
    if (d?.alliance?.last) items.push({ channel: d.alliance.channel, label: t("chatAlliance"), text: d.alliance.last.text, at: d.alliance.last.at, who: d.alliance.last.house_name });
    for (const r of d?.negotiations ?? []) items.push({ channel: r.channel, label: `[${r.tag ?? "?"}]`, text: r.last.text, at: r.last.at, who: r.last.house_name });
    items.sort((a, b) => (a.at < b.at ? 1 : -1));
    return items;
  }, [summary.data, t]);
  const unread = newest.some((m) => (lastRead.get(m.channel) ?? "") < m.at);
  const top = newest[0];
  useEffect(() => {
    if (!dock.open) force((n) => n + 1);
  }, [dock.open]);

  if (!worldId) return null;
  return (
    <>
      <Pressable onPress={() => set({ open: true })} style={[s.bar, floating && { position: "absolute", left: 0, right: 0, bottom: 49 + insets.bottom }]} testID="chat-dock" accessibilityRole="button" accessibilityLabel={t("chat")}>
        <Icon name="forum-outline" size={18} color={colors.brandPrimary} />
        {unread ? <View style={s.dot} testID="chat-dock-unread" /> : null}
        <T v="caption" numberOfLines={1} style={{ flex: 1 }} testID="chat-dock-preview">
          {top ? `${top.label} · ${top.who ? `${top.who}: ` : ""}${top.text}` : t("chatDockEmpty")}
        </T>
        <Icon name="chevron-up" size={18} color={colors.onSurfaceSecondary} />
      </Pressable>
      {dock.open ? <ChatPanel target={dock.target} onClose={() => set({ open: false })} rooms={summary.data?.negotiations ?? []} /> : null}
    </>
  );
}

// ------------------------------------------------------------------------------------------- panel
function ChatPanel({ target, onClose, rooms }: { target: ChatTarget; onClose: () => void; rooms: NegoRoom[] }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { worldId, player } = useGame();
  const { showError } = useToast();
  const mine = useMyAlliance(worldId);
  const inAlliance = !!mine.data?.alliance;
  const [tab, setTab] = useState<ChatTarget>(target);
  useEffect(() => setTab(target), [target]);

  const worldQ = useWorldChat(worldId, tab.kind === "world");
  const allianceQ = useAllianceChat(worldId, tab.kind === "alliance" && inAlliance);
  const negoQ = useNegotiation(worldId, tab.kind === "nego" ? tab.allianceId : null);
  const realm = useRealmChatMutations(worldId ?? "");
  const am = useAllianceMutations(worldId ?? "");

  const messages: (RealmChatMessage | ChatMessage)[] = tab.kind === "world" ? (worldQ.data?.messages ?? []) : tab.kind === "alliance" ? (allianceQ.data?.messages ?? []) : (negoQ.data?.messages ?? []);
  const loading = tab.kind === "world" ? !worldQ.data : tab.kind === "alliance" ? inAlliance && !allianceQ.data : !negoQ.data;
  const channel = tab.kind === "world" ? `world:${worldId}` : tab.kind === "alliance" ? `alliance:${mine.data?.alliance?.alliance_id}` : (negoQ.data?.channel ?? "");
  useEffect(() => {
    if (messages.length && channel) lastRead.set(channel, messages[messages.length - 1].at);
  }, [messages, channel]);

  const [text, setText] = useState("");
  const pending = realm.world.isPending || realm.nego.isPending || am.chat.isPending;
  const send = useCallback(() => {
    const v = text.trim();
    if (!v) return;
    setText("");
    const p = tab.kind === "world" ? realm.world.mutateAsync(v) : tab.kind === "alliance" ? am.chat.mutateAsync(v) : realm.nego.mutateAsync({ allianceId: tab.allianceId, text: v });
    p.catch((e) => {
      setText(v);
      showError(e);
    });
  }, [text, tab, realm.world, realm.nego, am.chat, showError]);

  const listRef = useRef<FlatList<RealmChatMessage | ChatMessage>>(null);
  const title = tab.kind === "world" ? t("chatRealm") : tab.kind === "alliance" ? t("chatAlliance") : `${t("chatNegotiation")} · ${negoQ.data?.alliance ? `[${negoQ.data.alliance.tag}] ${negoQ.data.alliance.name}` : (tab.label ?? "")}`;
  const placeholder = tab.kind === "world" ? t("chatRealmPlaceholder") : tab.kind === "alliance" ? t("chatPlaceholder") : t("chatNegoPlaceholder");

  const renderItem = ({ item: m }: { item: RealmChatMessage | ChatMessage }) => {
    const isMe = !!player && m.player_id === player.player_id;
    const system = m.role === "SYSTEM";
    const tag = "alliance_tag" in m && m.alliance_tag ? `[${m.alliance_tag}] ` : "";
    return (
      <View style={[s.bubble, system ? s.system : isMe ? s.mine : s.theirs]} testID={`chat-msg-${m.message_id}`}>
        {!system ? (
          <T v="caption" style={{ color: isMe ? colors.onBrandTertiary : colors.brandPrimary, fontWeight: "700" }}>
            {tag}
            {m.house_name}
          </T>
        ) : null}
        <T v={system ? "caption" : "body"} style={system ? { color: colors.muted, fontStyle: "italic" } : isMe ? { color: colors.onBrandTertiary } : undefined}>
          {m.text}
        </T>
        <T v="caption" style={{ alignSelf: "flex-end", color: isMe ? colors.onBrandTertiary : colors.muted }}>
          {new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </T>
      </View>
    );
  };

  const canWrite = tab.kind === "world" || (tab.kind === "alliance" && inAlliance) || tab.kind === "nego";
  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={onClose} statusBarTranslucent presentationStyle="fullScreen">
      <View style={[s.panel, { paddingTop: insets.top }]} testID="chat-panel">
        <View style={s.header}>
          <Icon name="forum-outline" size={20} color={colors.brandPrimary} />
          <T v="title" numberOfLines={1} style={{ flex: 1 }} testID="chat-panel-title">
            {title}
          </T>
          <Pressable onPress={onClose} style={s.close} testID="chat-panel-close" accessibilityRole="button">
            <Icon name="chevron-down" size={24} color={colors.onSurfaceSecondary} />
          </Pressable>
        </View>
        <View style={s.tabs}>
          <Chip label={t("chatRealm")} selected={tab.kind === "world"} onPress={() => setTab({ kind: "world" })} testID="chat-tab-world" />
          <Chip label={t("chatAlliance")} selected={tab.kind === "alliance"} onPress={() => setTab({ kind: "alliance" })} testID="chat-tab-alliance" />
          {rooms.map((r) => (
            <Chip key={r.channel} label={`${t("chatNegotiationShort")} [${r.tag ?? "?"}]`} selected={tab.kind === "nego" && tab.allianceId === r.alliance_id} onPress={() => setTab({ kind: "nego", allianceId: r.alliance_id, label: `[${r.tag}] ${r.name}` })} testID={`chat-tab-nego-${r.alliance_id}`} />
          ))}
          {tab.kind === "nego" && !rooms.some((r) => r.alliance_id === tab.allianceId) ? <Chip label={`${t("chatNegotiationShort")} ${tab.label ?? ""}`} selected onPress={() => {}} testID={`chat-tab-nego-${tab.allianceId}`} /> : null}
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
          {tab.kind === "alliance" && !inAlliance ? (
            <Empty icon="shield-off-outline" title={t("chatNoAlliance")} testID="chat-no-alliance" />
          ) : loading ? (
            <Loading />
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(m) => m.message_id}
              renderItem={renderItem}
              contentContainerStyle={s.list}
              ListEmptyComponent={<Empty icon="forum-outline" title={tab.kind === "world" ? t("chatRealmEmpty") : tab.kind === "nego" ? t("chatNegoEmpty") : t("chatEmpty")} testID="chat-empty" />}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
              testID="chat-list"
            />
          )}
          {canWrite ? (
            <View style={[s.composer, { paddingBottom: insets.bottom + spacing.sm }]}>
              <TextInput style={s.input} value={text} onChangeText={setText} placeholder={placeholder} placeholderTextColor={colors.muted} multiline maxLength={500} onSubmitEditing={send} blurOnSubmit={false} testID="chat-input" />
              <Pressable style={[s.sendBtn, (!text.trim() || pending) && { opacity: 0.5 }]} onPress={send} disabled={!text.trim() || pending} testID="chat-send" accessibilityRole="button" accessibilityLabel={t("send")}>
                <Icon name="send" size={20} color={colors.onBrandPrimary} />
              </Pressable>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
