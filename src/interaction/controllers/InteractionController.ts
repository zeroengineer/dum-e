import type { GestureEvent } from '../../gestures/events/types';
import { clamp } from '../../utils/math';
import type { ActionTarget, EnvironmentAction } from '../actions';
import type { GestureEventBus } from '../dispatcher/GestureEventBus';
import type { GestureMapping, Pointer } from '../mappings/types';

export interface InteractionOptions {
  /**
   * Fraction of the camera image that maps onto the full screen. Hands are hard to track at the
   * very edge of the picture, so the middle of the image is stretched to cover the whole scene.
   */
  reach: number;
}

export const DEFAULT_INTERACTION_OPTIONS: InteractionOptions = { reach: 0.8 };

type Source = GestureEvent['source'];

/** Mirrored screen position (0..1, y down) to normalised device coordinates (-1..1, y up). */
export function toPointer(event: GestureEvent, reach: number): Pointer {
  // A mouse already points exactly where it means to; only camera input is stretched.
  const span = event.source === 'camera' ? clamp(reach, 0.2, 1) : 1;
  const gain = 2 / span;
  return {
    hand: event.hand === 'Right' ? 1 : 0,
    x: clamp((event.x - 0.5) * gain, -1, 1),
    y: clamp((0.5 - event.y) * gain, -1, 1),
    dx: event.dx * gain,
    dy: -event.dy * gain,
  };
}

/**
 * Translates gesture events into actions for whichever environment is active, using that
 * environment's mapping table. This is the only link between gestures and 3D scenes.
 */
export class InteractionController {
  private readonly options: InteractionOptions;
  private readonly unsubscribe: () => void;
  private readonly enabled: Record<Source, boolean> = { camera: true, fallback: true };
  private readonly listeners = new Set<(action: EnvironmentAction, event: GestureEvent) => void>();
  private mapping: GestureMapping | null = null;
  private target: ActionTarget | null = null;

  constructor(
    bus: GestureEventBus,
    private readonly mappings: Record<string, GestureMapping>,
    options: Partial<InteractionOptions> = {},
  ) {
    this.options = { ...DEFAULT_INTERACTION_OPTIONS, ...options };
    this.unsubscribe = bus.subscribe(this.handle);
  }

  /** Points the controller at an environment, or at nothing. */
  setTarget(environmentId: string | null, target: ActionTarget | null): void {
    this.mapping = environmentId ? (this.mappings[environmentId] ?? null) : null;
    this.target = target;
  }

  /** Lets one input source be muted, for example the mouse fallback. */
  setSourceEnabled(source: Source, enabled: boolean): void {
    this.enabled[source] = enabled;
  }

  /** Observe the actions being dispatched (used by diagnostics and tests). */
  onAction(listener: (action: EnvironmentAction, event: GestureEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.unsubscribe();
    this.listeners.clear();
    this.target = null;
    this.mapping = null;
  }

  private readonly handle = (event: GestureEvent): void => {
    const target = this.target;
    const rule = this.mapping?.[event.gesture];
    // Endings are always let through so muting a source cannot leave a gesture stuck on.
    if (!target || !rule || (!this.enabled[event.source] && event.phase !== 'end')) return;

    const result = rule(event, toPointer(event, this.options.reach));
    if (!result) return;
    for (const action of Array.isArray(result) ? result : [result]) {
      target.handleAction(action);
      for (const listener of this.listeners) listener(action, event);
    }
  };
}
