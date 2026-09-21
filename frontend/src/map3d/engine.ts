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

import type { ChunkDto, MarchDto, OverviewDto, PyramidSummary, SentinelDto, SettlementPublic } from "@/src/api/hooks";
import type { ThemeColors } from "@/src/theme";

import { CASTLE_TOP, disposeGroup, EntityFactory, type EntityPalette, settlementScale } from "./entities";
import { daylightAt, realmHour } from "./daylight";
import { FloraFactory } from "./flora";
import { animateSkin, buildSkin } from "./markerSkins";
import { chevronTexture, rainbowArc, RAINBOW_COLOR, ribbonGeometry, ribbonMaterial } from "./marchPath";
import { PYRAMID_HALF, PYRAMID_TOP, PyramidMonument } from "./pyramid";
import { type SmokeEmitter, SmokeSystem } from "./smoke";
import { buildGridGeometry, buildTerrainGeometry, cornerHeight, type Sampler, type TerrainPalette, tileHeight } from "./terrain";
import { createTerrainMaterial } from "./terrainMaterial";
import { buildTerritory, createTerritoryMaterials, type TerritoryMaterials } from "./territory";
import { makeDetailTexture, makeRoofTexture, makeStoneTexture } from "./textures";
import { createWater } from "./water";
import { type FogBounds, FogWall, type FogZones } from "./fog";

export const CHUNK = 32;
const DEFAULT_WORLD = 400; // spec.world.map_size_x — each realm carries its own size (world DTO)
const OV_SCALE_Y = 1.2;
/** 1 overview cell = factor×factor tiles — same rule as the server (`overview_factor`): 4 for realms, 8 for mega-realms. */
export function overviewFactor(worldSize: number): number {
  return worldSize > 1024 ? 8 : 4;
}
/** Far-LOD tiles are only kept within this many tiles of the camera target (mega-realms have ~10k chunks). */
const OV_WINDOW_TILES = 720;

export type Selection = { x: number; y: number; settlement?: SettlementPublic; sentinel?: SentinelDto; march?: MarchDto; pyramid?: PyramidSummary };
export type MapLabel = { id: string; x: number; y: number; name: string; level: number; faction: string; kind: string; endsAt?: string | null; status?: string; tag?: string | null; troops?: number };

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
  /** realm size in tiles (world DTO `size`); defaults to the spec 400 */
  worldSize?: number;
  /** every Pyramid of the realm (GET /pyramids): monument anchors, footprints, cycle state */
  pyramids?: PyramidSummary[];
  /** Grande Mondo: reachable area while the fog wall is up (camera clamp, minimap); null = whole realm */
  viewBounds?: FogBounds | null;
  /** Grande Mondo: fog geometry + reachable zones (null = no fog) */
  fogZones?: FogZones | null;
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


