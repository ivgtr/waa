// ---------------------------------------------------------------------------
// Stretcher: Chunk splitter
// ---------------------------------------------------------------------------

import { CHUNK_DURATION_SEC, OVERLAP_SEC } from "./constants.js";
import type { ChunkInfo } from "./types.js";

/**
 * Split an AudioBuffer's sample range into chunks with overlap.
 *
 * @param totalSamples - Total number of samples in the buffer
 * @param sampleRate - Sample rate of the buffer
 * @param chunkDurationSec - Duration of each chunk in seconds
 * @param overlapSec - Overlap between adjacent chunks in seconds
 * @returns Array of ChunkInfo objects
 */
export function splitIntoChunks(
  totalSamples: number,
  sampleRate: number,
  chunkDurationSec: number = CHUNK_DURATION_SEC,
  overlapSec: number = OVERLAP_SEC,
): ChunkInfo[] {
  if (totalSamples <= 0 || sampleRate <= 0) {
    return [];
  }

  const chunkSamples = Math.round(chunkDurationSec * sampleRate);
  const overlapSamples = Math.round(overlapSec * sampleRate);

  if (chunkSamples <= 0) {
    return [];
  }

  // If the entire buffer fits in one chunk, return a single chunk
  if (totalSamples <= chunkSamples) {
    return [
      {
        index: 0,
        state: "pending",
        inputStartSample: 0,
        inputEndSample: totalSamples,
        overlapBefore: 0,
        overlapAfter: 0,
        outputBuffer: null,
        outputLength: 0,
        priority: 0,
        retryCount: 0,
      },
    ];
  }

  const chunks: ChunkInfo[] = [];
  let start = 0;
  let index = 0;

  while (start < totalSamples) {
    const isFirst = index === 0;
    const nominalEnd = Math.min(start + chunkSamples, totalSamples);
    const isLast = nominalEnd >= totalSamples;

    // Overlap regions
    const overlapBefore = isFirst ? 0 : Math.min(overlapSamples, start);
    const overlapAfter = isLast ? 0 : Math.min(overlapSamples, totalSamples - nominalEnd);

    // Actual input range includes overlap
    const inputStart = start - overlapBefore;
    const inputEnd = Math.min(nominalEnd + overlapAfter, totalSamples);

    chunks.push({
      index,
      state: "pending",
      inputStartSample: inputStart,
      inputEndSample: inputEnd,
      overlapBefore,
      overlapAfter,
      outputBuffer: null,
      outputLength: 0,
      priority: 0,
      retryCount: 0,
    });

    start = nominalEnd;
    index++;
  }

  return chunks;
}

/**
 * Extract channel data for a specific chunk from an AudioBuffer.
 */
export function extractChunkData(buffer: AudioBuffer, chunk: ChunkInfo): Float32Array[] {
  const channels: Float32Array[] = [];
  const length = chunk.inputEndSample - chunk.inputStartSample;

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const fullChannel = buffer.getChannelData(ch);
    const chunkData = new Float32Array(length);
    chunkData.set(fullChannel.subarray(chunk.inputStartSample, chunk.inputEndSample));
    channels.push(chunkData);
  }

  return channels;
}

/**
 * Get the chunk index that contains the given sample position.
 */
export function getChunkIndexForSample(chunks: ChunkInfo[], sample: number): number {
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const nominalStart = chunk.inputStartSample + chunk.overlapBefore;
    const nominalEnd = chunk.inputEndSample - chunk.overlapAfter;
    if (sample >= nominalStart && sample < nominalEnd) {
      return i;
    }
  }
  // If past the end, return last chunk
  return Math.max(0, chunks.length - 1);
}

/**
 * Get the chunk index that contains the given time position (seconds).
 */
export function getChunkIndexForTime(
  chunks: ChunkInfo[],
  timeSeconds: number,
  sampleRate: number,
): number {
  const sample = Math.round(timeSeconds * sampleRate);
  return getChunkIndexForSample(chunks, sample);
}
