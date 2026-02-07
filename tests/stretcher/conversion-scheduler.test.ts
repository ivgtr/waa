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
} {
  let busy = false;
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
    postConvert(chunkIndex, _inputData, tempo, _sampleRate) {
      busy = true;
      currentIdx = chunkIndex;
      posted.push({ chunkIndex, tempo });
    },
    cancelCurrent: cancelFn,
    cancelChunk: cancelChunkFn,
    isBusy: () => busy,
    hasCapacity: () => !busy,
    getCurrentChunkIndex: () => currentIdx,
    getLastPostTime: () => null,
    getPostTimeForChunk: () => null,
    terminate() {
      busy = false;
      currentIdx = null;
    },
  };
}

describe("createConversionScheduler", () => {
  it("dispatches first chunk with highest priority near playhead", () => {
    const chunks = makeChunks(5);
    const wm = createMockWorkerManager();
    const extractData = vi.fn(() => [new Float32Array(1024)]);

    const scheduler = createConversionScheduler(
      chunks,
      wm,
      extractData,
      44100,
      1.5,
    );

    scheduler.start(0);

    expect(wm.posted).toHaveLength(1);
    expect(wm.posted[0]!.chunkIndex).toBe(0);
    expect(wm.posted[0]!.tempo).toBe(1.5);

    scheduler.dispose();
  });

  it("updates priorities on seek", () => {
    const chunks = makeChunks(10);
    const wm = createMockWorkerManager();
    const extractData = vi.fn(() => [new Float32Array(1024)]);

    const scheduler = createConversionScheduler(
      chunks,
      wm,
      extractData,
      44100,
      1.0,
    );

    scheduler.start(0);

    // Simulate Worker returning result for chunk 0
    wm.simulateResult(0);
    (scheduler as any)._handleResult(0, [new Float32Array(1024)], 1024);

    // Simulate Worker returning result for chunk 1 (dispatched by handleResult)
    wm.simulateResult(1);

    // Seek to chunk 8
    scheduler.handleSeek(8);

    // Should now dispatch chunk closest to 8
    const lastPosted = wm.posted[wm.posted.length - 1]!;
    expect(lastPosted.chunkIndex).toBe(8);

    scheduler.dispose();
  });

  it("cancels current conversion when seek is far away", () => {
    const chunks = makeChunks(10);
    const wm = createMockWorkerManager();
    const extractData = vi.fn(() => [new Float32Array(1024)]);

    const scheduler = createConversionScheduler(
      chunks,
      wm,
      extractData,
      44100,
      1.0,
      { cancelDistanceThreshold: 2 },
    );

    scheduler.start(0);
    expect(wm.isBusy()).toBe(true);

    // Seek far away — cancelChunk should be called for the converting chunk
    scheduler.handleSeek(8);
    expect(wm.cancelChunkFn).toHaveBeenCalledWith(0);

    scheduler.dispose();
  });

  it("resets chunks on tempo change", () => {
    const chunks = makeChunks(5);
    const wm = createMockWorkerManager();
    const extractData = vi.fn(() => [new Float32Array(1024)]);

    const scheduler = createConversionScheduler(
      chunks,
      wm,
      extractData,
      44100,
      1.0,
    );

    scheduler.start(0);

    // Mark chunk 0 as ready
    wm.simulateResult(0);
    (scheduler as any)._handleResult(0, [new Float32Array(1024)], 1024);
    expect(chunks[0]!.state).toBe("ready");

    // Change tempo
    scheduler.handleTempoChange(1.5);

    // All chunks should be reset
    for (const chunk of chunks) {
      expect(chunk.state === "pending" || chunk.state === "queued" || chunk.state === "converting").toBe(true);
    }

    scheduler.dispose();
  });

  it("restores previous tempo cache", () => {
    const chunks = makeChunks(3);
    const wm = createMockWorkerManager();
    const extractData = vi.fn(() => [new Float32Array(1024)]);

    const scheduler = createConversionScheduler(
      chunks,
      wm,
      extractData,
      44100,
      1.0,
    );

    scheduler.start(0);

    // Complete all chunks
    const buf = [new Float32Array(1024)];
    wm.simulateResult(0);
    (scheduler as any)._handleResult(0, buf, 1024);
    wm.simulateResult(1);
    (scheduler as any)._handleResult(1, buf, 1024);
    wm.simulateResult(2);
    (scheduler as any)._handleResult(2, buf, 1024);

    // Change tempo
    scheduler.handleTempoChange(1.5);
    expect(chunks[0]!.outputBuffer).toBeNull();

    // Restore
    const restored = scheduler.restorePreviousTempo();
    expect(restored).toBe(true);

    // Chunks with cached data should be restored
    for (const chunk of chunks) {
      expect(chunk.state).toBe("ready");
    }

    scheduler.dispose();
  });

  it("re-queues evicted chunks when they enter the active window", () => {
    const chunks = makeChunks(20);
    const wm = createMockWorkerManager();
    const extractData = vi.fn(() => [new Float32Array(1024)]);

    const scheduler = createConversionScheduler(
      chunks,
      wm,
      extractData,
      44100,
      1.0,
      { keepAheadChunks: 5, keepBehindChunks: 3 },
    );

    scheduler.start(0);

    // Manually evict chunk 10
    chunks[10]!.state = "evicted";
    chunks[10]!.outputBuffer = null;
    chunks[10]!.outputLength = 0;

    // Move playhead near chunk 10 — it should be within the window
    wm.simulateResult(0);
    scheduler.handleSeek(10);

    expect(chunks[10]!.state).not.toBe("evicted");

    scheduler.dispose();
  });

  it("tempo change evicts chunks outside the active window", () => {
    const chunks = makeChunks(50);
    const wm = createMockWorkerManager();
    const extractData = vi.fn(() => [new Float32Array(1024)]);

    const scheduler = createConversionScheduler(
      chunks,
      wm,
      extractData,
      44100,
      1.0,
      { keepAheadChunks: 5, keepBehindChunks: 3 },
    );

    scheduler.start(10);

    // Mark several chunks as ready
    for (let i = 0; i < 50; i++) {
      wm.simulateResult(i);
      chunks[i]!.state = "ready";
      chunks[i]!.outputBuffer = [new Float32Array(1024)];
      chunks[i]!.outputLength = 1024;
    }

    scheduler.handleTempoChange(1.5);

    // Window: [10-3, 10+5] = [7, 15]
    // Chunks outside should be evicted
    expect(chunks[0]!.state).toBe("evicted");
    expect(chunks[6]!.state).toBe("evicted");
    expect(chunks[16]!.state).toBe("evicted");
    expect(chunks[49]!.state).toBe("evicted");

    // Chunks inside should be pending/queued/converting (reset for re-conversion)
    for (let i = 7; i <= 15; i++) {
      expect(chunks[i]!.state).not.toBe("evicted");
      expect(chunks[i]!.state).not.toBe("ready");
    }

    scheduler.dispose();
  });

  it("tempo cache only preserves window-internal chunks", () => {
    const chunks = makeChunks(20);
    const wm = createMockWorkerManager();
    const extractData = vi.fn(() => [new Float32Array(1024)]);

    const scheduler = createConversionScheduler(
      chunks,
      wm,
      extractData,
      44100,
      1.0,
      { keepAheadChunks: 3, keepBehindChunks: 2 },
    );

    scheduler.start(5);

    // Mark all chunks as ready
    const buf = [new Float32Array(1024)];
    for (let i = 0; i < 20; i++) {
      wm.simulateResult(i);
      chunks[i]!.state = "ready";
      chunks[i]!.outputBuffer = buf;
      chunks[i]!.outputLength = 1024;
    }

    // Change tempo then restore
    scheduler.handleTempoChange(2.0);
    const restored = scheduler.restorePreviousTempo();
    expect(restored).toBe(true);

    // Window: [5-2, 5+3] = [3, 8]
    // Only window-internal chunks should be restored to ready
    for (let i = 3; i <= 8; i++) {
      expect(chunks[i]!.state).toBe("ready");
    }

    // Chunks outside window should NOT be ready
    expect(chunks[0]!.state).not.toBe("ready");
    expect(chunks[15]!.state).not.toBe("ready");

    scheduler.dispose();
  });

  it("evicted chunks outside the window are not re-queued", () => {
    const chunks = makeChunks(30);
    const wm = createMockWorkerManager();
    const extractData = vi.fn(() => [new Float32Array(1024)]);

    const scheduler = createConversionScheduler(
      chunks,
      wm,
      extractData,
      44100,
      1.0,
      { keepAheadChunks: 3, keepBehindChunks: 2 },
    );

    scheduler.start(5);

    // Evict a distant chunk
    chunks[25]!.state = "evicted";
    chunks[25]!.outputBuffer = null;

    // Update priorities without moving playhead near chunk 25
    scheduler.updatePriorities(5);

    // Chunk 25 should remain evicted
    expect(chunks[25]!.state).toBe("evicted");

    scheduler.dispose();
  });

  it("calls onChunkReady callback", () => {
    const chunks = makeChunks(3);
    const wm = createMockWorkerManager();
    const extractData = vi.fn(() => [new Float32Array(1024)]);
    const onReady = vi.fn();

    const scheduler = createConversionScheduler(
      chunks,
      wm,
      extractData,
      44100,
      1.0,
      undefined,
      onReady,
    );

    scheduler.start(0);
    wm.simulateResult(0);
    (scheduler as any)._handleResult(0, [new Float32Array(1024)], 1024);

    expect(onReady).toHaveBeenCalledWith(0);

    scheduler.dispose();
  });
});
