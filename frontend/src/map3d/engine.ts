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

import type { ChunkDto, MarchDto, OverviewDto, PyramidDto, SentinelDto, SettlementPublic } from "@/src/api/hooks";
import type { ThemeColors } from "@/src/theme";

import { CASTLE_TOP, disposeGroup, EntityFactory, type EntityPalette, settlementScale } from "./entities";
import { FloraFactory } from "./flora";
import { PYRAMID_HALF, PYRAMID_TOP, PyramidMonument } from "./pyramid";
import { type SmokeEmitter, SmokeSystem } from "./smoke";
import { buildGridGeometry, buildTerrainGeometry, cornerHeight, type Sampler, type TerrainPalette, tileHeight } from "./terrain";
import { createTerrainMaterial } from "./terrainMaterial";
import { buildTerritory, createTerritoryMaterials, type TerritoryMaterials } from "./territory";
import { createWater } from "./water";

export const CHUNK = 32;
export const WORLD = 400;
const N_CHUNKS = Math.ceil(WORLD / CHUNK);
const OV_FACTOR = 4;
const OV_PER_CHUNK = CHUNK / OV_FACTOR;
const OV_SIZE = WORLD / OV_FACTOR;
const OV_SCALE_Y = 1.2;

export type Selection = { x: number; y: number; settlement?: SettlementPublic; sentinel?: SentinelDto; march?: MarchDto; pyramid?: PyramidDto };
export type MapLabel = { id: string; x: number; y: number; name: string; level: number; faction: string; kind: string; endsAt?: string | null; status?: string };

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
  flora: (THREE.Group | null)[]; // by LOD index (full, sparse)
  territory: THREE.Object3D[];
  grid?: THREE.LineSegments | null;
  entities: THREE.Group;
  emitters: SmokeEmitter[];
  data: ChunkDto;
  lastUsed: number;
  lod: number;
};

