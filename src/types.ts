// ---------------------------------------------------------------------------
// Playback States
// ---------------------------------------------------------------------------

/** Possible states of a Playback instance. */
export type PlaybackState = "playing" | "paused" | "stopped";

// ---------------------------------------------------------------------------
// Play Options
// ---------------------------------------------------------------------------

/** Options accepted by `play()`. */
export interface PlayOptions {
  /** Start offset in seconds within the buffer. @default 0 */
  offset?: number;
  /** Whether the source should loop. @default false */
  loop?: boolean;
  /** Loop region start in seconds. */
  loopStart?: number;
  /** Loop region end in seconds. */
  loopEnd?: number;
  /** Playback speed multiplier. @default 1 */
  playbackRate?: number;
  /**
   * A chain of AudioNodes the source should route through before reaching the
   * destination. The first node receives the source output; the last node is
   * connected to `destination`.
   */
  through?: AudioNode[];
  /**
   * Final destination node. Defaults to `ctx.destination`.
   */
  destination?: AudioNode;
  /**
   * Interval (ms) for `timeupdate` events. @default 50
   */
  timeupdateInterval?: number;
  /**
   * Enable pitch-preserving time-stretch via WSOLA.
   * When true, `playbackRate` controls tempo without changing pitch.
   * @default true
   */
  preservePitch?: boolean;
}

// ---------------------------------------------------------------------------
// Playback Snapshot (for framework adapters)
// ---------------------------------------------------------------------------

/** Stretcher snapshot extension (re-declared here to avoid static import). */
export interface StretcherSnapshotExtension {
  tempo: number;
  converting: boolean;
  conversionProgress: number;
  bufferHealth: "healthy" | "low" | "critical" | "empty";
  aheadSeconds: number;
  buffering: boolean;
  chunkStates: ("pending" | "queued" | "converting" | "ready" | "failed" | "skipped" | "evicted")[];
  currentChunkIndex: number;
  activeWindowStart: number;
  activeWindowEnd: number;
  totalChunks: number;
  windowConversionProgress: number;
}

/** An immutable snapshot of a Playback's current state. */
export interface PlaybackSnapshot {
  state: PlaybackState;
  position: number;
  duration: number;
  progress: number;
  stretcher?: StretcherSnapshotExtension;
}

// ---------------------------------------------------------------------------
// Playback Events
// ---------------------------------------------------------------------------

/** Event map emitted by a Playback instance. */
export interface PlaybackEventMap {
  play: void;
  pause: void;
  resume: void;
  seek: { position: number };
  stop: void;
  ended: void;
  loop: void;
  statechange: { state: PlaybackState };
  timeupdate: { position: number; duration: number };
  buffering: { reason: "initial" | "seek" | "tempo-change" | "underrun" };
  buffered: { stallDuration: number };
}

// ---------------------------------------------------------------------------
// Playback Interface
// ---------------------------------------------------------------------------

/** The object returned by `play()`. */
export interface Playback {
  /** Current playback state. */
  getState(): PlaybackState;
  /** Current playback position in seconds (AudioContext‑accurate). */
  getCurrentTime(): number;
  /** Total duration of the underlying buffer in seconds. */
  getDuration(): number;
  /** Current progress as a ratio 0 – 1. */
  getProgress(): number;

  pause(): void;
  resume(): void;
  togglePlayPause(): void;
  seek(position: number): void;
  stop(): void;

  setPlaybackRate(rate: number): void;
  setLoop(loop: boolean): void;

  /** Subscribe to a playback event. Returns an unsubscribe function. */
  on<K extends keyof PlaybackEventMap>(
    event: K,
    handler: (data: PlaybackEventMap[K]) => void,
  ): () => void;

  /** Unsubscribe a previously registered handler. */
  off<K extends keyof PlaybackEventMap>(
    event: K,
    handler: (data: PlaybackEventMap[K]) => void,
  ): void;

  /** Release all resources (source node, timers, listeners). */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Buffer Loading
// ---------------------------------------------------------------------------

/** Options for `loadBuffer`. */
export interface LoadBufferOptions {
  /** Progress callback receiving a value between 0 and 1 (if available). */
  onProgress?: (progress: number) => void;
}

/** Information about an AudioBuffer. */
export interface BufferInfo {
  duration: number;
  numberOfChannels: number;
  sampleRate: number;
  length: number;
}

// ---------------------------------------------------------------------------
// Waveform
// ---------------------------------------------------------------------------

/** Options for waveform extraction functions. */
export interface ExtractPeaksOptions {
  /** Number of output data points. @default 200 */
  resolution?: number;
  /** Channel index to analyze. @default 0 */
  channel?: number;
}

/** A min/max pair representing a single segment of the waveform. */
export interface PeakPair {
  min: number;
  max: number;
}

// ---------------------------------------------------------------------------
// Fade
// ---------------------------------------------------------------------------

/** Curve types for fade operations. */
export type FadeCurve = "linear" | "exponential" | "equal-power";

/** Options for fade functions. */
export interface FadeOptions {
  /** Duration of the fade in seconds. @default 1 */
  duration?: number;
  /** Easing curve. @default "linear" */
  curve?: FadeCurve;
}

/** Options for crossfade. */
export interface CrossfadeOptions extends FadeOptions {}

/** Options for autoFade. */
export interface AutoFadeOptions {
  /** Fade-in duration at the start in seconds. @default 0 */
  fadeIn?: number;
  /** Fade-out duration before the end in seconds. @default 0 */
  fadeOut?: number;
  /** Curve for both fades. @default "linear" */
  curve?: FadeCurve;
}

// ---------------------------------------------------------------------------
// Scheduler & Clock
// ---------------------------------------------------------------------------

/** Options for `createScheduler`. */
export interface SchedulerOptions {
  /** How far ahead (seconds) to schedule events. @default 0.1 */
  lookahead?: number;
  /** Interval (ms) between scheduler ticks. @default 25 */
  interval?: number;
}

/** A scheduled event entry. */
export interface ScheduledEvent {
  id: string;
  time: number;
  callback: (time: number) => void;
}

/** Options for `createClock`. */
export interface ClockOptions {
  /** Beats per minute. @default 120 */
  bpm?: number;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/** Options for `createContext`. */
export interface CreateContextOptions {
  sampleRate?: number;
  latencyHint?: AudioContextLatencyCategory | number;
}
