import { createContext, resumeContext, ensureRunning, now } from "./context.js";
import {
  loadBuffer,
  loadBufferFromBlob,
  loadBuffers,
  getBufferInfo,
} from "./buffer.js";
import { play } from "./play.js";
import {
  createGain as createGainNode,
  rampGain,
  createAnalyser as createAnalyserNode,
  getFrequencyData,
  getFrequencyDataByte,
  createFilter as createFilterNode,
  createPanner as createPannerNode,
  createCompressor as createCompressorNode,
  chain,
  disconnectChain,
} from "./nodes.js";
import { extractPeaks, extractPeakPairs, extractRMS } from "./waveform.js";
import { fadeIn, fadeOut, crossfade, autoFade } from "./fade.js";
import { createScheduler, createClock } from "./scheduler.js";
import {
  createSineBuffer,
  createNoiseBuffer,
  createClickBuffer,
} from "./synth.js";
import {
  getSnapshot,
  subscribeSnapshot,
  onFrame,
  whenEnded,
  whenPosition,
} from "./adapters.js";

import type {
  CreateContextOptions,
  LoadBufferOptions,
  BufferInfo,
  PlayOptions,
  Playback,
  PlaybackSnapshot,
  ExtractPeaksOptions,
  PeakPair,
  FadeOptions,
  CrossfadeOptions,
  AutoFadeOptions,
  SchedulerOptions,
  ClockOptions,
} from "./types.js";
import type { Scheduler, Clock } from "./scheduler.js";

export interface WaaPlayerOptions extends CreateContextOptions {}

export class WaaPlayer {
  readonly ctx: AudioContext;
  private readonly _ownsContext: boolean;

  constructor(ctxOrOptions?: AudioContext | WaaPlayerOptions) {
    if (
      ctxOrOptions &&
      typeof (ctxOrOptions as AudioContext).createGain === "function"
    ) {
      this.ctx = ctxOrOptions as AudioContext;
      this._ownsContext = false;
    } else {
      this.ctx = createContext(ctxOrOptions as WaaPlayerOptions | undefined);
      this._ownsContext = true;
    }
  }

  // --- Context ---

  resume(): Promise<void> {
    return resumeContext(this.ctx);
  }

  ensureRunning(): Promise<void> {
    return ensureRunning(this.ctx);
  }

  now(): number {
    return now(this.ctx);
  }

  // --- Buffer ---

  load(url: string, options?: LoadBufferOptions): Promise<AudioBuffer> {
    return loadBuffer(this.ctx, url, options);
  }

  loadFromBlob(blob: Blob): Promise<AudioBuffer> {
    return loadBufferFromBlob(this.ctx, blob);
  }

  loadAll(map: Record<string, string>): Promise<Map<string, AudioBuffer>> {
    return loadBuffers(this.ctx, map);
  }

  getBufferInfo(buffer: AudioBuffer): BufferInfo {
    return getBufferInfo(buffer);
  }

  // --- Play ---

  play(buffer: AudioBuffer, options?: PlayOptions): Playback {
    return play(this.ctx, buffer, options);
  }

  // --- Nodes ---

  createGain(initialValue?: number): GainNode {
    return createGainNode(this.ctx, initialValue);
  }

  createAnalyser(options?: {
    fftSize?: number;
    smoothingTimeConstant?: number;
  }): AnalyserNode {
    return createAnalyserNode(this.ctx, options);
  }

  createFilter(options?: {
    type?: BiquadFilterType;
    frequency?: number;
    Q?: number;
    gain?: number;
  }): BiquadFilterNode {
    return createFilterNode(this.ctx, options);
  }

  createPanner(pan?: number): StereoPannerNode {
    return createPannerNode(this.ctx, pan);
  }

  createCompressor(options?: {
    threshold?: number;
    knee?: number;
    ratio?: number;
    attack?: number;
    release?: number;
  }): DynamicsCompressorNode {
    return createCompressorNode(this.ctx, options);
  }

  rampGain(gain: GainNode, target: number, duration: number): void {
    rampGain(gain, target, duration);
  }

  getFrequencyData(analyser: AnalyserNode): Float32Array {
    return getFrequencyData(analyser);
  }

  getFrequencyDataByte(analyser: AnalyserNode): Uint8Array {
    return getFrequencyDataByte(analyser);
  }

  chain(...nodes: AudioNode[]): void {
    chain(...nodes);
  }

  disconnectChain(...nodes: AudioNode[]): void {
    disconnectChain(...nodes);
  }

  // --- Waveform ---

  extractPeaks(buffer: AudioBuffer, options?: ExtractPeaksOptions): number[] {
    return extractPeaks(buffer, options);
  }

  extractPeakPairs(
    buffer: AudioBuffer,
    options?: ExtractPeaksOptions,
  ): PeakPair[] {
    return extractPeakPairs(buffer, options);
  }

  extractRMS(
    buffer: AudioBuffer,
    options?: ExtractPeaksOptions & { channel?: number },
  ): number[] {
    return extractRMS(buffer, options);
  }

  // --- Fade ---

  fadeIn(gain: GainNode, target: number, options?: FadeOptions): void {
    fadeIn(gain, target, options);
  }

  fadeOut(gain: GainNode, options?: FadeOptions): void {
    fadeOut(gain, options);
  }

  crossfade(
    gainA: GainNode,
    gainB: GainNode,
    options?: CrossfadeOptions,
  ): void {
    crossfade(gainA, gainB, options);
  }

  autoFade(
    playback: Playback,
    gain: GainNode,
    options?: AutoFadeOptions,
  ): () => void {
    return autoFade(playback, gain, options);
  }

  // --- Scheduler ---

  createScheduler(options?: SchedulerOptions): Scheduler {
    return createScheduler(this.ctx, options);
  }

  createClock(options?: ClockOptions): Clock {
    return createClock(this.ctx, options);
  }

  // --- Synth ---

  createSineBuffer(frequency: number, duration: number): AudioBuffer {
    return createSineBuffer(this.ctx, frequency, duration);
  }

  createNoiseBuffer(duration: number): AudioBuffer {
    return createNoiseBuffer(this.ctx, duration);
  }

  createClickBuffer(frequency: number, duration: number): AudioBuffer {
    return createClickBuffer(this.ctx, frequency, duration);
  }

  // --- Adapters ---

  getSnapshot(playback: Playback): PlaybackSnapshot {
    return getSnapshot(playback);
  }

  subscribeSnapshot(playback: Playback, callback: () => void): () => void {
    return subscribeSnapshot(playback, callback);
  }

  onFrame(
    playback: Playback,
    callback: (snapshot: PlaybackSnapshot) => void,
  ): () => void {
    return onFrame(playback, callback);
  }

  whenEnded(playback: Playback): Promise<void> {
    return whenEnded(playback);
  }

  whenPosition(playback: Playback, position: number): Promise<void> {
    return whenPosition(playback, position);
  }

  // --- Lifecycle ---

  dispose(): void {
    if (this._ownsContext) {
      this.ctx.close();
    }
  }
}
