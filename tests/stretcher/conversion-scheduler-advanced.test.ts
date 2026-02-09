import { describe, it, expect, vi } from "vitest";
import { createConversionScheduler } from "../../src/stretcher/conversion-scheduler";
import type { ChunkInfo, WorkerManager } from "../../src/stretcher/types";

function makeChunks(count: number): ChunkInfo[] {
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    state: "pending" as const,
    inputStartSample: i * 44100 * 5,
    inputEndSample: (i + 1) * 44100 * 5,
    overlapBefore: i === 0 ? 0 : 8820,
    overlapAfter: i === count - 1 ? 0 : 8820,
    outputBuffer: null,
    outputLength: 0,
    priority: 0,
    retryCount: 0,
  }));
}

function createMockWorkerManager(): WorkerManager & {
  posted: Array<{ chunkIndex: number; tempo: number }>;
  cancelFn: ReturnType<typeof vi.fn>;
  cancelChunkFn: ReturnType<typeof vi.fn>;
  simulateResult(chunkIndex: number): void;
  setCapacity(cap: boolean): void;
} {
  let busy = false;
  let cap = true;
  let currentIdx: number | null = null;
  const posted: Array<{ chunkIndex: number; tempo: number }> = [];
  const cancelFn = vi.fn(() => {
    busy = false;
    currentIdx = null;
  });
  const cancelChunkFn = vi.fn((_chunkIndex: number) => {
    busy = false;
    currentIdx = null;
  });

  return {
    posted,
    cancelFn,
    cancelChunkFn,
    simulateResult(_chunkIndex: number) {
      busy = false;
      currentIdx = null;
    },
    setCapacity(newCap: boolean) {
      cap = newCap;
    },
    postConvert(chunkIndex, _inputData, tempo, _sampleRate) {
      busy = true;
      currentIdx = chunkIndex;
      posted.push({ chunkIndex, tempo });
    },
    cancelCurrent: cancelFn,
    cancelChunk: cancelChunkFn,
    isBusy: () => busy,
    hasCapacity: () => cap && !busy,
    getCurrentChunkIndex: () => currentIdx,
    getLastPostTime: () => null,
    getPostTimeForChunk: () => null,
    terminate() {
      busy = false;
      currentIdx = null;
    },
  };
}