function hexToColor(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Local tile indices (within the chunk) occupied by settlements / sentinels / Pyramid plateaus — kept clear of trees and props. */
function blockedTiles(data: ChunkDto, pyramids: Iterable<{ xy: [number, number]; scale: number }>): Set<number> {
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
  for (const p of pyramids) mark(p.xy[0], p.xy[1], Math.ceil(PYRAMID_HALF * p.scale) + 1); // Pyramid plateau stays clear of flora (Bible §21)
  return out;
}

type PyramidNode = { monument: PyramidMonument; xy: [number, number]; scale: number; dto: PyramidSummary };

export class MapEngine {
  readonly world: number;
  private nChunks: number;
  private ovSize: number;
  private ovFactor: number;
  private ovPerChunk: number;
  private bounds: FogBounds;
  private fog: FogWall;
  private ovWindowAt: { tx: number; tz: number } | null = null;
  private pyramids = new Map<string, PyramidNode>();
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
  private marchMarkers: { march: MarchDto; marker: THREE.Object3D; line: THREE.Mesh }[] = [];
  private chevrons = chevronTexture();
  private selected: Selection | null = null;
  /** Mirrors MapView's `showLabels`: the tap picker only honours label chips that are actually on screen. */
  labelsShown = true;
  private selScale = 1;
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
  private minimap: { rect: { x: number; y: number; w: number; h: number } | null; scene: THREE.Scene; cam: THREE.OrthographicCamera; footprint: THREE.LineLoop; center: THREE.Mesh; marches: THREE.Group; statics: THREE.Group; sea: THREE.Mesh };
  private camAnim: { from: { tx: number; tz: number; dist: number }; to: { tx: number; tz: number; dist: number }; start: number; ms: number } | null = null;
  private mats: { terrain: THREE.ShaderMaterial; overview: THREE.ShaderMaterial; grid: THREE.LineBasicMaterial; territory: TerritoryMaterials };
  private textures: { detail: THREE.DataTexture; stone: THREE.DataTexture; roof: THREE.DataTexture };
  private sun: THREE.DirectionalLight;
  private sunDir: THREE.Vector3;
  private shadowRadius = 0;
  private hemi: THREE.HemisphereLight;
  private fill: THREE.AmbientLight;
  private daylightMinute = -1;
  private sampler: Sampler = (x, y) => this.tileAt(x, y);
  private ovSampler: Sampler = (x, y) => this.overviewTileAt(x, y);

  cam = { tx: 200, tz: 200, yaw: Math.PI / 4, pitch: 0.95, dist: 38 };
  minDist = 8;
  maxDist = 170;

  constructor(opts: EngineOpts) {
    this.opts = opts;
    this.world = opts.worldSize ?? DEFAULT_WORLD;
    this.nChunks = Math.ceil(this.world / CHUNK);
    this.ovFactor = overviewFactor(this.world);
    this.ovPerChunk = CHUNK / this.ovFactor;
    this.ovSize = Math.floor(this.world / this.ovFactor);
    this.bounds = opts.viewBounds ?? { x0: -10, y0: -10, x1: this.world + 10, y1: this.world + 10 };
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
    // cinematic look: filmic tone mapping + real-time sun shadows (one directional shadow map following the camera)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
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
    const hemi = new THREE.HemisphereLight(skyColor, groundColor, 0.85);
    this.scene.add(hemi);
    this.hemi = hemi;
    // soft fill so castle faces turned away from the sun never go black (terrain has its own shader lighting)
    this.fill = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(this.fill);
    const sun = new THREE.DirectionalLight(sunColor, 1.7);
    sun.position.copy(sunDir).multiplyScalar(150);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.35;
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 420;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    this.sunDir = sunDir;
    const fill = new THREE.DirectionalLight(0x9fb4ff, 0.22);
    fill.position.set(-60, 80, -90);
    this.scene.add(fill);

    this.textures = { detail: makeDetailTexture(), stone: makeStoneTexture(), roof: makeRoofTexture() };
    const light = { sunDir, sunColor: sunColor.clone().multiplyScalar(1.2), skyColor: skyColor.clone().multiplyScalar(0.58), groundColor: groundColor.clone().multiplyScalar(0.55) };
    this.mats = {
      terrain: createTerrainMaterial(this.palette, light, this.textures.detail, { detail: 1 }),
      overview: createTerrainMaterial(this.palette, light, this.textures.detail, { detail: 0, polygonOffset: true, snowHeight: 3.9 * OV_SCALE_Y }),
      grid: new THREE.LineBasicMaterial({ color: this.palette.snow, transparent: true, opacity: 0.1, depthWrite: false }),
      territory: createTerritoryMaterials(),
    };
    for (const m of [this.mats.terrain, this.mats.overview, this.mats.grid]) m.userData.shared = true;
    this.factory = new EntityFactory(this.palette, { stone: this.textures.stone, roof: this.textures.roof });
    this.smoke = new SmokeSystem(this.palette.snow.clone());
    this.scene.add(this.smoke.mesh);
    this.flora = new FloraFactory({ forest: this.palette.forest, plain: this.palette.plain, rock: this.palette.rock.clone().offsetHSL(0, 0, 0.08), wood: hexToColor(c.resourceWood) });

    this.water = createWater(this.world, this.palette.water, this.palette.water.clone().offsetHSL(0.01, 0.05, 0.12), this.palette.horizon.clone().lerp(skyColor, 0.5), sunDir, sunColor);
    this.scene.add(this.water.mesh);

    this.selectionRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.8, 32), new THREE.MeshBasicMaterial({ color: this.palette.own, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false }));
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.visible = false;
    this.scene.add(this.selectionRing);

    this.homeBeacon = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.3, 40), new THREE.MeshBasicMaterial({ color: this.palette.own, side: THREE.DoubleSide, transparent: true, opacity: 0.5, depthWrite: false }));
    this.homeBeacon.rotation.x = -Math.PI / 2;
    this.homeBeacon.visible = false;
    this.scene.add(this.homeBeacon);

    // Grande Mondo fog wall (visuals only — the server rejects every interregional order while it stands)
    this.fog = new FogWall(this.palette.snow.clone().lerp(this.palette.horizon, 0.3).offsetHSL(0, -0.35, -0.08));
    this.scene.add(this.fog.group);
    if (opts.fogZones) this.fog.setZones(opts.fogZones, this.world);

    this.scene.add(this.marchGroup);
    this.minimap = this.createMinimap();
    if (opts.pyramids) this.setPyramids(opts.pyramids);
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
    this.clampTarget();
    this.updateCamera();
  }

  private clampTarget() {
    const b = this.bounds;
    this.cam.tx = Math.max(b.x0, Math.min(b.x1, this.cam.tx));
    this.cam.tz = Math.max(b.y0, Math.min(b.y1, this.cam.tz));
  }

  /**
   * Grande Mondo: restrict the camera / minimap / far LOD to the player's region and raise the fog wall on its border
   * (fog up), or open the whole realm (null, fog down).
   */
  setViewBounds(bounds: FogBounds | null, fog: FogZones | null = null) {
    const next = bounds ?? { x0: -10, y0: -10, x1: this.world + 10, y1: this.world + 10 };
    this.fog.setZones(fog, this.world);
    const same = next.x0 === this.bounds.x0 && next.y0 === this.bounds.y0 && next.x1 === this.bounds.x1 && next.y1 === this.bounds.y1;
    if (same) {
      this.dirty = true;
      return;
    }
    this.bounds = next;
    this.clampTarget();
    this.updateCamera();
    this.layoutMinimap();
    if (this.overview) {
      this.ovWindowAt = null;
      this.buildMinimapStatics();
    }
    this.dirty = true;
    this.labelsDirty = true;
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
        this.cam.tx += before.x - after.x;
        this.cam.tz += before.z - after.z;
        this.clampTarget();
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
    if (tx < 0 || tz < 0 || tx >= this.world || tz >= this.world) {
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
    let best: { d: number; s?: SettlementPublic; sen?: SentinelDto; m?: MarchDto; mx?: number; mz?: number; pyr?: PyramidNode } | null = null;
    // RN label chips (MapLabels) float above their anchor: anchor projected, x clamped like MapLabels.clampX(lo, hi),
    // then shifted by −dx/−dy px, chip ≈ w×h. A tap on the chip must pick what the chip names, not the terrain behind it.
    const labelHit = (wx: number, wy: number, wz: number, lo: number, hi: number, dx: number, dy: number, w: number, h: number) => {
      if (!this.labelsShown) return false;
      v.set(wx, wy, wz).project(this.camera);
      if (v.z > 1) return false;
      const lx = Math.max(lo, Math.min(this.width - hi, ((v.x + 1) / 2) * this.width)) - dx;
      const ly = ((1 - v.y) / 2) * this.height - dy;
      return px >= lx - 6 && px <= lx + w + 6 && py >= ly - 8 && py <= ly + h + 8;
    };
    // marches first: they move over the terrain and are the most time-critical thing to inspect
    if (this.marchGroup.visible) {
      const labelsOn = this.cam.dist < MARCH_LABEL_DIST;
      for (const mm of this.marchMarkers) {
        const p = mm.marker.position;
        let d = Math.min(screenDist(p.x, p.y + 0.6, p.z), screenDist(p.x, p.y + 1.3, p.z));
        if (labelsOn && labelHit(p.x, p.y + 1.7, p.z, 60, 112, 60, 46, 150, 20)) d = 0;
        if (d < TOUCH_PX && (!best || d < best.d)) best = { d, m: mm.march, mx: p.x, mz: p.z };
      }
    }
    // Pyramids are 15×15 (41×41 Grande Piramide) monuments: pick on the apex/body or on any footprint tile
    for (const node of this.pyramids.values()) {
      const [px, pz] = node.xy;
      const py = node.monument.group.position.y;
      const half = PYRAMID_HALF * node.scale;
      const dp = Math.min(screenDist(px + 0.5, py + PYRAMID_TOP * node.scale, pz + 0.5), screenDist(px + 0.5, py + PYRAMID_TOP * node.scale * 0.5, pz + 0.5));
      const inside = Math.abs(hit.x - (px + 0.5)) <= half && Math.abs(hit.z - (pz + 0.5)) <= half;
      if (inside || dp < TOUCH_PX * 1.6) {
        const d = inside ? TOUCH_PX * 0.9 : dp; // a march marker tapped directly still wins
        if (!best || d < best.d) best = { d, pyr: node };
      }
    }
    const near = this.cam.dist < 26;
    const consider = (list: SettlementPublic[], lod0: boolean) => {
      for (const s of list) {
        const h = this.heightAt(s.x, s.y);
        const sc = settlementScale(s.level);
        let d = s.kind === "PLAYER_SLOT" ? screenDist(s.x + 0.5, h + 0.25, s.y + 0.5) : Math.min(screenDist(s.x + 0.5, h + 0.6 * sc, s.y + 0.5), screenDist(s.x + 0.5, h + 1.7 * sc, s.y + 0.5), screenDist(s.x + 0.5, h + 2.6 * sc, s.y + 0.5));
        // name plate (same visibility rule as emitLabels: players always, neutrals only up close at LOD0)
        if ((s.kind === "PLAYER" || (s.kind === "NEUTRAL" && lod0 && near)) && labelHit(s.x + 0.5, h + (CASTLE_TOP + (s.level >= 30 ? 0.5 : 0)) * sc, s.y + 0.5, 44, 110, 44, 24, 150, 22)) d = Math.min(d, TOUCH_PX * 0.5);
        if (d < TOUCH_PX && (!best || d < best.d)) best = { d, s };
      }
    };
    for (const ch of this.chunks.values()) {
      if (!ch.group.visible) continue;
      if (Math.abs(ch.cx * CHUNK + 16 - tx) > 48 || Math.abs(ch.cy * CHUNK + 16 - tz) > 48) continue;
      consider(ch.data.settlements, ch.lod === 0);
      for (const sen of ch.data.sentinels) {
        const d = screenDist(sen.x + 0.5, this.heightAt(sen.x, sen.y) + 0.5, sen.y + 0.5);
        if (d < TOUCH_PX * 0.8 && (!best || d < best.d)) best = { d, sen };
      }
    }
    if (!best && this.overview) consider(this.overview.data.settlements, false);
    const b = best as { d: number; s?: SettlementPublic; sen?: SentinelDto; m?: MarchDto; mx?: number; mz?: number; pyr?: PyramidNode } | null;
    if (b?.m) this.select({ x: Math.floor(b.mx!), y: Math.floor(b.mz!), march: b.m });
    else if (b?.pyr) this.select({ x: b.pyr.xy[0], y: b.pyr.xy[1], pyramid: b.pyr.dto });
    else if (b?.s) this.select({ x: b.s.x, y: b.s.y, settlement: b.s });
    else if (b?.sen) this.select({ x: b.sen.x, y: b.sen.y, sentinel: b.sen });
    else this.select({ x: tx, y: tz });
  }

  private pyramidAt(x: number, y: number): PyramidNode | null {
    for (const node of this.pyramids.values()) if (node.xy[0] === x && node.xy[1] === y) return node;
    return null;
  }

  select(sel: Selection | null) {
    this.selected = sel;
    const node = sel && !sel.march && !sel.settlement && !sel.sentinel ? this.pyramidAt(sel.x, sel.y) : null;
    if (sel && node) sel.pyramid = node.dto;
    this.selScale = node ? (PYRAMID_HALF * node.scale + 1.9) / 0.8 : 1;
    if (sel) {
      this.selectionRing.position.set(sel.x + 0.5, this.heightAt(sel.x, sel.y) + 0.06, sel.y + 0.5);
      this.selectionRing.visible = true;
    } else this.selectionRing.visible = false;
    this.dirty = true;
    this.opts.onSelect(sel);
  }

  /** Every Pyramid of the realm from the server → one monument each (look by cycle state / faction, size by footprint:
   * classic & Piccola Piramide 15×15, Grande Piramide 41×41). Monuments missing from the list are removed. */
  setPyramids(list: PyramidSummary[]) {
    const seen = new Set<string>();
    let moved = false;
    for (const dto of list) {
      seen.add(dto.id);
      const xy: [number, number] = [dto.anchor[0], dto.anchor[1]];
      const scale = dto.footprint?.[0] ? Math.max(1, dto.footprint[0] / 15) : 1;
      let node = this.pyramids.get(dto.id);
      if (!node) {
        const monument = new PyramidMonument({ own: this.palette.own, enemy: this.palette.enemy, neutral: this.palette.neutral }, this.textures.stone);
        this.scene.add(monument.group);
        node = { monument, xy, scale, dto };
        this.pyramids.set(dto.id, node);
        moved = true;
      } else if (node.xy[0] !== xy[0] || node.xy[1] !== xy[1] || node.scale !== scale) {
        node.xy = xy;
        node.scale = scale;
        moved = true;
      }
      node.dto = dto;
      node.monument.setLook({ state: dto.state ?? "DORMANT_INITIAL", faction: dto.faction ?? "NEUTRAL" });
      node.monument.group.scale.setScalar(scale);
      this.placePyramid(node);
    }
    for (const [id, node] of this.pyramids) {
      if (seen.has(id)) continue;
      this.scene.remove(node.monument.group);
      node.monument.dispose();
      this.pyramids.delete(id);
      moved = true;
    }
    if (moved && this.overview) this.buildMinimapStatics();
    if (this.selected?.pyramid) {
      const node = this.pyramids.get(this.selected.pyramid.id);
      if (node) this.select({ ...this.selected, pyramid: node.dto });
    }
    this.dirty = true;
    this.labelsDirty = true;
  }

  private placePyramid(node: PyramidNode) {
    node.monument.group.position.set(node.xy[0] + 0.5, this.heightAt(node.xy[0], node.xy[1]), node.xy[1] + 0.5);
    this.dirty = true;
  }

  private placePyramids() {
    for (const node of this.pyramids.values()) this.placePyramid(node);
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
      const color = march.rainbow ? RAINBOW_COLOR : own ? this.palette.own : this.palette.enemy;
      const returning = march.status === "RETURNING";
      // ribbon with chevrons pointing the way the army walks (a returning march walks its path backwards)
      // Unicorn (Bible §12.2): the Ponte Arcobaleno is a luminous arc between the two castles, not a ground route
      const pathPts = march.rainbow ? rainbowArc(march.path, (x, y) => this.heightAt(x, y)) : march.path.map(([x, y]) => new THREE.Vector3(x + 0.5, this.heightAt(x, y) + 0.16, y + 0.5));
      const line = new THREE.Mesh(ribbonGeometry(returning ? [...pathPts].reverse() : pathPts), ribbonMaterial(color, this.chevrons, returning ? 0.42 : 0.88));
      line.renderOrder = 6;
      const marker = new THREE.Group();
      marker.add(this.factory.buildArmy(color, returning));
      // Casata crest on the banner (own marches carry the full crest; a detected hostile shows its house crest too —
      // the crest is public identity, never intel)
      marker.add(this.factory.buildBanner(march.house_crest ?? null, color, returning));
      const skin = buildSkin(march.skin, color);
      if (skin) marker.add(skin);
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
    this.chevrons.dispose();
    for (const node of this.pyramids.values()) node.monument.dispose();
    this.pyramids.clear();
    this.fog.dispose();
    this.factory.dispose();
    for (const t of Object.values(this.textures)) t.dispose();
    this.sun.shadow.dispose();
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
    const f = this.minimapFrame();
    return { x: Math.floor(f.x0 + u * f.size), y: Math.floor(f.y0 + v * f.size) };
  }

  /** Square tile window shown by the minimap: the view bounds (fog up) or the whole realm. */
  private minimapFrame(): { x0: number; y0: number; size: number } {
    const b = this.bounds;
    const x0 = Math.max(0, b.x0);
    const y0 = Math.max(0, b.y0);
    const x1 = Math.min(this.world, b.x1);
    const y1 = Math.min(this.world, b.y1);
    const size = Math.max(x1 - x0, y1 - y0);
    return { x0: x0 + (x1 - x0 - size) / 2, y0: y0 + (y1 - y0 - size) / 2, size };
  }

  private layoutMinimap() {
    const f = this.minimapFrame();
    const cam = this.minimap.cam;
    cam.left = -f.size / 2;
    cam.right = f.size / 2;
    cam.top = f.size / 2;
    cam.bottom = -f.size / 2;
    cam.position.set(f.x0 + f.size / 2, 200, f.y0 + f.size / 2);
    cam.lookAt(f.x0 + f.size / 2, 0, f.y0 + f.size / 2);
    cam.updateProjectionMatrix();
    const sea = this.minimap.sea;
    sea.scale.set(f.size / this.world, 1, f.size / this.world);
    sea.position.set(f.x0 + f.size / 2, -0.5, f.y0 + f.size / 2);
  }

  private createMinimap() {
    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-this.world / 2, this.world / 2, this.world / 2, -this.world / 2, 1, 500);
    cam.position.set(this.world / 2, 200, this.world / 2);
    cam.up.set(0, 0, -1);
    cam.lookAt(this.world / 2, 0, this.world / 2);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(this.world, this.world), new THREE.MeshBasicMaterial({ color: this.palette.water.clone().multiplyScalar(1.5) }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(this.world / 2, -0.5, this.world / 2);
    scene.add(sea);
    const f = this.minimapFrame();
    cam.left = -f.size / 2;
    cam.right = f.size / 2;
    cam.top = f.size / 2;
    cam.bottom = -f.size / 2;
    cam.position.set(f.x0 + f.size / 2, 200, f.y0 + f.size / 2);
    cam.lookAt(f.x0 + f.size / 2, 0, f.y0 + f.size / 2);
    cam.updateProjectionMatrix();
    sea.scale.set(f.size / this.world, 1, f.size / this.world);
    sea.position.set(f.x0 + f.size / 2, -0.5, f.y0 + f.size / 2);
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
    return { rect: null, scene, cam, footprint, center, marches, statics, sea };
  }

  /** Called once the overview is known: flat coloured terrain + player settlement dots. */
  private buildMinimapStatics() {
    const mm = this.minimap;
    disposeGroup(mm.statics);
    mm.statics.clear();
    // unlit pass → lift the terrain palette so land reads clearly against the sea at thumbnail size
    const bright = Object.fromEntries(Object.entries(this.palette).map(([k, c]) => [k, c.clone().multiplyScalar(1.6)])) as unknown as TerrainPalette;
    const f = this.minimapFrame();
    const ox = Math.max(0, Math.floor(f.x0 / this.ovFactor));
    const oz = Math.max(0, Math.floor(f.y0 / this.ovFactor));
    const cells = Math.min(this.ovSize - Math.min(ox, oz), Math.ceil(f.size / this.ovFactor));
    const step = Math.max(1, Math.ceil(cells / 160)); // thumbnail: ≤ ~160² quads whatever the realm size
    const geo = buildTerrainGeometry({ ox, oz, w: Math.min(cells, this.ovSize - ox), h: Math.min(cells, this.ovSize - oz), step, sampler: this.ovSampler, palette: bright, scaleXZ: this.ovFactor, scaleY: 0, noiseScale: this.ovFactor });
    if (geo) mm.statics.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true })));
    const players = this.overview?.data.settlements ?? [];
    if (players.length) {
      const dotGeo = new THREE.CircleGeometry(Math.max(4, f.size / 60), 12);
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
    const pyrGeo = new THREE.CircleGeometry(Math.max(5, f.size / 45), 4);
    pyrGeo.rotateX(-Math.PI / 2);
    const pyrMat = new THREE.MeshBasicMaterial({ color: this.palette.own.clone().offsetHSL(0, 0.1, 0.15) });
    for (const node of this.pyramids.values()) {
      const pyr = new THREE.Mesh(pyrGeo, pyrMat);
      pyr.position.set(node.xy[0] + 0.5, 1.2, node.xy[1] + 0.5);
      pyr.scale.setScalar(node.scale > 1 ? 1.6 : 1);
      mm.statics.add(pyr);
    }
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
      pos.setXYZ(i, Math.max(this.bounds.x0 - 5, Math.min(this.bounds.x1 + 5, x)), 0, Math.max(this.bounds.y0 - 5, Math.min(this.bounds.y1 + 5, z)));
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
  /** Realm daylight (Italian time, shared by every player): re-applied once per realm minute, cheap uniform/material writes. */
  private applyDaylight(serverNowMs: number) {
    const minute = Math.floor(serverNowMs / 60000);
    if (minute === this.daylightMinute) return;
    this.daylightMinute = minute;
    const d = daylightAt(realmHour(serverNowMs));
    this.sunDir.copy(d.sunDir);
    this.sun.color.copy(d.sunColor);
    this.sun.intensity = d.sunIntensity;
    this.sun.position.copy(this.sunDir).multiplyScalar(160).add(this.sun.target.position);
    this.hemi.color.copy(d.skyColor);
    this.hemi.groundColor.copy(d.groundColor);
    this.hemi.intensity = d.hemiIntensity;
    this.fill.color.copy(d.skyColor).lerp(new THREE.Color(0xffffff), 0.6);
    this.fill.intensity = 0.32 + 0.38 * d.night;
    this.renderer.toneMappingExposure = d.exposure;
    const horizon = this.palette.horizon.clone().lerp(d.horizonTint, d.horizonMix);
    (this.scene.fog as THREE.Fog).color.copy(horizon);
    this.renderer.setClearColor(horizon, 1);
    for (const m of [this.mats.terrain, this.mats.overview]) {
      (m.uniforms.uSunDir.value as THREE.Vector3).copy(this.sunDir);
      (m.uniforms.uSunColor.value as THREE.Color).copy(d.sunColor).multiplyScalar(0.95 * (d.sunIntensity / 1.7));
      (m.uniforms.uSkyColor.value as THREE.Color).copy(d.skyColor).multiplyScalar(0.56 * (d.hemiIntensity / 0.85));
      (m.uniforms.uGroundColor.value as THREE.Color).copy(d.groundColor).multiplyScalar(0.5);
    }
    this.water.setLight(this.sunDir, d.sunColor, horizon.clone().lerp(d.skyColor, 0.5));
    this.factory.setNight(d.night);
    this.dirty = true;
  }

  private updateCamera() {
    const { tx, tz, yaw, pitch, dist } = this.cam;
    const cp = Math.cos(pitch);
    this.camera.position.set(tx + Math.sin(yaw) * cp * dist, Math.sin(pitch) * dist, tz + Math.cos(yaw) * cp * dist);
    this.camera.lookAt(tx, 0, tz);
    const fog = this.scene.fog as THREE.Fog;
    fog.near = dist * 1.6;
    fog.far = dist * 4.5 + 40;
    // the sun's shadow frustum follows the camera target and grows with the zoom (crisp close-up, soft far away)
    this.sun.target.position.set(tx, 0, tz);
    this.sun.position.copy(this.sunDir).multiplyScalar(160).add(this.sun.target.position);
    const r = Math.min(110, Math.max(16, dist * 1.25));
    if (Math.abs(r - this.shadowRadius) > 1) {
      this.shadowRadius = r;
      const sc = this.sun.shadow.camera;
      sc.left = -r;
      sc.right = r;
      sc.top = r;
      sc.bottom = -r;
      sc.updateProjectionMatrix();
    }
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
    if (x < 0 || y < 0 || x >= this.world || y >= this.world) return 3;
    const key = `${Math.floor(x / CHUNK)}:${Math.floor(y / CHUNK)}`;
    const g = this.terrainGrid.get(key);
    if (!g) return -1;
    return g[(y % CHUNK) * CHUNK + (x % CHUNK)];
  }

  private overviewTileAt(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.ovSize || y >= this.ovSize) return 3;
    return this.overview ? this.overview.grid[y * this.ovSize + x] : -1;
  }

  heightAt(x: number, y: number): number {
    if (this.tileAt(x, y) >= 0) return tileHeight(this.sampler, x, y);
    // chunk not loaded: use the overview relief so beacons / pins / labels sit on the coarse terrain
    if (this.overview) return tileHeight(this.ovSampler, Math.floor(x / this.ovFactor), Math.floor(y / this.ovFactor), this.ovFactor) * OV_SCALE_Y;
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
        this.ovWindowAt = null;
        this.ensureOverviewTiles(true);
        this.rebuildPins();
        this.buildMinimapStatics();
        this.placePyramids();
        if (this.homeBeacon.visible) this.setHome(Math.floor(this.homeBeacon.position.x), Math.floor(this.homeBeacon.position.z));
        this.dirty = true;
        this.labelsDirty = true;
      })
      .catch(() => {})
      .finally(() => (this.overviewLoading = false));
  }

  /**
   * Far-LOD tiles (one per chunk, hidden under loaded chunks) are kept only within OV_WINDOW_TILES of the camera target
   * and inside the view bounds: a mega-realm has ~10k chunks, a realm ≤ 400. Re-evaluated when the target moves.
   */
  private ensureOverviewTiles(force = false) {
    const ov = this.overview;
    if (!ov) return;
    const at = this.ovWindowAt;
    if (!force && at && Math.hypot(at.tx - this.cam.tx, at.tz - this.cam.tz) < CHUNK * 3) return;
    this.ovWindowAt = { tx: this.cam.tx, tz: this.cam.tz };
    const win = OV_WINDOW_TILES;
    const b = this.bounds;
    const lo = (v: number) => Math.max(0, Math.floor(v / CHUNK));
    const hi = (v: number) => Math.min(this.nChunks - 1, Math.floor(v / CHUNK));
    const cx0 = lo(Math.max(this.cam.tx - win, b.x0 - CHUNK * 2));
    const cx1 = hi(Math.min(this.cam.tx + win, b.x1 + CHUNK * 2));
    const cy0 = lo(Math.max(this.cam.tz - win, b.y0 - CHUNK * 2));
    const cy1 = hi(Math.min(this.cam.tz + win, b.y1 + CHUNK * 2));
    const keep = new Set<string>();
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = `${cx}:${cy}`;
        keep.add(key);
        if (ov.tiles.has(key)) continue;
        const ox = cx * this.ovPerChunk;
        const oz = cy * this.ovPerChunk;
        const geo = buildTerrainGeometry({ ox, oz, w: Math.min(this.ovPerChunk, this.ovSize - ox), h: Math.min(this.ovPerChunk, this.ovSize - oz), step: 1, sampler: this.ovSampler, palette: this.palette, scaleXZ: this.ovFactor, scaleY: OV_SCALE_Y, noiseScale: this.ovFactor });
        if (!geo) continue;
        const mesh = new THREE.Mesh(geo, this.mats.overview);
        mesh.position.y = -0.03;
        const node = this.chunks.get(key);
        mesh.visible = !(node && node.group.visible);
        ov.tiles.set(key, mesh);
        this.scene.add(mesh);
      }
    }
    for (const [key, mesh] of ov.tiles) {
      if (keep.has(key)) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      ov.tiles.delete(key);
    }
    this.dirty = true;
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
    const cx0 = Math.max(0, Math.floor((this.cam.tx - radius - CHUNK) / CHUNK));
    const cx1 = Math.min(this.nChunks - 1, Math.floor((this.cam.tx + radius + CHUNK) / CHUNK));
    const cy0 = Math.max(0, Math.floor((this.cam.tz - radius - CHUNK) / CHUNK));
    const cy1 = Math.min(this.nChunks - 1, Math.floor((this.cam.tz + radius + CHUNK) / CHUNK));
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
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
    this.ensureOverviewTiles();
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
      const geo = buildGridGeometry(node.cx * CHUNK, node.cy * CHUNK, Math.min(CHUNK, this.world - node.cx * CHUNK), Math.min(CHUNK, this.world - node.cy * CHUNK), this.sampler);
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
    const geo = buildTerrainGeometry({ ox, oz, w: Math.min(CHUNK, this.world - ox), h: Math.min(CHUNK, this.world - oz), step: LOD_STEPS[lod], sampler: this.sampler, palette: this.palette });
    if (!geo) return;
    const mesh = new THREE.Mesh(geo, this.mats.terrain);
    mesh.receiveShadow = true;
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
    const blocked = blockedTiles(data, this.pyramids.values());
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
    for (const node of this.pyramids.values()) if (data.cx === Math.floor(node.xy[0] / CHUNK) && data.cy === Math.floor(node.xy[1] / CHUNK)) this.placePyramid(node);
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
      v.set(s.x + 0.5, this.heightAt(s.x, s.y) + (CASTLE_TOP + (s.level >= 30 ? 0.5 : 0)) * settlementScale(s.level), s.y + 0.5).project(this.camera);
      if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) return;
      out.push({
        d: Math.hypot(s.x - this.cam.tx, s.y - this.cam.tz),
        label: { id: s.settlement_id, x: ((v.x + 1) / 2) * this.width, y: ((1 - v.y) / 2) * this.height, name: s.name, level: s.level, faction: s.faction, kind: s.kind, tag: s.kind === "PLAYER" ? s.owner_alliance_tag ?? null : null },
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
    for (const node of this.pyramids.values()) {
      const d = node.dto;
      v.set(node.xy[0] + 0.5, node.monument.group.position.y + PYRAMID_TOP * node.scale + 0.6, node.xy[1] + 0.5).project(this.camera);
      if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) continue;
      out.push({
        d: -2000, // monuments always keep their label
        label: { id: `pyramid:${d.id}`, x: ((v.x + 1) / 2) * this.width, y: ((1 - v.y) / 2) * this.height, name: d.owner?.tag ? `${d.name} [${d.owner.tag}]` : d.name, level: 0, faction: d.faction ?? "NEUTRAL", kind: "PYRAMID", status: d.state ?? "DORMANT_INITIAL", endsAt: d.deadline ?? null },
      });
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
            troops: march.hostile ? 0 : Object.values(march.units ?? {}).reduce((a, b) => a + (b || 0), 0),
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
      const skin = marker.getObjectByName("skin");
      if (skin) animateSkin(skin, now);
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
    this.applyDaylight(now + serverOffset());
    // a full-screen show (cinematic) is on top: keep the loop alive but skip drawing, redraw on release
    if (_renderHold) {
      this.dirty = true;
      return;
    }
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
    for (const node of this.pyramids.values()) node.monument.tick(t);
    this.fog.tick(t, this.cam.dist);
    this.animateSmoke(t);
    this.selectionRing.scale.setScalar(this.selScale * (1 + 0.08 * Math.sin(t * 3.2)));
    this.homeBeacon.scale.setScalar(1 + 0.12 * Math.sin(t * 2.1));
    (this.homeBeacon.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.2 * (0.5 + 0.5 * Math.sin(t * 2.1));
    if (this.marchMarkers.length) {
      this.chevrons.offset.x = -((t * 0.9) % 1); // chevrons flow along every ribbon
      this.animateMarches(now + serverOffset());
    }
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

let _renderHold = false;
/** Pause map drawing while a full-screen GL show (cinematic) is on top; the loop keeps ticking and resumes instantly. */
export function setMapRenderHold(hold: boolean) {
  _renderHold = hold;
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
