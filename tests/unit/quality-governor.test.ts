import { describe, expect, it } from 'vitest';
import { QualityGovernor, startingQuality } from '../../src/core/engine/QualityGovernor';
import type { RenderQuality } from '../../src/core/engine/QualityGovernor';

/** Feeds the governor a steady frame rate in half-second reports, as the engine does. */
function feed(governor: QualityGovernor, fps: number, seconds: number): RenderQuality[] {
  const changes: RenderQuality[] = [];
  for (let t = 0; t < seconds; t += 0.5) {
    const change = governor.sample(fps, 0.5);
    if (change) changes.push({ ...change });
  }
  return changes;
}

/**
 * A pretend machine: the frame rate it manages depends on how much is being drawn.
 * `budget` is the pixel ratio it can hold 60 fps at on the high tier.
 */
function machine(budget: number, refresh = 60) {
  return (q: RenderQuality): number => {
    const load = q.pixelRatio ** 2 * { low: 0.35, medium: 0.6, high: 1 }[q.tier];
    return Math.min(refresh, (refresh * budget ** 2) / load);
  };
}

/** Runs the governor against a pretend machine for a while; returns where it ended up. */
function run(governor: QualityGovernor, fpsFor: (q: RenderQuality) => number, seconds: number) {
  const visited: RenderQuality[] = [];
  for (let t = 0; t < seconds; t += 0.5) {
    const change = governor.sample(fpsFor(governor.current), 0.5);
    if (change) visited.push({ ...change });
  }
  return visited;
}

/**
 * Where the governor spends most of its time on a pretend machine. It is allowed to try a step
 * up now and then, so a single moment can catch it mid-attempt; the level it lives at cannot.
 */
