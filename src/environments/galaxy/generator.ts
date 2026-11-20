import { clamp } from '../../utils/math';
import { createRng, gaussish } from '../../utils/rng';

export interface GalaxyConfig {
  stars: number;
  /** Number of spiral arms. */
  arms: number;
  /** How tightly the arms wind. 0 gives straight spokes. */
  twist: number;
  /** Radius of the central bulge. */
  coreSize: number;
  /** How far stars stray from the centre line of their arm. */
  spread: number;
  /** Disc thickness. */
  thickness: number;
  /** 0..1, strength of a central bar. */
  bar: number;
}

export type GalaxyShape = Omit<GalaxyConfig, 'stars'>;

export const GALAXY_PRESETS = {
  grand: {
    label: 'Grand spiral',
    shape: { arms: 4, twist: 1.5, coreSize: 0.5, spread: 0.4, thickness: 0.16, bar: 0 },
  },
  barred: {
    label: 'Barred spiral',
    shape: { arms: 2, twist: 1.15, coreSize: 0.4, spread: 0.32, thickness: 0.14, bar: 0.9 },
  },
  whirlpool: {
    label: 'Whirlpool',
    shape: { arms: 2, twist: 2.7, coreSize: 0.45, spread: 0.3, thickness: 0.12, bar: 0 },
  },
  pinwheel: {
    label: 'Pinwheel',
    shape: { arms: 6, twist: 2.0, coreSize: 0.32, spread: 0.26, thickness: 0.1, bar: 0 },
  },
  flocculent: {
    label: 'Flocculent',
    shape: { arms: 8, twist: 0.9, coreSize: 0.7, spread: 0.95, thickness: 0.24, bar: 0 },
  },
} as const satisfies Record<string, { label: string; shape: GalaxyShape }>;

export type GalaxyPresetName = keyof typeof GALAXY_PRESETS;
export const GALAXY_PRESET_NAMES = Object.keys(GALAXY_PRESETS) as GalaxyPresetName[];

export const GALAXY_RADIUS = 4.4;
export const GALAXY_LIMITS = {
  stars: { min: 5_000, max: 150_000 },
  arms: { min: 1, max: 8 },
  twist: { min: 0, max: 4 },
  coreSize: { min: 0.15, max: 1.2 },
  spread: { min: 0.05, max: 1.2 },
  thickness: { min: 0.02, max: 0.6 },
  bar: { min: 0, max: 1 },
} as const;

/** Star populations. Pattern stars turn rigidly with the arms; free stars orbit at their own rate. */
export const STAR_KIND = { PATTERN: 0, FREE: 1 } as const;

export interface GalaxyBuffers {
  /** Per star: radius, angle (radians), height above the disc. */
  polar: Float32Array;
  /** Per star: size 0..1, temperature 0 (core) .. 1 (rim), kind, random phase 0..1. */
  seed: Float32Array;
}

export function sanitizeGalaxyConfig(config: GalaxyConfig): GalaxyConfig {
  const pick = (key: keyof typeof GALAXY_LIMITS): number =>
    clamp(
      Number.isFinite(config[key]) ? config[key] : GALAXY_LIMITS[key].min,
      GALAXY_LIMITS[key].min,
      GALAXY_LIMITS[key].max,
    );
  return {
    stars: Math.round(pick('stars')),
    arms: Math.round(pick('arms')),
    twist: pick('twist'),
    coreSize: pick('coreSize'),
    spread: pick('spread'),
    thickness: pick('thickness'),
    bar: pick('bar'),
  };
}

const TAU = Math.PI * 2;

/** Deterministic procedural spiral galaxy in polar form; the vertex shader turns it into motion. */
export function generateGalaxy(input: GalaxyConfig, seed = 42): GalaxyBuffers {
  const config = sanitizeGalaxyConfig(input);
  const { stars, arms, twist, coreSize, spread, thickness, bar } = config;
  const rng = createRng(seed);
  const polar = new Float32Array(stars * 3);
  const seeds = new Float32Array(stars * 4);

  const bulgeShare = 0.12 + coreSize * 0.08;
  const barShare = bar * 0.12;
  const hazeShare = 0.2;
  const barLength = bar > 0 ? coreSize + 0.9 * bar : 0;
  const armStart = Math.max(coreSize * 0.55, barLength * 0.92);

  for (let i = 0; i < stars; i++) {
    const u = rng();
    let radius: number;
    let angle: number;
    let height: number;
    let temperature: number;
    let kind: number = STAR_KIND.PATTERN;

    if (u < bulgeShare) {
      // A slightly flattened ball, denser toward the centre.
      const distance = coreSize * Math.pow(rng(), 0.6);
      const up = rng() * 2 - 1;
      radius = distance * Math.sqrt(1 - up * up);
      angle = rng() * TAU;
      height = distance * up * 0.65;
      temperature = (distance / coreSize) * 0.22;
      kind = STAR_KIND.FREE;
    } else if (u < bulgeShare + barShare) {
      // An elongated bar through the centre, locked to the arm pattern.
      const x = gaussish(rng) * barLength * 0.9;
      const z = gaussish(rng) * 0.13;
      radius = Math.hypot(x, z);
      angle = Math.atan2(z, x);
      height = gaussish(rng) * thickness * 0.7;
      temperature = 0.12 + (radius / GALAXY_RADIUS) * 0.3;
    } else if (u < bulgeShare + barShare + hazeShare) {
      // Old disc stars between the arms.
      radius = GALAXY_RADIUS * Math.pow(rng(), 0.62);
      angle = rng() * TAU;
      height = gaussish(rng) * thickness * 0.8;
      temperature = 0.3 + (radius / GALAXY_RADIUS) * 0.35;
      kind = STAR_KIND.FREE;
    } else {
      radius = armStart + (GALAXY_RADIUS - armStart) * Math.pow(rng(), 0.78);
      const arm = Math.floor(rng() * arms);
      const along = twist * 2.1 * Math.log(1 + radius * 1.15);
      const scatter = (gaussish(rng) * spread) / (0.45 + radius * 0.42);
      angle = (arm / arms) * TAU + along + scatter;
      radius = Math.max(0.02, radius + gaussish(rng) * spread * 0.22);
      height = gaussish(rng) * thickness * (1.1 - (radius / GALAXY_RADIUS) * 0.6);
      temperature = 0.4 + (radius / GALAXY_RADIUS) * 0.6;
    }

    polar[i * 3] = Math.min(radius, GALAXY_RADIUS * 1.15);
    polar[i * 3 + 1] = angle;
    polar[i * 3 + 2] = height;
    seeds[i * 4] = rng();
    seeds[i * 4 + 1] = clamp(temperature, 0, 1);
    seeds[i * 4 + 2] = kind;
    seeds[i * 4 + 3] = rng();
  }
  return { polar, seed: seeds };
}
