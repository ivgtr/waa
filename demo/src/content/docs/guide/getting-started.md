---
title: Getting Started
description: Install waa-play and start playing audio in minutes
---

## Installation

```bash
npm install waa-play
```

## Quick Start: Class API (WaaPlayer)

`WaaPlayer` wraps an `AudioContext` and exposes every module as a method. This is the easiest way to get started.

```ts
import { WaaPlayer } from "waa-play";

const player = new WaaPlayer();

// Generate a 440 Hz sine tone, 2 seconds long
const buffer = player.createSineBuffer(440, 2);

// Start playback — returns a Playback handle
const playback = player.play(buffer);

// Listen to position updates
playback.on("timeupdate", ({ position }) => console.log(position));

// Clean up when done
player.dispose();
```

## Quick Start: Function API (BYO AudioContext)

If you prefer full control, import individual functions and bring your own `AudioContext`. This approach is fully tree-shakeable.

```ts
import { createContext, ensureRunning, play } from "waa-play";
import { createSineBuffer } from "waa-play/synth";

const ctx = createContext();
await ensureRunning(ctx);

const buffer = createSineBuffer(ctx, 440, 2);
const pb = play(ctx, buffer);
```

Every function takes an `AudioContext` as its first argument, so there is never any hidden global state.

## Modules

waa-play is organized into 12 independent modules. Each module is a separate entry point, so bundlers can tree-shake unused code.

| Module | Import | Purpose |
|---|---|---|
| **player** | `waa-play` | `WaaPlayer` class — convenience wrapper around all modules |
| **context** | `waa-play/context` | AudioContext lifecycle (`createContext`, `ensureRunning`, `now`) |
| **buffer** | `waa-play/buffer` | Audio file loading (`loadBuffer`, `loadBufferFromBlob`) |
| **play** | `waa-play/play` | Core playback engine — returns a `Playback` handle |
| **emitter** | `waa-play/emitter` | Type-safe event emitter (`createEmitter<Events>()`) |
| **nodes** | `waa-play/nodes` | Audio node factories, `chain()` / `disconnectChain()` |
| **waveform** | `waa-play/waveform` | Peak / RMS extraction from `AudioBuffer` |
| **fade** | `waa-play/fade` | Fade in, fade out, crossfade utilities |
| **scheduler** | `waa-play/scheduler` | Lookahead scheduler and clock |
| **synth** | `waa-play/synth` | Buffer synthesis (sine, noise, click) |
| **adapters** | `waa-play/adapters` | Framework integration (`getSnapshot`, `subscribeSnapshot`, `onFrame`) |
| **stretcher** | `waa-play/stretcher` | WSOLA-based pitch-preserving time-stretch |
