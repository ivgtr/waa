import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChunkPlayer } from "../../src/stretcher/chunk-player";

describe("createChunkPlayer – pause/resume 位置", () => {
  let ctx: AudioContext;
  let ctxTime: number;

  function createMockAudioContext(): AudioContext {
    ctxTime = 100;
    return {
      get currentTime() {
        return ctxTime;
      },
      destination: {} as AudioDestinationNode,
      createBufferSource: vi.fn(() => ({
        buffer: null,
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
    ctx = createMockAudioContext();
  });

  it("pause 中の getCurrentPosition は凍結された値を返す", () => {
    const player = createChunkPlayer(ctx, {
      destination: ctx.destination,
      crossfadeSec: 0,
    });

    const buf = createMockBuffer(10);
    player.playChunk(buf, ctx.currentTime, 0);

    // 再生開始: ctxTime=100, playStartCtxTime=100
    // 5秒後にpause
    ctxTime = 105;
    player.pause();

    expect(player.getCurrentPosition()).toBe(5);

    // さらに5秒経過しても位置は凍結されたまま
    ctxTime = 110;
    expect(player.getCurrentPosition()).toBe(5);

    player.dispose();
  });

  it("resume 後も getCurrentPosition は pause 時の値を維持する（playChunk 前まで）", () => {
    const player = createChunkPlayer(ctx, {
      destination: ctx.destination,
      crossfadeSec: 0,
    });

    const buf = createMockBuffer(10);
    player.playChunk(buf, ctx.currentTime, 0);

    // 5秒再生してpause
    ctxTime = 105;
    player.pause();
    expect(player.getCurrentPosition()).toBe(5);

    // 5秒経過後にresume
    ctxTime = 110;
    player.resume();

    // resume() は paused フラグを変えない（playChunk が変える）
    // よって getCurrentPosition は凍結値のまま
    expect(player.getCurrentPosition()).toBe(5);

    player.dispose();
  });

  it("複数回 pause/resume で位置ドリフトが蓄積しない", () => {
    const player = createChunkPlayer(ctx, {
      destination: ctx.destination,
      crossfadeSec: 0,
    });

    const buf = createMockBuffer(30);

    // 1回目の再生: offset=0, 3秒再生
    player.playChunk(buf, ctx.currentTime, 0);
    ctxTime = 103;
    player.pause();
    expect(player.getCurrentPosition()).toBe(3);

    // 10秒経過
    ctxTime = 113;
    player.resume();
    // resume 後も 3 のまま
    expect(player.getCurrentPosition()).toBe(3);

    // engine が playChunk(buf, ..., 3) を呼ぶシミュレーション
    player.playChunk(buf, ctx.currentTime, 3);
    // playChunk 直後は offset=3, elapsed=0 → position=3
    expect(player.getCurrentPosition()).toBe(3);

    // 2秒再生
    ctxTime = 115;
    expect(player.getCurrentPosition()).toBe(5);

    // 2回目のpause
    player.pause();
    expect(player.getCurrentPosition()).toBe(5);

    // 20秒経過
    ctxTime = 135;
    player.resume();
    expect(player.getCurrentPosition()).toBe(5);

    // engine が playChunk(buf, ..., 5) を呼ぶシミュレーション
    player.playChunk(buf, ctx.currentTime, 5);
    expect(player.getCurrentPosition()).toBe(5);

    // 1秒再生
    ctxTime = 136;
    expect(player.getCurrentPosition()).toBe(6);

    player.dispose();
  });
});
