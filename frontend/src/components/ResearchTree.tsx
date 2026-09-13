/**
 * Research tree (Bible §9): one branch at a time, laid out by prerequisite depth (columns) with curved connectors,
 * level pips (n/5), state colours (locked / available / in progress / completed) and the unit or feature a node
 * unlocks. Pure presentation over the server's ResearchEntry list — the 114 nodes and their values are untouched.
 */
import React, { useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import type { ResearchEntry } from "@/src/api/hooks";
import { Countdown, Icon, type IconName, T } from "@/src/components/ui";
import { useI18n } from "@/src/i18n";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export const NODE_W = 150;
export const NODE_H = 96;
const COL_GAP = 44;
const ROW_GAP = 14;
const PAD = spacing.md;

const BRANCH_ICONS: Record<string, IconName> = {
  Economia: "barley",
  Militare: "sword-cross",
  Difesa: "shield-half-full",
  Animali: "paw",
  Intelligence: "eye",
  Leggendari: "creation",
  "Assalto e Conquista": "castle",
  Sentinelle: "tower-fire",
  Logistica: "truck-fast",
  Navigazione: "sail-boat",
  Costruzione: "hammer",
  Mitici: "unicorn",
};
export function branchIcon(branch: string): IconName {
  return BRANCH_ICONS[branch] ?? "flask";
}

const useStyles = makeStyles((c) => ({
  canvas: { position: "relative" },
  node: { position: "absolute", width: NODE_W, height: NODE_H, borderRadius: radius.md, borderWidth: 1.5, padding: 8, gap: 4, backgroundColor: c.surfaceSecondary, borderColor: c.border },
  locked: { opacity: 0.62 },
  head: { flexDirection: "row", alignItems: "center", gap: 6 },
  iconBox: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceTertiary },
  pips: { flexDirection: "row", gap: 3, alignItems: "center" },
  pip: { width: 12, height: 5, borderRadius: 2, backgroundColor: c.borderStrong },
  unlock: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingHorizontal: 6, height: 18, borderRadius: radius.pill, backgroundColor: c.brandTertiary },
  ext: { position: "absolute", top: -9, right: 8, paddingHorizontal: 6, height: 18, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", gap: 3 },
  badge: { position: "absolute", top: -9, left: 8, paddingHorizontal: 6, height: 18, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
}));

type Laid = { n: ResearchEntry; col: number; row: number; x: number; y: number; ext: string[] };

/** Prerequisite keys ("a + b" strings arrive parsed as {key, ok}[]); depth = longest chain inside the branch. */
function layout(nodes: ResearchEntry[]): { laid: Laid[]; width: number; height: number; edges: { from: Laid; to: Laid }[] } {
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const depth = new Map<string, number>();
  const d = (k: string, guard = 0): number => {
    if (depth.has(k)) return depth.get(k)!;
    const n = byKey.get(k);
    if (!n || guard > 12) return 0;
    const inner = n.prerequisites.filter((p) => byKey.has(p.key));
    const v = inner.length ? 1 + Math.max(...inner.map((p) => d(p.key, guard + 1))) : 0;
    depth.set(k, v);
    return v;
  };
  nodes.forEach((n) => d(n.key));
  const cols = new Map<number, ResearchEntry[]>();
  for (const n of nodes) {
    const c = depth.get(n.key) ?? 0;
    (cols.get(c) ?? cols.set(c, []).get(c)!).push(n);
  }
  // stable order inside a column: follow the order of the parents' rows, then the catalogue order
  const laid: Laid[] = [];
  const pos = new Map<string, Laid>();
  const colCount = Math.max(...cols.keys()) + 1;
  let rows = 0;
  for (let c = 0; c < colCount; c++) {
    const list = (cols.get(c) ?? []).slice();
    list.sort((a, b) => {
      const ra = Math.min(...a.prerequisites.map((p) => pos.get(p.key)?.row ?? 999), 999);
      const rb = Math.min(...b.prerequisites.map((p) => pos.get(p.key)?.row ?? 999), 999);
      return ra - rb;
    });
    list.forEach((n, row) => {
      const l: Laid = { n, col: c, row, x: PAD + c * (NODE_W + COL_GAP), y: PAD + row * (NODE_H + ROW_GAP), ext: n.prerequisites.filter((p) => !byKey.has(p.key)).map((p) => p.key) };
      laid.push(l);
      pos.set(n.key, l);
    });
    rows = Math.max(rows, list.length);
  }
  const edges: { from: Laid; to: Laid }[] = [];
  for (const l of laid) for (const p of l.n.prerequisites) if (pos.has(p.key)) edges.push({ from: pos.get(p.key)!, to: l });
  return { laid, width: PAD * 2 + colCount * NODE_W + (colCount - 1) * COL_GAP, height: PAD * 2 + rows * NODE_H + (rows - 1) * ROW_GAP + 10, edges };
}

/** What a node unlocks (units, buildings, features): "Sblocca X" prefix of the canonical effect text. */
export function unlockOf(effect: string): string | null {
  const m = /^(?:Sblocca|Unlocks?|Débloque|Desbloquea|Schaltet|Открывает|解锁|Desbloqueia)\s+(?:reclutamento\s+|recruitment\s+)?(.+?)(?:;|$)/i.exec(effect.trim());
  return m ? m[1].trim() : null;
}

export function ResearchTree({ nodes, onPick }: { nodes: ResearchEntry[]; onPick: (n: ResearchEntry) => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const g = useMemo(() => layout(nodes), [nodes]);
  const tone = (n: ResearchEntry) => {
    if (n.state === "MAXED") return { border: colors.success, badge: colors.success, label: t("maxed"), icon: "check-decagram" as IconName };
    if (n.state === "IN_PROGRESS") return { border: colors.info, badge: colors.info, label: t("inProgress"), icon: "flask" as IconName };
    if (n.state === "AVAILABLE") return { border: colors.brandPrimary, badge: colors.brandPrimary, label: t("available"), icon: "flask-outline" as IconName };
    if (n.state === "BLOCKED_RESOURCES" || n.state === "BLOCKED_QUEUE") return { border: colors.warning, badge: colors.warning, label: t(n.state === "BLOCKED_QUEUE" ? "blockedQueue" : "blockedResources"), icon: "clock-alert-outline" as IconName };
    return { border: colors.border, badge: colors.borderStrong, label: t("locked"), icon: "lock-outline" as IconName };
  };
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="research-tree">
      <View style={[s.canvas, { width: g.width, height: g.height }]}>
        <Svg width={g.width} height={g.height} style={{ position: "absolute", left: 0, top: 0 }} pointerEvents="none">
          {g.edges.map(({ from, to }, i) => {
            const x1 = from.x + NODE_W;
            const y1 = from.y + NODE_H / 2;
            const x2 = to.x;
            const y2 = to.y + NODE_H / 2;
            const cx = (x1 + x2) / 2;
            const done = from.n.level > 0;
            return <Path key={i} d={`M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`} stroke={done ? colors.brandPrimary : colors.borderStrong} strokeWidth={done ? 2.5 : 1.5} fill="none" strokeDasharray={done ? undefined : "5 4"} />;
          })}
        </Svg>
        {g.laid.map(({ n, x, y, ext }) => {
          const tn = tone(n);
          const unlock = unlockOf(n.effect);
          const locked = n.state === "LOCKED";
          return (
            <Pressable key={n.key} style={[s.node, { left: x, top: y, borderColor: tn.border }, locked && s.locked]} onPress={() => onPick(n)} testID={`research-node-${n.key}`}>
              <View style={[s.badge, { backgroundColor: tn.badge }]}>
                <T style={{ fontSize: 9, fontWeight: "800", color: n.state === "LOCKED" ? colors.onSurface : colors.onBrandPrimary }}>{tn.label}</T>
              </View>
              {ext.length ? (
                <View style={s.ext}>
                  <Icon name="link-variant" size={10} color={colors.muted} />
                  <T style={{ fontSize: 9, color: colors.onSurfaceSecondary }} numberOfLines={1}>
                    {ext.length}
                  </T>
                </View>
              ) : null}
              <View style={[s.head, { marginTop: 6 }]}>
                <View style={s.iconBox}>
                  <Icon name={n.state === "IN_PROGRESS" ? "flask" : branchIcon(n.branch)} size={16} color={tn.border === colors.border ? colors.muted : tn.border} />
                </View>
                <T v="caption" style={{ color: colors.onSurface, flex: 1, fontWeight: "700" }} numberOfLines={2}>
                  {n.name}
                </T>
              </View>
              <View style={s.pips}>
                {Array.from({ length: n.max_level }).map((_, i) => (
                  <View key={i} style={[s.pip, i < n.level && { backgroundColor: n.state === "MAXED" ? colors.success : colors.brandPrimary }]} />
                ))}
                <T style={{ fontSize: 10, color: colors.onSurfaceSecondary, marginLeft: 4 }}>
                  {n.level}/{n.max_level}
                </T>
              </View>
              {n.job ? (
                <Countdown endsAt={n.job.ends_at} style={{ fontSize: 11, color: colors.info }} />
              ) : unlock ? (
                <View style={s.unlock}>
                  <Icon name="lock-open-variant-outline" size={10} color={colors.onBrandTertiary} />
                  <T style={{ fontSize: 10, color: colors.onBrandTertiary }} numberOfLines={1}>
                    {unlock}
                  </T>
                </View>
              ) : (
                <T style={{ fontSize: 10, color: colors.onSurfaceSecondary }} numberOfLines={1}>
                  {n.effect}
                </T>
              )}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