describe("createConversionScheduler – advanced", () => {
  it("skips ready chunks in the queue", () => {
    const chunks = makeChunks(5);
    const wm = createMockWorkerManager();
    const extractData = vi.fn(() => [new Float32Array(1024)]);

    const scheduler = createConversionScheduler(
      chunks, wm, extractData, 44100, 1.0,
    );

    scheduler.start(0);

    // Mark chunk 0 as ready via _handleResult
    wm.simulateResult(0);
    (scheduler as any)._handleResult(0, [new Float32Array(1024)], 1024);
    expect(chunks[0]!.state).toBe("ready");

    // The next dispatch should skip chunk 0 and dispatch chunk 1
    const latestPost = wm.posted[wm.posted.length - 1]!;
    expect(latestPost.chunkIndex).toBe(1);

    scheduler.dispose();
  });

  it("returns immediately when hasCapacity is false", () => {
    const chunks = makeChunks(5);
    const wm = createMockWorkerManager();
    const extractData = vi.fn(() => [new Float32Array(1024)]);

    const scheduler = createConversionScheduler(
      chunks, wm, extractData, 44100, 1.0,
    );

    // Fill capacity
    wm.setCapacity(false);

    scheduler.start(0);

    // Nothing should be dispatched
    expect(wm.posted).toHaveLength(0);

    scheduler.dispose();
  });

  it("double tempo change → restorePreviousTempo uses first tempo's cache", () => {
    const chunks = makeChunks(3);
    const wm = createMockWorkerManager();
    const extractData = vi.fn(() => [new Float32Array(1024)]);

    const scheduler = createConversionScheduler(
      chunks, wm, extractData, 44100, 1.0,
    );

    scheduler.start(0);

    // Complete all chunks at tempo 1.0
    const buf = [new Float32Array(1024)];
    for (let i = 0; i < 3; i++) {
      wm.simulateResult(i);
      (scheduler as any)._handleResult(i, buf, 1024);
    }

    // First tempo change (1.0 → 1.5)
    scheduler.handleTempoChange(1.5);

    // Complete some chunks at tempo 1.5
    wm.simulateResult(0);
    (scheduler as any)._handleResult(0, buf, 512);

    // Second tempo change (1.5 → 2.0)
    // This overwrites the previous cache with tempo 1.5 data
    scheduler.handleTempoChange(2.0);

    // Restore should go back to tempo 1.5 (not 1.0)
    const restored = scheduler.restorePreviousTempo();
    expect(restored).toBe(true);

    // Chunk 0 was ready at tempo 1.5 → should be restored
    expect(chunks[0]!.state).toBe("ready");

    scheduler.dispose();
  });

  it("restorePreviousTempo returns false when no cache exists", () => {
    const chunks = makeChunks(3);
    const wm = createMockWorkerManager();
    const extractData = vi.fn(() => [new Float32Array(1024)]);

    const scheduler = createConversionScheduler(
      chunks, wm, extractData, 44100, 1.0,
    );

    scheduler.start(0);

    const restored = scheduler.restorePreviousTempo();
    expect(restored).toBe(false);

    scheduler.dispose();
  });

  it("dispose then dispatchNext → safe (no dispatch)", () => {
    const chunks = makeChunks(5);
    const wm = createMockWorkerManager();
    const extractData = vi.fn(() => [new Float32Array(1024)]);

    const scheduler = createConversionScheduler(
      chunks, wm, extractData, 44100, 1.0,
    );

    scheduler.start(0);
    const initialCount = wm.posted.length;

    scheduler.dispose();

    // Calling dispatchNext after dispose should be safe
    expect(() => scheduler.dispatchNext()).not.toThrow();
    expect(wm.posted.length).toBe(initialCount);
  });

  it("evicted chunk re-entering active window resets retryCount", () => {
    const chunks = makeChunks(20);
    const wm = createMockWorkerManager();
    const extractData = vi.fn(() => [new Float32Array(1024)]);

    const scheduler = createConversionScheduler(
      chunks, wm, extractData, 44100, 1.0,
      { keepAheadChunks: 3, keepBehindChunks: 2 },
    );

    scheduler.start(0);

    // Manually set chunk 10 as evicted with retryCount > 0
    chunks[10]!.state = "evicted";
    chunks[10]!.retryCount = 2;

    // Move playhead near chunk 10
    wm.simulateResult(0);
    scheduler.handleSeek(10);

    // Chunk 10 should be re-queued with reset retryCount
    expect(chunks[10]!.state).not.toBe("evicted");
    expect(chunks[10]!.retryCount).toBe(0);

    scheduler.dispose();
  });

  it("updatePriorities with cancelDistThreshold boundary", () => {
    const chunks = makeChunks(15);
    const wm = createMockWorkerManager();
    const extractData = vi.fn(() => [new Float32Array(1024)]);

    const scheduler = createConversionScheduler(
      chunks, wm, extractData, 44100, 1.0,
      { cancelDistanceThreshold: 3 },
    );

    scheduler.start(0);

    // Mark chunk 0 as converting (simulating active conversion)
    // Actually it should already be converting after start

    // Move playhead to 4 — chunk 0 is distance 4 > threshold 3
    wm.simulateResult(0);
    chunks[0]!.state = "converting";
    scheduler.updatePriorities(4);

    expect(wm.cancelChunkFn).toHaveBeenCalledWith(0);

    // But chunk 2 at distance 2 should NOT be cancelled
    chunks[2]!.state = "converting";
    wm.cancelChunkFn.mockClear();
    scheduler.updatePriorities(4);

    expect(wm.cancelChunkFn).not.toHaveBeenCalledWith(2);

    scheduler.dispose();
  });

  it("onChunkFailed callback is called after max retries", () => {
    const chunks = makeChunks(3);
    const wm = createMockWorkerManager();
    const extractData = vi.fn(() => [new Float32Array(1024)]);
    const onFailed = vi.fn();

    const scheduler = createConversionScheduler(
      chunks, wm, extractData, 44100, 1.0,
      undefined, undefined, onFailed,
    );

    scheduler.start(0);

    // Simulate 3 failures (MAX_CHUNK_RETRIES = 3)
    wm.simulateResult(0);
    (scheduler as any)._handleError(0, "error");
    wm.simulateResult(0);
    (scheduler as any)._handleError(0, "error");
    wm.simulateResult(0);
    (scheduler as any)._handleError(0, "error");

    expect(onFailed).toHaveBeenCalledWith(0, "error");
    expect(chunks[0]!.state).toBe("failed");

    scheduler.dispose();
  });

  it("handleResult with invalid chunk index is safe", () => {
    const chunks = makeChunks(3);
    const wm = createMockWorkerManager();
    const extractData = vi.fn(() => [new Float32Array(1024)]);

    const scheduler = createConversionScheduler(
      chunks, wm, extractData, 44100, 1.0,
    );

    scheduler.start(0);

    // Pass an out-of-bounds index
    expect(() => {
      (scheduler as any)._handleResult(99, [new Float32Array(1024)], 1024);
    }).not.toThrow();

    scheduler.dispose();
  });
});
