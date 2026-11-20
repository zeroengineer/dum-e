import { describe, expect, it } from 'vitest';
import { GESTURES } from '../../src/gestures/events/types';
import type { GestureEvent } from '../../src/gestures/events/types';
import { GestureEngine } from '../../src/gestures/GestureEngine';
import type { GestureEngineOptions } from '../../src/gestures/GestureEngine';
import {
  GestureRegistry,
  createDefaultRegistry,
} from '../../src/gestures/recognizers/GestureRegistry';
import type { HandRecognizer } from '../../src/gestures/recognizers/types';
import { LandmarkProcessor } from '../../src/vision/landmarks/LandmarkProcessor';
import { makeRawFrame } from './helpers/hands';
import type { HandSpec } from './helpers/hands';

const STEP = 40; // 25 Hz

/** Drives the real processor and engine with synthetic hands and records what comes out. */
function createRig(
  options: Partial<GestureEngineOptions> = {},
  registry = createDefaultRegistry(),
) {
  const events: GestureEvent[] = [];
  const processor = new LandmarkProcessor();
  const engine = new GestureEngine(registry, (event) => events.push(event), options);
  let time = 0;
  return {
    events,
    engine,
    get time() {
      return time;
    },
    /** Feeds `frames` frames; `hands` may depend on progress 0..1 through the run. */
    run(frames: number, hands: HandSpec[] | ((progress: number) => HandSpec[])) {
      for (let i = 0; i < frames; i++) {
        const specs =
          typeof hands === 'function' ? hands(frames > 1 ? i / (frames - 1) : 1) : hands;
        engine.process(processor.process(makeRawFrame(time, specs)));
        time += STEP;
      }
    },
    of(gesture: string, phase?: GestureEvent['phase']) {
      return events.filter((e) => e.gesture === gesture && (!phase || e.phase === phase));
    },
    clear() {
      events.length = 0;
    },
  };
}

describe('GestureEngine: hand presence', () => {
  it('announces a hand, follows it and reports when it leaves', () => {
    const rig = createRig();
    rig.run(5, (p) => [{ pose: 'relaxed', x: 0.4 + p * 0.1 }]);
    expect(rig.of(GESTURES.HAND, 'start')).toHaveLength(1);
    expect(rig.of(GESTURES.HAND, 'update')).toHaveLength(4);
    const updates = rig.of(GESTURES.HAND, 'update');
    expect(updates[updates.length - 1].dx).toBeGreaterThan(0);
    expect(updates[0].hand).toBe('Right');

    rig.run(12, []);
    expect(rig.of(GESTURES.HAND, 'end')).toHaveLength(1);
  });

  it('reports no pose for a relaxed hand', () => {
    const rig = createRig();
    rig.run(20, [{ pose: 'relaxed' }]);
    const poses = rig.events.filter((e) => e.gesture !== GESTURES.HAND);
    expect(poses).toEqual([]);
  });
});

describe('GestureEngine: poses', () => {
  it.each([
    ['open', GESTURES.OPEN_PALM],
    ['fist', GESTURES.FIST],
    ['pinch', GESTURES.PINCH],
    ['point', GESTURES.POINT],
  ] as const)('reports %s as start, updates, end', (pose, gesture) => {
    const rig = createRig();
    rig.run(12, [{ pose }]);
    rig.run(12, [{ pose: 'relaxed' }]);
    expect(rig.of(gesture, 'start')).toHaveLength(1);
    expect(rig.of(gesture, 'update').length).toBeGreaterThan(5);
    expect(rig.of(gesture, 'end')).toHaveLength(1);
    const others = rig.events.filter((e) => e.gesture !== gesture && e.gesture !== GESTURES.HAND);
    expect(others).toEqual([]);
  });

  it('never has two poses active on one hand, and ends one before starting the next', () => {
    const rig = createRig();
    const sequence = ['open', 'fist', 'pinch', 'point', 'open', 'pinch', 'fist'] as const;
    for (const pose of sequence) rig.run(10, [{ pose }]);

    const active = new Set<string>();
    for (const event of rig.events) {
      if (event.gesture === GESTURES.HAND) continue;
      if (event.phase === 'start') {
        expect(active.size).toBe(0);
        active.add(event.gesture);
      } else if (event.phase === 'end') {
        expect(active.has(event.gesture)).toBe(true);
        active.delete(event.gesture);
      } else {
        expect(active.has(event.gesture)).toBe(true);
      }
    }
    const started = rig.events.filter((e) => e.phase === 'start' && e.gesture !== GESTURES.HAND);
    expect(started.map((e) => e.gesture)).toEqual([
      GESTURES.OPEN_PALM,
      GESTURES.FIST,
      GESTURES.PINCH,
      GESTURES.POINT,
      GESTURES.OPEN_PALM,
      GESTURES.PINCH,
      GESTURES.FIST,
    ]);
  });

  it('does not fire on a pose held for a single frame', () => {
    const rig = createRig();
    rig.run(6, [{ pose: 'relaxed' }]);
    rig.run(1, [{ pose: 'fist' }]);
    rig.run(6, [{ pose: 'relaxed' }]);
    expect(rig.of(GESTURES.FIST)).toEqual([]);
  });

  it('carries movement and wrist roll on a pinch', () => {
    const rig = createRig();
    rig.run(8, [{ pose: 'pinch', x: 0.3, y: 0.5 }]);
    rig.clear();
    rig.run(10, (p) => [{ pose: 'pinch', x: 0.3 + p * 0.3, y: 0.5, roll: p * 0.8 }]);
    const updates = rig.of(GESTURES.PINCH, 'update');
    const dx = updates.reduce((sum, e) => sum + e.dx, 0);
    const dRoll = updates.reduce((sum, e) => sum + e.dRoll, 0);
    expect(dx).toBeGreaterThan(0.2);
    // The pinch point also swings a little as the wrist turns.
    expect(dx).toBeLessThan(0.42);
    expect(dRoll).toBeGreaterThan(0.5);
    expect(dRoll).toBeLessThan(0.9);
    expect(updates.every((e) => e.source === 'camera' && e.hand === 'Right')).toBe(true);
  });

  it('tracks each hand separately', () => {
    const rig = createRig();
    rig.run(12, [
      { pose: 'fist', x: 0.25, handedness: 'Left' },
      { pose: 'open', x: 0.75, handedness: 'Right' },
    ]);
    expect(rig.of(GESTURES.FIST, 'start').map((e) => e.hand)).toEqual(['Left']);
    expect(rig.of(GESTURES.OPEN_PALM, 'start').map((e) => e.hand)).toEqual(['Right']);
    expect(rig.engine.activeGestures('Left')).toEqual([GESTURES.FIST]);
    expect(rig.engine.activeGestures('Right')).toEqual([GESTURES.OPEN_PALM]);
  });
});

