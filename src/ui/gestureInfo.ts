import type { EnvironmentId } from '../core/scene/Environment';
import { GESTURES } from '../gestures/events/types';
import type { GestureName, SwipeDirection } from '../gestures/events/types';
import type { Pose } from '../utils/handModel';

/** How a gesture is drawn by the hand figure. */
export type Figure =
  { kind: 'pose'; pose: Pose } | { kind: 'swipe' } | { kind: 'move' } | { kind: 'two-hand' };

export interface GestureInfo {
  label: string;
  /** How to make it with a hand. */
  how: string;
  /** How to make it with mouse and keyboard. */
  fallback: string;
  figure: Figure;
}

export const GESTURE_INFO: Record<string, GestureInfo> = {
  [GESTURES.HAND]: {
    label: 'Move hand',
    how: 'Move your hand in front of the camera.',
    fallback: 'Move the mouse.',
    figure: { kind: 'move' },
  },
  [GESTURES.OPEN_PALM]: {
    label: 'Open palm',
    how: 'Spread all five fingers and face your palm to the camera.',
    fallback: 'Hold O.',
    figure: { kind: 'pose', pose: 'open' },
  },
  [GESTURES.FIST]: {
    label: 'Fist',
    how: 'Close your hand into a fist.',
    fallback: 'Hold the right mouse button, or hold F.',
    figure: { kind: 'pose', pose: 'fist' },
  },
  [GESTURES.PINCH]: {
    label: 'Pinch',
    how: 'Touch the tip of your thumb to the tip of your index finger.',
    fallback: 'Hold the left mouse button.',
    figure: { kind: 'pose', pose: 'pinch' },
  },
  [GESTURES.POINT]: {
    label: 'Point',
    how: 'Extend your index finger and fold the others.',
    fallback: 'Hold P.',
    figure: { kind: 'pose', pose: 'point' },
  },
  [GESTURES.SWIPE]: {
    label: 'Swipe',
    how: 'Flick an open hand quickly to one side.',
    fallback: 'Press an arrow key.',
    figure: { kind: 'swipe' },
  },
  [GESTURES.TWO_HAND]: {
    label: 'Two hands',
    how: 'Show both hands, then move them apart or together.',
    fallback: 'Scroll the mouse wheel.',
    figure: { kind: 'two-hand' },
  },
};

export const gestureLabel = (gesture: GestureName): string =>
  GESTURE_INFO[gesture]?.label ?? gesture.replace(/_/g, ' ');

export const SWIPE_LABEL: Record<SwipeDirection, string> = {
  left: 'Swipe left',
  right: 'Swipe right',
  up: 'Swipe up',
  down: 'Swipe down',
};

/** What each gesture does, per environment. Shown in the HUD guide and on the selector. */
export const GESTURE_GUIDE: Record<
  EnvironmentId,
  ReadonlyArray<{ gesture: string; does: string }>
> = {
  particles: [
    { gesture: GESTURES.HAND, does: 'Stir the particles near your hand' },
    { gesture: GESTURES.OPEN_PALM, does: 'Push particles away and expand the cloud' },
    { gesture: GESTURES.FIST, does: 'Pull particles toward your hand' },
    { gesture: GESTURES.PINCH, does: 'Grab a clump and drag it' },
    { gesture: GESTURES.TWO_HAND, does: 'Apart to expand the formation, together to compress' },
    { gesture: GESTURES.SWIPE, does: 'Change formation' },
  ],
  objects: [
    { gesture: GESTURES.POINT, does: 'Select the object you point at' },
    { gesture: GESTURES.PINCH, does: 'Grab an object; move to carry, turn your wrist to rotate' },
    { gesture: GESTURES.TWO_HAND, does: 'Scale the held or selected object' },
    { gesture: GESTURES.OPEN_PALM, does: 'Let go' },
    { gesture: GESTURES.FIST, does: 'Send a shockwave through the bench' },
  ],
  galaxy: [
    { gesture: GESTURES.HAND, does: 'Turn the galaxy' },
    { gesture: GESTURES.OPEN_PALM, does: 'Expand the galaxy' },
    { gesture: GESTURES.FIST, does: 'Contract the galaxy' },
    { gesture: GESTURES.TWO_HAND, does: 'Apart to zoom in, together to zoom out' },
    { gesture: GESTURES.SWIPE, does: 'Change configuration' },
  ],
  globe: [
    { gesture: GESTURES.HAND, does: 'Carry the globe on your hand' },
    {
      gesture: GESTURES.TWO_HAND,
      does: 'Hold it between your hands; apart to grow, together to shrink',
    },
    { gesture: GESTURES.PINCH, does: 'Hold it still and spin it; turn your wrist to twist' },
    { gesture: GESTURES.FIST, does: 'Fold it up small' },
    { gesture: GESTURES.OPEN_PALM, does: 'Send out a pulse' },
    { gesture: GESTURES.SWIPE, does: 'Change its effect' },
  ],
};

/** The order the tutorial teaches gestures in. */
export const TUTORIAL_GESTURES: readonly string[] = [
  GESTURES.OPEN_PALM,
  GESTURES.FIST,
  GESTURES.PINCH,
  GESTURES.POINT,
  GESTURES.SWIPE,
  GESTURES.TWO_HAND,
];
