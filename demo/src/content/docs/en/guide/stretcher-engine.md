---
title: Stretcher Engine
description: Three-layer architecture and design decisions of the Stretcher module
---

The Stretcher module provides pitch-preserving time-stretch capabilities. Internally it is composed of **three independent functional layers**.

```
┌─────────────────────────────────────────────┐
│           play() Integration Layer           │
│         createStretchedPlayback()            │
├──────────┬──────────────┬───────────────────┤
│  Engine  │ Chunk Buffer │  Status Manager   │
│  (WSOLA) │ (split/play) │  (Phase/Health)   │
├──────────┴──────────────┴───────────────────┤
│          Worker Pool / Fallback              │
└─────────────────────────────────────────────┘
```

- **Engine** — Time-stretch processing via the WSOLA algorithm (this page)
- **Chunk Buffering** — Chunk splitting, prioritized conversion, double-buffered playback (→ [Chunk Buffering](/waa/en/guide/chunk-buffering/))
- **Status Management** — Phase transitions, Buffer Health, event management (→ [Status Management](/waa/en/guide/status-management/))

## WSOLA Algorithm

WSOLA (Waveform Similarity Overlap-Add) changes playback speed without altering pitch by overlapping audio frames based on waveform similarity.

The input audio is divided into fixed-size frames, and each frame is synthesized into the output buffer via overlap-add. By varying the input read interval, the output is stretched or compressed.

### Fixed synthesisHop and Pitch Preservation

The most important design decision in time-stretch is to **fix the output interval (synthesisHop) and make the input interval (analysisHop) depend on tempo**.

```
synthesisHop = fixed value             ← output is always synthesized at a constant interval
analysisHop  = synthesisHop × tempo    ← input read interval varies
```

- **Slow playback**: analysisHop shrinks, reading input more densely, so output stretches
- **Normal playback**: analysisHop = synthesisHop, input and output match
- **Fast playback**: analysisHop grows, reading input more sparsely, so output compresses

If you made synthesisHop variable instead, the output frame spacing would change, causing frequency shifts and altering the pitch. Fixing synthesisHop preserves the frequency structure of the output.

### Position Search via Normalized Cross-Correlation (NCC)

To find the optimal read position for each frame, the **cross-correlation** between the previous output frame and candidate positions in the input buffer is computed. Extracting the frame at the position with the highest correlation preserves waveform continuity and minimizes artifacts.

The reason for using **Normalized Cross-Correlation (NCC)** rather than plain cross-correlation is that it is **robust against amplitude differences**. Even at points where volume changes suddenly (fade-ins, fade-outs, dynamics changes), normalization allows comparison of waveform "shape" alone, enabling stable position searching.

## Parallel Processing via Worker Pool

WSOLA computation is CPU-intensive. Running it on the main thread would block audio playback and UI interaction. Offloading to Web Workers on separate threads preserves main thread responsiveness.

Multiple Workers are managed as a pool, and chunk conversion requests are dispatched to available Workers.

### Inline Worker (Blob URL) Approach

The typical approach to Workers references external `.js` files, which requires bundler configuration (webpack's `worker-loader`, Vite's `?worker` query, etc.) and burdens library consumers with setup.

Stretcher embeds Worker code as a JavaScript string in the bundle and spawns Workers via Blob URL. This means:

- Zero bundler configuration required
- No external file serving path to configure
- Works out of the box with just `npm install`

### Main Thread Fallback

Workers are not available in all environments:

- **Strict CSP**: Environments where `worker-src` or `blob:` is not permitted cannot create Blob URL Workers
- **Worker crashes**: Recovery when Workers crash repeatedly

A main-thread WSOLA fallback is provided for these cases. Parallelism is reduced, but functionality never stops completely.

## Integration with play()

When `preservePitch: true` is passed to `play()`, the Stretcher Engine is loaded via dynamic import internally. Since it shares the same interface as regular `play()`, consumers don't need to be aware of internal chunk management or Worker control.
