import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the stretcher engine module to simulate import failures
vi.mock("../src/stretcher/engine.js", () => ({
  createStretcherEngine: vi.fn(() => {
    throw new Error("engine load failed");
  }),
}));

import { play } from "../src/play";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockAudioContext(): AudioContext {
  return {
    currentTime: 0,
    destination: {} as AudioDestinationNode,
    createBufferSource: vi.fn(() => ({
      buffer: null,
      playbackRate: { value: 1 },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    })),
    createGain: vi.fn(() => ({
      gain: {
        value: 1,
        setValueAtTime: vi.fn(),
        setValueCurveAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
  } as unknown as AudioContext;
}

function createMockAudioBuffer(durationSec: number): AudioBuffer {
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

function flushPromises(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createStretchedPlayback — dynamic import .catch()", () => {
  let ctx: AudioContext;
  let buffer: AudioBuffer;

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = createMockAudioContext();
    buffer = createMockAudioBuffer(10);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("createStretcherEngine が throw → state が stopped に遷移し statechange/ended が emit される", async () => {
    const pb = play(ctx, buffer);

    const statechangeHandler = vi.fn();
    const endedHandler = vi.fn();
    pb.on("statechange", statechangeHandler);
    pb.on("ended", endedHandler);

    await vi.advanceTimersByTimeAsync(0);

    expect(statechangeHandler).toHaveBeenCalledWith({ state: "stopped" });
    expect(endedHandler).toHaveBeenCalledTimes(1);
    expect(pb.getState()).toBe("stopped");
  });

  it("catch 後の getCurrentTime/getDuration/getProgress が正しい値を返す", async () => {
    const pb = play(ctx, buffer);

    await vi.advanceTimersByTimeAsync(0);

    expect(pb.getCurrentTime()).toBe(0);
    expect(pb.getDuration()).toBe(10);
    expect(pb.getProgress()).toBe(0);
  });

  it("catch 発火前に dispose() → イベント emit されず state 変化なし", async () => {
    const pb = play(ctx, buffer);

    const statechangeHandler = vi.fn();
    const endedHandler = vi.fn();
    pb.on("statechange", statechangeHandler);
    pb.on("ended", endedHandler);

    pb.dispose();

    await vi.advanceTimersByTimeAsync(0);

    expect(statechangeHandler).not.toHaveBeenCalled();
    expect(endedHandler).not.toHaveBeenCalled();
  });

  it("catch 発火前に stop() → catch では statechange が二重発火しない", async () => {
    const pb = play(ctx, buffer);

    const statechangeHandler = vi.fn();
    const endedHandler = vi.fn();
    pb.on("statechange", statechangeHandler);
    pb.on("ended", endedHandler);

    pb.stop();
    statechangeHandler.mockClear();
    endedHandler.mockClear();

    await vi.advanceTimersByTimeAsync(0);

    // stop() already set state="stopped", so setState guard prevents double-fire
    expect(statechangeHandler).not.toHaveBeenCalled();
    // ended is still emitted from catch handler
    expect(endedHandler).toHaveBeenCalledTimes(1);
  });

  it("catch 発火前に pause() → catch で state が stopped に上書きされる", async () => {
    const pb = play(ctx, buffer);

    const statechangeHandler = vi.fn();
    const endedHandler = vi.fn();
    pb.on("statechange", statechangeHandler);
    pb.on("ended", endedHandler);

    pb.pause();
    statechangeHandler.mockClear();
    endedHandler.mockClear();

    await vi.advanceTimersByTimeAsync(0);

    expect(pb.getState()).toBe("stopped");
    expect(statechangeHandler).toHaveBeenCalledWith({ state: "stopped" });
    expect(endedHandler).toHaveBeenCalledTimes(1);
  });
});
