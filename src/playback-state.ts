// ---------------------------------------------------------------------------
// Shared playback state management (used by both normal and stretched modes)
// ---------------------------------------------------------------------------

import type { PlaybackState } from "./types.js";

export interface PlaybackStateManager {
  getState(): PlaybackState;
  setState(next: PlaybackState): boolean;
  startTimer(): void;
  stopTimer(): void;
  isDisposed(): boolean;
  markDisposed(): void;
}

/**
 * Create a reusable state manager that encapsulates the setState / startTimer /
 * stopTimer / dispose pattern shared between normal and stretched playback.
 */
export function createPlaybackStateManager(opts: {
  initialState: PlaybackState;
  onStateChange: (state: PlaybackState) => void;
  onTimerTick: () => void;
  timerInterval: number;
}): PlaybackStateManager {
  let state: PlaybackState = opts.initialState;
  let timerId: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  function getState(): PlaybackState {
    return state;
  }

  /** Returns `true` if state actually changed. */
  function setState(next: PlaybackState): boolean {
    if (state === next) return false;
    state = next;
    opts.onStateChange(next);
    return true;
  }

  function startTimer(): void {
    if (timerId !== null) return;
    timerId = setInterval(() => {
      if (state !== "playing" || disposed) return;
      opts.onTimerTick();
    }, opts.timerInterval);
  }

  function stopTimer(): void {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function isDisposed(): boolean {
    return disposed;
  }

  function markDisposed(): void {
    disposed = true;
    stopTimer();
  }

  return { getState, setState, startTimer, stopTimer, isDisposed, markDisposed };
}
