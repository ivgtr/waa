import { describe, expect, it } from "vitest";
import { autoFade, crossfade, fadeIn, fadeOut } from "../src/fade.js";
import type { MockGainNode } from "./helpers/audio-mocks.js";
import { createMockAudioContext, createMockPlayback } from "./helpers/audio-mocks.js";

/** Create a GainNode mock from MockAudioContext for fade tests. */
function createTestGain(
  ctx: ReturnType<typeof createMockAudioContext>,
  initialValue = 1,
): MockGainNode {
  const gain = ctx.createGain();
  gain.gain.value = initialValue;
  return gain;
}

describe("fade", () => {
  // -------------------------------------------------------------------------
  // fadeIn
  // -------------------------------------------------------------------------
  describe("fadeIn", () => {
    it("ramps from 0 to target with linear curve (default)", () => {
      const ctx = createMockAudioContext({ currentTime: 0 });
      const gain = createTestGain(ctx);
      fadeIn(gain as unknown as GainNode, 0.8);

      expect(gain.gain.cancelScheduledValues).toHaveBeenCalledWith(0);
      expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0, 0);
      expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.8, 1);
    });

    it("uses exponential curve", () => {
      const ctx = createMockAudioContext({ currentTime: 0 });
      const gain = createTestGain(ctx);
      fadeIn(gain as unknown as GainNode, 1, { duration: 2, curve: "exponential" });

      expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(1, 2);
    });

    it("uses equal-power curve with setValueCurveAtTime", () => {
      const ctx = createMockAudioContext({ currentTime: 0 });
      const gain = createTestGain(ctx);
      fadeIn(gain as unknown as GainNode, 1, { duration: 0.5, curve: "equal-power" });

      expect(gain.gain.setValueCurveAtTime).toHaveBeenCalled();
      const [values, startTime, dur] = gain.gain.setValueCurveAtTime.mock.calls[0]!;
      expect(startTime).toBe(0);
      expect(dur).toBe(0.5);
      expect(values).toBeInstanceOf(Float32Array);
      // First value should be close to 0 (from=0)
      expect(values[0]).toBeCloseTo(0, 1);
      // Last value should be close to 1 (to=1)
      expect(values[values.length - 1]).toBeCloseTo(1, 1);
    });
  });

  // -------------------------------------------------------------------------
  // fadeOut
  // -------------------------------------------------------------------------
  describe("fadeOut", () => {
    it("ramps from current value to 0 with linear curve", () => {
      const ctx = createMockAudioContext({ currentTime: 2 });
      const gain = createTestGain(ctx, 0.8);
      fadeOut(gain as unknown as GainNode, { duration: 0.5 });

      expect(gain.gain.cancelScheduledValues).toHaveBeenCalledWith(2);
      expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0.8, 2);
      expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 2.5);
    });

    it("uses exponential curve with EXP_MIN floor", () => {
      const ctx = createMockAudioContext({ currentTime: 0 });
      const gain = createTestGain(ctx, 1);
      fadeOut(gain as unknown as GainNode, { curve: "exponential" });

      // to=0, but exponential clamps to EXP_MIN=0.0001
      expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, 1);
    });
  });

  // -------------------------------------------------------------------------
  // crossfade
  // -------------------------------------------------------------------------
  describe("crossfade", () => {
    it("fades gainA to 0 and gainB to gainA.value", () => {
      const ctx = createMockAudioContext({ currentTime: 0 });
      const gainA = createTestGain(ctx, 0.7);
      const gainB = createTestGain(ctx, 0);

      crossfade(gainA as unknown as GainNode, gainB as unknown as GainNode, { duration: 2 });

      // gainA: from 0.7 to 0
      expect(gainA.gain.setValueAtTime).toHaveBeenCalledWith(0.7, 0);
      expect(gainA.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 2);
      // gainB: from 0 to 0.7
      expect(gainB.gain.setValueAtTime).toHaveBeenCalledWith(0, 0);
      expect(gainB.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.7, 2);
    });

    it("uses 1 as fallback when gainA.value is 0", () => {
      const ctx = createMockAudioContext({ currentTime: 0 });
      const gainA = createTestGain(ctx, 0);
      const gainB = createTestGain(ctx, 0);

      crossfade(gainA as unknown as GainNode, gainB as unknown as GainNode);

      // gainB should ramp to 1 (fallback from || 1)
      expect(gainB.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, 1);
    });
  });

  // -------------------------------------------------------------------------
  // autoFade
  // -------------------------------------------------------------------------
  describe("autoFade", () => {
    it("applies fadeIn immediately and schedules fadeOut near end", () => {
      const ctx = createMockAudioContext({ currentTime: 0 });
      const gain = createTestGain(ctx, 0);
      const playback = createMockPlayback({ duration: 10 });

      const unsub = autoFade(
        playback as unknown as import("../src/types.js").Playback,
        gain as unknown as GainNode,
        { fadeIn: 1, fadeOut: 2 },
      );

      // fadeIn should have been called (from 0 to 1)
      expect(gain.gain.setValueAtTime).toHaveBeenCalled();
      expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, 1);

      // Simulate timeupdate at position 7 (before fadeOut threshold 10-2=8)
      gain.gain.cancelScheduledValues.mockClear();
      playback._emit("timeupdate", { position: 7 });
      // fadeOut should NOT have been scheduled yet
      expect(gain.gain.cancelScheduledValues).not.toHaveBeenCalled();

      // Simulate timeupdate at position 8.5 (past threshold)
      playback._emit("timeupdate", { position: 8.5 });
      // fadeOut should be scheduled now
      expect(gain.gain.cancelScheduledValues).toHaveBeenCalled();

      // Cleanup
      expect(typeof unsub).toBe("function");
      unsub();
    });

    it("does not double-schedule fadeOut", () => {
      const ctx = createMockAudioContext({ currentTime: 0 });
      const gain = createTestGain(ctx, 0);
      const playback = createMockPlayback({ duration: 10 });

      autoFade(
        playback as unknown as import("../src/types.js").Playback,
        gain as unknown as GainNode,
        { fadeOut: 2 },
      );

      // Trigger fadeOut threshold twice
      playback._emit("timeupdate", { position: 8.5 });
      const callCount1 = gain.gain.cancelScheduledValues.mock.calls.length;
      playback._emit("timeupdate", { position: 9.0 });
      const callCount2 = gain.gain.cancelScheduledValues.mock.calls.length;
      // Should not have been called again (fadeOutScheduled flag prevents it)
      expect(callCount2).toBe(callCount1);
    });

    it("returns unsub that removes timeupdate listener", () => {
      const ctx = createMockAudioContext({ currentTime: 0 });
      const gain = createTestGain(ctx);
      const playback = createMockPlayback({ duration: 10 });

      const unsub = autoFade(
        playback as unknown as import("../src/types.js").Playback,
        gain as unknown as GainNode,
        { fadeOut: 2 },
      );

      unsub();

      // After unsub, emitting timeupdate should not trigger any fade
      gain.gain.cancelScheduledValues.mockClear();
      playback._emit("timeupdate", { position: 9.0 });
      expect(gain.gain.cancelScheduledValues).not.toHaveBeenCalled();
    });
  });
});
