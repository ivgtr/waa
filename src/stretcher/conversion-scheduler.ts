// ---------------------------------------------------------------------------
// Stretcher: Conversion scheduler
// ---------------------------------------------------------------------------

import {
  CANCEL_DISTANCE_THRESHOLD,
  CHUNK_DURATION_SEC,
  KEEP_AHEAD_CHUNKS,
  KEEP_AHEAD_SECONDS,
  KEEP_BEHIND_CHUNKS,
  KEEP_BEHIND_SECONDS,
  MAX_CHUNK_RETRIES,
  PRIORITY_BACKWARD_WEIGHT,
  PRIORITY_FORWARD_WEIGHT,
} from "./constants.js";
import { createPriorityQueue } from "./priority-queue.js";
import type {
  ChunkInfo,
  ConversionScheduler,
  ConversionSchedulerOptions,
  WorkerManager,
} from "./types.js";

interface TempoCache {
  tempo: number;
  chunks: Array<{ outputBuffer: Float32Array[] | null; outputLength: number }>;
}

/**
 * Create a conversion scheduler that manages chunk priorities and dispatching.
 */
export function createConversionScheduler(
  chunks: ChunkInfo[],
  workerManager: WorkerManager,
  extractChunkData: (chunkIndex: number) => Float32Array[],
  sampleRate: number,
  tempo: number,
  options?: Partial<ConversionSchedulerOptions>,
  onChunkReady?: (chunkIndex: number) => void,
  onChunkFailed?: (chunkIndex: number, error: string) => void,
): ConversionScheduler {
  const forwardWeight = options?.forwardWeight ?? PRIORITY_FORWARD_WEIGHT;
  const backwardWeight = options?.backwardWeight ?? PRIORITY_BACKWARD_WEIGHT;
  const cancelDistThreshold = options?.cancelDistanceThreshold ?? CANCEL_DISTANCE_THRESHOLD;
  const keepAhead =
    options?.keepAheadChunks ??
    Math.max(KEEP_AHEAD_CHUNKS, Math.ceil(KEEP_AHEAD_SECONDS / CHUNK_DURATION_SEC));
  const keepBehind =
    options?.keepBehindChunks ??
    Math.max(KEEP_BEHIND_CHUNKS, Math.ceil(KEEP_BEHIND_SECONDS / CHUNK_DURATION_SEC));

  function isInActiveWindow(chunkIndex: number, playheadIndex: number): boolean {
    const dist = chunkIndex - playheadIndex;
    return dist <= keepAhead && dist >= -keepBehind;
  }

  let currentTempo = tempo;
  let currentChunkIdx = 0;
  let previousTempoCache: TempoCache | null = null;
  let disposed = false;

  const queue = createPriorityQueue<ChunkInfo>((a, b) => a.priority - b.priority);

  function calcPriority(chunkIndex: number, playheadIndex: number): number {
    const distance = chunkIndex - playheadIndex;
    if (distance >= 0) {
      return distance * forwardWeight;
    }
    return Math.abs(distance) * backwardWeight;
  }

  function updatePriorities(playheadIndex: number): void {
    currentChunkIdx = playheadIndex;
    queue.clear();

    for (const chunk of chunks) {
      if (chunk.state === "pending" || chunk.state === "queued" || chunk.state === "failed") {
        chunk.priority = calcPriority(chunk.index, playheadIndex);
        chunk.state = "queued";
        queue.enqueue(chunk);
      } else if (chunk.state === "evicted" && isInActiveWindow(chunk.index, playheadIndex)) {
        chunk.state = "queued";
        chunk.retryCount = 0;
        chunk.priority = calcPriority(chunk.index, playheadIndex);
        queue.enqueue(chunk);
      }
    }

    // Cancel converting chunks that are too far from playhead
    for (const chunk of chunks) {
      if (chunk.state === "converting") {
        const dist = Math.abs(chunk.index - playheadIndex);
        if (dist > cancelDistThreshold) {
          workerManager.cancelChunk(chunk.index);
        }
      }
    }
  }

  function dispatchNext(): void {
    if (disposed) return;

    while (workerManager.hasCapacity()) {
      let nextChunk = queue.dequeue();
      while (nextChunk && nextChunk.state === "ready") {
        nextChunk = queue.dequeue();
      }
      if (!nextChunk) return;

      if (
        nextChunk.state !== "queued" &&
        nextChunk.state !== "pending" &&
        nextChunk.state !== "failed"
      ) {
        continue;
      }

      nextChunk.state = "converting";
      const data = extractChunkData(nextChunk.index);
      workerManager.postConvert(nextChunk.index, data, currentTempo, sampleRate);
    }
  }

  function handleResult(
    chunkIndex: number,
    outputData: Float32Array[],
    outputLength: number,
  ): void {
    const chunk = chunks[chunkIndex];
    if (!chunk) return;
    if (chunk.state !== "converting") {
      dispatchNext();
      return;
    }
    chunk.state = "ready";
    chunk.outputBuffer = outputData;
    chunk.outputLength = outputLength;
    onChunkReady?.(chunkIndex);
    dispatchNext();
  }

  function handleError(chunkIndex: number, error: string): void {
    const chunk = chunks[chunkIndex];
    if (!chunk) return;

    chunk.retryCount++;
    if (chunk.retryCount < MAX_CHUNK_RETRIES) {
      chunk.state = "queued";
      chunk.priority = calcPriority(chunk.index, currentChunkIdx);
      queue.enqueue(chunk);
    } else {
      chunk.state = "failed";
      onChunkFailed?.(chunkIndex, error);
    }
    dispatchNext();
  }

  function handleSeek(newChunkIndex: number): void {
    // Cancel converting chunks that are far from the new playhead
    for (const chunk of chunks) {
      if (chunk.state === "converting") {
        const dist = Math.abs(chunk.index - newChunkIndex);
        if (dist > cancelDistThreshold) {
          workerManager.cancelChunk(chunk.index);
        }
      }
    }

    updatePriorities(newChunkIndex);
    dispatchNext();
  }

  function handleTempoChange(newTempo: number): void {
    // Save current results as previous tempo cache (window内のみ保持)
    previousTempoCache = {
      tempo: currentTempo,
      chunks: chunks.map((c) => {
        if (isInActiveWindow(c.index, currentChunkIdx) && c.outputBuffer) {
          return { outputBuffer: c.outputBuffer, outputLength: c.outputLength };
        }
        return { outputBuffer: null, outputLength: 0 };
      }),
    };

    currentTempo = newTempo;
    workerManager.cancelCurrent();

    for (const chunk of chunks) {
      if (chunk.state === "evicted") continue;

      if (isInActiveWindow(chunk.index, currentChunkIdx)) {
        chunk.outputBuffer = null;
        chunk.outputLength = 0;
        chunk.state = "pending";
        chunk.retryCount = 0;
      } else {
        chunk.outputBuffer = null;
        chunk.outputLength = 0;
        chunk.state = "evicted";
      }
    }

    updatePriorities(currentChunkIdx);
    dispatchNext();
  }

  function restorePreviousTempo(): boolean {
    if (!previousTempoCache) return false;

    currentTempo = previousTempoCache.tempo;

    // Restore cached buffers
    for (let i = 0; i < chunks.length; i++) {
      const cached = previousTempoCache.chunks[i];
      const chunk = chunks[i];
      if (chunk && cached?.outputBuffer) {
        chunk.outputBuffer = cached.outputBuffer;
        chunk.outputLength = cached.outputLength;
        chunk.state = "ready";
      }
    }

    previousTempoCache = null;

    // Cancel all current conversions and re-evaluate remaining
    workerManager.cancelCurrent();

    updatePriorities(currentChunkIdx);
    dispatchNext();
    return true;
  }

  function start(playheadIndex: number): void {
    updatePriorities(playheadIndex);
    dispatchNext();
  }

  return {
    start,
    updatePriorities,
    handleSeek,
    handleTempoChange,
    restorePreviousTempo,
    dispatchNext,
    getChunks: () => chunks,
    dispose(): void {
      disposed = true;
      queue.clear();
    },
    // Expose internal handlers for the engine to wire up
    _handleResult: handleResult,
    _handleError: handleError,
  } as ConversionScheduler & {
    _handleResult: typeof handleResult;
    _handleError: typeof handleError;
  };
}
