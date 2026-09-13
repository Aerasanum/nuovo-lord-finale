/**
 * March paths as flat ribbons with animated chevrons: direction, motion and faction colour read at a glance without
 * covering the terrain (a 1-px GL line does not). One shared chevron texture; the engine scrolls its offset per frame.
 */
import * as THREE from "three";

export const RIBBON_WIDTH = 0.34;

/** 64×16 RGBA chevron strip (transparent background, soft centre line, bright ">" every tile). */
export function chevronTexture(): THREE.DataTexture {
  const w = 64;
  const h = 16;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const cy = Math.abs((y + 0.5) / h - 0.5) * 2; // 0 centre → 1 edges
    for (let x = 0; x < w; x++) {
      const cx = (x + 0.5) / w;
      const lead = 0.3 + cy * 0.28;
      const chevron = cx > lead && cx < lead + 0.2 && cy < 0.92;
      const spine = cy < 0.16 ? 0.42 : 0;
      const a = chevron ? 1 : spine;
      const i = (y * w + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Ribbon geometry hugging the path (points already lifted above the terrain); u = distance in tiles. */
export function ribbonGeometry(pts: THREE.Vector3[], width = RIBBON_WIDTH): THREE.BufferGeometry {
  const n = pts.length;
  const pos = new Float32Array(n * 2 * 3);
  const uv = new Float32Array(n * 2 * 2);
  const idx: number[] = [];
  const dir = new THREE.Vector3();
  const side = new THREE.Vector3();
  let dist = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    dir.subVectors(b, a);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();
    side.set(-dir.z, 0, dir.x).multiplyScalar(width / 2);
    if (i > 0) dist += pts[i].distanceTo(pts[i - 1]);
    const p = pts[i];
    pos.set([p.x + side.x, p.y, p.z + side.z, p.x - side.x, p.y, p.z - side.z], i * 6);
    uv.set([dist, 0, dist, 1], i * 4);
    if (i < n - 1) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export function ribbonMaterial(color: THREE.Color, tex: THREE.Texture, opacity: number): THREE.MeshBasicMaterial {
  // drawn over terrain, forests and walls (depthTest off) — a march route must never hide behind a hill or a wood
  return new THREE.MeshBasicMaterial({ color, map: tex, transparent: true, opacity, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
}

/** Ponte Arcobaleno colour (Bible §12.2) — a brand-independent mythic violet, identical in light and dark themes. */
export const RAINBOW_COLOR = new THREE.Color("#D26BFF");

/** Sampled parabolic arc between the first and last tile of a rainbow path (bypasses terrain: no ground following). */
export function rainbowArc(path: number[][], heightAt: (x: number, y: number) => number, samples = 28): THREE.Vector3[] {
  const [ax, ay] = path[0];
  const [bx, by] = path[path.length - 1];
  const ha = heightAt(ax, ay) + 0.3;
  const hb = heightAt(bx, by) + 0.3;
  const dist = Math.hypot(bx - ax, by - ay);
  const peak = Math.min(18, 2.5 + dist * 0.18);
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    out.push(new THREE.Vector3(ax + 0.5 + (bx - ax) * t, ha + (hb - ha) * t + Math.sin(t * Math.PI) * peak, ay + 0.5 + (by - ay) * t));
  }
  return out;
}
