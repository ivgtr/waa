// ---------------------------------------------------------------------------
// Shared mock helpers for audio tests
// ---------------------------------------------------------------------------

import { vi } from "vitest";

// ---------------------------------------------------------------------------
// AudioBufferSourceNode mock
// ---------------------------------------------------------------------------

export interface MockAudioBufferSourceNode {
  buffer: AudioBuffer | null;
  playbackRate: { value: number };
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
}

// ---------------------------------------------------------------------------
// GainNode mock
// ---------------------------------------------------------------------------

export interface MockGainNode {
  gain: {
    value: number;
    setValueAtTime: ReturnType<typeof vi.fn>;
    linearRampToValueAtTime: ReturnType<typeof vi.fn>;
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
    setValueCurveAtTime: ReturnType<typeof vi.fn>;
    cancelScheduledValues: ReturnType<typeof vi.fn>;
  };
  context: { currentTime: number };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

// ---------------------------------------------------------------------------
// AudioContext mock
// ---------------------------------------------------------------------------

export interface MockAnalyserNode {
  frequencyBinCount: number;
  fftSize: number;
  smoothingTimeConstant: number;
  getFloatFrequencyData: ReturnType<typeof vi.fn>;
  getByteFrequencyData: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

export interface MockBiquadFilterNode {
  type: BiquadFilterType;
  frequency: { value: number };
  Q: { value: number };
  gain: { value: number };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

export interface MockStereoPannerNode {
  pan: { value: number };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

export interface MockDynamicsCompressorNode {
  threshold: { value: number };
  knee: { value: number };
  ratio: { value: number };
  attack: { value: number };
  release: { value: number };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

export interface MockAudioContext extends AudioContext {
  _sources: MockAudioBufferSourceNode[];
  _gains: MockGainNode[];
  _analysers: MockAnalyserNode[];
  _filters: MockBiquadFilterNode[];
  _panners: MockStereoPannerNode[];
  _compressors: MockDynamicsCompressorNode[];
  _setCurrentTime: (t: number) => void;
}

export function createMockAudioContext(
  overrides?: Partial<{ currentTime: number; sampleRate: number }>,
): MockAudioContext {
  let _currentTime = overrides?.currentTime ?? 0;
  let _state: AudioContextState = "running";
  const _sampleRate = overrides?.sampleRate ?? 44100;
  const sources: MockAudioBufferSourceNode[] = [];
  const gains: MockGainNode[] = [];
  const analysers: MockAnalyserNode[] = [];
  const filters: MockBiquadFilterNode[] = [];
  const panners: MockStereoPannerNode[] = [];
  const compressors: MockDynamicsCompressorNode[] = [];

  const ctx = {
    get currentTime() {
      return _currentTime;
    },
    get state() {
      return _state;
    },
    sampleRate: _sampleRate,
    destination: {} as AudioDestinationNode,

    resume: vi.fn(async () => {
      _state = "running";
    }),
    close: vi.fn(async () => {
      _state = "closed";
    }),

    createBufferSource: vi.fn(() => {
      const src: MockAudioBufferSourceNode = {
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
      };
      sources.push(src);
      return src;
    }),

    createGain: vi.fn(() => {
      const gain: MockGainNode = {
        gain: {
          value: 1,
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
          setValueCurveAtTime: vi.fn(),
          cancelScheduledValues: vi.fn(),
        },
        context: { get currentTime() { return _currentTime; } },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      gains.push(gain);
      return gain;
    }),

    createAnalyser: vi.fn(() => {
      const analyser: MockAnalyserNode = {
        frequencyBinCount: 1024,
        fftSize: 2048,
        smoothingTimeConstant: 0.8,
        getFloatFrequencyData: vi.fn(),
        getByteFrequencyData: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      analysers.push(analyser);
      return analyser;
    }),

    createBiquadFilter: vi.fn(() => {
      const filter: MockBiquadFilterNode = {
        type: "lowpass",
        frequency: { value: 350 },
        Q: { value: 1 },
        gain: { value: 0 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      filters.push(filter);
      return filter;
    }),

    createStereoPanner: vi.fn(() => {
      const panner: MockStereoPannerNode = {
        pan: { value: 0 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      panners.push(panner);
      return panner;
    }),

    createDynamicsCompressor: vi.fn(() => {
      const comp: MockDynamicsCompressorNode = {
        threshold: { value: -24 },
        knee: { value: 30 },
        ratio: { value: 12 },
        attack: { value: 0.003 },
        release: { value: 0.25 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      compressors.push(comp);
      return comp;
    }),

    decodeAudioData: vi.fn(async (arrayBuffer: ArrayBuffer) => {
      const length = arrayBuffer.byteLength / 4 || 44100;
      return createMockAudioBuffer(length / _sampleRate, _sampleRate);
    }),

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

    _sources: sources,
    _gains: gains,
    _analysers: analysers,
    _filters: filters,
    _panners: panners,
    _compressors: compressors,
    _setCurrentTime(t: number) {
      _currentTime = t;
    },
    _setState(s: AudioContextState) {
      _state = s;
    },
  } as unknown as MockAudioContext;

  return ctx;
}

// ---------------------------------------------------------------------------
// AudioBuffer mock
// ---------------------------------------------------------------------------

export function createMockAudioBuffer(
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

// ---------------------------------------------------------------------------
// Worker / URL / Blob stubs for stretcher tests
// ---------------------------------------------------------------------------

export interface MockWorker {
  postMessage: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

export function stubWorkerGlobals(): {
  workers: MockWorker[];
  simulateWorkerResult: (
    workerIndex: number,
    chunkIndex: number,
    outputLength: number,
  ) => void;
  simulateWorkerCancel: (workerIndex: number, chunkIndex: number) => void;
  simulateWorkerError: (
    workerIndex: number,
    chunkIndex: number,
    error: string,
  ) => void;
  simulateWorkerCrash: (workerIndex: number, message?: string) => void;
} {
  const workers: MockWorker[] = [];

  vi.stubGlobal(
    "Worker",
    vi.fn(() => {
      const worker: MockWorker = {
        postMessage: vi.fn(),
        terminate: vi.fn(),
        onmessage: null,
        onerror: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
      workers.push(worker);
      return worker;
    }),
  );

  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:mock"),
    revokeObjectURL: vi.fn(),
  });

  vi.stubGlobal("Blob", vi.fn());

  function simulateWorkerResult(
    workerIndex: number,
    chunkIndex: number,
    outputLength: number,
  ) {
    const worker = workers[workerIndex];
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

  function simulateWorkerCancel(workerIndex: number, chunkIndex: number) {
    const worker = workers[workerIndex];
    if (!worker?.onmessage) {
      throw new Error(`Worker ${workerIndex} has no onmessage handler`);
    }
    worker.onmessage({
      data: { type: "cancelled", chunkIndex },
    } as MessageEvent);
  }

  function simulateWorkerError(
    workerIndex: number,
    chunkIndex: number,
    error: string,
  ) {
    const worker = workers[workerIndex];
    if (!worker?.onmessage) {
      throw new Error(`Worker ${workerIndex} has no onmessage handler`);
    }
    worker.onmessage({
      data: { type: "error", chunkIndex, error },
    } as MessageEvent);
  }

  function simulateWorkerCrash(workerIndex: number, message = "Worker crashed") {
    const worker = workers[workerIndex];
    if (!worker?.onerror) {
      throw new Error(`Worker ${workerIndex} has no onerror handler`);
    }
    const errorEvent = {
      message,
      preventDefault: vi.fn(),
    } as unknown as ErrorEvent;
    worker.onerror(errorEvent);
  }

  return {
    workers,
    simulateWorkerResult,
    simulateWorkerCancel,
    simulateWorkerError,
    simulateWorkerCrash,
  };
}

// ---------------------------------------------------------------------------
// Mock Playback for adapters tests
// ---------------------------------------------------------------------------

export interface MockPlayback {
  getState: ReturnType<typeof vi.fn>;
  getCurrentTime: ReturnType<typeof vi.fn>;
  getDuration: ReturnType<typeof vi.fn>;
  getProgress: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  togglePlayPause: ReturnType<typeof vi.fn>;
  seek: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  setPlaybackRate: ReturnType<typeof vi.fn>;
  setLoop: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  _emit: (event: string, data?: unknown) => void;
}

export function createMockPlayback(overrides?: {
  state?: string;
  currentTime?: number;
  duration?: number;
  progress?: number;
}): MockPlayback {
  const handlers = new Map<string, Set<(data: unknown) => void>>();

  const playback: MockPlayback = {
    getState: vi.fn(() => overrides?.state ?? "playing"),
    getCurrentTime: vi.fn(() => overrides?.currentTime ?? 0),
    getDuration: vi.fn(() => overrides?.duration ?? 10),
    getProgress: vi.fn(() => overrides?.progress ?? 0),
    pause: vi.fn(),
    resume: vi.fn(),
    togglePlayPause: vi.fn(),
    seek: vi.fn(),
    stop: vi.fn(),
    setPlaybackRate: vi.fn(),
    setLoop: vi.fn(),
    on: vi.fn((event: string, handler: (data: unknown) => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
      return () => {
        handlers.get(event)?.delete(handler);
      };
    }),
    off: vi.fn((event: string, handler: (data: unknown) => void) => {
      handlers.get(event)?.delete(handler);
    }),
    dispose: vi.fn(),
    _emit(event: string, data?: unknown) {
      const set = handlers.get(event);
      if (set) {
        for (const h of set) h(data);
      }
    },
  };

  return playback;
}

// ---------------------------------------------------------------------------
// Utility: find active source (with onended handler)
// ---------------------------------------------------------------------------

export function findActiveSource(
  sources: MockAudioBufferSourceNode[],
): MockAudioBufferSourceNode | null {
  for (let i = sources.length - 1; i >= 0; i--) {
    if (sources[i]!.onended !== null) {
      return sources[i]!;
    }
  }
  return null;
}
