import { afterEach, describe, expect, it } from "vitest";
import {
  chain,
  createAnalyser,
  createCompressor,
  createFilter,
  createGain,
  createPanner,
  disconnectChain,
  rampGain,
} from "../../src/nodes";
import { createSineBuffer } from "../../src/synth";

describe("nodes — browser", () => {
  let ctx: AudioContext;

  afterEach(async () => {
    if (ctx?.state !== "closed") {
      await ctx.close();
    }
  });

  it("createGain creates a real GainNode with correct initial value", () => {
    ctx = new AudioContext();
    const gain = createGain(ctx, 0.5);
    expect(gain).toBeInstanceOf(GainNode);
    expect(gain.gain.value).toBeCloseTo(0.5, 2);
  });

  it("createAnalyser creates a real AnalyserNode", () => {
    ctx = new AudioContext();
    const analyser = createAnalyser(ctx, { fftSize: 512 });
    expect(analyser).toBeInstanceOf(AnalyserNode);
    expect(analyser.fftSize).toBe(512);
  });

  it("createFilter creates a BiquadFilterNode", () => {
    ctx = new AudioContext();
    const filter = createFilter(ctx, { type: "highpass", frequency: 1000 });
    expect(filter).toBeInstanceOf(BiquadFilterNode);
    expect(filter.type).toBe("highpass");
    expect(filter.frequency.value).toBeCloseTo(1000, 0);
  });

  it("createPanner creates a StereoPannerNode", () => {
    ctx = new AudioContext();
    const panner = createPanner(ctx, -0.5);
    expect(panner).toBeInstanceOf(StereoPannerNode);
    expect(panner.pan.value).toBeCloseTo(-0.5, 2);
  });

  it("createCompressor creates a DynamicsCompressorNode", () => {
    ctx = new AudioContext();
    const comp = createCompressor(ctx, { threshold: -20, ratio: 4 });
    expect(comp).toBeInstanceOf(DynamicsCompressorNode);
    expect(comp.threshold.value).toBeCloseTo(-20, 0);
    expect(comp.ratio.value).toBeCloseTo(4, 0);
  });

  it("chain connects nodes and signal passes through to AnalyserNode", async () => {
    ctx = new AudioContext();
    await ctx.resume();

    const buffer = createSineBuffer(ctx, 440, 0.2);
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = createGain(ctx, 1);
    const analyser = createAnalyser(ctx, { fftSize: 256 });

    chain(source, gain, analyser, ctx.destination);
    source.start();

    // Wait for some audio to process
    await new Promise((r) => setTimeout(r, 100));

    const data = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(data);

    // Should have some non-negative-infinity frequency data (signal present)
    const maxValue = Math.max(...data);
    expect(maxValue).toBeGreaterThan(-Infinity);

    disconnectChain(source, gain, analyser);
  });

  it("rampGain changes gain value over time", async () => {
    ctx = new AudioContext();
    await ctx.resume();

    const gain = createGain(ctx, 1.0);
    gain.connect(ctx.destination);

    rampGain(gain, 0.0, 0.1);

    // Wait for ramp to complete
    await new Promise((r) => setTimeout(r, 150));

    expect(gain.gain.value).toBeCloseTo(0.0, 1);
  });
});
