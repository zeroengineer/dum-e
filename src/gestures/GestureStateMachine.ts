import { clamp } from '../utils/math';
import type { GestureTiming } from './recognizers/types';

/**
 * - `start`, `update`, `end`: a continuous gesture began, is continuing, or finished.
 * - `fire`: a discrete gesture happened (the caller reports it as a start followed by an end).
 * - `null`: nothing to report.
 */
export type GestureTransition = 'start' | 'update' | 'end' | 'fire' | null;

type State = 'idle' | 'pending' | 'active';

/**
 * Turns a noisy stream of confidences into clean gesture phases.
 *
 * - Hysteresis: starts at `enter`, only lets go below the lower `exit`.
 * - Debounce: confidence must hold for `holdMs` before the gesture starts.
 * - Release delay: confidence must stay low for `releaseMs` before the gesture ends.
 * - Cooldown: after ending (or firing) it cannot start again for `cooldownMs`.
 *
 * It knows nothing about hands or landmarks, so the same machine serves every gesture.
 */
export class GestureStateMachine {
  private state: State = 'idle';
  private pendingSince = 0;
  private releasingSince: number | null = null;
  private cooldownUntil = -Infinity;

  constructor(
    private timing: GestureTiming,
    private readonly kind: 'continuous' | 'discrete' = 'continuous',
  ) {}

  get active(): boolean {
    return this.state === 'active';
  }

  setTiming(timing: GestureTiming): void {
    this.timing = timing;
  }

  /** Feed the current confidence at time `now` (milliseconds). */
  update(confidence: number, now: number): GestureTransition {
    const { enter, exit, holdMs, releaseMs } = this.timing;

    if (this.state === 'active') {
      if (confidence < exit) {
        this.releasingSince ??= now;
        if (now - this.releasingSince >= releaseMs) return this.finish(now);
      } else {
        this.releasingSince = null;
      }
      return 'update';
    }

    if (now < this.cooldownUntil || confidence < enter) {
      this.state = 'idle';
      return null;
    }
    if (this.state === 'idle') {
      this.state = 'pending';
      this.pendingSince = now;
    }
    if (now - this.pendingSince < holdMs) return null;

    if (this.kind === 'discrete') {
      this.state = 'idle';
      this.cooldownUntil = now + this.timing.cooldownMs;
      return 'fire';
    }
    this.state = 'active';
    this.releasingSince = null;
    return 'start';
  }

  /** Ends an active gesture immediately, for example when its hand is lost. Returns true if it was active. */
  forceEnd(now: number): boolean {
    const wasActive = this.state === 'active';
    if (wasActive) this.finish(now);
    else this.state = 'idle';
    return wasActive;
  }

  reset(): void {
    this.state = 'idle';
    this.releasingSince = null;
    this.cooldownUntil = -Infinity;
  }

  private finish(now: number): 'end' {
    this.state = 'idle';
    this.releasingSince = null;
    this.cooldownUntil = now + this.timing.cooldownMs;
    return 'end';
  }
}

/**
 * Applies the user's sensitivity setting (0 = strict, 1 = eager) to a gesture's timing.
 * 0.5 leaves the timing as authored.
 */
export function adjustTiming(timing: GestureTiming, sensitivity: number): GestureTiming {
  const s = clamp(Number.isFinite(sensitivity) ? sensitivity : 0.5, 0, 1);
  const shift = (0.5 - s) * 0.24;
  const enter = clamp(timing.enter + shift, 0.3, 0.95);
  return {
    enter,
    exit: clamp(timing.exit + shift, 0.1, enter - 0.1),
    holdMs: timing.holdMs * (1.6 - 1.2 * s),
    releaseMs: timing.releaseMs,
    cooldownMs: timing.cooldownMs,
  };
}
