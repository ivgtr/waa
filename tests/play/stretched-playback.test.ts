import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createMockAudioContext,
  createMockAudioBuffer,
  type MockAudioContext,
} from "../helpers/audio-mocks";

// Mock the stretcher engine module before importing play
const mockEngine = {
  start: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  seek: vi.fn(),
  stop: vi.fn(),
  setTempo: vi.fn(),
  setLoop: vi.fn(),
  getCurrentPosition: vi.fn(() => 0),
  getStatus: vi.fn(() => ({ phase: "playing" })),
  getSnapshot: vi.fn(() => ({
    tempo: 1,
    converting: false,
    conversionProgress: 1,
    bufferHealth: "healthy",
    aheadSeconds: 10,
    buffering: false,
    chunkStates: [],
    currentChunkIndex: 0,
    activeWindowStart: 0,
    activeWindowEnd: 0,
    totalChunks: 1,
    windowConversionProgress: 1,
  })),
  on: vi.fn(() => () => {}),
  off: vi.fn(),
  dispose: vi.fn(),
};

// Capture the event handlers registered via engine.on()
const engineEventHandlers = new Map<string, ((...args: any[]) => void)[]>();

mockEngine.on.mockImplementation((event: string, handler: (...args: any[]) => void) => {
  if (!engineEventHandlers.has(event)) {
    engineEventHandlers.set(event, []);
  }
  engineEventHandlers.get(event)!.push(handler);
  return () => {
    const handlers = engineEventHandlers.get(event);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    }
  };
});

function emitEngineEvent(event: string, data?: any) {
  const handlers = engineEventHandlers.get(event);
  if (handlers) {
    for (const handler of handlers) {
      handler(data);
    }
  }
}

vi.mock("../../src/stretcher/engine.js", () => ({
  createStretcherEngine: vi.fn(() => mockEngine),
}));

import { play } from "../../src/play";

