import React, { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { Sheet } from "@/src/components/overlay";
import { Icon, T } from "@/src/components/ui";
import { useI18n } from "@/src/i18n";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Settlement = { settlement_id: string; name: string; level: number; is_mother?: boolean; x: number; y: number };

const CHIP_W = 122;
const CHIP_GAP = spacing.xs;

const useStyles = makeStyles((c) => ({
  row: { flexDirection: "row", alignItems: "center", gap: 4, paddingTop: spacing.xs },
  chips: { flexDirection: "row", gap: CHIP_GAP, paddingHorizontal: 2 },
  chip: { paddingHorizontal: 10, height: 30, width: CHIP_W, borderRadius: radius.pill, backgroundColor: c.glass, borderWidth: 1, borderColor: c.border, justifyContent: "center" },
  chipActive: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  arrow: { width: 30, height: 30, borderRadius: radius.pill, backgroundColor: c.glass, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 12, paddingHorizontal: spacing.sm, borderRadius: radius.md },
  itemActive: { backgroundColor: c.brandTertiary },
}));

const cleanName = (name: string) => String(name).replace(/\s*·\s*\d+,\d+$/, "");

/** Map HUD village switcher: swipeable chips + prev/next arrows + full list sheet (players with many villages). */
export function SettlementSwitcher({ settlements, activeId, onSelect }: { settlements: Settlement[]; activeId: string | null; onSelect: (id: string) => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const scroll = useRef<ScrollView>(null);
  const [list, setList] = useState(false);
  const idx = Math.max(0, settlements.findIndex((x) => x.settlement_id === activeId));
  const n = settlements.length;

  // keep the active chip in view (arrows, city tab switch, deep links)
  useEffect(() => {
    scroll.current?.scrollTo({ x: Math.max(0, idx * (CHIP_W + CHIP_GAP) - CHIP_W / 2), animated: true });
  }, [idx]);

  const step = (d: number) => onSelect(settlements[(idx + d + n) % n].settlement_id);

  return (
    <View style={s.row} testID="map-settlement-switcher">
      <Pressable style={s.arrow} onPress={() => step(-1)} testID="map-settlement-prev" accessibilityLabel={t("settlements")}>
        <Icon name="chevron-left" size={20} color={colors.onSurface} />
      </Pressable>
      <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} style={{ flex: 1 }}>
        {settlements.map((st) => {
          const on = st.settlement_id === activeId;
          return (
            <Pressable key={st.settlement_id} style={[s.chip, on && s.chipActive]} onPress={() => onSelect(st.settlement_id)} testID={`map-settlement-chip-${st.settlement_id}`}>
              <T v="caption" numberOfLines={1} style={on ? { color: colors.onBrandTertiary } : undefined}>
                {st.is_mother ? "★ " : ""}
                {cleanName(st.name)} L{st.level}
              </T>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable style={s.arrow} onPress={() => step(1)} testID="map-settlement-next" accessibilityLabel={t("settlements")}>
        <Icon name="chevron-right" size={20} color={colors.onSurface} />
      </Pressable>
      <Pressable style={s.arrow} onPress={() => setList(true)} testID="map-settlement-list" accessibilityLabel={t("settlements")}>
        <Icon name="format-list-bulleted" size={18} color={colors.brandPrimary} />
      </Pressable>
      <Sheet visible={list} onClose={() => setList(false)} title={`${t("settlements")} · ${n}`} testID="map-settlement-sheet">
        <ScrollView style={{ maxHeight: 420 }}>
          {settlements.map((st) => {
            const on = st.settlement_id === activeId;
            return (
              <Pressable
                key={st.settlement_id}
                style={[s.item, on && s.itemActive]}
                onPress={() => {
                  setList(false);
                  onSelect(st.settlement_id);
                }}
                testID={`map-settlement-item-${st.settlement_id}`}
              >
                <Icon name={st.is_mother ? "star" : "castle"} size={20} color={on ? colors.brandPrimary : colors.onSurfaceSecondary} />
                <View style={{ flex: 1 }}>
                  <T v="body" numberOfLines={1}>
                    {cleanName(st.name)}
                  </T>
                  <T v="caption">
                    L{st.level} · {st.x},{st.y}
                  </T>
                </View>
                {on ? <Icon name="check" size={20} color={colors.brandPrimary} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </Sheet>
    </View>
  );
}
