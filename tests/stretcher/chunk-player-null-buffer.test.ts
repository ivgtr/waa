import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createChunkPlayer } from "../../src/stretcher/chunk-player";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MockSource = {
  buffer: unknown;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
};

let ctxTime: number;
let bufferSourceInstances: MockSource[];

function createMockAudioContext(): AudioContext {
  ctxTime = 100;
  bufferSourceInstances = [];
  return {
    get currentTime() {
      return ctxTime;
    },
    destination: {} as AudioDestinationNode,
    createBufferSource: vi.fn(() => {
      const src: MockSource = {
        buffer: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
      };
      bufferSourceInstances.push(src);
      return src;
    }),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createChunkPlayer — handleCurrentSourceEnded null buffer guard", () => {
  let ctx: AudioContext;

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = createMockAudioContext();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("nextSource.buffer が null → onChunkEnded が呼ばれ doTransition は実行されない", () => {
    const player = createChunkPlayer(ctx, {
      destination: ctx.destination,
      crossfadeSec: 0,
    });

    const onChunkEnded = vi.fn();
    const onTransition = vi.fn();
    player.setOnChunkEnded(onChunkEnded);
    player.setOnTransition(onTransition);

    const buf = createMockBuffer(8);
    const nextBuf = createMockBuffer(8);

    // Play first chunk
    player.playChunk(buf, ctx.currentTime, 0);

    // Save current source's onended before scheduleNext overwrites it
    // playChunk creates source at index 0 (+ gain)
    // The current source is bufferSourceInstances[0]
    const currentSourceOnended = bufferSourceInstances[0]!.onended;

    // Schedule next chunk
    ctxTime = 107;
    player.scheduleNext(nextBuf, 108);

    // The next source is the last created buffer source
    const nextSourceInstance = bufferSourceInstances[bufferSourceInstances.length - 1]!;

    // Manually set nextSource.buffer to null to simulate race condition
    nextSourceInstance.buffer = null;

    // Trigger current source's onended → handleCurrentSourceEnded
    currentSourceOnended!();

    expect(onChunkEnded).toHaveBeenCalledTimes(1);
    expect(onTransition).not.toHaveBeenCalled();

    player.dispose();
  });

  it("nextSource.buffer が有効 → doTransition が呼ばれ遷移する（回帰テスト）", () => {
    const player = createChunkPlayer(ctx, {
      destination: ctx.destination,
      crossfadeSec: 0,
    });

    const onChunkEnded = vi.fn();
    const onTransition = vi.fn();
    player.setOnChunkEnded(onChunkEnded);
    player.setOnTransition(onTransition);

    const buf = createMockBuffer(8);
    const nextBuf = createMockBuffer(8);

    player.playChunk(buf, ctx.currentTime, 0);
    const currentSourceOnended = bufferSourceInstances[0]!.onended;

    ctxTime = 107;
    player.scheduleNext(nextBuf, 108);

    // buffer is valid (not null) — normal gapless transition
    currentSourceOnended!();

    expect(onTransition).toHaveBeenCalledTimes(1);
    expect(onChunkEnded).not.toHaveBeenCalled();

    player.dispose();
  });

  it("nextSource が存在しない → onChunkEnded が呼ばれる（回帰テスト）", () => {
    const player = createChunkPlayer(ctx, {
      destination: ctx.destination,
      crossfadeSec: 0,
    });

    const onChunkEnded = vi.fn();
    const onTransition = vi.fn();
    player.setOnChunkEnded(onChunkEnded);
    player.setOnTransition(onTransition);

    const buf = createMockBuffer(8);
    player.playChunk(buf, ctx.currentTime, 0);

    // No scheduleNext → onended should call onChunkEnded
    const currentSourceOnended = bufferSourceInstances[0]!.onended;
    currentSourceOnended!();

    expect(onChunkEnded).toHaveBeenCalledTimes(1);
    expect(onTransition).not.toHaveBeenCalled();

    player.dispose();
  });

  it("disposed 状態では何も起きない", () => {
    const player = createChunkPlayer(ctx, {
      destination: ctx.destination,
      crossfadeSec: 0,
    });

    const onChunkEnded = vi.fn();
    const onTransition = vi.fn();
    player.setOnChunkEnded(onChunkEnded);
    player.setOnTransition(onTransition);

    const buf = createMockBuffer(8);
    const nextBuf = createMockBuffer(8);

    player.playChunk(buf, ctx.currentTime, 0);
    const currentSourceOnended = bufferSourceInstances[0]!.onended;

    ctxTime = 107;
    player.scheduleNext(nextBuf, 108);

    // Set buffer to null and save onended reference before dispose
    bufferSourceInstances[bufferSourceInstances.length - 1]!.buffer = null;
    const savedOnended = currentSourceOnended;

    player.dispose();

    // Invoke saved onended after dispose
    savedOnended!();

    expect(onChunkEnded).not.toHaveBeenCalled();
    expect(onTransition).not.toHaveBeenCalled();
  });

  it("paused 状態では何も起きない", () => {
    const player = createChunkPlayer(ctx, {
      destination: ctx.destination,
      crossfadeSec: 0,
    });

    const onChunkEnded = vi.fn();
    const onTransition = vi.fn();
    player.setOnChunkEnded(onChunkEnded);
    player.setOnTransition(onTransition);

    const buf = createMockBuffer(8);
    const nextBuf = createMockBuffer(8);

    player.playChunk(buf, ctx.currentTime, 0);

    // Save onended reference before scheduleNext
    const savedOnended = bufferSourceInstances[0]!.onended;

    ctxTime = 107;
    player.scheduleNext(nextBuf, 108);

    // Set buffer to null
    bufferSourceInstances[bufferSourceInstances.length - 1]!.buffer = null;

    // Pause (which sets onended=null internally, but we have saved reference)
    player.pause();

    savedOnended!();

    expect(onChunkEnded).not.toHaveBeenCalled();
    expect(onTransition).not.toHaveBeenCalled();
  });

  it("stopped 状態では何も起きない", () => {
    const player = createChunkPlayer(ctx, {
      destination: ctx.destination,
      crossfadeSec: 0,
    });

    const onChunkEnded = vi.fn();
    const onTransition = vi.fn();
    player.setOnChunkEnded(onChunkEnded);
    player.setOnTransition(onTransition);

    const buf = createMockBuffer(8);
    const nextBuf = createMockBuffer(8);

    player.playChunk(buf, ctx.currentTime, 0);

    // Save onended reference before scheduleNext
    const savedOnended = bufferSourceInstances[0]!.onended;

    ctxTime = 107;
    player.scheduleNext(nextBuf, 108);

    // Set buffer to null
    bufferSourceInstances[bufferSourceInstances.length - 1]!.buffer = null;

    // Stop (which sets onended=null internally, but we have saved reference)
    player.stop();

    savedOnended!();

    expect(onChunkEnded).not.toHaveBeenCalled();
    expect(onTransition).not.toHaveBeenCalled();
  });
});
