---
title: Status Management
description: Design decisions behind Phase transitions, Buffer Health, and hysteresis control
---

In addition to the standard `playing / paused / stopped` states, the Stretcher has its own **buffering** and **buffer health** state management. It pauses and resumes playback based on chunk conversion status and notifies the UI of buffer conditions.

## Phase Transitions

Stretcher playback state is managed through 5 Phases.

```
start()
  ↓
waiting ──→ buffering ──→ playing ←──→ paused
               ↑              │            │
               │              ↓            │
               └── underrun ──┘            │
                                           ↓
                              ended ←──────┘
```

| Phase | Description |
|-------|-------------|
| `waiting` | Initializing. Chunk splitting is complete, about to enter initial buffering |
| `buffering` | Playback suspended due to insufficient buffer. Waiting for chunk conversion |
| `playing` | Actively playing. The chunk player is outputting audio |
| `paused` | Paused by user action |
| `ended` | Final chunk playback complete |

Unlike a typical music player, Stretcher has a `buffering` state caused by real-time conversion. This follows the same concept as buffering in video streaming services — when conversion can't keep up with playback (underrun), playback automatically pauses and resumes once sufficient buffer has accumulated.

## Buffer Health

Buffer Health represents how much converted buffer is available ahead of the playback position, in graduated levels.

Consecutive converted chunks ahead of the playback position are counted, and the total time is classified into 4 levels (`healthy` / `low` / `critical` / `empty`).

```
Chunks:    [ready] [ready] [ready] [converting] [ready] [pending]
                                       ↑
                                  stops here
```

The key point is that counting stops at the first incomplete chunk. Even if there are isolated completed chunks further ahead, they are not included in the health calculation because playback requires continuity.

Exposing this graduated metric to the UI enables appropriate user feedback such as buffer status indicators or warnings.

## Hysteresis for Flicker Prevention

If the **same threshold** is used for both entering and exiting buffering, the state toggles rapidly when the buffer fluctuates near the threshold (the flickering problem).

```
Buffer seconds
  30 ─── healthy ───────────────────
  10 ─── low ───────────────────────
   5 ─── ← exit buffering ─────────   ↑ hysteresis gap
   3 ─── ← enter buffering ────────   ↓
   0 ─── empty ────────────────────
```

By introducing **hysteresis** — offsetting the entry and exit thresholds — the state remains stable even when the buffer fluctuates within this range. Once buffering starts, it doesn't end until the buffer exceeds the exit threshold, which is higher than the entry threshold.

This follows the same principle as thermostat temperature control. "Turn on cooling when it gets hot, turn it off when it's sufficiently cool" — the gap between start and stop prevents frequent toggling.

## Buffering Reason

The reason for entering buffering is communicated via the `buffering` event.

| Reason | Description |
|--------|-------------|
| `initial` | Initial buffering before first playback |
| `seek` | Chunk at seek target not yet converted |
| `tempo-change` | Existing chunks invalidated by tempo change |
| `underrun` | Playback caught up with conversion |

The UI can display different messages based on the reason. For example, "Loading..." for `initial` and "Buffering..." for `underrun`, providing meaningful feedback to the user.

## Events

The Stretcher emits events for playback state and buffer condition changes.

| Event | Description |
|-------|-------------|
| `buffering` | Buffering started (with reason) |
| `buffered` | Buffering ended (with stall duration) |
| `chunkready` | Chunk conversion complete |
| `progress` | Conversion progress update |
| `bufferhealth` | Buffer health update |
| `complete` | All chunks converted |
| `ended` | Playback fully complete |
| `error` | Conversion error |
