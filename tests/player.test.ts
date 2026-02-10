import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mock all delegated modules ---

vi.mock("../src/context.js", () => ({
  createContext: vi.fn(() => mockAudioContext()),
  resumeContext: vi.fn(async () => {}),
  ensureRunning: vi.fn(async () => {}),
  now: vi.fn(() => 1.5),
}));

vi.mock("../src/buffer.js", () => ({
  loadBuffer: vi.fn(async () => ({})),
  loadBufferFromBlob: vi.fn(async () => ({})),
  loadBuffers: vi.fn(async () => new Map()),
  getBufferInfo: vi.fn(() => ({
    duration: 1,
    numberOfChannels: 2,
    sampleRate: 44100,
    length: 44100,
  })),
}));

vi.mock("../src/play.js", () => ({
  play: vi.fn(() => ({ getState: () => "playing" })),
}));

vi.mock("../src/nodes.js", () => ({
  createGain: vi.fn(() => ({ gain: { value: 1 } })),
  rampGain: vi.fn(),
  createAnalyser: vi.fn(() => ({})),
  getFrequencyData: vi.fn(() => new Float32Array()),
  getFrequencyDataByte: vi.fn(() => new Uint8Array()),
  createFilter: vi.fn(() => ({})),
  createPanner: vi.fn(() => ({})),
  createCompressor: vi.fn(() => ({})),
  chain: vi.fn(),
  disconnectChain: vi.fn(),
}));

vi.mock("../src/waveform.js", () => ({
  extractPeaks: vi.fn(() => [0, 0.5, 1]),
  extractPeakPairs: vi.fn(() => [{ min: -1, max: 1 }]),
  extractRMS: vi.fn(() => [0.5]),
}));

vi.mock("../src/fade.js", () => ({
  fadeIn: vi.fn(),
  fadeOut: vi.fn(),
  crossfade: vi.fn(),
  autoFade: vi.fn(() => () => {}),
}));

vi.mock("../src/scheduler.js", () => ({
  createScheduler: vi.fn(() => ({ schedule: vi.fn() })),
  createClock: vi.fn(() => ({ getBpm: () => 120 })),
}));

vi.mock("../src/synth.js", () => ({
  createSineBuffer: vi.fn(() => ({})),
  createNoiseBuffer: vi.fn(() => ({})),
  createClickBuffer: vi.fn(() => ({})),
}));

vi.mock("../src/adapters.js", () => ({
  getSnapshot: vi.fn(() => ({
    state: "playing",
    position: 0,
    duration: 1,
    progress: 0,
  })),
  subscribeSnapshot: vi.fn(() => () => {}),
  onFrame: vi.fn(() => () => {}),
  whenEnded: vi.fn(async () => {}),
  whenPosition: vi.fn(async () => {}),
}));

// --- Helpers ---

function mockAudioContext() {
  return {
    createGain: () => ({ gain: { value: 1 } }),
    currentTime: 0,
    sampleRate: 44100,
    state: "running",
    destination: {},
    close: vi.fn(),
    resume: vi.fn(),
  } as unknown as AudioContext;
}

// --- Import after mocks ---

import * as adaptersMod from "../src/adapters.js";
import * as bufferMod from "../src/buffer.js";
import * as contextMod from "../src/context.js";
import * as fadeMod from "../src/fade.js";
import * as nodesMod from "../src/nodes.js";
import * as playMod from "../src/play.js";
import { WaaPlayer } from "../src/player.js";
import * as schedulerMod from "../src/scheduler.js";
import * as synthMod from "../src/synth.js";
import * as waveformMod from "../src/waveform.js";

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe("WaaPlayer constructor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates internal AudioContext when no argument is given", () => {
    const player = new WaaPlayer();
    expect(contextMod.createContext).toHaveBeenCalledWith(undefined);
    expect(player.ctx).toBeDefined();
  });

  it("creates internal AudioContext with options", () => {
    const opts = { sampleRate: 48000 };
    const player = new WaaPlayer(opts);
    expect(contextMod.createContext).toHaveBeenCalledWith(opts);
    expect(player.ctx).toBeDefined();
  });

  it("uses provided AudioContext (duck-typed)", () => {
    const externalCtx = mockAudioContext();
    const player = new WaaPlayer(externalCtx);
    expect(contextMod.createContext).not.toHaveBeenCalled();
    expect(player.ctx).toBe(externalCtx);
  });
});

