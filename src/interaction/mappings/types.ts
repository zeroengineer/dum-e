import type { GestureEvent, GestureName } from '../../gestures/events/types';
import type { EnvironmentAction } from '../actions';

/** A gesture event's position, already converted to what environments work in. */
export interface Pointer {
  /** Hand slot: 0 = left, 1 = right. Two-hand gestures use 0. */
  hand: 0 | 1;
  /** Normalised device coordinates, -1..1, y up. */
  x: number;
  y: number;
  /** Movement since the previous event of the same gesture, in the same units. */
  dx: number;
  dy: number;
}

export type MappingResult = EnvironmentAction | EnvironmentAction[] | null;

/** What one gesture means in one environment. */
export type GestureRule = (event: GestureEvent, pointer: Pointer) => MappingResult;

/**
 * An environment's gesture vocabulary: one row per gesture it reacts to.
 * Gestures without a row are ignored there.
 */
export type GestureMapping = Partial<Record<GestureName, GestureRule>>;
