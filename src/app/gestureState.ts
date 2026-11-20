import { GESTURES } from '../gestures/events/types';
import type { GestureEvent, GestureHand } from '../gestures/events/types';
import type { GestureEventBus } from '../interaction/dispatcher/GestureEventBus';
import { store } from '../state/store';
import type { ActiveGesture } from '../state/store';

const sameGesture = (a: ActiveGesture, e: GestureEvent): boolean =>
  a.gesture === e.gesture && a.hand === e.hand;

/**
 * Mirrors what the gesture bus is saying into the store so the HUD can show it.
 * Only beginnings and endings are written; per-frame updates never touch the store.
 */
export function syncGesturesToStore(bus: GestureEventBus): () => void {
  return bus.subscribe((event) => {
    if (event.phase === 'update') return;

    if (event.gesture === GESTURES.HAND) {
      if (event.source !== 'camera') return; // "hands detected" means hands the camera sees
      const hands = store.getState().tracking.hands.filter((h) => h !== event.hand);
      if (event.phase === 'start') hands.push(event.hand);
      hands.sort();
      store.setState((s) => ({ tracking: { ...s.tracking, hands } }));
      return;
    }

    if (event.gesture === GESTURES.SWIPE) {
      if (event.phase === 'start') {
        store.setState({
          lastGesture: {
            gesture: event.gesture,
            hand: event.hand,
            detail: event.direction,
            at: event.timestamp,
          },
        });
      }
      return;
    }

    const gestures = store.getState().gestures.filter((g) => !sameGesture(g, event));
    if (event.phase === 'start') {
      gestures.push({ gesture: event.gesture, hand: event.hand, confidence: event.confidence });
    }
    store.setState({ gestures });
  });
}

/** Clears everything gesture-related, for when tracking stops. */
export function clearGestureState(hands: GestureHand[] = []): void {
  store.setState((s) => ({ gestures: [], tracking: { ...s.tracking, hands, rate: 0 } }));
}
