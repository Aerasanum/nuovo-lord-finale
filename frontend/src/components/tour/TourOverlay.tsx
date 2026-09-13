/**
 * First-login guided tour overlay: dims the screen, cuts a spotlight around the current target (tab icon / map button)
 * and shows a storybook card with the step text. Steps live in `src/state/tour.ts`; targets are registered by the tab
 * bar and by the map screen. Without a measured target (iOS 26 native tabs) the card is centred, no spotlight.
 */
import React from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Icon, type IconName, Row, T } from "@/src/components/ui";
import { type StringKey, useI18n } from "@/src/i18n";
import { TOUR_STEPS, type TourStepId, tour, useTour } from "@/src/state/tour";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const STEP_ICON: Record<TourStepId, IconName> = { map: "map", city: "castle", missions: "compass-outline", pyramid: "triangle-outline" };
const PAD = 6;

const useStyles = makeStyles((c) => ({
  root: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0, zIndex: 1000, elevation: 1000 },
  dim: { position: "absolute", backgroundColor: "rgba(6, 8, 14, 0.74)" },
  ring: { position: "absolute", borderWidth: 2, borderColor: c.brandPrimary, borderRadius: radius.md, boxShadow: `0 0 14px ${c.brandPrimary}` },
  card: { position: "absolute", left: spacing.md, right: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.borderStrong, padding: spacing.md, gap: spacing.sm },
  badge: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  dots: { flexDirection: "row", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.border },
  dotOn: { backgroundColor: c.brandPrimary, width: 18 },
  arrow: { position: "absolute", width: 16, height: 16, backgroundColor: c.surfaceSecondary, borderColor: c.borderStrong, transform: [{ rotate: "45deg" }] },
}));

export function TourOverlay({ onDone }: { onDone: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { active, step, targets } = useTour();
  if (!active) return null;
  const cur = TOUR_STEPS[step];
  const target = targets[cur.target];
  const last = step === TOUR_STEPS.length - 1;
  const finish = () => {
    tour.stop();
    onDone();
  };
  const next = () => (last ? finish() : tour.next());

  // spotlight geometry (window coords)
  const spot = target ? { x: Math.max(0, target.x - PAD), y: Math.max(0, target.y - PAD), w: target.width + PAD * 2, h: target.height + PAD * 2 } : null;
  const CARD_H = 210;
  const above = spot ? spot.y > height / 2 : false;
  const cardTop = spot ? (above ? Math.max(insets.top + spacing.md, spot.y - CARD_H - 18) : Math.min(height - CARD_H - insets.bottom - spacing.md, spot.y + spot.h + 18)) : (height - CARD_H) / 2;
  const arrowX = spot ? Math.min(width - spacing.md - 24, Math.max(spacing.md + 8, spot.x + spot.w / 2 - 8)) : null;

  return (
    <View style={s.root} testID="tour-overlay" pointerEvents="box-none">
      {spot ? (
        <>
          <Pressable style={[s.dim, { left: 0, top: 0, right: 0, height: spot.y }]} onPress={next} />
          <Pressable style={[s.dim, { left: 0, top: spot.y + spot.h, right: 0, bottom: 0 }]} onPress={next} />
          <Pressable style={[s.dim, { left: 0, top: spot.y, width: spot.x, height: spot.h }]} onPress={next} />
          <Pressable style={[s.dim, { left: spot.x + spot.w, top: spot.y, right: 0, height: spot.h }]} onPress={next} />
          <View pointerEvents="none" style={[s.ring, { left: spot.x, top: spot.y, width: spot.w, height: spot.h }]} testID={`tour-spotlight-${cur.id}`} />
        </>
      ) : (
        <Pressable style={[s.dim, { left: 0, top: 0, right: 0, bottom: 0 }]} onPress={next} />
      )}
      {arrowX !== null && spot ? <View pointerEvents="none" style={[s.arrow, above ? { top: cardTop + CARD_H - 8, borderRightWidth: 1, borderBottomWidth: 1 } : { top: cardTop - 8, borderLeftWidth: 1, borderTopWidth: 1 }, { left: arrowX }]} /> : null}
      <View style={[s.card, { top: cardTop, minHeight: CARD_H }]} testID={`tour-step-${cur.id}`}>
        <Row style={{ justifyContent: "space-between" }}>
          <Row>
            <View style={s.badge}>
              <Icon name={STEP_ICON[cur.id]} size={22} color={colors.onBrandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <T v="caption" testID="tour-progress">
                {t("tourStepOf").replace("{n}", String(step + 1)).replace("{total}", String(TOUR_STEPS.length))}
              </T>
              <T v="heading" testID="tour-title">
                {t(`tour_${cur.id}_title` as StringKey)}
              </T>
            </View>
          </Row>
          <View style={s.dots}>
            {TOUR_STEPS.map((st, i) => (
              <View key={st.id} style={[s.dot, i === step && s.dotOn]} />
            ))}
          </View>
        </Row>
        <T v="body" style={{ color: colors.onSurfaceSecondary }} testID="tour-body">
          {t(`tour_${cur.id}_body` as StringKey)}
        </T>
        <Row style={{ justifyContent: "space-between", marginTop: spacing.xs }}>
          <Button title={t("tourSkip")} variant="ghost" onPress={finish} testID="tour-skip" />
          <Button title={last ? t("tourStart") : t("tourNext")} icon={last ? "sword" : "arrow-right"} onPress={next} testID="tour-next" />
        </Row>
      </View>
    </View>
  );
}
