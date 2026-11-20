import type { HandId } from '../../vision/landmarks/types';

export type GesturePhase = 'start' | 'update' | 'end';
export type GestureHand = HandId | 'Both';
export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

export const GESTURES = {
  /** A tracked hand is present. Carries position and movement, no pose. */
  HAND: 'hand',
  OPEN_PALM: 'open_palm',
  FIST: 'fist',
  PINCH: 'pinch',
  POINT: 'point',
  SWIPE: 'swipe',
  /** Both hands are visible. Carries the distance ratio between them. */
  TWO_HAND: 'two_hand',
} as const;

export type BuiltinGesture = (typeof GESTURES)[keyof typeof GESTURES];
/** Built-in names autocomplete, custom recogniser ids are still allowed. */
export type GestureName = BuiltinGesture | (string & {});

export interface GestureEvent {
  gesture: GestureName;
  phase: GesturePhase;
  hand: GestureHand;
  confidence: number;
  timestamp: number;
  /** Mirrored screen position, 0..1, origin top-left. */
  x: number;
  y: number;
  /** Movement since the previous event of this gesture on this hand. */
  dx: number;
  dy: number;
  /** Hand roll in radians and its change since the previous event. */
  roll: number;
  dRoll: number;
  /** Two-hand distance relative to the distance when the gesture started (1 otherwise). */
  scale: number;
  /** Two-hand distance relative to the previous event (1 otherwise). */
  dScale: number;
  /** Apparent hand size, a rough depth cue. */
  size: number;
  direction?: SwipeDirection;
  source: 'camera' | 'fallback';
}

export type GestureSink = (event: GestureEvent) => void;

export function createGestureEvent(
  partial: Pick<GestureEvent, 'gesture' | 'phase' | 'hand'> & Partial<GestureEvent>,
): GestureEvent {
  return {
    confidence: 1,
    timestamp: 0,
    x: 0.5,
    y: 0.5,
    dx: 0,
    dy: 0,
    roll: 0,
    dRoll: 0,
    scale: 1,
    dScale: 1,
    size: 0,
    source: 'camera',
    ...partial,
  };
}
