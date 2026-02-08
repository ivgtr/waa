---
title: Types
description: Type definitions reference
---

All shared type definitions exported by waa-play.

```ts
import type {
  PlaybackState,
  PlayOptions,
  Playback,
  PlaybackSnapshot,
  // ...
} from "waa-play";
```

## Playback Types

### `PlaybackState`

```ts
type PlaybackState = "playing" | "paused" | "stopped";
```

### `PlayOptions`

```ts
interface PlayOptions {
  offset?: number;
  loop?: boolean;
  loopStart?: number;
  loopEnd?: number;
  playbackRate?: number;
  through?: AudioNode[];
  destination?: AudioNode;
  timeupdateInterval?: number;
  preservePitch?: boolean;
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `offset` | `number` | `0` | Start position in seconds |
| `loop` | `boolean` | `false` | Enable looping |
| `loopStart` | `number` | `0` | Loop region start in seconds |
| `loopEnd` | `number` | `duration` | Loop region end in seconds |
| `playbackRate` | `number` | `1` | Playback speed multiplier |
| `through` | `AudioNode[]` | `[]` | Effect chain nodes |
| `destination` | `AudioNode` | `ctx.destination` | Output destination |
| `timeupdateInterval` | `number` | `250` | Timeupdate interval in ms |
| `preservePitch` | `boolean` | `false` | Use WSOLA stretcher to preserve pitch |

### `Playback`

```ts
interface Playback {
  getState(): PlaybackState;
  getCurrentTime(): number;
  getDuration(): number;
  getProgress(): number;
  pause(): void;
  resume(): void;
  togglePlayPause(): void;
  seek(position: number): void;
  stop(): void;
  setPlaybackRate(rate: number): void;
  setLoop(loop: boolean): void;
  on<K extends keyof PlaybackEventMap>(
    event: K,
    handler: (data: PlaybackEventMap[K]) => void,
  ): () => void;
  off<K extends keyof PlaybackEventMap>(
    event: K,
    handler: (data: PlaybackEventMap[K]) => void,
  ): void;
  dispose(): void;
}
```

### `PlaybackSnapshot`

```ts
interface PlaybackSnapshot {
  state: PlaybackState;
  position: number;
  duration: number;
  progress: number;
  stretcher?: StretcherSnapshotExtension;
}
```

### `PlaybackEventMap`

```ts
interface PlaybackEventMap {
  play: void;
  pause: void;
  resume: void;
  seek: number;
  stop: void;
  ended: void;
  loop: void;
  statechange: PlaybackState;
  timeupdate: number;
  buffering: void;
  buffered: void;
}
```

## Buffer Types

### `BufferInfo`

```ts
interface BufferInfo {
  duration: number;
  numberOfChannels: number;
  sampleRate: number;
  length: number;
}
```

### `LoadBufferOptions`

```ts
interface LoadBufferOptions {
  onProgress?: (progress: number) => void;
}
```

## Waveform Types

### `ExtractPeaksOptions`

```ts
interface ExtractPeaksOptions {
  resolution?: number;
  channel?: number;
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `resolution` | `number` | `200` | Number of data points |
| `channel` | `number` | `0` | Channel index, `-1` for all |

### `PeakPair`

```ts
interface PeakPair {
  min: number;
  max: number;
}
```

## Fade Types

### `FadeCurve`

```ts
type FadeCurve = "linear" | "exponential" | "equal-power";
```

### `FadeOptions`

```ts
interface FadeOptions {
  duration?: number;
  curve?: FadeCurve;
}
```

### `CrossfadeOptions`

```ts
interface CrossfadeOptions {
  duration?: number;
  curve?: FadeCurve;
}
```

### `AutoFadeOptions`

```ts
interface AutoFadeOptions {
  fadeIn?: number;
  fadeOut?: number;
  curve?: FadeCurve;
}
```

## Scheduler Types

### `SchedulerOptions`

```ts
interface SchedulerOptions {
  lookahead?: number;
  interval?: number;
}
```

### `ScheduledEvent`

```ts
interface ScheduledEvent {
  id: string;
  time: number;
  callback: (time: number) => void;
}
```

### `ClockOptions`

```ts
interface ClockOptions {
  bpm?: number;
}
```

## Context Types

### `CreateContextOptions`

```ts
interface CreateContextOptions {
  sampleRate?: number;
  latencyHint?: AudioContextLatencyCategory | number;
}
```

## Emitter Types

### `Emitter<Events>`

```ts
interface Emitter<Events extends Record<string, unknown>> {
  on<K extends keyof Events>(event: K, handler: (data: Events[K]) => void): () => void;
  off<K extends keyof Events>(event: K, handler: (data: Events[K]) => void): void;
  emit<K extends keyof Events>(event: K, data: Events[K]): void;
  clear(event?: keyof Events): void;
}
```

## WaaPlayer Types

### `WaaPlayerOptions`

```ts
interface WaaPlayerOptions {
  sampleRate?: number;
  latencyHint?: AudioContextLatencyCategory | number;
}
```

## Stretcher Types

### `StretcherSnapshotExtension`

```ts
interface StretcherSnapshotExtension {
  tempo: number;
  converting: boolean;
  conversionProgress: number;
  bufferHealth: number;
  aheadSeconds: number;
  buffering: boolean;
  chunkStates: string[];
  currentChunkIndex: number;
  activeWindowStart: number;
  activeWindowEnd: number;
  totalChunks: number;
  windowConversionProgress: number;
}
```

This extension is available on `PlaybackSnapshot.stretcher` when the playback uses the WSOLA stretcher engine (i.e., `preservePitch: true`).