describe('GestureEngine: tracking loss', () => {
  it('holds a gesture through a brief dropout', () => {
    const rig = createRig({ graceMs: 300 });
    rig.run(10, [{ pose: 'pinch' }]);
    rig.run(5, []); // 200 ms without the hand
    rig.run(5, [{ pose: 'pinch' }]);
    expect(rig.of(GESTURES.PINCH, 'start')).toHaveLength(1);
    expect(rig.of(GESTURES.PINCH, 'end')).toHaveLength(0);
    expect(rig.of(GESTURES.HAND, 'end')).toHaveLength(0);
  });

  it('ends gestures, then the hand, once the dropout outlasts the grace window', () => {
    const rig = createRig({ graceMs: 300 });
    rig.run(10, [{ pose: 'pinch' }]);
    rig.clear();
    rig.run(12, []);
    expect(rig.events.map((e) => `${e.gesture}:${e.phase}`)).toEqual(['pinch:end', 'hand:end']);
    expect(rig.engine.activeGestures('Right')).toEqual([]);
  });

  it('ends everything on reset', () => {
    const rig = createRig();
    rig.run(10, [
      { pose: 'fist', x: 0.25, handedness: 'Left' },
      { pose: 'open', x: 0.75, handedness: 'Right' },
    ]);
    rig.clear();
    rig.engine.reset();
    const ended = rig.events.filter((e) => e.phase === 'end').map((e) => `${e.gesture}:${e.hand}`);
    expect(ended.sort()).toEqual(
      ['two_hand:Both', 'fist:Left', 'hand:Left', 'open_palm:Right', 'hand:Right'].sort(),
    );
    rig.clear();
    rig.engine.reset();
    expect(rig.events).toEqual([]);
  });
});

describe('GestureEngine: swipe', () => {
  const swipeRight = (rig: ReturnType<typeof createRig>) =>
    rig.run(7, (p) => [{ pose: 'open', x: 0.3 + p * 0.4 }]);

  it('fires once for one swipe, as a start immediately followed by an end', () => {
    const rig = createRig();
    rig.run(12, [{ pose: 'open', x: 0.3 }]);
    swipeRight(rig);
    rig.run(8, [{ pose: 'open', x: 0.7 }]);
    const swipes = rig.of(GESTURES.SWIPE);
    expect(swipes.map((e) => e.phase)).toEqual(['start', 'end']);
    expect(swipes[0].direction).toBe('right');
    expect(swipes[0].timestamp).toBe(swipes[1].timestamp);
  });

  it('does not fire again on the return stroke', () => {
    const rig = createRig();
    rig.run(12, [{ pose: 'open', x: 0.3 }]);
    swipeRight(rig);
    rig.run(7, (p) => [{ pose: 'open', x: 0.7 - p * 0.4 }]);
    expect(rig.of(GESTURES.SWIPE, 'start')).toHaveLength(1);
  });

  it('fires again after the cooldown', () => {
    const rig = createRig();
    rig.run(12, [{ pose: 'open', x: 0.3 }]);
    swipeRight(rig);
    rig.run(25, [{ pose: 'open', x: 0.7 }]);
    rig.run(7, (p) => [{ pose: 'open', x: 0.7 - p * 0.4 }]);
    expect(rig.of(GESTURES.SWIPE, 'start').map((e) => e.direction)).toEqual(['right', 'left']);
  });

  it('is not triggered by a hand entering the frame', () => {
    const rig = createRig();
    rig.run(7, (p) => [{ pose: 'open', x: 0.05 + p * 0.45 }]);
    expect(rig.of(GESTURES.SWIPE)).toEqual([]);
  });

  it('is suppressed while the hand is pinching', () => {
    const rig = createRig();
    rig.run(12, [{ pose: 'pinch', x: 0.3 }]);
    rig.run(7, (p) => [{ pose: 'pinch', x: 0.3 + p * 0.4 }]);
    expect(rig.of(GESTURES.SWIPE)).toEqual([]);
    expect(rig.of(GESTURES.PINCH, 'end')).toEqual([]);
  });
});

