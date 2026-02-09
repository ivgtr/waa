import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  stubWorkerGlobals,
  createMockAudioContext,
  createMockAudioBuffer,
  findActiveSource,
  type MockAudioContext,
} from "../helpers/audio-mocks";

const workerStubs = stubWorkerGlobals();

// 24s audio, sampleRate=44100 → 3 chunks (CHUNK_DURATION_SEC=8)
const CHUNK0_RAW = 361620;
const CHUNK1_RAW = 370440;
const CHUNK2_RAW = 361620;

let createStretcherEngine: (typeof import("../../src/stretcher/engine"))["createStretcherEngine"];

describe("engine – exitBuffering paths", () => {
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

  it("bufferingResumePosition=null → plays from chunk start with crossfade", () => {
    const engine = createEngine();
    const bufferingHandler = vi.fn();
    const bufferedHandler = vi.fn();
    engine.on("buffering", bufferingHandler);
    engine.on("buffered", bufferedHandler);

    engine.start();

    // Initial buffering → chunk 0 becomes ready → exits buffering
    workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);

    expect(bufferedHandler).toHaveBeenCalled();
    expect(engine.getStatus().phase).toBe("playing");

    engine.dispose();
  });

  it("resumes from buffering at chunk start when seek targets chunk start", () => {
    const engine = createEngine();
    const bufferedHandler = vi.fn();
    engine.on("buffered", bufferedHandler);

    engine.start();
    workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
    workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);

    // Seek to start of chunk 1 (~8s)
    engine.seek(8);

    // If chunk 1 is already ready, it should exit buffering immediately
    expect(engine.getStatus().phase).toBe("playing");

    engine.dispose();
  });

  it("enters buffering when seeking to unready chunk, exits when ready", () => {
    const engine = createEngine();
    const bufferingHandler = vi.fn();
    const bufferedHandler = vi.fn();
    engine.on("buffering", bufferingHandler);
    engine.on("buffered", bufferedHandler);

    engine.start();
    workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);

    // Seek to chunk 2 which isn't ready yet
    engine.seek(16);

    expect(engine.getStatus().phase).toBe("buffering");
    const callsBefore = bufferedHandler.mock.calls.length;

    // Now make chunk 2 ready
    workerStubs.simulateWorkerResult(1, 2, CHUNK2_RAW);

    expect(bufferedHandler.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(engine.getStatus().phase).toBe("playing");

    engine.dispose();
  });

  it("handles exitBuffering after tempo change", () => {
    const engine = createEngine({ tempo: 1.0 });
    const bufferedHandler = vi.fn();
    engine.on("buffered", bufferedHandler);

    engine.start();
    workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);

    expect(engine.getStatus().phase).toBe("playing");

    // Change tempo
    engine.setTempo(2.0);

    // Seek to chunk 2 (not ready)
    engine.seek(16);

    expect(engine.getStatus().phase).toBe("buffering");

    // Make chunk 2 ready with different output length (tempo=2)
    workerStubs.simulateWorkerResult(1, 2, Math.round(CHUNK2_RAW / 2));

    expect(engine.getStatus().phase).toBe("playing");

    engine.dispose();
  });

  it("exits buffering correctly when chunk near end triggers advanceToNextChunk", () => {
    const engine = createEngine();

    engine.start();
    workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
    workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);
    workerStubs.simulateWorkerResult(0, 2, CHUNK2_RAW);

    // The engine should be playing (all chunks ready)
    expect(engine.getStatus().phase).toBe("playing");

    engine.dispose();
  });
});
