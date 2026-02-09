// ---------------------------------------------------------------------------
// Pure function for calculating gapless transition delay
// ---------------------------------------------------------------------------

/** Safety margin added to the transition timer to avoid premature cleanup (ms). */
export const TRANSITION_MARGIN_MS = 50;

/**
 * Calculate the delay (in ms) before executing a chunk transition callback.
 *
 * The delay ensures the next chunk has started playing before we clean up the
 * previous source node.
 *
 * @param startTime - The AudioContext time at which the next chunk starts playing
 * @param currentTime - The current AudioContext time
 * @returns Delay in milliseconds (always >= 0)
 */
export function calcTransitionDelay(
  startTime: number,
  currentTime: number,
): number {
  return Math.max(
    0,
    (startTime - currentTime) * 1000 + TRANSITION_MARGIN_MS,
  );
}
