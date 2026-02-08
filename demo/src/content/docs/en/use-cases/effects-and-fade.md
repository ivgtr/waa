---
title: Effects and Fade
description: How to implement audio effects and fade transitions with waa-play
---

This guide demonstrates how to implement audio effects and fade transitions using the `nodes`, `fade`, and `play` modules.

## Modules Used

- **nodes**: Audio node factory functions (`createGain`, `createPanner`, `chain`, etc.)
- **fade**: Fade in/out and crossfade utilities
- **play**: Core playback engine (routes effect chains via the `through` option)

## 1. Volume Control

Create a GainNode with `createGain()` and route it through the `play()` function's `through` option. Use `rampGain()` to smoothly change volume without click noise.

```ts
import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();

const buffer = await waa.load("/audio/track.mp3");
const gain = waa.createGain(0.5); // Initial volume 50%

const playback = waa.play(buffer, { through: [gain] });

// Ramp to 100% volume over 3 seconds
waa.rampGain(gain, 1.0, 3);
```

When you pass a GainNode to the `through` option, `play()` automatically connects the source to the gain node and then to the destination.

<details>
<summary>Function API</summary>

```ts
import { createContext, ensureRunning, loadBuffer } from "waa-play/context";
import { createGain, rampGain } from "waa-play/nodes";
import { play } from "waa-play/play";

const ctx = createContext();
await ensureRunning(ctx);

const buffer = await loadBuffer(ctx, "/audio/track.mp3");
const gain = createGain(ctx, 0.5);

const playback = play(ctx, buffer, { through: [gain] });
rampGain(gain, 1.0, 3);
```

</details>

## 2. Stereo Panning

Create a StereoPannerNode with `createPanner()` to control left-right panning. Values range from `-1` (left) to `1` (right).

```ts
import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();

const buffer = await waa.load("/audio/track.mp3");
const panner = waa.createPanner(0); // Center

const playback = waa.play(buffer, { through: [panner] });

// Pan left
panner.pan.value = -1;

// Pan right
panner.pan.value = 1;

// Back to center
panner.pan.value = 0;
```

<details>
<summary>Function API</summary>

```ts
import { createContext, ensureRunning, loadBuffer } from "waa-play/context";
import { createPanner } from "waa-play/nodes";
import { play } from "waa-play/play";

const ctx = createContext();
await ensureRunning(ctx);

const buffer = await loadBuffer(ctx, "/audio/track.mp3");
const panner = createPanner(ctx, 0);

const playback = play(ctx, buffer, { through: [panner] });
panner.pan.value = -1; // Left
```

</details>

## 3. Effect Chain

Combine multiple effects for rich sound processing. Pass an array of nodes to `through` to automatically chain them together.

```ts
import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();

const buffer = await waa.load("/audio/track.mp3");

// Build effect chain
const gain = waa.createGain(0.8);
const filter = waa.createBiquadFilter("lowpass", 1000);
const compressor = waa.createDynamicsCompressor();
const panner = waa.createPanner(0.5);

// Auto-chain: gain → filter → compressor → panner → destination
const playback = waa.play(buffer, {
  through: [gain, filter, compressor, panner],
});

// Adjust filter frequency
filter.frequency.value = 500;
```

When using the `through` option, `play()` automatically connects nodes, so `chain()` is not needed. Use `chain()` when building node graphs outside of `play()`.

<details>
<summary>Function API</summary>

Example using `chain()` to explicitly build a node graph:

```ts
import { createContext, ensureRunning, loadBuffer } from "waa-play/context";
import {
  createGain,
  createBiquadFilter,
  createDynamicsCompressor,
  createPanner,
  chain,
} from "waa-play/nodes";
import { play } from "waa-play/play";

const ctx = createContext();
await ensureRunning(ctx);

const buffer = await loadBuffer(ctx, "/audio/track.mp3");

const gain = createGain(ctx, 0.8);
const filter = createBiquadFilter(ctx, "lowpass", 1000);
const compressor = createDynamicsCompressor(ctx);
const panner = createPanner(ctx, 0.5);

// Explicitly connect with chain()
chain([gain, filter, compressor, panner]);

const playback = play(ctx, buffer, { through: [gain] });
```

