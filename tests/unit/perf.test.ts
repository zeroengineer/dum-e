import { describe, expect, it } from 'vitest';
import { recentMeasures, timed } from '../../src/utils/perf';
import { SampleWindow } from '../../src/utils/stats';

describe('SampleWindow', () => {
  it('reports nothing until it has a sample', () => {
    const window = new SampleWindow(8);
    expect(window.size).toBe(0);
    expect(window.mean()).toBe(0);
    expect(window.percentile(0.95)).toBe(0);
    expect(window.max()).toBe(0);
  });

  it('gives the mean, the largest value and percentiles of what it holds', () => {
    const window = new SampleWindow(100);
    for (let i = 1; i <= 100; i++) window.push(i);
    expect(window.size).toBe(100);
    expect(window.mean()).toBeCloseTo(50.5);
    expect(window.max()).toBe(100);
    expect(window.percentile(0.5)).toBe(50);
    expect(window.percentile(0.95)).toBe(95);
    expect(window.percentile(1)).toBe(100);
    expect(window.percentile(0)).toBe(1);
  });

  it('keeps only the most recent samples', () => {
    const window = new SampleWindow(4);
    for (const value of [100, 100, 1, 2, 3, 4]) window.push(value);
    expect(window.size).toBe(4);
    expect(window.max()).toBe(4);
    expect(window.mean()).toBeCloseTo(2.5);
  });

  it('is not disturbed by the order samples arrive in', () => {
    const window = new SampleWindow(5);
    for (const value of [16, 40, 17, 16, 18]) window.push(value);
    expect(window.percentile(0.5)).toBe(17);
    expect(window.percentile(0.95)).toBe(40);
  });

  it('empties on clear', () => {
    const window = new SampleWindow(4);
    window.push(9);
    window.clear();
    expect(window.size).toBe(0);
    expect(window.max()).toBe(0);
  });
});

describe('timed', () => {
  it('returns what the function returns and records how long it took', () => {
    const result = timed('unit-test-work', () => 42);
    expect(result).toBe(42);
    const [latest] = recentMeasures(1);
    expect(latest.name).toBe('unit-test-work');
    expect(latest.duration).toBeGreaterThanOrEqual(0);
  });

  it('still records when the function throws, and rethrows', () => {
    expect(() =>
      timed('unit-test-failure', () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(recentMeasures(1)[0].name).toBe('unit-test-failure');
  });

  it('lists the most recent measures, newest first', () => {
    timed('unit-test-a', () => undefined);
    timed('unit-test-b', () => undefined);
    const names = recentMeasures(2).map((m) => m.name);
    expect(names).toEqual(['unit-test-b', 'unit-test-a']);
  });
});
