import { useRouter } from "expo-router";
import React from "react";
import { FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type AlliancePublic, useAlliances, useMyAlliance } from "@/src/api/hooks";
import { BackButton, KindBadge, TagChip } from "@/src/components/alliance/common";
import { Screen } from "@/src/components/overlay";
import { Empty, Icon, Loading, Row, T } from "@/src/components/ui";
import { useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  item: { marginHorizontal: spacing.md, marginBottom: spacing.sm, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: spacing.sm, gap: 4, minHeight: 56 },
  kv: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
}));

/** Public directory of the world's alliances (Structured first, then Mercenary companies). */
export default function BrowseAlliancesScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { worldId } = useGame();
  const q = useAlliances(worldId);
  const mine = useMyAlliance(worldId);
  const myId = mine.data?.alliance?.alliance_id;

  const render = ({ item: a }: { item: AlliancePublic }) => (
    <Pressable style={s.item} onPress={() => router.push({ pathname: "/alliance/[id]", params: { id: a.alliance_id } })} testID={`alliance-row-${a.alliance_id}`}>
      <Row style={s.kv}>
        <Row style={{ flex: 1 }}>
          <TagChip tag={a.tag} />
          <T v="label" style={{ flex: 1, color: colors.onSurface }} numberOfLines={1}>
            {a.name}
            {a.alliance_id === myId ? ` · ${t("yourAlliance")}` : ""}
          </T>
        </Row>
        <KindBadge kind={a.kind} />
      </Row>
      <Row style={s.kv}>
        <T v="caption">
          {t("members")} {a.member_count}/{a.cap} · {t("leader")} {a.leader_house ?? "—"}
        </T>
        {a.kind === "MERCENARY" ? (
          <T v="caption">
            ★ {a.mercenary_prestige} · {a.contracts_completed} {t("contractsCompleted")}
          </T>
        ) : (
          <Icon name="chevron-right" size={18} color={colors.muted} />
        )}
      </Row>
    </Pressable>
  );

  return (
    <Screen title={t("allianceDirectory")} testID="alliance-browse-screen" left={<BackButton testID="alliance-browse-back" />}>
      {!q.data ? (
        <Loading />
      ) : (
        <FlatList
          data={q.data.alliances}
          keyExtractor={(a) => a.alliance_id}
          renderItem={render}
          contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: insets.bottom + spacing.xl }}
          ListEmptyComponent={<Empty icon="shield-off-outline" title={t("noAlliances")} testID="alliance-browse-empty" />}
          refreshing={q.isRefetching}
          onRefresh={() => q.refetch()}
          ListHeaderComponent={
            <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.sm }}>
              <T v="caption">
                {t("kindStructured")}: {q.data.caps.STRUCTURED_ALLIANCE} · {t("kindMercenary")}: {q.data.caps.MERCENARY_ALLIANCE}
              </T>
            </View>
          }
        />
      )}
    </Screen>
  );
}
