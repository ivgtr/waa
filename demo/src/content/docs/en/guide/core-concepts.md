---
title: Core Concepts
description: Key design patterns and architecture of waa-play
---

## BYO AudioContext

Every function in waa-play takes an `AudioContext` as its first argument. The library never creates or stores a global context behind the scenes.

```ts
import { play } from "waa-play/play";
import { loadBuffer } from "waa-play/buffer";

const ctx = new AudioContext();
const buffer = await loadBuffer(ctx, "/audio/track.mp3");
const pb = play(ctx, buffer);
```

This gives you full control over context lifecycle, sample rate, latency hints, and offline rendering.

`WaaPlayer` wraps this pattern for convenience — it creates and manages an `AudioContext` internally, but the underlying design remains the same.

## Playback State Machine

The `Playback` object returned by `play()` follows a simple state machine:

```
playing → paused → playing → stopped
playing → stopped
```

- **playing** — audio is actively outputting. Position advances based on `AudioContext.currentTime` (hardware-clock accuracy, not JavaScript timers).
- **paused** — audio output is suspended. Position is frozen at the pause point.
- **stopped** — terminal state. The source node is released and cannot be restarted. Create a new `Playback` to play again.

```ts
const pb = play(ctx, buffer);

pb.pause();           // playing → paused
pb.resume();          // paused → playing
pb.stop();            // → stopped (from any state)

console.log(pb.state) // "playing" | "paused" | "stopped"
```

## Event System

Playback emits type-safe events via an `on` / `off` pattern:

```ts
pb.on("statechange", ({ state }) => {
  console.log("new state:", state);
});

pb.on("timeupdate", ({ position, duration, progress }) => {
  console.log(`${position.toFixed(1)}s / ${duration.toFixed(1)}s`);
});

pb.on("ended", () => {
  console.log("playback finished");
});
```

**Background tab support**: `timeupdate` fires via `setInterval`, not `requestAnimationFrame`. This means position updates keep working even when the browser tab is in the background.

## Tree-shaking

waa-play is split into 11 independent modules (plus the `WaaPlayer` class entry), each with its own subpath export. Your bundler only includes the modules you actually import.

```ts
// Only the play and buffer modules end up in your bundle
import { play } from "waa-play/play";
import { loadBuffer } from "waa-play/buffer";
```

If you use `WaaPlayer` from the top-level `waa-play` import, all modules are included since the class wraps them all.

## Pitch-preserving Time-stretch

The `stretcher` module provides real-time tempo change without altering pitch, using the WSOLA (Waveform Similarity Overlap-Add) algorithm.

- **Web Worker processing** — WSOLA runs in a separate thread, keeping the main thread responsive.
- **Streaming architecture** — the source audio is split into chunks, converted at the target tempo, and buffered for gapless playback.
- **Real-time tempo control** — change the tempo during playback; the stretcher re-processes upcoming chunks on the fly.

```ts
import { createStretcher } from "waa-play/stretcher";

const stretcher = createStretcher(ctx, buffer, {
  tempo: 0.8, // 80% speed, original pitch
});

stretcher.play();
stretcher.setTempo(1.2); // speed up mid-playback
```
