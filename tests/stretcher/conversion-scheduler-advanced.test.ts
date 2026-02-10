import { describe, expect, it, vi } from "vitest";
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

    const scheduler = createConversionScheduler(chunks, wm, extractData, 44100, 1.0);

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

    const scheduler = createConversionScheduler(chunks, wm, extractData, 44100, 1.0);

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

    const scheduler = createConversionScheduler(chunks, wm, extractData, 44100, 1.0);

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

    const scheduler = createConversionScheduler(chunks, wm, extractData, 44100, 1.0);

    scheduler.start(0);

    const restored = scheduler.restorePreviousTempo();
    expect(restored).toBe(false);

    scheduler.dispose();
  });

  it("dispose then dispatchNext → safe (no dispatch)", () => {
    const chunks = makeChunks(5);
    const wm = createMockWorkerManager();
    const extractData = vi.fn(() => [new Float32Array(1024)]);

    const scheduler = createConversionScheduler(chunks, wm, extractData, 44100, 1.0);

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

    const scheduler = createConversionScheduler(chunks, wm, extractData, 44100, 1.0, {
      keepAheadChunks: 3,
      keepBehindChunks: 2,
    });

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

    const scheduler = createConversionScheduler(chunks, wm, extractData, 44100, 1.0, {
      cancelDistanceThreshold: 3,
    });

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
      chunks,
      wm,
      extractData,
      44100,
      1.0,
      undefined,
      undefined,
      onFailed,
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

  it("handleResult skips stale result when chunk state is not converting", () => {
    const chunks = makeChunks(5);
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

    // Complete chunk 0 at tempo 1.0
    wm.simulateResult(0);
    (scheduler as any)._handleResult(0, [new Float32Array(1024)], 1024);
    expect(chunks[0]!.state).toBe("ready");
    onReady.mockClear();

    // Block re-dispatch so chunks stay "pending" after tempo change
    wm.setCapacity(false);

    // Tempo change resets chunk 0 to "pending" (queued by updatePriorities)
    scheduler.handleTempoChange(2.0);
    // With no capacity, chunk stays in "queued" state (not re-dispatched)
    expect(chunks[0]!.state).toBe("queued");

    // Stale result arrives for chunk 0 (old tempo) — chunk is "queued", not "converting"
    (scheduler as any)._handleResult(0, [new Float32Array(512)], 512);

    // Should NOT be set to "ready"
    expect(chunks[0]!.state).not.toBe("ready");
    // onChunkReady should NOT be called
    expect(onReady).not.toHaveBeenCalled();

    scheduler.dispose();
  });

  it("handleResult accepts result when chunk is in converting state", () => {
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

    // Chunk 0 should be in "converting" state after dispatch
    expect(chunks[0]!.state).toBe("converting");

    // Normal result arrives while chunk is "converting"
    wm.simulateResult(0);
    (scheduler as any)._handleResult(0, [new Float32Array(1024)], 1024);

    // Should be set to "ready"
    expect(chunks[0]!.state).toBe("ready");
    expect(onReady).toHaveBeenCalledWith(0);

    scheduler.dispose();
  });

  it("handleResult with invalid chunk index is safe", () => {
    const chunks = makeChunks(3);
    const wm = createMockWorkerManager();
    const extractData = vi.fn(() => [new Float32Array(1024)]);

    const scheduler = createConversionScheduler(chunks, wm, extractData, 44100, 1.0);

    scheduler.start(0);

    // Pass an out-of-bounds index
    expect(() => {
      (scheduler as any)._handleResult(99, [new Float32Array(1024)], 1024);
    }).not.toThrow();

    scheduler.dispose();
  });

  // -----------------------------------------------------------------------
  // CS-04: dispose 後の handleResult / handleError
  // -----------------------------------------------------------------------

  it("CS-04: handleResult after dispose does not call onChunkReady", () => {
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
    expect(chunks[0]!.state).toBe("converting");

    scheduler.dispose();

    // Result arrives after dispose
    expect(() => {
      (scheduler as any)._handleResult(0, [new Float32Array(1024)], 1024);
    }).not.toThrow();
    expect(onReady).not.toHaveBeenCalled();
    // chunk state should NOT be set to "ready"
    expect(chunks[0]!.state).not.toBe("ready");
  });

  it("CS-04: handleError after dispose does not call onChunkFailed", () => {
    const chunks = makeChunks(3);
    const wm = createMockWorkerManager();
    const extractData = vi.fn(() => [new Float32Array(1024)]);
    const onFailed = vi.fn();

    const scheduler = createConversionScheduler(
      chunks,
      wm,
      extractData,
      44100,
      1.0,
      undefined,
      undefined,
      onFailed,
    );

    scheduler.start(0);
    // Fail chunk 0 twice first to get close to max retries
    wm.simulateResult(0);
    (scheduler as any)._handleError(0, "error");
    wm.simulateResult(0);
    (scheduler as any)._handleError(0, "error");

    scheduler.dispose();

    // Third error after dispose — would trigger onChunkFailed without guard
    expect(() => {
      (scheduler as any)._handleError(0, "error");
    }).not.toThrow();
    expect(onFailed).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // CS-01: handleResult when chunk state is "failed"
  // -----------------------------------------------------------------------

  it("CS-01: handleResult skips chunk in failed state", () => {
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
    // Manually set chunk 0 to "failed" (simulating max retries reached)
    chunks[0]!.state = "failed";

    (scheduler as any)._handleResult(0, [new Float32Array(1024)], 1024);

    // Should not become "ready"
    expect(chunks[0]!.state).not.toBe("ready");
    expect(onReady).not.toHaveBeenCalled();

    scheduler.dispose();
  });

  // -----------------------------------------------------------------------
  // CS-02: handleResult when chunk state is "evicted"
  // -----------------------------------------------------------------------

  it("CS-02: handleResult skips chunk in evicted state", () => {
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
    // Manually set chunk 0 to "evicted"
    chunks[0]!.state = "evicted";

    (scheduler as any)._handleResult(0, [new Float32Array(1024)], 1024);

    // Should not become "ready"
    expect(chunks[0]!.state).not.toBe("ready");
    expect(onReady).not.toHaveBeenCalled();

    scheduler.dispose();
  });

  // -----------------------------------------------------------------------
  // L-02: dispose 後の previousTempoCache
  // -----------------------------------------------------------------------

  it("L-02: dispose clears queue and subsequent restorePreviousTempo is safe", () => {
    const chunks = makeChunks(3);
    const wm = createMockWorkerManager();
    const extractData = vi.fn(() => [new Float32Array(1024)]);

    const scheduler = createConversionScheduler(chunks, wm, extractData, 44100, 1.0);

    scheduler.start(0);

    // Complete chunks
    const buf = [new Float32Array(1024)];
    for (let i = 0; i < 3; i++) {
      wm.simulateResult(i);
      (scheduler as any)._handleResult(i, buf, 1024);
    }

    // Tempo change to create cache
    scheduler.handleTempoChange(2.0);

    scheduler.dispose();

    // Operations after dispose should not throw
    expect(() => scheduler.restorePreviousTempo()).not.toThrow();
    expect(() => scheduler.dispatchNext()).not.toThrow();
  });

  // -----------------------------------------------------------------------
  // CS-03: seek と setTempo の連続実行
  // -----------------------------------------------------------------------

  describe("CS-03: seek と setTempo の連続実行", () => {
    it("CS-03a: handleSeek → handleTempoChange uses seek's currentChunkIdx", () => {
      const chunks = makeChunks(5);
      const wm = createMockWorkerManager();
      const extractData = vi.fn(() => [new Float32Array(1024)]);

      const scheduler = createConversionScheduler(chunks, wm, extractData, 44100, 1.0);
      scheduler.start(0);

      // Complete all chunks at tempo 1.0
      const buf = [new Float32Array(1024)];
      for (let i = 0; i < 5; i++) {
        wm.simulateResult(i);
        (scheduler as any)._handleResult(i, buf, 1024);
      }

      wm.cancelFn.mockClear();
      wm.posted.length = 0;

      // Seek to index 3 → currentChunkIdx becomes 3
      scheduler.handleSeek(3);

      // Immediately set tempo to 1.5
      scheduler.handleTempoChange(1.5);

      // cancelCurrent should have been called by handleTempoChange
      expect(wm.cancelFn).toHaveBeenCalled();

      // All chunks should be reset (not ready)
      for (const chunk of chunks) {
        expect(chunk.state).not.toBe("ready");
      }

      // First dispatch after tempo change should be chunk 3 (seek position)
      const tempoPostings = wm.posted.filter((p) => p.tempo === 1.5);
      expect(tempoPostings.length).toBeGreaterThan(0);
      expect(tempoPostings[0]!.chunkIndex).toBe(3);

      scheduler.dispose();
    });

    it("CS-03b: handleTempoChange → handleSeek dispatches from seek target", () => {
      const chunks = makeChunks(10);
      const wm = createMockWorkerManager();
      const extractData = vi.fn(() => [new Float32Array(1024)]);

      const scheduler = createConversionScheduler(chunks, wm, extractData, 44100, 1.0);
      scheduler.start(0);

      // Complete all chunks at tempo 1.0
      const buf = [new Float32Array(1024)];
      for (let i = 0; i < 10; i++) {
        wm.simulateResult(i);
        (scheduler as any)._handleResult(i, buf, 1024);
      }

      // Tempo change resets all chunks, dispatches chunk 0
      scheduler.handleTempoChange(1.5);

      // Free worker capacity (chunk 0 was dispatched)
      wm.simulateResult(0);
      wm.posted.length = 0;

      // Seek to index 3 — re-prioritize around index 3
      scheduler.handleSeek(3);

      // First dispatch should be chunk 3 (distance 0 from playhead)
      expect(wm.posted.length).toBeGreaterThan(0);
      expect(wm.posted[0]!.chunkIndex).toBe(3);

      scheduler.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // CS-05: restorePreviousTempo → handleTempoChange の連鎖
  // -----------------------------------------------------------------------

  describe("CS-05: restorePreviousTempo → handleTempoChange の連鎖", () => {
    it("second handleTempoChange caches restored state, second restore works", () => {
      const chunks = makeChunks(3);
      const wm = createMockWorkerManager();
      const extractData = vi.fn(() => [new Float32Array(1024)]);

      const scheduler = createConversionScheduler(chunks, wm, extractData, 44100, 1.0);
      scheduler.start(0);

      // Complete all chunks at tempo 1.0
      const buf = [new Float32Array(1024)];
      for (let i = 0; i < 3; i++) {
        wm.simulateResult(i);
        (scheduler as any)._handleResult(i, buf, 1024);
      }

      // All chunks should be ready
      expect(chunks.every((c) => c.state === "ready")).toBe(true);

      // 1st tempo change: 1.0 → 1.5 (caches tempo=1.0 buffers)
      scheduler.handleTempoChange(1.5);
      expect(chunks.every((c) => c.state !== "ready")).toBe(true);

      // Restore: back to tempo 1.0, chunks restored
      const restored1 = scheduler.restorePreviousTempo();
      expect(restored1).toBe(true);
      for (const chunk of chunks) {
        expect(chunk.state).toBe("ready");
        expect(chunk.outputBuffer).not.toBeNull();
      }

      // 2nd tempo change: 1.0 → 2.0 (caches the restored state)
      scheduler.handleTempoChange(2.0);
      expect(chunks.every((c) => c.state !== "ready")).toBe(true);

      // 2nd restore: back to tempo 1.0, chunks restored again
      const restored2 = scheduler.restorePreviousTempo();
      expect(restored2).toBe(true);
      for (const chunk of chunks) {
        expect(chunk.state).toBe("ready");
        expect(chunk.outputBuffer).not.toBeNull();
      }

      // 3rd restore: no cache → returns false
      const restored3 = scheduler.restorePreviousTempo();
      expect(restored3).toBe(false);

      scheduler.dispose();
    });
  });
});
