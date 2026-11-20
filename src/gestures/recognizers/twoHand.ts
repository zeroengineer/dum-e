import { smoothstep } from '../../utils/math';
import { GESTURES } from '../events/types';
import type { TwoHandRecognizer } from './types';

/** Closer than this (in image heights) the hands overlap and their separation is meaningless. */
const MIN_SEPARATION = 0.12;

/**
 * Both hands in view. Reports how far apart the palms are; the engine turns the changing
 * distance into scale ratios, which environments read as zoom, spread or object scale.
 */
export const twoHandRecognizer: TwoHandRecognizer = {
  id: GESTURES.TWO_HAND,
  scope: 'two-hand',
  timing: { enter: 0.6, exit: 0.3, holdMs: 160, releaseMs: 220, cooldownMs: 0 },
  evaluate(left, right, aspect) {
    const dx = (right.palm.x - left.palm.x) * aspect;
    const dy = right.palm.y - left.palm.y;
    const distance = Math.hypot(dx, dy);
    const tracked = smoothstep(0.4, 0.7, Math.min(left.score, right.score));
    return {
      confidence: distance >= MIN_SEPARATION ? tracked : 0,
      distance,
      x: (left.palm.x + right.palm.x) / 2,
      y: (left.palm.y + right.palm.y) / 2,
    };
  },
};
