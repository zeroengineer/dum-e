import { BufferAttribute, BufferGeometry } from 'three';

/**
 * Hand-built geometries for the Object Lab. Both are emitted as un-indexed triangle soup so every
 * face gets its own normal (a faceted, cut-gem look) without relying on material flat shading.
 */

const TAU = Math.PI * 2;

type Point = readonly [number, number, number];

/** Appends triangle a-b-c, flipping it if needed so its normal points away from `inside`. */
function pushOutward(out: number[], a: Point, b: Point, c: Point, inside: Point): void {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const cx = (a[0] + b[0] + c[0]) / 3 - inside[0];
  const cy = (a[1] + b[1] + c[1]) / 3 - inside[1];
  const cz = (a[2] + b[2] + c[2]) / 3 - inside[2];
  if (nx * cx + ny * cy + nz * cz >= 0) out.push(...a, ...b, ...c);
  else out.push(...a, ...c, ...b);
}

/** Triangle-soup positions for a crystal: a hexagonal prism capped by two pyramids. */
export function crystalPositions(radius = 0.5, height = 1.5, waist = 0.42, sides = 6): number[] {
  const out: number[] = [];
  const centre: Point = [0, 0, 0];
  const top: Point = [0, height / 2, 0];
  const bottom: Point = [0, -height / 2, 0];
  const y = (height / 2) * waist;
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * TAU;
    const a1 = ((i + 1) / sides) * TAU;
    const u0: Point = [Math.cos(a0) * radius, y, Math.sin(a0) * radius];
    const u1: Point = [Math.cos(a1) * radius, y, Math.sin(a1) * radius];
    const l0: Point = [u0[0], -y, u0[2]];
    const l1: Point = [u1[0], -y, u1[2]];
    pushOutward(out, top, u0, u1, centre);
    pushOutward(out, u0, l0, l1, centre);
    pushOutward(out, u0, l1, u1, centre);
    pushOutward(out, bottom, l0, l1, centre);
  }
  return out;
}

/**
 * Triangle-soup positions for a ring with a square cross-section that twists as it goes round.
 * `quarterTurns` must be a whole number so the square meets itself where the ring closes.
 */
export function twistedRingPositions(
  ringRadius = 0.62,
  tube = 0.2,
  quarterTurns = 2,
  segments = 72,
): number[] {
  const out: number[] = [];
  const frame = (step: number): { centre: Point; corners: Point[] } => {
    const u = (step / segments) * TAU;
    const twist = (step / segments) * quarterTurns * (Math.PI / 2);
    const cu = Math.cos(u);
    const su = Math.sin(u);
    const centre: Point = [cu * ringRadius, 0, su * ringRadius];
    const corners: Point[] = [];
    for (let k = 0; k < 4; k++) {
      const a = twist + Math.PI / 4 + (k * Math.PI) / 2;
      // Cross-section basis: radial direction (cu, 0, su) and the ring axis (0, 1, 0).
      const r = Math.cos(a) * tube;
      const h = Math.sin(a) * tube;
      corners.push([centre[0] + cu * r, h, centre[2] + su * r]);
    }
    return { centre, corners };
  };

  for (let s = 0; s < segments; s++) {
    const a = frame(s);
    const b = frame(s + 1);
    const inside: Point = [
      (a.centre[0] + b.centre[0]) / 2,
      (a.centre[1] + b.centre[1]) / 2,
      (a.centre[2] + b.centre[2]) / 2,
    ];
    for (let k = 0; k < 4; k++) {
      const n = (k + 1) % 4;
      pushOutward(out, a.corners[k], b.corners[k], b.corners[n], inside);
      pushOutward(out, a.corners[k], b.corners[n], a.corners[n], inside);
    }
  }
  return out;
}

function fromPositions(positions: number[]): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export const createCrystalGeometry = (): BufferGeometry => fromPositions(crystalPositions());
export const createTwistedRingGeometry = (): BufferGeometry =>
  fromPositions(twistedRingPositions());