describe('GestureEngine: two hands', () => {
  const pair = (gap: number): HandSpec[] => [
    { pose: 'open', x: 0.5 - gap / 2, handedness: 'Left' },
    { pose: 'open', x: 0.5 + gap / 2, handedness: 'Right' },
  ];

  it('reports the hands moving apart as a growing scale', () => {
    const rig = createRig();
    rig.run(10, pair(0.3));
    rig.run(12, (p) => pair(0.3 + p * 0.3));
    rig.run(6, pair(0.6));
    expect(rig.of(GESTURES.TWO_HAND, 'start')).toHaveLength(1);
    const updates = rig.of(GESTURES.TWO_HAND, 'update');
    const last = updates[updates.length - 1];
    expect(last.hand).toBe('Both');
    expect(last.scale).toBeGreaterThan(1.8);
    expect(last.scale).toBeLessThan(2.1);
    // The per-event ratios multiply up to the overall scale.
    const product = updates.reduce((acc, e) => acc * e.dScale, 1);
    expect(product).toBeCloseTo(last.scale, 5);
  });

  it('reports the hands moving together as a shrinking scale', () => {
    const rig = createRig();
    rig.run(10, pair(0.6));
    rig.run(12, (p) => pair(0.6 - p * 0.3));
    rig.run(6, pair(0.3));
    const updates = rig.of(GESTURES.TWO_HAND, 'update');
    expect(updates[updates.length - 1].scale).toBeLessThan(0.56);
    expect(updates[updates.length - 1].scale).toBeGreaterThan(0.45);
  });

  it('ignores jitter while both hands hold still', () => {
    const rig = createRig();
    rig.run(10, pair(0.4));
    rig.clear();
    let flip = 1;
    rig.run(30, () => pair(0.4 + (flip = -flip) * 0.001));
    const updates = rig.of(GESTURES.TWO_HAND, 'update');
    expect(updates.length).toBeGreaterThan(20);
    expect(updates.every((e) => e.dScale === 1)).toBe(true);
  });

  it('ends when one hand leaves for longer than the grace window', () => {
    const rig = createRig({ graceMs: 300 });
    rig.run(10, pair(0.4));
    rig.run(12, [pair(0.4)[1]]);
    expect(rig.of(GESTURES.TWO_HAND, 'end')).toHaveLength(1);
    expect(rig.of(GESTURES.HAND, 'end').map((e) => e.hand)).toEqual(['Left']);
  });
});

describe('GestureEngine: configuration', () => {
  it('starts gestures sooner at high sensitivity', () => {
    const framesToStart = (sensitivity: number): number => {
      const rig = createRig({ sensitivity });
      rig.run(6, [{ pose: 'relaxed' }]);
      rig.clear();
      for (let i = 1; i <= 20; i++) {
        rig.run(1, [{ pose: 'fist' }]);
        if (rig.of(GESTURES.FIST, 'start').length > 0) return i;
      }
      return Infinity;
    };
    expect(framesToStart(1)).toBeLessThan(framesToStart(0));
  });

  it('runs custom recognisers without any engine changes', () => {
    const always: HandRecognizer = {
      id: 'always',
      scope: 'hand',
      kind: 'continuous',
      timing: { enter: 0.5, exit: 0.3, holdMs: 0, releaseMs: 0, cooldownMs: 0 },
      evaluate: (hand) => ({ confidence: hand.palm.x > 0.5 ? 1 : 0 }),
    };
    const rig = createRig({}, new GestureRegistry().register(always));
    rig.run(3, [{ pose: 'relaxed', x: 0.3 }]);
    rig.run(3, [{ pose: 'relaxed', x: 0.7 }]);
    rig.run(3, [{ pose: 'relaxed', x: 0.3 }]);
    expect(rig.of('always').map((e) => e.phase)).toEqual(['start', 'update', 'update', 'end']);
  });
});
