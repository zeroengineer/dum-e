import type { HandFrame } from '../../vision/landmarks/types';
import type { GestureName, SwipeDirection } from '../events/types';

/** A palm position sample kept in a short per-hand history for motion gestures. */
export interface MotionSample {
  t: number;
  /** Aspect-corrected mirrored screen position. */
  x: number;
  y: number;
}

export interface RecognizerResult {
  /** 0..1. The state machine decides what counts as active. */
  confidence: number;
  /** Where the gesture "is" on screen. Defaults to the palm centre. */
  x?: number;
  y?: number;
  direction?: SwipeDirection;
}

/** How a recogniser's confidence stream is turned into start / update / end events. */
export interface GestureTiming {
  /** Confidence needed to begin. */
  enter: number;
  /** Confidence below which an active gesture begins to release. Lower than `enter` (hysteresis). */
  exit: number;
  /** Confidence must stay above `enter` this long before `start` fires (debounce). */
  holdMs: number;
  /** Confidence must stay below `exit` this long before `end` fires. */
  releaseMs: number;
  /** Minimum time after `end` before the gesture may start again. */
  cooldownMs: number;
}

export interface HandRecognizer {
  readonly id: GestureName;
  readonly scope: 'hand';
  /**
   * `continuous` gestures have a duration (start, updates, end).
   * `discrete` gestures fire once (start immediately followed by end) and then cool down.
   */
  readonly kind: 'continuous' | 'discrete';
  /** Recognisers sharing a group are mutually exclusive on one hand; the most confident wins. */
  readonly group?: string;
  /** While any of these gestures is active on the same hand, this one cannot start. */
  readonly suppressedBy?: readonly GestureName[];
  readonly timing: GestureTiming;
  evaluate(hand: HandFrame, history: readonly MotionSample[]): RecognizerResult;
}

export interface TwoHandRecognizer {
  readonly id: GestureName;
  readonly scope: 'two-hand';
  readonly timing: GestureTiming;
  evaluate(
    left: HandFrame,
    right: HandFrame,
    aspect: number,
  ): RecognizerResult & { distance: number };
}

export type GestureRecognizer = HandRecognizer | TwoHandRecognizer;
