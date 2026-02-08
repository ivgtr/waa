---
title: waveform
description: Peak and RMS extraction from AudioBuffer
---

Extract visual waveform data from `AudioBuffer` instances for rendering waveform displays.

```ts
import { extractPeaks, extractPeakPairs, extractRMS } from "waa-play/waveform";
```

## `extractPeaks()`

```ts
extractPeaks(buffer: AudioBuffer, options?: ExtractPeaksOptions): number[];
```

Extract normalized peak amplitudes from an AudioBuffer. Returns an array of values in the range `[0, 1]`.

```ts
const peaks = extractPeaks(buffer);
// [0.1, 0.45, 0.8, 0.62, ...]  (200 values by default)

const peaks = extractPeaks(buffer, { resolution: 500 });
// 500 peak values
```

## `extractPeakPairs()`

```ts
extractPeakPairs(buffer: AudioBuffer, options?: ExtractPeaksOptions): PeakPair[];
```

Extract min/max peak pairs for waveform rendering. Each pair represents the minimum and maximum sample value within a segment, suitable for drawing a mirrored waveform.

```ts
const pairs = extractPeakPairs(buffer, { resolution: 300 });
// [{ min: -0.8, max: 0.75 }, { min: -0.6, max: 0.62 }, ...]
```

### PeakPair

```ts
interface PeakPair {
  min: number;
  max: number;
}
```

## `extractRMS()`

```ts
extractRMS(buffer: AudioBuffer, options?: ExtractPeaksOptions): number[];
```

Extract RMS (Root Mean Square) loudness values from an AudioBuffer. Returns an array of values in the range `[0, 1]`. RMS provides a smoother representation of perceived loudness compared to peak values.

```ts
const rms = extractRMS(buffer);
// [0.05, 0.2, 0.35, 0.28, ...]
```

## Options

All extraction functions accept the same options:

```ts
interface ExtractPeaksOptions {
  resolution?: number;
  channel?: number;
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `resolution` | `number` | `200` | Number of data points to extract |
| `channel` | `number` | `0` | Channel index to analyze. Use `-1` to mix all channels |
