/** Original storybook isometric pieces. No imported game art: every shape is drawn here. */

export type UnitKind = "spear" | "bow" | "horse" | "ram" | "cart";

export function hash(x: number, y: number, n = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(n, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, hw: number, hh: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - hh);
  ctx.lineTo(x + hw, y);
  ctx.lineTo(x, y + hh);
  ctx.lineTo(x - hw, y);
  ctx.closePath();
}

export function sky(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#7ec8f8");
  g.addColorStop(0.45, "#d7f1ff");
  g.addColorStop(1, "#c6e7a4");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  for (let i = 0; i < 5; i++) {
    const cx = ((i * 173) % 100) / 100 * w;
    const cy = 18 + (i % 3) * 26;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 46 + i * 8, 16, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 28, cy + 4, 32, 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function ground(ctx: CanvasRenderingContext2D, x: number, y: number, hw: number, hh: number, terrain: number, wx: number, wy: number) {
  const n = hash(wx, wy);
  diamond(ctx, x, y, hw, hh);
  if (terrain === 3) {
    const g = ctx.createLinearGradient(x, y - hh, x, y + hh);
    g.addColorStop(0, "#8fd8ff");
    g.addColorStop(1, "#2f86d0");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = Math.max(1, hw * 0.06);
    ctx.beginPath();
    ctx.moveTo(x - hw * 0.35, y - hh * 0.05);
    ctx.quadraticCurveTo(x, y - hh * 0.35, x + hw * 0.4, y + hh * 0.05);
    ctx.stroke();
    return;
  }
  if (terrain === 2) {
    ctx.fillStyle = n > 0.55 ? "#d9c7a8" : "#c3ad90";
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.moveTo(x, y - hh * 0.95);
    ctx.lineTo(x + hw * 0.28, y - hh * 0.35);
    ctx.lineTo(x - hw * 0.22, y - hh * 0.3);
    ctx.fill();
    return;
  }
  if (terrain === 1) {
    ctx.fillStyle = n > 0.5 ? "#3f9a48" : "#2f7d3c";
    ctx.fill();
    return;
  }
  if (terrain < 0) {
    ctx.fillStyle = "rgba(210,232,246,0.55)";
    ctx.fill();
    return;
  }
  const wheat = n > 0.84;
  ctx.fillStyle = wheat ? "#d6e06a" : n > 0.5 ? "#8ed84f" : "#69c43c";
  ctx.fill();
  if (hw > 7 && n > 0.72 && !wheat) {
    ctx.fillStyle = n > 0.88 ? "#f4f6fb" : "#f2d15a";
    ctx.beginPath();
    ctx.arc(x + (n - 0.8) * hw, y + (hash(wx, wy, 2) - 0.5) * hh, Math.max(1.2, hw * 0.08), 0, Math.PI * 2);
    ctx.fill();
  }
}

export function pine(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.fillStyle = "rgba(40,70,30,0.25)";
  ctx.beginPath();
  ctx.ellipse(x, y + s * 0.05, s * 0.28, s * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6a4428";
  ctx.fillRect(x - s * 0.05, y - s * 0.15, s * 0.1, s * 0.28);
  ctx.fillStyle = "#1e6b34";
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.95);
  ctx.lineTo(x + s * 0.38, y - s * 0.15);
  ctx.lineTo(x - s * 0.38, y - s * 0.15);
  ctx.fill();
  ctx.fillStyle = "#3d9a4e";
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.95);
  ctx.lineTo(x + s * 0.16, y - s * 0.45);
  ctx.lineTo(x - s * 0.05, y - s * 0.5);
  ctx.fill();
}

function face(ctx: CanvasRenderingContext2D, pts: [number, number][], color: string) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** Timber keep with a terracotta roof. `s` is the tile half-width. */
export function keep(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, faction: string) {
  const own = faction === "OWN";
  const enemy = faction === "ENEMY";
  const ally = faction === "ALLY";
  const wallL = enemy ? "#8d8a96" : "#f4e7d0";
  const wallR = enemy ? "#5e5b68" : "#d9c4a4";
  const roof = enemy ? "#6e2e4e" : ally ? "#2f6f4a" : own ? "#e24b32" : "#e0a84a";
  const w = s * 0.72;
  const h = s * 0.95;
  ctx.fillStyle = "rgba(40,50,20,0.22)";
  ctx.beginPath();
  ctx.ellipse(x, y + s * 0.08, w * 1.15, s * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  face(ctx, [[x - w, y], [x, y + s * 0.38], [x, y - h * 0.15], [x - w, y - h * 0.45]], wallL);
  face(ctx, [[x + w, y], [x, y + s * 0.38], [x, y - h * 0.15], [x + w, y - h * 0.45]], wallR);
  face(ctx, [[x, y - h * 1.15], [x + w, y - h * 0.45], [x, y - h * 0.15], [x - w, y - h * 0.45]], roof);
  face(ctx, [[x, y - h * 0.15], [x + w * 0.15, y - h * 0.05], [x, y + s * 0.05], [x - w * 0.15, y - h * 0.05]], "#6b3e22");
  ctx.fillStyle = "#f6e7a8";
  ctx.fillRect(x - w * 0.55, y - h * 0.35, w * 0.16, h * 0.16);
  ctx.fillRect(x + w * 0.28, y - h * 0.28, w * 0.16, h * 0.16);
  ctx.strokeStyle = "#6b3e22";
  ctx.lineWidth = Math.max(1, s * 0.04);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.15, y - h * 1.15);
  ctx.lineTo(x - w * 0.15, y - h * 1.55);
  ctx.stroke();
  ctx.fillStyle = own ? "#f0c14a" : ally ? "#7dcea0" : enemy ? "#e06a6a" : "#f4f0e6";
  ctx.beginPath();
  ctx.moveTo(x - w * 0.15, y - h * 1.55);
  ctx.lineTo(x + w * 0.35, y - h * 1.38);
  ctx.lineTo(x - w * 0.15, y - h * 1.22);
  ctx.fill();
  if (s > 16) {
    ctx.fillStyle = "rgba(90,90,90,0.35)";
    ctx.beginPath();
    ctx.arc(x + w * 0.45, y - h * 1.25, s * 0.08, 0, Math.PI * 2);
    ctx.arc(x + w * 0.62, y - h * 1.42, s * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function pyramid(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const steps = 4;
  for (let i = 0; i < steps; i++) {
    const k = 1 - i / steps;
    diamond(ctx, x, y - i * s * 0.22, s * 1.15 * k, s * 0.48 * k);
    ctx.fillStyle = i % 2 ? "#f0c14a" : "#e7b23a";
    ctx.fill();
    ctx.strokeStyle = "rgba(120,70,20,0.35)";
    ctx.stroke();
  }
  ctx.fillStyle = "#7fd4ff";
  ctx.beginPath();
  ctx.arc(x, y - steps * s * 0.22, Math.max(2, s * 0.12), 0, Math.PI * 2);
  ctx.fill();
}

export function fighter(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, kind: UnitKind, accent = "#2a9d8f") {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(30,40,20,0.25)";
  ctx.beginPath();
  ctx.ellipse(0, s * 0.08, s * 0.28, s * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  if (kind === "horse") {
    ctx.fillStyle = "#8a5a32";
    ctx.beginPath();
    ctx.ellipse(s * 0.05, -s * 0.05, s * 0.42, s * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6b4424";
    ctx.fillRect(-s * 0.28, s * 0.02, s * 0.08, s * 0.22);
    ctx.fillRect(s * 0.22, s * 0.02, s * 0.08, s * 0.22);
    ctx.beginPath();
    ctx.ellipse(s * 0.38, -s * 0.22, s * 0.12, s * 0.16, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.fillRect(-s * 0.05, -s * 0.42, s * 0.16, s * 0.28);
    ctx.fillStyle = "#f3d2b5";
    ctx.beginPath();
    ctx.arc(s * 0.04, -s * 0.52, s * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  if (kind === "cart" || kind === "ram") {
    ctx.fillStyle = "#c9843a";
    ctx.fillRect(-s * 0.32, -s * 0.28, s * 0.64, s * 0.32);
    ctx.fillStyle = kind === "ram" ? "#8d97a3" : "#e24b32";
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, -s * 0.28);
    ctx.lineTo(s * 0.15, -s * 0.62);
    ctx.lineTo(s * 0.36, -s * 0.28);
    ctx.fill();
    ctx.fillStyle = "#5b4636";
    ctx.beginPath();
    ctx.arc(-s * 0.18, s * 0.08, s * 0.1, 0, Math.PI * 2);
    ctx.arc(s * 0.2, s * 0.08, s * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.fillStyle = accent;
  ctx.fillRect(-s * 0.12, -s * 0.42, s * 0.24, s * 0.38);
  ctx.fillStyle = "#f3d2b5";
  ctx.beginPath();
  ctx.arc(0, -s * 0.54, s * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6b3e22";
  ctx.fillRect(-s * 0.08, -s * 0.02, s * 0.07, s * 0.2);
  ctx.fillRect(s * 0.02, -s * 0.02, s * 0.07, s * 0.2);
  ctx.strokeStyle = kind === "bow" ? "#6b3e22" : "#d9dde3";
  ctx.lineWidth = Math.max(1.5, s * 0.06);
  ctx.beginPath();
  if (kind === "bow") {
    ctx.arc(s * 0.22, -s * 0.35, s * 0.18, -1.2, 1.2);
  } else {
    ctx.moveTo(s * 0.16, -s * 0.7);
    ctx.lineTo(s * 0.16, s * 0.05);
  }
  ctx.stroke();
  if (kind === "spear") {
    ctx.fillStyle = "#e8eef2";
    ctx.beginPath();
    ctx.moveTo(s * 0.16, -s * 0.82);
    ctx.lineTo(s * 0.24, -s * 0.64);
    ctx.lineTo(s * 0.08, -s * 0.64);
    ctx.fill();
  }
  ctx.restore();
}

export function house(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, roof = "#e24b32") {
  const w = s * 0.7;
  face(ctx, [[x - w, y], [x, y + s * 0.32], [x, y - s * 0.2], [x - w, y - s * 0.48]], "#f7efe0");
  face(ctx, [[x + w, y], [x, y + s * 0.32], [x, y - s * 0.2], [x + w, y - s * 0.48]], "#e4d3b8");
  face(ctx, [[x, y - s * 1.05], [x + w, y - s * 0.48], [x, y - s * 0.2], [x - w, y - s * 0.48]], roof);
  ctx.fillStyle = "#6b3e22";
  ctx.fillRect(x - s * 0.08, y - s * 0.02, s * 0.16, s * 0.28);
}

export function unitKind(name: string): UnitKind {
  if (name === "Arciere" || name === "Falco") return "bow";
  if (name === "Cavalleria" || name === "Leone" || name === "Lupo") return "horse";
  if (name === "Catapulta") return "ram";
  if (name === "Carro di Conquista" || name === "Elefante da Guerra") return "cart";
  return "spear";
}
