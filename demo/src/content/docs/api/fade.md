---
title: fade
description: Fade in/out and crossfade utilities
---

Utilities for fading audio in and out using `GainNode` automation.

```ts
import { fadeIn, fadeOut, crossfade, autoFade } from "waa-play/fade";
```

## `fadeIn()`

```ts
fadeIn(gain: GainNode, target: number, options?: FadeOptions): void;
```

Fade a GainNode from `0` to the target value.

```ts
const gain = createGain(ctx, 0);
fadeIn(gain, 1, { duration: 2, curve: "exponential" });
```

## `fadeOut()`

```ts
fadeOut(gain: GainNode, options?: FadeOptions): void;
```

Fade a GainNode from its current value to `0`.

```ts
fadeOut(gain, { duration: 1.5 });
```

## `crossfade()`

```ts
crossfade(gainA: GainNode, gainB: GainNode, options?: CrossfadeOptions): void;
```

Crossfade between two GainNodes. `gainA` fades out while `gainB` fades in.

```ts
crossfade(gainA, gainB, {
  duration: 2,
  curve: "equal-power",
});
```

## `autoFade()`

```ts
autoFade(playback: Playback, gain: GainNode, options?: AutoFadeOptions): () => void;
```

Automatically apply fade-in when playback starts and fade-out before the track ends. Returns a cleanup function that removes the event listeners.

```ts
const cleanup = autoFade(playback, gain, {
  fadeIn: 1,
  fadeOut: 2,
  curve: "exponential",
});

// Later: remove auto-fade listeners
cleanup();
```

## Options

### FadeOptions

```ts
interface FadeOptions {
  duration?: number;
  curve?: FadeCurve;
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `duration` | `number` | `1` | Fade duration in seconds |
| `curve` | `FadeCurve` | `"linear"` | Fade curve type |

### FadeCurve

```ts
type FadeCurve = "linear" | "exponential" | "equal-power";
```

| Curve | Description |
|-------|-------------|
| `"linear"` | Linear volume ramp |
| `"exponential"` | Exponential curve, more natural sounding |
| `"equal-power"` | Equal-power curve, ideal for crossfades |

### AutoFadeOptions

```ts
interface AutoFadeOptions {
  fadeIn?: number;
  fadeOut?: number;
  curve?: FadeCurve;
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `fadeIn` | `number` | `1` | Fade-in duration in seconds |
| `fadeOut` | `number` | `1` | Fade-out duration in seconds |
| `curve` | `FadeCurve` | `"linear"` | Fade curve type |
