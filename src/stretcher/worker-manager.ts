// ---------------------------------------------------------------------------
// Stretcher: Worker manager
// ---------------------------------------------------------------------------

import { MAX_WORKER_CRASHES } from "./constants.js";
import { createWorkerURL, revokeWorkerURL } from "./worker-inline.js";
import type { WorkerManager, WorkerResponse } from "./types.js";

/**
 * Create a Worker manager that handles Worker lifecycle, messaging, and crash recovery.
 */
export function createWorkerManager(
  onResult: (response: WorkerResponse) => void,
  onError: (response: WorkerResponse) => void,
  maxCrashes: number = MAX_WORKER_CRASHES,
): WorkerManager {
  let workerURL: string | null = null;
  let worker: Worker | null = null;
  let crashCount = 0;
  let busy = false;
  let currentChunkIndex: number | null = null;
  let terminated = false;

  function spawnWorker(): void {
    if (terminated) return;

    workerURL = createWorkerURL();
    worker = new Worker(workerURL);

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const response = e.data;

      if (response.type === "result" || response.type === "cancelled") {
        busy = false;
        currentChunkIndex = null;
      }

      if (response.type === "error") {
        busy = false;
        currentChunkIndex = null;
        onError(response);
        return;
      }

      onResult(response);
    };

    worker.onerror = (e: ErrorEvent) => {
      e.preventDefault();
      busy = false;
      const failedChunkIndex = currentChunkIndex;
      currentChunkIndex = null;

      crashCount++;

      if (failedChunkIndex !== null) {
        onError({
          type: "error",
          chunkIndex: failedChunkIndex,
          error: `Worker crashed: ${e.message}`,
        });
      }

      // Cleanup current worker
      if (worker) {
        worker.onmessage = null;
        worker.onerror = null;
        worker.terminate();
        worker = null;
      }
      if (workerURL) {
        revokeWorkerURL(workerURL);
        workerURL = null;
      }

      // Auto-respawn if under crash limit
      if (crashCount < maxCrashes) {
        spawnWorker();
      } else {
        onError({
          type: "error",
          chunkIndex: failedChunkIndex ?? -1,
          error: `Worker crashed ${crashCount} times, giving up`,
        });
      }
    };
  }

  // Initial spawn
  spawnWorker();

  return {
    postConvert(
      chunkIndex: number,
      inputData: Float32Array[],
      tempo: number,
      sampleRate: number,
    ): void {
      if (terminated || !worker) return;
      busy = true;
      currentChunkIndex = chunkIndex;

      // Transfer the buffers for zero-copy
      const transferables = inputData.map((ch) => ch.buffer);
      worker.postMessage(
        { type: "convert", chunkIndex, inputData, tempo, sampleRate },
        transferables,
      );
    },

    cancelCurrent(): void {
      if (terminated || !worker || !busy) return;
      worker.postMessage({ type: "cancel", chunkIndex: currentChunkIndex });
    },

    isBusy(): boolean {
      return busy;
    },

    getCurrentChunkIndex(): number | null {
      return currentChunkIndex;
    },

    terminate(): void {
      if (terminated) return;
      terminated = true;
      if (worker) {
        worker.onmessage = null;
        worker.onerror = null;
        worker.terminate();
        worker = null;
      }
      if (workerURL) {
        revokeWorkerURL(workerURL);
        workerURL = null;
      }
    },
  };
}
