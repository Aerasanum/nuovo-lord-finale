/**
 * Empire Lords Dragon — 3D strategic map engine (three.js over expo-gl, no textures → identical on Android/web).
 *
 * Architecture:
 *  - Chunk streaming: 32×32-tile chunks fetched around the camera target (radius grows with zoom, capped), LRU pool.
 *  - Terrain LOD: step-1 mesh (near), step-2 mesh (mid); beyond that a 13×13 world overview (1 cell = 4×4 tiles) that
 *    is always resident and hidden tile-by-tile under loaded chunks. Water is one shared animated plane.
 *  - Entities: instanced castles / camps / sentinels per chunk (~10 draw calls per chunk), far-zoom pins for players.
 *  - Labels: settlement screen positions are projected and handed to React Native for crisp text overlays.
 *  - Camera: yaw/pitch/dist orbit around a ground target, pan inertia, focal-point zoom, eased centerOn.
 */
import type { ExpoWebGLRenderingContext } from "expo-gl";
import * as THREE from "three";

import type { ChunkDto, MarchDto, OverviewDto, SentinelDto, SettlementPublic } from "@/src/api/hooks";
import type { ThemeColors } from "@/src/theme";

import { disposeGroup, EntityFactory, type EntityPalette, settlementScale } from "./entities";
import { buildGridGeometry, buildTerrainGeometry, hash2, type Sampler, type TerrainPalette, tileHeight } from "./terrain";
import { createWater } from "./water";

export const CHUNK = 32;
export const WORLD = 400;
const N_CHUNKS = Math.ceil(WORLD / CHUNK);
const OV_FACTOR = 4;
const OV_PER_CHUNK = CHUNK / OV_FACTOR;
const OV_SIZE = WORLD / OV_FACTOR;
const OV_SCALE_Y = 1.2;

export type Selection = { x: number; y: number; settlement?: SettlementPublic; sentinel?: SentinelDto };
export type MapLabel = { id: string; x: number; y: number; name: string; level: number; faction: string; kind: string };

type EngineOpts = {
  gl: ExpoWebGLRenderingContext;
  width: number;
  height: number;
  pixelRatio: number;
  colors: ThemeColors;
  fetchChunk: (cx: number, cy: number) => Promise<ChunkDto>;
  fetchOverview: () => Promise<OverviewDto>;
  onSelect: (sel: Selection | null) => void;
  onCameraChange?: (cam: { tx: number; tz: number; dist: number }) => void;
  onLabels?: (labels: MapLabel[]) => void;
};

type ChunkNode = {
  key: string;
  cx: number;
  cy: number;
  group: THREE.Group;
  terrain: (THREE.Mesh | null)[]; // by LOD index (step 1, step 2)
  trees?: THREE.InstancedMesh;
  props: THREE.InstancedMesh[];
  territory: THREE.InstancedMesh[];
  grid?: THREE.LineSegments | null;
  entities: THREE.Group;
  data: ChunkDto;
  lastUsed: number;
  lod: number;
};

const MAX_CHUNKS = 60;
const STREAM_RADIUS_CAP = 100;
const LOD_STEPS = [1, 2];
const LOD0_DIST = 34;
const GRID_ZOOM = 22;
const PIN_ZOOM = 70;

function hexToColor(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Local tile indices (within the chunk) occupied by settlements / sentinels — kept clear of trees and props. */
function blockedTiles(data: ChunkDto): Set<number> {
  const out = new Set<number>();
  const ox = data.cx * CHUNK;
  const oz = data.cy * CHUNK;
  const mark = (x: number, y: number, r: number) => {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const lx = x + dx - ox;
        const lz = y + dy - oz;
        if (lx >= 0 && lz >= 0 && lx < CHUNK && lz < CHUNK) out.add(lz * CHUNK + lx);
      }
    }
  };
  for (const s of data.settlements) mark(s.x, s.y, s.kind === "PLAYER_SLOT" ? 0 : 1);
  for (const s of data.sentinels) mark(s.x, s.y, 0);
  return out;
}

export class MapEngine {
  private gl: ExpoWebGLRenderingContext;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private opts: EngineOpts;
  private chunks = new Map<string, ChunkNode>();
  private loading = new Set<string>();
  private failedAt = new Map<string, number>();
  private raf = 0;
  private disposed = false;
  private dirty = true;
  private labelsDirty = true;
  private lastStream = 0;
  private lastFrame = 0;
  private lastLabels = 0;
  private lastTick = 0;
  private startedAt = Date.now();
  private marchGroup = new THREE.Group();
  private marchMarkers: { march: MarchDto; marker: THREE.Object3D; line: THREE.Line }[] = [];
  private selectionRing: THREE.Mesh;
  private homeBeacon: THREE.Mesh;
  private palette: TerrainPalette & EntityPalette & { bg: THREE.Color };
  private width: number;
  private height: number;
  private bufW = 0;
  private bufH = 0;
  private terrainGrid = new Map<string, Uint8Array>();
  private factory: EntityFactory;
  private water: ReturnType<typeof createWater>;
  private overview: { data: OverviewDto; grid: Uint8Array; tiles: Map<string, THREE.Mesh>; pins: THREE.InstancedMesh | null } | null = null;
  private overviewLoading = false;
  private pinsDist = 1;
  private panVel = { x: 0, y: 0 };
  private camAnim: { from: { tx: number; tz: number; dist: number }; to: { tx: number; tz: number; dist: number }; start: number; ms: number } | null = null;
  private mats: { terrain: THREE.MeshLambertMaterial; overview: THREE.MeshLambertMaterial; tree: THREE.MeshLambertMaterial; trunk: THREE.MeshLambertMaterial; grid: THREE.LineBasicMaterial; territory: THREE.MeshBasicMaterial; territoryFaint: THREE.MeshBasicMaterial; bush: THREE.MeshLambertMaterial; rock: THREE.MeshLambertMaterial };
  private geos: { tree: THREE.BufferGeometry; tile: THREE.PlaneGeometry; bush: THREE.BufferGeometry; rock: THREE.BufferGeometry };
  private sampler: Sampler = (x, y) => this.tileAt(x, y);
  private ovSampler: Sampler = (x, y) => this.overviewTileAt(x, y);

