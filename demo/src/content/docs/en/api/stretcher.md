---
title: stretcher
description: Pitch-preserving time-stretch engine
---

A WSOLA (Waveform Similarity Overlap-Add) time-stretch engine that changes playback speed without affecting pitch. Uses Web Workers for real-time audio processing.

```ts
import { createStretcherEngine } from "waa-play/stretcher";
```

:::note
The stretcher engine is usually used indirectly through `play()` with `preservePitch: true`. Direct usage is for advanced scenarios.
:::

## `createStretcherEngine()`

```ts
createStretcherEngine(
  ctx: AudioContext,
  buffer: AudioBuffer,
  options: StretcherOptions,
): StretcherEngine;
```

Create a WSOLA time-stretch engine for the given buffer.

```ts
const engine = createStretcherEngine(ctx, buffer, {
  tempo: 0.75,
  loop: true,
});

engine.start();
```

## StretcherOptions

```ts
interface StretcherOptions {
  tempo?: number;
  offset?: number;
  loop?: boolean;
  through?: AudioNode[];
  destination?: AudioNode;
  timeupdateInterval?: number;
  workerPoolSize?: number;
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `tempo` | `number` | `1` | Time-stretch ratio (0.5 = half speed, 2 = double speed) |
| `offset` | `number` | `0` | Start position in seconds |
| `loop` | `boolean` | `false` | Loop playback |
| `through` | `AudioNode[]` | `[]` | Audio nodes to route through |
| `destination` | `AudioNode` | `ctx.destination` | Output destination |
| `timeupdateInterval` | `number` | `250` | Interval for progress events in ms |
| `workerPoolSize` | `number` | - | Number of WSOLA worker threads |

## StretcherEngine Methods

### Playback Control

```ts
start(): void;
pause(): void;
resume(): void;
seek(position: number): void;
stop(): void;
```

### Configuration

```ts
setTempo(tempo: number): void;
```

Change the time-stretch ratio during playback.

```ts
engine.setTempo(1.5); // Speed up to 1.5x
```

### State

```ts
getCurrentPosition(): number;
getStatus(): StretcherStatus;
getSnapshot(): PlaybackSnapshot;
```

### Events

```ts
on(event: string, handler: Function): () => void;
off(event: string, handler: Function): void;
```

### Cleanup

```ts
dispose(): void;
```

Stop playback, terminate workers, and release all resources.

## Events

| Event | Description |
|-------|-------------|
| `progress` | Position updated |
| `bufferhealth` | Buffer health status changed |
| `buffering` | Worker buffer underrun, audio may stutter |
| `buffered` | Buffer recovered from underrun |
| `chunkready` | A new chunk has been processed |
| `complete` | All chunks have been processed |
| `ended` | Playback reached the end |
| `error` | An error occurred in a worker |

## StretcherStatus

```ts
interface StretcherStatus {
  phase: string;
  conversion: { ... };
  buffer: { ... };
  playback: { ... };
}
```

Detailed status object containing information about the engine's internal state, including conversion progress, buffer health, and playback position.

## Usage via play()

The simplest way to use the stretcher is through the `play()` function with `preservePitch: true`:

```ts
import { play } from "waa-play/play";

const playback = play(ctx, buffer, {
  playbackRate: 0.75,
  preservePitch: true,
});

// Change speed while preserving pitch
playback.setPlaybackRate(1.5);
```
