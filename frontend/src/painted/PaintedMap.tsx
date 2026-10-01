/**
 * Painted isometric map. Same world, chunks and marches as the 3D client; the picture is a fixed illustration
 * camera instead of a free orbit. Web only (the proof is the browser). Native keeps the caller on the 3D view.
 */
import React, { useEffect, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { get, serverNow } from "@/src/api/client";
import type { ChunkDto, MarchDto, PyramidSummary, SentinelDto, SettlementPublic } from "@/src/api/hooks";
import type { Selection } from "@/src/map3d/engine";
import type { FogBounds } from "@/src/map3d/fog";

import { fighter, ground, hash, keep, pine, pyramid, sky, unitKind } from "./draw";

const CHUNK = 32;
const MIN_DIST = 8;
const MAX_DIST = 160;

type Cam = { tx: number; tz: number; dist: number };

export type PaintedControls = {
  zoomBy(factor: number): void;
  centerOn(x: number, y: number, dist?: number): void;
  rotateBy(delta: number): void;
  select(sel: Selection | null): void;
  invalidateChunks(): void;
  setMinimapRect(rect: unknown): void;
  minimapToWorld(x: number, y: number): { x: number; y: number } | null;
};

type Props = {
  worldId: string;
  worldSize: number;
  home?: { x: number; y: number } | null;
  marches?: MarchDto[];
  pyramids?: PyramidSummary[];
  onSelect: (sel: Selection | null) => void;
  onEngine?: (engine: PaintedControls | null) => void;
  onCameraChange?: (cam: Cam) => void;
  viewBounds?: FogBounds | null;
};

type Chunk = { grid: Uint8Array; settlements: SettlementPublic[]; sentinels: SentinelDto[] };

function b64(data: string): Uint8Array {
  const bin = atob(data);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function inside(bounds: FogBounds | null | undefined, x: number, y: number) {
  if (!bounds) return true;
  return x >= bounds.x0 && y >= bounds.y0 && x < bounds.x1 && y < bounds.y1;
}

export function PaintedMap({ worldId, worldSize, home, marches, pyramids, onSelect, onEngine, onCameraChange, viewBounds }: Props) {
  const hostRef = useRef<View>(null);
  const controlsRef = useRef<PaintedControls | null>(null);
  const [labels, setLabels] = React.useState<{ id: string; name: string; x: number; y: number }[]>([]);
  const setLabelsRef = useRef(setLabels);
  const propsRef = useRef({ worldId, worldSize, home, marches: marches ?? [], pyramids: pyramids ?? [], onSelect, onEngine, onCameraChange, viewBounds: viewBounds ?? null });
  useEffect(() => {
    setLabelsRef.current = setLabels;
    propsRef.current = { worldId, worldSize, home, marches: marches ?? [], pyramids: pyramids ?? [], onSelect, onEngine, onCameraChange, viewBounds: viewBounds ?? null };
  }, [worldId, worldSize, home, marches, pyramids, onSelect, onEngine, onCameraChange, viewBounds]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const host = hostRef.current as unknown as HTMLElement | null;
    if (!host) return;
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:grab;";
    host.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const chunks = new Map<string, Chunk>();
    const inflight = new Set<string>();
    const cam: Cam = { tx: home?.x ?? 200, tz: home?.y ?? 200, dist: 28 };
    const goal: Cam = { ...cam };
    let disposed = false;
    let raf = 0;
    let w = 1;
    let h = 1;

    const resize = () => {
      const r = host.getBoundingClientRect();
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const hwOf = (dist: number) => Math.max(5, Math.min(78, 640 / dist));

    const metrics = (dist = cam.dist) => {
      const hw = hwOf(dist);
      const hh = hw * 0.5;
      const ox = w / 2 - (cam.tx - cam.tz) * hw;
      const oy = h / 2 - (cam.tx + cam.tz) * hh;
      return { hw, hh, ox, oy };
    };
    const project = (x: number, y: number) => {
      const { hw, hh, ox, oy } = metrics();
      return { sx: (x - y) * hw + ox, sy: (x + y) * hh + oy, hw, hh };
    };
    const unproject = (px: number, py: number) => {
      const { hw, hh, ox, oy } = metrics();
      const dx = (px - ox) / hw;
      const dy = (py - oy) / hh;
      return { x: (dx + dy) / 2, y: (dy - dx) / 2 };
    };

    const tileAt = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= propsRef.current.worldSize || y >= propsRef.current.worldSize) return 3;
      const g = chunks.get(`${Math.floor(x / CHUNK)}:${Math.floor(y / CHUNK)}`)?.grid;
      if (!g) return -1;
      return g[(y % CHUNK) * CHUNK + (x % CHUNK)] ?? -1;
    };

    const ensure = (cx: number, cy: number) => {
      const key = `${cx}:${cy}`;
      if (chunks.has(key) || inflight.has(key) || cx < 0 || cy < 0) return;
      const n = Math.ceil(propsRef.current.worldSize / CHUNK);
      if (cx >= n || cy >= n) return;
      inflight.add(key);
      get<ChunkDto>(`/worlds/${propsRef.current.worldId}/map/chunk/${cx}/${cy}`)
        .then((data) => {
          if (!disposed) chunks.set(key, { grid: b64(data.terrain_b64), settlements: data.settlements, sentinels: data.sentinels });
        })
        .catch(() => {})
        .finally(() => inflight.delete(key));
    };

    const controls: PaintedControls = {
      zoomBy(factor) {
        goal.dist = Math.max(MIN_DIST, Math.min(MAX_DIST, goal.dist / factor));
      },
      centerOn(x, y, dist) {
        goal.tx = x + 0.5;
        goal.tz = y + 0.5;
        if (dist) goal.dist = Math.max(MIN_DIST, Math.min(MAX_DIST, dist));
      },
      rotateBy() {},
      select(sel) {
        propsRef.current.onSelect(sel);
      },
      invalidateChunks() {
        chunks.clear();
      },
      setMinimapRect() {},
      minimapToWorld() {
        return null;
      },
    };
    controlsRef.current = controls;
    propsRef.current.onEngine?.(controls);

    let down = false;
    let lx = 0;
    let ly = 0;
    let moved = 0;
    const onDown = (e: PointerEvent) => {
      down = true;
      lx = e.clientX;
      ly = e.clientY;
      moved = 0;
      canvas.style.cursor = "grabbing";
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
      lx = e.clientX;
      ly = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      const { hw, hh } = metrics();
      const dtx = -(dx / hw + dy / hh) / 2;
      const dtz = (dx / hw - dy / hh) / 2;
      cam.tx += dtx;
      cam.tz += dtz;
      goal.tx = cam.tx;
      goal.tz = cam.tz;
    };
    const pick = (px: number, py: number) => {
      const hit = unproject(px, py);
      const wx = Math.floor(hit.x);
      const wy = Math.floor(hit.y);
      let bestS: SettlementPublic | null = null;
      let bestD = 1.6;
      for (const ch of chunks.values()) {
        for (const s of ch.settlements) {
          if (s.kind === "PLAYER_SLOT") continue;
          const d = Math.hypot(s.x + 0.5 - hit.x, s.y + 0.5 - hit.y);
          if (d < bestD) {
            bestD = d;
            bestS = s;
          }
        }
      }
      const pyrs = propsRef.current.pyramids;
      let bestP: PyramidSummary | null = null;
      for (const p of pyrs) {
        const half = Math.max(3, (p.footprint?.[0] ?? 15) / 2);
        if (Math.abs(hit.x - p.anchor[0]) <= half && Math.abs(hit.y - p.anchor[1]) <= half) bestP = p;
      }
      if (bestP && bestD > 1.1) propsRef.current.onSelect({ x: bestP.anchor[0], y: bestP.anchor[1], pyramid: bestP });
      else if (bestS) propsRef.current.onSelect({ x: bestS.x, y: bestS.y, settlement: bestS });
      else propsRef.current.onSelect({ x: wx, y: wy });
    };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      down = false;
      canvas.style.cursor = "grab";
      if (moved < 8) {
        const r = canvas.getBoundingClientRect();
        pick(e.clientX - r.left, e.clientY - r.top);
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      controls.zoomBy(e.deltaY > 0 ? 1 / 1.12 : 1.12);
    };
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    let labelStamp = -1;
    const frame = () => {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      cam.tx += (goal.tx - cam.tx) * 0.2;
      cam.tz += (goal.tz - cam.tz) * 0.2;
      cam.dist += (goal.dist - cam.dist) * 0.2;
      propsRef.current.onCameraChange?.({ tx: cam.tx, tz: cam.tz, dist: cam.dist });
      const hw = hwOf(cam.dist);
      const hh = hw * 0.5;
      const step = hw >= 16 ? 1 : hw >= 9 ? 2 : hw >= 6 ? 4 : 8;
      const reachX = Math.ceil(w / hw) + 6;
      const reachY = Math.ceil(h / hh) + 6;
      const x0 = Math.floor(cam.tx - reachX);
      const x1 = Math.ceil(cam.tx + reachX);
      const y0 = Math.floor(cam.tz - reachY);
      const y1 = Math.ceil(cam.tz + reachY);
      for (let cy = Math.floor(y0 / CHUNK); cy <= Math.floor(y1 / CHUNK); cy++) {
        for (let cx = Math.floor(x0 / CHUNK); cx <= Math.floor(x1 / CHUNK); cx++) ensure(cx, cy);
      }

      sky(ctx, w, h);
      const bounds = propsRef.current.viewBounds;
      type Job = { z: number; draw: () => void };
      const jobs: Job[] = [];
      for (let y = y0; y <= y1; y += step) {
        for (let x = x0; x <= x1; x += step) {
          if (!inside(bounds, x, y)) continue;
          const p = project(x + step * 0.5, y + step * 0.5);
          if (p.sx < -hw * 2 || p.sx > w + hw * 2 || p.sy < -hw || p.sy > h + hw * 2) continue;
          const t = tileAt(x, y);
          const tw = hw * step;
          const th = hh * step;
          jobs.push({
            z: x + y,
            draw: () => {
              ground(ctx, p.sx, p.sy, tw, th, t, x, y);
              if (t === 1 && step === 1 && tw > 8) {
                const trees = 1 + Math.floor(hash(x, y, 3) * 2);
                for (let i = 0; i < trees; i++) pine(ctx, p.sx + (hash(x, y, 4 + i) - 0.5) * tw * 0.5, p.sy - th * 0.2, tw * 0.85);
              }
            },
          });
        }
      }
      const seen = new Set<string>();
      for (const ch of chunks.values()) {
        for (const s of ch.settlements) {
          if (s.kind === "PLAYER_SLOT" || seen.has(s.settlement_id)) continue;
          if (s.x < x0 - 2 || s.x > x1 + 2 || s.y < y0 - 2 || s.y > y1 + 2) continue;
          if (!inside(bounds, s.x, s.y)) continue;
          seen.add(s.settlement_id);
          const p = project(s.x + 0.5, s.y + 0.5);
          jobs.push({ z: s.x + s.y + 0.4, draw: () => keep(ctx, p.sx, p.sy - hw * 0.15, Math.max(hw, 10), s.faction) });
          if (hw > 11) {
            jobs.push({
              z: s.x + s.y + 0.6,
              draw: () => plate(ctx, p.sx, p.sy - hw * 1.55, s.name, s.faction),
            });
          }
        }
      }
      for (const pyr of propsRef.current.pyramids) {
        const [px, py] = pyr.anchor;
        if (px < x0 - 8 || px > x1 + 8 || py < y0 - 8 || py > y1 + 8) continue;
        const p = project(px + 0.5, py + 0.5);
        jobs.push({ z: px + py + 0.2, draw: () => pyramid(ctx, p.sx, p.sy - hw * 0.2, hw * 1.4) });
        if (hw > 8) jobs.push({ z: px + py + 0.7, draw: () => plate(ctx, p.sx, p.sy - hw * 1.7, pyr.name, pyr.faction) });
      }
      const now = serverNow();
      for (const m of propsRef.current.marches) {
        const pos = marchPoint(m, now);
        if (!pos) continue;
        if (pos.x < x0 - 2 || pos.x > x1 + 2 || pos.y < y0 - 2 || pos.y > y1 + 2) continue;
        const p = project(pos.x, pos.y);
        const names = Object.keys(m.units ?? {});
        const kind = unitKind(names[0] ?? "Fanteria");
        const accent = m.hostile ? "#c0392b" : "#2a9d8f";
        jobs.push({
          z: pos.x + pos.y + 0.8,
          draw: () => {
            fighter(ctx, p.sx - hw * 0.25, p.sy, hw * 0.7, kind, accent);
            if (hw > 10) fighter(ctx, p.sx + hw * 0.2, p.sy + hw * 0.12, hw * 0.55, names[1] ? unitKind(names[1]) : kind, accent);
          },
        });
      }
      jobs.sort((a, b) => a.z - b.z);
      for (const job of jobs) job.draw();
      const stamp = Math.floor(performance.now() / 200);
      if (stamp !== labelStamp) {
        labelStamp = stamp;
        const next: { id: string; name: string; x: number; y: number }[] = [];
        for (const ch of chunks.values()) {
          for (const s of ch.settlements) {
            if (s.kind !== "PLAYER" || !inside(bounds, s.x, s.y)) continue;
            const p = project(s.x + 0.5, s.y + 0.5);
            if (p.sx < 0 || p.sx > w || p.sy < 0 || p.sy > h) continue;
            next.push({ id: s.settlement_id, name: s.name, x: p.sx - 44, y: p.sy - hw * 1.7 });
          }
        }
        setLabelsRef.current(next);
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.remove();
      propsRef.current.onEngine?.(null);
    };
    // The canvas lifecycle follows the world. Live props are read from propsRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId]);

  useEffect(() => {
    if (!home || Platform.OS !== "web") return;
    const id = window.setTimeout(() => controlsRef.current?.centerOn(home.x, home.y, 26), 30);
    return () => window.clearTimeout(id);
  }, [home?.x, home?.y]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View ref={hostRef} style={styles.fill} testID="map-3d-view">
      {labels.map((l) => (
        <View key={l.id} pointerEvents="none" style={[styles.chip, { left: l.x, top: l.y }]} testID={`map-label-${l.id}`} />
      ))}
    </View>
  );
}

function plate(ctx: CanvasRenderingContext2D, x: number, y: number, name: string, faction: string) {
  const label = name.length > 18 ? `${name.slice(0, 17)}…` : name;
  ctx.font = "700 12px Manrope, sans-serif";
  const tw = ctx.measureText(label).width;
  const bw = tw + 16;
  ctx.fillStyle = "rgba(20,16,12,0.78)";
  ctx.beginPath();
  ctx.roundRect(x - bw / 2, y - 11, bw, 20, 10);
  ctx.fill();
  ctx.fillStyle = faction === "OWN" ? "#f0c14a" : faction === "ENEMY" ? "#e07a72" : faction === "ALLY" ? "#7dcea0" : "#f4efe6";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, y);
}

function marchPoint(m: MarchDto, now: number): { x: number; y: number } | null {
  const path = m.path;
  if (!path?.length) return m.target_xy ? { x: m.target_xy[0], y: m.target_xy[1] } : null;
  const start = Date.parse(m.departed_at);
  const end = Date.parse(m.status === "RETURNING" ? m.return_at || m.arrival_at || "" : m.arrival_at || "");
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return { x: path[0][0], y: path[0][1] };
  const u = Math.max(0, Math.min(1, (now - start) / (end - start)));
  const f = u * (path.length - 1);
  const i = Math.min(path.length - 2, Math.floor(f));
  const a = path[Math.max(0, i)];
  const b = path[Math.min(path.length - 1, i + 1)];
  const t = f - i;
  return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t };
}

const styles = StyleSheet.create({
  fill: { flex: 1, position: "relative", overflow: "hidden" },
  chip: { position: "absolute", width: 88, height: 22 },
});