// ---------------------------------------------------------------------------
// dispose
// ---------------------------------------------------------------------------

describe("WaaPlayer.dispose", () => {
  beforeEach(() => vi.clearAllMocks());

  it("closes context when ownsContext is true", () => {
    const player = new WaaPlayer();
    const closeSpy = vi.spyOn(player.ctx, "close");
    player.dispose();
    expect(closeSpy).toHaveBeenCalled();
  });

  it("does NOT close context when ownsContext is false", () => {
    const externalCtx = mockAudioContext();
    const player = new WaaPlayer(externalCtx);
    player.dispose();
    expect(externalCtx.close).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Context methods
// ---------------------------------------------------------------------------

describe("Context delegation", () => {
  let player: WaaPlayer;
  beforeEach(() => {
    vi.clearAllMocks();
    player = new WaaPlayer(mockAudioContext());
  });

  it("resume() delegates to resumeContext", async () => {
    await player.resume();
    expect(contextMod.resumeContext).toHaveBeenCalledWith(player.ctx);
  });

  it("ensureRunning() delegates to ensureRunning", async () => {
    await player.ensureRunning();
    expect(contextMod.ensureRunning).toHaveBeenCalledWith(player.ctx);
  });

  it("now() delegates to now", () => {
    const result = player.now();
    expect(contextMod.now).toHaveBeenCalledWith(player.ctx);
    expect(result).toBe(1.5);
  });
});

// ---------------------------------------------------------------------------
// Buffer methods
// ---------------------------------------------------------------------------

describe("Buffer delegation", () => {
  let player: WaaPlayer;
  beforeEach(() => {
    vi.clearAllMocks();
    player = new WaaPlayer(mockAudioContext());
  });

  it("load() delegates to loadBuffer with ctx", async () => {
    const opts = { onProgress: vi.fn() };
    await player.load("test.mp3", opts);
    expect(bufferMod.loadBuffer).toHaveBeenCalledWith(player.ctx, "test.mp3", opts);
  });

  it("loadFromBlob() delegates to loadBufferFromBlob", async () => {
    const blob = {} as Blob;
    await player.loadFromBlob(blob);
    expect(bufferMod.loadBufferFromBlob).toHaveBeenCalledWith(player.ctx, blob);
  });

  it("loadAll() delegates to loadBuffers", async () => {
    const map = { kick: "kick.mp3" };
    await player.loadAll(map);
    expect(bufferMod.loadBuffers).toHaveBeenCalledWith(player.ctx, map);
  });

  it("getBufferInfo() delegates (no ctx)", () => {
    const buf = {} as AudioBuffer;
    player.getBufferInfo(buf);
    expect(bufferMod.getBufferInfo).toHaveBeenCalledWith(buf);
  });
});

// ---------------------------------------------------------------------------
// Play method
// ---------------------------------------------------------------------------

describe("Play delegation", () => {
  let player: WaaPlayer;
  beforeEach(() => {
    vi.clearAllMocks();
    player = new WaaPlayer(mockAudioContext());
  });

  it("play() delegates to play with ctx", () => {
    const buf = {} as AudioBuffer;
    const opts = { offset: 1 };
    player.play(buf, opts);
    expect(playMod.play).toHaveBeenCalledWith(player.ctx, buf, opts);
  });
});

// ---------------------------------------------------------------------------
// Nodes methods
// ---------------------------------------------------------------------------

describe("Nodes delegation", () => {
  let player: WaaPlayer;
  beforeEach(() => {
    vi.clearAllMocks();
    player = new WaaPlayer(mockAudioContext());
  });

  it("createGain() injects ctx", () => {
    player.createGain(0.5);
    expect(nodesMod.createGain).toHaveBeenCalledWith(player.ctx, 0.5);
  });

  it("createAnalyser() injects ctx", () => {
    const opts = { fftSize: 2048 };
    player.createAnalyser(opts);
    expect(nodesMod.createAnalyser).toHaveBeenCalledWith(player.ctx, opts);
  });

  it("createFilter() injects ctx", () => {
    const opts = { type: "lowpass" as BiquadFilterType };
    player.createFilter(opts);
    expect(nodesMod.createFilter).toHaveBeenCalledWith(player.ctx, opts);
  });

  it("createPanner() injects ctx", () => {
    player.createPanner(-1);
    expect(nodesMod.createPanner).toHaveBeenCalledWith(player.ctx, -1);
  });

  it("createCompressor() injects ctx", () => {
    const opts = { threshold: -24 };
    player.createCompressor(opts);
    expect(nodesMod.createCompressor).toHaveBeenCalledWith(player.ctx, opts);
  });

  it("rampGain() passes through (no ctx)", () => {
    const gain = {} as GainNode;
    player.rampGain(gain, 0.8, 0.5);
    expect(nodesMod.rampGain).toHaveBeenCalledWith(gain, 0.8, 0.5);
  });

  it("getFrequencyData() passes through", () => {
    const analyser = {} as AnalyserNode;
    player.getFrequencyData(analyser);
    expect(nodesMod.getFrequencyData).toHaveBeenCalledWith(analyser);
  });

  it("getFrequencyDataByte() passes through", () => {
    const analyser = {} as AnalyserNode;
    player.getFrequencyDataByte(analyser);
    expect(nodesMod.getFrequencyDataByte).toHaveBeenCalledWith(analyser);
  });

  it("chain() passes through", () => {
    const a = {} as AudioNode;
    const b = {} as AudioNode;
    player.chain(a, b);
    expect(nodesMod.chain).toHaveBeenCalledWith(a, b);
  });

  it("disconnectChain() passes through", () => {
    const a = {} as AudioNode;
    const b = {} as AudioNode;
    player.disconnectChain(a, b);
    expect(nodesMod.disconnectChain).toHaveBeenCalledWith(a, b);
  });
});

// ---------------------------------------------------------------------------
// Waveform methods
// ---------------------------------------------------------------------------

describe("Waveform delegation", () => {
  let player: WaaPlayer;
  beforeEach(() => {
    vi.clearAllMocks();
    player = new WaaPlayer(mockAudioContext());
  });

  it("extractPeaks()", () => {
    const buf = {} as AudioBuffer;
    const opts = { resolution: 100 };
    player.extractPeaks(buf, opts);
    expect(waveformMod.extractPeaks).toHaveBeenCalledWith(buf, opts);
  });

  it("extractPeakPairs()", () => {
    const buf = {} as AudioBuffer;
    player.extractPeakPairs(buf);
    expect(waveformMod.extractPeakPairs).toHaveBeenCalledWith(buf, undefined);
  });

  it("extractRMS()", () => {
    const buf = {} as AudioBuffer;
    player.extractRMS(buf, { channel: 1 });
    expect(waveformMod.extractRMS).toHaveBeenCalledWith(buf, { channel: 1 });
  });
});

// ---------------------------------------------------------------------------
// Fade methods
// ---------------------------------------------------------------------------

describe("Fade delegation", () => {
  let player: WaaPlayer;
  beforeEach(() => {
    vi.clearAllMocks();
    player = new WaaPlayer(mockAudioContext());
  });

  it("fadeIn()", () => {
    const gain = {} as GainNode;
    player.fadeIn(gain, 1, { duration: 0.5 });
    expect(fadeMod.fadeIn).toHaveBeenCalledWith(gain, 1, { duration: 0.5 });
  });

  it("fadeOut()", () => {
    const gain = {} as GainNode;
    player.fadeOut(gain, { duration: 0.3 });
    expect(fadeMod.fadeOut).toHaveBeenCalledWith(gain, { duration: 0.3 });
  });

  it("crossfade()", () => {
    const gA = {} as GainNode;
    const gB = {} as GainNode;
    player.crossfade(gA, gB, { duration: 1 });
    expect(fadeMod.crossfade).toHaveBeenCalledWith(gA, gB, { duration: 1 });
  });

  it("autoFade()", () => {
    const pb = {} as unknown as import("../src/types.js").Playback;
    const gain = {} as GainNode;
    const opts = { fadeIn: 0.5, fadeOut: 1 };
    const unsub = player.autoFade(pb, gain, opts);
    expect(fadeMod.autoFade).toHaveBeenCalledWith(pb, gain, opts);
    expect(typeof unsub).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Scheduler methods
// ---------------------------------------------------------------------------

describe("Scheduler delegation", () => {
  let player: WaaPlayer;
  beforeEach(() => {
    vi.clearAllMocks();
    player = new WaaPlayer(mockAudioContext());
  });

  it("createScheduler() injects ctx", () => {
    const opts = { lookahead: 0.2 };
    player.createScheduler(opts);
    expect(schedulerMod.createScheduler).toHaveBeenCalledWith(player.ctx, opts);
  });

  it("createClock() injects ctx", () => {
    const opts = { bpm: 140 };
    player.createClock(opts);
    expect(schedulerMod.createClock).toHaveBeenCalledWith(player.ctx, opts);
  });
});

// ---------------------------------------------------------------------------
// Synth methods
// ---------------------------------------------------------------------------

describe("Synth delegation", () => {
  let player: WaaPlayer;
  beforeEach(() => {
    vi.clearAllMocks();
    player = new WaaPlayer(mockAudioContext());
  });

  it("createSineBuffer() injects ctx", () => {
    player.createSineBuffer(440, 1);
    expect(synthMod.createSineBuffer).toHaveBeenCalledWith(player.ctx, 440, 1);
  });

  it("createNoiseBuffer() injects ctx", () => {
    player.createNoiseBuffer(2);
    expect(synthMod.createNoiseBuffer).toHaveBeenCalledWith(player.ctx, 2);
  });

  it("createClickBuffer() injects ctx", () => {
    player.createClickBuffer(1000, 0.01);
    expect(synthMod.createClickBuffer).toHaveBeenCalledWith(player.ctx, 1000, 0.01);
  });
});

// ---------------------------------------------------------------------------
// Adapters methods
// ---------------------------------------------------------------------------

describe("Adapters delegation", () => {
  let player: WaaPlayer;
  beforeEach(() => {
    vi.clearAllMocks();
    player = new WaaPlayer(mockAudioContext());
  });

  it("getSnapshot()", () => {
    const pb = {} as unknown as import("../src/types.js").Playback;
    player.getSnapshot(pb);
    expect(adaptersMod.getSnapshot).toHaveBeenCalledWith(pb);
  });

  it("subscribeSnapshot()", () => {
    const pb = {} as unknown as import("../src/types.js").Playback;
    const cb = vi.fn();
    const unsub = player.subscribeSnapshot(pb, cb);
    expect(adaptersMod.subscribeSnapshot).toHaveBeenCalledWith(pb, cb);
    expect(typeof unsub).toBe("function");
  });

  it("onFrame()", () => {
    const pb = {} as unknown as import("../src/types.js").Playback;
    const cb = vi.fn();
    const unsub = player.onFrame(pb, cb);
    expect(adaptersMod.onFrame).toHaveBeenCalledWith(pb, cb);
    expect(typeof unsub).toBe("function");
  });

  it("whenEnded()", async () => {
    const pb = {} as unknown as import("../src/types.js").Playback;
    await player.whenEnded(pb);
    expect(adaptersMod.whenEnded).toHaveBeenCalledWith(pb);
  });

  it("whenPosition()", async () => {
    const pb = {} as unknown as import("../src/types.js").Playback;
    await player.whenPosition(pb, 5.0);
    expect(adaptersMod.whenPosition).toHaveBeenCalledWith(pb, 5.0);
  });
});
