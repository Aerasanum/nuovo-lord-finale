import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { FlatList, Platform, Pressable, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type ChatMessage, useAllianceChat, useAllianceMutations, useMyAlliance } from "@/src/api/hooks";
import { BackButton, RoleBadge, TagChip } from "@/src/components/alliance/common";
import { Screen, useToast } from "@/src/components/overlay";
import { Empty, Icon, LoadState, T } from "@/src/components/ui";
import { useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  list: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm },
  bubble: { maxWidth: "86%", borderRadius: radius.md, padding: spacing.sm, gap: 2, borderWidth: 1 },
  mine: { alignSelf: "flex-end", backgroundColor: c.brandTertiary, borderColor: c.brandPrimary },
  theirs: { alignSelf: "flex-start", backgroundColor: c.surfaceSecondary, borderColor: c.border },
  system: { alignSelf: "center", backgroundColor: "transparent", borderColor: "transparent" },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surfaceTertiary, color: c.onSurface, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  sendBtn: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: c.brandPrimary },
}));

/** Alliance chat (Bible §19 — every member): polling list + sticky composer above the keyboard. */
export default function AllianceChatScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { worldId, player } = useGame();
  const mine = useMyAlliance(worldId);
  const a = mine.data?.alliance ?? null;
  const q = useAllianceChat(worldId, !!a);
  const mm = useAllianceMutations(worldId ?? "");
  const { showError } = useToast();
  const [text, setText] = useState("");
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const messages = q.data?.messages ?? [];
  useEffect(() => {
    if (messages.length) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  }, [messages.length]);
  if (mine.data && !a) {
    router.back();
    return null;
  }

  const send = () => {
    const v = text.trim();
    if (!v) return;
    setText("");
    mm.chat.mutateAsync(v).catch((e) => {
      setText(v);
      showError(e);
    });
  };

  const renderItem = ({ item: m }: { item: ChatMessage }) => {
    const isMe = !!player && m.player_id === player.player_id;
    const system = m.role === "SYSTEM";
    return (
      <View style={[s.bubble, system ? s.system : isMe ? s.mine : s.theirs]} testID={`chat-msg-${m.message_id}`}>
        {!system ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <T v="caption" style={{ color: colors.onSurface, fontWeight: "700" }}>
              {m.house_name}
            </T>
            <RoleBadge role={m.role} />
          </View>
        ) : null}
        <T v={system ? "caption" : "body"} style={system ? { color: colors.muted, fontStyle: "italic" } : undefined}>
          {m.text}
        </T>
        <T v="caption" style={{ alignSelf: "flex-end", color: colors.muted }}>
          {new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </T>
      </View>
    );
  };

  return (
    <Screen title={`${t("chat")}${a ? ` · [${a.tag}]` : ""}`} testID="alliance-chat-screen" left={<BackButton testID="alliance-chat-back" />} right={a ? <TagChip tag={a.tag} /> : undefined}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "translate-with-padding"} keyboardVerticalOffset={16}>
        {!q.data ? (
          <LoadState query={q} />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.message_id}
            renderItem={renderItem}
            contentContainerStyle={[s.list, { paddingBottom: spacing.md }]}
            ListEmptyComponent={<Empty icon="forum-outline" title={t("chatEmpty")} testID="chat-empty" />}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            testID="chat-list"
          />
        )}
        <View style={[s.composer, { paddingBottom: insets.bottom + spacing.sm }]}>
          <TextInput style={s.input} value={text} onChangeText={setText} placeholder={t("chatPlaceholder")} placeholderTextColor={colors.muted} multiline maxLength={500} onSubmitEditing={send} blurOnSubmit={false} testID="chat-input" />
          <Pressable style={[s.sendBtn, !text.trim() && { opacity: 0.5 }]} onPress={send} disabled={!text.trim() || mm.chat.isPending} testID="chat-send">
            <Icon name="send" size={20} color={colors.onBrandPrimary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
