import { describe, expect, it } from 'vitest';
import { OneEuroFilter } from '../../src/gestures/smoothing/OneEuroFilter';
import { LandmarkProcessor } from '../../src/vision/landmarks/LandmarkProcessor';
import { LM } from '../../src/vision/landmarks/types';
import { createRng } from '../../src/utils/rng';
import { makeHandFrame, makeRawFrame, makeRawHand } from './helpers/hands';

const variance = (values: number[]): number => {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
};

describe('OneEuroFilter', () => {
  it('passes a constant signal through unchanged', () => {
    const filter = new OneEuroFilter();
    for (let i = 0; i < 20; i++) expect(filter.filter(0.4, i / 24)).toBeCloseTo(0.4, 10);
  });

  it('removes most of the jitter from a still signal', () => {
    const rng = createRng(3);
    const filter = new OneEuroFilter();
    const input: number[] = [];
    const output: number[] = [];
    for (let i = 0; i < 240; i++) {
      const noisy = 0.5 + (rng() - 0.5) * 0.01;
      input.push(noisy);
      output.push(filter.filter(noisy, i / 24));
    }
    expect(variance(output.slice(24))).toBeLessThan(variance(input.slice(24)) * 0.35);
  });

  it('keeps up with fast movement', () => {
    const filter = new OneEuroFilter();
    let output = 0;
    // 1.5 screen widths per second for a third of a second.
    for (let i = 0; i <= 8; i++) output = filter.filter((i / 24) * 1.5, i / 24);
    expect(0.5 - output).toBeLessThan(0.06);
  });

  it('starts afresh after reset', () => {
    const filter = new OneEuroFilter();
    filter.filter(0.1, 0);
    filter.filter(0.1, 0.04);
    filter.reset();
    expect(filter.filter(0.9, 0.08)).toBe(0.9);
  });

  it('ignores samples that do not advance time', () => {
    const filter = new OneEuroFilter();
    filter.filter(0.2, 1);
    expect(filter.filter(0.8, 1)).toBe(0.2);
  });
});

