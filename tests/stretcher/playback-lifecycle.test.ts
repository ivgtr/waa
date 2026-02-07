import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Enhanced mocks: capture individual Worker and AudioBufferSourceNode instances
// ---------------------------------------------------------------------------

const workerInstances: Array<{
  postMessage: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}> = [];

const bufferSourceInstances: Array<{
  buffer: unknown;
  playbackRate: { value: number };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
}> = [];

vi.stubGlobal(
  "Worker",
  vi.fn(() => {
    const worker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      onmessage: null as ((e: MessageEvent) => void) | null,
      onerror: null as ((e: ErrorEvent) => void) | null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    workerInstances.push(worker);
    return worker;
  }),
);
vi.stubGlobal("URL", {
  createObjectURL: vi.fn(() => "blob:mock"),
  revokeObjectURL: vi.fn(),
});
vi.stubGlobal("Blob", vi.fn());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockAudioContext() {
  return {
    currentTime: 0,
    sampleRate: 44100,
    destination: {} as AudioDestinationNode,
    createBufferSource: vi.fn(() => {
      const src = {
        buffer: null as unknown,
        playbackRate: { value: 1 },
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null as (() => void) | null,
      };
      bufferSourceInstances.push(src);
      return src;
    }),
    createGain: vi.fn(() => ({
      gain: {
        value: 1,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createBuffer: vi.fn(
      (channels: number, length: number, sampleRate: number) => {
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
      },
    ),
  } as unknown as AudioContext;
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

/**
 * Simulate a Worker result for a specific chunk on the given worker.
 */
function simulateWorkerResult(
  workerIndex: number,
  chunkIndex: number,
  outputLength: number,
) {
  const worker = workerInstances[workerIndex];
  if (!worker?.onmessage) {
    throw new Error(`Worker ${workerIndex} has no onmessage handler`);
  }
  worker.onmessage({
    data: {
      type: "result",
      chunkIndex,
      outputData: [new Float32Array(outputLength)],
      outputLength,
    },
  } as MessageEvent);
}

/**
 * Find the last buffer source that has an active onended callback.
 */
function findActiveSource() {
  for (let i = bufferSourceInstances.length - 1; i >= 0; i--) {
    if (bufferSourceInstances[i]!.onended !== null) {
      return bufferSourceInstances[i]!;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("playback lifecycle (chunk progression)", () => {
  let createStretcherEngine: (typeof import("../../src/stretcher/engine"))["createStretcherEngine"];

  beforeEach(async () => {
    vi.useFakeTimers();
    workerInstances.length = 0;
    bufferSourceInstances.length = 0;
    vi.clearAllMocks();
    const mod = await import("../../src/stretcher/engine");
    createStretcherEngine = mod.createStretcherEngine;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // 15s audio, sampleRate=44100 → 3 chunks (CHUNK_DURATION_SEC=5)
  // Chunk 0: inputStart=0, inputEnd=229320, overlap=(0,8820)  → nominal 0–220500
  // Chunk 1: inputStart=211680, inputEnd=449820, overlap=(8820,8820) → nominal 220500–441000
  // Chunk 2: inputStart=432180, inputEnd=661500, overlap=(8820,0)  → nominal 441000–661500

  const CHUNK0_OUTPUT = 220500; // ~5.0s — tempo=1.0 output ≈ input nominal length
  const CHUNK1_OUTPUT = 238140; // ~5.4s — includes both overlaps
  const CHUNK2_OUTPUT = 229320; // ~5.2s — includes overlap before only

  it("直接パス: chunk 0 → onended → chunk 1 へ正常に進む", () => {
    const ctx = createMockAudioContext();
    const buffer = createMockAudioBuffer(15);
    const engine = createStretcherEngine(ctx, buffer, { tempo: 1.0 });

    engine.start();
    expect(engine.getStatus().phase).toBe("buffering");

    // Worker 0 → chunk 0 ready
    simulateWorkerResult(0, 0, CHUNK0_OUTPUT);
    // Worker 1 → chunk 1 ready
    simulateWorkerResult(1, 1, CHUNK1_OUTPUT);

    expect(engine.getStatus().phase).toBe("playing");

    // playCurrentChunk で chunk 0 を再生中
    // createBuffer の最後の呼び出しが chunk 0 の長さであることを確認
    const createBufferMock = (ctx as any).createBuffer;
    const callsAfterPlay = createBufferMock.mock.calls;
    const lastLen = callsAfterPlay[callsAfterPlay.length - 1][1];
    expect(lastLen).toBe(CHUNK0_OUTPUT);

    // onended を直接トリガー（lookahead なし）
    const src = findActiveSource();
    expect(src).not.toBeNull();
    src!.onended!();

    // chunk 1 が再生されるはず
    const latestLen =
      createBufferMock.mock.calls[createBufferMock.mock.calls.length - 1][1];
    expect(latestLen).toBe(CHUNK1_OUTPUT);
    expect(engine.getStatus().phase).toBe("playing");

    engine.dispose();
  });

  it("scheduleNext パス: lookahead → scheduleNext(chunk 1) → transition 後に chunk 2 へ進む", () => {
    const ctx = createMockAudioContext();
    const buffer = createMockAudioBuffer(15);
    const engine = createStretcherEngine(ctx, buffer, { tempo: 1.0 });

    engine.start();

    // 全3チャンク ready にする
    simulateWorkerResult(0, 0, CHUNK0_OUTPUT);
    simulateWorkerResult(1, 1, CHUNK1_OUTPUT);
    expect(engine.getStatus().phase).toBe("playing");

    // Worker 0 はチャンク 0 完了後にチャンク 2 を受け取る
    simulateWorkerResult(0, 2, CHUNK2_OUTPUT);

    const createBufferMock = (ctx as any).createBuffer;
    const callsBefore = createBufferMock.mock.calls.length;

    // --- Lookahead トリガー ---
    // chunk 0 の再生 duration ≈ 5.0s, remaining <= 0.5s で onNeedNext 発火
    (ctx as any).currentTime = 4.6;
    vi.advanceTimersByTime(200); // LOOKAHEAD_INTERVAL_MS

    // scheduleNext で chunk 1 の AudioBuffer が作られるはず
    const callsAfterLookahead = createBufferMock.mock.calls.length;
    expect(callsAfterLookahead).toBeGreaterThan(callsBefore);
    // scheduleNext で作られた buffer は chunk 1 の長さ
    const scheduledLen =
      createBufferMock.mock.calls[callsAfterLookahead - 1][1];
    expect(scheduledLen).toBe(CHUNK1_OUTPUT);

    // --- Transition setTimeout 発火 ---
    // scheduleNext 内 transitionDelay = 0.3 * 1000 + 50 = 350ms
    (ctx as any).currentTime = 5.0;
    vi.advanceTimersByTime(400);

    // Transition 後: chunk 0 source は stopped (onended=null), chunk 1 source が current
    const activeAfterTransition = findActiveSource();
    expect(activeAfterTransition).not.toBeNull();

    // --- Chunk 1 終了をシミュレート ---
    const callsBeforeEnded = createBufferMock.mock.calls.length;
    activeAfterTransition!.onended!();

    // KEY ASSERTION:
    // 次に createBuffer される buffer は chunk 2 (229320) であるべき
    // バグがある場合: chunk 1 (238140) が再度作られる（二重再生）
    const newCalls = createBufferMock.mock.calls.slice(callsBeforeEnded);
    expect(newCalls.length).toBeGreaterThan(0);
    const nextChunkLen = newCalls[0][1];
    expect(nextChunkLen).toBe(CHUNK2_OUTPUT); // 229320, NOT 238140

    engine.dispose();
  });

  it("scheduleNext パスで currentChunkIndex が正しく更新される", () => {
    const ctx = createMockAudioContext();
    const buffer = createMockAudioBuffer(15);
    const engine = createStretcherEngine(ctx, buffer, { tempo: 1.0 });

    engine.start();

    simulateWorkerResult(0, 0, CHUNK0_OUTPUT);
    simulateWorkerResult(1, 1, CHUNK1_OUTPUT);
    simulateWorkerResult(0, 2, CHUNK2_OUTPUT);

    expect(engine.getStatus().phase).toBe("playing");

    // Lookahead → scheduleNext(chunk 1)
    (ctx as any).currentTime = 4.6;
    vi.advanceTimersByTime(200);

    // Transition
    (ctx as any).currentTime = 5.0;
    vi.advanceTimersByTime(400);

    // Chunk 1 ended
    const active = findActiveSource();
    active!.onended!();

    // Position は chunk 2 の先頭 (≈10 sec) であるべき
    // バグがあると chunk 1 の先頭 (≈5 sec) を指す
    (ctx as any).currentTime = 5.1; // 少し進める
    const pos = engine.getCurrentPosition();

    // chunk 2 の nominal start = 441000 / 44100 = 10.0 sec
    // chunk 1 の nominal start = 220500 / 44100 = 5.0 sec
    expect(pos).toBeGreaterThanOrEqual(9.5);

    engine.dispose();
  });
});
