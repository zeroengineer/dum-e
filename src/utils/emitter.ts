export type Listener<T> = (payload: T) => void;
export type Unsubscribe = () => void;

/** Minimal typed publish/subscribe. A throwing listener never blocks the others. */
export class Emitter<Events extends object> {
  private readonly listeners = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(type: K, listener: Listener<Events[K]>): Unsubscribe {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener as Listener<never>);
    return () => {
      set.delete(listener as Listener<never>);
    };
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        (listener as Listener<Events[K]>)(payload);
      } catch (err) {
        console.error(`[emitter] listener for "${String(type)}" failed`, err);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
