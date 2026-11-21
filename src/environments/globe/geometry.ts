import { createRng } from '../../utils/rng';
import { isLand } from './landMask';

const DEG = Math.PI / 180;

/**
 * A point on the unit sphere. North is +y, longitude 0 faces +z (the viewer) and east is +x,
 * so the map reads the right way round from outside.
 */
export function latLonToUnit(
  latitude: number,
  longitude: number,
  out: Float32Array,
  offset: number,
): void {
  const lat = latitude * DEG;
  const lon = longitude * DEG;
  out[offset] = Math.cos(lat) * Math.sin(lon);
  out[offset + 1] = Math.sin(lat);
  out[offset + 2] = Math.cos(lat) * Math.cos(lon);
}

export interface GlobeDots {
  count: number;
  /** xyz on the unit sphere. */
  positions: Float32Array;
  /** Per dot: x = 1 on land and 0 at sea, y z w = independent random numbers 0..1. */
  seeds: Float32Array;
}

/**
 * Evenly spread dots over a sphere, each marked land or sea.
 *
 * The dots are in a shuffled order, so drawing only the first N of them still covers the whole
 * sphere evenly. Lower quality tiers draw a shorter prefix instead of rebuilding the buffers.
 */
export function generateGlobeDots(count: number, seed = 2024): GlobeDots {
  const total = Math.max(1, Math.floor(count));
  const rng = createRng(seed);
  const order = new Uint32Array(total);
  for (let i = 0; i < total; i++) order[i] = i;
  for (let i = total - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swap = order[i];
    order[i] = order[j];
    order[j] = swap;
  }

  const positions = new Float32Array(total * 3);
  const seeds = new Float32Array(total * 4);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let slot = 0; slot < total; slot++) {
    // A Fibonacci lattice: equal-area steps down the axis, a golden-angle turn each step.
    const i = order[slot];
    const y = 1 - ((i + 0.5) / total) * 2;
    const ring = Math.sqrt(1 - y * y);
    const turn = i * golden;
    const x = Math.sin(turn) * ring;
    const z = Math.cos(turn) * ring;
    positions[slot * 3] = x;
    positions[slot * 3 + 1] = y;
    positions[slot * 3 + 2] = z;
    seeds[slot * 4] = isLand(Math.asin(y) / DEG, Math.atan2(x, z) / DEG) ? 1 : 0;
    seeds[slot * 4 + 1] = rng();
    seeds[slot * 4 + 2] = rng();
    seeds[slot * 4 + 3] = rng();
  }
  return { count: total, positions, seeds };
}

/**
 * Latitude and longitude lines as line segments on the unit sphere: a parallel every `step`
 * degrees (excluding the poles) and a meridian every `step` degrees, drawn in `segment` degree pieces.
 */
export function generateGraticule(step = 15, segment = 5): Float32Array {
  const parallels: number[] = [];
  for (let lat = -90 + step; lat < 90; lat += step) parallels.push(lat);
  const meridians: number[] = [];
  for (let lon = -180; lon < 180; lon += step) meridians.push(lon);

  const perParallel = Math.round(360 / segment);
  const perMeridian = Math.round(180 / segment);
  const segments = parallels.length * perParallel + meridians.length * perMeridian;
  const out = new Float32Array(segments * 6);
  let offset = 0;
  for (const lat of parallels) {
    for (let i = 0; i < perParallel; i++) {
      latLonToUnit(lat, -180 + i * segment, out, offset);
      latLonToUnit(lat, -180 + (i + 1) * segment, out, offset + 3);
      offset += 6;
    }
  }
  for (const lon of meridians) {
    for (let i = 0; i < perMeridian; i++) {
      latLonToUnit(-90 + i * segment, lon, out, offset);
      latLonToUnit(-90 + (i + 1) * segment, lon, out, offset + 3);
      offset += 6;
    }
  }
  return out;
}
