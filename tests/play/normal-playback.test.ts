import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { play } from "../../src/play";
import {
  createMockAudioBuffer,
  createMockAudioContext,
  type MockAudioContext,
} from "../helpers/audio-mocks";

describe("play() – normal playback (preservePitch: false)", () => {
  let ctx: MockAudioContext;
  let buffer: AudioBuffer;

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = createMockAudioContext();
    buffer = createMockAudioBuffer(10); // 10 sec
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  describe("initial state", () => {
    it("starts in playing state", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      expect(pb.getState()).toBe("playing");
      pb.dispose();
    });

    it("creates and starts a source node", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
      const src = ctx._sources[0]!;
      expect(src.start).toHaveBeenCalledWith(0, 0);
      expect(src.buffer).toBe(buffer);
      pb.dispose();
    });

    it("returns correct duration", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      expect(pb.getDuration()).toBe(10);
      pb.dispose();
    });

    it("starts from specified offset", () => {
      const pb = play(ctx, buffer, { preservePitch: false, offset: 3 });
      const src = ctx._sources[0]!;
      expect(src.start).toHaveBeenCalledWith(0, 3);
      pb.dispose();
    });

    it("applies initial playbackRate", () => {
      const pb = play(ctx, buffer, { preservePitch: false, playbackRate: 2 });
      const src = ctx._sources[0]!;
      expect(src.playbackRate.value).toBe(2);
      pb.dispose();
    });

    it("applies initial loop setting", () => {
      const pb = play(ctx, buffer, { preservePitch: false, loop: true });
      const src = ctx._sources[0]!;
      expect(src.loop).toBe(true);
      pb.dispose();
    });

    it("applies loopStart and loopEnd", () => {
      const pb = play(ctx, buffer, {
        preservePitch: false,
        loop: true,
        loopStart: 2,
        loopEnd: 8,
      });
      const src = ctx._sources[0]!;
      expect(src.loopStart).toBe(2);
      expect(src.loopEnd).toBe(8);
      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // pause / resume
  // -----------------------------------------------------------------------

  describe("pause / resume", () => {
    it("transitions to paused state", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.pause();
      expect(pb.getState()).toBe("paused");
      pb.dispose();
    });

    it("stops the source node on pause", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      const src = ctx._sources[0]!;
      pb.pause();
      expect(src.stop).toHaveBeenCalled();
      expect(src.onended).toBeNull();
      pb.dispose();
    });

    it("preserves position on pause", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      ctx._setCurrentTime(3);
      pb.pause();
      expect(pb.getCurrentTime()).toBeCloseTo(3, 1);
      pb.dispose();
    });

    it("resume creates a new source and starts from paused position", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      ctx._setCurrentTime(3);
      pb.pause();
      pb.resume();
      expect(pb.getState()).toBe("playing");
      expect(ctx.createBufferSource).toHaveBeenCalledTimes(2);
      const src2 = ctx._sources[1]!;
      // startSource(3) → src.start(0, 3)
      expect(src2.start).toHaveBeenCalledWith(0, 3);
      pb.dispose();
    });

    it("pause is no-op when not playing", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.stop();
      const callsBefore = (ctx.createBufferSource as ReturnType<typeof vi.fn>).mock.calls.length;
      pb.pause();
      expect(pb.getState()).toBe("stopped");
      expect((ctx.createBufferSource as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
        callsBefore,
      );
      pb.dispose();
    });

    it("resume is no-op when not paused", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      const callsBefore = (ctx.createBufferSource as ReturnType<typeof vi.fn>).mock.calls.length;
      pb.resume();
      expect(pb.getState()).toBe("playing");
      expect((ctx.createBufferSource as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
        callsBefore,
      );
      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // togglePlayPause
  // -----------------------------------------------------------------------

  describe("togglePlayPause", () => {
    it("pauses when playing", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.togglePlayPause();
      expect(pb.getState()).toBe("paused");
      pb.dispose();
    });

    it("resumes when paused", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.pause();
      pb.togglePlayPause();
      expect(pb.getState()).toBe("playing");
      pb.dispose();
    });

    it("does nothing when stopped", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.stop();
      pb.togglePlayPause();
      expect(pb.getState()).toBe("stopped");
      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // seek
  // -----------------------------------------------------------------------

  describe("seek", () => {
    it("updates position while playing", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      ctx._setCurrentTime(2);
      pb.seek(5);
      // After seek, a new source is started at position 5
      expect(ctx.createBufferSource).toHaveBeenCalledTimes(2);
      const src2 = ctx._sources[1]!;
      expect(src2.start).toHaveBeenCalledWith(0, 5);
      pb.dispose();
    });

    it("updates position while paused without starting playback", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.pause();
      pb.seek(5);
      expect(pb.getState()).toBe("paused");
      expect(pb.getCurrentTime()).toBe(5);
      // No new source created (only the initial one)
      expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
      pb.dispose();
    });

    it("clamps position to [0, duration]", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.pause();
      pb.seek(-5);
      expect(pb.getCurrentTime()).toBe(0);
      pb.seek(999);
      expect(pb.getCurrentTime()).toBe(10);
      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // stop
  // -----------------------------------------------------------------------

  describe("stop", () => {
    it("transitions to stopped state", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.stop();
      expect(pb.getState()).toBe("stopped");
      pb.dispose();
    });

    it("resets position to 0", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      ctx._setCurrentTime(5);
      pb.stop();
      expect(pb.getCurrentTime()).toBe(0);
      pb.dispose();
    });

    it("stop is no-op when already stopped", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.stop();
      const handler = vi.fn();
      pb.on("stop", handler);
      pb.stop();
      expect(handler).not.toHaveBeenCalled();
      pb.dispose();
    });

    it("can stop from paused state", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.pause();
      pb.stop();
      expect(pb.getState()).toBe("stopped");
      expect(pb.getCurrentTime()).toBe(0);
      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // getCurrentTime / getProgress
  // -----------------------------------------------------------------------

  describe("getCurrentTime / getProgress", () => {
    it("tracks elapsed time during playback", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      ctx._setCurrentTime(4);
      expect(pb.getCurrentTime()).toBeCloseTo(4, 1);
      expect(pb.getProgress()).toBeCloseTo(0.4, 1);
      pb.dispose();
    });

    it("accounts for playbackRate in elapsed time", () => {
      const pb = play(ctx, buffer, { preservePitch: false, playbackRate: 2 });
      ctx._setCurrentTime(3); // 3 sec elapsed at rate 2 → position = 6
      expect(pb.getCurrentTime()).toBeCloseTo(6, 1);
      pb.dispose();
    });

    it("does not exceed duration", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      ctx._setCurrentTime(20); // 20 sec elapsed, but buffer is 10 sec
      expect(pb.getCurrentTime()).toBe(10);
      pb.dispose();
    });

    it("returns 0 when stopped", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.stop();
      expect(pb.getCurrentTime()).toBe(0);
      expect(pb.getProgress()).toBe(0);
      pb.dispose();
    });

    it("returns 0 progress for zero-duration buffer", () => {
      const zeroBuf = createMockAudioBuffer(0);
      const pb = play(ctx, zeroBuf, { preservePitch: false });
      expect(pb.getProgress()).toBe(0);
      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // setPlaybackRate
  // -----------------------------------------------------------------------

  describe("setPlaybackRate", () => {
    it("changes rate on current source node", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.setPlaybackRate(1.5);
      const src = ctx._sources[0]!;
      expect(src.playbackRate.value).toBe(1.5);
      pb.dispose();
    });

    it("maintains position continuity after rate change", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      ctx._setCurrentTime(4); // position = 4
      pb.setPlaybackRate(2);
      // After setPlaybackRate: startedAt recalculated so position stays at 4
      expect(pb.getCurrentTime()).toBeCloseTo(4, 1);
      // Advance 1 more second at rate 2 → position = 4 + 2 = 6
      ctx._setCurrentTime(5);
      expect(pb.getCurrentTime()).toBeCloseTo(6, 1);
      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // setLoop
  // -----------------------------------------------------------------------

  describe("setLoop", () => {
    it("updates loop on current source node", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.setLoop(true);
      const src = ctx._sources[0]!;
      expect(src.loop).toBe(true);
      pb.dispose();
    });

    it("disables loop on current source node", () => {
      const pb = play(ctx, buffer, {
        preservePitch: false,
        loop: true,
      });
      pb.setLoop(false);
      const src = ctx._sources[0]!;
      expect(src.loop).toBe(false);
      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // through node chain
  // -----------------------------------------------------------------------

  describe("through node chain", () => {
    it("connects source through nodes to destination", () => {
      const gain1 = { connect: vi.fn() } as unknown as AudioNode;
      const gain2 = { connect: vi.fn() } as unknown as AudioNode;
      const pb = play(ctx, buffer, {
        preservePitch: false,
        through: [gain1, gain2],
      });
      const src = ctx._sources[0]!;
      expect(src.connect).toHaveBeenCalledWith(gain1);
      expect((gain1 as any).connect).toHaveBeenCalledWith(gain2);
      expect((gain2 as any).connect).toHaveBeenCalledWith(ctx.destination);
      pb.dispose();
    });

    it("connects directly to destination when through is empty", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      const src = ctx._sources[0]!;
      expect(src.connect).toHaveBeenCalledWith(ctx.destination);
      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // dispose
  // -----------------------------------------------------------------------

  describe("dispose", () => {
    it("stops source and clears timers", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      const src = ctx._sources[0]!;
      pb.dispose();
      expect(src.stop).toHaveBeenCalled();
      expect(src.disconnect).toHaveBeenCalled();
    });

    it("prevents further operations", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.dispose();
      // These should be no-ops after dispose
      pb.pause();
      pb.resume();
      pb.seek(5);
      pb.stop();
      // No additional source nodes created
      expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
    });

    it("double dispose is safe", () => {
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.dispose();
      expect(() => pb.dispose()).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // Loop position tracking
  // -----------------------------------------------------------------------

  describe("loop position tracking", () => {
    it("wraps position within loop region", () => {
      const pb = play(ctx, buffer, {
        preservePitch: false,
        loop: true,
        loopStart: 2,
        loopEnd: 6,
      });
      // Loop region: 2–6 (4 sec loop)
      // At ctx.currentTime = 7, elapsed = 7, loopDur = 4
      // position = ((7 - 2) % 4) + 2 = (5 % 4) + 2 = 1 + 2 = 3
      ctx._setCurrentTime(7);
      expect(pb.getCurrentTime()).toBeCloseTo(3, 1);
      pb.dispose();
    });

    it("wraps position using full duration when no loopStart/loopEnd", () => {
      const pb = play(ctx, buffer, {
        preservePitch: false,
        loop: true,
      });
      // loopDur = 10 - 0 = 10
      // At ctx.currentTime = 15, elapsed = 15
      // position = ((15 - 0) % 10) + 0 = 5
      ctx._setCurrentTime(15);
      expect(pb.getCurrentTime()).toBeCloseTo(5, 1);
      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // onended handling
  // -----------------------------------------------------------------------

  describe("onended handling", () => {
    it("transitions to stopped and emits ended when source ends naturally", () => {
      const endedHandler = vi.fn();
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.on("ended", endedHandler);

      const src = ctx._sources[0]!;
      src.onended!();

      expect(pb.getState()).toBe("stopped");
      expect(endedHandler).toHaveBeenCalledTimes(1);
      pb.dispose();
    });

    it("does not emit ended when looping (emits loop instead)", () => {
      const endedHandler = vi.fn();
      const loopHandler = vi.fn();
      const pb = play(ctx, buffer, {
        preservePitch: false,
        loop: true,
      });
      pb.on("ended", endedHandler);
      pb.on("loop", loopHandler);

      const src = ctx._sources[0]!;
      src.onended!();

      expect(endedHandler).not.toHaveBeenCalled();
      expect(loopHandler).toHaveBeenCalledTimes(1);
      expect(pb.getState()).toBe("playing");
      pb.dispose();
    });

    it("ignores onended when state is not playing", () => {
      const endedHandler = vi.fn();
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.on("ended", endedHandler);
      pb.pause();

      // Manually trigger the saved handler (shouldn't exist but testing safety)
      const src = ctx._sources[0]!;
      // onended was nulled on pause, so this simulates if it somehow fires
      if (src.onended) src.onended();

      expect(endedHandler).not.toHaveBeenCalled();
      pb.dispose();
    });
  });
});
