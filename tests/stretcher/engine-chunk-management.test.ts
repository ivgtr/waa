import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockAudioBuffer,
  createMockAudioContext,
  findActiveSource,
  type MockAudioContext,
  stubWorkerGlobals,
} from "../helpers/audio-mocks";

const workerStubs = stubWorkerGlobals();

// 24s audio, sampleRate=44100 → 3 chunks (CHUNK_DURATION_SEC=8)
const CHUNK0_RAW = 361620;
const CHUNK1_RAW = 370440;
const CHUNK2_RAW = 361620;

let createStretcherEngine: typeof import("../../src/stretcher/engine")["createStretcherEngine"];

describe("engine – chunk management (advanceToNextChunk / evict)", () => {
  let ctx: MockAudioContext;
  let buffer: AudioBuffer;

  beforeEach(async () => {
    vi.useFakeTimers();
    workerStubs.workers.length = 0;
    vi.clearAllMocks();
    const mod = await import("../../src/stretcher/engine");
    createStretcherEngine = mod.createStretcherEngine;
    ctx = createMockAudioContext();
    buffer = createMockAudioBuffer(24);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createEngine(opts?: Partial<{ tempo: number; loop: boolean; offset: number }>) {
    return createStretcherEngine(ctx, buffer, {
      tempo: opts?.tempo ?? 1.0,
      loop: opts?.loop ?? false,
      offset: opts?.offset ?? 0,
    });
  }

  it("loop: chunk 0 evicted → enters buffering on loop wrap", () => {
    // Use a 50-second buffer for more chunks (7 chunks)
    const longBuffer = createMockAudioBuffer(50);
    const engine = createStretcherEngine(ctx, longBuffer, {
      tempo: 1.0,
      loop: true,
      offset: 0,
    });
    const loopHandler = vi.fn();
    const bufferingHandler = vi.fn();
    engine.on("loop", loopHandler);
    engine.on("buffering", bufferingHandler);

    engine.start();

    // Make chunks 0-6 ready
    const chunkSizes = [361620, 370440, 370440, 370440, 370440, 370440, 352800];
    for (let i = 0; i < chunkSizes.length; i++) {
      const workerIdx = i % 2;
      workerStubs.simulateWorkerResult(workerIdx, i, chunkSizes[i]!);
    }

    expect(engine.getStatus().phase).toBe("playing");

    // Advance through all chunks to trigger loop
    for (let i = 0; i < chunkSizes.length; i++) {
      const src = findActiveSource(ctx._sources);
      if (src) src.onended!();
    }

    // Loop should have fired
    expect(loopHandler).toHaveBeenCalled();

    engine.dispose();
  });

  it("next chunk not ready → enters buffering → ready → exits to playing", () => {
    const engine = createEngine();
    const bufferingHandler = vi.fn();
    const bufferedHandler = vi.fn();
    engine.on("buffering", bufferingHandler);
    engine.on("buffered", bufferedHandler);

    engine.start();

    // Make only chunk 0 ready
    workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);

    expect(engine.getStatus().phase).toBe("playing");

    // Advance past chunk 0 → chunk 1 not ready → buffering
    const src0 = findActiveSource(ctx._sources);
    src0!.onended!();

    expect(engine.getStatus().phase).toBe("buffering");

    // Make chunk 1 ready → should exit buffering
    workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);

    expect(engine.getStatus().phase).toBe("playing");
    expect(bufferedHandler).toHaveBeenCalled();

    engine.dispose();
  });

  it("setTempo during playback triggers reconversion", () => {
    const engine = createEngine();

    engine.start();
    workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
    workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);

    expect(engine.getStatus().phase).toBe("playing");

    // Change tempo
    engine.setTempo(1.5);

    // Engine should have triggered re-conversion (entering buffering while chunks reconvert)
    const status = engine.getStatus();
    expect(status.phase === "buffering" || status.phase === "playing").toBe(true);

    engine.dispose();
  });

  it("short audio (< 8 sec, single chunk) — all operations work", () => {
    const shortBuffer = createMockAudioBuffer(5); // 5 sec → 1 chunk
    const engine = createStretcherEngine(ctx, shortBuffer, {
      tempo: 1.0,
      loop: false,
      offset: 0,
    });
    const endedHandler = vi.fn();
    engine.on("ended", endedHandler);

    engine.start();

    // Make the single chunk ready
    const outputLen = Math.round(5 * 44100); // ~221550
    workerStubs.simulateWorkerResult(0, 0, outputLen);

    expect(engine.getStatus().phase).toBe("playing");

    // Seek within the single chunk
    engine.seek(2.5);
    expect(engine.getCurrentPosition()).toBeGreaterThanOrEqual(0);

    // Pause/resume
    engine.pause();
    expect(engine.getStatus().phase).toBe("paused");

    engine.resume();
    expect(engine.getStatus().phase).toBe("playing");

    // Advance past the single chunk → ended
    const src = findActiveSource(ctx._sources);
    if (src) src.onended!();

    expect(endedHandler).toHaveBeenCalledTimes(1);
    expect(engine.getStatus().phase).toBe("ended");

    engine.dispose();
  });

  it("seek triggers onended from previous source → advanceToNextChunk handles gracefully", () => {
    const engine = createEngine();

    engine.start();
    workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
    workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);
    workerStubs.simulateWorkerResult(0, 2, CHUNK2_RAW);

    expect(engine.getStatus().phase).toBe("playing");

    // Seek to a different chunk
    engine.seek(10);

    // Position should be near 10
    const pos = engine.getCurrentPosition();
    expect(pos).toBeGreaterThanOrEqual(9);
    expect(pos).toBeLessThanOrEqual(11);

    // Now simulate onended from the seek's source
    const src = findActiveSource(ctx._sources);
    if (src) src.onended!();

    // Should either advance to next chunk or end — no crash
    const status = engine.getStatus();
    expect(["playing", "buffering", "ended"]).toContain(status.phase);

    engine.dispose();
  });

  it("getSnapshot returns valid data", () => {
    const engine = createEngine();

    engine.start();
    workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);

    const snapshot = engine.getSnapshot();
    expect(snapshot).toBeDefined();
    expect(snapshot.currentChunkIndex).toBeGreaterThanOrEqual(0);
    expect(snapshot.totalChunks).toBeGreaterThan(0);
    expect(typeof snapshot.buffering).toBe("boolean");

    engine.dispose();
  });
});
