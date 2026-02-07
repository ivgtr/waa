// ---------------------------------------------------------------------------
// Stretcher: Type definitions
// ---------------------------------------------------------------------------

/** State of a single chunk in the conversion pipeline. */
export type ChunkState =
  | "pending"
  | "queued"
  | "converting"
  | "ready"
  | "failed"
  | "skipped"
  | "evicted";

/** Playback state of the stretcher engine. */
export type StretcherPlaybackState =
  | "waiting"
  | "playing"
  | "buffering"
  | "paused"
  | "ended";

/** Buffer health classification. */
export type BufferHealth = "healthy" | "low" | "critical" | "empty";

// ---------------------------------------------------------------------------
// Chunk
// ---------------------------------------------------------------------------

/** Metadata and state for a single chunk. */
export interface ChunkInfo {
  index: number;
  state: ChunkState;
  inputStartSample: number;
  inputEndSample: number;
  overlapBefore: number;
  overlapAfter: number;
  outputBuffer: Float32Array[] | null;
  outputLength: number;
  priority: number;
  retryCount: number;
}

// ---------------------------------------------------------------------------
// Worker Messages
// ---------------------------------------------------------------------------

export interface WorkerConvertRequest {
  type: "convert";
  chunkIndex: number;
  inputData: Float32Array[];
  tempo: number;
  sampleRate: number;
}

export interface WorkerCancelRequest {
  type: "cancel";
  chunkIndex: number;
}

export type WorkerRequest = WorkerConvertRequest | WorkerCancelRequest;

export interface WorkerResultResponse {
  type: "result";
  chunkIndex: number;
  outputData: Float32Array[];
  outputLength: number;
}

export interface WorkerCancelledResponse {
  type: "cancelled";
  chunkIndex: number;
}

export interface WorkerErrorResponse {
  type: "error";
  chunkIndex: number;
  error: string;
}

export type WorkerResponse =
  | WorkerResultResponse
  | WorkerCancelledResponse
  | WorkerErrorResponse;

// ---------------------------------------------------------------------------
// Conversion Scheduler
// ---------------------------------------------------------------------------

export interface ConversionSchedulerOptions {
  forwardWeight: number;
  backwardWeight: number;
  cancelDistanceThreshold: number;
}

// ---------------------------------------------------------------------------
// Chunk Player
// ---------------------------------------------------------------------------

export interface ChunkPlayerOptions {
  through?: AudioNode[];
  destination?: AudioNode;
  crossfadeSec: number;
}

// ---------------------------------------------------------------------------
// Buffer Monitor
// ---------------------------------------------------------------------------

export interface BufferMonitorOptions {
  healthySec: number;
  lowSec: number;
  criticalSec: number;
  resumeSec: number;
  chunkDurationSec: number;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/** Stretcher engine configuration. */
export interface StretcherEngineOptions {
  tempo: number;
  offset?: number;
  loop?: boolean;
  through?: AudioNode[];
  destination?: AudioNode;
  timeupdateInterval?: number;
}

/** Aggregate status of the stretcher engine. */
export interface StretcherStatus {
  phase: StretcherPlaybackState;
  conversion: {
    total: number;
    ready: number;
    converting: number;
    progress: number;
  };
  buffer: {
    health: BufferHealth;
    aheadSeconds: number;
  };
  playback: {
    position: number;
    duration: number;
    tempo: number;
  };
}

/** Snapshot extension for PlaybackSnapshot. */
export interface StretcherSnapshotExtension {
  tempo: number;
  converting: boolean;
  conversionProgress: number;
  bufferHealth: BufferHealth;
  aheadSeconds: number;
  buffering: boolean;
}

/** Events emitted by the stretcher engine. */
export interface StretcherEvents {
  progress: { total: number; ready: number; progress: number };
  bufferhealth: { health: BufferHealth; aheadSeconds: number };
  buffering: { reason: "initial" | "seek" | "tempo-change" | "underrun" };
  buffered: { stallDuration: number };
  chunkready: { index: number };
  complete: void;
  error: { message: string; chunkIndex?: number; fatal: boolean };
}

/** The stretcher engine interface. */
export interface StretcherEngine {
  start(): void;
  pause(): void;
  resume(): void;
  seek(position: number): void;
  stop(): void;
  setTempo(tempo: number): void;
  getCurrentPosition(): number;
  getStatus(): StretcherStatus;
  getSnapshot(): StretcherSnapshotExtension;
  on<K extends keyof StretcherEvents>(
    event: K,
    handler: (data: StretcherEvents[K]) => void,
  ): () => void;
  off<K extends keyof StretcherEvents>(
    event: K,
    handler: (data: StretcherEvents[K]) => void,
  ): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Worker Manager
// ---------------------------------------------------------------------------

export interface WorkerManager {
  postConvert(
    chunkIndex: number,
    inputData: Float32Array[],
    tempo: number,
    sampleRate: number,
  ): void;
  cancelCurrent(): void;
  isBusy(): boolean;
  getCurrentChunkIndex(): number | null;
  terminate(): void;
}

// ---------------------------------------------------------------------------
// Priority Queue
// ---------------------------------------------------------------------------

export interface PriorityQueue<T> {
  enqueue(item: T): void;
  dequeue(): T | undefined;
  peek(): T | undefined;
  remove(predicate: (item: T) => boolean): boolean;
  rebuild(): void;
  clear(): void;
  size(): number;
  toArray(): T[];
}

// ---------------------------------------------------------------------------
// Conversion Scheduler
// ---------------------------------------------------------------------------

export interface ConversionScheduler {
  start(currentChunkIndex: number): void;
  updatePriorities(currentChunkIndex: number): void;
  handleSeek(newChunkIndex: number): void;
  handleTempoChange(newTempo: number): void;
  restorePreviousTempo(): boolean;
  dispatchNext(): void;
  getChunks(): ChunkInfo[];
  dispose(): void;
  _handleResult(
    chunkIndex: number,
    outputData: Float32Array[],
    outputLength: number,
  ): void;
  _handleError(chunkIndex: number, error: string): void;
}

// ---------------------------------------------------------------------------
// Chunk Player
// ---------------------------------------------------------------------------

export interface ChunkPlayer {
  playChunk(
    buffer: AudioBuffer,
    startTime: number,
    offsetInChunk?: number,
  ): void;
  scheduleNext(buffer: AudioBuffer, startTime: number): void;
  handleSeek(buffer: AudioBuffer, offsetInChunk: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
  getCurrentPosition(): number;
  setOnChunkEnded(callback: () => void): void;
  setOnNeedNext(callback: () => void): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Buffer Monitor
// ---------------------------------------------------------------------------

export interface BufferMonitor {
  getHealth(currentChunkIndex: number, chunks: ChunkInfo[]): BufferHealth;
  getAheadSeconds(currentChunkIndex: number, chunks: ChunkInfo[]): number;
  shouldEnterBuffering(
    currentChunkIndex: number,
    chunks: ChunkInfo[],
  ): boolean;
  shouldExitBuffering(
    currentChunkIndex: number,
    chunks: ChunkInfo[],
  ): boolean;
}

// ---------------------------------------------------------------------------
// Conversion Estimator
// ---------------------------------------------------------------------------

export interface ConversionEstimator {
  recordConversion(durationMs: number): void;
  estimateRemaining(remainingChunks: number): number;
  getAverageMs(): number;
}
