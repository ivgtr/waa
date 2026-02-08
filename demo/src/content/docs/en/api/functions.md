---
title: Function API
description: Tree-shakeable function modules
---

Individual, tree-shakeable functions grouped by module. Each function takes an `AudioContext` as its first argument (BYO Context pattern).

```ts
import { createContext } from "waa-play/context";
import { loadBuffer } from "waa-play/buffer";
import { play } from "waa-play/play";

const ctx = createContext();
const buffer = await loadBuffer(ctx, "/audio/track.mp3");
const playback = play(ctx, buffer);
```

---

## play

Core playback engine. Wraps `AudioBufferSourceNode` with a state machine, position tracking, and event system.

```ts
import { play } from "waa-play/play";
```

### `play()`

```ts
play(ctx: AudioContext, buffer: AudioBuffer, options?: PlayOptions): Playback;
```

Play an AudioBuffer. Returns a controllable `Playback` handle.

```ts
const playback = play(ctx, buffer, {
  offset: 10,
  loop: true,
  playbackRate: 1.5,
  through: [gain, filter],
});
```

### PlayOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `offset` | `number` | `0` | Start position in seconds |
| `loop` | `boolean` | `false` | Enable looping |
| `loopStart` | `number` | `0` | Loop start point in seconds |
| `loopEnd` | `number` | `duration` | Loop end point in seconds |
| `playbackRate` | `number` | `1` | Playback speed multiplier |
| `through` | `AudioNode[]` | `[]` | Audio nodes to route through (effects chain) |
| `destination` | `AudioNode` | `ctx.destination` | Output destination node |
| `timeupdateInterval` | `number` | `250` | Interval for `timeupdate` events in ms |
| `preservePitch` | `boolean` | `false` | Preserve pitch when changing playback rate (uses stretcher engine) |

### Playback Methods

```ts
// State
getState(): PlaybackState;    // "playing" | "paused" | "stopped"
getCurrentTime(): number;
getDuration(): number;
getProgress(): number;         // [0, 1]

// Control
pause(): void;
resume(): void;
togglePlayPause(): void;
seek(position: number): void;
stop(): void;

// Configuration
setPlaybackRate(rate: number): void;
setLoop(loop: boolean): void;

// Events
on(event: string, handler: Function): () => void;  // Returns unsubscribe
off(event: string, handler: Function): void;

// Cleanup
dispose(): void;
```

### Playback Events

| Event | Payload | Description |
|-------|---------|-------------|
| `play` | - | Playback started |
| `pause` | - | Playback paused |
| `resume` | - | Resumed from pause |
| `seek` | `number` | Seeked to position (seconds) |
| `stop` | - | Playback stopped |
| `ended` | - | Reached end naturally |
| `loop` | - | Looped back to start |
| `statechange` | `PlaybackState` | State changed |
| `timeupdate` | `number` | Position updated (fires at `timeupdateInterval`) |
| `buffering` | - | Stretcher engine is buffering |
| `buffered` | - | Stretcher engine buffering complete |

### PlaybackSnapshot

```ts
interface PlaybackSnapshot {
  state: PlaybackState;
  position: number;
  duration: number;
  progress: number;
  stretcher?: StretcherSnapshotExtension;
}
```

---

## context

AudioContext lifecycle utilities.

```ts
import { createContext, resumeContext, ensureRunning, now } from "waa-play/context";
```

### `createContext()`

```ts
createContext(options?: { sampleRate?: number; latencyHint?: AudioContextLatencyCategory | number }): AudioContext;
```

### `resumeContext()`

```ts
resumeContext(ctx: AudioContext): Promise<void>;
```

Resume a suspended AudioContext. Call from a user gesture handler.

### `ensureRunning()`

```ts
ensureRunning(ctx: AudioContext): Promise<void>;
```

Ensure the AudioContext is in the `"running"` state. Safe to call multiple times.

### `now()`

```ts
now(ctx: AudioContext): number;
```

Shorthand for `ctx.currentTime`.

---

## buffer

Audio file loading and decoding.

```ts
import { loadBuffer, loadBufferFromBlob, loadBuffers, getBufferInfo } from "waa-play/buffer";
```

### `loadBuffer()`

```ts
loadBuffer(ctx: AudioContext, url: string, options?: { onProgress?: (progress: number) => void }): Promise<AudioBuffer>;
```

Fetch and decode an audio file. Supports progress tracking via `onProgress` (0–1).

### `loadBufferFromBlob()`

```ts
loadBufferFromBlob(ctx: AudioContext, blob: Blob): Promise<AudioBuffer>;
```

Decode an AudioBuffer from a Blob or File.

### `loadBuffers()`

```ts
loadBuffers(ctx: AudioContext, map: Record<string, string>): Promise<Map<string, AudioBuffer>>;
```

Load multiple audio files in parallel from a key-URL map.

### `getBufferInfo()`

```ts
getBufferInfo(buffer: AudioBuffer): { duration: number; numberOfChannels: number; sampleRate: number; length: number };
```

---

## nodes

Audio node factories and routing utilities.

```ts
import { createGain, rampGain, createAnalyser, createFilter, createPanner, createCompressor, chain, disconnectChain } from "waa-play/nodes";
```

### Node Factories

```ts
createGain(ctx: AudioContext, initialValue?: number): GainNode;
createAnalyser(ctx: AudioContext, options?: { fftSize?: number; smoothingTimeConstant?: number }): AnalyserNode;
createFilter(ctx: AudioContext, options?: { type?: BiquadFilterType; frequency?: number; Q?: number; gain?: number }): BiquadFilterNode;
createPanner(ctx: AudioContext, pan?: number): StereoPannerNode;
createCompressor(ctx: AudioContext, options?: { threshold?: number; knee?: number; ratio?: number; attack?: number; release?: number }): DynamicsCompressorNode;
```

