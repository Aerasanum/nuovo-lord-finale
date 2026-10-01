/** A row of the original unit drawings, used on the army screen and the march composer. */
import React, { useEffect, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { fighter, sky, unitKind, type UnitKind } from "./draw";

const ORDER = ["Fanteria", "Arciere", "Cavalleria", "Catapulta", "Carro di Conquista"];

type Props = { counts: Record<string, number>; height?: number };

export function PaintedRoster({ counts, height = 150 }: Props) {
  const hostRef = useRef<View>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const host = hostRef.current as unknown as HTMLElement | null;
    if (!host) return;
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
    host.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const paint = () => {
      const r = host.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(r.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sky(ctx, r.width, r.height);
      ctx.fillStyle = "#8ed25a";
      ctx.fillRect(0, r.height * 0.62, r.width, r.height);
      const slot = r.width / ORDER.length;
      ORDER.forEach((name, i) => {
        const n = counts[name] ?? 0;
        const kind = unitKind(name) as UnitKind;
        const x = slot * i + slot / 2;
        fighter(ctx, x, r.height * 0.62, Math.min(54, slot * 0.42), kind, n > 0 ? "#2a9d8f" : "#9aa39a");
        ctx.fillStyle = "#1c1814";
        ctx.font = "700 13px Manrope, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(name.split(" ")[0], x, r.height * 0.22);
        ctx.font = "700 16px Manrope, sans-serif";
        ctx.fillText(String(n), x, r.height * 0.4);
      });
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(host);
    return () => {
      ro.disconnect();
      canvas.remove();
    };
  }, [ORDER.map((n) => counts[n] ?? 0).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  if (Platform.OS !== "web") return null;
  return <View ref={hostRef} style={[styles.box, { height }]} testID="painted-roster" />;
}

const styles = StyleSheet.create({
  box: { width: "100%", borderRadius: 12, overflow: "hidden" },
});
