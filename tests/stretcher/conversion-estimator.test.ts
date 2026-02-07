import { describe, it, expect } from "vitest";
import { createConversionEstimator } from "../../src/stretcher/conversion-estimator";

describe("createConversionEstimator", () => {
  it("returns 0 with no samples", () => {
    const est = createConversionEstimator();
    expect(est.getAverageMs()).toBe(0);
    expect(est.estimateRemaining(5)).toBe(0);
  });

  it("computes correct average after single recording", () => {
    const est = createConversionEstimator();
    est.recordConversion(100);
    expect(est.getAverageMs()).toBe(100);
  });

  it("computes correct average after multiple recordings", () => {
    const est = createConversionEstimator();
    est.recordConversion(100);
    est.recordConversion(200);
    est.recordConversion(300);
    expect(est.getAverageMs()).toBe(200);
  });

  it("applies window size limit", () => {
    const est = createConversionEstimator(3);
    est.recordConversion(100);
    est.recordConversion(200);
    est.recordConversion(300);
    est.recordConversion(400); // pushes out 100

    expect(est.getAverageMs()).toBe(300); // (200+300+400)/3
  });

  it("estimates remaining time correctly", () => {
    const est = createConversionEstimator();
    est.recordConversion(100);
    est.recordConversion(200);

    // Average = 150ms, 5 remaining chunks
    expect(est.estimateRemaining(5)).toBe(750);
  });

  it("estimates 0 for 0 remaining chunks", () => {
    const est = createConversionEstimator();
    est.recordConversion(100);
    expect(est.estimateRemaining(0)).toBe(0);
  });

  it("handles large window size", () => {
    const est = createConversionEstimator(100);
    for (let i = 1; i <= 50; i++) {
      est.recordConversion(i * 10);
    }
    // Average of 10, 20, ..., 500 = 255
    expect(est.getAverageMs()).toBe(255);
  });
});
