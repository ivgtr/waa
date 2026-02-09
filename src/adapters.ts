// ---------------------------------------------------------------------------
// M10: Framework adapters
// ---------------------------------------------------------------------------

import type { Playback, PlaybackSnapshot } from "./types.js";

const snapshotCache = new WeakMap<Playback, PlaybackSnapshot>();
const subscriberCount = new WeakMap<Playback, number>();

function computeSnapshot(playback: Playback): PlaybackSnapshot {
  const state = playback.getState();
  const position = playback.getCurrentTime();
  const duration = playback.getDuration();
  const progress = playback.getProgress();

  const getter = (playback as unknown as Record<string, unknown>)["_getStretcherSnapshot"];
  let stretcher: PlaybackSnapshot["stretcher"];
  if (typeof getter === "function") {
    stretcher = (getter as () => PlaybackSnapshot["stretcher"])();
  }

  const snap: PlaybackSnapshot = { state, position, duration, progress };
  if (stretcher) {
    snap.stretcher = stretcher;
  }
  return snap;
}

/**
 * Get an immutable snapshot of the current playback state.
 * Designed for use with React's `useSyncExternalStore` or similar patterns.
 *
 * Always returns a referentially stable (cached) object. The cache is updated
 * by `subscribeSnapshot` (on playback events) and `onFrame` (every animation
 * frame), so `getSnapshot` itself never computes a fresh snapshot — it only
 * reads or initialises the cache. This guarantees the reference-equality
 * contract required by `useSyncExternalStore`.
 */
export function getSnapshot(playback: Playback): PlaybackSnapshot {
  const cached = snapshotCache.get(playback);
  if (cached) return cached;

  const snap = computeSnapshot(playback);
  snapshotCache.set(playback, snap);
  return snap;
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
 * import { useCallback } from "react";
 * const subscribe = useCallback(
 *   (cb: () => void) => subscribeSnapshot(playback, cb),
 *   [playback],
 * );
 * const snap = useCallback(
 *   () => getSnapshot(playback),
 *   [playback],
 * );
 * const snapshot = useSyncExternalStore(subscribe, snap, snap);
 * ```
 */
export function subscribeSnapshot(
  playback: Playback,
  callback: () => void,
): () => void {
  const count = (subscriberCount.get(playback) ?? 0) + 1;
  subscriberCount.set(playback, count);

  // Eagerly compute the initial snapshot so getSnapshot() has a
  // stable reference before the first event fires.
  snapshotCache.set(playback, computeSnapshot(playback));

  const notify = () => {
    // Pre-compute and cache the snapshot BEFORE notifying the
    // subscriber. This ensures getSnapshot() returns the same
    // reference during React's render and post-commit check.
    snapshotCache.set(playback, computeSnapshot(playback));
    callback();
  };

  const unsubs: Array<() => void> = [];
  unsubs.push(playback.on("statechange", notify));
  unsubs.push(playback.on("timeupdate", notify));
  unsubs.push(playback.on("seek", notify));
  unsubs.push(playback.on("ended", notify));

  return () => {
    for (const unsub of unsubs) unsub();
    const c = (subscriberCount.get(playback) ?? 1) - 1;
    if (c <= 0) {
      subscriberCount.delete(playback);
    } else {
      subscriberCount.set(playback, c);
    }
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
    const snap = computeSnapshot(playback);
    snapshotCache.set(playback, snap);
    callback(snap);
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
  if (playback.getCurrentTime() >= position) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    const unsub = playback.on("timeupdate", ({ position: current }) => {
      if (current >= position) {
        unsub();
        resolve();
      }
    });
  });
}