describe('LandmarkProcessor', () => {
  it('mirrors the image so the hand appears where the user sees it', () => {
    const raw = makeRawFrame(0, [{ pose: 'open', x: 0.3, y: 0.4 }]);
    expect(raw.hands[0].landmarks[LM.WRIST].x).toBeGreaterThan(0.5);
    const mirrored = new LandmarkProcessor().process(raw).hands[0];
    expect(mirrored.palm.x).toBeCloseTo(0.3, 5);
    expect(mirrored.palm.y).toBeCloseTo(0.4, 5);
    const plain = new LandmarkProcessor({ mirror: false }).process(raw).hands[0];
    expect(plain.palm.x).toBeCloseTo(0.7, 5);
  });

  it('measures apparent size and roll', () => {
    expect(makeHandFrame({ pose: 'open', size: 0.24 }).size).toBeCloseTo(0.24, 5);
    expect(makeHandFrame({ pose: 'open', roll: 0 }).roll).toBeCloseTo(0, 5);
    expect(makeHandFrame({ pose: 'open', roll: 0.7 }).roll).toBeCloseTo(0.7, 5);
    expect(makeHandFrame({ pose: 'fist', roll: -1.1 }).roll).toBeCloseTo(-1.1, 5);
  });

  it('produces local coordinates that ignore position, size and distance', () => {
    const a = makeHandFrame({ pose: 'pinch', x: 0.2, y: 0.3, size: 0.12 });
    const b = makeHandFrame({ pose: 'pinch', x: 0.8, y: 0.7, size: 0.3 });
    expect(a.local[LM.WRIST]).toEqual({ x: 0, y: 0, z: 0 });
    const knuckle = a.local[LM.MIDDLE_MCP];
    expect(Math.hypot(knuckle.x, knuckle.y, knuckle.z)).toBeCloseTo(1, 6);
    for (let i = 0; i < 21; i++) {
      expect(a.local[i].x).toBeCloseTo(b.local[i].x, 5);
      expect(a.local[i].y).toBeCloseTo(b.local[i].y, 5);
      expect(a.local[i].z).toBeCloseTo(b.local[i].z, 5);
    }
  });

  it('reports the pinch point between thumb and index tips', () => {
    const hand = makeHandFrame({ pose: 'pinch', x: 0.5, y: 0.5 });
    const thumb = hand.landmarks[LM.THUMB_TIP];
    const index = hand.landmarks[LM.INDEX_TIP];
    expect(hand.pinchPoint.x).toBeCloseTo((thumb.x + index.x) / 2, 8);
    expect(hand.indexTip).toEqual({ x: index.x, y: index.y });
  });

  it('gives two hands with the same label separate slots, ordered left then right', () => {
    const frame = new LandmarkProcessor().process(
      makeRawFrame(0, [
        { pose: 'open', x: 0.7, handedness: 'Right', score: 0.9 },
        { pose: 'open', x: 0.3, handedness: 'Right', score: 0.6 },
      ]),
    );
    expect(frame.hands.map((h) => h.id)).toEqual(['Left', 'Right']);
    expect(frame.hands[1].palm.x).toBeCloseTo(0.7, 5);
  });

  it('keeps a hand in its slot when the detector flips its label', () => {
    const processor = new LandmarkProcessor();
    processor.process(makeRawFrame(0, [{ pose: 'open', x: 0.6, handedness: 'Right' }]));
    const flipped = processor.process(
      makeRawFrame(40, [{ pose: 'open', x: 0.61, handedness: 'Left' }]),
    );
    expect(flipped.hands).toHaveLength(1);
    expect(flipped.hands[0].id).toBe('Right');
  });

  it('applies the handedness swap when configured', () => {
    const frame = new LandmarkProcessor({ swapHandedness: true }).process(
      makeRawFrame(0, [{ pose: 'open', handedness: 'Left' }]),
    );
    expect(frame.hands[0].id).toBe('Right');
  });

  it('smooths jitter while a hand holds still', () => {
    const rng = createRng(11);
    const processor = new LandmarkProcessor();
    const raw: number[] = [];
    const smooth: number[] = [];
    for (let i = 0; i < 120; i++) {
      const x = 0.5 + (rng() - 0.5) * 0.012;
      raw.push(x);
      const frame = processor.process(makeRawFrame(i * 40, [{ pose: 'open', x }]));
      smooth.push(frame.hands[0].palm.x);
    }
    expect(variance(smooth.slice(20))).toBeLessThan(variance(raw.slice(20)) * 0.4);
  });

  it('estimates palm velocity', () => {
    const processor = new LandmarkProcessor();
    let hand = processor.process(makeRawFrame(0, [{ pose: 'open', x: 0.3 }])).hands[0];
    expect(hand.velocity).toEqual({ x: 0, y: 0 });
    for (let i = 1; i <= 10; i++) {
      hand = processor.process(makeRawFrame(i * 40, [{ pose: 'open', x: 0.3 + i * 0.02 }]))
        .hands[0];
    }
    // 0.02 of the width every 40 ms is 0.5 widths per second, about 0.67 image heights.
    expect(hand.velocity.x).toBeGreaterThan(0.4);
    expect(Math.abs(hand.velocity.y)).toBeLessThan(0.05);
  });

  it('forgets a hand that has been gone too long', () => {
    const processor = new LandmarkProcessor({ staleMs: 300 });
    processor.process(makeRawFrame(0, [{ pose: 'open', x: 0.2 }]));
    processor.process(makeRawFrame(40, [{ pose: 'open', x: 0.2 }]));
    const back = processor.process(makeRawFrame(1000, [{ pose: 'open', x: 0.8 }])).hands[0];
    // No smoothing against the old position and no bogus velocity from the jump.
    expect(back.palm.x).toBeCloseTo(0.8, 6);
    expect(back.velocity).toEqual({ x: 0, y: 0 });
  });

  it('ignores a third hand', () => {
    const frame = makeRawFrame(0, [
      { pose: 'open', x: 0.2, handedness: 'Left' },
      { pose: 'open', x: 0.5, handedness: 'Right' },
    ]);
    frame.hands.push(makeRawHand({ pose: 'fist', x: 0.8 }));
    expect(new LandmarkProcessor().process(frame).hands).toHaveLength(2);
  });
});
