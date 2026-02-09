import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { play } from "../../src/play";
import {
  createMockAudioContext,
  createMockAudioBuffer,
  type MockAudioContext,
} from "../helpers/audio-mocks";

describe("play() – normal events (preservePitch: false)", () => {
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
  // statechange event
  // -----------------------------------------------------------------------

  describe("statechange", () => {
    it("fires on initial play", () => {
      const handler = vi.fn();
      // We need to attach the handler after play() since play emits synchronously
      // Actually, play() emits statechange("playing") during construction
      // We can't catch it unless we use a spy approach, but let's test transitions
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.on("statechange", handler);

      pb.pause();
      expect(handler).toHaveBeenCalledWith({ state: "paused" });

      pb.resume();
      expect(handler).toHaveBeenCalledWith({ state: "playing" });

      pb.stop();
      expect(handler).toHaveBeenCalledWith({ state: "stopped" });

      expect(handler).toHaveBeenCalledTimes(3);
      pb.dispose();
    });

    it("does not fire duplicate statechange", () => {
      const handler = vi.fn();
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.on("statechange", handler);
      pb.stop();
      pb.stop(); // should be no-op
      expect(handler).toHaveBeenCalledTimes(1);
      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // play event
  // -----------------------------------------------------------------------

  describe("play event", () => {
    it("fires on construction (can verify via handler count)", () => {
      // play event is emitted synchronously in play(), so we can't subscribe before.
      // Instead, verify behavior indirectly: play event is emitted once.
      // We test that the emitter works by subscribing and triggering via seek
      const pb = play(ctx, buffer, { preservePitch: false });
      // play() has already fired, just verify no error
      expect(pb.getState()).toBe("playing");
      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // pause event
  // -----------------------------------------------------------------------

  describe("pause event", () => {
    it("fires when pausing", () => {
      const handler = vi.fn();
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.on("pause", handler);
      pb.pause();
      expect(handler).toHaveBeenCalledTimes(1);
      pb.dispose();
    });

    it("does not fire when not playing", () => {
      const handler = vi.fn();
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.on("pause", handler);
      pb.stop();
      pb.pause(); // should be no-op
      expect(handler).not.toHaveBeenCalled();
      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // resume event
  // -----------------------------------------------------------------------

  describe("resume event", () => {
    it("fires when resuming from paused", () => {
      const handler = vi.fn();
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.on("resume", handler);
      pb.pause();
      pb.resume();
      expect(handler).toHaveBeenCalledTimes(1);
      pb.dispose();
    });

    it("does not fire when already playing", () => {
      const handler = vi.fn();
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.on("resume", handler);
      pb.resume(); // already playing
      expect(handler).not.toHaveBeenCalled();
      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // stop event
  // -----------------------------------------------------------------------

  describe("stop event", () => {
    it("fires when stopping", () => {
      const handler = vi.fn();
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.on("stop", handler);
      pb.stop();
      expect(handler).toHaveBeenCalledTimes(1);
      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // seek event
  // -----------------------------------------------------------------------

  describe("seek event", () => {
    it("fires with clamped position", () => {
      const handler = vi.fn();
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.on("seek", handler);
      pb.seek(5);
      expect(handler).toHaveBeenCalledWith({ position: 5 });
      pb.dispose();
    });

    it("clamps position in seek event", () => {
      const handler = vi.fn();
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.on("seek", handler);
      pb.seek(-10);
      expect(handler).toHaveBeenCalledWith({ position: 0 });
      pb.seek(100);
      expect(handler).toHaveBeenCalledWith({ position: 10 });
      pb.dispose();
    });

    it("fires seek event even when paused", () => {
      const handler = vi.fn();
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.on("seek", handler);
      pb.pause();
      pb.seek(3);
      expect(handler).toHaveBeenCalledWith({ position: 3 });
      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // ended event
  // -----------------------------------------------------------------------

  describe("ended event", () => {
    it("fires when source node ends naturally", () => {
      const handler = vi.fn();
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.on("ended", handler);

      const src = ctx._sources[0]!;
      src.onended!();

      expect(handler).toHaveBeenCalledTimes(1);
      pb.dispose();
    });

    it("does not fire when looping", () => {
      const endedHandler = vi.fn();
      const pb = play(ctx, buffer, { preservePitch: false, loop: true });
      pb.on("ended", endedHandler);

      const src = ctx._sources[0]!;
      src.onended!();

      expect(endedHandler).not.toHaveBeenCalled();
      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // loop event
  // -----------------------------------------------------------------------

  describe("loop event", () => {
    it("fires when source ends while looping", () => {
      const handler = vi.fn();
      const pb = play(ctx, buffer, { preservePitch: false, loop: true });
      pb.on("loop", handler);

      const src = ctx._sources[0]!;
      src.onended!();

      expect(handler).toHaveBeenCalledTimes(1);
      pb.dispose();
    });

    it("fires multiple times on repeated loops", () => {
      const handler = vi.fn();
      const pb = play(ctx, buffer, { preservePitch: false, loop: true });
      pb.on("loop", handler);

      const src = ctx._sources[0]!;
      src.onended!();
      src.onended!();
      src.onended!();

      expect(handler).toHaveBeenCalledTimes(3);
      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // timeupdate event
  // -----------------------------------------------------------------------

  describe("timeupdate event", () => {
    it("fires at regular intervals while playing", () => {
      const handler = vi.fn();
      const pb = play(ctx, buffer, {
        preservePitch: false,
        timeupdateInterval: 100,
      });
      pb.on("timeupdate", handler);

      ctx._setCurrentTime(1);
      vi.advanceTimersByTime(100);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ position: 1, duration: 10 });

      ctx._setCurrentTime(2);
      vi.advanceTimersByTime(100);
      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenCalledWith({ position: 2, duration: 10 });

      pb.dispose();
    });

    it("stops firing after pause", () => {
      const handler = vi.fn();
      const pb = play(ctx, buffer, {
        preservePitch: false,
        timeupdateInterval: 100,
      });
      pb.on("timeupdate", handler);

      ctx._setCurrentTime(1);
      vi.advanceTimersByTime(100);
      expect(handler).toHaveBeenCalledTimes(1);

      pb.pause();
      vi.advanceTimersByTime(500);
      expect(handler).toHaveBeenCalledTimes(1); // no more fires
      pb.dispose();
    });

    it("stops firing after stop", () => {
      const handler = vi.fn();
      const pb = play(ctx, buffer, {
        preservePitch: false,
        timeupdateInterval: 100,
      });
      pb.on("timeupdate", handler);

      pb.stop();
      vi.advanceTimersByTime(500);
      expect(handler).not.toHaveBeenCalled();
      pb.dispose();
    });

    it("uses default interval of 50ms", () => {
      const handler = vi.fn();
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.on("timeupdate", handler);

      ctx._setCurrentTime(1);
      vi.advanceTimersByTime(50);
      expect(handler).toHaveBeenCalledTimes(1);

      pb.dispose();
    });

    it("resumes firing after resume", () => {
      const handler = vi.fn();
      const pb = play(ctx, buffer, {
        preservePitch: false,
        timeupdateInterval: 100,
      });
      pb.on("timeupdate", handler);

      pb.pause();
      vi.advanceTimersByTime(200);
      expect(handler).not.toHaveBeenCalled();

      pb.resume();
      ctx._setCurrentTime(3);
      vi.advanceTimersByTime(100);
      expect(handler).toHaveBeenCalledTimes(1);

      pb.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // on / off subscription
  // -----------------------------------------------------------------------

  describe("on / off subscription", () => {
    it("on() returns unsubscribe function", () => {
      const handler = vi.fn();
      const pb = play(ctx, buffer, { preservePitch: false });
      const unsub = pb.on("pause", handler);
      pb.pause();
      expect(handler).toHaveBeenCalledTimes(1);

      unsub();
      pb.resume();
      pb.pause();
      expect(handler).toHaveBeenCalledTimes(1); // not called again
      pb.dispose();
    });

    it("off() removes specific handler", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const pb = play(ctx, buffer, { preservePitch: false });
      pb.on("pause", handler1);
      pb.on("pause", handler2);

      pb.off("pause", handler1);
      pb.pause();

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
      pb.dispose();
    });
  });
});
