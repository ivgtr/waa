// ---------------------------------------------------------------------------
// Stretcher: Conversion scheduler
// ---------------------------------------------------------------------------

import {
  PRIORITY_FORWARD_WEIGHT,
  PRIORITY_BACKWARD_WEIGHT,
  CANCEL_DISTANCE_THRESHOLD,
  MAX_CHUNK_RETRIES,
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
  const cancelDistThreshold =
    options?.cancelDistanceThreshold ?? CANCEL_DISTANCE_THRESHOLD;

  let currentTempo = tempo;
  let currentChunkIdx = 0;
  let previousTempoCache: TempoCache | null = null;
  let disposed = false;

  const queue = createPriorityQueue<ChunkInfo>(
    (a, b) => a.priority - b.priority,
  );

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
      if (
        chunk.state === "pending" ||
        chunk.state === "queued" ||
        chunk.state === "failed"
      ) {
        chunk.priority = calcPriority(chunk.index, playheadIndex);
        chunk.state = "queued";
        queue.enqueue(chunk);
      }
    }

    // Cancel current conversion if it's too far from playhead
    if (workerManager.isBusy()) {
      const currentConvertIdx = workerManager.getCurrentChunkIndex();
      if (currentConvertIdx !== null) {
        const dist = Math.abs(currentConvertIdx - playheadIndex);
        if (dist > cancelDistThreshold) {
          workerManager.cancelCurrent();
        }
      }
    }
  }

  function dispatchNext(): void {
    if (disposed || workerManager.isBusy()) return;

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
      return;
    }

    nextChunk.state = "converting";
    const data = extractChunkData(nextChunk.index);
    workerManager.postConvert(
      nextChunk.index,
      data,
      currentTempo,
      sampleRate,
    );
  }

  function handleResult(
    chunkIndex: number,
    outputData: Float32Array[],
    outputLength: number,
  ): void {
    const chunk = chunks[chunkIndex];
    if (!chunk) return;
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
    const oldIndex = currentChunkIdx;
    const dist = Math.abs(newChunkIndex - oldIndex);

    if (dist > cancelDistThreshold && workerManager.isBusy()) {
      workerManager.cancelCurrent();
    }

    updatePriorities(newChunkIndex);
    dispatchNext();
  }

  function handleTempoChange(newTempo: number): void {
    // Save current results as previous tempo cache
    previousTempoCache = {
      tempo: currentTempo,
      chunks: chunks.map((c) => ({
        outputBuffer: c.outputBuffer,
        outputLength: c.outputLength,
      })),
    };

    currentTempo = newTempo;

    // Cancel current conversion
    if (workerManager.isBusy()) {
      workerManager.cancelCurrent();
    }

    // Reset all chunks (except evicted)
    for (const chunk of chunks) {
      if (chunk.state !== "evicted") {
        chunk.outputBuffer = null;
        chunk.outputLength = 0;
        chunk.state = "pending";
        chunk.retryCount = 0;
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

    // Cancel current and re-evaluate remaining
    if (workerManager.isBusy()) {
      workerManager.cancelCurrent();
    }

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