  cam = { tx: 200, tz: 200, yaw: Math.PI / 4, pitch: 0.95, dist: 38 };
  minDist = 8;
  maxDist = 170;

  constructor(opts: EngineOpts) {
    this.opts = opts;
    this.gl = opts.gl;
    this.width = opts.width;
    this.height = opts.height;
    const c = opts.colors;
    const plain = hexToColor(c.terrainPlain);
    const mountain = hexToColor(c.terrainMountain);
    this.palette = {
      plain,
      forest: hexToColor(c.terrainForest),
      mountain,
      water: hexToColor(c.terrainWater),
      sand: plain.clone().offsetHSL(0.04, -0.2, 0.22),
      rock: mountain.clone().multiplyScalar(0.68),
      own: hexToColor(c.factionOwn),
      enemy: hexToColor(c.factionEnemy),
      neutral: hexToColor(c.factionNeutral),
      ally: hexToColor(c.factionAlly),
      stone: mountain.clone().offsetHSL(0, -0.08, 0.2),
      roof: hexToColor(c.brandSecondary),
      snow: hexToColor(c.onSurface),
      bg: hexToColor(c.surface),
    };
    const canvas: any = { width: opts.gl.drawingBufferWidth, height: opts.gl.drawingBufferHeight, style: {}, addEventListener: () => {}, removeEventListener: () => {}, clientHeight: opts.gl.drawingBufferHeight, getContext: () => opts.gl };
    this.renderer = new THREE.WebGLRenderer({ canvas, context: opts.gl as any, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(1);
    this.bufW = opts.gl.drawingBufferWidth;
    this.bufH = opts.gl.drawingBufferHeight;
    this.renderer.setSize(this.bufW, this.bufH, false);
    this.renderer.setClearColor(this.palette.bg, 1);
    this.scene.fog = new THREE.Fog(this.palette.bg, 60, 260);

    this.camera = new THREE.PerspectiveCamera(46, this.bufW / Math.max(1, this.bufH), 0.5, 900);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x2b2620, 0.7);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.4);
    sun.position.set(80, 140, 60);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x9fb4ff, 0.25);
    fill.position.set(-60, 80, -90);
    this.scene.add(fill);

