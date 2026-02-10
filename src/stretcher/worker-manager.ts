// ---------------------------------------------------------------------------
// Stretcher: Worker manager (pool)
// ---------------------------------------------------------------------------

import { MAX_WORKER_CRASHES, WORKER_POOL_SIZE } from "./constants.js";
import type { WorkerManager, WorkerResponse } from "./types.js";
import { createWorkerURL, revokeWorkerURL } from "./worker-inline.js";

interface WorkerSlot {
  worker: Worker | null;
  busy: boolean;
  currentChunkIndex: number | null;
  crashCount: number;
}

/**
 * Create a Worker manager that uses a pool of Workers for parallel conversion.
 */
export function createWorkerManager(
  onResult: (response: WorkerResponse) => void,
  onError: (response: WorkerResponse) => void,
  maxCrashes: number = MAX_WORKER_CRASHES,
  poolSize: number = WORKER_POOL_SIZE,
  onAllDead?: () => void,
): WorkerManager {
  let workerURL: string | null = null;
  let terminated = false;
  const postTimes = new Map<number, number>();

  const slots: WorkerSlot[] = [];

  function ensureWorkerURL(): string {
    if (!workerURL) {
      workerURL = createWorkerURL();
    }
    return workerURL;
  }

  function isAllDead(): boolean {
    return slots.every((s) => s.worker === null);
  }

  function spawnWorkerForSlot(slot: WorkerSlot): void {
    if (terminated) return;

    const url = ensureWorkerURL();
    let worker: Worker;
    try {
      worker = new Worker(url);
    } catch {
      // Blob URL Worker not supported (e.g. iOS Safari 14-, strict CSP)
      slot.worker = null;
      return;
    }

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const response = e.data;

      if (response.type === "result" || response.type === "cancelled") {
        slot.busy = false;
        slot.currentChunkIndex = null;
      }

      if (response.type === "error") {
        slot.busy = false;
        slot.currentChunkIndex = null;
        onError(response);
        return;
      }

      onResult(response);
    };

    worker.onerror = (e: ErrorEvent) => {
      e.preventDefault();
      slot.busy = false;
      const failedChunkIndex = slot.currentChunkIndex;
      slot.currentChunkIndex = null;

      slot.crashCount++;

      if (failedChunkIndex !== null) {
        onError({
          type: "error",
          chunkIndex: failedChunkIndex,
          error: `Worker crashed: ${e.message}`,
        });
      }

      // Cleanup crashed worker
      if (slot.worker) {
        slot.worker.onmessage = null;
        slot.worker.onerror = null;
        slot.worker.terminate();
        slot.worker = null;
      }

      // Auto-respawn if under crash limit
      if (slot.crashCount < maxCrashes) {
        spawnWorkerForSlot(slot);
      } else {
        onError({
          type: "error",
          chunkIndex: failedChunkIndex ?? -1,
          error: `Worker crashed ${slot.crashCount} times, giving up`,
        });
        if (isAllDead()) {
          onAllDead?.();
        }
      }
    };

    slot.worker = worker;
  }

  // Initialize pool
  for (let i = 0; i < poolSize; i++) {
    const slot: WorkerSlot = {
      worker: null,
      busy: false,
      currentChunkIndex: null,
      crashCount: 0,
    };
    slots.push(slot);
    spawnWorkerForSlot(slot);
  }

  // If all Workers failed to spawn, notify immediately
  if (isAllDead()) {
    onAllDead?.();
  }

  function findFreeSlot(): WorkerSlot | null {
    for (const slot of slots) {
      if (!slot.busy && slot.worker) {
        return slot;
      }
    }
    return null;
  }

  function findSlotByChunk(chunkIndex: number): WorkerSlot | null {
    for (const slot of slots) {
      if (slot.busy && slot.currentChunkIndex === chunkIndex) {
        return slot;
      }
    }
    return null;
  }

  return {
    postConvert(
      chunkIndex: number,
      inputData: Float32Array[],
      tempo: number,
      sampleRate: number,
    ): void {
      if (terminated) return;

      const slot = findFreeSlot();
      if (!slot || !slot.worker) return;

      slot.busy = true;
      slot.currentChunkIndex = chunkIndex;
      postTimes.set(chunkIndex, performance.now());

      // Transfer the buffers for zero-copy
      const transferables = inputData.map((ch) => ch.buffer);
      slot.worker.postMessage(
        { type: "convert", chunkIndex, inputData, tempo, sampleRate },
        transferables,
      );
    },

    cancelCurrent(): void {
      if (terminated) return;
      for (const slot of slots) {
        if (slot.busy && slot.worker && slot.currentChunkIndex !== null) {
          slot.worker.postMessage({ type: "cancel", chunkIndex: slot.currentChunkIndex });
        }
      }
    },

    cancelChunk(chunkIndex: number): void {
      if (terminated) return;
      const slot = findSlotByChunk(chunkIndex);
      if (slot?.worker) {
        slot.worker.postMessage({ type: "cancel", chunkIndex });
      }
    },

    isBusy(): boolean {
      return slots.every((s) => s.busy || !s.worker);
    },

    hasCapacity(): boolean {
      return findFreeSlot() !== null;
    },

    getCurrentChunkIndex(): number | null {
      // Return the first busy slot's chunk index for backwards compat
      for (const slot of slots) {
        if (slot.busy && slot.currentChunkIndex !== null) {
          return slot.currentChunkIndex;
        }
      }
      return null;
    },

    getLastPostTime(): number | null {
      // Return the most recent post time across all chunks
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
      for (const slot of slots) {
        if (slot.worker) {
          slot.worker.onmessage = null;
          slot.worker.onerror = null;
          slot.worker.terminate();
          slot.worker = null;
        }
      }
      if (workerURL) {
        revokeWorkerURL(workerURL);
        workerURL = null;
      }
      postTimes.clear();
    },
  };
}
