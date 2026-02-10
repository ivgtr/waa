import { describe, expect, it } from "vitest";
import {
  chain,
  createAnalyser,
  createCompressor,
  createFilter,
  createGain,
  createPanner,
  disconnectChain,
  getFrequencyData,
  getFrequencyDataByte,
  rampGain,
} from "../src/nodes.js";
import type { MockAnalyserNode } from "./helpers/audio-mocks.js";
import { createMockAudioContext } from "./helpers/audio-mocks.js";

describe("nodes", () => {
  // -------------------------------------------------------------------------
  // createGain
  // -------------------------------------------------------------------------
  describe("createGain", () => {
    it("creates a GainNode with default value", () => {
      const ctx = createMockAudioContext();
      const gain = createGain(ctx);
      expect(ctx.createGain).toHaveBeenCalled();
      expect(gain.gain.value).toBe(1);
    });

    it("sets initial value when provided", () => {
      const ctx = createMockAudioContext();
      const gain = createGain(ctx, 0.5);
      expect(gain.gain.value).toBe(0.5);
    });
  });

  // -------------------------------------------------------------------------
  // rampGain
  // -------------------------------------------------------------------------
  describe("rampGain", () => {
    it("calls cancelScheduledValues → setValueAtTime → linearRamp in order", () => {
      const ctx = createMockAudioContext({ currentTime: 1.0 });
      const gain = createGain(ctx);
      rampGain(gain as unknown as GainNode, 0.5, 2.0);

      expect(gain.gain.cancelScheduledValues).toHaveBeenCalledWith(1.0);
      expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(gain.gain.value, 1.0);
      expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.5, 3.0);
    });
  });

  // -------------------------------------------------------------------------
  // createAnalyser
  // -------------------------------------------------------------------------
  describe("createAnalyser", () => {
    it("creates an AnalyserNode with defaults", () => {
      const ctx = createMockAudioContext();
      const analyser = createAnalyser(ctx);
      expect(ctx.createAnalyser).toHaveBeenCalled();
      expect(analyser).toBeDefined();
    });

    it("sets fftSize and smoothingTimeConstant", () => {
      const ctx = createMockAudioContext();
      const analyser = createAnalyser(ctx, { fftSize: 4096, smoothingTimeConstant: 0.5 });
      expect(analyser.fftSize).toBe(4096);
      expect(analyser.smoothingTimeConstant).toBe(0.5);
    });
  });

  // -------------------------------------------------------------------------
  // getFrequencyData
  // -------------------------------------------------------------------------
  describe("getFrequencyData", () => {
    it("returns Float32Array with correct length", () => {
      const ctx = createMockAudioContext();
      const analyser = createAnalyser(ctx) as unknown as MockAnalyserNode;
      analyser.frequencyBinCount = 512;
      const result = getFrequencyData(analyser as unknown as AnalyserNode);
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(512);
      expect(analyser.getFloatFrequencyData).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getFrequencyDataByte
  // -------------------------------------------------------------------------
  describe("getFrequencyDataByte", () => {
    it("returns Uint8Array with correct length", () => {
      const ctx = createMockAudioContext();
      const analyser = createAnalyser(ctx) as unknown as MockAnalyserNode;
      analyser.frequencyBinCount = 512;
      const result = getFrequencyDataByte(analyser as unknown as AnalyserNode);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(512);
      expect(analyser.getByteFrequencyData).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // createFilter
  // -------------------------------------------------------------------------
  describe("createFilter", () => {
    it("creates a BiquadFilterNode with defaults", () => {
      const ctx = createMockAudioContext();
      const filter = createFilter(ctx);
      expect(ctx.createBiquadFilter).toHaveBeenCalled();
      expect(filter).toBeDefined();
    });

    it("sets type, frequency, Q, gain options", () => {
      const ctx = createMockAudioContext();
      const filter = createFilter(ctx, {
        type: "highpass",
        frequency: 1000,
        Q: 2,
        gain: 3,
      });
      expect(filter.type).toBe("highpass");
      expect(filter.frequency.value).toBe(1000);
      expect(filter.Q.value).toBe(2);
      expect(filter.gain.value).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // createPanner
  // -------------------------------------------------------------------------
  describe("createPanner", () => {
    it("creates a StereoPannerNode with default pan", () => {
      const ctx = createMockAudioContext();
      const panner = createPanner(ctx);
      expect(ctx.createStereoPanner).toHaveBeenCalled();
      expect(panner.pan.value).toBe(0);
    });

    it("sets pan value", () => {
      const ctx = createMockAudioContext();
      const panner = createPanner(ctx, -0.5);
      expect(panner.pan.value).toBe(-0.5);
    });
  });

  // -------------------------------------------------------------------------
  // createCompressor
  // -------------------------------------------------------------------------
  describe("createCompressor", () => {
    it("creates a DynamicsCompressorNode with defaults", () => {
      const ctx = createMockAudioContext();
      const comp = createCompressor(ctx);
      expect(ctx.createDynamicsCompressor).toHaveBeenCalled();
      expect(comp).toBeDefined();
    });

    it("sets all 5 parameters", () => {
      const ctx = createMockAudioContext();
      const comp = createCompressor(ctx, {
        threshold: -50,
        knee: 40,
        ratio: 20,
        attack: 0.01,
        release: 0.5,
      });
      expect(comp.threshold.value).toBe(-50);
      expect(comp.knee.value).toBe(40);
      expect(comp.ratio.value).toBe(20);
      expect(comp.attack.value).toBe(0.01);
      expect(comp.release.value).toBe(0.5);
    });
  });

  // -------------------------------------------------------------------------
  // chain
  // -------------------------------------------------------------------------
  describe("chain", () => {
    it("connects nodes in serial order", () => {
      const ctx = createMockAudioContext();
      const g1 = createGain(ctx);
      const g2 = createGain(ctx);
      const g3 = createGain(ctx);
      chain(g1 as unknown as AudioNode, g2 as unknown as AudioNode, g3 as unknown as AudioNode);
      expect(g1.connect).toHaveBeenCalledWith(g2);
      expect(g2.connect).toHaveBeenCalledWith(g3);
    });

    it("handles 0 nodes without error", () => {
      expect(() => chain()).not.toThrow();
    });

    it("handles 1 node without error", () => {
      const ctx = createMockAudioContext();
      const g = createGain(ctx);
      expect(() => chain(g as unknown as AudioNode)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // disconnectChain
  // -------------------------------------------------------------------------
  describe("disconnectChain", () => {
    it("disconnects all nodes", () => {
      const ctx = createMockAudioContext();
      const g1 = createGain(ctx);
      const g2 = createGain(ctx);
      disconnectChain(g1 as unknown as AudioNode, g2 as unknown as AudioNode);
      expect(g1.disconnect).toHaveBeenCalled();
      expect(g2.disconnect).toHaveBeenCalled();
    });

    it("handles disconnect throwing without error", () => {
      const ctx = createMockAudioContext();
      const g = createGain(ctx);
      g.disconnect.mockImplementation(() => {
        throw new Error("already disconnected");
      });
      expect(() => disconnectChain(g as unknown as AudioNode)).not.toThrow();
    });
  });
});