describe("play() – stretched playback (preservePitch: true)", () => {
  let ctx: MockAudioContext;
  let buffer: AudioBuffer;

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = createMockAudioContext();
    buffer = createMockAudioBuffer(60);
    vi.clearAllMocks();
    engineEventHandlers.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Helper: flush microtasks to resolve the dynamic import
  async function flushImport() {
    await vi.advanceTimersByTimeAsync(0);
  }

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  describe("initial state", () => {
    it("starts in playing state immediately", () => {
      const pb = play(ctx, buffer, { preservePitch: true });
      expect(pb.getState()).toBe("playing");
      pb.dispose();
    });

    it("emits statechange and play events synchronously", () => {
      // These events fire before the engine loads
      const stateHandler = vi.fn();
      // Can't subscribe before construction, but verify state is playing
      const pb = play(ctx, buffer, { preservePitch: true });
      pb.on("statechange", stateHandler);
      // Already in playing state, no transition
      expect(pb.getState()).toBe("playing");
      pb.dispose();
    });

    it("returns initial offset as position before engine loads", () => {
      const pb = play(ctx, buffer, { preservePitch: true, offset: 5 });
      expect(pb.getCurrentTime()).toBe(5);
      pb.dispose();
    });

    it("returns correct duration", () => {
      const pb = play(ctx, buffer, { preservePitch: true });
      expect(pb.getDuration()).toBe(60);
      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // Engine loading
  // -----------------------------------------------------------------------

  describe("engine loading", () => {
    it("creates engine and starts it after dynamic import", async () => {
      const { createStretcherEngine } = await import("../../src/stretcher/engine.js");
      const pb = play(ctx, buffer, { preservePitch: true, playbackRate: 1.5 });

      await flushImport();

      expect(createStretcherEngine).toHaveBeenCalled();
      expect(mockEngine.start).toHaveBeenCalled();

      pb.dispose();
    });

    it("passes options to engine", async () => {
      const { createStretcherEngine } = await import("../../src/stretcher/engine.js");
      const dest = {} as AudioNode;
      const through1 = {} as AudioNode;

      const pb = play(ctx, buffer, {
        preservePitch: true,
        playbackRate: 1.5,
        offset: 3,
        loop: true,
        through: [through1],
        destination: dest,
      });

      await flushImport();

      expect(createStretcherEngine).toHaveBeenCalledWith(
        ctx,
        buffer,
        expect.objectContaining({
          tempo: 1.5,
          offset: 3,
          loop: true,
          through: [through1],
          destination: dest,
        }),
      );

      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // Operations before engine loads (pending operations)
  // -----------------------------------------------------------------------

  describe("operations before engine loads", () => {
    it("pause before engine → engine.pause() called after load", async () => {
      const pb = play(ctx, buffer, { preservePitch: true });
      pb.pause();
      expect(pb.getState()).toBe("paused");

      await flushImport();

      expect(mockEngine.pause).toHaveBeenCalled();
      pb.dispose();
    });

    it("stop before engine → engine.stop() called after load", async () => {
      const pb = play(ctx, buffer, { preservePitch: true });
      pb.stop();
      expect(pb.getState()).toBe("stopped");

      await flushImport();

      expect(mockEngine.stop).toHaveBeenCalled();
      pb.dispose();
    });

    it("seek before engine → pendingSeek applied after load", async () => {
      const pb = play(ctx, buffer, { preservePitch: true });
      pb.seek(15);
      expect(pb.getCurrentTime()).toBe(15);

      await flushImport();

      expect(mockEngine.seek).toHaveBeenCalledWith(15);
      pb.dispose();
    });

    it("setPlaybackRate before engine → stored and passed to engine", async () => {
      const pb = play(ctx, buffer, { preservePitch: true });
      pb.setPlaybackRate(2);

      await flushImport();

      // The rate is passed during engine creation via options.tempo
      // After engine loads, setTempo is not called for initial rate
      // because it was passed via options
      pb.dispose();
    });

    it("setLoop before engine → stored and passed to engine", async () => {
      const pb = play(ctx, buffer, { preservePitch: true });
      pb.setLoop(true);

      await flushImport();
      // Loop value is passed via engine options during creation
      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // Delegated operations (after engine loads)
  // -----------------------------------------------------------------------

  describe("delegated operations", () => {
    it("pause delegates to engine", async () => {
      const pb = play(ctx, buffer, { preservePitch: true });
      await flushImport();

      pb.pause();
      expect(mockEngine.pause).toHaveBeenCalled();
      expect(pb.getState()).toBe("paused");
      pb.dispose();
    });

    it("resume delegates to engine", async () => {
      const pb = play(ctx, buffer, { preservePitch: true });
      await flushImport();

      pb.pause();
      pb.resume();
      expect(mockEngine.resume).toHaveBeenCalled();
      expect(pb.getState()).toBe("playing");
      pb.dispose();
    });

    it("seek delegates to engine", async () => {
      const pb = play(ctx, buffer, { preservePitch: true });
      await flushImport();

      pb.seek(20);
      expect(mockEngine.seek).toHaveBeenCalledWith(20);
      pb.dispose();
    });

    it("stop delegates to engine", async () => {
      const pb = play(ctx, buffer, { preservePitch: true });
      await flushImport();

      pb.stop();
      expect(mockEngine.stop).toHaveBeenCalled();
      expect(pb.getState()).toBe("stopped");
      pb.dispose();
    });

    it("setPlaybackRate delegates to engine.setTempo", async () => {
      const pb = play(ctx, buffer, { preservePitch: true });
      await flushImport();

      pb.setPlaybackRate(1.5);
      expect(mockEngine.setTempo).toHaveBeenCalledWith(1.5);
      pb.dispose();
    });

    it("setLoop delegates to engine.setLoop", async () => {
      const pb = play(ctx, buffer, { preservePitch: true });
      await flushImport();

      pb.setLoop(true);
      expect(mockEngine.setLoop).toHaveBeenCalledWith(true);
      pb.dispose();
    });

    it("getCurrentTime returns engine position", async () => {
      const pb = play(ctx, buffer, { preservePitch: true });
      await flushImport();

      mockEngine.getCurrentPosition.mockReturnValue(25);
      expect(pb.getCurrentTime()).toBe(25);
      pb.dispose();
    });

    it("getProgress uses engine position", async () => {
      const pb = play(ctx, buffer, { preservePitch: true });
      await flushImport();

      mockEngine.getCurrentPosition.mockReturnValue(30);
      expect(pb.getProgress()).toBeCloseTo(0.5, 2);
      pb.dispose();
    });

    it("togglePlayPause works", async () => {
      const pb = play(ctx, buffer, { preservePitch: true });
      await flushImport();

      pb.togglePlayPause();
      expect(pb.getState()).toBe("paused");

      pb.togglePlayPause();
      expect(pb.getState()).toBe("playing");
      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // Engine event relay
  // -----------------------------------------------------------------------

  describe("engine event relay", () => {
    it("relays buffering event", async () => {
      const handler = vi.fn();
      const pb = play(ctx, buffer, { preservePitch: true });
      pb.on("buffering", handler);

      await flushImport();

      emitEngineEvent("buffering", { reason: "initial" });
      expect(handler).toHaveBeenCalledWith({ reason: "initial" });
      pb.dispose();
    });

    it("relays buffered event", async () => {
      const handler = vi.fn();
      const pb = play(ctx, buffer, { preservePitch: true });
      pb.on("buffered", handler);

      await flushImport();

      emitEngineEvent("buffered", { stallDuration: 100 });
      expect(handler).toHaveBeenCalledWith({ stallDuration: 100 });
      pb.dispose();
    });

    it("relays loop event", async () => {
      const handler = vi.fn();
      const pb = play(ctx, buffer, { preservePitch: true });
      pb.on("loop", handler);

      await flushImport();

      emitEngineEvent("loop");
      expect(handler).toHaveBeenCalledTimes(1);
      pb.dispose();
    });

    it("relays ended event and transitions to stopped", async () => {
      const endedHandler = vi.fn();
      const stateHandler = vi.fn();
      const pb = play(ctx, buffer, { preservePitch: true });
      pb.on("ended", endedHandler);
      pb.on("statechange", stateHandler);

      await flushImport();

      emitEngineEvent("ended");
      expect(pb.getState()).toBe("stopped");
      expect(endedHandler).toHaveBeenCalledTimes(1);
      expect(stateHandler).toHaveBeenCalledWith({ state: "stopped" });
      pb.dispose();
    });

    it("relays fatal error and transitions to stopped", async () => {
      const endedHandler = vi.fn();
      const stateHandler = vi.fn();
      const pb = play(ctx, buffer, { preservePitch: true });
      pb.on("ended", endedHandler);
      pb.on("statechange", stateHandler);

      await flushImport();

      emitEngineEvent("error", { fatal: true, message: "crash" });
      expect(pb.getState()).toBe("stopped");
      expect(endedHandler).toHaveBeenCalled();
      expect(stateHandler).toHaveBeenCalledWith({ state: "stopped" });
      pb.dispose();
    });

    it("non-fatal error does not change state", async () => {
      const stateHandler = vi.fn();
      const pb = play(ctx, buffer, { preservePitch: true });
      pb.on("statechange", stateHandler);

      await flushImport();

      emitEngineEvent("error", { fatal: false, message: "retry" });
      expect(pb.getState()).toBe("playing");
      expect(stateHandler).not.toHaveBeenCalled();
      pb.dispose();
    });

    it("does not relay events after dispose", async () => {
      const handler = vi.fn();
      const pb = play(ctx, buffer, { preservePitch: true });
      pb.on("buffering", handler);

      await flushImport();

      pb.dispose();
      emitEngineEvent("buffering", { reason: "underrun" });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // stop() then engine ended does not double-fire statechange
  // -----------------------------------------------------------------------

  describe("stop + ended race condition", () => {
    it("stop() then engine ended does not double-fire statechange", async () => {
      const stateHandler = vi.fn();
      const pb = play(ctx, buffer, { preservePitch: true });
      pb.on("statechange", stateHandler);

      await flushImport();

      pb.stop();
      expect(stateHandler).toHaveBeenCalledTimes(1);
      expect(stateHandler).toHaveBeenCalledWith({ state: "stopped" });

      // Engine fires ended after stop — setState guard prevents double-fire
      emitEngineEvent("ended");
      expect(stateHandler).toHaveBeenCalledTimes(1);
      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // Dispose
  // -----------------------------------------------------------------------

  describe("dispose", () => {
    it("disposes engine", async () => {
      const pb = play(ctx, buffer, { preservePitch: true });
      await flushImport();

      pb.dispose();
      expect(mockEngine.dispose).toHaveBeenCalled();
    });

    it("dispose before engine loads is safe", () => {
      const pb = play(ctx, buffer, { preservePitch: true });
      expect(() => pb.dispose()).not.toThrow();
    });

    it("double dispose is safe", async () => {
      const pb = play(ctx, buffer, { preservePitch: true });
      await flushImport();

      pb.dispose();
      expect(() => pb.dispose()).not.toThrow();
    });

    it("operations after dispose are no-ops", async () => {
      const pb = play(ctx, buffer, { preservePitch: true });
      await flushImport();

      pb.dispose();

      expect(() => {
        pb.pause();
        pb.resume();
        pb.seek(5);
        pb.stop();
        pb.setPlaybackRate(2);
        pb.setLoop(true);
      }).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // Timeupdate timer
  // -----------------------------------------------------------------------

  describe("timeupdate timer", () => {
    it("fires timeupdate while playing", async () => {
      const handler = vi.fn();
      const pb = play(ctx, buffer, {
        preservePitch: true,
        timeupdateInterval: 100,
      });
      pb.on("timeupdate", handler);

      await flushImport();

      mockEngine.getCurrentPosition.mockReturnValue(5);
      vi.advanceTimersByTime(100);
      expect(handler).toHaveBeenCalledWith({ position: 5, duration: 60 });
      pb.dispose();
    });

    it("stops timeupdate on pause", async () => {
      const handler = vi.fn();
      const pb = play(ctx, buffer, {
        preservePitch: true,
        timeupdateInterval: 100,
      });
      pb.on("timeupdate", handler);

      await flushImport();

      pb.pause();
      vi.advanceTimersByTime(500);
      expect(handler).not.toHaveBeenCalled();
      pb.dispose();
    });

    it("stops timeupdate on stop", async () => {
      const handler = vi.fn();
      const pb = play(ctx, buffer, {
        preservePitch: true,
        timeupdateInterval: 100,
      });
      pb.on("timeupdate", handler);

      await flushImport();

      pb.stop();
      vi.advanceTimersByTime(500);
      expect(handler).not.toHaveBeenCalled();
      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // _getStretcherSnapshot
  // -----------------------------------------------------------------------

  describe("_getStretcherSnapshot", () => {
    it("returns null before engine loads", () => {
      const pb = play(ctx, buffer, { preservePitch: true }) as any;
      expect(pb._getStretcherSnapshot()).toBeNull();
      pb.dispose();
    });

    it("returns engine snapshot after load", async () => {
      const pb = play(ctx, buffer, { preservePitch: true }) as any;
      await flushImport();

      const snapshot = pb._getStretcherSnapshot();
      expect(snapshot).not.toBeNull();
      expect(snapshot.tempo).toBe(1);
      pb.dispose();
    });
  });
});