function livesAt(
  governor: QualityGovernor,
  fpsFor: (q: RenderQuality) => number,
  seconds: number,
): string {
  const time = new Map<string, number>();
  for (let t = 0; t < seconds; t += 0.5) {
    const key = `${governor.current.tier}@${governor.current.pixelRatio}`;
    time.set(key, (time.get(key) ?? 0) + 0.5);
    governor.sample(fpsFor(governor.current), 0.5);
  }
  return [...time.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

describe('startingQuality', () => {
  it('uses the whole display up to the tier limit', () => {
    expect(startingQuality('high', 2)).toEqual({ tier: 'high', pixelRatio: 2 });
    expect(startingQuality('high', 3)).toEqual({ tier: 'high', pixelRatio: 2 });
    expect(startingQuality('medium', 2)).toEqual({ tier: 'medium', pixelRatio: 1.5 });
    expect(startingQuality('low', 2)).toEqual({ tier: 'low', pixelRatio: 1 });
    expect(startingQuality('high', 1)).toEqual({ tier: 'high', pixelRatio: 1 });
  });
});

describe('QualityGovernor: stepping down', () => {
  it('leaves a machine that keeps up alone', () => {
    const governor = new QualityGovernor(startingQuality('high', 2));
    expect(feed(governor, 60, 60)).toEqual([]);
    expect(governor.current).toEqual({ tier: 'high', pixelRatio: 2 });
  });

  it('ignores a brief dip', () => {
    const governor = new QualityGovernor(startingQuality('high', 2));
    feed(governor, 60, 5);
    expect(feed(governor, 30, 1.5)).toEqual([]);
    expect(feed(governor, 60, 5)).toEqual([]);
  });

  it('gives up resolution in small steps before it gives up detail', () => {
    const governor = new QualityGovernor(startingQuality('high', 2));
    // A machine far too slow for any of it, on which every step does help a little.
    const visited = run(governor, machine(0.6), 200).slice(0, 5);
    expect(visited.map((q) => `${q.tier}@${q.pixelRatio}`)).toEqual([
      'high@1.75',
      'high@1.5',
      'high@1.25',
      'high@1',
      'medium@1',
    ]);
  });

  it('settles at the first level the machine can hold', () => {
    const governor = new QualityGovernor(startingQuality('high', 2));
    expect(livesAt(governor, machine(1.5), 300)).toBe('high@1.5');
  });

  it('never goes below the lowest level', () => {
    const governor = new QualityGovernor(startingQuality('high', 1));
    run(governor, machine(0.2), 600);
    expect(governor.current).toEqual({ tier: 'low', pixelRatio: 0.75 });
  });

  it('waits out a pause, such as the stall while the hand model loads', () => {
    const governor = new QualityGovernor(startingQuality('high', 2));
    governor.pause(6);
    expect(feed(governor, 5, 5.5)).toEqual([]);
    expect(feed(governor, 60, 5)).toEqual([]);
    expect(governor.current.pixelRatio).toBe(2);
  });
});

describe('QualityGovernor: stepping back up', () => {
  it('returns to where it started once a temporary load has gone', () => {
    const governor = new QualityGovernor(startingQuality('high', 2));
    run(governor, machine(1.5), 10);
    expect(governor.current.pixelRatio).toBe(1.5);
    run(governor, machine(3), 120);
    expect(governor.current).toEqual({ tier: 'high', pixelRatio: 2 });
  });

  it('never climbs above where it started', () => {
    const governor = new QualityGovernor(startingQuality('medium', 2));
    run(governor, machine(5), 600);
    expect(governor.current).toEqual({ tier: 'medium', pixelRatio: 1.5 });
  });

  it('does not flap: a failed climb is retried less and less often', () => {
    const governor = new QualityGovernor(startingQuality('high', 2));
    const fps = machine(1.5);
    run(governor, fps, 10);
    // Ten minutes on a machine that can hold 1.5 but not 1.75.
    const visited = run(governor, fps, 600);
    const climbs = visited.filter((q) => q.pixelRatio === 1.75).length;
    expect(climbs).toBeGreaterThanOrEqual(1); // it does try
    expect(climbs).toBeLessThanOrEqual(5); // but not every few seconds
  });

  it('takes its time before the first climb', () => {
    const governor = new QualityGovernor(startingQuality('high', 2));
    run(governor, machine(1.5), 9);
    expect(governor.current.pixelRatio).toBe(1.5);
    expect(feed(governor, 60, 8)).toEqual([]);
  });
});

describe('QualityGovernor: a frame rate that is capped by something else', () => {
  it('stops lowering quality when lowering it does not help, and puts it back', () => {
    // A 30 Hz display, or a browser throttling the page: 30 fps whatever is drawn.
    const governor = new QualityGovernor(startingQuality('high', 2));
    run(governor, () => 30, 120);
    expect(governor.current).toEqual({ tier: 'high', pixelRatio: 2 });
  });

  it('starts adapting again when the frame rate moves', () => {
    const governor = new QualityGovernor(startingQuality('high', 2));
    run(governor, () => 30, 60);
    // The cap lifts, and now the machine really is a little too slow for full resolution.
    expect(livesAt(governor, machine(1.7), 300)).toBe('high@1.75');
  });
});

describe('QualityGovernor: remembering', () => {
  it('resumes from a remembered level and can still climb back', () => {
    const governor = new QualityGovernor(startingQuality('high', 2));
    governor.restore({ tier: 'high', pixelRatio: 1.25 });
    expect(governor.current).toEqual({ tier: 'high', pixelRatio: 1.25 });
    run(governor, machine(5), 300);
    expect(governor.current).toEqual({ tier: 'high', pixelRatio: 2 });
  });

  it('ignores a remembered level that this display could not have reached', () => {
    const governor = new QualityGovernor(startingQuality('medium', 1));
    governor.restore({ tier: 'high', pixelRatio: 2 });
    expect(governor.current).toEqual({ tier: 'medium', pixelRatio: 1 });
    governor.restore({ tier: 'low', pixelRatio: 0.9 });
    expect(governor.current).toEqual({ tier: 'medium', pixelRatio: 1 });
  });

  it('keeps its level but forgets its grudges when the scene changes', () => {
    const governor = new QualityGovernor(startingQuality('high', 2));
    const fps = machine(1.5);
    run(governor, fps, 400); // long enough to build up a long retry delay
    while (governor.current.pixelRatio !== 1.5) run(governor, fps, 0.5);
    governor.settle();
    expect(governor.current.pixelRatio).toBe(1.5);
    // A lighter scene: it climbs after the ordinary wait, not the long one.
    const visited = run(governor, machine(5), 20);
    expect(visited.length).toBeGreaterThanOrEqual(1);
  });
});
