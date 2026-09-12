import * as THREE from "three";

/**
 * Grande Mondo fog wall (Bibbia GM): everything outside the player's region is hidden under a drifting fog blanket,
 * bounded by a tall translucent curtain on the regional border. Pure visuals — the server enforces the rule.
 */
export type FogBounds = { x0: number; y0: number; x1: number; y1: number };

const BLANKET_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

// distance-to-rectangle alpha ramp + two layers of scrolling value noise → soft, slowly drifting fog
const BLANKET_FRAG = /* glsl */ `
  precision highp float;
  uniform vec4 uRect;      // x0, y0, x1, y1 (tile space)
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec3 vWorld;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  void main() {
    vec2 p = vWorld.xz;
    vec2 dv = max(vec2(uRect.x - p.x, uRect.y - p.y), vec2(p.x - uRect.z, p.y - uRect.w));
    float outside = max(max(dv.x, dv.y), 0.0);       // 0 inside the region, tiles beyond the border outside
    if (outside <= 0.0) discard;
    float ramp = smoothstep(0.0, 10.0, outside);
    float n = vnoise(p * 0.035 + vec2(uTime * 0.012, uTime * 0.007)) * 0.6 + vnoise(p * 0.11 - vec2(uTime * 0.02, uTime * 0.015)) * 0.4;
    float a = uOpacity * ramp * (0.82 + 0.18 * n);
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
    // billowing wall: dense at the ground, dissolving towards the top, streaked by rising noise
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
  private bounds: FogBounds | null = null;

  constructor(color: THREE.Color) {
    this.blanketMat = new THREE.ShaderMaterial({
      vertexShader: BLANKET_VERT,
      fragmentShader: BLANKET_FRAG,
      uniforms: { uRect: { value: new THREE.Vector4() }, uTime: { value: 0 }, uColor: { value: color.clone() }, uOpacity: { value: 0.97 } },
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
    return this.bounds !== null;
  }

  /** `bounds` = the visible region (tile space); null removes the fog. `world` = realm size (blanket extent). */
  setBounds(bounds: FogBounds | null, world: number) {
    if (bounds && this.bounds && bounds.x0 === this.bounds.x0 && bounds.y0 === this.bounds.y0 && bounds.x1 === this.bounds.x1 && bounds.y1 === this.bounds.y1) return;
    this.clear();
    this.bounds = bounds;
    this.group.visible = !!bounds;
    if (!bounds) return;
    const pad = 200;
    const blanketGeo = new THREE.PlaneGeometry(world + pad * 2, world + pad * 2, 1, 1);
    blanketGeo.rotateX(-Math.PI / 2);
    this.blanket = new THREE.Mesh(blanketGeo, this.blanketMat);
    this.blanket.position.set(world / 2, 3.2, world / 2);
    this.blanket.frustumCulled = false;
    (this.blanketMat.uniforms.uRect.value as THREE.Vector4).set(bounds.x0, bounds.y0, bounds.x1, bounds.y1);
    this.group.add(this.blanket);
    // curtain: four vertical quads along the border, 16 tiles tall, feet slightly below the ground
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
    quad(bounds.x0, bounds.y0, bounds.x1, bounds.y0);
    quad(bounds.x1, bounds.y0, bounds.x1, bounds.y1);
    quad(bounds.x1, bounds.y1, bounds.x0, bounds.y1);
    quad(bounds.x0, bounds.y1, bounds.x0, bounds.y0);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.curtain = new THREE.Mesh(g, this.curtainMat);
    this.curtain.frustumCulled = false;
    this.group.add(this.curtain);
  }

  /** `camDist` keeps the curtain readable from afar: 16 tiles tall up close, growing with the camera distance. */
  tick(tSeconds: number, camDist: number) {
    if (!this.bounds) return;
    this.blanketMat.uniforms.uTime.value = tSeconds;
    this.curtainMat.uniforms.uTime.value = tSeconds;
    if (this.curtain) this.curtain.scale.y = Math.max(1, camDist / 40);
  }

  setColor(color: THREE.Color) {
    (this.blanketMat.uniforms.uColor.value as THREE.Color).copy(color);
    (this.curtainMat.uniforms.uColor.value as THREE.Color).copy(color);
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
