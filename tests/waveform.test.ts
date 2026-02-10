import { describe, expect, it } from "vitest";
import { extractPeakPairs, extractPeaks, extractRMS } from "../src/waveform.js";
import { createMockAudioBuffer } from "./helpers/audio-mocks.js";

/** Helper: create a buffer with known channel data. */
function bufferWithData(data: Float32Array, channels = 1): AudioBuffer {
  const allChannels = [data];
  for (let i = 1; i < channels; i++) {
    allChannels.push(new Float32Array(data.length));
  }
  return {
    numberOfChannels: channels,
    length: data.length,
    sampleRate: 44100,
    duration: data.length / 44100,
    getChannelData: (ch: number) => allChannels[ch]!,
  } as unknown as AudioBuffer;
}

/** Helper: create a multi-channel buffer. */
function multiChannelBuffer(channelDataArrays: Float32Array[]): AudioBuffer {
  const length = channelDataArrays[0]?.length ?? 0;
  return {
    numberOfChannels: channelDataArrays.length,
    length,
    sampleRate: 44100,
    duration: length / 44100,
    getChannelData: (ch: number) => channelDataArrays[ch]!,
  } as unknown as AudioBuffer;
}

describe("waveform", () => {
  // -------------------------------------------------------------------------
  // extractPeaks
  // -------------------------------------------------------------------------
  describe("extractPeaks", () => {
    it("returns correct peak values for known data", () => {
      // 10 samples, resolution=5 → blockSize=2
      const data = new Float32Array([0.1, 0.5, -0.3, 0.8, 0.0, -0.2, 0.7, 0.1, -0.9, 0.4]);
      const buf = bufferWithData(data);
      const peaks = extractPeaks(buf, { resolution: 5 });
      // Block 0: [0.1, 0.5] → 0.5
      // Block 1: [-0.3, 0.8] → 0.8
      // Block 2: [0.0, -0.2] → 0.2
      // Block 3: [0.7, 0.1] → 0.7
      // Block 4: [-0.9, 0.4] → 0.9
      expect(peaks.length).toBe(5);
      expect(peaks[0]).toBeCloseTo(0.5, 5);
      expect(peaks[1]).toBeCloseTo(0.8, 5);
      expect(peaks[2]).toBeCloseTo(0.2, 5);
      expect(peaks[3]).toBeCloseTo(0.7, 5);
      expect(peaks[4]).toBeCloseTo(0.9, 5);
    });

    it("uses default resolution of 200", () => {
      const buf = createMockAudioBuffer(1, 44100);
      const peaks = extractPeaks(buf);
      expect(peaks.length).toBe(200);
    });

    it("returns all zeros for silent buffer", () => {
      const data = new Float32Array(100);
      const buf = bufferWithData(data);
      const peaks = extractPeaks(buf, { resolution: 10 });
      expect(peaks.every((v) => v === 0)).toBe(true);
    });

    it("handles resolution > data.length without NaN", () => {
      const data = new Float32Array([0.5, -0.3]);
      const buf = bufferWithData(data);
      // resolution=10 > data.length=2 → blockSize = floor(2/10) = 0
      const peaks = extractPeaks(buf, { resolution: 10 });
      // With blockSize=0, start===end for each block, so max stays 0
      expect(peaks.every((v) => !Number.isNaN(v))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // extractPeakPairs
  // -------------------------------------------------------------------------
  describe("extractPeakPairs", () => {
    it("returns correct min/max pairs", () => {
      const data = new Float32Array([0.1, 0.5, -0.3, 0.8, -0.9, 0.4, 0.7, 0.1]);
      const buf = bufferWithData(data);
      const pairs = extractPeakPairs(buf, { resolution: 4 });
      // Block 0: [0.1, 0.5] → {min: 0, max: 0.5} (init min=0, max=0)
      expect(pairs[0]!.max).toBeCloseTo(0.5);
      expect(pairs[0]!.min).toBeCloseTo(0);
      // Block 1: [-0.3, 0.8] → {min: -0.3, max: 0.8}
      expect(pairs[1]!.min).toBeCloseTo(-0.3);
      expect(pairs[1]!.max).toBeCloseTo(0.8);
    });

    it("handles all-zero data", () => {
      const data = new Float32Array(100);
      const buf = bufferWithData(data);
      const pairs = extractPeakPairs(buf, { resolution: 10 });
      for (const p of pairs) {
        expect(p.min).toBe(0);
        expect(p.max).toBe(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // extractRMS
  // -------------------------------------------------------------------------
  describe("extractRMS", () => {
    it("computes correct RMS for known data", () => {
      // 4 samples, resolution=2 → blockSize=2
      // Block 0: [1, 0] → sqrt((1+0)/2) = sqrt(0.5)
      // Block 1: [0, 1] → sqrt((0+1)/2) = sqrt(0.5)
      const data = new Float32Array([1, 0, 0, 1]);
      const buf = bufferWithData(data);
      const rms = extractRMS(buf, { resolution: 2 });
      expect(rms[0]).toBeCloseTo(Math.sqrt(0.5), 5);
      expect(rms[1]).toBeCloseTo(Math.sqrt(0.5), 5);
    });

    it("returns 0 for silent buffer", () => {
      const data = new Float32Array(100);
      const buf = bufferWithData(data);
      const rms = extractRMS(buf, { resolution: 10 });
      expect(rms.every((v) => v === 0)).toBe(true);
    });

    it("averages across all channels when channel=-1", () => {
      const ch0 = new Float32Array([1, 0, 0, 0]);
      const ch1 = new Float32Array([0, 0, 1, 0]);
      const buf = multiChannelBuffer([ch0, ch1]);
      const rms = extractRMS(buf, { resolution: 2, channel: -1 });
      // Block 0 ch0: sqrt(1/2), ch1: sqrt(0) → avg = sqrt(0.5)/2
      // Block 1 ch0: sqrt(0), ch1: sqrt(1/2) → avg = sqrt(0.5)/2
      const expected = Math.sqrt(0.5) / 2;
      expect(rms[0]).toBeCloseTo(expected, 5);
      expect(rms[1]).toBeCloseTo(expected, 5);
    });

    it("handles resolution > data.length without NaN (fixed: blockSize clamped to 1)", () => {
      const data = new Float32Array([0.5, -0.3]);
      const buf = bufferWithData(data);
      const rms = extractRMS(buf, { resolution: 10 });
      for (const v of rms) {
        expect(Number.isNaN(v)).toBe(false);
      }
    });

    it("handles channel=-1 with 0-channel buffer (fixed: returns empty array)", () => {
      const buf = {
        numberOfChannels: 0,
        length: 100,
        sampleRate: 44100,
        duration: 100 / 44100,
        getChannelData: () => new Float32Array(100),
      } as unknown as AudioBuffer;
      const result = extractRMS(buf, { resolution: 10, channel: -1 });
      expect(result).toEqual([]);
    });
  });
});
