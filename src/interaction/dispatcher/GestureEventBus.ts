import type { GestureEvent, GestureName, GestureSink } from '../../gestures/events/types';

type Unsubscribe = () => void;

/**
 * The one place gesture events pass through. Producers (the gesture engine, the mouse and
 * keyboard fallback, tests) publish; consumers (the interaction controller, the HUD) subscribe.
 * Neither side knows the other exists.
 */
export class GestureEventBus {
  private readonly all = new Set<GestureSink>();
  private readonly byGesture = new Map<GestureName, Set<GestureSink>>();

  /** Bound so it can be handed straight to a producer as its sink. */
  readonly publish: GestureSink = (event: GestureEvent): void => {
    this.deliver(this.all, event);
    const listeners = this.byGesture.get(event.gesture);
    if (listeners) this.deliver(listeners, event);
  };

  /** Every event. */
  subscribe(listener: GestureSink): Unsubscribe {
    this.all.add(listener);
    return () => this.all.delete(listener);
  }

  /** Events of one gesture. */
  on(gesture: GestureName, listener: GestureSink): Unsubscribe {
    let listeners = this.byGesture.get(gesture);
    if (!listeners) {
      listeners = new Set();
      this.byGesture.set(gesture, listeners);
    }
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  clear(): void {
    this.all.clear();
    this.byGesture.clear();
  }

  private deliver(listeners: Set<GestureSink>, event: GestureEvent): void {
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch (error) {
        // One broken subscriber must not starve the rest of input.
        console.error(`[gestures] listener for "${event.gesture}" failed`, error);
      }
    }
  }
}
