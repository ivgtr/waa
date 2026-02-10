// ---------------------------------------------------------------------------
// waa — Composable Web Audio API utilities
// ---------------------------------------------------------------------------

// M10: Adapters
export {
  getSnapshot,
  onFrame,
  subscribeSnapshot,
  whenEnded,
  whenPosition,
} from "./adapters.js";
// M2: Buffer
export {
  getBufferInfo,
  loadBuffer,
  loadBufferFromBlob,
  loadBuffers,
} from "./buffer.js";
// M1: Context
export { createContext, ensureRunning, now, resumeContext } from "./context.js";
export type { Emitter } from "./emitter.js";

// M4: Emitter
export { createEmitter } from "./emitter.js";
// M7: Fade
export { autoFade, crossfade, fadeIn, fadeOut } from "./fade.js";

// M5: Nodes
export {
  chain,
  createAnalyser,
  createCompressor,
  createFilter,
  createGain,
  createPanner,
  disconnectChain,
  getFrequencyData,
  getFrequencyDataByte,
  rampGain,
} from "./nodes.js";
// M3: Play
export { play } from "./play.js";
export type { WaaPlayerOptions } from "./player.js";
// M11: Player (class-based API)
export { WaaPlayer } from "./player.js";
export type { Clock, Scheduler } from "./scheduler.js";
// M8: Scheduler & Clock
export { createClock, createScheduler } from "./scheduler.js";
// M9: Synth
export {
  createClickBuffer,
  createNoiseBuffer,
  createSineBuffer,
} from "./synth.js";
// Types
export type {
  AutoFadeOptions,
  BufferInfo,
  ClockOptions,
  CreateContextOptions,
  CrossfadeOptions,
  ExtractPeaksOptions,
  FadeCurve,
  FadeOptions,
  LoadBufferOptions,
  PeakPair,
  Playback,
  PlaybackEventMap,
  PlaybackSnapshot,
  PlaybackState,
  PlayOptions,
  ScheduledEvent,
  SchedulerOptions,
  StretcherSnapshotExtension,
} from "./types.js";
// M6: Waveform
export { extractPeakPairs, extractPeaks, extractRMS } from "./waveform.js";
