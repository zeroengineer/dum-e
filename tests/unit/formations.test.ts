import { describe, expect, it } from 'vitest';
import {
  FORMATIONS,
  FORMATION_RADIUS,
  generateFormation,
  staggeredProgress,
} from '../../src/environments/particles/formations';

describe('particle formations', () => {
  it.each(FORMATIONS)('%s produces finite positions inside the formation radius', (name) => {
    const count = 3000;
    const positions = generateFormation(name, count);
    expect(positions).toHaveLength(count * 3);
    let maxRadius = 0;
    for (let i = 0; i < count; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)).toBe(true);
      maxRadius = Math.max(maxRadius, Math.hypot(x, y, z));
    }
    expect(maxRadius).toBeGreaterThan(1);
    expect(maxRadius).toBeLessThanOrEqual(FORMATION_RADIUS * 1.5);
  });

  it('is deterministic for a given seed', () => {
    expect(generateFormation('galaxy', 500, 3)).toEqual(generateFormation('galaxy', 500, 3));
  });

  it('gives different formations different shapes', () => {
    const a = generateFormation('sphere', 500);
    const b = generateFormation('dna', 500);
    let difference = 0;
    for (let i = 0; i < a.length; i++) difference += Math.abs(a[i] - b[i]);
    expect(difference).toBeGreaterThan(100);
  });

  it('keeps the sphere shell near radius 2', () => {
    const positions = generateFormation('sphere', 2000);
    let onShell = 0;
    for (let i = 0; i < 2000; i++) {
      const r = Math.hypot(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      if (r > 1.9 && r < 2.1) onShell++;
    }
    expect(onShell / 2000).toBeGreaterThan(0.7);
  });
});

describe('staggeredProgress', () => {
  it('starts at 0 and ends at 1 for every particle', () => {
    for (const random of [0, 0.3, 0.99]) {
      expect(staggeredProgress(0, random)).toBe(0);
      expect(staggeredProgress(1, random)).toBe(1);
    }
  });

  it('delays particles with a higher random value', () => {
    expect(staggeredProgress(0.4, 0.1)).toBeGreaterThan(staggeredProgress(0.4, 0.9));
  });
});