</details>

## 4. Fade In/Out

Use `fadeIn()` and `fadeOut()` for smooth fade effects. `autoFade()` automates fades at playback start and end.

```ts
import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();

const buffer = await waa.load("/audio/track.mp3");
const gain = waa.createGain(0); // Start at 0 volume

const playback = waa.play(buffer, { through: [gain] });

// Fade in over 2 seconds (equal-power curve)
waa.fadeIn(gain, 1, { duration: 2, curve: "equal-power" });

// Fade out over 2 seconds
setTimeout(() => {
  waa.fadeOut(gain, { duration: 2 });
}, 5000);
```

Use `autoFade()` to automatically set fades at playback start and end.

```ts
import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();

const buffer = await waa.load("/audio/track.mp3");
const gain = waa.createGain(0);

const playback = waa.play(buffer, { through: [gain] });

// Fade in 1s at start, fade out 2s over the last 2 seconds
waa.autoFade(playback, gain, { fadeIn: 1, fadeOut: 2 });
```

<details>
<summary>Function API</summary>

```ts
import { createContext, ensureRunning, loadBuffer } from "waa-play/context";
import { createGain } from "waa-play/nodes";
import { play } from "waa-play/play";
import { fadeIn, fadeOut, autoFade } from "waa-play/fade";

const ctx = createContext();
await ensureRunning(ctx);

const buffer = await loadBuffer(ctx, "/audio/track.mp3");
const gain = createGain(ctx, 0);

const playback = play(ctx, buffer, { through: [gain] });

// Fade in
fadeIn(gain, 1, { duration: 2, curve: "equal-power" });

// Auto fade
autoFade(playback, gain, { fadeIn: 1, fadeOut: 2 });
```

</details>

## 5. DJ Crossfade

Crossfade between two tracks for seamless DJ-style transitions.

```ts
import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();

const bufferA = await waa.load("/audio/track-a.mp3");
const bufferB = await waa.load("/audio/track-b.mp3");

// Track A (full volume)
const gainA = waa.createGain(1);
const playbackA = waa.play(bufferA, { through: [gainA], loop: true });

// Track B (muted)
const gainB = waa.createGain(0);
const playbackB = waa.play(bufferB, { through: [gainB], loop: true });

// Crossfade from track A to track B over 3 seconds
setTimeout(() => {
  waa.crossfade(gainA, gainB, { duration: 3, curve: "equal-power" });
}, 5000);
```

`crossfade()` simultaneously fades one GainNode from 1 to 0 and the other from 0 to 1. Using `curve: "equal-power"` ensures a perceptually uniform volume during the crossfade.

<details>
<summary>Function API</summary>

```ts
import { createContext, ensureRunning, loadBuffer } from "waa-play/context";
import { createGain } from "waa-play/nodes";
import { play } from "waa-play/play";
import { crossfade } from "waa-play/fade";

const ctx = createContext();
await ensureRunning(ctx);

const bufferA = await loadBuffer(ctx, "/audio/track-a.mp3");
const bufferB = await loadBuffer(ctx, "/audio/track-b.mp3");

const gainA = createGain(ctx, 1);
const playbackA = play(ctx, bufferA, { through: [gainA], loop: true });

const gainB = createGain(ctx, 0);
const playbackB = play(ctx, bufferB, { through: [gainB], loop: true });

setTimeout(() => {
  crossfade(gainA, gainB, { duration: 3, curve: "equal-power" });
}, 5000);
```

</details>

## Related API

- [WaaPlayer](/waa/en/api/player/)
- [Function API](/waa/en/api/functions/)
