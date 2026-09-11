/** Tiny geometry helpers shared by the procedural asset builders (castles, flora, markers). */
import * as THREE from "three";

/** Merge geometries into one non-indexed geometry (position + normal + uv), optionally per-part transforms applied first. */
export function mergeGeos(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nonIndexed = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const g of nonIndexed) total += g.getAttribute("position").count;
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const uvs = new Float32Array(total * 2);
  let off = 0;
  for (const g of nonIndexed) {
    const p = g.getAttribute("position") as THREE.BufferAttribute;
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    const n = g.getAttribute("normal") as THREE.BufferAttribute;
    positions.set(p.array as Float32Array, off * 3);
    normals.set(n.array as Float32Array, off * 3);
    const uv = g.getAttribute("uv") as THREE.BufferAttribute | undefined;
    if (uv) uvs.set(uv.array as Float32Array, off * 2);
    off += p.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.computeBoundingSphere();
  for (const g of parts) g.dispose();
  return geo;
}

/** Translate / rotate-Y / scale a geometry in place and return it (builder sugar). */
export function place(g: THREE.BufferGeometry, x: number, y: number, z: number, rotY = 0, scale = 1): THREE.BufferGeometry {
  if (scale !== 1) g.scale(scale, scale, scale);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

/** Ring of `n` copies of `make()` at radius r, height y, each rotated to face outward. */
export function ring(n: number, r: number, y: number, make: () => THREE.BufferGeometry, phase = 0): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    out.push(place(make(), Math.sin(a) * r, y, Math.cos(a) * r, a));
  }
  return out;
}
