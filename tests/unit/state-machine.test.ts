import { describe, expect, it } from 'vitest';
import { GestureStateMachine, adjustTiming } from '../../src/gestures/GestureStateMachine';
import type { GestureTiming } from '../../src/gestures/recognizers/types';

const timing: GestureTiming = {
  enter: 0.7,
  exit: 0.4,
  holdMs: 100,
  releaseMs: 150,
  cooldownMs: 300,
};

describe('GestureStateMachine', () => {
  it('waits for the hold time before starting', () => {
    const m = new GestureStateMachine(timing);
    expect(m.update(0.9, 0)).toBeNull();
    expect(m.update(0.9, 50)).toBeNull();
    expect(m.active).toBe(false);
    expect(m.update(0.9, 100)).toBe('start');
    expect(m.active).toBe(true);
    expect(m.update(0.9, 140)).toBe('update');
  });

  it('ignores a blip shorter than the hold time', () => {
    const m = new GestureStateMachine(timing);
    expect(m.update(0.9, 0)).toBeNull();
    expect(m.update(0.2, 40)).toBeNull();
    // The clock restarts: 100 ms after the dip is still too early.
    expect(m.update(0.9, 80)).toBeNull();
    expect(m.update(0.9, 140)).toBeNull();
    expect(m.update(0.9, 180)).toBe('start');
  });

  it('stays active between the exit and enter thresholds (hysteresis)', () => {
    const m = new GestureStateMachine(timing);
    m.update(0.9, 0);
    m.update(0.9, 100);
    expect(m.update(0.5, 200)).toBe('update');
    expect(m.update(0.45, 900)).toBe('update');
    expect(m.active).toBe(true);
  });

  it('does not start between the exit and enter thresholds', () => {
    const m = new GestureStateMachine(timing);
    for (let t = 0; t < 1000; t += 40) expect(m.update(0.6, t)).toBeNull();
  });

  it('ends only after confidence stays low for the release time', () => {
    const m = new GestureStateMachine(timing);
    m.update(0.9, 0);
    m.update(0.9, 100);
    expect(m.update(0.1, 200)).toBe('update');
    expect(m.update(0.1, 300)).toBe('update');
    expect(m.update(0.1, 350)).toBe('end');
    expect(m.active).toBe(false);
  });

  it('survives a short dropout without ending', () => {
    const m = new GestureStateMachine(timing);
    m.update(0.9, 0);
    m.update(0.9, 100);
    expect(m.update(0.1, 200)).toBe('update');
    expect(m.update(0.9, 280)).toBe('update');
    // The release timer was cleared by the recovery.
    expect(m.update(0.1, 400)).toBe('update');
    expect(m.update(0.1, 500)).toBe('update');
    expect(m.update(0.1, 550)).toBe('end');
  });

  it('enforces the cooldown after ending', () => {
    const m = new GestureStateMachine(timing);
    m.update(0.9, 0);
    m.update(0.9, 100);
    m.update(0, 200);
    expect(m.update(0, 350)).toBe('end');
    expect(m.update(0.95, 400)).toBeNull();
    expect(m.update(0.95, 600)).toBeNull();
    // Cooldown ends at 650; the hold time is then counted from the first eligible sample.
    expect(m.update(0.95, 660)).toBeNull();
    expect(m.update(0.95, 760)).toBe('start');
  });

  it('fires a discrete gesture once and then cools down', () => {
    const m = new GestureStateMachine({ ...timing, holdMs: 0, cooldownMs: 500 }, 'discrete');
    expect(m.update(0.9, 0)).toBe('fire');
    expect(m.active).toBe(false);
    expect(m.update(0.9, 40)).toBeNull();
    expect(m.update(0.9, 480)).toBeNull();
    expect(m.update(0.9, 520)).toBe('fire');
  });

  it('can be ended from outside', () => {
    const m = new GestureStateMachine(timing);
    expect(m.forceEnd(0)).toBe(false);
    m.update(0.9, 0);
    m.update(0.9, 100);
    expect(m.forceEnd(150)).toBe(true);
    expect(m.active).toBe(false);
    expect(m.forceEnd(160)).toBe(false);
  });
});

describe('adjustTiming', () => {
  it('leaves timing unchanged at the default sensitivity', () => {
    const adjusted = adjustTiming(timing, 0.5);
    expect(adjusted.enter).toBeCloseTo(timing.enter);
    expect(adjusted.exit).toBeCloseTo(timing.exit);
    expect(adjusted.holdMs).toBeCloseTo(timing.holdMs);
  });

  it('makes gestures easier and quicker to trigger at high sensitivity', () => {
    const eager = adjustTiming(timing, 1);
    const strict = adjustTiming(timing, 0);
    expect(eager.enter).toBeLessThan(timing.enter);
    expect(eager.holdMs).toBeLessThan(timing.holdMs);
    expect(strict.enter).toBeGreaterThan(timing.enter);
    expect(strict.holdMs).toBeGreaterThan(timing.holdMs);
  });

  it('always keeps exit below enter', () => {
    for (const s of [0, 0.25, 0.5, 0.75, 1, Number.NaN, 7]) {
      const t = adjustTiming({ ...timing, enter: 0.5, exit: 0.45 }, s);
      expect(t.exit).toBeLessThan(t.enter);
    }
  });
});
