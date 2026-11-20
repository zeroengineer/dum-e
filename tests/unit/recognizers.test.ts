import { describe, expect, it } from 'vitest';
import { measureHand } from '../../src/gestures/classifiers/fingers';
import {
  GestureRegistry,
  createDefaultRegistry,
} from '../../src/gestures/recognizers/GestureRegistry';
import {
  fistRecognizer,
  openPalmRecognizer,
  pinchRecognizer,
  pointRecognizer,
} from '../../src/gestures/recognizers/poses';
import { measureSwipe } from '../../src/gestures/recognizers/swipe';
import { twoHandRecognizer } from '../../src/gestures/recognizers/twoHand';
import type { HandRecognizer, MotionSample } from '../../src/gestures/recognizers/types';
import { makeHandFrame, makeTrackingFrame } from './helpers/hands';
import type { Pose } from './helpers/hands';

const RECOGNIZERS: Record<string, HandRecognizer> = {
  open: openPalmRecognizer,
  fist: fistRecognizer,
  pinch: pinchRecognizer,
  point: pointRecognizer,
};

const confidence = (recognizer: HandRecognizer, pose: Pose, extra = {}): number =>
  recognizer.evaluate(makeHandFrame({ pose, ...extra }), []).confidence;

describe('measureHand', () => {
  it('sees straight fingers on an open hand and folded fingers on a fist', () => {
    const open = measureHand(makeHandFrame({ pose: 'open' }));
    const fist = measureHand(makeHandFrame({ pose: 'fist' }));
    for (const e of open.extension) expect(e).toBeGreaterThan(0.95);
    for (const e of fist.extension) expect(e).toBeLessThan(0.05);
    expect(open.thumbExtension).toBeGreaterThan(0.9);
    expect(fist.thumbExtension).toBeLessThan(0.1);
    for (let i = 0; i < 4; i++) expect(fist.tipToPalm[i]).toBeLessThan(open.tipToPalm[i]);
  });

  it('measures a small thumb-to-index distance for a pinch', () => {
    expect(measureHand(makeHandFrame({ pose: 'pinch' })).pinchDistance).toBeLessThan(0.1);
    expect(measureHand(makeHandFrame({ pose: 'open' })).pinchDistance).toBeGreaterThan(0.6);
  });

  it('returns the same object for the same frame', () => {
    const hand = makeHandFrame({ pose: 'open' });
    expect(measureHand(hand)).toBe(measureHand(hand));
  });
});

describe('pose recognisers', () => {
  const poses: Pose[] = ['open', 'fist', 'pinch', 'point'];

  it.each(poses)('recognises %s and nothing else', (pose) => {
    for (const [name, recognizer] of Object.entries(RECOGNIZERS)) {
      const c = confidence(recognizer, pose);
      if (name === pose) expect(c).toBeGreaterThan(0.85);
      else expect(c).toBeLessThan(0.4);
    }
  });

  it('reports no pose for a relaxed, half-curled hand', () => {
    for (const recognizer of Object.values(RECOGNIZERS)) {
      expect(confidence(recognizer, 'relaxed')).toBeLessThan(recognizer.timing.enter);
    }
  });

  it.each(poses)('is unaffected by where %s is, how big it is or how it is turned', (pose) => {
    const recognizer = RECOGNIZERS[pose];
    const reference = confidence(recognizer, pose);
    const variants = [
      { x: 0.15, y: 0.2, size: 0.1 },
      { x: 0.85, y: 0.8, size: 0.34 },
      { roll: 1.2 },
      { roll: -2.4, size: 0.15 },
      { handedness: 'Left' as const, x: 0.3 },
    ];
    for (const variant of variants) {
      expect(confidence(recognizer, pose, variant)).toBeCloseTo(reference, 4);
    }
  });

  it('places a pinch between the fingertips and a point at the index tip', () => {
    const pinching = makeHandFrame({ pose: 'pinch', x: 0.4, y: 0.6 });
    const pinch = pinchRecognizer.evaluate(pinching, []);
    expect(pinch.x).toBeCloseTo(pinching.pinchPoint.x, 8);
    expect(pinch.y).toBeCloseTo(pinching.pinchPoint.y, 8);

    const pointing = makeHandFrame({ pose: 'point', x: 0.4, y: 0.6 });
    const point = pointRecognizer.evaluate(pointing, []);
    expect(point.x).toBeCloseTo(pointing.indexTip.x, 8);
    // The fingertip is above the palm centre on screen.
    expect(point.y ?? 1).toBeLessThan(0.6);
  });

  it('puts the four poses in one exclusivity group', () => {
    const groups = new Set(Object.values(RECOGNIZERS).map((r) => r.group));
    expect(groups.size).toBe(1);
  });
});

