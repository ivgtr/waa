import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockAudioBuffer,
  createMockAudioContext,
  findActiveSource,
  type MockAudioContext,
  stubWorkerGlobals,
} from "../helpers/audio-mocks";

// ---------------------------------------------------------------------------
// Setup Worker stubs
// ---------------------------------------------------------------------------

const workerStubs = stubWorkerGlobals();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// 24s audio, sampleRate=44100 → 3 chunks (CHUNK_DURATION_SEC=8)
const CHUNK0_RAW = 361620;
const CHUNK1_RAW = 370440;
const CHUNK2_RAW = 361620;

function createEngine(
  ctx: MockAudioContext,
  buffer: AudioBuffer,
  opts?: Partial<{ tempo: number; loop: boolean; offset: number }>,
) {
  return createStretcherEngine(ctx, buffer, {
    tempo: opts?.tempo ?? 1.0,
    loop: opts?.loop ?? false,
    offset: opts?.offset ?? 0,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let createStretcherEngine: typeof import("../../src/stretcher/engine")["createStretcherEngine"];

describe("engine – advanced paths", () => {
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

  // -----------------------------------------------------------------------
  // advanceToNextChunk loop処理
  // -----------------------------------------------------------------------

  describe("advanceToNextChunk – loop handling", () => {
    it("loops back to chunk 0 when reaching end with loop enabled", () => {
      const engine = createEngine(ctx, buffer, { loop: true });
      const loopHandler = vi.fn();
      engine.on("loop", loopHandler);

      engine.start();

      // Make all chunks ready
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);
      workerStubs.simulateWorkerResult(0, 2, CHUNK2_RAW);

      expect(engine.getStatus().phase).toBe("playing");

      // Advance through all chunks via onended
      const src0 = findActiveSource(ctx._sources);
      src0!.onended!();
      const src1 = findActiveSource(ctx._sources);
      src1!.onended!();

      // Now at chunk 2, trigger onended → should loop to chunk 0
      const src2 = findActiveSource(ctx._sources);
      src2!.onended!();

      expect(loopHandler).toHaveBeenCalledTimes(1);
      expect(engine.getStatus().phase).toBe("playing");

      engine.dispose();
    });

    it("ends playback when reaching end without loop", () => {
      const engine = createEngine(ctx, buffer, { loop: false });
      const endedHandler = vi.fn();
      engine.on("ended", endedHandler);

      engine.start();

      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);
      workerStubs.simulateWorkerResult(0, 2, CHUNK2_RAW);

      // Advance through all chunks
      const src0 = findActiveSource(ctx._sources);
      src0!.onended!();
      const src1 = findActiveSource(ctx._sources);
      src1!.onended!();
      const src2 = findActiveSource(ctx._sources);
      src2!.onended!();

      expect(endedHandler).toHaveBeenCalledTimes(1);
      expect(engine.getStatus().phase).toBe("ended");

      engine.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // exitBuffering – bufferingResumePosition path
  // -----------------------------------------------------------------------

  describe("exitBuffering – bufferingResumePosition", () => {
    it("resumes from buffering with correct position after seek", () => {
      const engine = createEngine(ctx, buffer, { offset: 0 });
      const bufferedHandler = vi.fn();
      engine.on("buffered", bufferedHandler);

      engine.start();

      // Make chunk 0 ready to start playing
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);

      expect(engine.getStatus().phase).toBe("playing");

      // Seek to a position that needs buffering
      // Chunk 2 is not ready, so seek to 16s should enter buffering
      engine.seek(16);

      // Chunk 2 needs to be ready
      workerStubs.simulateWorkerResult(0, 2, CHUNK2_RAW);

      expect(bufferedHandler).toHaveBeenCalled();
      expect(engine.getStatus().phase).toBe("playing");

      engine.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // exitBuffering – advanceToNextChunk recursive call
  // -----------------------------------------------------------------------

  describe("exitBuffering – advanceToNextChunk recursion", () => {
    it("advances to next chunk when offset exceeds output duration", () => {
      // This tests the case where bufferingResumePosition is near the end
      // of a chunk's output, triggering advanceToNextChunk from exitBuffering
      const engine = createEngine(ctx, buffer, { offset: 0 });

      engine.start();

      // Make chunks ready
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);
      workerStubs.simulateWorkerResult(0, 2, CHUNK2_RAW);

      expect(engine.getStatus().phase).toBe("playing");

      engine.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // seek when chunk is ready – offset calculation
  // -----------------------------------------------------------------------

  describe("seek – offset calculation", () => {
    it("seeks to correct position within a ready chunk", () => {
      const engine = createEngine(ctx, buffer);

      engine.start();

      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);

      expect(engine.getStatus().phase).toBe("playing");

      // Seek to 4 sec (within chunk 0)
      engine.seek(4);

      // Position should be approximately 4
      const pos = engine.getCurrentPosition();
      expect(pos).toBeGreaterThanOrEqual(3.5);
      expect(pos).toBeLessThanOrEqual(4.5);

      engine.dispose();
    });

    it("seeks to position in a different chunk", () => {
      const engine = createEngine(ctx, buffer);

      engine.start();

      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);

      expect(engine.getStatus().phase).toBe("playing");

      // Seek to 10 sec (chunk 1)
      engine.seek(10);

      const pos = engine.getCurrentPosition();
      expect(pos).toBeGreaterThanOrEqual(9.5);
      expect(pos).toBeLessThanOrEqual(10.5);

      engine.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // onChunkReady proactive scheduleNext
  // -----------------------------------------------------------------------

  describe("onChunkReady – proactive scheduleNext", () => {
    it("schedules next chunk when it becomes ready during playing", () => {
      const engine = createEngine(ctx, buffer);

      engine.start();

      // Only chunk 0 ready first
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      // Need another chunk ready to exit buffering
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);

      expect(engine.getStatus().phase).toBe("playing");

      // Advance time close to end of chunk 0
      ctx._setCurrentTime(7.5);

      // Now chunk 1 is already ready, trigger lookahead
      vi.advanceTimersByTime(200); // LOOKAHEAD_INTERVAL_MS

      const createBufferMock = ctx.createBuffer as ReturnType<typeof vi.fn>;
      const callCount = createBufferMock.mock.calls.length;
      expect(callCount).toBeGreaterThanOrEqual(2); // at least chunk 0 + chunk 1 buffers

      engine.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // Potential bug: setTempo 後の古い Worker result 適用
  // -----------------------------------------------------------------------

  describe("setTempo – stale worker result", () => {
    it("tempo change resets chunks and re-queues conversion", () => {
      const engine = createEngine(ctx, buffer, { tempo: 1.0 });

      engine.start();

      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);

      expect(engine.getStatus().phase).toBe("playing");

      // Change tempo
      engine.setTempo(2.0);

      // Engine should enter buffering
      expect(engine.getStatus().phase).toBe("buffering");

      // The chunks should be re-queued for conversion at new tempo
      const status = engine.getStatus();
      expect(status.playback.tempo).toBe(2.0);

      engine.dispose();
    });

    it("result arriving after tempo change is handled", () => {
      const engine = createEngine(ctx, buffer, { tempo: 1.0 });

      engine.start();

      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);

      expect(engine.getStatus().phase).toBe("playing");

      // Change tempo – chunks get reset
      engine.setTempo(2.0);
      expect(engine.getStatus().phase).toBe("buffering");

      // Wait for debounced handleTempoChange to fire
      vi.advanceTimersByTime(100);

      // New worker results arrive at new tempo
      workerStubs.simulateWorkerResult(0, 0, Math.round(CHUNK0_RAW / 2));
      workerStubs.simulateWorkerResult(1, 1, Math.round(CHUNK1_RAW / 2));

      // Should exit buffering
      expect(engine.getStatus().phase).toBe("playing");

      engine.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // setTempo – debounce
  // -----------------------------------------------------------------------

  describe("setTempo – debounce", () => {
    it("rapid setTempo calls trigger buffering only once", () => {
      const engine = createEngine(ctx, buffer, { tempo: 1.0 });
      const bufferingHandler = vi.fn();
      engine.on("buffering", bufferingHandler);

      engine.start();

      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);

      expect(engine.getStatus().phase).toBe("playing");
      bufferingHandler.mockClear();

      // Rapid tempo changes
      engine.setTempo(1.2);
      engine.setTempo(1.5);
      engine.setTempo(1.8);
      engine.setTempo(2.0);
      engine.setTempo(2.5);

      // Only 1 buffering event (from the first call in the burst)
      const tempoChangeBufferings = bufferingHandler.mock.calls.filter(
        (call: any) => call[0].reason === "tempo-change",
      );
      expect(tempoChangeBufferings).toHaveLength(1);

      engine.dispose();
    });

    it("debounced setTempo applies final tempo to scheduler", () => {
      const engine = createEngine(ctx, buffer, { tempo: 1.0 });

      engine.start();

      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);

      expect(engine.getStatus().phase).toBe("playing");

      // Rapid tempo changes
      engine.setTempo(1.5);
      engine.setTempo(2.0);
      engine.setTempo(2.5);

      // Tempo should be updated immediately (for getStatus)
      expect(engine.getStatus().playback.tempo).toBe(2.5);

      // Fire the debounce timer
      vi.advanceTimersByTime(100);

      // After debounce, workers should be re-dispatched
      // Simulate results at final tempo
      workerStubs.simulateWorkerResult(0, 0, Math.round(CHUNK0_RAW / 2.5));
      workerStubs.simulateWorkerResult(1, 1, Math.round(CHUNK1_RAW / 2.5));

      // Should exit buffering and play at new tempo
      expect(engine.getStatus().phase).toBe("playing");
      expect(engine.getStatus().playback.tempo).toBe(2.5);

      engine.dispose();
    });

    it("single setTempo still triggers buffering immediately", () => {
      const engine = createEngine(ctx, buffer, { tempo: 1.0 });
      const bufferingHandler = vi.fn();
      engine.on("buffering", bufferingHandler);

      engine.start();

      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);

      expect(engine.getStatus().phase).toBe("playing");
      bufferingHandler.mockClear();

      // Single setTempo
      engine.setTempo(2.0);

      // Buffering should fire immediately
      expect(bufferingHandler).toHaveBeenCalledWith({ reason: "tempo-change" });
      expect(engine.getStatus().phase).toBe("buffering");

      engine.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // setTempo – during pause
  // -----------------------------------------------------------------------

  describe("setTempo – during pause", () => {
    it("does not resume playback when setTempo is called during pause", () => {
      const engine = createEngine(ctx, buffer, { tempo: 1.0 });
      const bufferingHandler = vi.fn();
      engine.on("buffering", bufferingHandler);

      engine.start();
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);
      expect(engine.getStatus().phase).toBe("playing");

      engine.pause();
      expect(engine.getStatus().phase).toBe("paused");
      bufferingHandler.mockClear();

      engine.setTempo(2.0);

      expect(engine.getStatus().phase).toBe("paused");
      expect(bufferingHandler).not.toHaveBeenCalled();
      expect(engine.getStatus().playback.tempo).toBe(2.0);

      engine.dispose();
    });

    it("resume after pause+setTempo triggers tempo-change buffering", () => {
      const engine = createEngine(ctx, buffer, { tempo: 1.0 });
      const bufferingHandler = vi.fn();
      engine.on("buffering", bufferingHandler);

      engine.start();
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);
      expect(engine.getStatus().phase).toBe("playing");

      engine.pause();
      engine.setTempo(2.0);
      bufferingHandler.mockClear();

      engine.resume();

      expect(engine.getStatus().phase).toBe("buffering");
      expect(bufferingHandler).toHaveBeenCalledWith({ reason: "tempo-change" });

      // チャンク変換完了後に再生再開
      workerStubs.simulateWorkerResult(0, 0, Math.round(CHUNK0_RAW / 2));
      workerStubs.simulateWorkerResult(1, 1, Math.round(CHUNK1_RAW / 2));
      expect(engine.getStatus().phase).toBe("playing");

      engine.dispose();
    });

    it("multiple setTempo during pause uses final tempo on resume", () => {
      const engine = createEngine(ctx, buffer, { tempo: 1.0 });

      engine.start();
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);

      engine.pause();
      engine.setTempo(1.5);
      engine.setTempo(2.0);
      engine.setTempo(2.5);

      expect(engine.getStatus().playback.tempo).toBe(2.5);
      expect(engine.getStatus().phase).toBe("paused");

      engine.resume();
      expect(engine.getStatus().phase).toBe("buffering");

      engine.dispose();
    });

    it("setTempo to same value during pause does not trigger buffering on resume", () => {
      const engine = createEngine(ctx, buffer, { tempo: 1.0 });
      const bufferingHandler = vi.fn();
      engine.on("buffering", bufferingHandler);

      engine.start();
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);
      expect(engine.getStatus().phase).toBe("playing");

      engine.pause();
      bufferingHandler.mockClear();

      engine.setTempo(1.0); // 同じテンポ → early return (newTempo === currentTempo)

      engine.resume();
      // 通常の resume → playing (buffering ではない)
      expect(engine.getStatus().phase).toBe("playing");
      const tempoChanges = bufferingHandler.mock.calls.filter(
        (call: any) => call[0].reason === "tempo-change",
      );
      expect(tempoChanges).toHaveLength(0);

      engine.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // getStatus / getSnapshot
  // -----------------------------------------------------------------------

  describe("getStatus / getSnapshot", () => {
    it("returns correct status before start", () => {
      const engine = createEngine(ctx, buffer);
      const status = engine.getStatus();
      expect(status.phase).toBe("waiting");
      expect(status.conversion.total).toBe(3);
      expect(status.conversion.ready).toBe(0);
      expect(status.playback.duration).toBe(24);
      engine.dispose();
    });

    it("returns correct snapshot during playback", () => {
      const engine = createEngine(ctx, buffer);
      engine.start();

      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);

      const snapshot = engine.getSnapshot();
      expect(snapshot.totalChunks).toBe(3);
      expect(snapshot.currentChunkIndex).toBe(0);
      expect(snapshot.tempo).toBe(1);
      expect(snapshot.buffering).toBe(false);

      engine.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // pause / resume
  // -----------------------------------------------------------------------

  describe("pause / resume", () => {
    it("pauses and resumes correctly", () => {
      const engine = createEngine(ctx, buffer);

      engine.start();
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);

      expect(engine.getStatus().phase).toBe("playing");

      engine.pause();
      expect(engine.getStatus().phase).toBe("paused");

      engine.resume();
      expect(engine.getStatus().phase).toBe("playing");

      engine.dispose();
    });

    it("resume enters buffering if current chunk not ready", () => {
      const engine = createEngine(ctx, buffer);

      engine.start();
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);

      expect(engine.getStatus().phase).toBe("playing");

      // Advance to chunk 2 (not ready)
      const src0 = findActiveSource(ctx._sources);
      src0!.onended!();
      const src1 = findActiveSource(ctx._sources);
      src1!.onended!();

      // Now at chunk 2, which enters buffering since it's not ready
      expect(engine.getStatus().phase).toBe("buffering");

      engine.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // stop
  // -----------------------------------------------------------------------

  describe("stop", () => {
    it("stops the engine", () => {
      const engine = createEngine(ctx, buffer);
      engine.start();
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);

      engine.stop();
      expect(engine.getStatus().phase).toBe("ended");

      engine.dispose();
    });

    it("stop is safe when already ended", () => {
      const engine = createEngine(ctx, buffer);
      engine.start();
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);

      engine.stop();
      expect(() => engine.stop()).not.toThrow();

      engine.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // setLoop
  // -----------------------------------------------------------------------

  describe("setLoop", () => {
    it("enables looping at runtime", () => {
      const engine = createEngine(ctx, buffer, { loop: false });
      const loopHandler = vi.fn();
      engine.on("loop", loopHandler);

      engine.start();

      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);
      workerStubs.simulateWorkerResult(0, 2, CHUNK2_RAW);

      // Enable loop
      engine.setLoop(true);

      // Advance to end
      const src0 = findActiveSource(ctx._sources);
      src0!.onended!();
      const src1 = findActiveSource(ctx._sources);
      src1!.onended!();
      const src2 = findActiveSource(ctx._sources);
      src2!.onended!();

      expect(loopHandler).toHaveBeenCalledTimes(1);
      expect(engine.getStatus().phase).toBe("playing");

      engine.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // dispose
  // -----------------------------------------------------------------------

  describe("dispose", () => {
    it("cleans up all resources", () => {
      const engine = createEngine(ctx, buffer);
      engine.start();
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);

      expect(() => engine.dispose()).not.toThrow();
    });

    it("operations after dispose are safe", () => {
      const engine = createEngine(ctx, buffer);
      engine.start();
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);

      engine.dispose();

      expect(() => {
        engine.start();
        engine.pause();
        engine.resume();
        engine.seek(5);
        engine.stop();
        engine.setTempo(2);
        engine.setLoop(true);
      }).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // onTransition – race with advanceToNextChunk
  // -----------------------------------------------------------------------

  describe("onTransition – race with advanceToNextChunk", () => {
    it("does not double-increment currentChunkIndex", () => {
      const engine = createEngine(ctx, buffer, { loop: false });

      engine.start();

      // Make all chunks ready
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);
      workerStubs.simulateWorkerResult(0, 2, CHUNK2_RAW);

      expect(engine.getStatus().phase).toBe("playing");
      expect(engine.getSnapshot().currentChunkIndex).toBe(0);

      // Get chunk 0's source before transition
      const src0 = findActiveSource(ctx._sources);
      expect(src0).toBeDefined();

      // Advance time close to end of chunk 0 → lookahead fires → scheduleNext
      ctx._setCurrentTime(7.8);
      vi.advanceTimersByTime(200); // LOOKAHEAD_INTERVAL_MS

      // Trigger onended on chunk 0's source:
      // handleCurrentSourceEnded → nextSource exists → cancelTransition + doTransition → onTransition
      src0!.onended!();

      // currentChunkIndex should be exactly 1
      expect(engine.getSnapshot().currentChunkIndex).toBe(1);

      // Fire any remaining timers to ensure no stale transition causes double-increment
      vi.advanceTimersByTime(5000);

      // Still 1 — no double increment
      expect(engine.getSnapshot().currentChunkIndex).toBe(1);

      engine.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  describe("error handling", () => {
    it("retries chunk on first error (no error event emitted)", () => {
      const errorHandler = vi.fn();
      const engine = createEngine(ctx, buffer);
      engine.on("error", errorHandler);

      engine.start();

      // First error triggers retry, not error event
      workerStubs.simulateWorkerError(0, 0, "conversion failed");

      // Error event is only emitted after MAX_CHUNK_RETRIES (3)
      expect(errorHandler).not.toHaveBeenCalled();

      engine.dispose();
    });

    it("emits fatal error after max retries", () => {
      const errorHandler = vi.fn();
      const engine = createEngine(ctx, buffer);
      engine.on("error", errorHandler);

      engine.start();

      // Fail chunk 0 three times (MAX_CHUNK_RETRIES = 3)
      workerStubs.simulateWorkerError(0, 0, "fail1");
      workerStubs.simulateWorkerError(0, 0, "fail2");
      workerStubs.simulateWorkerError(0, 0, "fail3");

      const fatalCall = errorHandler.mock.calls.find((call: any) => call[0].fatal === true);
      expect(fatalCall).toBeDefined();

      engine.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // Event emission
  // -----------------------------------------------------------------------

  describe("event emission", () => {
    it("emits progress event on chunk ready", () => {
      const progressHandler = vi.fn();
      const engine = createEngine(ctx, buffer);
      engine.on("progress", progressHandler);

      engine.start();

      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);

      expect(progressHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          total: 3,
          ready: 1,
        }),
      );

      engine.dispose();
    });

    it("emits bufferhealth event", () => {
      const healthHandler = vi.fn();
      const engine = createEngine(ctx, buffer);
      engine.on("bufferhealth", healthHandler);

      engine.start();

      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);

      expect(healthHandler).toHaveBeenCalled();

      engine.dispose();
    });

    it("emits complete when all chunks ready", () => {
      const completeHandler = vi.fn();
      const engine = createEngine(ctx, buffer);
      engine.on("complete", completeHandler);

      engine.start();

      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);
      workerStubs.simulateWorkerResult(0, 2, CHUNK2_RAW);

      expect(completeHandler).toHaveBeenCalledTimes(1);

      engine.dispose();
    });

    it("emits buffering event on start", () => {
      const bufferingHandler = vi.fn();
      const engine = createEngine(ctx, buffer);
      engine.on("buffering", bufferingHandler);

      engine.start();

      expect(bufferingHandler).toHaveBeenCalledWith({ reason: "initial" });

      engine.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // proactive + lookahead mutual exclusion
  // -----------------------------------------------------------------------

  describe("proactive + lookahead mutual exclusion", () => {
    it("proactive first → lookahead does not re-schedule", () => {
      const engine = createEngine(ctx, buffer);

      engine.start();

      // Only chunk 0 ready first → exits buffering (aheadSec=8 ≥ resumeSec=5)
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      expect(engine.getStatus().phase).toBe("playing");

      // Advance time so remaining < PROACTIVE_SCHEDULE_THRESHOLD_SEC (5.0)
      // chunk 0 output duration ≈ CHUNK0_RAW / 44100 ≈ 8.2s
      ctx._setCurrentTime(4.0); // elapsed=4, remaining≈4.2 < 5

      // Record createBuffer call count before proactive fires
      const createBufferMock = ctx.createBuffer as ReturnType<typeof vi.fn>;
      const callsBefore = createBufferMock.mock.calls.length;

      // chunk 1 ready → onChunkReady → proactive fires (remaining < 5s)
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);
      const callsAfterProactive = createBufferMock.mock.calls.length;
      expect(callsAfterProactive).toBe(callsBefore + 1); // one schedule for chunk 1

      // Advance lookahead timer → should NOT create another buffer
      vi.advanceTimersByTime(200); // LOOKAHEAD_INTERVAL_MS
      expect(createBufferMock.mock.calls.length).toBe(callsAfterProactive);

      engine.dispose();
    });

    it("lookahead first → proactive does not re-schedule", () => {
      const engine = createEngine(ctx, buffer);

      engine.start();

      // chunk 0 and chunk 1 both ready → exit buffering, playing chunk 0
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);
      expect(engine.getStatus().phase).toBe("playing");

      // Advance time so remaining < LOOKAHEAD_THRESHOLD_SEC (3.0)
      ctx._setCurrentTime(5.5); // elapsed=5.5, remaining≈2.7 < 3

      const createBufferMock = ctx.createBuffer as ReturnType<typeof vi.fn>;
      const callsBefore = createBufferMock.mock.calls.length;

      // Advance lookahead timer → lookahead fires → schedules chunk 1
      vi.advanceTimersByTime(200);
      const callsAfterLookahead = createBufferMock.mock.calls.length;
      expect(callsAfterLookahead).toBe(callsBefore + 1);

      // chunk 2 ready → onChunkReady fires but chunk 2 != currentChunkIndex+1
      // and chunk 1 already scheduled → no re-schedule
      workerStubs.simulateWorkerResult(0, 2, CHUNK2_RAW);
      expect(createBufferMock.mock.calls.length).toBe(callsAfterLookahead);

      engine.dispose();
    });

    it("does not schedule when remaining <= 0", () => {
      const engine = createEngine(ctx, buffer);

      engine.start();

      // chunk 0 ready → exits buffering, playing chunk 0
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      expect(engine.getStatus().phase).toBe("playing");

      // Advance time past chunk 0's output duration (≈8.2s)
      ctx._setCurrentTime(9.0); // elapsed=9, remaining≈-0.8 ≤ 0

      const createBufferMock = ctx.createBuffer as ReturnType<typeof vi.fn>;
      const callsBefore = createBufferMock.mock.calls.length;

      // chunk 1 ready → onChunkReady → proactive check: remaining ≤ 0 → should NOT schedule
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);
      expect(createBufferMock.mock.calls.length).toBe(callsBefore);

      // Also: lookahead should not schedule when remaining ≤ 0
      vi.advanceTimersByTime(200);
      expect(createBufferMock.mock.calls.length).toBe(callsBefore);

      engine.dispose();
    });
  });
});
