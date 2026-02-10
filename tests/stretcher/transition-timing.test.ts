import { describe, expect, it } from "vitest";
import { calcTransitionDelay, TRANSITION_MARGIN_MS } from "../../src/stretcher/transition-timing";

describe("calcTransitionDelay", () => {
  it("returns positive delay when startTime > currentTime", () => {
    // (10 - 5) * 1000 + 50 = 5050
    expect(calcTransitionDelay(10, 5)).toBe(5050);
  });

  it("returns TRANSITION_MARGIN_MS when startTime === currentTime", () => {
    // (5 - 5) * 1000 + 50 = 50
    expect(calcTransitionDelay(5, 5)).toBe(TRANSITION_MARGIN_MS);
  });

  it("returns 0 when startTime is far behind currentTime", () => {
    // (0 - 10) * 1000 + 50 = -9950 → clamped to 0
    expect(calcTransitionDelay(0, 10)).toBe(0);
  });

  it("returns positive but small delay when startTime is slightly behind currentTime", () => {
    // (9.99 - 10) * 1000 + 50 = -10 + 50 = 40
    expect(calcTransitionDelay(9.99, 10)).toBeCloseTo(40, 0);
  });

  it("handles fractional times", () => {
    // (1.5 - 1.0) * 1000 + 50 = 550
    expect(calcTransitionDelay(1.5, 1.0)).toBe(550);
  });

  it("always returns >= 0", () => {
    expect(calcTransitionDelay(-100, 100)).toBe(0);
    expect(calcTransitionDelay(0, 0)).toBe(TRANSITION_MARGIN_MS);
    expect(calcTransitionDelay(100, 0)).toBeGreaterThan(0);
  });

  it("TRANSITION_MARGIN_MS is 50", () => {
    expect(TRANSITION_MARGIN_MS).toBe(50);
  });
});