describe('measureSwipe', () => {
  /** A straight move from (x0, y0) by (dx, dy) over `ms`, sampled every 40 ms. */
  const path = (dx: number, dy: number, ms: number, x0 = 0.5, y0 = 0.5): MotionSample[] => {
    const samples: MotionSample[] = [];
    for (let t = 0; t <= ms; t += 40) {
      samples.push({ t, x: x0 + (dx * t) / ms, y: y0 + (dy * t) / ms });
    }
    return samples;
  };

  it.each([
    ['right', 0.35, 0],
    ['left', -0.35, 0],
    ['down', 0, 0.35],
    ['up', 0, -0.35],
  ] as const)('detects a fast swipe %s', (direction, dx, dy) => {
    const swipe = measureSwipe(path(dx, dy, 240));
    expect(swipe.confidence).toBeGreaterThan(0.9);
    expect(swipe.direction).toBe(direction);
  });

  it('ignores slow movement', () => {
    expect(measureSwipe(path(0.35, 0, 1200)).confidence).toBeLessThan(0.2);
  });

  it('ignores a short twitch', () => {
    expect(measureSwipe(path(0.06, 0, 120)).confidence).toBeLessThan(0.1);
  });

  it('ignores diagonal movement', () => {
    expect(measureSwipe(path(0.3, 0.28, 240)).confidence).toBeLessThan(0.1);
  });

  it('ignores a hand that has already turned back', () => {
    const samples = path(0.35, 0, 240);
    samples.push({ t: 280, x: samples[samples.length - 1].x - 0.05, y: 0.5 });
    expect(measureSwipe(samples).confidence).toBe(0);
  });

  it('needs a few samples', () => {
    expect(measureSwipe([]).confidence).toBe(0);
    expect(measureSwipe(path(0.4, 0, 40)).confidence).toBe(0);
  });
});

describe('twoHandRecognizer', () => {
  const pair = (leftX: number, rightX: number, score = 0.95) => {
    const frame = makeTrackingFrame(0, [
      { pose: 'open', x: leftX, handedness: 'Left', score },
      { pose: 'open', x: rightX, handedness: 'Right', score },
    ]);
    return twoHandRecognizer.evaluate(frame.hands[0], frame.hands[1], frame.aspect);
  };

  it('reports the distance between the palms in image heights', () => {
    const result = pair(0.3, 0.7);
    expect(result.confidence).toBeGreaterThan(0.9);
    expect(result.distance).toBeCloseTo(0.4 * (4 / 3), 4);
    expect(result.x).toBeCloseTo(0.5, 5);
  });

  it('has no confidence when the hands overlap or are poorly tracked', () => {
    expect(pair(0.48, 0.52).confidence).toBe(0);
    expect(pair(0.3, 0.7, 0.3).confidence).toBe(0);
  });
});

describe('GestureRegistry', () => {
  it('ships the six built-in gestures', () => {
    const registry = createDefaultRegistry();
    expect(registry.ids.sort()).toEqual(
      ['fist', 'open_palm', 'pinch', 'point', 'swipe', 'two_hand'].sort(),
    );
    expect(registry.handRecognizers).toHaveLength(5);
    expect(registry.twoHandRecognizers).toHaveLength(1);
  });

  it('accepts and removes custom recognisers', () => {
    const registry = new GestureRegistry();
    const custom: HandRecognizer = {
      id: 'thumbs_up',
      scope: 'hand',
      kind: 'continuous',
      timing: { enter: 0.7, exit: 0.4, holdMs: 0, releaseMs: 0, cooldownMs: 0 },
      evaluate: () => ({ confidence: 1 }),
    };
    registry.register(custom);
    expect(registry.has('thumbs_up')).toBe(true);
    expect(registry.handRecognizers).toEqual([custom]);
    expect(registry.unregister('thumbs_up')).toBe(true);
    expect(registry.unregister('thumbs_up')).toBe(false);
    expect(registry.handRecognizers).toEqual([]);
  });
});
