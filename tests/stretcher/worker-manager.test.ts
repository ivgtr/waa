import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  stubWorkerGlobals,
  type MockWorker,
} from "../helpers/audio-mocks";

// ---------------------------------------------------------------------------
// Setup Worker stubs
// ---------------------------------------------------------------------------

const workerStubs = stubWorkerGlobals();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let createWorkerManager: (typeof import("../../src/stretcher/worker-manager"))["createWorkerManager"];

describe("createWorkerManager", () => {
  let onResult: ReturnType<typeof vi.fn>;
  let onError: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    workerStubs.workers.length = 0;
    vi.clearAllMocks();
    onResult = vi.fn();
    onError = vi.fn();
    const mod = await import("../../src/stretcher/worker-manager");
    createWorkerManager = mod.createWorkerManager;
  });

  // -----------------------------------------------------------------------
  // Pool initialization
  // -----------------------------------------------------------------------

  describe("pool initialization", () => {
    it("creates the specified number of workers", () => {
      createWorkerManager(onResult, onError, 3, 2);
      expect(workerStubs.workers.length).toBe(2);
    });

    it("creates default number of workers (WORKER_POOL_SIZE)", () => {
      createWorkerManager(onResult, onError);
      // Default pool size is 2
      expect(workerStubs.workers.length).toBe(2);
    });

    it("calls onAllDead if all workers fail to spawn", () => {
      // Make Worker constructor throw
      const originalWorker = globalThis.Worker;
      vi.stubGlobal("Worker", vi.fn(function MockWorkerCtor() {
        throw new Error("Worker not supported");
      }));

      const onAllDead = vi.fn();
      createWorkerManager(onResult, onError, 3, 2, onAllDead);

      expect(onAllDead).toHaveBeenCalledTimes(1);

      // Restore
      vi.stubGlobal("Worker", originalWorker);
    });
  });

  // -----------------------------------------------------------------------
  // postConvert
  // -----------------------------------------------------------------------

  describe("postConvert", () => {
    it("posts a convert message to a free worker", () => {
      const manager = createWorkerManager(onResult, onError, 3, 2);
      const inputData = [new Float32Array(1024)];

      manager.postConvert(0, inputData, 1.0, 44100);

      const worker = workerStubs.workers[0]!;
      expect(worker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "convert",
          chunkIndex: 0,
          tempo: 1.0,
          sampleRate: 44100,
        }),
        expect.any(Array), // transferables
      );
    });

    it("distributes work across multiple workers", () => {
      const manager = createWorkerManager(onResult, onError, 3, 2);
      const data1 = [new Float32Array(1024)];
      const data2 = [new Float32Array(1024)];

      manager.postConvert(0, data1, 1.0, 44100);
      manager.postConvert(1, data2, 1.0, 44100);

      expect(workerStubs.workers[0]!.postMessage).toHaveBeenCalledTimes(1);
      expect(workerStubs.workers[1]!.postMessage).toHaveBeenCalledTimes(1);
    });

    it("does nothing when no free workers available", () => {
      const manager = createWorkerManager(onResult, onError, 3, 2);

      // Fill both workers
      manager.postConvert(0, [new Float32Array(1024)], 1.0, 44100);
      manager.postConvert(1, [new Float32Array(1024)], 1.0, 44100);

      // Third call should not crash
      const data3 = [new Float32Array(1024)];
      manager.postConvert(2, data3, 1.0, 44100);

      // Only 2 calls total (one per worker)
      const totalCalls = workerStubs.workers.reduce(
        (sum, w) => sum + w.postMessage.mock.calls.length,
        0,
      );
      expect(totalCalls).toBe(2);
    });

    it("does nothing after terminate", () => {
      const manager = createWorkerManager(onResult, onError, 3, 2);
      manager.terminate();

      manager.postConvert(0, [new Float32Array(1024)], 1.0, 44100);
      expect(workerStubs.workers[0]!.postMessage).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Worker onmessage – result
  // -----------------------------------------------------------------------

  describe("worker onmessage – result", () => {
    it("calls onResult and frees worker slot on result", () => {
      const manager = createWorkerManager(onResult, onError, 3, 2);
      manager.postConvert(0, [new Float32Array(1024)], 1.0, 44100);

      workerStubs.simulateWorkerResult(0, 0, 512);

      expect(onResult).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "result",
          chunkIndex: 0,
        }),
      );

      // Worker slot should be free now
      expect(manager.hasCapacity()).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Worker onmessage – cancelled
  // -----------------------------------------------------------------------

  describe("worker onmessage – cancelled", () => {
    it("calls onResult and frees worker slot on cancel", () => {
      const manager = createWorkerManager(onResult, onError, 3, 2);
      manager.postConvert(0, [new Float32Array(1024)], 1.0, 44100);

      workerStubs.simulateWorkerCancel(0, 0);

      expect(onResult).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "cancelled",
          chunkIndex: 0,
        }),
      );

      expect(manager.hasCapacity()).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Worker onmessage – error
  // -----------------------------------------------------------------------

  describe("worker onmessage – error", () => {
    it("calls onError on error response", () => {
      const manager = createWorkerManager(onResult, onError, 3, 2);
      manager.postConvert(0, [new Float32Array(1024)], 1.0, 44100);

      workerStubs.simulateWorkerError(0, 0, "conversion failed");

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          chunkIndex: 0,
          error: "conversion failed",
        }),
      );

      // onResult should not be called for errors
      expect(onResult).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Worker onerror – crash handling
  // -----------------------------------------------------------------------

  describe("worker onerror – crash handling", () => {
    it("respawns worker on crash under maxCrashes", () => {
      const workerCountBefore = workerStubs.workers.length;
      const manager = createWorkerManager(onResult, onError, 3, 2);
      const initialWorkerCount = workerStubs.workers.length;

      manager.postConvert(0, [new Float32Array(1024)], 1.0, 44100);

      workerStubs.simulateWorkerCrash(workerCountBefore, "Crash!");

      // A new worker should have been spawned
      expect(workerStubs.workers.length).toBe(initialWorkerCount + 1);

      // onError should have been called for the failed chunk
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          chunkIndex: 0,
        }),
      );
    });

    it("does not respawn after maxCrashes exceeded", () => {
      const startIdx = workerStubs.workers.length;
      const onAllDead = vi.fn();
      const manager = createWorkerManager(onResult, onError, 2, 1, onAllDead);
      const afterInit = workerStubs.workers.length;

      // First crash → respawn
      manager.postConvert(0, [new Float32Array(1024)], 1.0, 44100);
      workerStubs.simulateWorkerCrash(startIdx, "Crash 1");
      expect(workerStubs.workers.length).toBe(afterInit + 1);

      // Second crash → no more respawn (maxCrashes = 2)
      const respawnedIdx = workerStubs.workers.length - 1;
      manager.postConvert(1, [new Float32Array(1024)], 1.0, 44100);
      workerStubs.simulateWorkerCrash(respawnedIdx, "Crash 2");

      // onAllDead should be called since the only slot is dead
      expect(onAllDead).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // cancelCurrent
  // -----------------------------------------------------------------------

  describe("cancelCurrent", () => {
    it("sends cancel message to all busy workers", () => {
      const manager = createWorkerManager(onResult, onError, 3, 2);
      const startIdx = workerStubs.workers.length - 2;

      manager.postConvert(0, [new Float32Array(1024)], 1.0, 44100);
      manager.postConvert(1, [new Float32Array(1024)], 1.0, 44100);

      manager.cancelCurrent();

      expect(workerStubs.workers[startIdx]!.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "cancel", chunkIndex: 0 }),
      );
      expect(workerStubs.workers[startIdx + 1]!.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "cancel", chunkIndex: 1 }),
      );
    });

    it("does nothing after terminate", () => {
      const startIdx = workerStubs.workers.length;
      const manager = createWorkerManager(onResult, onError, 3, 2);

      manager.postConvert(0, [new Float32Array(1024)], 1.0, 44100);
      manager.terminate();

      const worker = workerStubs.workers[startIdx]!;
      const callsBefore = worker.postMessage.mock.calls.length;

      manager.cancelCurrent();

      // No additional postMessage calls after terminate
      expect(worker.postMessage.mock.calls.length).toBe(callsBefore);
    });
  });

  // -----------------------------------------------------------------------
  // cancelChunk
  // -----------------------------------------------------------------------

  describe("cancelChunk", () => {
    it("sends cancel message to the worker processing that chunk", () => {
      const startIdx = workerStubs.workers.length;
      const manager = createWorkerManager(onResult, onError, 3, 2);

      manager.postConvert(0, [new Float32Array(1024)], 1.0, 44100);
      manager.postConvert(1, [new Float32Array(1024)], 1.0, 44100);

      manager.cancelChunk(0);

      expect(workerStubs.workers[startIdx]!.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "cancel", chunkIndex: 0 }),
      );
      // Worker 1 should not receive cancel
      const worker1PostCalls = workerStubs.workers[startIdx + 1]!.postMessage.mock.calls;
      const cancelCalls = worker1PostCalls.filter(
        (call: any) => call[0]?.type === "cancel",
      );
      expect(cancelCalls.length).toBe(0);
    });

    it("does nothing if chunk is not being processed", () => {
      const startIdx = workerStubs.workers.length;
      const manager = createWorkerManager(onResult, onError, 3, 2);

      manager.postConvert(0, [new Float32Array(1024)], 1.0, 44100);

      // Cancel chunk 5 (not being processed)
      manager.cancelChunk(5);

      // Only the original postConvert call
      const totalPostCalls = workerStubs.workers
        .slice(startIdx)
        .reduce((sum, w) => sum + w.postMessage.mock.calls.length, 0);
      expect(totalPostCalls).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // isBusy / hasCapacity
  // -----------------------------------------------------------------------

  describe("isBusy / hasCapacity", () => {
    it("isBusy returns false initially", () => {
      const manager = createWorkerManager(onResult, onError, 3, 2);
      expect(manager.isBusy()).toBe(false);
    });

    it("hasCapacity returns true initially", () => {
      const manager = createWorkerManager(onResult, onError, 3, 2);
      expect(manager.hasCapacity()).toBe(true);
    });

    it("isBusy returns true when all workers are busy", () => {
      const manager = createWorkerManager(onResult, onError, 3, 2);
      manager.postConvert(0, [new Float32Array(1024)], 1.0, 44100);
      manager.postConvert(1, [new Float32Array(1024)], 1.0, 44100);
      expect(manager.isBusy()).toBe(true);
    });

    it("hasCapacity returns false when all workers are busy", () => {
      const manager = createWorkerManager(onResult, onError, 3, 2);
      manager.postConvert(0, [new Float32Array(1024)], 1.0, 44100);
      manager.postConvert(1, [new Float32Array(1024)], 1.0, 44100);
      expect(manager.hasCapacity()).toBe(false);
    });

    it("slot becomes free after result", () => {
      const startIdx = workerStubs.workers.length;
      const manager = createWorkerManager(onResult, onError, 3, 2);
      manager.postConvert(0, [new Float32Array(1024)], 1.0, 44100);
      manager.postConvert(1, [new Float32Array(1024)], 1.0, 44100);

      expect(manager.hasCapacity()).toBe(false);

      // Complete one
      workerStubs.simulateWorkerResult(startIdx, 0, 512);

      expect(manager.hasCapacity()).toBe(true);
      expect(manager.isBusy()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // getCurrentChunkIndex
  // -----------------------------------------------------------------------

  describe("getCurrentChunkIndex", () => {
    it("returns null when no workers are busy", () => {
      const manager = createWorkerManager(onResult, onError, 3, 2);
      expect(manager.getCurrentChunkIndex()).toBeNull();
    });

    it("returns the first busy worker's chunk index", () => {
      const manager = createWorkerManager(onResult, onError, 3, 2);
      manager.postConvert(5, [new Float32Array(1024)], 1.0, 44100);
      expect(manager.getCurrentChunkIndex()).toBe(5);
    });
  });

  // -----------------------------------------------------------------------
  // getLastPostTime / getPostTimeForChunk
  // -----------------------------------------------------------------------

  describe("getLastPostTime / getPostTimeForChunk", () => {
    it("getLastPostTime returns null initially", () => {
      const manager = createWorkerManager(onResult, onError, 3, 2);
      expect(manager.getLastPostTime()).toBeNull();
    });

    it("getPostTimeForChunk returns null for unknown chunk", () => {
      const manager = createWorkerManager(onResult, onError, 3, 2);
      expect(manager.getPostTimeForChunk(99)).toBeNull();
    });

    it("records post time for chunk", () => {
      const manager = createWorkerManager(onResult, onError, 3, 2);
      manager.postConvert(0, [new Float32Array(1024)], 1.0, 44100);

      const postTime = manager.getPostTimeForChunk(0);
      expect(postTime).not.toBeNull();
      expect(typeof postTime).toBe("number");
    });

    it("getLastPostTime returns the most recent time", () => {
      const manager = createWorkerManager(onResult, onError, 3, 2);
      manager.postConvert(0, [new Float32Array(1024)], 1.0, 44100);
      manager.postConvert(1, [new Float32Array(1024)], 1.0, 44100);

      const lastTime = manager.getLastPostTime();
      const time0 = manager.getPostTimeForChunk(0);
      const time1 = manager.getPostTimeForChunk(1);

      expect(lastTime).not.toBeNull();
      expect(lastTime).toBe(Math.max(time0!, time1!));
    });
  });

  // -----------------------------------------------------------------------
  // terminate
  // -----------------------------------------------------------------------

  describe("terminate", () => {
    it("terminates all workers", () => {
      const startIdx = workerStubs.workers.length;
      const manager = createWorkerManager(onResult, onError, 3, 2);

      manager.terminate();

      for (let i = startIdx; i < workerStubs.workers.length; i++) {
        expect(workerStubs.workers[i]!.terminate).toHaveBeenCalled();
      }
    });

    it("double terminate is safe", () => {
      const manager = createWorkerManager(onResult, onError, 3, 2);
      manager.terminate();
      expect(() => manager.terminate()).not.toThrow();
    });

    it("revokes blob URL on terminate", () => {
      const manager = createWorkerManager(onResult, onError, 3, 2);
      manager.terminate();
      expect(URL.revokeObjectURL).toHaveBeenCalled();
    });
  });
});
