import type { Vec2 } from '../utils/math';

/**
 * The vocabulary environments understand. Gestures, mouse and keyboard are all translated
 * into these actions before they reach a 3D scene.
 *
 * Coordinates are normalised device coordinates: x and y in -1..1, y pointing up. The exception
 * is the camera-anchored pair (`anchor`, `span`), for worlds that draw the camera picture and
 * need to know where in that picture a hand is.
 */
export type ActionPhase = 'start' | 'update' | 'end';

interface ActionBase {
  phase: ActionPhase;
  /** Which hand slot produced it (0 = left, 1 = right). Two-hand actions use 0. */
  hand: 0 | 1;
}

interface Positioned extends ActionBase {
  x: number;
  y: number;
}

/**
 * A position for a world that draws the camera picture: u right and v down, both 0..1.
 * `image` means the mirrored camera image, which the world fits to the screen itself;
 * `screen` means the screen directly (a mouse has no place in the camera image).
 */
interface Anchored extends ActionBase {
  space: 'image' | 'screen';
  u: number;
  v: number;
}

export type EnvironmentAction =
  /** A hand or cursor is present and moving, with no particular pose. */
  | (Positioned & { type: 'hover'; dx: number; dy: number })
  | (Positioned & { type: 'expand'; strength: number })
  | (Positioned & { type: 'attract'; strength: number })
  | (Positioned & { type: 'grab'; dx: number; dy: number; dRoll: number })
  | (Positioned & { type: 'point' })
  | (Positioned & { type: 'special' })
  | (ActionBase & { type: 'release' })
  /** Multiplicative change since the previous scale action. */
  | (ActionBase & { type: 'scale'; factor: number })
  | (ActionBase & { type: 'zoom'; factor: number })
  | (ActionBase & { type: 'rotate'; dx: number; dy: number })
  | (ActionBase & { type: 'next'; direction: 1 | -1 })
  /**
   * Where a tracked hand is, every tracked frame from the moment it appears (`start`) until it
   * leaves (`end`). `size` is the palm as a fraction of image height (0 when unknown), `roll`
   * is in radians, `tips` are the five fingertips in the same space.
   */
  | (Anchored & { type: 'anchor'; size: number; roll: number; tips?: readonly Vec2[] })
  /**
   * Both hands held up: the midpoint between the palms, the `gap` between them in image heights
   * (0 when unknown), the gap relative to when the gesture began (`scale`) and relative to the
   * previous report (`factor`). Reported from `start` to `end`, including while the hands are still.
   */
  | (Anchored & { type: 'span'; gap: number; scale: number; factor: number });

export type EnvironmentActionType = EnvironmentAction['type'];

export interface ActionTarget {
  handleAction(action: EnvironmentAction): void;
}
