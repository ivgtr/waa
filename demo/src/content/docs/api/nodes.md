---
title: nodes
description: Audio node factories and routing
---

Factory functions for creating Web Audio nodes and utilities for connecting them.

```ts
import {
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
} from "waa-play/nodes";
```

## Node Factories

### `createGain()`

```ts
createGain(ctx: AudioContext, initialValue?: number): GainNode;
```

Create a `GainNode` with an optional initial value (default `1`).

```ts
const gain = createGain(ctx, 0.5);
```

### `createAnalyser()`

```ts
createAnalyser(ctx: AudioContext, options?: {
  fftSize?: number;
  smoothingTimeConstant?: number;
}): AnalyserNode;
```

Create an `AnalyserNode` for frequency/time-domain analysis.

```ts
const analyser = createAnalyser(ctx, {
  fftSize: 2048,
  smoothingTimeConstant: 0.8,
});
```

### `createFilter()`

```ts
createFilter(ctx: AudioContext, options?: {
  type?: BiquadFilterType;
  frequency?: number;
  Q?: number;
  gain?: number;
}): BiquadFilterNode;
```

Create a `BiquadFilterNode`.

```ts
const lowpass = createFilter(ctx, {
  type: "lowpass",
  frequency: 1000,
  Q: 1,
});
```

### `createPanner()`

```ts
createPanner(ctx: AudioContext, pan?: number): StereoPannerNode;
```

Create a `StereoPannerNode`. `pan` ranges from `-1` (left) to `1` (right), default `0`.

```ts
const panner = createPanner(ctx, -0.5); // Slightly left
```

### `createCompressor()`

```ts
createCompressor(ctx: AudioContext, options?: {
  threshold?: number;
  knee?: number;
  ratio?: number;
  attack?: number;
  release?: number;
}): DynamicsCompressorNode;
```

Create a `DynamicsCompressorNode`.

```ts
const compressor = createCompressor(ctx, {
  threshold: -24,
  ratio: 12,
  attack: 0.003,
  release: 0.25,
});
```

## Utility Functions

### `rampGain()`

```ts
rampGain(gain: GainNode, target: number, duration: number): void;
```

Smooth linear ramp of a GainNode's value to the target over the specified duration in seconds.

```ts
rampGain(gain, 0.8, 0.5); // Ramp to 0.8 over 500ms
```

### `getFrequencyData()`

```ts
getFrequencyData(analyser: AnalyserNode): Float32Array;
```

Get frequency data as `Float32Array` (values in dB).

```ts
const data = getFrequencyData(analyser);
```

### `getFrequencyDataByte()`

```ts
getFrequencyDataByte(analyser: AnalyserNode): Uint8Array;
```

Get frequency data as `Uint8Array` (values 0-255).

```ts
const data = getFrequencyDataByte(analyser);
```

## Routing

### `chain()`

```ts
chain(...nodes: AudioNode[]): void;
```

Connect audio nodes in series. Each node is connected to the next.

```ts
chain(source, gain, filter, ctx.destination);
// source -> gain -> filter -> destination
```

### `disconnectChain()`

```ts
disconnectChain(...nodes: AudioNode[]): void;
```

Disconnect previously chained nodes.

```ts
disconnectChain(source, gain, filter, ctx.destination);
```
