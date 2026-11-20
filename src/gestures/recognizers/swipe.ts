import { smoothstep } from '../../utils/math';
import { GESTURES } from '../events/types';
import type { SwipeDirection } from '../events/types';
import type { HandRecognizer, MotionSample } from './types';

export interface SwipeOptions {
  /** How far back to look, in milliseconds. */
  windowMs: number;
  /** Travel along the main axis, in image heights, that counts as a full swipe. */
  distance: number;
  /** Average speed along the main axis, in image heights per second, that counts as a full swipe. */
  speed: number;
  /** How many times larger the main axis must be than the cross axis. */
  straightness: number;
}

export const DEFAULT_SWIPE: SwipeOptions = {
  windowMs: 320,
  distance: 0.24,
  speed: 1.25,
  straightness: 2.2,
};

export interface SwipeMeasurement {
  confidence: number;
  direction: SwipeDirection;
}

/** Scores the recent palm path as a swipe: far enough, fast enough and straight enough. */
export function measureSwipe(
  history: readonly MotionSample[],
  options: SwipeOptions = DEFAULT_SWIPE,
): SwipeMeasurement {
  const none: SwipeMeasurement = { confidence: 0, direction: 'right' };
  if (history.length < 3) return none;
  const last = history[history.length - 1];
  let first = last;
  for (let i = history.length - 2; i >= 0; i--) {
    if (last.t - history[i].t > options.windowMs) break;
    first = history[i];
  }
  const seconds = (last.t - first.t) / 1000;
  if (seconds < 0.08) return none;

  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const main = horizontal ? Math.abs(dx) : Math.abs(dy);
  const cross = horizontal ? Math.abs(dy) : Math.abs(dx);

  // The hand must still be travelling the same way, not already on its way back.
  const previous = history[history.length - 2];
  const recent = horizontal ? last.x - previous.x : last.y - previous.y;
  const overall = horizontal ? dx : dy;
  if (recent * overall < 0) return none;

  const confidence =
    smoothstep(options.distance * 0.5, options.distance, main) *
    smoothstep(options.speed * 0.55, options.speed, main / seconds) *
    smoothstep(options.straightness * 0.6, options.straightness, main / (cross + 1e-4));
  const direction: SwipeDirection = horizontal
    ? dx > 0
      ? 'right'
      : 'left'
    : dy > 0
      ? 'down'
      : 'up';
  return { confidence, direction };
}

export function createSwipeRecognizer(options: SwipeOptions = DEFAULT_SWIPE): HandRecognizer {
  return {
    id: GESTURES.SWIPE,
    scope: 'hand',
    kind: 'discrete',
    // A hand that is holding, squeezing or aiming at something is being moved on purpose.
    suppressedBy: [GESTURES.PINCH, GESTURES.FIST, GESTURES.POINT],
    timing: { enter: 0.6, exit: 0.3, holdMs: 0, releaseMs: 0, cooldownMs: 750 },
    evaluate(_hand, history) {
      const { confidence, direction } = measureSwipe(history, options);
      return { confidence, direction };
    },
  };
}
