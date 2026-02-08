---
title: adapters
description: Framework integration utilities
---

Utilities for integrating waa-play with UI frameworks. Provides snapshot-based state access compatible with React's `useSyncExternalStore` and animation frame loops.

```ts
import {
  getSnapshot,
  subscribeSnapshot,
  onFrame,
  whenEnded,
  whenPosition,
} from "waa-play/adapters";
```

## `getSnapshot()`

```ts
getSnapshot(playback: Playback): PlaybackSnapshot;
```

Get an immutable snapshot of the current playback state. Returns a cached object that only changes when state actually updates, making it compatible with `useSyncExternalStore`.

```ts
const snap = getSnapshot(playback);
// { state: "playing", position: 12.5, duration: 180, progress: 0.069 }
```

### PlaybackSnapshot

```ts
interface PlaybackSnapshot {
  state: PlaybackState;
  position: number;
  duration: number;
  progress: number;
  stretcher?: StretcherSnapshotExtension;
}
```

## `subscribeSnapshot()`

```ts
subscribeSnapshot(playback: Playback, callback: (snap: PlaybackSnapshot) => void): () => void;
```

Subscribe to playback state changes. The callback fires whenever state, position, or other properties change. Returns an unsubscribe function.

```ts
const unsub = subscribeSnapshot(playback, (snap) => {
  updateUI(snap.state, snap.progress);
});
```

## `onFrame()`

```ts
onFrame(playback: Playback, callback: (snap: PlaybackSnapshot) => void): () => void;
```

Start an animation frame loop that calls the callback with a fresh snapshot on every frame. Ideal for smooth visual updates like progress bars and waveform cursors. Returns a cleanup function that stops the loop.

```ts
const stop = onFrame(playback, (snap) => {
  cursor.style.left = `${snap.progress * 100}%`;
});

// Later: stop the animation loop
stop();
```

## `whenEnded()`

```ts
whenEnded(playback: Playback): Promise<void>;
```

Returns a Promise that resolves when the playback ends naturally (not by calling `stop()`).

```ts
await whenEnded(playback);
console.log("Track finished");
```

## `whenPosition()`

```ts
whenPosition(playback: Playback, position: number): Promise<void>;
```

Returns a Promise that resolves when the playback reaches the specified position in seconds.

```ts
await whenPosition(playback, 30);
console.log("Reached 30 seconds");
```

## React Integration

Use `getSnapshot` and `subscribeSnapshot` with React's `useSyncExternalStore` for tear-free state reads:

```tsx
import { useSyncExternalStore } from "react";
import { getSnapshot, subscribeSnapshot } from "waa-play/adapters";

function usePlayback(playback: Playback) {
  return useSyncExternalStore(
    (cb) => subscribeSnapshot(playback, cb),
    () => getSnapshot(playback),
  );
}

function Player({ playback }: { playback: Playback }) {
  const snap = usePlayback(playback);

  return (
    <div>
      <span>{snap.state}</span>
      <progress value={snap.progress} />
      <button onClick={() => playback.togglePlayPause()}>
        {snap.state === "playing" ? "Pause" : "Play"}
      </button>
    </div>
  );
}
```
