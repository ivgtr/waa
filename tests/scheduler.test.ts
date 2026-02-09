import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createScheduler, createClock } from "../src/scheduler.js";
import { createMockAudioContext } from "./helpers/audio-mocks.js";

describe("scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // createScheduler
  // -------------------------------------------------------------------------
  describe("createScheduler", () => {
    it("fires callback when event time is within lookahead", () => {
      const ctx = createMockAudioContext({ currentTime: 0 });
      const scheduler = createScheduler(ctx, { lookahead: 0.1, interval: 25 });

      const callback = vi.fn();
      scheduler.schedule("ev1", 0.05, callback);
      scheduler.start();

      // Advance timer to trigger tick
      vi.advanceTimersByTime(25);

      expect(callback).toHaveBeenCalledWith(0.05);
    });

    it("does not fire callback before event time enters lookahead", () => {
      const ctx = createMockAudioContext({ currentTime: 0 });
      const scheduler = createScheduler(ctx, { lookahead: 0.1, interval: 25 });

      const callback = vi.fn();
      scheduler.schedule("ev1", 0.5, callback);
      scheduler.start();

      vi.advanceTimersByTime(25);
      expect(callback).not.toHaveBeenCalled();

      // Advance currentTime to bring event into lookahead
      ctx._setCurrentTime(0.45);
      vi.advanceTimersByTime(25);
      expect(callback).toHaveBeenCalledWith(0.5);
    });

    it("removes event after firing", () => {
      const ctx = createMockAudioContext({ currentTime: 0 });
      const scheduler = createScheduler(ctx, { lookahead: 0.1, interval: 25 });

      const callback = vi.fn();
      scheduler.schedule("ev1", 0.05, callback);
      scheduler.start();

      vi.advanceTimersByTime(25);
      expect(callback).toHaveBeenCalledTimes(1);

      // Next tick should not fire again
      vi.advanceTimersByTime(25);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("cancel removes a scheduled event", () => {
      const ctx = createMockAudioContext({ currentTime: 0 });
      const scheduler = createScheduler(ctx, { lookahead: 0.1, interval: 25 });

      const callback = vi.fn();
      scheduler.schedule("ev1", 0.05, callback);
      scheduler.cancel("ev1");
      scheduler.start();

      vi.advanceTimersByTime(25);
      expect(callback).not.toHaveBeenCalled();
    });

    it("start is idempotent (multiple calls)", () => {
      const ctx = createMockAudioContext({ currentTime: 0 });
      const scheduler = createScheduler(ctx, { lookahead: 0.1, interval: 25 });

      const callback = vi.fn();
      scheduler.schedule("ev1", 0.05, callback);
      scheduler.start();
      scheduler.start(); // should not create a second interval

      vi.advanceTimersByTime(25);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("stop clears the interval", () => {
      const ctx = createMockAudioContext({ currentTime: 0 });
      const scheduler = createScheduler(ctx, { lookahead: 0.1, interval: 25 });

      const callback = vi.fn();
      scheduler.schedule("ev1", 0.05, callback);
      scheduler.start();
      scheduler.stop();

      vi.advanceTimersByTime(100);
      expect(callback).not.toHaveBeenCalled();
    });

    it("dispose stops and clears all events", () => {
      const ctx = createMockAudioContext({ currentTime: 0 });
      const scheduler = createScheduler(ctx, { lookahead: 0.1, interval: 25 });

      const callback = vi.fn();
      scheduler.schedule("ev1", 0.05, callback);
      scheduler.start();
      scheduler.dispose();

      vi.advanceTimersByTime(100);
      expect(callback).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // createClock
  // -------------------------------------------------------------------------
  describe("createClock", () => {
    it("uses default BPM of 120", () => {
      const ctx = createMockAudioContext({ currentTime: 0 });
      const clock = createClock(ctx);
      expect(clock.getBpm()).toBe(120);
    });

    it("beatToTime converts beats to seconds", () => {
      const ctx = createMockAudioContext({ currentTime: 0 });
      const clock = createClock(ctx, { bpm: 120 });
      // At 120 BPM, 1 beat = 0.5 seconds
      expect(clock.beatToTime(0)).toBe(0);
      expect(clock.beatToTime(1)).toBe(0.5);
      expect(clock.beatToTime(4)).toBe(2);
    });

    it("getCurrentBeat returns current beat based on currentTime", () => {
      const ctx = createMockAudioContext({ currentTime: 0 });
      const clock = createClock(ctx, { bpm: 120 });
      expect(clock.getCurrentBeat()).toBe(0);
      ctx._setCurrentTime(0.5);
      expect(clock.getCurrentBeat()).toBe(1);
      ctx._setCurrentTime(1.0);
      expect(clock.getCurrentBeat()).toBe(2);
    });

    it("getNextBeatTime returns next beat boundary", () => {
      const ctx = createMockAudioContext({ currentTime: 0 });
      const clock = createClock(ctx, { bpm: 120 });
      // At time 0, current beat = 0, next beat = 1 → time 0.5
      expect(clock.getNextBeatTime()).toBe(0.5);

      ctx._setCurrentTime(0.25);
      // Current beat = 0.5, ceil = 1 → time 0.5
      expect(clock.getNextBeatTime()).toBe(0.5);
    });

    it("getNextBeatTime returns beat+1 when exactly on a beat boundary", () => {
      const ctx = createMockAudioContext({ currentTime: 0.5 });
      const clock = createClock(ctx, { bpm: 120 });
      // startTime=0.5, currentTime=0.5 → current beat = 0
      // ceil(0) === 0 → next = 0 + 1 = 1 → time = 0.5 + 0.5 = 1.0
      expect(clock.getNextBeatTime()).toBe(1.0);
    });

    it("setBpm updates BPM", () => {
      const ctx = createMockAudioContext({ currentTime: 0 });
      const clock = createClock(ctx, { bpm: 120 });
      clock.setBpm(60);
      expect(clock.getBpm()).toBe(60);
      // At 60 BPM, 1 beat = 1 second
      expect(clock.beatToTime(1)).toBe(1.0);
    });

    it("handles getNextBeatTime with floating-point precision", () => {
      const ctx = createMockAudioContext({ currentTime: 0 });
      const clock = createClock(ctx, { bpm: 120 });
      // Simulate a floating-point edge case where currentBeat ≈ integer
      ctx._setCurrentTime(1.0); // beat = 2.0 exactly
      const nextBeatTime = clock.getNextBeatTime();
      // Should be beat 3 → time 1.5
      expect(nextBeatTime).toBe(1.5);
    });
  });
});
