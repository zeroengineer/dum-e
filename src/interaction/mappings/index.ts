import { GESTURES } from '../../gestures/events/types';
import {
  attract,
  expand,
  grab,
  hover,
  next,
  point,
  release,
  rotate,
  scale,
  special,
  zoom,
} from './rules';
import type { GestureMapping } from './types';

/**
 * Particle Universe: hands are force fields.
 * Open palm pushes, fist pulls, pinch drags a clump, two hands stretch the whole formation.
 */
export const particlesMapping: GestureMapping = {
  [GESTURES.HAND]: hover,
  [GESTURES.OPEN_PALM]: expand,
  [GESTURES.FIST]: attract,
  [GESTURES.PINCH]: grab,
  [GESTURES.TWO_HAND]: scale,
  [GESTURES.SWIPE]: next,
};

/**
 * Object Lab: hands are hands.
 * Point selects, pinch holds, an open hand lets go, a fist sends a shockwave, two hands resize.
 * Swipe is deliberately unmapped: carrying an object quickly must not change the selection.
 */
export const objectsMapping: GestureMapping = {
  [GESTURES.HAND]: hover,
  [GESTURES.POINT]: point,
  [GESTURES.PINCH]: grab,
  [GESTURES.OPEN_PALM]: release,
  [GESTURES.FIST]: special,
  [GESTURES.TWO_HAND]: scale,
};

/**
 * Galaxy Explorer: the hand holds the galaxy.
 * Moving it turns the view, open palm and fist stretch and squeeze, two hands zoom, swipe changes shape.
 */
export const galaxyMapping: GestureMapping = {
  // A tracked hand turns the galaxy just by moving. A mouse only turns it while dragging,
  // otherwise crossing the screen to reach a slider would spin the view.
  [GESTURES.HAND]: (e, p) => {
    const hovering = hover(e, p);
    if (e.source !== 'camera') return hovering;
    const turning = rotate(e, p);
    return turning && hovering && !Array.isArray(hovering) && !Array.isArray(turning)
      ? [hovering, turning]
      : hovering;
  },
  [GESTURES.PINCH]: (e, p) => (e.source === 'camera' ? null : grab(e, p)),
  [GESTURES.OPEN_PALM]: expand,
  [GESTURES.FIST]: attract,
  [GESTURES.TWO_HAND]: zoom,
  [GESTURES.SWIPE]: next,
};

/** Keyed by environment id. To make an environment react to a gesture, add a row to its table. */
export const DEFAULT_MAPPINGS: Record<string, GestureMapping> = {
  particles: particlesMapping,
  objects: objectsMapping,
  galaxy: galaxyMapping,
};

export type { GestureMapping, GestureRule, MappingResult, Pointer } from './types';
