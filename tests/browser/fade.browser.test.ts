import { afterEach, describe, expect, it } from "vitest";
import { crossfade, fadeIn, fadeOut } from "../../src/fade";

describe("fade — browser", () => {
  let ctx: AudioContext;

  afterEach(async () => {
    if (ctx?.state !== "closed") {
      await ctx.close();
    }
  });

  it("fadeIn ramps gain from 0 to target (linear)", async () => {
    ctx = new AudioContext();
    await ctx.resume();

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);

    fadeIn(gain, 1.0, { duration: 0.1, curve: "linear" });

    // Wait for fade to complete
    await new Promise((r) => setTimeout(r, 150));

    expect(gain.gain.value).toBeCloseTo(1.0, 1);
  });

  it("fadeOut ramps gain to 0 (linear)", async () => {
    ctx = new AudioContext();
    await ctx.resume();

    const gain = ctx.createGain();
    gain.gain.value = 1.0;
    gain.connect(ctx.destination);

    fadeOut(gain, { duration: 0.1, curve: "linear" });

    // Wait for fade to complete
    await new Promise((r) => setTimeout(r, 150));

    expect(gain.gain.value).toBeCloseTo(0.0, 1);
  });

  it("fadeIn with exponential curve reaches target", async () => {
    ctx = new AudioContext();
    await ctx.resume();

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);

    fadeIn(gain, 0.8, { duration: 0.1, curve: "exponential" });

    await new Promise((r) => setTimeout(r, 150));

    // Exponential ramp clamps to EXP_MIN, not exactly target
    expect(gain.gain.value).toBeGreaterThan(0.5);
  });

  it("crossfade transitions between two GainNodes", async () => {
    ctx = new AudioContext();
    await ctx.resume();

    const gainA = ctx.createGain();
    const gainB = ctx.createGain();
    gainA.gain.value = 1.0;
    gainB.gain.value = 0.0;
    gainA.connect(ctx.destination);
    gainB.connect(ctx.destination);

    crossfade(gainA, gainB, { duration: 0.1, curve: "linear" });

    await new Promise((r) => setTimeout(r, 150));

    expect(gainA.gain.value).toBeCloseTo(0.0, 1);
    expect(gainB.gain.value).toBeCloseTo(1.0, 1);
  });

  it("fadeIn with equal-power curve reaches target", async () => {
    ctx = new AudioContext();
    await ctx.resume();

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);

    fadeIn(gain, 1.0, { duration: 0.1, curve: "equal-power" });

    await new Promise((r) => setTimeout(r, 150));

    expect(gain.gain.value).toBeCloseTo(1.0, 1);
  });
});
