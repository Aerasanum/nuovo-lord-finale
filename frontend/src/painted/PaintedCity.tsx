/** Painted isometric keep. Replaces the 3D village in the proof: same building names, a drawn courtyard. */
import React, { useEffect, useRef } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import type { VillageInput } from "@/src/city/village";

import { house, keep, pine, sky } from "./draw";

const ROOFS = ["#e24b32", "#2f6f9a", "#2a9d8f", "#e0a84a", "#8a5fd0", "#c9843a"];

type Props = { input: VillageInput; onPick?: (building: string | null) => void; style?: StyleProp<ViewStyle>; testID?: string };

export function PaintedCity({ input, onPick, style, testID }: Props) {
  const hostRef = useRef<View>(null);
  const inputRef = useRef(input);
  const onPickRef = useRef(onPick);
  useEffect(() => {
    inputRef.current = input;
    onPickRef.current = onPick;
  });

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const host = hostRef.current as unknown as HTMLElement | null;
    if (!host) return;
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
    host.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let disposed = false;
    let raf = 0;

    const layout = () => {
      const r = host.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(r.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w: r.width, h: r.height };
    };

    const spots: { name: string; x: number; y: number }[] = [];

    const frame = (t: number) => {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      const { w, h } = layout();
      if (w < 2 || h < 2) return;
      sky(ctx, w, h);
      ctx.fillStyle = "#7dce4a";
      ctx.fillRect(0, h * 0.42, w, h);
      const cx = w * 0.5;
      const cy = h * 0.58;
      const s = Math.min(w, h) * 0.16;
      for (let i = 0; i < 6; i++) pine(ctx, 28 + i * 18, cy + 20 + (i % 2) * 10, 28);
      for (let i = 0; i < 5; i++) pine(ctx, w - 36 - i * 16, cy + 16 + (i % 3) * 8, 26);
      ctx.strokeStyle = "rgba(120,80,40,0.55)";
      ctx.lineWidth = 8;
      ctx.strokeRect(w * 0.12, h * 0.28, w * 0.76, h * 0.58);
      keep(ctx, cx, cy, s * 1.15, "OWN");
      const names = inputRef.current.unlocked.filter((n) => n !== "Castello / Fortezza").slice(0, 8);
      spots.length = 0;
      names.forEach((name, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const x = w * 0.22 + col * (w * 0.18);
        const y = cy + s * 0.85 + row * s * 0.7;
        house(ctx, x, y + Math.sin(t / 900 + i) * 0, s * 0.55, ROOFS[i % ROOFS.length]);
        spots.push({ name, x, y });
      });
      ctx.fillStyle = "rgba(80,80,80,0.3)";
      const puff = (t / 400) % 40;
      ctx.beginPath();
      ctx.arc(cx + s * 0.35, cy - s * 1.3 - puff, 6 + puff * 0.15, 0, Math.PI * 2);
      ctx.fill();
    };
    raf = requestAnimationFrame(frame);

    const click = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const hit = spots.find((s) => Math.hypot(s.x - x, s.y - y) < 36);
      onPickRef.current?.(hit ? hit.name : "Castello / Fortezza");
    };
    canvas.addEventListener("pointerdown", click);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", click);
      canvas.remove();
    };
  }, []);

  if (Platform.OS !== "web") return <View style={style} testID={testID} />;
  return <View ref={hostRef} style={[styles.fill, style]} testID={testID} />;
}

const styles = StyleSheet.create({ fill: { position: "relative", overflow: "hidden", backgroundColor: "#9ed0f5" } });
