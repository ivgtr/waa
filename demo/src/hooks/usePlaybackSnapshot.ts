import { useCallback, useSyncExternalStore } from 'react';
import { getSnapshot, subscribeSnapshot } from 'waa';
import type { Playback, PlaybackSnapshot } from 'waa';

export function usePlaybackSnapshot(playback: Playback | null): PlaybackSnapshot | null {
  const subscribe = useCallback(
    (cb: () => void) => (playback ? subscribeSnapshot(playback, cb) : () => {}),
    [playback],
  );
  const snap = useCallback(
    () => (playback ? getSnapshot(playback) : null),
    [playback],
  );
  return useSyncExternalStore(subscribe, snap, snap);
}
