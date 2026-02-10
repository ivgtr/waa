// ---------------------------------------------------------------------------
// Stretcher: Main-thread WSOLA processor (fallback for environments without
// Worker support, e.g. iOS Safari 14-, strict CSP)
// ---------------------------------------------------------------------------

import type { WorkerManager, WorkerResponse } from "./types.js";
import { wsolaTimeStretch } from "./wsola.js";

/**
 * Create a WorkerManager-compatible processor that runs WSOLA on the main
 * thread. Used as a fallback when Blob URL Workers are not available.
 */
export function createMainThreadProcessor(
  onResult: (response: WorkerResponse) => void,
  onError: (response: WorkerResponse) => void,
): WorkerManager {
  let terminated = false;
  const postTimes = new Map<number, number>();

  // Track the current conversion so it can be cancelled
  let currentChunkIndex: number | null = null;
  const cancelledChunks = new Set<number>();
  let busy = false;

  return {
    postConvert(
      chunkIndex: number,
      inputData: Float32Array[],
      tempo: number,
      sampleRate: number,
    ): void {
      if (terminated) return;

      busy = true;
      currentChunkIndex = chunkIndex;
      postTimes.set(chunkIndex, performance.now());

      // Run asynchronously to avoid blocking the caller
      setTimeout(() => {
        if (terminated) return;

        if (cancelledChunks.has(chunkIndex)) {
          cancelledChunks.delete(chunkIndex);
          busy = false;
          currentChunkIndex = null;
          onResult({ type: "cancelled", chunkIndex });
          return;
        }

        try {
          const result = wsolaTimeStretch(inputData, tempo, sampleRate);

          if (cancelledChunks.has(chunkIndex)) {
            cancelledChunks.delete(chunkIndex);
            busy = false;
            currentChunkIndex = null;
            onResult({ type: "cancelled", chunkIndex });
            return;
          }

          busy = false;
          currentChunkIndex = null;
          onResult({
            type: "result",
            chunkIndex,
            outputData: result.output,
            outputLength: result.length,
          });
        } catch (err) {
          busy = false;
          currentChunkIndex = null;
          onError({
            type: "error",
            chunkIndex,
            error: String(err),
          });
        }
      }, 0);
    },

    cancelCurrent(): void {
      if (terminated) return;
      if (currentChunkIndex !== null) {
        cancelledChunks.add(currentChunkIndex);
      }
    },

    cancelChunk(chunkIndex: number): void {
      if (terminated) return;
      cancelledChunks.add(chunkIndex);
    },

    isBusy(): boolean {
      return busy;
    },

    hasCapacity(): boolean {
      return !busy;
    },

    getCurrentChunkIndex(): number | null {
      return currentChunkIndex;
    },

    getLastPostTime(): number | null {
      let latest: number | null = null;
      for (const t of postTimes.values()) {
        if (latest === null || t > latest) {
          latest = t;
        }
      }
      return latest;
    },

    getPostTimeForChunk(chunkIndex: number): number | null {
      return postTimes.get(chunkIndex) ?? null;
    },

    terminate(): void {
      if (terminated) return;
      terminated = true;
      cancelledChunks.clear();
      postTimes.clear();
    },
  };
}
