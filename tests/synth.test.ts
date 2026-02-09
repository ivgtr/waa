import { describe, it, expect } from "vitest";
import { createSineBuffer, createNoiseBuffer, createClickBuffer } from "../src/synth.js";
import { createMockAudioContext } from "./helpers/audio-mocks.js";

describe("synth", () => {
  // -------------------------------------------------------------------------
  // createSineBuffer
  // -------------------------------------------------------------------------
  describe("createSineBuffer", () => {
    it("creates a buffer with the correct length", () => {
      const ctx = createMockAudioContext({ sampleRate: 44100 });
      const buf = createSineBuffer(ctx, 440, 1);
      expect(ctx.createBuffer).toHaveBeenCalledWith(1, 44100, 44100);
      expect(buf).toBeDefined();
    });

    it("fills data with a sine wave pattern", () => {
      const ctx = createMockAudioContext({ sampleRate: 44100 });
      const buf = createSineBuffer(ctx, 440, 0.01);
      const data = buf.getChannelData(0);
      // First sample should be sin(0) = 0
      expect(data[0]).toBeCloseTo(0, 5);
      // Check that values oscillate (not all zero)
      let hasPositive = false;
      let hasNegative = false;
      for (let i = 0; i < data.length; i++) {
        if (data[i]! > 0.1) hasPositive = true;
        if (data[i]! < -0.1) hasNegative = true;
      }
      expect(hasPositive).toBe(true);
      expect(hasNegative).toBe(true);
    });

    it("correctly generates known sine values", () => {
      const sampleRate = 8000;
      const ctx = createMockAudioContext({ sampleRate });
      const freq = 1000;
      const buf = createSineBuffer(ctx, freq, 0.001);
      const data = buf.getChannelData(0);
      // Verify each sample matches sin formula
      for (let i = 0; i < data.length; i++) {
        const expected = Math.sin((2 * Math.PI * freq * i) / sampleRate);
        expect(data[i]).toBeCloseTo(expected, 5);
      }
    });

    it("handles duration=0", () => {
      const ctx = createMockAudioContext({ sampleRate: 44100 });
      const buf = createSineBuffer(ctx, 440, 0);
      expect(buf.getChannelData(0).length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // createNoiseBuffer
  // -------------------------------------------------------------------------
  describe("createNoiseBuffer", () => {
    it("creates a buffer with values in [-1, 1]", () => {
      const ctx = createMockAudioContext({ sampleRate: 44100 });
      const buf = createNoiseBuffer(ctx, 0.1);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        expect(data[i]).toBeGreaterThanOrEqual(-1);
        expect(data[i]).toBeLessThanOrEqual(1);
      }
    });

    it("produces non-uniform data (not all same value)", () => {
      const ctx = createMockAudioContext({ sampleRate: 44100 });
      const buf = createNoiseBuffer(ctx, 0.1);
      const data = buf.getChannelData(0);
      const uniqueValues = new Set<number>();
      for (let i = 0; i < Math.min(data.length, 100); i++) {
        uniqueValues.add(data[i]!);
      }
      expect(uniqueValues.size).toBeGreaterThan(1);
    });
  });

  // -------------------------------------------------------------------------
  // createClickBuffer
  // -------------------------------------------------------------------------
  describe("createClickBuffer", () => {
    it("applies exponential decay (start > end)", () => {
      const ctx = createMockAudioContext({ sampleRate: 44100 });
      const buf = createClickBuffer(ctx, 440, 0.05);
      const data = buf.getChannelData(0);
      // The absolute amplitude near the start should be greater than near the end
      const startMax = Math.max(...Array.from(data.subarray(0, 10)).map(Math.abs));
      const endMax = Math.max(...Array.from(data.subarray(data.length - 10)).map(Math.abs));
      expect(startMax).toBeGreaterThan(endMax);
    });

    it("matches exponential decay * sine formula", () => {
      const sampleRate = 8000;
      const ctx = createMockAudioContext({ sampleRate });
      const freq = 1000;
      const duration = 0.01;
      const buf = createClickBuffer(ctx, freq, duration);
      const data = buf.getChannelData(0);
      const length = data.length;
      for (let i = 0; i < length; i++) {
        const envelope = Math.exp((-5 * i) / length);
        const expected = envelope * Math.sin((2 * Math.PI * freq * i) / sampleRate);
        expect(data[i]).toBeCloseTo(expected, 5);
      }
    });
  });
});
