// ---------------------------------------------------------------------------
// Pure functions for playback position calculation
// ---------------------------------------------------------------------------

/**
 * Calculate the current position within a loop region.
 *
 * Uses a true modulo (always non-negative) to avoid the JS `%` sign-preservation
 * issue where `elapsed < loopStart` would produce a value outside the loop region.
 *
 * Returns `null` when the loop region is invalid (loopDur <= 0) so the caller
 * can fall back to non-loop behaviour.
 */
export function calcLoopPosition(
  elapsed: number,
  loopStart: number,
  loopEnd: number,
): number | null {
  const loopDur = loopEnd - loopStart;
  if (loopDur <= 0) return null;
  const offset = elapsed - loopStart;
  return (((offset % loopDur) + loopDur) % loopDur) + loopStart;
}

/**
 * Calculate the playback position for a given state.
 *
 * Pure function — no side effects, no dependency on AudioContext.
 */
export function calcPlaybackPosition(
  state: "playing" | "paused" | "stopped",
  elapsed: number,
  duration: number,
  pausedAt: number,
  isLooping: boolean,
  loopStart: number | undefined,
  loopEnd: number | undefined,
): number {
  if (state === "paused") return pausedAt;
  if (state === "stopped") return 0;

  // state === "playing"
  if (isLooping) {
    const looped = calcLoopPosition(elapsed, loopStart ?? 0, loopEnd ?? duration);
    // Invalid loop region → fall back to non-loop clamping
    if (looped !== null) return looped;
  }
  return Math.min(Math.max(elapsed, 0), duration);
}
