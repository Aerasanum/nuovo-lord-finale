import * as THREE from "three";

/**
 * Grande Mondo fog wall (Bibbia GM). The realm is a disc: zone 0 = central disc (radius rIn), zone k = sector k-1 of
 * 360/n degrees (mid angle -90° + 360·(k-1)/n, screen space y-down). Every zone the viewer may NOT reach is hidden under
 * a drifting fog blanket; a tall translucent curtain stands on the boundary between reachable and fogged zones.
 * Pure visuals — the server enforces the rule.
 */
export type FogBounds = { x0: number; y0: number; x1: number; y1: number };
export type FogZones = { cx: number; cy: number; rIn: number; rOut: number; n: number; allowed: number[] };

const MAX_ZONES = 16;

const BLANKET_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const BLANKET_FRAG = /* glsl */ `
  precision highp float;
  uniform vec2 uCenter;
  uniform float uRin;
  uniform float uN;
  uniform float uAllowed[${MAX_ZONES}];
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec3 vWorld;
  const float PI = 3.14159265;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float allowedAt(int z) {
    for (int i = 0; i < ${MAX_ZONES}; i++) { if (i == z) return uAllowed[i]; }
    return 0.0;
  }
  void main() {
    vec2 p = vWorld.xz;
    vec2 d = p - uCenter;
    float r = length(d);
    float hw = PI / uN;
    float ang = atan(d.y, d.x);
    // sector index and angular offset from its mid angle
    float t = mod(ang + PI * 0.5 + hw, 2.0 * PI) / (2.0 * hw);
    int k = int(floor(t));
    float dth = (fract(t) - 0.5) * 2.0 * hw;
    int zone = r < uRin ? 0 : k + 1;
    if (allowedAt(zone) > 0.5) discard;
    // distance to the zone's own boundary: the fog thins towards the wall where the curtain stands
    float edge = zone == 0 ? (uRin - r) : min(r - uRin, r * sin(hw - abs(dth)));
    float ramp = smoothstep(0.0, 10.0, edge);
    float n = vnoise(p * 0.035 + vec2(uTime * 0.012, uTime * 0.007)) * 0.6 + vnoise(p * 0.11 - vec2(uTime * 0.02, uTime * 0.015)) * 0.4;
    float a = uOpacity * (0.35 + 0.65 * ramp) * (0.82 + 0.18 * n);
    gl_FragColor = vec4(uColor * (0.92 + 0.08 * n), a);
  }
`;

const CURTAIN_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const CURTAIN_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vWorld;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  void main() {
    float along = vWorld.x + vWorld.z;
    float n = vnoise(vec2(along * 0.09, vUv.y * 3.0 - uTime * 0.18)) * 0.65 + vnoise(vec2(along * 0.25 + uTime * 0.05, vUv.y * 7.0 - uTime * 0.3)) * 0.35;
    float vertical = 1.0 - smoothstep(0.15, 1.0, vUv.y + (n - 0.5) * 0.35);
    float a = uOpacity * vertical * (0.7 + 0.3 * n);
    gl_FragColor = vec4(uColor * (0.9 + 0.1 * n), a);
  }
