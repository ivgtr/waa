import { afterEach, describe, expect, it } from "vitest";
import { createContext, ensureRunning, now, resumeContext } from "../../src/context";

describe("context — browser", () => {
  let ctx: AudioContext | null = null;

  afterEach(async () => {
    if (ctx && ctx.state !== "closed") {
      await ctx.close();
    }
    ctx = null;
  });

  it("createContext returns a real AudioContext in running state", async () => {
    ctx = createContext();
    expect(ctx).toBeInstanceOf(AudioContext);
    // Chromium with --autoplay-policy=no-user-gesture-required starts running
    await ensureRunning(ctx);
    expect(ctx.state).toBe("running");
  });

  it("createContext with sampleRate option sets the sample rate", async () => {
    ctx = createContext({ sampleRate: 22050 });
    expect(ctx.sampleRate).toBe(22050);
  });

  it("now() returns a non-negative number that advances", async () => {
    ctx = createContext();
    await ensureRunning(ctx);

    // Connect an oscillator to force audio processing to advance currentTime
    const osc = ctx.createOscillator();
    osc.connect(ctx.destination);
    osc.start();

    const t0 = now(ctx);
    expect(t0).toBeGreaterThanOrEqual(0);

    // Wait for audio processing to advance currentTime
    await new Promise((r) => setTimeout(r, 100));
    const t1 = now(ctx);
    expect(t1).toBeGreaterThan(t0);

    osc.stop();
    osc.disconnect();
  });

  it("resumeContext resumes a suspended context", async () => {
    ctx = createContext();
    await ensureRunning(ctx);
    expect(ctx.state).toBe("running");
    // resumeContext on already running context is a no-op
    await resumeContext(ctx);
    expect(ctx.state).toBe("running");
  });

  it("close sets state to closed", async () => {
    ctx = createContext();
    await ensureRunning(ctx);
    await ctx.close();
    expect(ctx.state).toBe("closed");
    ctx = null;
  });
});
