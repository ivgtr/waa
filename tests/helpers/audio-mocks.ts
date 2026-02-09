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
    setValueCurveAtTime: ReturnType<typeof vi.fn>;
  };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

// ---------------------------------------------------------------------------
// AudioContext mock
// ---------------------------------------------------------------------------

export interface MockAudioContext extends AudioContext {
  _sources: MockAudioBufferSourceNode[];
  _gains: MockGainNode[];
  _setCurrentTime: (t: number) => void;
}

export function createMockAudioContext(
  overrides?: Partial<{ currentTime: number; sampleRate: number }>,
): MockAudioContext {
  let _currentTime = overrides?.currentTime ?? 0;
  const _sampleRate = overrides?.sampleRate ?? 44100;
  const sources: MockAudioBufferSourceNode[] = [];
  const gains: MockGainNode[] = [];

  const ctx = {
    get currentTime() {
      return _currentTime;
    },
    sampleRate: _sampleRate,
    destination: {} as AudioDestinationNode,

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
          setValueCurveAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      gains.push(gain);
      return gain;
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
    _setCurrentTime(t: number) {
      _currentTime = t;
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
