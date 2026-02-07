// ---------------------------------------------------------------------------
// Stretcher: Conversion time estimator (moving average)
// ---------------------------------------------------------------------------

import { ESTIMATOR_WINDOW_SIZE } from "./constants.js";
import type { ConversionEstimator } from "./types.js";

/**
 * Create a conversion time estimator using a moving average.
 */
export function createConversionEstimator(
  windowSize: number = ESTIMATOR_WINDOW_SIZE,
): ConversionEstimator {
  const samples: number[] = [];

  function recordConversion(durationMs: number): void {
    samples.push(durationMs);
    if (samples.length > windowSize) {
      samples.shift();
    }
  }

  function getAverageMs(): number {
    if (samples.length === 0) return 0;
    let sum = 0;
    for (const s of samples) {
      sum += s;
    }
    return sum / samples.length;
  }

  function estimateRemaining(remainingChunks: number): number {
    return getAverageMs() * remainingChunks;
  }

  return {
    recordConversion,
    estimateRemaining,
    getAverageMs,
  };
}
