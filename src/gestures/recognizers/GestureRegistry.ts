import type { GestureName } from '../events/types';
import { fistRecognizer, openPalmRecognizer, pinchRecognizer, pointRecognizer } from './poses';
import { createSwipeRecognizer } from './swipe';
import { twoHandRecognizer } from './twoHand';
import type { GestureRecognizer, HandRecognizer, TwoHandRecognizer } from './types';

/**
 * The set of gestures the engine looks for. Adding a gesture is a matter of registering a
 * recogniser here; the engine, state machine and event bus stay as they are.
 */
export class GestureRegistry {
  private readonly recognizers = new Map<GestureName, GestureRecognizer>();
  private handList: HandRecognizer[] = [];
  private twoHandList: TwoHandRecognizer[] = [];

  register(recognizer: GestureRecognizer): this {
    this.recognizers.set(recognizer.id, recognizer);
    this.refresh();
    return this;
  }

  unregister(id: GestureName): boolean {
    const removed = this.recognizers.delete(id);
    if (removed) this.refresh();
    return removed;
  }

  has(id: GestureName): boolean {
    return this.recognizers.has(id);
  }

  get(id: GestureName): GestureRecognizer | undefined {
    return this.recognizers.get(id);
  }

  get ids(): GestureName[] {
    return [...this.recognizers.keys()];
  }

  get handRecognizers(): readonly HandRecognizer[] {
    return this.handList;
  }

  get twoHandRecognizers(): readonly TwoHandRecognizer[] {
    return this.twoHandList;
  }

  private refresh(): void {
    const all = [...this.recognizers.values()];
    this.handList = all.filter((r): r is HandRecognizer => r.scope === 'hand');
    this.twoHandList = all.filter((r): r is TwoHandRecognizer => r.scope === 'two-hand');
  }
}

/** Open palm, fist, pinch, point, swipe and two-hand distance. */
export function createDefaultRegistry(): GestureRegistry {
  return new GestureRegistry()
    .register(openPalmRecognizer)
    .register(fistRecognizer)
    .register(pinchRecognizer)
    .register(pointRecognizer)
    .register(createSwipeRecognizer())
    .register(twoHandRecognizer);
}
