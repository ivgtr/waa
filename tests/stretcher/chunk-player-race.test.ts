import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createChunkPlayer } from "../../src/stretcher/chunk-player";
import {
  createMockAudioContext,
  findActiveSource,
  type MockAudioContext,
} from "../helpers/audio-mocks";

describe("createChunkPlayer – race conditions", () => {
  let ctx: MockAudioContext;

  function createMockBuffer(durationSec: number): AudioBuffer {
    const length = Math.round(durationSec * 44100);
    const data = new Float32Array(length);
    return {
      numberOfChannels: 1,
      length,
      sampleRate: 44100,
      duration: durationSec,
      getChannelData: () => data,
    } as unknown as AudioBuffer;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = createMockAudioContext();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("scheduleNext → onended fires before timer → no double transition", () => {
    const player = createChunkPlayer(ctx, {
      destination: ctx.destination,
      crossfadeSec: 0.1,
    });
    const onTransition = vi.fn();
    player.setOnTransition(onTransition);

    const buf1 = createMockBuffer(8);
    const buf2 = createMockBuffer(8);

    player.playChunk(buf1, ctx.currentTime, 0);
    ctx._setCurrentTime(7);
    player.scheduleNext(buf2, 8);

    // Simulate onended firing before the transition timer
    const src = findActiveSource(ctx._sources);
    src!.onended!();

    // Transition should have been called once (from onended)
    expect(onTransition).toHaveBeenCalledTimes(1);

    // Now advance time to fire the transition timer
    vi.advanceTimersByTime(2000);

    // Should still be 1 — timer callback should see nextSource is null
    expect(onTransition).toHaveBeenCalledTimes(1);

    player.dispose();
  });

  it("scheduleNext → pause → timer fires → paused check prevents action", () => {
    const player = createChunkPlayer(ctx, {
      destination: ctx.destination,
      crossfadeSec: 0.1,
    });
    const onTransition = vi.fn();
    const onChunkEnded = vi.fn();
    player.setOnTransition(onTransition);
    player.setOnChunkEnded(onChunkEnded);

    const buf1 = createMockBuffer(8);
    const buf2 = createMockBuffer(8);

    player.playChunk(buf1, ctx.currentTime, 0);
    ctx._setCurrentTime(7);
    player.scheduleNext(buf2, 8);

    // Pause before timer fires — this cancels the transition timer
    player.pause();

    // Timer should have been cancelled by pause
    vi.advanceTimersByTime(5000);
    expect(onTransition).not.toHaveBeenCalled();

    player.dispose();
  });

  it("scheduleNext → stop → timer fires → stopped check prevents action", () => {
    const player = createChunkPlayer(ctx, {
      destination: ctx.destination,
      crossfadeSec: 0.1,
    });
    const onTransition = vi.fn();
    player.setOnTransition(onTransition);

    const buf1 = createMockBuffer(8);
    const buf2 = createMockBuffer(8);

    player.playChunk(buf1, ctx.currentTime, 0);
    ctx._setCurrentTime(7);
    player.scheduleNext(buf2, 8);

    // Stop before timer fires — this cancels the transition timer
    player.stop();

    vi.advanceTimersByTime(5000);
    expect(onTransition).not.toHaveBeenCalled();

    player.dispose();
  });

  it("consecutive scheduleNext calls cancel previous timer", () => {
    const player = createChunkPlayer(ctx, {
      destination: ctx.destination,
      crossfadeSec: 0.1,
    });
    const onTransition = vi.fn();
    player.setOnTransition(onTransition);

    const buf1 = createMockBuffer(8);
    const buf2 = createMockBuffer(8);
    const buf3 = createMockBuffer(8);

    player.playChunk(buf1, ctx.currentTime, 0);

    // First scheduleNext
    ctx._setCurrentTime(6);
    player.scheduleNext(buf2, 7.9);

    // Second scheduleNext should cancel the first timer
    ctx._setCurrentTime(7);
    player.scheduleNext(buf3, 8);

    // Advance past both timer delays
    vi.advanceTimersByTime(5000);

    // Only the second scheduleNext's transition should fire
    expect(onTransition).toHaveBeenCalledTimes(1);

    player.dispose();
  });

  it("dispose after scheduleNext → timer fires → no crash", () => {
    const player = createChunkPlayer(ctx, {
      destination: ctx.destination,
      crossfadeSec: 0.1,
    });
    const onTransition = vi.fn();
    player.setOnTransition(onTransition);

    const buf1 = createMockBuffer(8);
    const buf2 = createMockBuffer(8);

    player.playChunk(buf1, ctx.currentTime, 0);
    ctx._setCurrentTime(7);
    player.scheduleNext(buf2, 8);

    // Dispose immediately — should cancel the timer
    player.dispose();

    // Advancing shouldn't cause any errors
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
    expect(onTransition).not.toHaveBeenCalled();
  });

  it("onended after dispose → no crash", () => {
    const player = createChunkPlayer(ctx, {
      destination: ctx.destination,
      crossfadeSec: 0.1,
    });
    const onChunkEnded = vi.fn();
    player.setOnChunkEnded(onChunkEnded);

    const buf1 = createMockBuffer(8);
    player.playChunk(buf1, ctx.currentTime, 0);

    // Grab the source before dispose clears it
    const src = ctx._sources[ctx._sources.length - 1]!;
    const onendedFn = src.onended;

    player.dispose();

    // onended handler should have been nulled, but even if called
    // it should not crash
    if (onendedFn) {
      expect(() => onendedFn()).not.toThrow();
    }
    expect(onChunkEnded).not.toHaveBeenCalled();
  });
});
