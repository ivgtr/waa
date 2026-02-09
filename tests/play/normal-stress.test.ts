import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { play } from "../../src/play";
import {
  createMockAudioContext,
  createMockAudioBuffer,
  type MockAudioContext,
} from "../helpers/audio-mocks";

describe("play() – normal stress & edge cases (preservePitch: false)", () => {
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
  // Rapid pause/resume
  // -----------------------------------------------------------------------

  it("rapid pause/resume 50 times does not cause drift", () => {
    const pb = play(ctx, buffer, { preservePitch: false });
    ctx._setCurrentTime(2.0);

    for (let i = 0; i < 50; i++) {
      pb.pause();
      pb.resume();
    }

    const pos = pb.getCurrentTime();
    // Position should still be close to 2.0
    expect(pos).toBeGreaterThanOrEqual(1.9);
    expect(pos).toBeLessThanOrEqual(2.1);

    pb.dispose();
  });

  // -----------------------------------------------------------------------
  // Rapid seek
  // -----------------------------------------------------------------------

  it("rapid seek 20 times converges to final position", () => {
    const pb = play(ctx, buffer, { preservePitch: false });

    for (let i = 0; i < 20; i++) {
      pb.seek(i * 0.5);
    }

    // Final seek was to 9.5
    const pos = pb.getCurrentTime();
    expect(pos).toBeGreaterThanOrEqual(9.4);
    expect(pos).toBeLessThanOrEqual(10);

    pb.dispose();
  });

  // -----------------------------------------------------------------------
  // Extreme playbackRate
  // -----------------------------------------------------------------------

  it("playbackRate 0.01 — very slow — position still advances", () => {
    const pb = play(ctx, buffer, { preservePitch: false, playbackRate: 0.01 });

    ctx._setCurrentTime(100); // 100 sec real → 1 sec audio
    const pos = pb.getCurrentTime();
    expect(pos).toBeCloseTo(1.0, 0);

    pb.dispose();
  });

  it("playbackRate 100 — very fast — position clamps to duration", () => {
    const pb = play(ctx, buffer, { preservePitch: false, playbackRate: 100 });

    ctx._setCurrentTime(1); // 1 sec real → 100 sec audio → clamped to 10
    const pos = pb.getCurrentTime();
    expect(pos).toBe(10);

    pb.dispose();
  });

  // -----------------------------------------------------------------------
  // Very short buffer
  // -----------------------------------------------------------------------

  it("100ms buffer plays and ends correctly", () => {
    const shortBuffer = createMockAudioBuffer(0.1);
    const pb = play(ctx, shortBuffer, { preservePitch: false });
    const endedHandler = vi.fn();
    pb.on("ended", endedHandler);

    expect(pb.getState()).toBe("playing");
    expect(pb.getDuration()).toBeCloseTo(0.1, 2);

    // Trigger onended
    const src = ctx._sources[ctx._sources.length - 1]!;
    src.onended!();

    expect(endedHandler).toHaveBeenCalledTimes(1);
    expect(pb.getState()).toBe("stopped");

    pb.dispose();
  });

  it("duration=0 buffer clamps position to 0", () => {
    const zeroBuffer = createMockAudioBuffer(0);
    const pb = play(ctx, zeroBuffer, { preservePitch: false });

    ctx._setCurrentTime(5);
    const pos = pb.getCurrentTime();
    expect(pos).toBe(0);

    pb.dispose();
  });

  // -----------------------------------------------------------------------
  // setPlaybackRate → seek → resume chain
  // -----------------------------------------------------------------------

  it("setPlaybackRate → seek → resume chain maintains correct position", () => {
    const pb = play(ctx, buffer, { preservePitch: false });

    ctx._setCurrentTime(3);
    pb.setPlaybackRate(2.0);

    pb.seek(5.0);
    expect(pb.getCurrentTime()).toBeCloseTo(5.0, 1);

    pb.pause();
    expect(pb.getCurrentTime()).toBeCloseTo(5.0, 1);

    pb.resume();
    ctx._setCurrentTime(4); // 1 sec real at rate 2 → +2 sec audio
    const pos = pb.getCurrentTime();
    expect(pos).toBeCloseTo(7.0, 0);

    pb.dispose();
  });

  // -----------------------------------------------------------------------
  // Loop toggle + onended
  // -----------------------------------------------------------------------

  it("loop disable during loop → onended fires at end", () => {
    const pb = play(ctx, buffer, {
      preservePitch: false,
      loop: true,
    });
    const endedHandler = vi.fn();
    const loopHandler = vi.fn();
    pb.on("ended", endedHandler);
    pb.on("loop", loopHandler);

    // Disable loop
    pb.setLoop(false);

    // Trigger onended
    const src = ctx._sources[ctx._sources.length - 1]!;
    src.onended!();

    expect(endedHandler).toHaveBeenCalledTimes(1);
    expect(loopHandler).not.toHaveBeenCalled();

    pb.dispose();
  });

  it("loop enable during playback → loop event fires instead of ended", () => {
    const pb = play(ctx, buffer, {
      preservePitch: false,
      loop: false,
    });
    const endedHandler = vi.fn();
    const loopHandler = vi.fn();
    pb.on("ended", endedHandler);
    pb.on("loop", loopHandler);

    // Enable loop
    pb.setLoop(true);

    // Trigger onended
    const src = ctx._sources[ctx._sources.length - 1]!;
    src.onended!();

    expect(loopHandler).toHaveBeenCalledTimes(1);
    expect(endedHandler).not.toHaveBeenCalled();

    pb.dispose();
  });

  // -----------------------------------------------------------------------
  // Pause + playbackRate change + resume
  // -----------------------------------------------------------------------

  it("pause → setPlaybackRate → resume maintains position", () => {
    const pb = play(ctx, buffer, { preservePitch: false });

    ctx._setCurrentTime(3);
    pb.pause();
    const pausePos = pb.getCurrentTime();
    expect(pausePos).toBeCloseTo(3.0, 1);

    // Change rate while paused
    pb.setPlaybackRate(0.5);

    pb.resume();
    // Advance 2 sec real → 1 sec audio at rate 0.5
    ctx._setCurrentTime(5);
    const pos = pb.getCurrentTime();
    expect(pos).toBeCloseTo(pausePos + 1.0, 0);

    pb.dispose();
  });

  // -----------------------------------------------------------------------
  // Seek while paused
  // -----------------------------------------------------------------------

  it("seek while paused updates position without starting playback", () => {
    const pb = play(ctx, buffer, { preservePitch: false });

    pb.pause();
    pb.seek(7.0);

    expect(pb.getState()).toBe("paused");
    expect(pb.getCurrentTime()).toBeCloseTo(7.0, 1);

    pb.dispose();
  });

  // -----------------------------------------------------------------------
  // Double dispose
  // -----------------------------------------------------------------------

  it("double dispose does not throw", () => {
    const pb = play(ctx, buffer, { preservePitch: false });

    pb.dispose();
    expect(() => pb.dispose()).not.toThrow();
  });

  // -----------------------------------------------------------------------
  // Operations after dispose
  // -----------------------------------------------------------------------

  it("operations after dispose are no-ops", () => {
    const pb = play(ctx, buffer, { preservePitch: false });

    pb.dispose();

    expect(() => {
      pb.pause();
      pb.resume();
      pb.seek(5);
      pb.stop();
    }).not.toThrow();
  });

  // -----------------------------------------------------------------------
  // getProgress consistency
  // -----------------------------------------------------------------------

  it("getProgress is consistent with getCurrentTime and getDuration", () => {
    const pb = play(ctx, buffer, { preservePitch: false });

    ctx._setCurrentTime(3);
    const pos = pb.getCurrentTime();
    const dur = pb.getDuration();
    const progress = pb.getProgress();

    expect(progress).toBeCloseTo(pos / dur, 5);

    pb.dispose();
  });
});
