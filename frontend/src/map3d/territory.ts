/**
 * Territory overlay: a faint relief-following fill plus a crisp border ribbon along the outer edge of each faction's
 * tile set — the claim reads as a bounded region instead of a checkerboard of squares.
 */
import * as THREE from "three";

type Tile = { x: number; y: number; faction: "OWN" | "ALLY" | "ENEMY" | "RESERVED" };
type CornerH = (x: number, y: number) => number;

export type TerritoryMaterials = { fill: THREE.MeshBasicMaterial; fillFaint: THREE.MeshBasicMaterial; border: THREE.MeshBasicMaterial; borderFaint: THREE.MeshBasicMaterial };

export function createTerritoryMaterials(): TerritoryMaterials {
  const mk = (opacity: number) => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
  const mats = { fill: mk(0.16), fillFaint: mk(0.06), border: mk(0.95), borderFaint: mk(0.35) };
  for (const m of Object.values(mats)) m.userData.shared = true;
  return mats;
}

const FILL_LIFT = 0.045;
const BORDER_LIFT = 0.07;
const BORDER_W = 0.13;

export function buildTerritory(tiles: Tile[], bounds: { x0: number; y0: number; x1: number; y1: number }, cornerH: CornerH, colorOf: (f: Tile["faction"]) => THREE.Color, mats: TerritoryMaterials): THREE.Object3D[] {
  if (!tiles.length) return [];
  const out: THREE.Object3D[] = [];
  for (const faint of [false, true]) {
    const set = new Map<string, Tile>();
    for (const t of tiles) if ((t.faction === "RESERVED") === faint) set.set(`${t.x}:${t.y}`, t);
    if (!set.size) continue;
    const fill: number[] = [];
    const fillCol: number[] = [];
    const border: number[] = [];
    const borderCol: number[] = [];
    const pushTri = (arr: number[], cols: number[], c: THREE.Color, ...pts: number[][]) => {
      for (const p of pts) {
        arr.push(p[0], p[1], p[2]);
        cols.push(c.r, c.g, c.b);
      }
    };
    const quad = (arr: number[], cols: number[], c: THREE.Color, a: number[], b: number[], d: number[], e: number[]) => {
      pushTri(arr, cols, c, a, d, b);
      pushTri(arr, cols, c, b, d, e);
    };
    for (const t of set.values()) {
      const c = colorOf(t.faction);
      const h00 = cornerH(t.x, t.y) + FILL_LIFT;
      const h10 = cornerH(t.x + 1, t.y) + FILL_LIFT;
      const h01 = cornerH(t.x, t.y + 1) + FILL_LIFT;
      const h11 = cornerH(t.x + 1, t.y + 1) + FILL_LIFT;
      quad(fill, fillCol, c, [t.x, h00, t.y], [t.x + 1, h10, t.y], [t.x, h01, t.y + 1], [t.x + 1, h11, t.y + 1]);
      // border ribbon on every edge whose neighbour (inside this chunk) is not the same faction
      const open = (nx: number, ny: number) => nx >= bounds.x0 && ny >= bounds.y0 && nx < bounds.x1 && ny < bounds.y1 && set.get(`${nx}:${ny}`)?.faction !== t.faction;
      const lift = BORDER_LIFT - FILL_LIFT;
      if (open(t.x, t.y - 1)) quad(border, borderCol, c, [t.x, h00 + lift, t.y], [t.x + 1, h10 + lift, t.y], [t.x, h00 + lift, t.y + BORDER_W], [t.x + 1, h10 + lift, t.y + BORDER_W]);
      if (open(t.x, t.y + 1)) quad(border, borderCol, c, [t.x, h01 + lift, t.y + 1 - BORDER_W], [t.x + 1, h11 + lift, t.y + 1 - BORDER_W], [t.x, h01 + lift, t.y + 1], [t.x + 1, h11 + lift, t.y + 1]);
      if (open(t.x - 1, t.y)) quad(border, borderCol, c, [t.x, h00 + lift, t.y], [t.x + BORDER_W, h00 + lift, t.y], [t.x, h01 + lift, t.y + 1], [t.x + BORDER_W, h01 + lift, t.y + 1]);
      if (open(t.x + 1, t.y)) quad(border, borderCol, c, [t.x + 1 - BORDER_W, h10 + lift, t.y], [t.x + 1, h10 + lift, t.y], [t.x + 1 - BORDER_W, h11 + lift, t.y + 1], [t.x + 1, h11 + lift, t.y + 1]);
    }
    const mesh = (pos: number[], col: number[], mat: THREE.Material) => {
      if (!pos.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      const m = new THREE.Mesh(geo, mat);
      m.frustumCulled = false;
      out.push(m);
    };
    mesh(fill, fillCol, faint ? mats.fillFaint : mats.fill);
    mesh(border, borderCol, faint ? mats.borderFaint : mats.border);
  }
  return out;
}
