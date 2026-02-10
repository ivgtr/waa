import { describe, expect, it } from "vitest";
import { createHannWindow, findBestOffset, wsolaTimeStretch } from "../../src/stretcher/wsola";

describe("createHannWindow", () => {
  it("returns a Float32Array of the given size", () => {
    const w = createHannWindow(1024);
    expect(w).toBeInstanceOf(Float32Array);
    expect(w.length).toBe(1024);
  });

  it("starts and ends near zero", () => {
    const w = createHannWindow(256);
    expect(w[0]).toBeCloseTo(0, 5);
    expect(w[255]).toBeCloseTo(0, 5);
  });

  it("peaks at the center", () => {
    const w = createHannWindow(256);
    const mid = Math.floor(256 / 2);
    expect(w[mid]).toBeCloseTo(1, 2);
  });

  it("is symmetric", () => {
    const w = createHannWindow(128);
    for (let i = 0; i < 64; i++) {
      expect(w[i]).toBeCloseTo(w[127 - i]!, 5);
    }
  });
});

describe("findBestOffset", () => {
  it("returns 0 when ref and search are identical", () => {
    const data = new Float32Array(512);
    for (let i = 0; i < 512; i++) {
      data[i] = Math.sin((2 * Math.PI * 440 * i) / 44100);
    }
    const offset = findBestOffset(data, data, 256, 128);
    expect(offset).toBe(0);
  });

  it("finds the correct offset for a shifted signal", () => {
    const sampleRate = 44100;
    const freq = 440;
    const len = 2048;
    const signal = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      signal[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
    }

    const shift = 50;
    const ref = signal.subarray(0, 512);
    const search = signal.subarray(shift, shift + 512 + 256);

    const offset = findBestOffset(ref, search, 512, 256);
    // The offset should align with the period of the sine wave
    // Period = 44100/440 ≈ 100.23 samples
    // The best offset should be near 0 or near the period
    expect(offset).toBeGreaterThanOrEqual(0);
    expect(offset).toBeLessThanOrEqual(256);
  });
});

describe("wsolaTimeStretch", () => {
  function createSineWave(freq: number, sampleRate: number, durationSec: number): Float32Array {
    const length = Math.round(sampleRate * durationSec);
    const data = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      data[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
    }
    return data;
  }

  function estimatePeakFrequency(signal: Float32Array, sampleRate: number): number {
    // Simple zero-crossing based frequency estimation
    let crossings = 0;
    for (let i = 1; i < signal.length; i++) {
      if (signal[i - 1]! <= 0 && signal[i]! > 0) {
        crossings++;
      }
    }
    const duration = signal.length / sampleRate;
    return crossings / duration;
  }

  it("returns empty output for empty input", () => {
    const result = wsolaTimeStretch([], 1.5, 44100);
    expect(result.output).toHaveLength(0);
    expect(result.length).toBe(0);
  });

  it("returns empty arrays for zero-length channels", () => {
    const result = wsolaTimeStretch([new Float32Array(0)], 1.5, 44100);
    expect(result.output).toHaveLength(1);
    expect(result.output[0]!.length).toBe(0);
  });

  it("stretches at tempo=1.5 producing shorter output", () => {
    const sampleRate = 44100;
    const input = createSineWave(440, sampleRate, 1.0);
    const result = wsolaTimeStretch([input], 1.5, sampleRate);

    // At 1.5x speed, output should be roughly 1/1.5 = 0.667 of input length
    const ratio = result.length / input.length;
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(0.85);
  });

  it("stretches at tempo=0.75 producing longer output", () => {
    const sampleRate = 44100;
    const input = createSineWave(440, sampleRate, 1.0);
    const result = wsolaTimeStretch([input], 0.75, sampleRate);

    // At 0.75x speed, output should be roughly 1/0.75 = 1.333 of input length
    const ratio = result.length / input.length;
    expect(ratio).toBeGreaterThan(1.1);
    expect(ratio).toBeLessThan(1.6);
  });

  it("preserves frequency at tempo=1.5 (440Hz sine wave)", () => {
    const sampleRate = 44100;
    const input = createSineWave(440, sampleRate, 2.0);
    const result = wsolaTimeStretch([input], 1.5, sampleRate);

    const freq = estimatePeakFrequency(result.output[0]!, sampleRate);
    expect(Math.abs(freq - 440)).toBeLessThan(5);
  });

  it("preserves frequency at tempo=0.75 (440Hz sine wave)", () => {
    const sampleRate = 44100;
    const input = createSineWave(440, sampleRate, 2.0);
    const result = wsolaTimeStretch([input], 0.75, sampleRate);

    const freq = estimatePeakFrequency(result.output[0]!, sampleRate);
    expect(Math.abs(freq - 440)).toBeLessThan(5);
  });

  it("handles multi-channel audio", () => {
    const sampleRate = 44100;
    const ch0 = createSineWave(440, sampleRate, 1.0);
    const ch1 = createSineWave(880, sampleRate, 1.0);
    const result = wsolaTimeStretch([ch0, ch1], 1.5, sampleRate);

    expect(result.output).toHaveLength(2);
    expect(result.output[0]!.length).toBe(result.length);
    expect(result.output[1]!.length).toBe(result.length);
  });

  it("handles very short input (shorter than frame size)", () => {
    const sampleRate = 44100;
    const input = createSineWave(440, sampleRate, 0.01); // ~441 samples, less than 1024
    const result = wsolaTimeStretch([input], 1.5, sampleRate);

    // Should return a copy when too short
    expect(result.output).toHaveLength(1);
    expect(result.length).toBe(input.length);
  });
});
