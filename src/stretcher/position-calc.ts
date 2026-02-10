// ---------------------------------------------------------------------------
// Pure function for calculating position in the original audio buffer
// ---------------------------------------------------------------------------

import type { StretcherPlaybackState } from "./types.js";

export interface PositionCalcParams {
  phase: StretcherPlaybackState;
  totalDuration: number;
  offset: number;
  bufferingResumePosition: number | null;
  currentTempo: number;
  sampleRate: number;
  crossfadeSec: number;
  chunk: {
    inputStartSample: number;
    overlapBefore: number;
  } | null;
  posInChunk: number;
}

/**
 * Calculate the current position in the original buffer from the stretcher
 * engine's internal state.
 *
 * Pure function — no side effects.
 */
export function calcPositionInOriginalBuffer(p: PositionCalcParams): number {
  if (p.phase === "ended") return p.totalDuration;
  if (p.phase === "waiting") return p.offset;
  if (p.phase === "buffering" && p.bufferingResumePosition !== null) {
    return p.bufferingResumePosition;
  }

  if (!p.chunk) return 0;

  // Nominal start time of this chunk in the original buffer
  const nominalStartSample = p.chunk.inputStartSample + p.chunk.overlapBefore;
  const nominalStartSec = nominalStartSample / p.sampleRate;

  // Subtract the crossfade overlap kept at the start of non-first chunks
  const crossfadeOffset = p.chunk.overlapBefore > 0 ? p.crossfadeSec : 0;
  const adjustedPosInChunk = Math.max(0, p.posInChunk - crossfadeOffset);

  // Convert output position back to original buffer time
  const posInOriginal = adjustedPosInChunk * p.currentTempo;

  return Math.min(nominalStartSec + posInOriginal, p.totalDuration);
}
