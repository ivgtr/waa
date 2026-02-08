---
title: synth
description: Buffer synthesis utilities
---

Generate synthetic audio buffers programmatically. Useful for testing, UI sounds, and metronome clicks.

```ts
import { createSineBuffer, createNoiseBuffer, createClickBuffer } from "waa-play/synth";
```

## `createSineBuffer()`

```ts
createSineBuffer(ctx: AudioContext, frequency: number, duration: number): AudioBuffer;
```

Generate a sine wave buffer at the specified frequency and duration.

```ts
const tone = createSineBuffer(ctx, 440, 1); // 440 Hz A4, 1 second
play(ctx, tone);
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `ctx` | `AudioContext` | The AudioContext (determines sample rate) |
| `frequency` | `number` | Frequency in Hz |
| `duration` | `number` | Duration in seconds |

## `createNoiseBuffer()`

```ts
createNoiseBuffer(ctx: AudioContext, duration: number): AudioBuffer;
```

Generate a white noise buffer.

```ts
const noise = createNoiseBuffer(ctx, 0.5); // 500ms of white noise
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `ctx` | `AudioContext` | The AudioContext (determines sample rate) |
| `duration` | `number` | Duration in seconds |

## `createClickBuffer()`

```ts
createClickBuffer(ctx: AudioContext, frequency: number, duration: number): AudioBuffer;
```

Generate a short click/tick buffer. Useful for metronome sounds.

```ts
const click = createClickBuffer(ctx, 1000, 0.02); // 1kHz click, 20ms
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `ctx` | `AudioContext` | The AudioContext (determines sample rate) |
| `frequency` | `number` | Frequency of the click in Hz |
| `duration` | `number` | Duration in seconds |