const MAX_CHUNKS = 60;
const STREAM_RADIUS_CAP = 100;
const LOD_STEPS = [1, 2];
const LOD0_DIST = 34;
const GRID_ZOOM = 13;
const PIN_ZOOM = 70;
const MARCH_LOD_DIST = 100; // Bible §41.3: marches are a mid-zoom detail; far zoom shows settlements/territory only
const MARCH_LABEL_DIST = 60;
const SMOKE_DIST = 48; // chimney / torch smoke is a close-up detail
const PYRAMID_XY: [number, number] = [200, 200]; // spec.world.pyramid_anchor (server DTO confirms it)

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
  for (const s of data.settlements) mark(s.x, s.y, s.kind === "PLAYER_SLOT" ? 0 : s.level >= 10 ? 2 : 1);
  for (const s of data.sentinels) mark(s.x, s.y, 0);
  mark(PYRAMID_XY[0], PYRAMID_XY[1], Math.ceil(PYRAMID_HALF) + 1); // Pyramid plateau stays clear of flora (Bible §21)
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
  private selected: Selection | null = null;
  private selScale = 1;
  private pyramid: PyramidMonument;
  private pyramidDto: PyramidDto | null = null;
  private selectionRing: THREE.Mesh;
  private homeBeacon: THREE.Mesh;
  private palette: TerrainPalette & EntityPalette & { bg: THREE.Color; horizon: THREE.Color };
  private width: number;
  private height: number;
  private bufW = 0;
  private bufH = 0;
  private terrainGrid = new Map<string, Uint8Array>();
  private factory: EntityFactory;
  private flora: FloraFactory;
  private smoke: SmokeSystem;
  private smokeDirty = true;
  private water: ReturnType<typeof createWater>;
  private overview: { data: OverviewDto; grid: Uint8Array; tiles: Map<string, THREE.Mesh>; pins: THREE.InstancedMesh | null } | null = null;
  private overviewLoading = false;
  private pinsDist = 1;
  private panVel = { x: 0, y: 0 };
  private minimap: { rect: { x: number; y: number; w: number; h: number } | null; scene: THREE.Scene; cam: THREE.OrthographicCamera; footprint: THREE.LineLoop; center: THREE.Mesh; marches: THREE.Group; statics: THREE.Group };
  private camAnim: { from: { tx: number; tz: number; dist: number }; to: { tx: number; tz: number; dist: number }; start: number; ms: number } | null = null;
  private mats: { terrain: THREE.ShaderMaterial; overview: THREE.ShaderMaterial; grid: THREE.LineBasicMaterial; territory: TerritoryMaterials };
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
      dry: plain.clone().offsetHSL(-0.045, -0.12, 0.1),
      forest: hexToColor(c.terrainForest),
      mountain,
      water: hexToColor(c.terrainWater),
      sand: plain.clone().offsetHSL(0.04, -0.25, 0.24),
      rock: mountain.clone().multiplyScalar(0.7),
      own: hexToColor(c.factionOwn),
      enemy: hexToColor(c.factionEnemy),
      neutral: hexToColor(c.factionNeutral),
      ally: hexToColor(c.factionAlly),
      snow: hexToColor(c.onSurface),
      bg: hexToColor(c.surface),
      horizon: hexToColor(c.skyHorizon),
    };
    const canvas: any = { width: opts.gl.drawingBufferWidth, height: opts.gl.drawingBufferHeight, style: {}, addEventListener: () => {}, removeEventListener: () => {}, clientHeight: opts.gl.drawingBufferHeight, getContext: () => opts.gl };
    this.renderer = new THREE.WebGLRenderer({ canvas, context: opts.gl as any, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(1);
    this.bufW = opts.gl.drawingBufferWidth;
    this.bufH = opts.gl.drawingBufferHeight;
    this.renderer.setSize(this.bufW, this.bufH, false);
    // distant land dissolves into a dusky haze (fog + clear colour share the horizon tint)
    this.renderer.setClearColor(this.palette.horizon, 1);
    this.scene.fog = new THREE.Fog(this.palette.horizon, 60, 260);

    this.camera = new THREE.PerspectiveCamera(46, this.bufW / Math.max(1, this.bufH), 0.5, 900);

    const skyColor = new THREE.Color(0xcfd8ea);
    const groundColor = new THREE.Color(0x4a3f33);
    const sunColor = new THREE.Color(0xfff0d2);
    const sunDir = new THREE.Vector3(0.68, 0.78, 0.3).normalize();
    const hemi = new THREE.HemisphereLight(skyColor, groundColor, 0.75);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(sunColor, 1.55);
    sun.position.copy(sunDir).multiplyScalar(150);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x9fb4ff, 0.22);
    fill.position.set(-60, 80, -90);
    this.scene.add(fill);

    const light = { sunDir, sunColor: sunColor.clone().multiplyScalar(1.15), skyColor: skyColor.clone().multiplyScalar(0.55), groundColor: groundColor.clone().multiplyScalar(0.5) };
    this.mats = {
      terrain: createTerrainMaterial(this.palette, light, { detail: 1 }),
      overview: createTerrainMaterial(this.palette, light, { detail: 0, polygonOffset: true, snowHeight: 3.9 * OV_SCALE_Y }),
      grid: new THREE.LineBasicMaterial({ color: this.palette.snow, transparent: true, opacity: 0.1, depthWrite: false }),
      territory: createTerritoryMaterials(),
    };
    for (const m of [this.mats.terrain, this.mats.overview, this.mats.grid]) m.userData.shared = true;
    this.factory = new EntityFactory(this.palette);
    this.smoke = new SmokeSystem(this.palette.snow.clone());
    this.scene.add(this.smoke.mesh);
    this.flora = new FloraFactory({ forest: this.palette.forest, plain: this.palette.plain, rock: this.palette.rock.clone().offsetHSL(0, 0, 0.08), wood: hexToColor(c.resourceWood) });

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

    this.pyramid = new PyramidMonument({ own: this.palette.own, enemy: this.palette.enemy, neutral: this.palette.neutral });
    this.scene.add(this.pyramid.group);
    this.placePyramid();

    this.scene.add(this.marchGroup);
    this.minimap = this.createMinimap();
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
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
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
    // Pick in SCREEN space (entities have height; a ground-plane hit misses tall castles/banners at steep pitch).
    const TOUCH_PX = 30;
    const v = new THREE.Vector3();
    const screenDist = (x: number, y: number, z: number) => {
      v.set(x, y, z).project(this.camera);
      if (v.z > 1) return Infinity;
      return Math.hypot(((v.x + 1) / 2) * this.width - px, ((1 - v.y) / 2) * this.height - py);
    };
    let best: { d: number; s?: SettlementPublic; sen?: SentinelDto; m?: MarchDto; mx?: number; mz?: number; pyr?: boolean } | null = null;
    // marches first: they move over the terrain and are the most time-critical thing to inspect
    if (this.marchGroup.visible) {
      for (const mm of this.marchMarkers) {
        const p = mm.marker.position;
        const d = Math.min(screenDist(p.x, p.y + 0.6, p.z), screenDist(p.x, p.y + 1.3, p.z));
        if (d < TOUCH_PX && (!best || d < best.d)) best = { d, m: mm.march, mx: p.x, mz: p.z };
      }
    }
    // the Pyramid is a 15×15 monument: pick on its apex/body or on any footprint tile
    {
      const py = this.pyramid.group.position.y;
      const dp = Math.min(screenDist(PYRAMID_XY[0] + 0.5, py + PYRAMID_TOP, PYRAMID_XY[1] + 0.5), screenDist(PYRAMID_XY[0] + 0.5, py + PYRAMID_TOP * 0.5, PYRAMID_XY[1] + 0.5));
      const inside = Math.abs(hit.x - (PYRAMID_XY[0] + 0.5)) <= PYRAMID_HALF && Math.abs(hit.z - (PYRAMID_XY[1] + 0.5)) <= PYRAMID_HALF;
      if (inside || dp < TOUCH_PX * 1.6) {
        const d = inside ? TOUCH_PX * 0.9 : dp; // a march marker tapped directly still wins
        if (!best || d < best.d) best = { d, pyr: true };
      }
    }
    const consider = (list: SettlementPublic[]) => {
      for (const s of list) {
        const h = this.heightAt(s.x, s.y);
        const sc = settlementScale(s.level);
        const d = s.kind === "PLAYER_SLOT" ? screenDist(s.x + 0.5, h + 0.25, s.y + 0.5) : Math.min(screenDist(s.x + 0.5, h + 0.6 * sc, s.y + 0.5), screenDist(s.x + 0.5, h + 1.7 * sc, s.y + 0.5), screenDist(s.x + 0.5, h + 2.6 * sc, s.y + 0.5));
        if (d < TOUCH_PX && (!best || d < best.d)) best = { d, s };
      }
    };
    for (const ch of this.chunks.values()) {
      if (!ch.group.visible) continue;
      if (Math.abs(ch.cx * CHUNK + 16 - tx) > 48 || Math.abs(ch.cy * CHUNK + 16 - tz) > 48) continue;
      consider(ch.data.settlements);
      for (const sen of ch.data.sentinels) {
        const d = screenDist(sen.x + 0.5, this.heightAt(sen.x, sen.y) + 0.5, sen.y + 0.5);
        if (d < TOUCH_PX * 0.8 && (!best || d < best.d)) best = { d, sen };
      }
    }
    if (!best && this.overview) consider(this.overview.data.settlements);
    const b = best as { d: number; s?: SettlementPublic; sen?: SentinelDto; m?: MarchDto; mx?: number; mz?: number; pyr?: boolean } | null;
    if (b?.m) this.select({ x: Math.floor(b.mx!), y: Math.floor(b.mz!), march: b.m });
    else if (b?.pyr) this.select({ x: PYRAMID_XY[0], y: PYRAMID_XY[1], pyramid: this.pyramidDto ?? undefined });
    else if (b?.s) this.select({ x: b.s.x, y: b.s.y, settlement: b.s });
    else if (b?.sen) this.select({ x: b.sen.x, y: b.sen.y, sentinel: b.sen });
    else this.select({ x: tx, y: tz });
  }

  select(sel: Selection | null) {
    this.selected = sel;
    const isPyr = !!sel && sel.x === PYRAMID_XY[0] && sel.y === PYRAMID_XY[1] && !sel.march && !sel.settlement && !sel.sentinel;
    if (sel && isPyr && !sel.pyramid && this.pyramidDto) sel.pyramid = this.pyramidDto;
    this.selScale = isPyr ? (PYRAMID_HALF + 1.9) / 0.8 : 1;
    if (sel) {
      this.selectionRing.position.set(sel.x + 0.5, this.heightAt(sel.x, sel.y) + 0.06, sel.y + 0.5);
      this.selectionRing.visible = true;
    } else this.selectionRing.visible = false;
    this.dirty = true;
    this.opts.onSelect(sel);
  }

  /** Pyramid cycle state from the server → monument look + label; the anchor is fixed (spec.world.pyramid_anchor). */
  setPyramid(dto: PyramidDto | null) {
    this.pyramidDto = dto;
    this.pyramid.setLook({ state: dto?.state ?? "DORMANT_INITIAL", faction: dto?.faction ?? "NEUTRAL" });
    if (this.selected?.pyramid && dto) this.select({ ...this.selected, pyramid: dto });
    this.dirty = true;
    this.labelsDirty = true;
  }

  private placePyramid() {
    this.pyramid.group.position.set(PYRAMID_XY[0] + 0.5, this.heightAt(PYRAMID_XY[0], PYRAMID_XY[1]), PYRAMID_XY[1] + 0.5);
    this.dirty = true;
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
      const own = !march.hostile;
      const color = own ? this.palette.own : this.palette.enemy;
      const returning = march.status === "RETURNING";
      const pts = march.path.map(([x, y]) => new THREE.Vector3(x + 0.5, this.heightAt(x, y) + 0.12, y + 0.5));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color, dashSize: 0.5, gapSize: 0.3, transparent: true, opacity: returning ? 0.45 : 0.85 }));
      line.computeLineDistances();
      const marker = new THREE.Group();
      marker.add(this.factory.buildArmy(color, returning));
      // Casata crest on the banner (own marches carry the full crest; a detected hostile shows its house crest too —
      // the crest is public identity, never intel)
      marker.add(this.factory.buildBanner(march.house_crest ?? null, color, returning));
      if (march.hostile) {
        const halo = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 24), new THREE.MeshBasicMaterial({ color: this.palette.enemy, side: THREE.DoubleSide, transparent: true, opacity: 0.8, depthWrite: false }));
        halo.rotation.x = -Math.PI / 2;
        halo.position.y = 0.03;
        halo.name = "halo";
        marker.add(halo);
      }
      this.marchGroup.add(line, marker);
      this.marchMarkers.push({ march, marker, line });
    }
    // keep a selected march bound to its refreshed DTO (or drop the selection if it finished)
    if (this.selected?.march) {
      const fresh = marches.find((m) => m.march_id === this.selected!.march!.march_id);
      if (fresh) this.select({ ...this.selected, march: fresh });
      else this.select(null);
    }
    this.updateMinimapMarches(marches);
    this.dirty = true;
    this.labelsDirty = true;
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
    disposeGroup(this.minimap.scene);
    this.smoke.dispose();
    this.pyramid.dispose();
    this.renderer.dispose();
  }

  // ------------------------------------------------------------------------------------------ minimap (second pass)
  /** Layout-pixel rectangle where the minimap is drawn (null hides it). North-up orthographic view of the whole world. */
  setMinimapRect(rect: { x: number; y: number; w: number; h: number } | null) {
    this.minimap.rect = rect;
    this.dirty = true;
  }

  /** Layout px inside the minimap rect → world tile. */
  minimapToWorld(px: number, py: number): { x: number; y: number } | null {
    const r = this.minimap.rect;
    if (!r) return null;
    const u = (px - r.x) / r.w;
    const v = (py - r.y) / r.h;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    return { x: Math.floor(u * WORLD), y: Math.floor(v * WORLD) };
  }

  private createMinimap() {
    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-WORLD / 2, WORLD / 2, WORLD / 2, -WORLD / 2, 1, 500);
    cam.position.set(WORLD / 2, 200, WORLD / 2);
    cam.up.set(0, 0, -1);
    cam.lookAt(WORLD / 2, 0, WORLD / 2);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(WORLD, WORLD), new THREE.MeshBasicMaterial({ color: this.palette.water.clone().multiplyScalar(1.5) }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(WORLD / 2, -0.5, WORLD / 2);
    scene.add(sea);
    const statics = new THREE.Group();
    scene.add(statics);
    const marches = new THREE.Group();
    scene.add(marches);
    const footprint = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: this.palette.snow, transparent: true, opacity: 0.95 }));
    footprint.position.y = 2;
    scene.add(footprint);
    // translucent fill of the same quad so the viewed area reads at thumbnail size
    const fillGeo = new THREE.BufferGeometry();
    fillGeo.setAttribute("position", footprint.geometry.getAttribute("position"));
    fillGeo.setIndex([0, 1, 2, 0, 2, 3]);
    const footFill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: this.palette.snow, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
    footFill.position.y = 1.8;
    footprint.frustumCulled = false;
    footFill.frustumCulled = false;
    scene.add(footFill);
    const center = new THREE.Mesh(new THREE.RingGeometry(5, 8, 20), new THREE.MeshBasicMaterial({ color: this.palette.snow, side: THREE.DoubleSide }));
    center.rotation.x = -Math.PI / 2;
    center.position.y = 2.5;
    scene.add(center);
    return { rect: null, scene, cam, footprint, center, marches, statics };
  }

  /** Called once the overview is known: flat coloured terrain + player settlement dots. */
  private buildMinimapStatics() {
    const mm = this.minimap;
    disposeGroup(mm.statics);
    mm.statics.clear();
    // unlit pass → lift the terrain palette so land reads clearly against the sea at thumbnail size
    const bright = Object.fromEntries(Object.entries(this.palette).map(([k, c]) => [k, c.clone().multiplyScalar(1.6)])) as unknown as TerrainPalette;
    const geo = buildTerrainGeometry({ ox: 0, oz: 0, w: OV_SIZE, h: OV_SIZE, step: 1, sampler: this.ovSampler, palette: bright, scaleXZ: OV_FACTOR, scaleY: 0, noiseScale: OV_FACTOR });
    if (geo) mm.statics.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true })));
    const players = this.overview?.data.settlements ?? [];
    if (players.length) {
      const dotGeo = new THREE.CircleGeometry(7, 12);
      dotGeo.rotateX(-Math.PI / 2);
      const dots = new THREE.InstancedMesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), players.length);
      const M = new THREE.Matrix4();
      players.forEach((s, i) => {
        M.makeTranslation(s.x + 0.5, 1, s.y + 0.5);
        dots.setMatrixAt(i, M);
        dots.setColorAt(i, this.factory.factionColor(s.faction));
      });
      dots.instanceMatrix.needsUpdate = true;
      if (dots.instanceColor) dots.instanceColor.needsUpdate = true;
      mm.statics.add(dots);
    }
    const pyrGeo = new THREE.CircleGeometry(9, 4);
    pyrGeo.rotateX(-Math.PI / 2);
    const pyr = new THREE.Mesh(pyrGeo, new THREE.MeshBasicMaterial({ color: this.palette.own.clone().offsetHSL(0, 0.1, 0.15) }));
    pyr.position.set(PYRAMID_XY[0] + 0.5, 1.2, PYRAMID_XY[1] + 0.5);
    mm.statics.add(pyr);
  }

  private updateMinimapMarches(marches: MarchDto[]) {
    const mm = this.minimap;
    disposeGroup(mm.marches);
    mm.marches.clear();
    for (const m of marches) {
      if (!m.path || m.path.length < 2) continue;
      const pts = m.path.map(([x, y]) => new THREE.Vector3(x + 0.5, 1.5, y + 0.5));
      mm.marches.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: m.hostile ? this.palette.enemy : this.palette.own })));
    }
  }

  private updateMinimapCursor() {
    const mm = this.minimap;
    const pos = mm.footprint.geometry.getAttribute("position") as THREE.BufferAttribute;
    const corners: [number, number][] = [
      [0, 0],
      [this.width, 0],
      [this.width, this.height],
      [0, this.height],
    ];
    const d = this.cam.dist;
    corners.forEach(([px, py], i) => {
      const hit = this.groundHit(px, py);
      // rays above the horizon (far top corners) fall back to a point `2·dist` ahead so the footprint stays bounded
      const x = hit && Math.hypot(hit.x - this.cam.tx, hit.z - this.cam.tz) < d * 3 ? hit.x : this.cam.tx + (px < this.width / 2 ? -1 : 1) * d * 1.2;
      const z = hit && Math.hypot(hit.x - this.cam.tx, hit.z - this.cam.tz) < d * 3 ? hit.z : this.cam.tz - d * 1.2;
      pos.setXYZ(i, Math.max(-5, Math.min(WORLD + 5, x)), 0, Math.max(-5, Math.min(WORLD + 5, z)));
    });
    pos.needsUpdate = true;
    mm.center.position.set(this.cam.tx, 2.5, this.cam.tz);
    const s = Math.max(1, d / 30);
    mm.center.scale.setScalar(s);
  }

  private renderMinimap() {
    const r = this.minimap.rect;
    if (!r || !this.width || !this.height) return;
    const pr = this.bufW / this.width;
    const x = Math.round(r.x * pr);
    const y = Math.round((this.height - r.y - r.h) * pr);
    const w = Math.round(r.w * pr);
    const h = Math.round(r.h * pr);
    this.renderer.setScissorTest(true);
    this.renderer.setViewport(x, y, w, h);
    this.renderer.setScissor(x, y, w, h);
    this.renderer.render(this.minimap.scene, this.minimap.cam);
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, this.bufW, this.bufH);
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
    if (this.overview) return tileHeight(this.ovSampler, Math.floor(x / OV_FACTOR), Math.floor(y / OV_FACTOR), OV_FACTOR) * OV_SCALE_Y;
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
            const geo = buildTerrainGeometry({ ox, oz, w: Math.min(OV_PER_CHUNK, OV_SIZE - ox), h: Math.min(OV_PER_CHUNK, OV_SIZE - oz), step: 1, sampler: this.ovSampler, palette: this.palette, scaleXZ: OV_FACTOR, scaleY: OV_SCALE_Y, noiseScale: OV_FACTOR });
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
        this.buildMinimapStatics();
        this.placePyramid();
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
        this.smokeDirty = true;
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
    const showMarches = this.cam.dist <= MARCH_LOD_DIST;
    if (this.marchGroup.visible !== showMarches) {
      this.marchGroup.visible = showMarches;
      this.dirty = true;
      this.labelsDirty = true;
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
      this.smokeDirty = true;
    }
    if (node.lod !== lod) {
      node.lod = lod;
      this.smokeDirty = true;
      this.ensureTerrainLod(node, lod);
      for (let i = 0; i < LOD_STEPS.length; i++) if (node.terrain[i]) node.terrain[i]!.visible = i === lod;
      for (let i = 0; i < node.flora.length; i++) if (node.flora[i]) node.flora[i]!.visible = i === lod;
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
    const ground = (wx: number, wz: number) => this.groundAt(wx, wz);
    const flora = [this.flora.buildFull(data.cx, data.cy, this.sampler, blocked, ground), this.flora.buildSparse(data.cx, data.cy, this.sampler, blocked, ground)];
    for (const f of flora) {
      if (!f) continue;
      f.visible = false;
      group.add(f);
    }
    const ox = data.cx * CHUNK;
    const oz = data.cy * CHUNK;
    const territory = buildTerritory(
      data.territory,
      { x0: ox, y0: oz, x1: ox + CHUNK, y1: oz + CHUNK },
      (x, y) => cornerHeight(this.sampler, x, y),
      (f) => (f === "OWN" ? this.palette.own : f === "ENEMY" ? this.palette.enemy : f === "ALLY" ? this.palette.ally : this.palette.neutral),
      this.mats.territory,
    );
    for (const t of territory) group.add(t);
    const h = (x: number, y: number) => this.heightAt(x, y);
    const built = this.factory.buildSettlements(data.settlements, h);
    const entities = built.group;
    const emitters = built.emitters;
    const sents = this.factory.buildSentinels(data.sentinels, h);
    if (sents) {
      entities.add(sents.group);
      emitters.push(...sents.emitters);
    }
    group.add(entities);
    this.scene.add(group);
    const node: ChunkNode = { key, cx: data.cx, cy: data.cy, group, terrain: [null, null], flora, territory, entities, emitters, data, lastUsed: now, lod: -1 };
    this.chunks.set(key, node);
    if (data.cx === Math.floor(PYRAMID_XY[0] / CHUNK) && data.cy === Math.floor(PYRAMID_XY[1] / CHUNK)) this.placePyramid();
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
    this.smokeDirty = true;
  }

  /** Chimney/torch smoke for the close-up chunks only; emitter list rebuilt when chunk visibility or LOD changes. */
  private animateSmoke(t: number) {
    const show = this.cam.dist < SMOKE_DIST;
    if (this.smoke.mesh.visible !== show) this.smoke.mesh.visible = show;
    if (!show) return;
    if (this.smokeDirty) {
      this.smokeDirty = false;
      const all: SmokeEmitter[] = [];
      for (const ch of this.chunks.values()) if (ch.group.visible && ch.lod === 0) all.push(...ch.emitters);
      this.smoke.setEmitters(all);
    }
    this.smoke.update(t, this.cam.tx, this.cam.tz);
  }

  /** Continuous ground height (bilinear over the tile's corner heights) for props placed off tile centres. */
  private groundAt(wx: number, wz: number): number {
    const x = Math.floor(wx);
    const z = Math.floor(wz);
    if (this.tileAt(x, z) < 0) return this.heightAt(x, z);
    const fx = wx - x;
    const fz = wz - z;
    const h00 = cornerHeight(this.sampler, x, z);
    const h10 = cornerHeight(this.sampler, x + 1, z);
    const h01 = cornerHeight(this.sampler, x, z + 1);
    const h11 = cornerHeight(this.sampler, x + 1, z + 1);
    return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
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
      v.set(s.x + 0.5, this.heightAt(s.x, s.y) + CASTLE_TOP * settlementScale(s.level), s.y + 0.5).project(this.camera);
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
    {
      const d = this.pyramidDto;
      v.set(PYRAMID_XY[0] + 0.5, this.pyramid.group.position.y + PYRAMID_TOP + 0.6, PYRAMID_XY[1] + 0.5).project(this.camera);
      if (!(v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1)) {
        out.push({
          d: -2000, // the monument always keeps its label
          label: { id: "pyramid", x: ((v.x + 1) / 2) * this.width, y: ((1 - v.y) / 2) * this.height, name: d?.owner?.tag ? `${d.name} [${d.owner.tag}]` : d?.name ?? "Piramide", level: 0, faction: d?.faction ?? "NEUTRAL", kind: "PYRAMID", status: d?.state ?? "DORMANT_INITIAL", endsAt: d?.deadline ?? null },
        });
      }
    }
    if (this.marchGroup.visible && this.cam.dist < MARCH_LABEL_DIST) {
      for (const { march, marker } of this.marchMarkers) {
        v.copy(marker.position).setY(marker.position.y + 1.7).project(this.camera);
        if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) continue;
        const own = !march.hostile;
        out.push({
          d: Math.hypot(marker.position.x - this.cam.tx, marker.position.z - this.cam.tz) - 1000, // marches always win the label budget
          label: {
            id: `march:${march.march_id}`,
            x: ((v.x + 1) / 2) * this.width,
            y: ((1 - v.y) / 2) * this.height,
            name: march.hostile ? (march.intel?.mission_family ?? march.intel?.mission_class ?? "HOSTILE") : march.mission,
            level: 0,
            faction: own ? "OWN" : "ENEMY",
            kind: "MARCH",
            status: march.hostile ? "HOSTILE" : march.status,
            endsAt: march.hostile ? (march.intel?.eta_range ? march.intel.eta_range[0] : null) : march.status === "RETURNING" ? march.return_at : march.arrival_at,
          },
        });
      }
    }
    out.sort((a, b) => a.d - b.d);
    this.opts.onLabels(out.slice(0, 40).map((o) => o.label));
  }

  /** Fraction along the ORIGINAL path (0 = origin, 1 = target) where the army is now — server timeline only. */
  private marchProgress(march: MarchDto, now: number): number {
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    if (march.hostile) {
      // detected hostile: the revealed path starts at the entry tile (departed_at = detection time). Position is the
      // centre of the disclosed ETA band; with no ETA disclosed (tier 0) the marker holds the entry tile.
      const r = march.intel?.eta_range;
      if (!r) return 0;
      const det = Date.parse(march.departed_at);
      const mid = (Date.parse(r[0]) + Date.parse(r[1])) / 2;
      return clamp01((now - det) / Math.max(1, mid - det));
    }
    const dep = Date.parse(march.departed_at);
    const arr = march.arrival_at ? Date.parse(march.arrival_at) : dep;
    if (march.status !== "RETURNING") return clamp01((now - dep) / Math.max(1, arr - dep));
    const ret = march.return_at ? Date.parse(march.return_at) : now;
    if (march.recalled_at) {
      // recall = real turn-around from the position reached at recall time, back to the origin (Bible §13/§39: no teleport)
      const rec = Date.parse(march.recalled_at);
      const reached = clamp01((rec - dep) / Math.max(1, arr - dep));
      return reached * (1 - clamp01((now - rec) / Math.max(1, ret - rec)));
    }
    return 1 - clamp01((now - arr) / Math.max(1, ret - arr));
  }

  private animateMarches(now: number) {
    if (!this.marchMarkers.length) return;
    for (const { march, marker } of this.marchMarkers) {
      const pts = march.path;
      const u = this.marchProgress(march, now);
      const f = u * (pts.length - 1);
      const i = Math.min(pts.length - 2, Math.floor(f));
      const frac = f - i;
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      const x = ax + (bx - ax) * frac + 0.5;
      const z = ay + (by - ay) * frac + 0.5;
      marker.position.set(x, this.heightAt(Math.floor(x), Math.floor(z)) + 0.05, z);
      marker.rotation.y = Math.atan2(bx - ax, by - ay) + (march.status === "RETURNING" ? Math.PI : 0);
      if (march.hostile) {
        const halo = marker.getObjectByName("halo");
        if (halo) halo.scale.setScalar(1 + 0.25 * (0.5 + 0.5 * Math.sin(now / 250)));
      }
      if (this.selected?.march?.march_id === march.march_id) this.selectionRing.position.set(x, marker.position.y + 0.02, z);
    }
    this.labelsDirty = true;
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
    this.factory.tick(t);
    this.pyramid.tick(t);
    this.animateSmoke(t);
    this.selectionRing.scale.setScalar(this.selScale * (1 + 0.08 * Math.sin(t * 3.2)));
    this.homeBeacon.scale.setScalar(1 + 0.12 * Math.sin(t * 2.1));
    (this.homeBeacon.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.2 * (0.5 + 0.5 * Math.sin(t * 2.1));
    if (this.marchMarkers.length) this.animateMarches(now + serverOffset());
    this.renderer.render(this.scene, this.camera);
    if (this.minimap.rect) {
      this.updateMinimapCursor();
      this.renderMinimap();
    }
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
