---
title: Chunk Buffering
description: Design decisions behind chunk splitting, double-buffered playback, and memory management
---

Rather than time-stretching the entire source audio at once, the Stretcher **splits it into chunks and converts/plays them incrementally**.

## Benefits of Chunk Splitting

Processing all at once has three problems:

1. **Initial latency**: Converting a 10-minute audio file in full takes seconds or more before playback can start. With chunk splitting, playback begins as soon as the first chunk is converted
2. **Memory usage**: Converted audio consumes memory separately from the original. Bulk conversion doubles memory usage for long audio. Per-chunk processing keeps only the necessary range in memory
3. **Tempo change handling**: When tempo changes, all conversion results become invalid. Bulk conversion requires starting over from scratch; chunk splitting only needs to reconvert chunks around the playback position

## Overlap and Crossfade

Adjacent chunks are split with slightly overlapping edges.

```
Input buffer: ████████████████████████████████████████████
              ├─chunk 0─┤
                      ├──┤ overlap
                      ├─chunk 1──┤
                               ├──┤ overlap
                               ├─chunk 2──┤
```

This overlapping region enables crossfading at chunk boundaries.

### Equal-Power Crossfade

Chunk connections use **equal-power crossfade**.

```
fadeIn(t)  = sin(t × π/2)     // 0 → 1
fadeOut(t) = cos(t × π/2)     // 1 → 0
```

With a simple linear crossfade, both signals are at half amplitude at the midpoint, causing the combined power to drop by about -6dB. Human hearing perceives this as a "volume dip."

Equal-power crossfade leverages the trigonometric identity (sin² + cos² = 1) to keep total energy constant at every point. This prevents click noise and volume fluctuations at chunk boundaries.

## Priority Scheduling

Chunk conversion is prioritized based on distance from the playback position.

- **Forward chunks (unplayed)** have high priority — they directly affect playback continuity
- **Backward chunks (already played)** have lower priority, but not zero — to prepare for the possibility of backward seeks

This forward-biased-but-backward-aware design ensures uninterrupted forward playback while minimizing buffering when seeks occur.

## Double-Buffered Playback

To seamlessly connect chunks, the playback engine manages **two AudioBufferSourceNodes** simultaneously.

```
Timeline →
current source: ████████████████████▓▓
next source:                       ▓▓████████████████████
                                   ^^
                            crossfade region
```

As the currently playing chunk (current) nears its end, the next chunk (next) is pre-scheduled and crossfaded during the overlap region. Once the transition completes, next is promoted to current.

With only a single source, a gap would occur between the end of one chunk and the start of the next. Managing two simultaneously achieves continuous, gap-free audio output.

The lookahead uses `setInterval` rather than `requestAnimationFrame` because it needs to work in background tabs.

## Memory Window Management

For long audio (tens of minutes to hours), keeping all chunk conversion results in memory would consume too much memory.

A **sliding window** centered on the playback position retains only a fixed number of chunks ahead and behind, releasing conversion results for chunks outside the window.

```
evicted  evicted  kept    kept    CURRENT  kept    kept    evicted
  ×        ×      ←──→    ←─→      ▶       ←─→    ←──→      ×
               behind                            ahead
```

- More chunks are retained ahead to provide ample read-ahead for playback
- A smaller number are retained behind to avoid reconversion for nearby backward seeks
- Released chunks are reconverted if needed again
