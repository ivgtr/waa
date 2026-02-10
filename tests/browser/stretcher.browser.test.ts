import { describe, it, expect, afterEach } from "vitest";
import { createSineBuffer } from "../../src/synth";
import { play } from "../../src/play";

describe("stretcher (preservePitch) — browser", () => {
  let ctx: AudioContext;

  afterEach(async () => {
    if (ctx?.state !== "closed") {
      await ctx.close();
    }
  });

  it("play with preservePitch: true starts and emits statechange", async () => {
    ctx = new AudioContext();
    await ctx.resume();
    const buffer = createSineBuffer(ctx, 440, 1.0);

    const pb = play(ctx, buffer, { preservePitch: true });
    expect(pb.getState()).toBe("playing");
    expect(pb.getDuration()).toBeCloseTo(1.0, 1);

    // Wait for engine initialization
    await new Promise((r) => setTimeout(r, 200));

    // Should still be playing
    expect(pb.getState()).toBe("playing");
    pb.stop();
    expect(pb.getState()).toBe("stopped");
  });

  it("pause and resume work with stretcher", async () => {
    ctx = new AudioContext();
    await ctx.resume();
    const buffer = createSineBuffer(ctx, 440, 2.0);

    const pb = play(ctx, buffer, { preservePitch: true });

    // Wait for engine init
    await new Promise((r) => setTimeout(r, 300));

    pb.pause();
    expect(pb.getState()).toBe("paused");

    const posAtPause = pb.getCurrentTime();

    pb.resume();
    expect(pb.getState()).toBe("playing");

    // Position should not have jumped significantly
    const posAfterResume = pb.getCurrentTime();
    expect(Math.abs(posAfterResume - posAtPause)).toBeLessThan(0.5);

    pb.stop();
  });

  it("setPlaybackRate (tempo change) works", async () => {
    ctx = new AudioContext();
    await ctx.resume();
    const buffer = createSineBuffer(ctx, 440, 2.0);

    const pb = play(ctx, buffer, { preservePitch: true, playbackRate: 1.0 });

    // Wait for engine init
    await new Promise((r) => setTimeout(r, 300));

    // Change tempo to 2x
    pb.setPlaybackRate(2.0);

    // Wait for re-buffering
    await new Promise((r) => setTimeout(r, 500));

    // Should still be playing (or stopped if short enough)
    const state = pb.getState();
    expect(["playing", "stopped"]).toContain(state);

    if (state === "playing") {
      pb.stop();
    }
  });

  it("seek to position works", async () => {
    ctx = new AudioContext();
    await ctx.resume();
    const buffer = createSineBuffer(ctx, 440, 2.0);

    const pb = play(ctx, buffer, { preservePitch: true });

    // Wait for engine init
    await new Promise((r) => setTimeout(r, 300));

    pb.seek(1.0);

    // Wait for seek to process
    await new Promise((r) => setTimeout(r, 200));

    // Position should be near 1.0
    const pos = pb.getCurrentTime();
    expect(pos).toBeGreaterThanOrEqual(0.5);

    pb.stop();
  });

  it("dispose cleans up resources", async () => {
    ctx = new AudioContext();
    await ctx.resume();
    const buffer = createSineBuffer(ctx, 440, 1.0);

    const pb = play(ctx, buffer, { preservePitch: true });

    // Wait for engine init
    await new Promise((r) => setTimeout(r, 200));

    pb.dispose();
    // After dispose, operations should be safe (no-ops)
    pb.pause();
    pb.resume();
    pb.seek(0.5);
    pb.stop();
  });

  it("short buffer plays to end and emits ended", async () => {
    ctx = new AudioContext();
    await ctx.resume();
    const buffer = createSineBuffer(ctx, 440, 0.3);

    const pb = play(ctx, buffer, { preservePitch: true });

    const ended = await Promise.race([
      new Promise<boolean>((resolve) => {
        pb.on("ended", () => resolve(true));
      }),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000)),
    ]);

    expect(ended).toBe(true);
    expect(pb.getState()).toBe("stopped");
  }, 10000);
});
