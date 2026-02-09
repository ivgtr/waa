import { describe, it, expect } from "vitest";
import { calcLoopPosition, calcPlaybackPosition } from "../src/playback-position";

describe("calcLoopPosition", () => {
  it("wraps elapsed within loop region (full loop)", () => {
    // elapsed=25, loop={0,10} → 25 % 10 = 5
    expect(calcLoopPosition(25, 0, 10)).toBe(5);
  });

  it("wraps elapsed within partial loop region", () => {
    // elapsed=7, loop={2,6}, loopDur=4 → (7-2)%4 + 2 = 1+2 = 3
    expect(calcLoopPosition(7, 2, 6)).toBe(3);
  });

  it("handles elapsed exactly at loopStart", () => {
    expect(calcLoopPosition(3, 3, 7)).toBe(3);
  });

  it("handles elapsed exactly at loopEnd", () => {
    // elapsed=7, loop={3,7}, loopDur=4 → (7-3)%4 + 3 = 0+3 = 3
    expect(calcLoopPosition(7, 3, 7)).toBe(3);
  });

  it("handles elapsed before loopStart (potential negative modulo bug)", () => {
    // elapsed=0, loop={3,7}, loopDur=4
    // Bug with JS %: (0-3)%4 = -3, -3+3 = 0 (outside loop region!)
    // Fixed: ((-3 % 4) + 4) % 4 = 1, 1+3 = 4 (inside loop region)
    const result = calcLoopPosition(0, 3, 7);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThanOrEqual(3);
    expect(result!).toBeLessThan(7);
    expect(result).toBe(4);
  });

  it("handles elapsed=1 before loopStart=3 (negative offset)", () => {
    // elapsed=1, loop={3,7}, loopDur=4
    // offset = 1-3 = -2, ((-2%4)+4)%4 = 2, 2+3 = 5
    const result = calcLoopPosition(1, 3, 7);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThanOrEqual(3);
    expect(result!).toBeLessThan(7);
    expect(result).toBe(5);
  });

  it("returns null when loopDur <= 0 (loopStart === loopEnd)", () => {
    expect(calcLoopPosition(5, 3, 3)).toBeNull();
  });

  it("returns null when loopEnd < loopStart (negative loopDur)", () => {
    expect(calcLoopPosition(10, 5, 2)).toBeNull();
  });

  it("handles floating point values", () => {
    const result = calcLoopPosition(3.7, 1.2, 2.8);
    // loopDur = 1.6, offset = 3.7-1.2 = 2.5, 2.5 % 1.6 ≈ 0.9, 0.9+1.2 = 2.1
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(2.1, 10);
  });

  it("handles very small loop duration", () => {
    const result = calcLoopPosition(100, 0, 0.001);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThanOrEqual(0);
    expect(result!).toBeLessThan(0.001);
  });
});

describe("calcPlaybackPosition", () => {
  it("returns 0 for stopped state", () => {
    expect(calcPlaybackPosition("stopped", 5, 10, 3, false, undefined, undefined)).toBe(0);
  });

  it("returns pausedAt for paused state", () => {
    expect(calcPlaybackPosition("paused", 0, 10, 4.5, false, undefined, undefined)).toBe(4.5);
  });

  it("returns elapsed for playing state (non-looping)", () => {
    expect(calcPlaybackPosition("playing", 3, 10, 0, false, undefined, undefined)).toBe(3);
  });

  it("clamps elapsed to duration when past end", () => {
    expect(calcPlaybackPosition("playing", 15, 10, 0, false, undefined, undefined)).toBe(10);
  });

  it("clamps negative elapsed to 0", () => {
    expect(calcPlaybackPosition("playing", -2, 10, 0, false, undefined, undefined)).toBe(0);
  });

  it("returns 0 when elapsed is 0", () => {
    expect(calcPlaybackPosition("playing", 0, 10, 0, false, undefined, undefined)).toBe(0);
  });

  it("delegates to calcLoopPosition when looping", () => {
    // elapsed=25, loop={0,10} → 5
    expect(calcPlaybackPosition("playing", 25, 30, 0, true, 0, 10)).toBe(5);
  });

  it("uses defaults for undefined loopStart/loopEnd", () => {
    // loopStart=0, loopEnd=duration=10 → elapsed=25 % 10 = 5
    expect(calcPlaybackPosition("playing", 25, 10, 0, true, undefined, undefined)).toBe(5);
  });

  it("handles looping with elapsed before loopStart", () => {
    // elapsed=0, loop={3,7} → inside loop region
    const result = calcPlaybackPosition("playing", 0, 10, 0, true, 3, 7);
    expect(result).toBeGreaterThanOrEqual(3);
    expect(result).toBeLessThan(7);
  });

  it("falls back to clamped position when loopDur <= 0 (loopStart === loopEnd)", () => {
    // loopDur = 0 → fall back to Math.min(Math.max(elapsed, 0), duration)
    expect(calcPlaybackPosition("playing", 6, 10, 0, true, 5, 5)).toBe(6);
  });

  it("falls back to clamped position when loopEnd < loopStart", () => {
    // loopDur < 0 → fall back to Math.min(Math.max(elapsed, 0), duration)
    expect(calcPlaybackPosition("playing", 5, 10, 0, true, 8, 3)).toBe(5);
  });

  it("handles NaN elapsed gracefully", () => {
    const result = calcPlaybackPosition("playing", NaN, 10, 0, false, undefined, undefined);
    // NaN clamped: Math.min(Math.max(NaN, 0), 10) → NaN
    expect(result).toBeNaN();
  });

  it("handles duration=0", () => {
    expect(calcPlaybackPosition("playing", 5, 0, 0, false, undefined, undefined)).toBe(0);
  });

  it("handles looping with loopDur=0 when duration=0", () => {
    // loopStart=0, loopEnd=0 (=duration) → loopDur=0 → fallback → Math.min(Math.max(5,0),0)=0
    const result = calcPlaybackPosition("playing", 5, 0, 0, true, 0, 0);
    expect(result).toBe(0);
  });
});
