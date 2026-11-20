/**
 * The vocabulary environments understand. Gestures, mouse and keyboard are all translated
 * into these actions before they reach a 3D scene.
 *
 * Coordinates are normalised device coordinates: x and y in -1..1, y pointing up.
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
  | (ActionBase & { type: 'next'; direction: 1 | -1 });

export type EnvironmentActionType = EnvironmentAction['type'];

export interface ActionTarget {
  handleAction(action: EnvironmentAction): void;
}
