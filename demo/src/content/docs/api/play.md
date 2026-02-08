---
title: play
description: Core playback engine
---

The core playback engine. Wraps `AudioBufferSourceNode` with a state machine, position tracking, and event system.

```ts
import { play } from "waa-play/play";
```

## `play()`

```ts
play(ctx: AudioContext, buffer: AudioBuffer, options?: PlayOptions): Playback;
```

Play an AudioBuffer. Returns a controllable `Playback` handle with pause, seek, loop, and event support.

```ts
const playback = play(ctx, buffer);

// With options
const playback = play(ctx, buffer, {
  offset: 10,
  loop: true,
  playbackRate: 1.5,
});
```

## PlayOptions

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

### Routing with `through`

Pass audio nodes to insert between the source and destination:

```ts
const gain = createGain(ctx, 0.8);
const filter = createFilter(ctx, { type: "lowpass", frequency: 1000 });

const playback = play(ctx, buffer, {
  through: [gain, filter],
});
```

## Playback

The `Playback` object controls an active playback session.

### State Methods

```ts
getState(): PlaybackState;    // "playing" | "paused" | "stopped"
getCurrentTime(): number;     // Current position in seconds
getDuration(): number;        // Total duration in seconds
getProgress(): number;        // Position as fraction [0, 1]
```

### Playback Control

```ts
pause(): void;
resume(): void;
togglePlayPause(): void;
seek(position: number): void;   // Seek to position in seconds
stop(): void;
```

### Configuration

```ts
setPlaybackRate(rate: number): void;
setLoop(loop: boolean): void;
```

### Events

```ts
on(event: string, handler: Function): () => void;
off(event: string, handler: Function): void;
```

`on()` returns an unsubscribe function.

### Cleanup

```ts
dispose(): void;
```

Stop playback and release all resources. The Playback handle should not be used after calling `dispose()`.

## Events

| Event | Payload | Description |
|-------|---------|-------------|
| `play` | - | Playback started |
| `pause` | - | Playback paused |
| `resume` | - | Playback resumed from pause |
| `seek` | `number` | Seeked to position (seconds) |
| `stop` | - | Playback stopped |
| `ended` | - | Playback reached the end naturally |
| `loop` | - | Playback looped back to start |
| `statechange` | `PlaybackState` | State changed |
| `timeupdate` | `number` | Position updated (fires at `timeupdateInterval`) |
| `buffering` | - | Stretcher engine is buffering |
| `buffered` | - | Stretcher engine buffering complete |

```ts
const playback = play(ctx, buffer);

playback.on("timeupdate", (time) => {
  progressBar.style.width = `${(time / playback.getDuration()) * 100}%`;
});

playback.on("ended", () => {
  console.log("Playback finished");
});
```
