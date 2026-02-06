// ---------------------------------------------------------------------------
// M10: Framework adapters
// ---------------------------------------------------------------------------

import type { Playback, PlaybackSnapshot } from "./types.js";

/**
 * Get an immutable snapshot of the current playback state.
 * Designed for use with React's `useSyncExternalStore` or similar patterns.
 */
export function getSnapshot(playback: Playback): PlaybackSnapshot {
  return {
    state: playback.getState(),
    position: playback.getCurrentTime(),
    duration: playback.getDuration(),
    progress: playback.getProgress(),
  };
}

/**
 * Subscribe to playback state changes, calling `callback` with a fresh
 * snapshot whenever the state updates.
 *
 * Returns an unsubscribe function. Works as the `subscribe` parameter for
 * React's `useSyncExternalStore`.
 *
 * ```ts
 * // React example:
 * const snap = useSyncExternalStore(
 *   (cb) => subscribeSnapshot(playback, cb),
 *   () => getSnapshot(playback),
 * );
 * ```
 */
export function subscribeSnapshot(
  playback: Playback,
  callback: () => void,
): () => void {
  const unsubs: Array<() => void> = [];

  unsubs.push(playback.on("statechange", callback));
  unsubs.push(playback.on("timeupdate", callback));
  unsubs.push(playback.on("seek", callback));
  unsubs.push(playback.on("ended", callback));

  return () => {
    for (const unsub of unsubs) unsub();
  };
}

/**
 * Call `callback` on every animation frame with the current playback snapshot.
 * Useful for smooth UI animations (waveform cursors, progress bars, etc.).
 *
 * Returns a `stop` function that cancels the loop.
 */
export function onFrame(
  playback: Playback,
  callback: (snapshot: PlaybackSnapshot) => void,
): () => void {
  let rafId: number | null = null;

  function tick() {
    callback(getSnapshot(playback));
    rafId = requestAnimationFrame(tick);
  }

  rafId = requestAnimationFrame(tick);

  return () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };
}

/**
 * Return a `Promise` that resolves when the playback reaches the `"stopped"`
 * state via the `ended` event (natural end, not manual stop).
 */
export function whenEnded(playback: Playback): Promise<void> {
  return new Promise<void>((resolve) => {
    const unsub = playback.on("ended", () => {
      unsub();
      resolve();
    });
  });
}

/**
 * Return a `Promise` that resolves when the playback position reaches or
 * exceeds `position` seconds.
 */
export function whenPosition(
  playback: Playback,
  position: number,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const unsub = playback.on("timeupdate", ({ position: current }) => {
      if (current >= position) {
        unsub();
        resolve();
      }
    });
  });
}
