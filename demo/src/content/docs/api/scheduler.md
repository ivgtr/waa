---
title: scheduler
description: Lookahead scheduler and BPM clock
---

A lookahead-based event scheduler and a BPM clock for timing musical events with sample-accurate precision.

```ts
import { createScheduler, createClock } from "waa-play/scheduler";
```

## `createScheduler()`

```ts
createScheduler(ctx: AudioContext, options?: SchedulerOptions): Scheduler;
```

Create a lookahead-based event scheduler. Events are scheduled slightly ahead of time to ensure sample-accurate timing, compensating for JavaScript's imprecise timers.

```ts
const scheduler = createScheduler(ctx, {
  lookahead: 0.1,
  interval: 25,
});
```

### SchedulerOptions

```ts
interface SchedulerOptions {
  lookahead?: number;
  interval?: number;
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `lookahead` | `number` | `0.1` | How far ahead to schedule events, in seconds |
| `interval` | `number` | `25` | Timer interval in milliseconds |

### Scheduler Methods

#### `schedule()`

```ts
schedule(id: string, time: number, callback: (time: number) => void): void;
```

Schedule an event at a specific AudioContext time.

```ts
scheduler.schedule("kick", ctx.currentTime + 1, (time) => {
  // Trigger sound at precise `time`
});
```

#### `cancel()`

```ts
cancel(id: string): void;
```

Cancel a scheduled event by its ID.

```ts
scheduler.cancel("kick");
```

#### `start()`

```ts
start(): void;
```

Start the scheduler's timer loop.

#### `stop()`

```ts
stop(): void;
```

Stop the scheduler's timer loop.

#### `dispose()`

```ts
dispose(): void;
```

Stop the scheduler and release all resources.

## `createClock()`

```ts
createClock(ctx: AudioContext, options?: ClockOptions): Clock;
```

Create a BPM-based clock that converts beats to AudioContext time.

```ts
const clock = createClock(ctx, { bpm: 140 });
```

### ClockOptions

```ts
interface ClockOptions {
  bpm?: number;
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `bpm` | `number` | `120` | Beats per minute |

### Clock Methods

#### `beatToTime()`

```ts
beatToTime(beat: number): number;
```

Convert a beat number to an AudioContext time value.

```ts
const time = clock.beatToTime(4); // Time of beat 4
```

#### `getCurrentBeat()`

```ts
getCurrentBeat(): number;
```

Get the current beat number based on `ctx.currentTime`.

#### `getNextBeatTime()`

```ts
getNextBeatTime(): number;
```

Get the AudioContext time of the next beat.

#### `setBpm()`

```ts
setBpm(bpm: number): void;
```

Change the BPM.

```ts
clock.setBpm(160);
```

#### `getBpm()`

```ts
getBpm(): number;
```

Get the current BPM.
