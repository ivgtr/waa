---
title: context
description: AudioContext lifecycle utilities
---

Utilities for creating and managing the `AudioContext` lifecycle.

```ts
import { createContext, resumeContext, ensureRunning, now } from "waa-play/context";
```

## `createContext()`

```ts
createContext(options?: CreateContextOptions): AudioContext;
```

Create a new `AudioContext` with optional configuration.

```ts
const ctx = createContext();
const ctx = createContext({ sampleRate: 48000 });
const ctx = createContext({ sampleRate: 44100, latencyHint: "playback" });
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `options.sampleRate` | `number` | Sample rate in Hz |
| `options.latencyHint` | `AudioContextLatencyCategory \| number` | Latency preference |

### Returns

A new `AudioContext` instance.

## `resumeContext()`

```ts
resumeContext(ctx: AudioContext): Promise<void>;
```

Resume a suspended AudioContext. Browsers suspend contexts created before user interaction. Call this from a user gesture handler.

```ts
button.addEventListener("click", async () => {
  await resumeContext(ctx);
});
```

## `ensureRunning()`

```ts
ensureRunning(ctx: AudioContext): Promise<void>;
```

Ensure the AudioContext is in the `"running"` state. If suspended, it will be resumed. Safe to call multiple times.

```ts
await ensureRunning(ctx);
// ctx.state === "running"
```

## `now()`

```ts
now(ctx: AudioContext): number;
```

Shorthand for `ctx.currentTime`. Returns the current time of the audio hardware clock in seconds.

```ts
const currentTime = now(ctx);
```
