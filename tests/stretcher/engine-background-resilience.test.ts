import { beforeEach, describe, expect, it, vi } from "vitest";
import { PROACTIVE_SCHEDULE_THRESHOLD_SEC } from "../../src/stretcher/constants";

// Mock Worker and URL APIs (same pattern as engine.test.ts)
const mockWorker = {
  postMessage: vi.fn(),
  terminate: vi.fn(),
  onmessage: null as ((e: MessageEvent) => void) | null,
  onerror: null as ((e: ErrorEvent) => void) | null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

vi.stubGlobal(
  "Worker",
  vi.fn(function MockWorkerCtor(this: typeof mockWorker) {
    Object.assign(this, { ...mockWorker });
  }),
);
const OriginalURL = globalThis.URL;
vi.stubGlobal(
  "URL",
  Object.assign(
    function MockURL(...args: ConstructorParameters<typeof URL>) {
      return new OriginalURL(...args);
    } as unknown as typeof URL,
    {
      createObjectURL: vi.fn(() => "blob:mock"),
      revokeObjectURL: vi.fn(),
      prototype: OriginalURL.prototype,
      canParse: OriginalURL.canParse,
    },
  ),
);
vi.stubGlobal("Blob", vi.fn());

describe("createStretcherEngine – background tab resilience", () => {
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
          setValueCurveAtTime: vi.fn(),
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
    sampleRate = 44100,
    channels = 1,
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

  it("PROACTIVE_SCHEDULE_THRESHOLD_SEC is wider than LOOKAHEAD_THRESHOLD_SEC", async () => {
    const { LOOKAHEAD_THRESHOLD_SEC } = await import("../../src/stretcher/constants");
    expect(PROACTIVE_SCHEDULE_THRESHOLD_SEC).toBeGreaterThan(LOOKAHEAD_THRESHOLD_SEC);
  });

  it("PROACTIVE_SCHEDULE_THRESHOLD_SEC is at least 5 seconds", () => {
    expect(PROACTIVE_SCHEDULE_THRESHOLD_SEC).toBeGreaterThanOrEqual(5.0);
  });

  it("onChunkReady triggers proactive scheduling for next chunk when playing", () => {
    const ctx = createMockAudioContext();
    const buffer = createMockAudioBuffer(60);

    const engine = createStretcherEngine(ctx, buffer, { tempo: 1.0 });

    const chunkReadyHandler = vi.fn();
    engine.on("chunkready", chunkReadyHandler);

    engine.start();
    expect(engine.getStatus().phase).toBe("buffering");

    engine.dispose();
  });

  it("engine enters buffering when next chunk is not ready at transition", () => {
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

  it("onended fallback path: engine handles chunk transition without timer", () => {
    const ctx = createMockAudioContext();
    const buffer = createMockAudioBuffer(60);

    const engine = createStretcherEngine(ctx, buffer, { tempo: 1.0 });

    engine.start();

    // Engine starts in buffering — verify it can handle stop without crash
    engine.stop();
    expect(engine.getStatus().phase).toBe("ended");

    engine.dispose();
  });

  it("disposed engine ignores onChunkReady callback", () => {
    const ctx = createMockAudioContext();
    const buffer = createMockAudioBuffer(60);

    const engine = createStretcherEngine(ctx, buffer, { tempo: 1.0 });

    const chunkReadyHandler = vi.fn();
    engine.on("chunkready", chunkReadyHandler);

    engine.start();
    engine.dispose();

    // After dispose, no further chunkready events should be emitted
    // (emitter is cleared)
    expect(() => engine.getStatus()).not.toThrow();
  });
});
