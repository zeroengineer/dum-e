import { describe, expect, it } from 'vitest';
import { crystalPositions, twistedRingPositions } from '../../src/environments/objects/geometries';
import {
  LAB_BOUNDS,
  OBJECT_KINDS,
  clampToBounds,
  layoutObjects,
} from '../../src/environments/objects/layout';

/** Sum of signed tetrahedron volumes; positive when every face winds outward. */
function signedVolume(p: number[]): number {
  let volume = 0;
  for (let i = 0; i < p.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = p.slice(i, i + 9);
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return volume;
}

describe('custom geometries', () => {
  it('builds a closed, outward-facing crystal', () => {
    const p = crystalPositions(0.5, 1.5, 0.42, 6);
    expect(p).toHaveLength(6 * 4 * 9);
    expect(p.every(Number.isFinite)).toBe(true);
    expect(signedVolume(p)).toBeGreaterThan(0.1);
  });

  it('builds a twisted ring whose faces all point outward', () => {
    const segments = 48;
    const p = twistedRingPositions(0.62, 0.2, 2, segments);
    expect(p).toHaveLength(segments * 4 * 2 * 9);
    expect(p.every(Number.isFinite)).toBe(true);
    // Volume of a square-section ring: cross-section area (2 * tube^2) times the centre-line length.
    const expected = 2 * 0.2 * 0.2 * (2 * Math.PI * 0.62);
    expect(signedVolume(p)).toBeGreaterThan(expected * 0.9);
    expect(signedVolume(p)).toBeLessThan(expected * 1.1);
  });

  it('closes the twisted ring seamlessly', () => {
    const segments = 24;
    const p = twistedRingPositions(0.62, 0.2, 2, segments);
    const points = new Map<string, number>();
    for (let i = 0; i < p.length; i += 3) {
      const key = `${p[i].toFixed(4)},${p[i + 1].toFixed(4)},${p[i + 2].toFixed(4)}`;
      points.set(key, (points.get(key) ?? 0) + 1);
    }
    // In a watertight quad strip every corner is shared by exactly six triangles.
    expect([...points.values()].every((uses) => uses === 6)).toBe(true);
  });
});

describe('object layout', () => {
  it('places the requested number of objects inside the bounds', () => {
    for (const count of [4, 7, 10, 16]) {
      const placements = layoutObjects(count);
      expect(placements).toHaveLength(count);
      for (const { position } of placements) {
        expect(Math.abs(position.x)).toBeLessThanOrEqual(LAB_BOUNDS.x);
        expect(position.y).toBeGreaterThanOrEqual(LAB_BOUNDS.yMin);
        expect(position.y).toBeLessThanOrEqual(LAB_BOUNDS.yMax);
        expect(Math.abs(position.z)).toBeLessThanOrEqual(LAB_BOUNDS.z);
      }
    }
  });

  it('shows every kind of object in the default arrangement', () => {
    const kinds = new Set(layoutObjects(10).map((p) => p.kind));
    expect(kinds.size).toBe(OBJECT_KINDS.length);
  });

  it('does not stack objects on top of each other', () => {
    const placements = layoutObjects(16);
    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        const a = placements[i].position;
        const b = placements[j].position;
        expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeGreaterThan(0.9);
      }
    }
  });

  it('clamps positions to the bounds', () => {
    expect(clampToBounds({ x: 99, y: -99, z: 99 })).toEqual({
      x: LAB_BOUNDS.x,
      y: LAB_BOUNDS.yMin,
      z: LAB_BOUNDS.z,
    });
  });
});