    this.mats = {
      terrain: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
      overview: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 }),
      tree: new THREE.MeshLambertMaterial({ color: this.palette.forest.clone().offsetHSL(0, 0.05, -0.02), flatShading: true }),
      trunk: new THREE.MeshLambertMaterial({ color: hexToColor(c.resourceWood) }),
      grid: new THREE.LineBasicMaterial({ color: this.palette.snow, transparent: true, opacity: 0.16, depthWrite: false }),
      territory: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3, depthWrite: false }),
      territoryFaint: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.1, depthWrite: false }),
      bush: new THREE.MeshLambertMaterial({ color: this.palette.forest.clone().offsetHSL(0.02, 0.1, 0.06), flatShading: true }),
      rock: new THREE.MeshLambertMaterial({ color: this.palette.rock.clone().offsetHSL(0, 0, 0.08), flatShading: true }),
    };
    const tile = new THREE.PlaneGeometry(1, 1);
    tile.rotateX(-Math.PI / 2);
    const bush = new THREE.SphereGeometry(0.17, 6, 4);
    bush.scale(1, 0.65, 1);
    this.geos = { tree: mergeTreeGeometry(new THREE.ConeGeometry(0.28, 0.9, 5), new THREE.CylinderGeometry(0.06, 0.08, 0.3, 5)), tile, bush, rock: new THREE.DodecahedronGeometry(0.15, 0) };
    for (const g of Object.values(this.geos)) g.userData.shared = true;
    for (const m of Object.values(this.mats)) m.userData.shared = true;
    this.factory = new EntityFactory(this.palette);

    this.water = createWater(WORLD, this.palette.water, this.palette.water.clone().offsetHSL(0.01, 0.05, 0.12));
    this.scene.add(this.water.mesh);

    this.selectionRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.8, 32), new THREE.MeshBasicMaterial({ color: this.palette.own, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false }));
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.visible = false;
    this.scene.add(this.selectionRing);

    this.homeBeacon = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.3, 40), new THREE.MeshBasicMaterial({ color: this.palette.own, side: THREE.DoubleSide, transparent: true, opacity: 0.5, depthWrite: false }));
    this.homeBeacon.rotation.x = -Math.PI / 2;
    this.homeBeacon.visible = false;
    this.scene.add(this.homeBeacon);

    this.scene.add(this.marchGroup);
    this.updateCamera();
    this.loadOverview();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------------------------------------ public API
  resize(width: number, height: number) {
    if (width <= 0 || height <= 0) return; // hidden (e.g. behind a modal on web): keep the last valid layout size
    this.width = width;
    this.height = height;
    this.syncDrawingBuffer();
    this.dirty = true;
    this.labelsDirty = true;
  }

  /**
   * The canvas can be resized by the host (expo-gl web re-applies width/height on layout; a modal hiding the tab
   * collapses it to 0×0 and back). Keep the renderer/camera in step with the real drawing buffer every frame.
   */
  private syncDrawingBuffer(): boolean {
    const w = this.gl.drawingBufferWidth;
    const h = this.gl.drawingBufferHeight;
    if (!w || !h) return false;
    if (w !== this.bufW || h !== this.bufH) {
      this.bufW = w;
      this.bufH = h;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.dirty = true;
      this.labelsDirty = true;
    }
    return true;
  }

  centerOn(x: number, y: number, dist?: number, animate = true) {
    const to = { tx: x + 0.5, tz: y + 0.5, dist: dist ? Math.max(this.minDist, Math.min(this.maxDist, dist)) : this.cam.dist };
    this.panVel = { x: 0, y: 0 };
    if (!animate) {
      this.cam.tx = to.tx;
      this.cam.tz = to.tz;
      this.cam.dist = to.dist;
      this.camAnim = null;
      this.updateCamera();
      return;
    }
    const far = Math.hypot(to.tx - this.cam.tx, to.tz - this.cam.tz);
    this.camAnim = { from: { tx: this.cam.tx, tz: this.cam.tz, dist: this.cam.dist }, to, start: Date.now(), ms: Math.min(900, 350 + far * 2) };
  }

  setHome(x: number, y: number) {
    this.homeBeacon.position.set(x + 0.5, this.heightAt(x, y) + 0.05, y + 0.5);
    this.homeBeacon.visible = true;
    this.dirty = true;
  }

  pan(dx: number, dy: number) {
    this.camAnim = null;
    const k = (this.cam.dist / this.height) * 1.7;
    const yaw = this.cam.yaw;
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    this.cam.tx += (-rx * dx + fx * dy) * k;
    this.cam.tz += (-rz * dx + fz * dy) * k;
    this.cam.tx = Math.max(-10, Math.min(WORLD + 10, this.cam.tx));
    this.cam.tz = Math.max(-10, Math.min(WORLD + 10, this.cam.tz));
    this.updateCamera();
  }

  /** Momentum after a pan gesture; velocity in view px/s. */
  flingPan(vx: number, vy: number) {
    this.panVel = { x: vx, y: vy };
  }

  stopInertia() {
    this.panVel = { x: 0, y: 0 };
    this.camAnim = null;
  }

  /** Zoom keeping the ground point under (px,py) fixed when a focal point is given. */
  zoomBy(factor: number, px?: number, py?: number) {
    this.camAnim = null;
    const before = px != null && py != null ? this.groundHit(px, py) : null;
    this.cam.dist = Math.max(this.minDist, Math.min(this.maxDist, this.cam.dist / factor));
    this.updateCamera();
    if (before) {
      const after = this.groundHit(px!, py!);
      if (after) {
        this.cam.tx = Math.max(-10, Math.min(WORLD + 10, this.cam.tx + before.x - after.x));
        this.cam.tz = Math.max(-10, Math.min(WORLD + 10, this.cam.tz + before.z - after.z));
        this.updateCamera();
      }
    }
  }

  rotateBy(delta: number) {
    this.cam.yaw += delta;
    this.updateCamera();
  }

  tiltBy(delta: number) {
    this.cam.pitch = Math.max(0.5, Math.min(1.35, this.cam.pitch + delta));
    this.updateCamera();
  }

  /** Tap in view pixels -> tile pick (settlement / sentinel / bare tile). */
  tap(px: number, py: number) {
    const hit = this.groundHit(px, py);
    if (!hit) return;
    const tx = Math.floor(hit.x);
    const tz = Math.floor(hit.z);
    if (tx < 0 || tz < 0 || tx >= WORLD || tz >= WORLD) {
      this.select(null);
      return;
    }
    // generous touch radius scaled with zoom: ~22px on screen
    const radius = Math.max(0.9, (this.cam.dist / this.height) * 40);
    let best: { d: number; s?: SettlementPublic; sen?: SentinelDto } | null = null;
    const consider = (list: SettlementPublic[]) => {
      for (const s of list) {
        const d = Math.hypot(s.x + 0.5 - hit.x, s.y + 0.5 - hit.z);
        if (d < radius * (s.kind === "PLAYER_SLOT" ? 0.7 : 1) && (!best || d < best.d)) best = { d, s };
      }
    };
    for (const ch of this.chunks.values()) {
      if (!ch.group.visible) continue;
      if (Math.abs(ch.cx * CHUNK + 16 - tx) > 48 || Math.abs(ch.cy * CHUNK + 16 - tz) > 48) continue;
      consider(ch.data.settlements);
      for (const sen of ch.data.sentinels) {
        const d = Math.hypot(sen.x + 0.5 - hit.x, sen.y + 0.5 - hit.z);
        if (d < radius * 0.8 && (!best || d < best.d)) best = { d, sen };
      }
    }
    if (!best && this.overview) consider(this.overview.data.settlements);
    const b = best as { d: number; s?: SettlementPublic; sen?: SentinelDto } | null;
    if (b?.s) this.select({ x: b.s.x, y: b.s.y, settlement: b.s });
    else if (b?.sen) this.select({ x: b.sen.x, y: b.sen.y, sentinel: b.sen });
    else this.select({ x: tx, y: tz });
  }

  select(sel: Selection | null) {
    if (sel) {
      this.selectionRing.position.set(sel.x + 0.5, this.heightAt(sel.x, sel.y) + 0.06, sel.y + 0.5);
      this.selectionRing.visible = true;
    } else this.selectionRing.visible = false;
    this.dirty = true;
    this.opts.onSelect(sel);
  }

  setMarches(marches: MarchDto[]) {
    for (const m of this.marchMarkers) {
      this.marchGroup.remove(m.marker);
      this.marchGroup.remove(m.line);
      disposeGroup(m.marker);
      (m.line.geometry as THREE.BufferGeometry).dispose();
      (m.line.material as THREE.Material).dispose();
    }
    this.marchMarkers = [];
    for (const march of marches) {
      if (!march.path || march.path.length < 2) continue;
      const own = march.units && Object.keys(march.units).length > 0;
      const color = own ? this.palette.own : this.palette.enemy;
      const pts = march.path.map(([x, y]) => new THREE.Vector3(x + 0.5, this.heightAt(x, y) + 0.12, y + 0.5));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color, dashSize: 0.5, gapSize: 0.3, transparent: true, opacity: 0.85 }));
      line.computeLineDistances();
      const marker = new THREE.Group();
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.7, 6), new THREE.MeshLambertMaterial({ color }));
      body.position.y = 0.6;
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.35), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
      banner.position.set(0.25, 1.25, 0);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 4), new THREE.MeshBasicMaterial({ color: this.palette.snow }));
      pole.position.y = 0.7;
      marker.add(body, banner, pole);
      this.marchGroup.add(line, marker);
      this.marchMarkers.push({ march, marker, line });
    }
    this.dirty = true;
  }

  /** Refresh chunk entities after a data change (e.g. conquest) without re-fetching terrain. */
  invalidateChunks() {
    for (const key of Array.from(this.chunks.keys())) this.removeChunk(key);
    this.overview = null;
    this.loadOverview();
    this.dirty = true;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    for (const key of Array.from(this.chunks.keys())) this.removeChunk(key);
    if (this.overview) {
      for (const m of this.overview.tiles.values()) {
        this.scene.remove(m);
        m.geometry.dispose();
      }
      if (this.overview.pins) {
        this.scene.remove(this.overview.pins);
        this.overview.pins.dispose();
      }
    }
    this.renderer.dispose();
  }

  // ------------------------------------------------------------------------------------------ internals
  private updateCamera() {
    const { tx, tz, yaw, pitch, dist } = this.cam;
    const cp = Math.cos(pitch);
    this.camera.position.set(tx + Math.sin(yaw) * cp * dist, Math.sin(pitch) * dist, tz + Math.cos(yaw) * cp * dist);
    this.camera.lookAt(tx, 0, tz);
    const fog = this.scene.fog as THREE.Fog;
    fog.near = dist * 1.6;
    fog.far = dist * 4.5 + 40;
    this.dirty = true;
    this.labelsDirty = true;
    this.opts.onCameraChange?.({ tx, tz, dist });
  }

  private groundHit(px: number, py: number): THREE.Vector3 | null {
    const ndc = new THREE.Vector2((px / this.width) * 2 - 1, -(py / this.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit) ? hit : null;
  }

  private tileAt(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= WORLD || y >= WORLD) return 3;
    const key = `${Math.floor(x / CHUNK)}:${Math.floor(y / CHUNK)}`;
    const g = this.terrainGrid.get(key);
    if (!g) return -1;
    return g[(y % CHUNK) * CHUNK + (x % CHUNK)];
  }

  private overviewTileAt(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= OV_SIZE || y >= OV_SIZE) return 3;
    return this.overview ? this.overview.grid[y * OV_SIZE + x] : -1;
  }

  heightAt(x: number, y: number): number {
    if (this.tileAt(x, y) >= 0) return tileHeight(this.sampler, x, y);
    // chunk not loaded: use the overview relief so beacons / pins / labels sit on the coarse terrain
    if (this.overview) return tileHeight(this.ovSampler, Math.floor(x / OV_FACTOR), Math.floor(y / OV_FACTOR)) * OV_SCALE_Y;
    return 0;
  }

  // ------------------------------------------------------------------------------------------ overview (far LOD)
  private loadOverview() {
    if (this.overview || this.overviewLoading) return;
    this.overviewLoading = true;
    this.opts
      .fetchOverview()
      .then((data) => {
        if (this.disposed) return;
        const grid = base64ToBytes(data.terrain_b64);
        const tiles = new Map<string, THREE.Mesh>();
        this.overview = { data, grid, tiles, pins: null };
        for (let cy = 0; cy < N_CHUNKS; cy++) {
          for (let cx = 0; cx < N_CHUNKS; cx++) {
            const ox = cx * OV_PER_CHUNK;
            const oz = cy * OV_PER_CHUNK;
            const geo = buildTerrainGeometry({ ox, oz, w: Math.min(OV_PER_CHUNK, OV_SIZE - ox), h: Math.min(OV_PER_CHUNK, OV_SIZE - oz), step: 1, sampler: this.ovSampler, palette: this.palette, scaleXZ: OV_FACTOR, scaleY: OV_SCALE_Y });
            if (!geo) continue;
            const mesh = new THREE.Mesh(geo, this.mats.overview);
            mesh.position.y = -0.03;
            const key = `${cx}:${cy}`;
            const node = this.chunks.get(key);
            mesh.visible = !(node && node.group.visible);
            tiles.set(key, mesh);
            this.scene.add(mesh);
          }
        }
        this.rebuildPins();
        if (this.homeBeacon.visible) this.setHome(Math.floor(this.homeBeacon.position.x), Math.floor(this.homeBeacon.position.z));
        this.dirty = true;
        this.labelsDirty = true;
      })
      .catch(() => {})
      .finally(() => (this.overviewLoading = false));
  }

  private rebuildPins() {
    if (!this.overview) return;
    if (this.overview.pins) {
      this.scene.remove(this.overview.pins);
      this.overview.pins.dispose();
    }
    this.pinsDist = this.cam.dist;
    const pins = this.factory.buildPins(this.overview.data.settlements, (x, y) => this.heightAt(x, y), Math.max(0.6, this.cam.dist / 60));
    pins.visible = this.cam.dist > PIN_ZOOM;
    this.overview.pins = pins;
    this.scene.add(pins);
    this.dirty = true;
  }

  private setOverviewTile(key: string, visible: boolean) {
    const m = this.overview?.tiles.get(key);
    if (m && m.visible !== visible) {
      m.visible = visible;
      this.dirty = true;
    }
  }

  // ------------------------------------------------------------------------------------------ chunk streaming
  private chunkDistance(cx: number, cy: number): number {
    const ddx = Math.max(0, Math.abs(this.cam.tx - (cx * CHUNK + CHUNK / 2)) - CHUNK / 2);
    const ddz = Math.max(0, Math.abs(this.cam.tz - (cy * CHUNK + CHUNK / 2)) - CHUNK / 2);
    return Math.hypot(ddx, ddz);
  }

  private visibleChunkKeys(): { key: string; cx: number; cy: number; d: number }[] {
    const radius = Math.min(this.cam.dist * 1.35 + 24, STREAM_RADIUS_CAP);
    const out: { key: string; cx: number; cy: number; d: number }[] = [];
    for (let cy = 0; cy < N_CHUNKS; cy++) {
      for (let cx = 0; cx < N_CHUNKS; cx++) {
        const d = this.chunkDistance(cx, cy);
        if (d <= radius) out.push({ key: `${cx}:${cy}`, cx, cy, d });
      }
    }
    out.sort((a, b) => a.d - b.d);
    return out;
  }

  private stream(now: number) {
    if (now - this.lastStream < 200) return;
    this.lastStream = now;
    const visible = this.visibleChunkKeys();
    const visibleSet = new Set(visible.map((v) => v.key));
    let inflight = this.loading.size;
    for (const v of visible) {
      const node = this.chunks.get(v.key);
      if (node) {
        node.lastUsed = now;
        this.applyLod(node, v.d);
        continue;
      }
      if (inflight >= 4 || this.loading.has(v.key)) continue;
      const failed = this.failedAt.get(v.key);
      if (failed && now - failed < 5000) continue;
      inflight++;
      this.loading.add(v.key);
      this.opts
        .fetchChunk(v.cx, v.cy)
        .then((data) => {
          if (this.disposed) return;
          this.failedAt.delete(v.key);
          this.addChunk(data, Date.now());
        })
        .catch(() => this.failedAt.set(v.key, Date.now()))
        .finally(() => this.loading.delete(v.key));
    }
    // evict: not visible and pool over budget (LRU)
    if (this.chunks.size > MAX_CHUNKS) {
      const candidates = Array.from(this.chunks.values())
        .filter((c) => !visibleSet.has(c.key))
        .sort((a, b) => a.lastUsed - b.lastUsed);
      for (const c of candidates.slice(0, this.chunks.size - MAX_CHUNKS)) this.removeChunk(c.key);
    }
    for (const c of this.chunks.values()) {
      if (!visibleSet.has(c.key) && c.group.visible) {
        c.group.visible = false;
        this.setOverviewTile(c.key, true);
        this.dirty = true;
        this.labelsDirty = true;
      }
    }
    if (this.overview?.pins) {
      const show = this.cam.dist > PIN_ZOOM;
      if (show && Math.abs(this.cam.dist - this.pinsDist) / this.pinsDist > 0.15) this.rebuildPins();
      if (this.overview.pins.visible !== show) {
        this.overview.pins.visible = show;
        this.dirty = true;
      }
    }
  }

  private applyLod(node: ChunkNode, d: number) {
    const lod = d < LOD0_DIST ? 0 : 1;
    const showGrid = lod === 0 && this.cam.dist < GRID_ZOOM;
    if (!node.group.visible) {
      node.group.visible = true;
      this.setOverviewTile(node.key, false);
      this.dirty = true;
      this.labelsDirty = true;
    }
    if (node.lod !== lod) {
      node.lod = lod;
      this.ensureTerrainLod(node, lod);
      for (let i = 0; i < LOD_STEPS.length; i++) if (node.terrain[i]) node.terrain[i]!.visible = i === lod;
      if (node.trees) node.trees.visible = lod === 0;
      for (const p of node.props) p.visible = lod === 0;
      this.dirty = true;
      this.labelsDirty = true;
    }
    if (showGrid && node.grid === undefined) {
      const geo = buildGridGeometry(node.cx * CHUNK, node.cy * CHUNK, Math.min(CHUNK, WORLD - node.cx * CHUNK), Math.min(CHUNK, WORLD - node.cy * CHUNK), this.sampler);
      node.grid = geo ? new THREE.LineSegments(geo, this.mats.grid) : null;
      if (node.grid) node.group.add(node.grid);
    }
    if (node.grid && node.grid.visible !== showGrid) {
      node.grid.visible = showGrid;
      this.dirty = true;
    }
  }

  private ensureTerrainLod(node: ChunkNode, lod: number) {
    if (node.terrain[lod]) return;
    const ox = node.cx * CHUNK;
    const oz = node.cy * CHUNK;
    const geo = buildTerrainGeometry({ ox, oz, w: Math.min(CHUNK, WORLD - ox), h: Math.min(CHUNK, WORLD - oz), step: LOD_STEPS[lod], sampler: this.sampler, palette: this.palette });
    if (!geo) return;
    const mesh = new THREE.Mesh(geo, this.mats.terrain);
    mesh.visible = false;
    node.terrain[lod] = mesh;
    node.group.add(mesh);
  }

  private addChunk(data: ChunkDto, now: number) {
    const key = `${data.cx}:${data.cy}`;
    if (this.chunks.has(key)) return;
    this.terrainGrid.set(key, base64ToBytes(data.terrain_b64));
    const group = new THREE.Group();
    group.visible = false;
    const blocked = blockedTiles(data);
    const trees = this.buildTrees(data.cx, data.cy, blocked);
    if (trees) group.add(trees);
    const props = this.buildProps(data.cx, data.cy, blocked);
    for (const p of props) group.add(p);
    const territory = this.buildTerritory(data);
    for (const t of territory) group.add(t);
    const h = (x: number, y: number) => this.heightAt(x, y);
    const entities = this.factory.buildSettlements(data.settlements, h);
    const sents = this.factory.buildSentinels(data.sentinels, h);
    if (sents) entities.add(sents);
    group.add(entities);
    this.scene.add(group);
    const node: ChunkNode = { key, cx: data.cx, cy: data.cy, group, terrain: [null, null], trees: trees ?? undefined, props, territory, entities, data, lastUsed: now, lod: -1 };
    this.chunks.set(key, node);
    this.applyLod(node, this.chunkDistance(data.cx, data.cy));
    // neighbours share corner heights: rebuild their terrain so seams close
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nb = this.chunks.get(`${data.cx + dx}:${data.cy + dy}`);
      if (nb) this.rebuildTerrain(nb);
    }
    this.dirty = true;
    this.labelsDirty = true;
  }

  private rebuildTerrain(node: ChunkNode) {
    for (let i = 0; i < node.terrain.length; i++) {
      const m = node.terrain[i];
      if (!m) continue;
      node.group.remove(m);
      m.geometry.dispose();
      node.terrain[i] = null;
    }
    if (node.grid) {
      node.group.remove(node.grid);
      node.grid.geometry.dispose();
    }
    node.grid = undefined;
    if (node.lod >= 0) {
      this.ensureTerrainLod(node, node.lod);
      if (node.terrain[node.lod]) node.terrain[node.lod]!.visible = true;
    }
  }

  private removeChunk(key: string) {
    const node = this.chunks.get(key);
    if (!node) return;
    this.scene.remove(node.group);
    disposeGroup(node.group);
    this.chunks.delete(key);
    this.terrainGrid.delete(key);
    this.setOverviewTile(key, true);
  }

  private buildTrees(cx: number, cy: number, blocked: Set<number>): THREE.InstancedMesh | null {
    const bytes = this.terrainGrid.get(`${cx}:${cy}`);
    if (!bytes) return null;
    const ox = cx * CHUNK;
    const oz = cy * CHUNK;
    const idx: number[] = [];
    for (let i = 0; i < bytes.length; i++) if (bytes[i] === 1 && !blocked.has(i)) idx.push(i);
    if (!idx.length) return null;
    const mesh = new THREE.InstancedMesh(this.geos.tree, [this.mats.tree, this.mats.trunk], idx.length * 2);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let k = 0;
    for (const i of idx) {
      const gx = ox + (i % CHUNK);
      const gz = oz + Math.floor(i / CHUNK);
      const base = tileHeight(this.sampler, gx, gz);
      for (let j = 0; j < 2; j++) {
        const r1 = hash2(gx * 2 + j, gz * 3 + j);
        const r2 = hash2(gx * 5 + j, gz * 7 + j);
        const scale = 0.7 + 0.5 * hash2(gx + j, gz);
        pos.set(gx + 0.2 + r1 * 0.6, base + 0.15 * scale, gz + 0.2 + r2 * 0.6);
        s.set(scale, scale, scale);
        q.setFromAxisAngle(up, r1 * Math.PI);
        m.compose(pos, q, s);
        mesh.setMatrixAt(k++, m);
      }
    }
    mesh.count = k;
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  /** Scattered bushes on plains and boulders on mountains (LOD0 only) — cheap richness at close zoom. */
  private buildProps(cx: number, cy: number, blocked: Set<number>): THREE.InstancedMesh[] {
    const bytes = this.terrainGrid.get(`${cx}:${cy}`);
    if (!bytes) return [];
    const ox = cx * CHUNK;
    const oz = cy * CHUNK;
    const bushes: number[] = [];
    const rocks: number[] = [];
    for (let i = 0; i < bytes.length; i++) {
      if (blocked.has(i)) continue;
      const gx = ox + (i % CHUNK);
      const gz = oz + Math.floor(i / CHUNK);
      const r = hash2(gx * 11 + 3, gz * 13 + 7);
      if (bytes[i] === 0 && r < 0.1) bushes.push(i);
      else if (bytes[i] === 2 && r < 0.28) rocks.push(i);
    }
    const out: THREE.InstancedMesh[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const fill = (idx: number[], geo: THREE.BufferGeometry, mat: THREE.Material, lift: number) => {
      if (!idx.length) return;
      const mesh = new THREE.InstancedMesh(geo, mat, idx.length);
      let k = 0;
      for (const i of idx) {
        const gx = ox + (i % CHUNK);
        const gz = oz + Math.floor(i / CHUNK);
        const r1 = hash2(gx * 3 + 1, gz * 5 + 2);
        const r2 = hash2(gx * 7 + 4, gz * 3 + 9);
        const sc = 0.6 + 0.8 * hash2(gx + 5, gz + 11);
        pos.set(gx + 0.15 + r1 * 0.7, tileHeight(this.sampler, gx, gz) + lift * sc, gz + 0.15 + r2 * 0.7);
        s.set(sc, sc, sc);
        q.setFromAxisAngle(up, r2 * Math.PI * 2);
        m.compose(pos, q, s);
        mesh.setMatrixAt(k++, m);
      }
      mesh.count = k;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.visible = false;
      out.push(mesh);
    };
    fill(bushes, this.geos.bush, this.mats.bush, 0.08);
    fill(rocks, this.geos.rock, this.mats.rock, 0.06);
    return out;
  }

  private buildTerritory(data: ChunkDto): THREE.InstancedMesh[] {
    if (!data.territory.length) return [];
    const strong = data.territory.filter((t) => t.faction !== "RESERVED");
    const faint = data.territory.filter((t) => t.faction === "RESERVED");
    const out: THREE.InstancedMesh[] = [];
    const m = new THREE.Matrix4();
    for (const [tiles, mat] of [
      [strong, this.mats.territory],
      [faint, this.mats.territoryFaint],
    ] as const) {
      if (!tiles.length) continue;
      const mesh = new THREE.InstancedMesh(this.geos.tile, mat, tiles.length);
      let k = 0;
      for (const t of tiles) {
        m.makeTranslation(t.x + 0.5, this.heightAt(t.x, t.y) + 0.05, t.y + 0.5);
        mesh.setMatrixAt(k, m);
        mesh.setColorAt(k, t.faction === "OWN" ? this.palette.own : t.faction === "ENEMY" ? this.palette.enemy : this.palette.neutral);
        k++;
      }
      mesh.count = k;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      out.push(mesh);
    }
    return out;
  }

  // ------------------------------------------------------------------------------------------ labels
  private emitLabels(now: number) {
    if (!this.opts.onLabels) return;
    this.labelsDirty = false;
    this.lastLabels = now;
    const out: { d: number; label: MapLabel }[] = [];
    const v = new THREE.Vector3();
    const near = this.cam.dist < 26;
    const seen = new Set<string>();
    const push = (s: SettlementPublic) => {
      if (seen.has(s.settlement_id)) return;
      seen.add(s.settlement_id);
      v.set(s.x + 0.5, this.heightAt(s.x, s.y) + 1.95 * settlementScale(s.level), s.y + 0.5).project(this.camera);
      if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) return;
      out.push({
        d: Math.hypot(s.x - this.cam.tx, s.y - this.cam.tz),
        label: { id: s.settlement_id, x: ((v.x + 1) / 2) * this.width, y: ((1 - v.y) / 2) * this.height, name: s.name, level: s.level, faction: s.faction, kind: s.kind },
      });
    };
    for (const ch of this.chunks.values()) {
      if (!ch.group.visible) continue;
      for (const s of ch.data.settlements) {
        if (s.kind === "PLAYER_SLOT") continue;
        if (s.kind === "NEUTRAL" && !(ch.lod === 0 && near)) continue;
        push(s);
      }
    }
    if (this.overview) for (const s of this.overview.data.settlements) push(s);
    out.sort((a, b) => a.d - b.d);
    this.opts.onLabels(out.slice(0, 40).map((o) => o.label));
  }

  private animateMarches(now: number) {
    if (!this.marchMarkers.length) return;
    for (const { march, marker } of this.marchMarkers) {
      const path = march.path;
      let t = 0;
      let pts = path;
      if (march.status === "RETURNING" && march.return_at) {
        pts = [...path].reverse();
        const start = Date.parse(march.arrival_at || march.departed_at);
        const end = Date.parse(march.return_at);
        t = (now - start) / Math.max(1, end - start);
      } else {
        const start = Date.parse(march.departed_at);
        const end = Date.parse(march.arrival_at || march.departed_at);
        t = (now - start) / Math.max(1, end - start);
      }
      t = Math.max(0, Math.min(1, t));
      const f = t * (pts.length - 1);
      const i = Math.min(pts.length - 2, Math.floor(f));
      const frac = f - i;
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      const x = ax + (bx - ax) * frac + 0.5;
      const z = ay + (by - ay) * frac + 0.5;
      marker.position.set(x, this.heightAt(Math.floor(x), Math.floor(z)) + 0.05, z);
      marker.rotation.y = Math.atan2(bx - ax, by - ay);
    }
    this.dirty = true;
  }

  private loop(ts: number) {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = Date.now();
    const dt = Math.min(0.05, (now - (this.lastTick || now)) / 1000);
    this.lastTick = now;
    // eased camera travel (centerOn)
    if (this.camAnim) {
      const a = this.camAnim;
      const k = easeOutCubic(Math.min(1, (now - a.start) / a.ms));
      this.cam.tx = a.from.tx + (a.to.tx - a.from.tx) * k;
      this.cam.tz = a.from.tz + (a.to.tz - a.from.tz) * k;
      this.cam.dist = a.from.dist + (a.to.dist - a.from.dist) * k;
      if (k >= 1) this.camAnim = null;
      this.updateCamera();
    }
    // pan inertia
    if (this.panVel.x || this.panVel.y) {
      const vx = this.panVel.x;
      const vy = this.panVel.y;
      const decay = Math.exp(-dt * 4.5);
      this.panVel = Math.hypot(vx, vy) < 8 ? { x: 0, y: 0 } : { x: vx * decay, y: vy * decay };
      this.pan(vx * dt, vy * dt);
    }
    this.stream(now);
    // canvas hidden/collapsed (0×0) or resized behind our back: resync, and skip drawing while there is no buffer
    if (!this.syncDrawingBuffer()) return;
    if (this.labelsDirty && now - this.lastLabels > 90) this.emitLabels(now);
    // water + pulses animate continuously at ~20 fps; interactions render immediately
    if (!this.dirty && now - this.lastFrame < 50) return;
    this.lastFrame = now;
    this.dirty = false;
    const t = (now - this.startedAt) / 1000;
    this.water.update(t);
    this.selectionRing.scale.setScalar(1 + 0.08 * Math.sin(t * 3.2));
    this.homeBeacon.scale.setScalar(1 + 0.12 * Math.sin(t * 2.1));
    (this.homeBeacon.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.2 * (0.5 + 0.5 * Math.sin(t * 2.1));
    if (this.marchMarkers.length) this.animateMarches(now + serverOffset());
    this.renderer.render(this.scene, this.camera);
    this.gl.endFrameEXP();
    void ts;
  }
}

let _serverOffset = 0;
export function setEngineServerOffset(ms: number) {
  _serverOffset = ms;
}
function serverOffset() {
  return _serverOffset;
}

function mergeTreeGeometry(cone: THREE.ConeGeometry, trunk: THREE.CylinderGeometry): THREE.BufferGeometry {
  // two groups so the InstancedMesh can use [leafMaterial, trunkMaterial]
  const c = cone.clone();
  c.translate(0, 0.6, 0);
  const t = trunk.clone();
  t.translate(0, 0.15, 0);
  const geo = new THREE.BufferGeometry();
  const cPos = c.getAttribute("position") as THREE.BufferAttribute;
  const tPos = t.getAttribute("position") as THREE.BufferAttribute;
  const cIdx = c.getIndex()!;
  const tIdx = t.getIndex()!;
  const positions = new Float32Array(cPos.count * 3 + tPos.count * 3);
  positions.set(cPos.array as Float32Array, 0);
  positions.set(tPos.array as Float32Array, cPos.count * 3);
  const normals = new Float32Array(positions.length);
  normals.set((c.getAttribute("normal") as THREE.BufferAttribute).array as Float32Array, 0);
  normals.set((t.getAttribute("normal") as THREE.BufferAttribute).array as Float32Array, cPos.count * 3);
  const index: number[] = [];
  for (let i = 0; i < cIdx.count; i++) index.push(cIdx.getX(i));
  for (let i = 0; i < tIdx.count; i++) index.push(tIdx.getX(i) + cPos.count);
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setIndex(index);
  geo.addGroup(0, cIdx.count, 0);
  geo.addGroup(cIdx.count, tIdx.count, 1);
  return geo;
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob === "function") {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let k = 0;
  for (let i = 0; i < clean.length; i++) {
    buffer = (buffer << 6) | chars.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[k++] = (buffer >> bits) & 0xff;
    }
  }
  return out.slice(0, k);
}
