import { describe, expect, it } from 'vitest';
import {
  GALAXY_LIMITS,
  GALAXY_PRESETS,
  GALAXY_PRESET_NAMES,
  GALAXY_RADIUS,
  STAR_KIND,
  generateGalaxy,
  sanitizeGalaxyConfig,
} from '../../src/environments/galaxy/generator';
import type { GalaxyConfig } from '../../src/environments/galaxy/generator';

const base: GalaxyConfig = { stars: 8000, ...GALAXY_PRESETS.grand.shape };

describe('galaxy generator', () => {
  it.each(GALAXY_PRESET_NAMES)('%s yields finite stars inside the disc', (name) => {
    const config = { stars: 6000, ...GALAXY_PRESETS[name].shape };
    const { polar, seed } = generateGalaxy(config);
    expect(polar).toHaveLength(6000 * 3);
    expect(seed).toHaveLength(6000 * 4);
    for (let i = 0; i < 6000; i++) {
      const radius = polar[i * 3];
      expect(Number.isFinite(radius) && Number.isFinite(polar[i * 3 + 1])).toBe(true);
      expect(radius).toBeGreaterThanOrEqual(0);
      expect(radius).toBeLessThanOrEqual(GALAXY_RADIUS * 1.15 + 1e-6);
      expect(Math.abs(polar[i * 3 + 2])).toBeLessThan(1.5);
      expect(seed[i * 4 + 1]).toBeGreaterThanOrEqual(0);
      expect(seed[i * 4 + 1]).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic', () => {
    expect(generateGalaxy(base, 5).polar).toEqual(generateGalaxy(base, 5).polar);
  });

  it('contains both pattern-locked and free-orbiting stars', () => {
    const { seed } = generateGalaxy(base);
    let free = 0;
    for (let i = 0; i < base.stars; i++) if (seed[i * 4 + 2] === STAR_KIND.FREE) free++;
    const share = free / base.stars;
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.6);
  });

  it('concentrates arm stars around the requested number of arms', () => {
    // With no twist the arms are straight spokes, so angles cluster at multiples of 2*PI / arms.
    const arms = 3;
    const { polar, seed } = generateGalaxy({ ...base, arms, twist: 0, spread: 0.1, bar: 0 });
    let near = 0;
    let total = 0;
    for (let i = 0; i < base.stars; i++) {
      if (seed[i * 4 + 2] !== STAR_KIND.PATTERN || polar[i * 3] < 1.5) continue;
      total++;
      const step = (Math.PI * 2) / arms;
      const offset = Math.abs(((polar[i * 3 + 1] % step) + step) % step);
      if (Math.min(offset, step - offset) < step * 0.15) near++;
    }
    expect(total).toBeGreaterThan(1000);
    expect(near / total).toBeGreaterThan(0.85);
  });

  it('makes the disc thicker when asked', () => {
    const spreadOf = (thickness: number): number => {
      const { polar } = generateGalaxy({ ...base, thickness });
      let sum = 0;
      for (let i = 0; i < base.stars; i++) sum += Math.abs(polar[i * 3 + 2]);
      return sum / base.stars;
    };
    expect(spreadOf(0.5)).toBeGreaterThan(spreadOf(0.05) * 2);
  });
});

describe('sanitizeGalaxyConfig', () => {
  it('clamps every field and rounds counts', () => {
    const c = sanitizeGalaxyConfig({
      stars: 1e9,
      arms: 2.6,
      twist: -3,
      coreSize: Number.NaN,
      spread: 99,
      thickness: 0,
      bar: 4,
    });
    expect(c.stars).toBe(GALAXY_LIMITS.stars.max);
    expect(c.arms).toBe(3);
    expect(c.twist).toBe(0);
    expect(c.coreSize).toBe(GALAXY_LIMITS.coreSize.min);
    expect(c.spread).toBe(GALAXY_LIMITS.spread.max);
    expect(c.thickness).toBe(GALAXY_LIMITS.thickness.min);
    expect(c.bar).toBe(1);
  });
});
