import { createRng, gaussish } from '../../utils/rng';
import type { Rng } from '../../utils/rng';

export const FORMATIONS = [
  'sphere',
  'galaxy',
  'heart',
  'dna',
  'spiral',
  'wave',
  'explosion',
] as const;

export type FormationName = (typeof FORMATIONS)[number];

export const FORMATION_LABELS: Record<FormationName, string> = {
  sphere: 'Sphere',
  galaxy: 'Galaxy',
  heart: 'Heart',
  dna: 'DNA',
  spiral: 'Spiral',
  wave: 'Wave',
  explosion: 'Explosion',
};

/** Every formation fits inside a sphere of roughly this radius. */
export const FORMATION_RADIUS = 2.6;

type Writer = (i: number, x: number, y: number, z: number) => void;
type Generator = (count: number, rng: Rng, put: Writer) => void;

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const sphere: Generator = (count, rng, put) => {
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * (i + 0.5)) / count;
    const ring = Math.sqrt(1 - y * y);
    const a = i * GOLDEN_ANGLE;
    // Most particles form the shell, the rest fill the interior for depth.
    const r = rng() < 0.82 ? 2 * (0.97 + rng() * 0.06) : 2 * Math.cbrt(rng()) * 0.92;
    put(i, Math.cos(a) * ring * r, y * r, Math.sin(a) * ring * r);
  }
};

const galaxy: Generator = (count, rng, put) => {
  const arms = 4;
  for (let i = 0; i < count; i++) {
    if (rng() < 0.16) {
      // Central bulge.
      const r = 0.45 * Math.cbrt(rng());
      const u = rng() * 2 - 1;
      const a = rng() * TAU;
      const s = Math.sqrt(1 - u * u);
      put(i, Math.cos(a) * s * r, u * r * 0.7, Math.sin(a) * s * r);
      continue;
    }
    const r = 0.25 + 2.3 * Math.pow(rng(), 0.7);
    const arm = Math.floor(rng() * arms);
    const a = (arm / arms) * TAU + r * 1.5 + (gaussish(rng) * 0.42) / (0.6 + r * 0.5);
    const y = gaussish(rng) * 0.16 * (1.15 - r / 2.6);
    put(i, Math.cos(a) * r, y, Math.sin(a) * r);
  }
};

const heart: Generator = (count, rng, put) => {
  const s = 0.118;
  for (let i = 0; i < count; i++) {
    const t = rng() * TAU;
    const hx = 16 * Math.pow(Math.sin(t), 3);
    const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    // Bias toward the outline so the silhouette stays crisp while the inside is still filled.
    const fill = Math.pow(rng(), 0.3);
    const depth = Math.sqrt(Math.max(0, 1 - fill * fill));
    const z = gaussish(rng) * 0.85 * depth + gaussish(rng) * 0.06;
    put(i, hx * s * fill, (hy * fill + 2.4) * s, z);
  }
};

const dna: Generator = (count, rng, put) => {
  const height = 4.6;
  const turns = 3.2;
  const radius = 0.78;
  const rungs = 30;
  for (let i = 0; i < count; i++) {
    if (rng() < 0.22) {
      // Base pairs: straight bars joining the two strands at regular heights.
      const level = (Math.floor(rng() * rungs) + 0.5) / rungs;
      const a = level * TAU * turns;
      const across = (rng() * 2 - 1) * radius;
      put(
        i,
        Math.cos(a) * across + gaussish(rng) * 0.02,
        (level - 0.5) * height + gaussish(rng) * 0.02,
        Math.sin(a) * across + gaussish(rng) * 0.02,
      );
      continue;
    }
    const t = rng();
    const a = t * TAU * turns + (rng() < 0.5 ? 0 : Math.PI);
    const r = radius + gaussish(rng) * 0.07;
    put(i, Math.cos(a) * r, (t - 0.5) * height + gaussish(rng) * 0.04, Math.sin(a) * r);
  }
};

const spiral: Generator = (count, rng, put) => {
  // A rising vortex: radius grows with height, several interleaved bands.
  const bands = 3;
  for (let i = 0; i < count; i++) {
    const t = rng();
    const band = Math.floor(rng() * bands);
    const a = t * TAU * 4.5 + (band / bands) * TAU;
    const r = 0.18 + 2.1 * Math.pow(t, 1.25) + gaussish(rng) * 0.07;
    put(i, Math.cos(a) * r, (t - 0.5) * 3.8 + gaussish(rng) * 0.05, Math.sin(a) * r);
  }
};

const wave: Generator = (count, _rng, put) => {
  const side = Math.ceil(Math.sqrt(count));
  const span = 5.0;
  for (let i = 0; i < count; i++) {
    const x = ((i % side) / Math.max(1, side - 1) - 0.5) * span;
    const z = (Math.floor(i / side) / Math.max(1, side - 1) - 0.5) * span;
    put(i, x, Math.sin(x * 1.6) * Math.cos(z * 1.6) * 0.42, z);
  }
};

const explosion: Generator = (count, rng, put) => {
  // A burst: a hot dense core, a diffuse cloud, and bright streaks along a set of rays.
  const rayCount = 70;
  const rays: number[] = [];
  for (let r = 0; r < rayCount; r++) {
    const u = rng() * 2 - 1;
    const a = rng() * TAU;
    const s = Math.sqrt(1 - u * u);
    rays.push(Math.cos(a) * s, u, Math.sin(a) * s);
  }
  for (let i = 0; i < count; i++) {
    let dx: number;
    let dy: number;
    let dz: number;
    let r: number;
    if (rng() < 0.45) {
      const k = Math.floor(rng() * rayCount) * 3;
      dx = rays[k] + gaussish(rng) * 0.05;
      dy = rays[k + 1] + gaussish(rng) * 0.05;
      dz = rays[k + 2] + gaussish(rng) * 0.05;
      r = 0.3 + 2.3 * rng();
    } else {
      const u = rng() * 2 - 1;
      const a = rng() * TAU;
      const s = Math.sqrt(1 - u * u);
      dx = Math.cos(a) * s;
      dy = u;
      dz = Math.sin(a) * s;
      r = 0.15 + 2.2 * Math.pow(rng(), 1.6);
    }
    put(i, dx * r, dy * r, dz * r);
  }
};

const GENERATORS: Record<FormationName, Generator> = {
  sphere,
  galaxy,
  heart,
  dna,
  spiral,
  wave,
  explosion,
};

/** Deterministic target positions (xyz interleaved) for a formation. */
export function generateFormation(name: FormationName, count: number, seed = 1): Float32Array {
  const out = new Float32Array(count * 3);
  const put: Writer = (i, x, y, z) => {
    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
  };
  GENERATORS[name](count, createRng(seed + FORMATIONS.indexOf(name) * 9973), put);
  return out;
}

/** The per-particle morph progress used by the shader, mirrored here for CPU-side baking. */
export function staggeredProgress(morph: number, random: number, stagger = 0.6): number {
  const t = Math.min(1, Math.max(0, morph * (1 + stagger) - random * stagger));
  return t * t * (3 - 2 * t);
}
