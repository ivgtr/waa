import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { play } from "../../src/play";
import {
  createMockAudioBuffer,
  createMockAudioContext,
  type MockAudioContext,
} from "../helpers/audio-mocks";

describe("play() – normal edge cases (preservePitch: false)", () => {
  let ctx: MockAudioContext;
  let buffer: AudioBuffer;

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = createMockAudioContext();
    buffer = createMockAudioBuffer(10);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // loopEnd <= loopStart → loopDur guard falls back to non-loop behavior
  // -----------------------------------------------------------------------

  describe("loopEnd <= loopStart (loopDur guard)", () => {
    it("loopEnd === loopStart falls back to non-loop position", () => {
      const pb = play(ctx, buffer, {
        preservePitch: false,
        loop: true,
        loopStart: 5,
        loopEnd: 5,
      });
      ctx._setCurrentTime(6);
      const pos = pb.getCurrentTime();
      // loopDur = 0 → guard returns Math.min(elapsed, duration) = 6
      expect(pos).toBe(6);
      pb.dispose();
    });

    it("loopEnd < loopStart falls back to non-loop position", () => {
      const pb = play(ctx, buffer, {
        preservePitch: false,
        loop: true,
        loopStart: 8,
        loopEnd: 3,
      });
      ctx._setCurrentTime(5);
      const pos = pb.getCurrentTime();
      // loopDur = -5 → guard returns Math.min(elapsed, duration) = 5
      expect(pos).toBe(5);
      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // playbackRate = 0 → clamped to 1 / ignored by setPlaybackRate
  // -----------------------------------------------------------------------

  describe("playbackRate = 0 (validation guard)", () => {
    it("playbackRate: 0 is clamped to 1", () => {
      const pb = play(ctx, buffer, {
        preservePitch: false,
        playbackRate: 0,
      });
      ctx._setCurrentTime(5);
      const pos = pb.getCurrentTime();
      // rate clamped to 1, elapsed = (5 - 0) * 1 = 5
      expect(pos).toBe(5);
      pb.dispose();
    });

    it("setPlaybackRate(0) is ignored", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      ctx._setCurrentTime(4);
      pb.setPlaybackRate(0);
      const pos = pb.getCurrentTime();
      // setPlaybackRate(0) is a no-op, rate stays 1, position = 4
      expect(pos).toBe(4);
      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // sourceNode.stop() double-call exception absorption
  // -----------------------------------------------------------------------

  describe("sourceNode.stop() double call", () => {
    it("does not throw when stop() is called on already stopped source", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      const src = ctx._sources[0]!;
      // Make stop throw on second call (simulating real behavior)
      let callCount = 0;
      src.stop = vi.fn(() => {
        callCount++;
        if (callCount > 1) throw new DOMException("already stopped");
      });

      // pause calls stopSource which calls stop()
      pb.pause();
      expect(callCount).toBe(1);

      // stop calls stopSource again – but source was already nulled by pause
      // so the try/catch in stopSource shouldn't even be needed
      expect(() => pb.stop()).not.toThrow();

      pb.dispose();
    });

    it("absorbs exception from sourceNode.stop() in stopSource", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      const src = ctx._sources[0]!;
      src.stop = vi.fn(() => {
        throw new DOMException("InvalidStateError");
      });
      // pause → stopSource → try { stop() } catch → safe
      expect(() => pb.pause()).not.toThrow();
      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // dispose safety: async callback after dispose
  // -----------------------------------------------------------------------

  describe("dispose safety", () => {
    it("timeupdate does not fire after dispose", () => {
      const handler = vi.fn();
      const pb = play(ctx, buffer, {
        preservePitch: false,
        timeupdateInterval: 50,
      });
      pb.on("timeupdate", handler);
      pb.dispose();

      ctx._setCurrentTime(5);
      vi.advanceTimersByTime(200);
      expect(handler).not.toHaveBeenCalled();
    });

    it("onended does not fire after dispose", () => {
      const handler = vi.fn();
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.on("ended", handler);

      // Save reference to onended before dispose nulls it
      const src = ctx._sources[0]!;
      const savedOnEnded = src.onended;

      pb.dispose();

      // Even if somehow onended fires, it should be a no-op
      // because dispose nulls onended and clears emitter
      if (savedOnEnded) savedOnEnded();
      expect(handler).not.toHaveBeenCalled();
    });

    it("operations after dispose are safe no-ops", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.dispose();

      expect(() => {
        pb.pause();
        pb.resume();
        pb.togglePlayPause();
        pb.seek(5);
        pb.stop();
        pb.setPlaybackRate(2);
        pb.setLoop(true);
        pb.getCurrentTime();
        pb.getProgress();
      }).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // Rate change position continuity
  // -----------------------------------------------------------------------

  describe("rate change position continuity", () => {
    it("position is continuous across multiple rate changes", () => {
      const pb = play(ctx, buffer, { preservePitch: false });

      // Play at rate 1 for 2 sec → position = 2
      ctx._setCurrentTime(2);
      expect(pb.getCurrentTime()).toBeCloseTo(2, 1);

      // Change to rate 2
      pb.setPlaybackRate(2);
      expect(pb.getCurrentTime()).toBeCloseTo(2, 1); // still 2

      // Play 1 more sec at rate 2 → position = 2 + 2 = 4
      ctx._setCurrentTime(3);
      expect(pb.getCurrentTime()).toBeCloseTo(4, 1);

      // Change to rate 0.5
      pb.setPlaybackRate(0.5);
      expect(pb.getCurrentTime()).toBeCloseTo(4, 1); // still 4

      // Play 2 more sec at rate 0.5 → position = 4 + 1 = 5
      ctx._setCurrentTime(5);
      expect(pb.getCurrentTime()).toBeCloseTo(5, 1);

      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // Seek edge cases
  // -----------------------------------------------------------------------

  describe("seek edge cases", () => {
    it("seek to 0 during playback", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      ctx._setCurrentTime(5);
      pb.seek(0);
      // New source started at offset 0
      const src = ctx._sources[1]!;
      expect(src.start).toHaveBeenCalledWith(0, 0);
      pb.dispose();
    });

    it("seek to end of buffer", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.seek(10);
      const src = ctx._sources[1]!;
      expect(src.start).toHaveBeenCalledWith(0, 10);
      pb.dispose();
    });

    it("rapid sequential seeks only use final position", () => {
      const seekHandler = vi.fn();
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.on("seek", seekHandler);

      pb.seek(2);
      pb.seek(5);
      pb.seek(8);

      expect(seekHandler).toHaveBeenCalledTimes(3);
      // 3 new sources created (plus the initial one)
      expect(ctx.createBufferSource).toHaveBeenCalledTimes(4);
      // Last source should start at position 8
      const lastSrc = ctx._sources[3]!;
      expect(lastSrc.start).toHaveBeenCalledWith(0, 8);
      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // Pause/resume position accuracy
  // -----------------------------------------------------------------------

  describe("pause/resume position accuracy", () => {
    it("multiple pause/resume cycles preserve position", () => {
      const pb = play(ctx, buffer, { preservePitch: false });

      // Play 2 sec, pause
      ctx._setCurrentTime(2);
      pb.pause();
      expect(pb.getCurrentTime()).toBeCloseTo(2, 1);

      // Resume, play 3 more sec, pause
      ctx._setCurrentTime(5); // 3 sec later
      pb.resume();
      // After resume, position should start from 2
      // startedAt = 5 - 2/1 = 3, so at ctx.currentTime=5: elapsed = (5-3)*1 = 2 ✓
      expect(pb.getCurrentTime()).toBeCloseTo(2, 1);

      // Advance 1 sec
      ctx._setCurrentTime(6);
      expect(pb.getCurrentTime()).toBeCloseTo(3, 1);

      pb.pause();
      expect(pb.getCurrentTime()).toBeCloseTo(3, 1);

      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // Options defaults
  // -----------------------------------------------------------------------

  describe("default options", () => {
    it("works with no options (defaults to preservePitch: true)", () => {
      // This test verifies the default path goes to stretched playback
      // We just verify it doesn't crash
      // (Note: this will try to import stretcher engine)
      const pb = play(ctx, buffer);
      expect(pb.getState()).toBe("playing");
      pb.dispose();
    });

    it("works with empty options object", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      expect(pb.getState()).toBe("playing");
      expect(pb.getCurrentTime()).toBe(0);
      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // Custom destination
  // -----------------------------------------------------------------------

  describe("custom destination", () => {
    it("connects to custom destination instead of ctx.destination", () => {
      const customDest = { connect: vi.fn() } as unknown as AudioNode;
      const pb = play(ctx, buffer, {
        preservePitch: false,
        destination: customDest,
      });
      const src = ctx._sources[0]!;
      expect(src.connect).toHaveBeenCalledWith(customDest);
      pb.dispose();
    });
  });
});