### Utilities

```ts
rampGain(gain: GainNode, target: number, duration: number): void;
getFrequencyData(analyser: AnalyserNode): Float32Array;
getFrequencyDataByte(analyser: AnalyserNode): Uint8Array;
```

### Routing

```ts
chain(...nodes: AudioNode[]): void;           // Connect nodes in series
disconnectChain(...nodes: AudioNode[]): void;  // Disconnect chained nodes
```

---

## emitter

Minimal, type-safe event emitter.

```ts
import { createEmitter } from "waa-play/emitter";
```

### `createEmitter()`

```ts
createEmitter<Events extends Record<string, unknown>>(): Emitter<Events>;
```

```ts
type MyEvents = { progress: number; complete: void };
const emitter = createEmitter<MyEvents>();

emitter.on("progress", (v) => console.log(v));  // Returns unsubscribe fn
emitter.emit("progress", 0.5);
emitter.clear();  // Remove all handlers
```

### Emitter Methods

```ts
on<K>(event: K, handler: (data: Events[K]) => void): () => void;
off<K>(event: K, handler: (data: Events[K]) => void): void;
emit<K>(event: K, data: Events[K]): void;
clear(event?: keyof Events): void;
```

---

## waveform

Extract visual waveform data from AudioBuffer.

```ts
import { extractPeaks, extractPeakPairs, extractRMS } from "waa-play/waveform";
```

### Functions

```ts
extractPeaks(buffer: AudioBuffer, options?: ExtractPeaksOptions): number[];
extractPeakPairs(buffer: AudioBuffer, options?: ExtractPeaksOptions): PeakPair[];
extractRMS(buffer: AudioBuffer, options?: ExtractPeaksOptions): number[];
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `resolution` | `number` | `200` | Number of data points to extract |
| `channel` | `number` | `0` | Channel index (`-1` for all channels) |

`PeakPair` is `{ min: number; max: number }`.

---

## fade

Fade in/out and crossfade utilities using GainNode automation.

```ts
import { fadeIn, fadeOut, crossfade, autoFade } from "waa-play/fade";
```

### Functions

```ts
fadeIn(gain: GainNode, target: number, options?: FadeOptions): void;
fadeOut(gain: GainNode, options?: FadeOptions): void;
crossfade(gainA: GainNode, gainB: GainNode, options?: CrossfadeOptions): void;
autoFade(playback: Playback, gain: GainNode, options?: AutoFadeOptions): () => void;
```

`autoFade` applies fade-in on start and fade-out before end. Returns a cleanup function.

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `duration` | `number` | `1` | Fade duration in seconds |
| `curve` | `FadeCurve` | `"linear"` | `"linear"` \| `"exponential"` \| `"equal-power"` |

`AutoFadeOptions` uses `fadeIn` / `fadeOut` (seconds) instead of `duration`.

---

## scheduler

Lookahead-based event scheduler and BPM clock.

```ts
import { createScheduler, createClock } from "waa-play/scheduler";
```

### `createScheduler()`

```ts
createScheduler(ctx: AudioContext, options?: { lookahead?: number; interval?: number }): Scheduler;
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `lookahead` | `number` | `0.1` | How far ahead to schedule (seconds) |
| `interval` | `number` | `25` | Timer interval (ms) |

**Scheduler methods:** `schedule(id, time, callback)`, `cancel(id)`, `start()`, `stop()`, `dispose()`.

### `createClock()`

```ts
createClock(ctx: AudioContext, options?: { bpm?: number }): Clock;
```

BPM-based clock. Default `120` BPM.

**Clock methods:** `beatToTime(beat)`, `getCurrentBeat()`, `getNextBeatTime()`, `setBpm(bpm)`, `getBpm()`.

---

## synth

Generate synthetic audio buffers.

```ts
import { createSineBuffer, createNoiseBuffer, createClickBuffer } from "waa-play/synth";
```

```ts
createSineBuffer(ctx: AudioContext, frequency: number, duration: number): AudioBuffer;
createNoiseBuffer(ctx: AudioContext, duration: number): AudioBuffer;
createClickBuffer(ctx: AudioContext, frequency: number, duration: number): AudioBuffer;
```

---

## adapters

Framework integration utilities. Compatible with React's `useSyncExternalStore`.

```ts
import { getSnapshot, subscribeSnapshot, onFrame, whenEnded, whenPosition } from "waa-play/adapters";
```

### Functions

```ts
getSnapshot(playback: Playback): PlaybackSnapshot;
subscribeSnapshot(playback: Playback, callback: (snap: PlaybackSnapshot) => void): () => void;
onFrame(playback: Playback, callback: (snap: PlaybackSnapshot) => void): () => void;
whenEnded(playback: Playback): Promise<void>;
whenPosition(playback: Playback, position: number): Promise<void>;
```

### React Example

```tsx
import { useSyncExternalStore, useCallback } from "react";
import { getSnapshot, subscribeSnapshot } from "waa-play/adapters";

function usePlayback(playback: Playback) {
  const subscribe = useCallback(
    (cb: () => void) => subscribeSnapshot(playback, cb),
    [playback],
  );
  const snap = useCallback(
    () => getSnapshot(playback),
    [playback],
  );
  return useSyncExternalStore(subscribe, snap, snap);
}
```
