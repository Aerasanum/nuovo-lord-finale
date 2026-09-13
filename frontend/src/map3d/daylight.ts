/**
 * Realm daylight: one shared clock for every player (UTC+1, server time) drives dawn → day → dusk → night.
 * Night stays readable by design (cool blue key light, brighter torches and lit windows), it never goes black.
 * `daylightAt(hour)` returns the blended lighting preset; the engine applies it to lights, fog, exposure and shaders.
 */
import * as THREE from "three";

export type Daylight = {
  sunColor: THREE.Color;
  sunIntensity: number;
  sunDir: THREE.Vector3;
  skyColor: THREE.Color;
  groundColor: THREE.Color;
  hemiIntensity: number;
  /** 0..1 tint of the horizon (fog + clear colour) towards `horizonTint` */
  horizonTint: THREE.Color;
  horizonMix: number;
  exposure: number;
  /** 0 by day → 1 at night: torches, braziers and windows brighten with it */
  night: number;
};

type Key = { hour: number; d: Daylight };

const P = (sun: number, sunI: number, dir: [number, number, number], sky: number, ground: number, hemiI: number, tint: number, mix: number, exposure: number, night: number): Daylight => ({
  sunColor: new THREE.Color(sun),
  sunIntensity: sunI,
  sunDir: new THREE.Vector3(...dir).normalize(),
  skyColor: new THREE.Color(sky),
  groundColor: new THREE.Color(ground),
  hemiIntensity: hemiI,
  horizonTint: new THREE.Color(tint),
  horizonMix: mix,
  exposure,
  night,
});

// Night is a readable "blue hour" by design (user rule): cool but bright key light, luminous sky, exposure close to
// daytime — torches, braziers and windows still glow (night = 1), terrain and castles never sink into black.
const NIGHT = P(0xb7c8f6, 1.35, [0.3, 0.72, -0.5], 0x7f97d6, 0x33405f, 1.0, 0x2a3f78, 0.75, 0.98, 1);
const DAWN = P(0xffc38c, 1.75, [0.85, 0.42, 0.3], 0xf2c4a6, 0x5c5a46, 0.9, 0xf5b58c, 0.55, 1.04, 0.22);
const DAY = P(0xfff3dc, 2.05, [0.6, 0.78, 0.36], 0xbfe1ff, 0x7c9a58, 1.0, 0xa9d6f5, 0, 1.08, 0);
const DUSK = P(0xffa26a, 1.7, [-0.7, 0.38, 0.45], 0xe6a8ac, 0x5c4c48, 0.9, 0xf39a70, 0.6, 1.02, 0.28);

// realm hour → preset (wraps at 24)
const KEYS: Key[] = [
  { hour: 0, d: NIGHT },
  { hour: 5, d: NIGHT },
  { hour: 6.5, d: DAWN },
  { hour: 8.5, d: DAY },
  { hour: 17, d: DAY },
  { hour: 18.5, d: DUSK },
  { hour: 20.5, d: NIGHT },
  { hour: 24, d: NIGHT },
];

function lerp(a: Daylight, b: Daylight, u: number, out: Daylight): Daylight {
  out.sunColor.copy(a.sunColor).lerp(b.sunColor, u);
  out.sunIntensity = a.sunIntensity + (b.sunIntensity - a.sunIntensity) * u;
  out.sunDir.copy(a.sunDir).lerp(b.sunDir, u).normalize();
  out.skyColor.copy(a.skyColor).lerp(b.skyColor, u);
  out.groundColor.copy(a.groundColor).lerp(b.groundColor, u);
  out.hemiIntensity = a.hemiIntensity + (b.hemiIntensity - a.hemiIntensity) * u;
  out.horizonTint.copy(a.horizonTint).lerp(b.horizonTint, u);
  out.horizonMix = a.horizonMix + (b.horizonMix - a.horizonMix) * u;
  out.exposure = a.exposure + (b.exposure - a.exposure) * u;
  out.night = a.night + (b.night - a.night) * u;
  return out;
}

const scratch = P(0, 0, [0, 1, 0], 0, 0, 0, 0, 0, 1, 0);

/** Blended preset for a realm hour (0 ≤ hour < 24, fractional). Returns a shared scratch object. */
export function daylightAt(hour: number): Daylight {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i];
    const b = KEYS[i + 1];
    if (h >= a.hour && h <= b.hour) {
      const span = b.hour - a.hour;
      const raw = span > 0 ? (h - a.hour) / span : 0;
      const u = raw * raw * (3 - 2 * raw); // smoothstep
      return lerp(a.d, b.d, u, scratch);
    }
  }
  return lerp(NIGHT, NIGHT, 0, scratch);
}

export type TimeOfDay = "dawn" | "day" | "dusk" | "night";

/** Coarse label for the HUD chip. */
export function timeOfDay(hour: number): TimeOfDay {
  const h = ((hour % 24) + 24) % 24;
  if (h < 5.5 || h >= 20.5) return "night";
  if (h < 8.5) return "dawn";
  if (h < 18) return "day";
  return "dusk";
}

/** Realm hour (UTC+1) from a server-synchronised epoch in ms. */
export function realmHour(serverNowMs: number): number {
  const d = new Date(serverNowMs);
  return (d.getUTCHours() + 1 + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600) % 24;
}
