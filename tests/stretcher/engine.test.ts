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

vi.stubGlobal("Worker", vi.fn(function MockWorkerCtor(this: typeof mockWorker) {
  Object.assign(this, { ...mockWorker });
}));
const OriginalURL = globalThis.URL;
vi.stubGlobal("URL", Object.assign(
  function MockURL(...args: ConstructorParameters<typeof URL>) { return new OriginalURL(...args); } as unknown as typeof URL,
  { createObjectURL: vi.fn(() => "blob:mock"), revokeObjectURL: vi.fn(), prototype: OriginalURL.prototype, canParse: OriginalURL.canParse },
));
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

  it("setTempo で buffering 中の位置がバッファリング前の位置を返す", () => {
    const ctx = createMockAudioContext();
    const buffer = createMockAudioBuffer(60);

    const engine = createStretcherEngine(ctx, buffer, { tempo: 1.0 });
    engine.start();

    // start() 直後は buffering 状態で、位置は offset(=0)
    expect(engine.getStatus().phase).toBe("buffering");
    const posBeforeTempo = engine.getCurrentPosition();

    // tempo 変更 → buffering に再入
    engine.setTempo(2.0);

    expect(engine.getStatus().phase).toBe("buffering");
    // バッファリング中の位置は tempo 変更前に保存した位置と同じ
    expect(engine.getCurrentPosition()).toBe(posBeforeTempo);

    engine.dispose();
  });

  it("seek でバッファリングに入った場合、位置が seek 先の位置を返す", () => {
    const ctx = createMockAudioContext();
    const buffer = createMockAudioBuffer(60);

    const engine = createStretcherEngine(ctx, buffer, { tempo: 1.0 });
    engine.start();

    // seek to 30 seconds — chunk は未変換なので buffering に入る
    engine.seek(30);

    expect(engine.getStatus().phase).toBe("buffering");
    // バッファリング中の位置は seek 先の位置を返す
    expect(engine.getCurrentPosition()).toBe(30);

    engine.dispose();
  });

  it("ended 状態で setTempo を呼んでもテンポが変わらない", () => {
    const ctx = createMockAudioContext();
    const buffer = createMockAudioBuffer(60);

    const engine = createStretcherEngine(ctx, buffer, { tempo: 1.0 });
    engine.start();
    engine.stop(); // → ended

    expect(engine.getStatus().phase).toBe("ended");

    engine.setTempo(2.0);

    // テンポは変わらない
    expect(engine.getStatus().playback.tempo).toBe(1.0);

    engine.dispose();
  });

  it("連続テンポ変更で位置が保持される", () => {
    const ctx = createMockAudioContext();
    const buffer = createMockAudioBuffer(60);

    const engine = createStretcherEngine(ctx, buffer, { tempo: 1.0 });
    engine.start();

    // buffering 中の初期位置
    const posInitial = engine.getCurrentPosition();

    // 連続テンポ変更
    engine.setTempo(1.5);
    const posAfterFirst = engine.getCurrentPosition();
    expect(posAfterFirst).toBe(posInitial);

    engine.setTempo(2.0);
    const posAfterSecond = engine.getCurrentPosition();
    expect(posAfterSecond).toBe(posInitial);

    // テンポは最後に設定した値
    expect(engine.getStatus().playback.tempo).toBe(2.0);

    engine.dispose();
  });

  it("setTempo 後 buffering 復帰で再生可能な状態になる", () => {
    const ctx = createMockAudioContext();
    const buffer = createMockAudioBuffer(60);

    const engine = createStretcherEngine(ctx, buffer, { tempo: 1.0 });
    engine.start();

    expect(engine.getStatus().phase).toBe("buffering");

    // テンポ変更 → buffering に再入
    engine.setTempo(2.0);
    expect(engine.getStatus().phase).toBe("buffering");
    expect(engine.getStatus().playback.tempo).toBe(2.0);

    // 位置が保持されていること
    expect(engine.getCurrentPosition()).toBe(0);

    engine.dispose();
  });

  it("pause/resume で位置がスキップしない", () => {
    const ctx = createMockAudioContext();
    const buffer = createMockAudioBuffer(60);

    const engine = createStretcherEngine(ctx, buffer, { tempo: 1.0 });
    engine.start();

    // buffering 中に pause
    engine.pause();
    expect(engine.getStatus().phase).toBe("paused");

    const posAtPause = engine.getCurrentPosition();

    // resume
    engine.resume();

    // resume 後の位置が pause 時と同じであること
    expect(engine.getCurrentPosition()).toBe(posAtPause);

    engine.dispose();
  });

  it("複数回 pause/resume で位置ドリフトが蓄積しない", () => {
    const ctx = createMockAudioContext();
    const buffer = createMockAudioBuffer(60);

    const engine = createStretcherEngine(ctx, buffer, { tempo: 1.0 });
    engine.start();

    const posInitial = engine.getCurrentPosition();

    // 複数回 pause/resume
    for (let i = 0; i < 5; i++) {
      engine.pause();
      engine.resume();
    }

    // 位置が初期値と変わらない（chunk が ready でないため buffering に入る）
    expect(engine.getCurrentPosition()).toBe(posInitial);

    engine.dispose();
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
