---
title: API Reference
description: Complete API reference for waa-play
---

waa-play provides two ways to work with Web Audio:

## WaaPlayer (Class API)

A single class that wraps all modules, managing its own `AudioContext` internally. Best for applications that want a simple, unified interface.

```ts
import { WaaPlayer } from "waa-play";

const player = new WaaPlayer();
const buffer = await player.load("/audio/track.mp3");
const playback = player.play(buffer);
```

[WaaPlayer reference](/waa/api/player/)

## Function API

Individual, tree-shakeable functions grouped by module. Each function takes an `AudioContext` as its first argument (BYO Context pattern). Best for libraries, advanced use cases, or when you need minimal bundle size.

```ts
import { createContext } from "waa-play/context";
import { loadBuffer } from "waa-play/buffer";
import { play } from "waa-play/play";

const ctx = createContext();
const buffer = await loadBuffer(ctx, "/audio/track.mp3");
const playback = play(ctx, buffer);
```

### Modules

| Module | Purpose |
|--------|---------|
| [context](/waa/api/context/) | AudioContext lifecycle |
| [buffer](/waa/api/buffer/) | Audio file loading |
| [play](/waa/api/play/) | Core playback engine |
| [emitter](/waa/api/emitter/) | Type-safe event emitter |
| [nodes](/waa/api/nodes/) | Audio node factories and routing |
| [waveform](/waa/api/waveform/) | Peak/RMS extraction |
| [fade](/waa/api/fade/) | Fade in/out and crossfade |
| [scheduler](/waa/api/scheduler/) | Lookahead scheduler and BPM clock |
| [synth](/waa/api/synth/) | Buffer synthesis |
| [adapters](/waa/api/adapters/) | Framework integration |
| [stretcher](/waa/api/stretcher/) | Pitch-preserving time-stretch |

### Types

All shared type definitions are documented in the [Types reference](/waa/api/types/).
