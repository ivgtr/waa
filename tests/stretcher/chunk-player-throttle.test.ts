import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createChunkPlayer } from "../../src/stretcher/chunk-player";
import { LOOKAHEAD_INTERVAL_MS, LOOKAHEAD_THRESHOLD_SEC } from "../../src/stretcher/constants";
import {
  createMockAudioContext,
  findActiveSource,
  type MockAudioContext,
} from "../helpers/audio-mocks";

describe("createChunkPlayer – background tab throttling", () => {
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

  it("lookahead fires onNeedNext even when timer is throttled to 1000ms", () => {
    const player = createChunkPlayer(ctx, {
      destination: ctx.destination,
      crossfadeSec: 0.1,
    });
    const onNeedNext = vi.fn();
    player.setOnNeedNext(onNeedNext);

    const buf = createMockBuffer(8);
    player.playChunk(buf, ctx.currentTime, 0);

    // Advance to within LOOKAHEAD_THRESHOLD_SEC of end
    ctx._setCurrentTime(8 - LOOKAHEAD_THRESHOLD_SEC + 0.1);

    // Simulate throttled interval: advance by 1000ms (background tab minimum)
    vi.advanceTimersByTime(1000);

    expect(onNeedNext).toHaveBeenCalled();

    player.dispose();
  });

  it("lookahead fires multiple times under throttling with wider threshold", () => {
    const player = createChunkPlayer(ctx, {
      destination: ctx.destination,
      crossfadeSec: 0.1,
    });
    const onNeedNext = vi.fn();
    player.setOnNeedNext(onNeedNext);

    const buf = createMockBuffer(10);
    player.playChunk(buf, ctx.currentTime, 0);

    // Position: remaining = 3.0s (exactly at threshold boundary)
    ctx._setCurrentTime(10 - LOOKAHEAD_THRESHOLD_SEC);

    // Each 1000ms tick in background should still fire onNeedNext
    vi.advanceTimersByTime(1000);
    const firstCallCount = onNeedNext.mock.calls.length;
    expect(firstCallCount).toBeGreaterThan(0);

    // Advance more time — still within threshold, onNeedNext fires again
    ctx._setCurrentTime(10 - LOOKAHEAD_THRESHOLD_SEC + 1);
    vi.advanceTimersByTime(1000);
    expect(onNeedNext.mock.calls.length).toBeGreaterThan(firstCallCount);

    player.dispose();
  });

  it("onended fires before transition timer → doTransition via onended, no double transition", () => {
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

    // Background tab: onended fires before the delayed timer
    const src = findActiveSource(ctx._sources);
    src!.onended!();

    expect(onTransition).toHaveBeenCalledTimes(1);

    // Now simulate the severely delayed timer (background tab: 1000ms+ later)
    vi.advanceTimersByTime(5000);

    // No double transition
    expect(onTransition).toHaveBeenCalledTimes(1);

    player.dispose();
  });

  it("full background cycle: throttled lookahead + onended fallback transition", () => {
    const player = createChunkPlayer(ctx, {
      destination: ctx.destination,
      crossfadeSec: 0.1,
    });
    const onNeedNext = vi.fn();
    const onTransition = vi.fn();
    const onChunkEnded = vi.fn();
    player.setOnNeedNext(onNeedNext);
    player.setOnTransition(onTransition);
    player.setOnChunkEnded(onChunkEnded);

    const buf1 = createMockBuffer(8);
    const buf2 = createMockBuffer(8);

    // Start playing chunk 1
    player.playChunk(buf1, ctx.currentTime, 0);

    // Simulate background tab: time advances but only 1 timer tick per second
    ctx._setCurrentTime(8 - LOOKAHEAD_THRESHOLD_SEC + 0.5);
    vi.advanceTimersByTime(1000);
    expect(onNeedNext).toHaveBeenCalled();

    // Schedule next chunk (as engine would after onNeedNext)
    ctx._setCurrentTime(7.5);
    player.scheduleNext(buf2, 8);

    // onended fires (hardware clock) before the throttled timer
    const src = findActiveSource(ctx._sources);
    src!.onended!();

    expect(onTransition).toHaveBeenCalledTimes(1);

    // Delayed timer doesn't cause double transition
    vi.advanceTimersByTime(5000);
    expect(onTransition).toHaveBeenCalledTimes(1);

    player.dispose();
  });

  it("LOOKAHEAD_THRESHOLD_SEC is wide enough for background tab (>= 3s)", () => {
    // Verify the constant is set to allow 2-3 checks at 1000ms throttle
    expect(LOOKAHEAD_THRESHOLD_SEC).toBeGreaterThanOrEqual(3.0);
  });

  it("LOOKAHEAD_INTERVAL_MS is reasonable for foreground use", () => {
    expect(LOOKAHEAD_INTERVAL_MS).toBeLessThanOrEqual(500);
  });
});