`;

export class FogWall {
  readonly group = new THREE.Group();
  private blanket: THREE.Mesh | null = null;
  private curtain: THREE.Mesh | null = null;
  private blanketMat: THREE.ShaderMaterial;
  private curtainMat: THREE.ShaderMaterial;
  private key = "";

  constructor(color: THREE.Color) {
    this.blanketMat = new THREE.ShaderMaterial({
      vertexShader: BLANKET_VERT,
      fragmentShader: BLANKET_FRAG,
      uniforms: {
        uCenter: { value: new THREE.Vector2() },
        uRin: { value: 1 },
        uN: { value: 9 },
        uAllowed: { value: new Array(MAX_ZONES).fill(0) },
        uTime: { value: 0 },
        uColor: { value: color.clone() },
        uOpacity: { value: 0.97 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.curtainMat = new THREE.ShaderMaterial({
      vertexShader: CURTAIN_VERT,
      fragmentShader: CURTAIN_FRAG,
      uniforms: { uTime: { value: 0 }, uColor: { value: color.clone() }, uOpacity: { value: 0.85 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.group.renderOrder = 50;
    this.group.visible = false;
  }

  get active(): boolean {
    return this.key !== "";
  }

  /** `zones` = geometry + reachable zone ids (0 = centre, k = region k); null removes the fog. */
  setZones(zones: FogZones | null, world: number) {
    const key = zones ? `${zones.cx}:${zones.cy}:${zones.rIn}:${zones.n}:${[...zones.allowed].sort().join(",")}` : "";
    if (key === this.key) return;
    this.clear();
    this.key = key;
    this.group.visible = !!zones;
    if (!zones) return;
    const pad = 200;
    const blanketGeo = new THREE.PlaneGeometry(world + pad * 2, world + pad * 2, 1, 1);
    blanketGeo.rotateX(-Math.PI / 2);
    this.blanket = new THREE.Mesh(blanketGeo, this.blanketMat);
    this.blanket.position.set(world / 2, 3.2, world / 2);
    this.blanket.frustumCulled = false;
    (this.blanketMat.uniforms.uCenter.value as THREE.Vector2).set(zones.cx, zones.cy);
    this.blanketMat.uniforms.uRin.value = zones.rIn;
    this.blanketMat.uniforms.uN.value = zones.n;
    const flags = new Array(MAX_ZONES).fill(0);
    for (const z of zones.allowed) if (z >= 0 && z < MAX_ZONES) flags[z] = 1;
    this.blanketMat.uniforms.uAllowed.value = flags;
    this.group.add(this.blanket);

    // curtain: 16-tile walls on every boundary between a reachable and a fogged zone (spokes + inner arcs)
    const h = 16;
    const y0 = -1.5;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const quad = (ax: number, az: number, bx: number, bz: number) => {
      const base = pos.length / 3;
      const len = Math.hypot(bx - ax, bz - az);
      pos.push(ax, y0, az, bx, y0, bz, bx, y0 + h, bz, ax, y0 + h, az);
      uv.push(0, 0, len / h, 0, len / h, 1, 0, 1);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const ok = (z: number) => flags[z] === 1;
    const half = Math.PI / zones.n;
    const rEnd = zones.rOut + 60;
    for (let k = 0; k < zones.n; k++) {
      const mid = -Math.PI / 2 + (2 * Math.PI * k) / zones.n;
      const next = (k + 1) % zones.n;
      // spoke between sector k and k+1 (at mid + half)
      if (ok(k + 1) !== ok(next + 1)) {
        const a = mid + half;
        quad(zones.cx + zones.rIn * Math.cos(a), zones.cy + zones.rIn * Math.sin(a), zones.cx + rEnd * Math.cos(a), zones.cy + rEnd * Math.sin(a));
      }
      // inner arc of sector k against the centre
      if (ok(k + 1) !== ok(0)) {
        const steps = 10;
        for (let i = 0; i < steps; i++) {
          const a0 = mid - half + (2 * half * i) / steps;
          const a1 = mid - half + (2 * half * (i + 1)) / steps;
          quad(zones.cx + zones.rIn * Math.cos(a0), zones.cy + zones.rIn * Math.sin(a0), zones.cx + zones.rIn * Math.cos(a1), zones.cy + zones.rIn * Math.sin(a1));
        }
      }
    }
    if (idx.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      this.curtain = new THREE.Mesh(g, this.curtainMat);
      this.curtain.frustumCulled = false;
      this.group.add(this.curtain);
    }
  }

  /** `camDist` keeps the curtain readable from afar: 16 tiles tall up close, growing with the camera distance. */
  tick(tSeconds: number, camDist: number) {
    if (!this.key) return;
    this.blanketMat.uniforms.uTime.value = tSeconds;
    this.curtainMat.uniforms.uTime.value = tSeconds;
    if (this.curtain) this.curtain.scale.y = Math.max(1, camDist / 40);
  }

  private clear() {
    for (const m of [this.blanket, this.curtain]) {
      if (!m) continue;
      this.group.remove(m);
      m.geometry.dispose();
    }
    this.blanket = null;
    this.curtain = null;
  }

  dispose() {
    this.clear();
    this.blanketMat.dispose();
    this.curtainMat.dispose();
  }
}
