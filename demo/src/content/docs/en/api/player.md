---
title: WaaPlayer
description: Class-based API wrapping all modules
---

`WaaPlayer` provides a unified, class-based interface that wraps all waa-play modules. It manages its own `AudioContext` internally.

```ts
import { WaaPlayer } from "waa-play";
```

## Constructor

```ts
new WaaPlayer();
new WaaPlayer(ctx: AudioContext);
new WaaPlayer(options: WaaPlayerOptions);
```

Create a new WaaPlayer instance. You can optionally pass an existing `AudioContext` or an options object.

```ts
// Use default AudioContext
const player = new WaaPlayer();

// Provide your own AudioContext
const ctx = new AudioContext({ sampleRate: 48000 });
const player = new WaaPlayer(ctx);

// Pass options for AudioContext creation
const player = new WaaPlayer({ sampleRate: 48000 });
```

## Properties

### `ctx`

```ts
readonly ctx: AudioContext;
```

The underlying `AudioContext` instance.

## Context Methods

### `resume()`

```ts
resume(): Promise<void>;
```

Resume the suspended AudioContext. Equivalent to `resumeContext(ctx)`.

### `ensureRunning()`

```ts
ensureRunning(): Promise<void>;
```

Ensure the AudioContext is in the `running` state.

### `now()`

```ts
now(): number;
```

Returns the current time of the AudioContext (`ctx.currentTime`).

## Buffer Methods

### `load()`

```ts
load(url: string, options?: LoadBufferOptions): Promise<AudioBuffer>;
```

Fetch and decode an audio file from a URL.

```ts
const buffer = await player.load("/audio/track.mp3", {
  onProgress: (p) => console.log(`${Math.round(p * 100)}%`),
});
```

### `loadFromBlob()`

```ts
loadFromBlob(blob: Blob): Promise<AudioBuffer>;
```

Decode an AudioBuffer from a `Blob` or `File`.

### `loadAll()`

```ts
loadAll(map: Record<string, string>): Promise<Map<string, AudioBuffer>>;
```

Load multiple audio files in parallel.

```ts
const buffers = await player.loadAll({
  kick: "/audio/kick.wav",
  snare: "/audio/snare.wav",
});
```

### `getBufferInfo()`

```ts
getBufferInfo(buffer: AudioBuffer): BufferInfo;
```

Get metadata about an AudioBuffer (duration, channels, sampleRate, length).

## Playback

### `play()`

```ts
play(buffer: AudioBuffer, options?: PlayOptions): Playback;
```

Play an AudioBuffer. Returns a controllable `Playback` handle.

```ts
const playback = player.play(buffer, {
  offset: 10,
  loop: true,
  playbackRate: 1.5,
});
```

See [play module](/waa/en/api/play/) for `PlayOptions` and `Playback` details.

## Node Factories

### `createGain()`

```ts
createGain(initialValue?: number): GainNode;
```

### `createAnalyser()`

```ts
createAnalyser(options?: { fftSize?: number; smoothingTimeConstant?: number }): AnalyserNode;
```

### `createFilter()`

```ts
createFilter(options?: { type?: BiquadFilterType; frequency?: number; Q?: number; gain?: number }): BiquadFilterNode;
```

### `createPanner()`

```ts
createPanner(pan?: number): StereoPannerNode;
```

### `createCompressor()`

```ts
createCompressor(options?: { threshold?: number; knee?: number; ratio?: number; attack?: number; release?: number }): DynamicsCompressorNode;
```

### `rampGain()`

```ts
rampGain(gain: GainNode, target: number, duration: number): void;
```

Smooth linear ramp of a GainNode's value.

### `getFrequencyData()`

```ts
getFrequencyData(analyser: AnalyserNode): Float32Array;
```

### `getFrequencyDataByte()`

```ts
getFrequencyDataByte(analyser: AnalyserNode): Uint8Array;
```

### `chain()`

```ts
chain(...nodes: AudioNode[]): void;
```

Connect audio nodes in series.

### `disconnectChain()`

```ts
disconnectChain(...nodes: AudioNode[]): void;
```

Disconnect previously chained nodes.

## Waveform

### `extractPeaks()`

```ts
extractPeaks(buffer: AudioBuffer, options?: ExtractPeaksOptions): number[];
```

Extract normalized peak amplitudes `[0, 1]` from an AudioBuffer.

### `extractPeakPairs()`

```ts
extractPeakPairs(buffer: AudioBuffer, options?: ExtractPeaksOptions): PeakPair[];
```

Extract min/max peak pairs for waveform rendering.

### `extractRMS()`

```ts
extractRMS(buffer: AudioBuffer, options?: ExtractPeaksOptions): number[];
```

Extract RMS loudness values `[0, 1]`.

## Fade

### `fadeIn()`

```ts
fadeIn(gain: GainNode, target: number, options?: FadeOptions): void;
```

### `fadeOut()`

```ts
fadeOut(gain: GainNode, options?: FadeOptions): void;
```

### `crossfade()`

```ts
crossfade(gainA: GainNode, gainB: GainNode, options?: CrossfadeOptions): void;
```

### `autoFade()`

```ts
autoFade(playback: Playback, gain: GainNode, options?: AutoFadeOptions): () => void;
```

Automatically apply fade-in on play and fade-out before end. Returns a cleanup function.

## Scheduler

### `createScheduler()`

```ts
createScheduler(options?: SchedulerOptions): Scheduler;
```

### `createClock()`

```ts
createClock(options?: ClockOptions): Clock;
```

## Synth

### `createSineBuffer()`

```ts
createSineBuffer(frequency: number, duration: number): AudioBuffer;
```

### `createNoiseBuffer()`

```ts
createNoiseBuffer(duration: number): AudioBuffer;
```

### `createClickBuffer()`

```ts
createClickBuffer(frequency: number, duration: number): AudioBuffer;
```

## Adapters

### `getSnapshot()`

```ts
getSnapshot(playback: Playback): PlaybackSnapshot;
```

### `subscribeSnapshot()`

```ts
subscribeSnapshot(playback: Playback, callback: (snap: PlaybackSnapshot) => void): () => void;
```

### `onFrame()`

```ts
onFrame(playback: Playback, callback: (snap: PlaybackSnapshot) => void): () => void;
```

### `whenEnded()`

```ts
whenEnded(playback: Playback): Promise<void>;
```

### `whenPosition()`

```ts
whenPosition(playback: Playback, position: number): Promise<void>;
```

## Lifecycle

### `dispose()`

```ts
dispose(): void;
```

Close the AudioContext and release all resources. The instance should not be used after calling `dispose()`.
