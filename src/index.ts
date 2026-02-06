// ---------------------------------------------------------------------------
// waa — Composable Web Audio API utilities
// ---------------------------------------------------------------------------

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
} from "./types.js";

// M1: Context
export { createContext, resumeContext, ensureRunning, now } from "./context.js";

// M2: Buffer
export {
  loadBuffer,
  loadBufferFromBlob,
  loadBuffers,
  getBufferInfo,
} from "./buffer.js";

// M3: Play
export { play } from "./play.js";

// M4: Emitter
export { createEmitter } from "./emitter.js";
export type { Emitter } from "./emitter.js";

// M5: Nodes
export {
  createGain,
  rampGain,
  createAnalyser,
  getFrequencyData,
  getFrequencyDataByte,
  createFilter,
  createPanner,
  createCompressor,
  chain,
  disconnectChain,
} from "./nodes.js";

// M6: Waveform
export { extractPeaks, extractPeakPairs, extractRMS } from "./waveform.js";

// M7: Fade
export { fadeIn, fadeOut, crossfade, autoFade } from "./fade.js";

// M8: Scheduler & Clock
export { createScheduler, createClock } from "./scheduler.js";
export type { Scheduler, Clock } from "./scheduler.js";

// M9: Synth
export {
  createSineBuffer,
  createNoiseBuffer,
  createClickBuffer,
} from "./synth.js";

// M10: Adapters
export {
  getSnapshot,
  subscribeSnapshot,
  onFrame,
  whenEnded,
  whenPosition,
} from "./adapters.js";
