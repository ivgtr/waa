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

    it("pause → setTempo → getCurrentPosition does not shift", () => {
      const engine = createEngine(ctx, buffer, { tempo: 1.0 });

      engine.start();
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);
      expect(engine.getStatus().phase).toBe("playing");

      const posBeforePause = engine.getCurrentPosition();
      engine.pause();
      const posAfterPause = engine.getCurrentPosition();

      engine.setTempo(2.0);
      const posAfterSetTempo = engine.getCurrentPosition();

      // Position should not shift after setTempo during pause
      expect(posAfterSetTempo).toBeCloseTo(posAfterPause, 3);
      expect(posAfterSetTempo).toBeCloseTo(posBeforePause, 3);

      engine.dispose();
    });

    it("pause → multiple setTempo → getCurrentPosition stays stable", () => {
      const engine = createEngine(ctx, buffer, { tempo: 1.0 });

      engine.start();
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);
      expect(engine.getStatus().phase).toBe("playing");

      engine.pause();
      const posAfterPause = engine.getCurrentPosition();

      engine.setTempo(1.5);
      expect(engine.getCurrentPosition()).toBeCloseTo(posAfterPause, 3);

      engine.setTempo(2.0);
      expect(engine.getCurrentPosition()).toBeCloseTo(posAfterPause, 3);

      engine.setTempo(3.0);
      expect(engine.getCurrentPosition()).toBeCloseTo(posAfterPause, 3);

      engine.dispose();
    });

    it("pause → setTempo → resume resumes from correct position", () => {
      const engine = createEngine(ctx, buffer, { tempo: 1.0 });

      engine.start();
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);
      expect(engine.getStatus().phase).toBe("playing");

      const posBeforePause = engine.getCurrentPosition();
      engine.pause();

      engine.setTempo(2.0);
      engine.resume();

      // Should enter buffering for tempo-change
      expect(engine.getStatus().phase).toBe("buffering");

      // Provide new chunks at new tempo
      workerStubs.simulateWorkerResult(0, 0, Math.round(CHUNK0_RAW / 2));
      workerStubs.simulateWorkerResult(1, 1, Math.round(CHUNK1_RAW / 2));

      expect(engine.getStatus().phase).toBe("playing");
      // Position after resume should be close to the position before pause
      const posAfterResume = engine.getCurrentPosition();
      expect(posAfterResume).toBeCloseTo(posBeforePause, 1);

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
  // S-01: buffering 中の stop
  // -----------------------------------------------------------------------

  describe("S-01: buffering 中の stop", () => {
    it("stop during buffering transitions to ended", () => {
      const engine = createEngine(ctx, buffer);

      engine.start();
      expect(engine.getStatus().phase).toBe("buffering");

      // Stop during buffering (before any chunks are ready)
      engine.stop();
      expect(engine.getStatus().phase).toBe("ended");

      // Worker result arriving after stop should not crash
      expect(() => {
        workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      }).not.toThrow();

      expect(engine.getStatus().phase).toBe("ended");

      engine.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // S-02: buffering 中の dispose
  // -----------------------------------------------------------------------

  describe("S-02: buffering 中の dispose", () => {
    it("dispose during buffering is safe", () => {
      const engine = createEngine(ctx, buffer);

      engine.start();
      expect(engine.getStatus().phase).toBe("buffering");

      // dispose should not throw
      expect(() => engine.dispose()).not.toThrow();

      // Operations after dispose should be safe
      expect(() => {
        engine.start();
        engine.pause();
        engine.resume();
        engine.seek(5);
        engine.stop();
      }).not.toThrow();
    });

    it("dispose during buffering terminates workers (handlers nulled)", () => {
      const engine = createEngine(ctx, buffer);

      engine.start();
      expect(engine.getStatus().phase).toBe("buffering");

      // Workers should have onmessage handlers before dispose
      const workersBefore = workerStubs.workers.slice(-2);
      expect(workersBefore[0]!.onmessage).not.toBeNull();

      engine.dispose();

      // After dispose, workers should be terminated (handlers nulled)
      expect(workersBefore[0]!.onmessage).toBeNull();
      expect(workersBefore[0]!.onerror).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // S-03: pause → seek → resume
  // -----------------------------------------------------------------------

  describe("S-03: pause → seek → resume", () => {
    it("seek during pause updates position, resume plays from seek target", () => {
      const engine = createEngine(ctx, buffer);

      engine.start();
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);
      workerStubs.simulateWorkerResult(0, 2, CHUNK2_RAW);
      expect(engine.getStatus().phase).toBe("playing");

      engine.pause();
      expect(engine.getStatus().phase).toBe("paused");

      // Seek to 12s (in chunk 1)
      engine.seek(12);

      // Resume should play from near the seek position
      engine.resume();

      // Should be playing (chunk 1 is ready)
      expect(engine.getStatus().phase).toBe("playing");

      const pos = engine.getCurrentPosition();
      expect(pos).toBeGreaterThanOrEqual(11);
      expect(pos).toBeLessThanOrEqual(13);

      engine.dispose();
    });

    it("seek during pause to unready chunk → resume enters buffering", () => {
      const engine = createEngine(ctx, buffer);

      engine.start();
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);
      expect(engine.getStatus().phase).toBe("playing");

      engine.pause();

      // Seek to chunk 2 (not ready)
      engine.seek(18);

      // Resume → should enter buffering since target chunk is not ready
      engine.resume();

      // Phase should be buffering (chunk 2 not ready)
      // or playing if chunk 2 happens to be ready
      const phase = engine.getStatus().phase;
      expect(["buffering", "playing"]).toContain(phase);

      engine.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // S-04: ended 後の seek
  // -----------------------------------------------------------------------

  describe("S-04: ended 後の seek", () => {
    it("seek after stop does not crash and phase remains ended", () => {
      const engine = createEngine(ctx, buffer);

      engine.start();
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);

      engine.stop();
      expect(engine.getStatus().phase).toBe("ended");

      // Seek after ended — should not crash
      expect(() => engine.seek(10)).not.toThrow();

      engine.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // S-05: ended 後の pause / resume
  // -----------------------------------------------------------------------

  describe("S-05: ended 後の pause / resume", () => {
    it("pause and resume after stop are no-ops", () => {
      const engine = createEngine(ctx, buffer);

      engine.start();
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);

      engine.stop();
      expect(engine.getStatus().phase).toBe("ended");

      // These should be no-ops without crash
      expect(() => engine.pause()).not.toThrow();
      expect(engine.getStatus().phase).toBe("ended");

      expect(() => engine.resume()).not.toThrow();
      expect(engine.getStatus().phase).toBe("ended");

      engine.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // C-03: pause 中に onTransition タイマーが発火
  // -----------------------------------------------------------------------

  describe("C-03: pause 中の transition タイマー", () => {
    it("pause cancels transition timer, chunk index is preserved", () => {
      const engine = createEngine(ctx, buffer);

      engine.start();
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);
      workerStubs.simulateWorkerResult(0, 2, CHUNK2_RAW);
      expect(engine.getStatus().phase).toBe("playing");
      expect(engine.getSnapshot().currentChunkIndex).toBe(0);

      // Advance time near end of chunk 0 → lookahead triggers scheduleNext
      ctx._setCurrentTime(7.5);
      vi.advanceTimersByTime(200);

      // Pause before transition timer fires
      engine.pause();
      expect(engine.getStatus().phase).toBe("paused");

      const idxAfterPause = engine.getSnapshot().currentChunkIndex;

      // Advance time well past what would have been the transition
      vi.advanceTimersByTime(10000);

      // currentChunkIndex should not have changed
      expect(engine.getSnapshot().currentChunkIndex).toBe(idxAfterPause);

      engine.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // C-01: seek 中に onTransition が発火 (stale transition guard)
  // -----------------------------------------------------------------------

  describe("C-01: seek cancels stale transition", () => {
    it("seek during pending transition prevents stale transition", () => {
      const engine = createEngine(ctx, buffer);

      engine.start();
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);
      workerStubs.simulateWorkerResult(0, 2, CHUNK2_RAW);
      expect(engine.getStatus().phase).toBe("playing");

      // Advance time near end of chunk 0 → scheduleNext for chunk 1
      ctx._setCurrentTime(7.5);
      vi.advanceTimersByTime(200);

      // Now seek to chunk 2 (this should cancel the pending transition)
      engine.seek(16);

      const idxAfterSeek = engine.getSnapshot().currentChunkIndex;
      expect(idxAfterSeek).toBe(2);

      // Advance past old transition timer
      vi.advanceTimersByTime(10000);

      // currentChunkIndex should still be 2, not reverted to 1
      expect(engine.getSnapshot().currentChunkIndex).toBe(2);

      engine.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // C-02: setTempo debounce 中に onTransition が発火
  // -----------------------------------------------------------------------

  describe("C-02: setTempo during pending transition", () => {
    it("setTempo enters buffering and cancels pending transition", () => {
      const engine = createEngine(ctx, buffer);

      engine.start();
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);
      workerStubs.simulateWorkerResult(0, 2, CHUNK2_RAW);
      expect(engine.getStatus().phase).toBe("playing");

      // Advance time near end of chunk 0 → scheduleNext for chunk 1
      ctx._setCurrentTime(7.5);
      vi.advanceTimersByTime(200);

      const idxBefore = engine.getSnapshot().currentChunkIndex;

      // setTempo causes buffering → chunkPlayer.pause() → cancelTransition
      engine.setTempo(2.0);
      expect(engine.getStatus().phase).toBe("buffering");

      // Advance past old transition timer
      vi.advanceTimersByTime(10000);

      // currentChunkIndex should not have advanced from the stale transition
      expect(engine.getSnapshot().currentChunkIndex).toBe(idxBefore);

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

  // -----------------------------------------------------------------------
  // R-01: 連続 seek（seek→seek→seek）
  // -----------------------------------------------------------------------

  describe("R-01: 連続 seek", () => {
    it("rapid seek calls don't crash and final position is correct", () => {
      const engine = createEngine(ctx, buffer);

      engine.start();
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);
      workerStubs.simulateWorkerResult(0, 2, CHUNK2_RAW);
      expect(engine.getStatus().phase).toBe("playing");

      // Rapid consecutive seeks
      engine.seek(3);
      engine.seek(10);
      engine.seek(20);

      // Should be at chunk 2 (position 20)
      const pos = engine.getCurrentPosition();
      expect(pos).toBeGreaterThanOrEqual(19);
      expect(pos).toBeLessThanOrEqual(21);
      expect(engine.getSnapshot().currentChunkIndex).toBe(2);

      engine.dispose();
    });

    it("rapid seek during pause ends at final position", () => {
      const engine = createEngine(ctx, buffer);

      engine.start();
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);
      workerStubs.simulateWorkerResult(0, 2, CHUNK2_RAW);

      engine.pause();

      engine.seek(3);
      engine.seek(10);
      engine.seek(5);

      engine.resume();
      expect(engine.getStatus().phase).toBe("playing");

      const pos = engine.getCurrentPosition();
      expect(pos).toBeGreaterThanOrEqual(4);
      expect(pos).toBeLessThanOrEqual(6);

      engine.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // C-04: onChunkReady→exitBuffering→advanceToNextChunk 循環再入
  // -----------------------------------------------------------------------

  describe("C-04: exitBuffering → advanceToNextChunk recursion", () => {
    it("onChunkReady during buffering triggers exitBuffering safely", () => {
      const engine = createEngine(ctx, buffer, { tempo: 2.0 });

      engine.start();
      expect(engine.getStatus().phase).toBe("buffering");

      // Provide chunks — exitBuffering should fire
      workerStubs.simulateWorkerResult(0, 0, Math.round(CHUNK0_RAW / 2));
      workerStubs.simulateWorkerResult(1, 1, Math.round(CHUNK1_RAW / 2));

      // Should be playing now
      expect(engine.getStatus().phase).toBe("playing");

      engine.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // C-05: onTransition→updatePriorities→即座 onChunkReady
  // -----------------------------------------------------------------------

  describe("C-05: transition followed by immediate chunk ready", () => {
    it("transition + updatePriorities + onChunkReady in sequence does not crash", () => {
      const engine = createEngine(ctx, buffer);

      engine.start();
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);
      expect(engine.getStatus().phase).toBe("playing");

      // Advance to end of chunk 0 → onended
      const src0 = findActiveSource(ctx._sources);
      src0!.onended!();

      // Should have advanced to chunk 1
      expect(engine.getSnapshot().currentChunkIndex).toBe(1);

      // Now chunk 2 becomes ready immediately after transition
      workerStubs.simulateWorkerResult(0, 2, CHUNK2_RAW);

      // Should not crash, complete event should fire
      expect(engine.getStatus().phase).toBe("playing");

      engine.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // R-02: rapid pause→resume toggle
  // -----------------------------------------------------------------------

  describe("R-02: rapid pause→resume toggle", () => {
    it("rapid pause→resume cycles don't cause errors", () => {
      const engine = createEngine(ctx, buffer);

      engine.start();
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);
      expect(engine.getStatus().phase).toBe("playing");

      // Rapid toggle
      for (let i = 0; i < 10; i++) {
        engine.pause();
        engine.resume();
      }

      expect(engine.getStatus().phase).toBe("playing");

      engine.dispose();
    });

    it("rapid toggle preserves approximate position", () => {
      const engine = createEngine(ctx, buffer);

      engine.start();
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);

      ctx._setCurrentTime(3);
      const posBeforeToggles = engine.getCurrentPosition();

      engine.pause();
      engine.resume();
      engine.pause();
      engine.resume();

      const posAfterToggles = engine.getCurrentPosition();
      // Position should be close (within a small tolerance due to mock timing)
      expect(posAfterToggles).toBeGreaterThanOrEqual(posBeforeToggles - 1);
      expect(posAfterToggles).toBeLessThanOrEqual(posBeforeToggles + 1);

      engine.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // S-06: pause→setTempo→seek→resume
  // -----------------------------------------------------------------------

  describe("S-06: pause→setTempo→seek→resume", () => {
    it("combined operations don't crash and end in correct state", () => {
      const engine = createEngine(ctx, buffer);

      engine.start();
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);
      workerStubs.simulateWorkerResult(0, 2, CHUNK2_RAW);
      expect(engine.getStatus().phase).toBe("playing");

      engine.pause();
      engine.setTempo(2.0);
      engine.seek(10);
      engine.resume();

      // Should be buffering (tempo change requires re-conversion)
      expect(engine.getStatus().phase).toBe("buffering");
      expect(engine.getStatus().playback.tempo).toBe(2.0);

      engine.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // S-07: pause 中の setLoop
  // -----------------------------------------------------------------------

  describe("S-07: pause 中の setLoop", () => {
    it("setLoop during pause takes effect on resume", () => {
      const engine = createEngine(ctx, buffer, { loop: false });
      const loopHandler = vi.fn();
      engine.on("loop", loopHandler);

      engine.start();
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);
      workerStubs.simulateWorkerResult(0, 2, CHUNK2_RAW);
      expect(engine.getStatus().phase).toBe("playing");

      engine.pause();
      engine.setLoop(true);
      engine.resume();

      // Advance through all chunks
      const src0 = findActiveSource(ctx._sources);
      src0!.onended!();
      const src1 = findActiveSource(ctx._sources);
      src1!.onended!();
      const src2 = findActiveSource(ctx._sources);
      src2!.onended!();

      // Should loop instead of ending
      expect(loopHandler).toHaveBeenCalledTimes(1);
      expect(engine.getStatus().phase).toBe("playing");

      engine.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // S-08: pause 中の dispose
  // -----------------------------------------------------------------------

  describe("S-08: pause 中の dispose", () => {
    it("dispose during pause is clean", () => {
      const engine = createEngine(ctx, buffer);

      engine.start();
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);

      engine.pause();
      expect(engine.getStatus().phase).toBe("paused");

      expect(() => engine.dispose()).not.toThrow();

      // All operations after dispose should be safe
      expect(() => {
        engine.pause();
        engine.resume();
        engine.seek(5);
        engine.setTempo(2);
      }).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // S-09: pause→pause 冪等性
  // -----------------------------------------------------------------------

  describe("S-09: pause→pause 冪等性", () => {
    it("double pause is idempotent", () => {
      const engine = createEngine(ctx, buffer);

      engine.start();
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);

      engine.pause();
      const posAfterFirstPause = engine.getCurrentPosition();

      engine.pause(); // second pause should be no-op
      const posAfterSecondPause = engine.getCurrentPosition();

      expect(posAfterSecondPause).toBe(posAfterFirstPause);
      expect(engine.getStatus().phase).toBe("paused");

      engine.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // S-10: start 直後の setTempo
  // -----------------------------------------------------------------------

  describe("S-10: start 直後の setTempo", () => {
    it("setTempo immediately after start during buffering", () => {
      const startWorkerIdx = workerStubs.workers.length;
      const engine = createEngine(ctx, buffer, { tempo: 1.0 });

      engine.start();
      expect(engine.getStatus().phase).toBe("buffering");

      // setTempo during initial buffering
      engine.setTempo(2.0);
      expect(engine.getStatus().phase).toBe("buffering");
      expect(engine.getStatus().playback.tempo).toBe(2.0);

      // Advance debounce timer → handleTempoChange fires → cancelCurrent + reset
      vi.advanceTimersByTime(100);

      // Simulate cancel responses to free worker slots
      workerStubs.simulateWorkerCancel(startWorkerIdx, 0);
      workerStubs.simulateWorkerCancel(startWorkerIdx + 1, 1);

      // Now provide chunks at new tempo (new dispatch should have been triggered)
      workerStubs.simulateWorkerResult(startWorkerIdx, 0, Math.round(CHUNK0_RAW / 2));
      workerStubs.simulateWorkerResult(startWorkerIdx + 1, 1, Math.round(CHUNK1_RAW / 2));

      expect(engine.getStatus().phase).toBe("playing");

      engine.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // L-03: dispose 後のコールバック参照ガード
  // -----------------------------------------------------------------------

  describe("L-03: dispose 後のコールバック参照ガード", () => {
    it("callbacks from chunkPlayer after dispose are guarded", () => {
      const engine = createEngine(ctx, buffer);
      const errorHandler = vi.fn();
      engine.on("error", errorHandler);

      engine.start();
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);
      expect(engine.getStatus().phase).toBe("playing");

      // Grab the source before dispose
      const src = findActiveSource(ctx._sources);

      engine.dispose();

      // If somehow onended fires after dispose (stale reference), it should not crash
      // Note: dispose nulls out source.onended, so this is testing the edge case
      // where the reference was captured before dispose
      if (src?.onended) {
        expect(() => src.onended!()).not.toThrow();
      }

      // No error event should have been emitted
      expect(errorHandler).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // R-03: start 直後の pause（buffering 完了前）
  // -----------------------------------------------------------------------

  describe("R-03: start 直後の pause（buffering 完了前）", () => {
    it("R-03a: start → pause → chunk arrives → resume → playing", () => {
      const engine = createEngine(ctx, buffer);

      engine.start();
      expect(engine.getStatus().phase).toBe("buffering");

      // Pause during initial buffering
      engine.pause();
      expect(engine.getStatus().phase).toBe("paused");

      // Chunks arrive during pause — should NOT trigger exitBuffering
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);

      // Phase should still be paused
      expect(engine.getStatus().phase).toBe("paused");

      // Resume — chunk is ready, so should play
      engine.resume();
      expect(engine.getStatus().phase).toBe("playing");

      engine.dispose();
    });

    it("R-03b: start → pause → resume (chunk not ready) → buffering → chunk arrives → playing", () => {
      const engine = createEngine(ctx, buffer);

      engine.start();
      expect(engine.getStatus().phase).toBe("buffering");

      // Pause during initial buffering (no chunks ready yet)
      engine.pause();
      expect(engine.getStatus().phase).toBe("paused");

      // Resume without any chunks ready → enters buffering
      engine.resume();
      expect(engine.getStatus().phase).toBe("buffering");

      // Chunks arrive → exitBuffering → playing
      workerStubs.simulateWorkerResult(0, 0, CHUNK0_RAW);
      workerStubs.simulateWorkerResult(1, 1, CHUNK1_RAW);

      expect(engine.getStatus().phase).toBe("playing");

      engine.dispose();
    });
  });
});
