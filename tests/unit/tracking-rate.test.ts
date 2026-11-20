import { describe, expect, it } from 'vitest';
import { toRawHands } from '../../src/vision/mediapipe/HandDetector';
import { RateLimiter, RateMeter } from '../../src/vision/tracking/RateLimiter';

/** Feeds the limiter ticks from a source running at `sourceHz` for `seconds`; returns how many ran. */
function runs(limiter: RateLimiter, sourceHz: number, seconds: number): number {
  let count = 0;
  const step = 1000 / sourceHz;
  for (let t = 0; t < seconds * 1000; t += step) if (limiter.shouldRun(t)) count++;
  return count;
}

describe('RateLimiter', () => {
  it('averages the requested rate from a faster source', () => {
    expect(runs(new RateLimiter(24), 30, 10) / 10).toBeCloseTo(24, 0);
    expect(runs(new RateLimiter(10), 30, 10) / 10).toBeCloseTo(10, 0);
    expect(runs(new RateLimiter(15), 60, 10) / 10).toBeCloseTo(15, 0);
  });

  it('never exceeds the source rate', () => {
    expect(runs(new RateLimiter(30), 20, 10) / 10).toBeLessThanOrEqual(20);
  });

  it('does not burst after a long pause', () => {
    const limiter = new RateLimiter(20);
    expect(limiter.shouldRun(0)).toBe(true);
    expect(limiter.shouldRun(5000)).toBe(true);
    expect(limiter.shouldRun(5001)).toBe(false);
    expect(limiter.shouldRun(5010)).toBe(false);
    expect(limiter.shouldRun(5051)).toBe(true);
  });

  it('applies a new rate', () => {
    const limiter = new RateLimiter(10);
    limiter.setRate(30);
    expect(limiter.rate).toBeCloseTo(30);
    expect(runs(limiter, 60, 5) / 5).toBeCloseTo(30, 0);
  });

  it('falls back to a sane rate for bad input', () => {
    expect(new RateLimiter(Number.NaN).rate).toBe(24);
    expect(new RateLimiter(0).rate).toBe(1);
    expect(new RateLimiter(1000).rate).toBe(60);
  });
});

describe('RateMeter', () => {
  it('reports events per second once per window', () => {
    const meter = new RateMeter(1000);
    const reported: number[] = [];
    for (let t = 0; t <= 3000; t += 50) {
      const rate = meter.tick(t);
      if (rate !== null) reported.push(rate);
    }
    expect(reported).toHaveLength(3);
    for (const rate of reported) expect(rate).toBeCloseTo(20, 5);
  });
});

describe('toRawHands', () => {
  const points = Array.from({ length: 21 }, (_, i) => ({ x: i / 21, y: 0.5, z: 0, visibility: 1 }));
  const category = (categoryName: string, score: number) => [
    { categoryName, score, index: 0, displayName: categoryName },
  ];

  it('converts a MediaPipe result', () => {
    const hands = toRawHands({
      landmarks: [points, points],
      worldLandmarks: [points, points],
      handedness: [category('Left', 0.9), category('Right', 0.8)],
      handednesses: [],
    });
    expect(hands).toHaveLength(2);
    expect(hands[0].handedness).toBe('Left');
    expect(hands[0].score).toBe(0.9);
    expect(hands[1].handedness).toBe('Right');
    expect(hands[0].landmarks).toHaveLength(21);
    expect(hands[0].worldLandmarks).toHaveLength(21);
  });

  it('drops incomplete hands and tolerates an empty result', () => {
    expect(
      toRawHands({
        landmarks: [points.slice(0, 5)],
        worldLandmarks: [],
        handedness: [],
        handednesses: [],
      }),
    ).toEqual([]);
    expect(
      toRawHands({ landmarks: [], worldLandmarks: [], handedness: [], handednesses: [] }),
    ).toEqual([]);
  });
});
