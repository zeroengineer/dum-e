import type { SwipeDirection } from '../../gestures/events/types';
import type { GestureRule } from './types';

// Building blocks shared by the per-environment tables.

export const hover: GestureRule = (e, p) => ({
  type: 'hover',
  phase: e.phase,
  hand: p.hand,
  x: p.x,
  y: p.y,
  dx: p.dx,
  dy: p.dy,
});

export const expand: GestureRule = (e, p) => ({
  type: 'expand',
  phase: e.phase,
  hand: p.hand,
  x: p.x,
  y: p.y,
  strength: e.confidence,
});

export const attract: GestureRule = (e, p) => ({
  type: 'attract',
  phase: e.phase,
  hand: p.hand,
  x: p.x,
  y: p.y,
  strength: e.confidence,
});

export const grab: GestureRule = (e, p) => ({
  type: 'grab',
  phase: e.phase,
  hand: p.hand,
  x: p.x,
  y: p.y,
  dx: p.dx,
  dy: p.dy,
  dRoll: e.dRoll,
});

export const point: GestureRule = (e, p) => ({
  type: 'point',
  phase: e.phase,
  hand: p.hand,
  x: p.x,
  y: p.y,
});

export const special: GestureRule = (e, p) => ({
  type: 'special',
  phase: e.phase,
  hand: p.hand,
  x: p.x,
  y: p.y,
});

export const release: GestureRule = (e, p) => ({ type: 'release', phase: e.phase, hand: p.hand });

/** Hand movement turns whatever is on screen. */
export const rotate: GestureRule = (e, p) =>
  e.phase === 'update' && (p.dx !== 0 || p.dy !== 0)
    ? { type: 'rotate', phase: 'update', hand: p.hand, dx: p.dx, dy: p.dy }
    : null;

/** The changing distance between two hands, as a multiplicative step. */
const spread =
  (type: 'scale' | 'zoom'): GestureRule =>
  (e) =>
    e.phase === 'update' && e.dScale !== 1 && Number.isFinite(e.dScale) && e.dScale > 0
      ? { type, phase: 'update', hand: 0, factor: e.dScale }
      : null;

export const scale = spread('scale');
export const zoom = spread('zoom');

/** Swiping left or up moves on to the next item, like turning a page; right or down goes back. */
const SWIPE_STEP: Record<SwipeDirection, 1 | -1> = { left: 1, up: 1, right: -1, down: -1 };

export const next: GestureRule = (e, p) =>
  e.phase === 'start' && e.direction
    ? { type: 'next', phase: 'start', hand: p.hand, direction: SWIPE_STEP[e.direction] }
    : null;
