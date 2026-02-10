// ---------------------------------------------------------------------------
// M4: Lightweight type-safe event emitter
// ---------------------------------------------------------------------------

/** A minimal, type-safe event emitter. */
export interface Emitter<Events extends Record<string, any> = Record<string, unknown>> {
  /** Subscribe to an event. Returns an unsubscribe function. */
  on<K extends keyof Events>(event: K, handler: (data: Events[K]) => void): () => void;

  /** Unsubscribe a handler from an event. */
  off<K extends keyof Events>(event: K, handler: (data: Events[K]) => void): void;

  /** Emit an event with data. */
  emit<K extends keyof Events>(event: K, data: Events[K]): void;

  /** Remove all listeners (optionally for a specific event). */
  clear(event?: keyof Events): void;
}

/**
 * Create a lightweight, type-safe event emitter.
 *
 * ```ts
 * const emitter = createEmitter<{ tick: number; done: void }>();
 * const unsub = emitter.on("tick", (n) => console.log(n));
 * emitter.emit("tick", 42);
 * unsub();
 * ```
 */
export function createEmitter<
  Events extends Record<string, any> = Record<string, unknown>,
>(): Emitter<Events> {
  const listeners = new Map<keyof Events, Set<(data: never) => void>>();

  function getSet<K extends keyof Events>(event: K) {
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    return set;
  }

  return {
    on<K extends keyof Events>(event: K, handler: (data: Events[K]) => void): () => void {
      const set = getSet(event);
      set.add(handler as (data: never) => void);
      return () => {
        set.delete(handler as (data: never) => void);
      };
    },

    off<K extends keyof Events>(event: K, handler: (data: Events[K]) => void): void {
      listeners.get(event)?.delete(handler as (data: never) => void);
    },

    emit<K extends keyof Events>(event: K, data: Events[K]): void {
      const set = listeners.get(event);
      if (!set) return;
      for (const handler of set) {
        handler(data as never);
      }
    },

    clear(event?: keyof Events): void {
      if (event !== undefined) {
        listeners.delete(event);
      } else {
        listeners.clear();
      }
    },
  };
}
