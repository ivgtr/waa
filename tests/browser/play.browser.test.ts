import { describe, it, expect, afterEach } from "vitest";
import { createSineBuffer } from "../../src/synth";
import { play } from "../../src/play";

describe("play() — browser", () => {
  let ctx: AudioContext;

  afterEach(async () => {
    if (ctx?.state !== "closed") {
      await ctx.close();
    }
  });

  it("onended fires after buffer finishes (preservePitch: false)", async () => {
    ctx = new AudioContext();
    await ctx.resume();
    const buffer = createSineBuffer(ctx, 440, 0.15);

    const pb = play(ctx, buffer, { preservePitch: false });
    expect(pb.getState()).toBe("playing");

    await new Promise<void>((resolve) => {
      pb.on("ended", () => resolve());
    });
    expect(pb.getState()).toBe("stopped");
  });

  it("pause and resume work correctly (preservePitch: false)", async () => {
    ctx = new AudioContext();
    await ctx.resume();
    const buffer = createSineBuffer(ctx, 440, 1.0);

    const pb = play(ctx, buffer, { preservePitch: false });
    expect(pb.getState()).toBe("playing");

    pb.pause();
    expect(pb.getState()).toBe("paused");

    pb.resume();
    expect(pb.getState()).toBe("playing");

    pb.stop();
    expect(pb.getState()).toBe("stopped");
  });

  it("stop immediately stops playback (preservePitch: false)", async () => {
    ctx = new AudioContext();
    await ctx.resume();
    const buffer = createSineBuffer(ctx, 440, 1.0);

    const pb = play(ctx, buffer, { preservePitch: false });
    pb.stop();
    expect(pb.getState()).toBe("stopped");
  });

  it("seek changes position (preservePitch: false)", async () => {
    ctx = new AudioContext();
    await ctx.resume();
    const buffer = createSineBuffer(ctx, 440, 1.0);

    const pb = play(ctx, buffer, { preservePitch: false });

    pb.seek(0.5);
    const pos = pb.getCurrentTime();
    // Position should be approximately 0.5
    expect(pos).toBeGreaterThanOrEqual(0.4);
    expect(pos).toBeLessThanOrEqual(0.7);

    pb.stop();
  });

  it("getDuration returns correct buffer duration (preservePitch: false)", async () => {
    ctx = new AudioContext();
    await ctx.resume();
    const buffer = createSineBuffer(ctx, 440, 0.5);

    const pb = play(ctx, buffer, { preservePitch: false });
    expect(pb.getDuration()).toBeCloseTo(0.5, 1);
    pb.stop();
  });

  it("loop keeps playback playing beyond buffer duration (preservePitch: false)", async () => {
    ctx = new AudioContext();
    await ctx.resume();
    const buffer = createSineBuffer(ctx, 440, 0.1);

    const pb = play(ctx, buffer, { loop: true, preservePitch: false });

    // Wait longer than the buffer duration — without loop, it would have ended
    await new Promise((r) => setTimeout(r, 300));

    // With loop, playback should still be playing
    expect(pb.getState()).toBe("playing");
    pb.stop();
  });

  it("setPlaybackRate changes playback speed (preservePitch: false)", async () => {
    ctx = new AudioContext();
    await ctx.resume();
    const buffer = createSineBuffer(ctx, 440, 0.5);

    const pb = play(ctx, buffer, { preservePitch: false });
    pb.setPlaybackRate(2.0);

    // At 2x speed, 0.5s buffer should finish in ~0.25s
    await new Promise<void>((resolve) => {
      pb.on("ended", () => resolve());
    });
    expect(pb.getState()).toBe("stopped");
  });

  it("timeupdate fires with position and duration (preservePitch: false)", async () => {
    ctx = new AudioContext();
    await ctx.resume();
    const buffer = createSineBuffer(ctx, 440, 0.5);

    const pb = play(ctx, buffer, { preservePitch: false, timeupdateInterval: 20 });

    const update = await new Promise<{ position: number; duration: number }>((resolve) => {
      pb.on("timeupdate", (data) => resolve(data));
    });

    expect(update.position).toBeGreaterThanOrEqual(0);
    expect(update.duration).toBeCloseTo(0.5, 1);

    pb.stop();
  });

  it("through option routes audio through node chain (preservePitch: false)", async () => {
    ctx = new AudioContext();
    await ctx.resume();
    const buffer = createSineBuffer(ctx, 440, 0.2);

    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;

    const pb = play(ctx, buffer, {
      through: [gain, analyser],
      preservePitch: false,
    });

    await new Promise((r) => setTimeout(r, 100));

    const data = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(data);
    const maxValue = Math.max(...data);
    expect(maxValue).toBeGreaterThan(-Infinity);

    pb.stop();
  });
});
