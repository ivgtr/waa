import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createChunkPlayer } from "../../src/stretcher/chunk-player";
import { createMockAudioContext, type MockAudioContext } from "../helpers/audio-mocks";

describe("createChunkPlayer – advanced", () => {
  let ctx: MockAudioContext;

  function createMockBuffer(durationSec: number): AudioBuffer {
    const length = Math.round(durationSec * 44100);
    const data = new Float32Array(length);
    return {
      numberOfChannels: 1,
      length,
      sampleRate: 44100,
      duration: durationSec,
      getChannelData: () => data,
    } as unknown as AudioBuffer;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = createMockAudioContext();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // scheduleNext crossfade
  // -----------------------------------------------------------------------

  describe("scheduleNext – crossfade", () => {
    it("applies fade-in curve on playChunk", () => {
      const player = createChunkPlayer(ctx, {
        destination: ctx.destination,
        crossfadeSec: 0.1,
      });

      const buf = createMockBuffer(8);
      player.playChunk(buf, ctx.currentTime, 0);

      // Gain node should have setValueCurveAtTime called for fade-in
      const gain = ctx._gains[0]!;
      expect(gain.gain.setValueCurveAtTime).toHaveBeenCalled();

      player.dispose();
    });

    it("skips fade when crossfadeSec is 0", () => {
      const player = createChunkPlayer(ctx, {
        destination: ctx.destination,
        crossfadeSec: 0,
      });

      const buf = createMockBuffer(8);
      player.playChunk(buf, ctx.currentTime, 0);

      const gain = ctx._gains[0]!;
      expect(gain.gain.setValueCurveAtTime).not.toHaveBeenCalled();

      player.dispose();
    });

    it("skips fade-in when skipFadeIn=true", () => {
      const player = createChunkPlayer(ctx, {
        destination: ctx.destination,
        crossfadeSec: 0.1,
      });

      const buf = createMockBuffer(8);
      player.playChunk(buf, ctx.currentTime, 0, true);

      const gain = ctx._gains[0]!;
      expect(gain.gain.setValueCurveAtTime).not.toHaveBeenCalled();

      player.dispose();
    });

    it("applies fade-in by default (skipFadeIn not set)", () => {
      const player = createChunkPlayer(ctx, {
        destination: ctx.destination,
        crossfadeSec: 0.1,
      });

      const buf = createMockBuffer(8);
      player.playChunk(buf, ctx.currentTime, 0);

      const gain = ctx._gains[0]!;
      expect(gain.gain.setValueCurveAtTime).toHaveBeenCalled();

      player.dispose();
    });

    it("applies crossfade curves on scheduleNext", () => {
      const player = createChunkPlayer(ctx, {
        destination: ctx.destination,
        crossfadeSec: 0.1,
      });

      const buf1 = createMockBuffer(8);
      const buf2 = createMockBuffer(8);

      player.playChunk(buf1, ctx.currentTime, 0);

      // scheduleNext at startTime = 8
      player.scheduleNext(buf2, 8);

      // Current gain should have fade-out, next gain should have fade-in
      const currentGain = ctx._gains[0]!;
      const nextGain = ctx._gains[1]!;

      // setValueCurveAtTime called at least twice (fade-in on play, fade-out on scheduleNext)
      expect(currentGain.gain.setValueCurveAtTime.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(nextGain.gain.setValueCurveAtTime).toHaveBeenCalled();

      player.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // startLookahead / stopLookahead
  // -----------------------------------------------------------------------

  describe("lookahead timer management", () => {
    it("starts lookahead timer on playChunk", () => {
      const onNeedNext = vi.fn();
      const player = createChunkPlayer(ctx, {
        destination: ctx.destination,
        crossfadeSec: 0,
      });
      player.setOnNeedNext(onNeedNext);

      const buf = createMockBuffer(2);
      player.playChunk(buf, ctx.currentTime, 0);

      // Advance time close to end
      ctx._setCurrentTime(1.6);
      vi.advanceTimersByTime(200); // LOOKAHEAD_INTERVAL_MS

      expect(onNeedNext).toHaveBeenCalled();

      player.dispose();
    });

    it("does not fire onNeedNext when plenty of time remaining", () => {
      const onNeedNext = vi.fn();
      const player = createChunkPlayer(ctx, {
        destination: ctx.destination,
        crossfadeSec: 0,
      });
      player.setOnNeedNext(onNeedNext);

      const buf = createMockBuffer(10);
      player.playChunk(buf, ctx.currentTime, 0);

      // Only 1 sec elapsed, 9 sec remaining
      ctx._setCurrentTime(1);
      vi.advanceTimersByTime(200);

      expect(onNeedNext).not.toHaveBeenCalled();

      player.dispose();
    });

    it("stops lookahead on pause", () => {
      const onNeedNext = vi.fn();
      const player = createChunkPlayer(ctx, {
        destination: ctx.destination,
        crossfadeSec: 0,
      });
      player.setOnNeedNext(onNeedNext);

      const buf = createMockBuffer(2);
      player.playChunk(buf, ctx.currentTime, 0);
      player.pause();

      ctx._setCurrentTime(1.6);
      vi.advanceTimersByTime(200);

      expect(onNeedNext).not.toHaveBeenCalled();

      player.dispose();
    });

    it("stops lookahead on stop", () => {
      const onNeedNext = vi.fn();
      const player = createChunkPlayer(ctx, {
        destination: ctx.destination,
        crossfadeSec: 0,
      });
      player.setOnNeedNext(onNeedNext);

      const buf = createMockBuffer(2);
      player.playChunk(buf, ctx.currentTime, 0);
      player.stop();

      ctx._setCurrentTime(1.6);
      vi.advanceTimersByTime(200);

      expect(onNeedNext).not.toHaveBeenCalled();

      player.dispose();
    });

    it("does not fire onNeedNext when next is already scheduled", () => {
      const onNeedNext = vi.fn();
      const player = createChunkPlayer(ctx, {
        destination: ctx.destination,
        crossfadeSec: 0,
      });
      player.setOnNeedNext(onNeedNext);

      const buf1 = createMockBuffer(2);
      const buf2 = createMockBuffer(2);
      player.playChunk(buf1, ctx.currentTime, 0);
      player.scheduleNext(buf2, 2);

      ctx._setCurrentTime(1.6);
      vi.advanceTimersByTime(200);

      // nextSource exists, so onNeedNext should not fire
      expect(onNeedNext).not.toHaveBeenCalled();

      player.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // connectToDestination with through array
  // -----------------------------------------------------------------------

  describe("connectToDestination with through", () => {
    it("chains through nodes to destination", () => {
      const through1 = { connect: vi.fn() } as unknown as AudioNode;
      const through2 = { connect: vi.fn() } as unknown as AudioNode;

      const player = createChunkPlayer(ctx, {
        destination: ctx.destination,
        through: [through1, through2],
        crossfadeSec: 0,
      });

      const buf = createMockBuffer(5);
      player.playChunk(buf, ctx.currentTime, 0);

      // gain -> through1 -> through2 -> destination
      const gain = ctx._gains[0]!;
      expect(gain.connect).toHaveBeenCalledWith(through1);
      expect((through1 as any).connect).toHaveBeenCalledWith(through2);
      expect((through2 as any).connect).toHaveBeenCalledWith(ctx.destination);

      player.dispose();
    });

    it("connects directly to destination when through is empty", () => {
      const player = createChunkPlayer(ctx, {
        destination: ctx.destination,
        crossfadeSec: 0,
      });

      const buf = createMockBuffer(5);
      player.playChunk(buf, ctx.currentTime, 0);

      const gain = ctx._gains[0]!;
      expect(gain.connect).toHaveBeenCalledWith(ctx.destination);

      player.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // handleSeek
  // -----------------------------------------------------------------------

  describe("handleSeek", () => {
    it("restarts playback at the given offset", () => {
      const player = createChunkPlayer(ctx, {
        destination: ctx.destination,
        crossfadeSec: 0,
      });

      const buf = createMockBuffer(10);
      player.playChunk(buf, ctx.currentTime, 0);

      ctx._setCurrentTime(3);
      player.handleSeek(buf, 5);

      // Position should be at the seek offset
      expect(player.getCurrentPosition()).toBe(5);

      // A new source should have been created
      expect(ctx._sources.length).toBe(2);
      expect(ctx._sources[1]!.start).toHaveBeenCalledWith(0, 5);

      player.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // Transition timer and cancel competition
  // -----------------------------------------------------------------------

  describe("transition timer cancellation", () => {
    it("cancels transition timer on pause", () => {
      const player = createChunkPlayer(ctx, {
        destination: ctx.destination,
        crossfadeSec: 0.1,
      });

      const buf1 = createMockBuffer(8);
      const buf2 = createMockBuffer(8);

      player.playChunk(buf1, ctx.currentTime, 0);
      player.scheduleNext(buf2, 8);

      // Pause should cancel the transition timer
      player.pause();

      // Advance past transition time
      vi.advanceTimersByTime(10000);

      // No crash should occur
      player.dispose();
    });

    it("cancels transition timer on stop", () => {
      const player = createChunkPlayer(ctx, {
        destination: ctx.destination,
        crossfadeSec: 0.1,
      });

      const buf1 = createMockBuffer(8);
      const buf2 = createMockBuffer(8);

      player.playChunk(buf1, ctx.currentTime, 0);
      player.scheduleNext(buf2, 8);

      player.stop();

      // Advance past transition time
      vi.advanceTimersByTime(10000);

      player.dispose();
    });

    it("cancels previous transition when new playChunk is called", () => {
      const onTransition = vi.fn();
      const player = createChunkPlayer(ctx, {
        destination: ctx.destination,
        crossfadeSec: 0.1,
      });
      player.setOnTransition(onTransition);

      const buf1 = createMockBuffer(8);
      const buf2 = createMockBuffer(8);
      const buf3 = createMockBuffer(8);

      player.playChunk(buf1, ctx.currentTime, 0);
      player.scheduleNext(buf2, 8);

      // New playChunk should cancel the pending transition
      player.playChunk(buf3, ctx.currentTime, 0);

      // Advance past old transition time
      ctx._setCurrentTime(9);
      vi.advanceTimersByTime(10000);

      // onTransition should NOT have fired for the old schedule
      expect(onTransition).not.toHaveBeenCalled();

      player.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // onended → transition (gapless path)
  // -----------------------------------------------------------------------

  describe("onended gapless transition", () => {
    it("promotes next source on current source ended", () => {
      const onTransition = vi.fn();
      const onChunkEnded = vi.fn();
      const player = createChunkPlayer(ctx, {
        destination: ctx.destination,
        crossfadeSec: 0,
      });
      player.setOnTransition(onTransition);
      player.setOnChunkEnded(onChunkEnded);

      const buf1 = createMockBuffer(8);
      const buf2 = createMockBuffer(8);

      player.playChunk(buf1, ctx.currentTime, 0);
      player.scheduleNext(buf2, 8);

      // Simulate current source ended (before transition timer)
      const src0 = ctx._sources[0]!;
      if (src0.onended) src0.onended();

      expect(onTransition).toHaveBeenCalled();
      expect(onChunkEnded).not.toHaveBeenCalled(); // next was available

      player.dispose();
    });

    it("fires onChunkEnded when no next source available", () => {
      const onChunkEnded = vi.fn();
      const player = createChunkPlayer(ctx, {
        destination: ctx.destination,
        crossfadeSec: 0,
      });
      player.setOnChunkEnded(onChunkEnded);

      const buf1 = createMockBuffer(8);
      player.playChunk(buf1, ctx.currentTime, 0);

      // Simulate current source ended (no next source)
      const src0 = ctx._sources[0]!;
      if (src0.onended) src0.onended();

      expect(onChunkEnded).toHaveBeenCalled();

      player.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // hasNextScheduled
  // -----------------------------------------------------------------------

  describe("hasNextScheduled", () => {
    it("returns false initially", () => {
      const player = createChunkPlayer(ctx, {
        destination: ctx.destination,
        crossfadeSec: 0,
      });

      const buf = createMockBuffer(8);
      player.playChunk(buf, ctx.currentTime, 0);

      expect(player.hasNextScheduled()).toBe(false);

      player.dispose();
    });

    it("returns true after scheduleNext", () => {
      const player = createChunkPlayer(ctx, {
        destination: ctx.destination,
        crossfadeSec: 0,
      });

      const buf1 = createMockBuffer(8);
      const buf2 = createMockBuffer(8);

      player.playChunk(buf1, ctx.currentTime, 0);
      player.scheduleNext(buf2, 8);

      expect(player.hasNextScheduled()).toBe(true);

      player.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // getCurrentPosition edge cases
  // -----------------------------------------------------------------------

  describe("getCurrentPosition edge cases", () => {
    it("returns 0 when stopped", () => {
      const player = createChunkPlayer(ctx, {
        destination: ctx.destination,
        crossfadeSec: 0,
      });

      expect(player.getCurrentPosition()).toBe(0);

      player.dispose();
    });

    it("tracks offset correctly with non-zero start offset", () => {
      const player = createChunkPlayer(ctx, {
        destination: ctx.destination,
        crossfadeSec: 0,
      });

      const buf = createMockBuffer(10);
      player.playChunk(buf, ctx.currentTime, 3);

      // At t=0, position = 0 + 3 = 3
      expect(player.getCurrentPosition()).toBe(3);

      // At t=2, position = 2 + 3 = 5
      ctx._setCurrentTime(2);
      expect(player.getCurrentPosition()).toBe(5);

      player.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // dispose safety
  // -----------------------------------------------------------------------

  describe("dispose safety", () => {
    it("double dispose is safe", () => {
      const player = createChunkPlayer(ctx, {
        destination: ctx.destination,
        crossfadeSec: 0,
      });

      const buf = createMockBuffer(8);
      player.playChunk(buf, ctx.currentTime, 0);

      player.dispose();
      expect(() => player.dispose()).not.toThrow();
    });

    it("scheduleNext after dispose is no-op", () => {
      const player = createChunkPlayer(ctx, {
        destination: ctx.destination,
        crossfadeSec: 0,
      });

      const buf1 = createMockBuffer(8);
      const buf2 = createMockBuffer(8);

      player.playChunk(buf1, ctx.currentTime, 0);
      player.dispose();

      expect(() => player.scheduleNext(buf2, 8)).not.toThrow();
    });
  });
});
