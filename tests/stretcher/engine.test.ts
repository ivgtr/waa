import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StretcherEngine, StretcherEvents } from "../../src/stretcher/types";

// We test the engine using mocked dependencies since Worker is not available in Node.
// This focuses on the integration logic.

// Mock Worker and URL APIs
const mockWorker = {
  postMessage: vi.fn(),
  terminate: vi.fn(),
  onmessage: null as ((e: MessageEvent) => void) | null,
  onerror: null as ((e: ErrorEvent) => void) | null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

vi.stubGlobal("Worker", vi.fn(() => ({ ...mockWorker })));
vi.stubGlobal("URL", {
  createObjectURL: vi.fn(() => "blob:mock"),
  revokeObjectURL: vi.fn(),
});
vi.stubGlobal("Blob", vi.fn());

describe("createStretcherEngine", () => {
  let createStretcherEngine: typeof import("../../src/stretcher/engine").createStretcherEngine;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../../src/stretcher/engine");
    createStretcherEngine = mod.createStretcherEngine;
  });

  function createMockAudioContext(): AudioContext {
    const mockCtx = {
      currentTime: 0,
      sampleRate: 44100,
      destination: {} as AudioDestinationNode,
      createBufferSource: vi.fn(() => ({
        buffer: null,
        playbackRate: { value: 1 },
        loop: false,
        loopStart: 0,
        loopEnd: 0,
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
          linearRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      createBuffer: vi.fn((channels: number, length: number, sampleRate: number) => {
        const channelData: Float32Array[] = [];
        for (let i = 0; i < channels; i++) {
          channelData.push(new Float32Array(length));
        }
        return {
          numberOfChannels: channels,
          length,
          sampleRate,
          duration: length / sampleRate,
          getChannelData: (ch: number) => channelData[ch]!,
        };
      }),
    } as unknown as AudioContext;
    return mockCtx;
  }

  function createMockAudioBuffer(
    durationSec: number,
    sampleRate: number = 44100,
    channels: number = 1,
  ): AudioBuffer {
    const length = Math.round(durationSec * sampleRate);
    const channelData: Float32Array[] = [];
    for (let i = 0; i < channels; i++) {
      channelData.push(new Float32Array(length));
    }
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: durationSec,
      getChannelData: (ch: number) => channelData[ch]!,
    } as unknown as AudioBuffer;
  }

  it("creates an engine with correct initial state", () => {
    const ctx = createMockAudioContext();
    const buffer = createMockAudioBuffer(60); // 60 seconds

    const engine = createStretcherEngine(ctx, buffer, {
      tempo: 1.5,
    });

    const status = engine.getStatus();
    expect(status.phase).toBe("waiting");
    expect(status.playback.tempo).toBe(1.5);
    expect(status.playback.duration).toBe(60);
    expect(status.conversion.total).toBeGreaterThan(0);

    engine.dispose();
  });

  it("starts and emits buffering event", () => {
    const ctx = createMockAudioContext();
    const buffer = createMockAudioBuffer(60);

    const engine = createStretcherEngine(ctx, buffer, { tempo: 1.0 });

    const bufferingHandler = vi.fn();
    engine.on("buffering", bufferingHandler);

    engine.start();

    expect(bufferingHandler).toHaveBeenCalledWith({ reason: "initial" });
    expect(engine.getStatus().phase).toBe("buffering");

    engine.dispose();
  });

  it("getSnapshot returns valid stretcher extension", () => {
    const ctx = createMockAudioContext();
    const buffer = createMockAudioBuffer(90);

    const engine = createStretcherEngine(ctx, buffer, { tempo: 1.5 });

    const snapshot = engine.getSnapshot();
    expect(snapshot.tempo).toBe(1.5);
    expect(snapshot.converting).toBe(false);
    expect(snapshot.conversionProgress).toBe(0);
    expect(snapshot.bufferHealth).toBe("empty");
    expect(snapshot.aheadSeconds).toBe(0);
    expect(snapshot.buffering).toBe(true); // waiting state

    engine.dispose();
  });

  it("pause changes phase to paused", () => {
    const ctx = createMockAudioContext();
    const buffer = createMockAudioBuffer(60);

    const engine = createStretcherEngine(ctx, buffer, { tempo: 1.0 });
    engine.start();
    engine.pause();

    expect(engine.getStatus().phase).toBe("paused");

    engine.dispose();
  });

  it("stop changes phase to ended", () => {
    const ctx = createMockAudioContext();
    const buffer = createMockAudioBuffer(60);

    const engine = createStretcherEngine(ctx, buffer, { tempo: 1.0 });
    engine.start();
    engine.stop();

    expect(engine.getStatus().phase).toBe("ended");

    engine.dispose();
  });

  it("setTempo changes tempo and emits buffering", () => {
    const ctx = createMockAudioContext();
    const buffer = createMockAudioBuffer(60);

    const engine = createStretcherEngine(ctx, buffer, { tempo: 1.0 });

    const bufferingHandler = vi.fn();
    engine.on("buffering", bufferingHandler);

    engine.start();
    bufferingHandler.mockClear();

    engine.setTempo(1.5);

    expect(engine.getStatus().playback.tempo).toBe(1.5);
    expect(bufferingHandler).toHaveBeenCalledWith({ reason: "tempo-change" });

    engine.dispose();
  });

  it("dispose cleans up resources", () => {
    const ctx = createMockAudioContext();
    const buffer = createMockAudioBuffer(60);

    const engine = createStretcherEngine(ctx, buffer, { tempo: 1.0 });
    engine.start();

    // Should not throw
    engine.dispose();
    engine.dispose(); // Double dispose should be safe
  });

  it("event subscription and unsubscription works", () => {
    const ctx = createMockAudioContext();
    const buffer = createMockAudioBuffer(60);

    const engine = createStretcherEngine(ctx, buffer, { tempo: 1.0 });

    const handler = vi.fn();
    const unsub = engine.on("buffering", handler);

    engine.start();
    expect(handler).toHaveBeenCalled();

    handler.mockClear();
    unsub();

    // After unsubscribe, handler should not be called
    engine.setTempo(1.5);
    expect(handler).not.toHaveBeenCalled();

    engine.dispose();
  });
});
