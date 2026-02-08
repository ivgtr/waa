export const reactPlayerDemo = `import { useState, useMemo, useSyncExternalStore, useRef, useCallback } from "react";
import { WaaPlayer, getSnapshot, subscribeSnapshot } from "waa-play";
import type { Playback, PlaybackSnapshot, PeakPair } from "waa-play";

function usePlaybackSnapshot(playback: Playback | null): PlaybackSnapshot | null {
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

function Player({ buffer }: { buffer: AudioBuffer }) {
  const playerRef = useRef(new WaaPlayer());
  const [playback, setPlayback] = useState<Playback | null>(null);
  const snap = usePlaybackSnapshot(playback);
  const peaks = useMemo(
    () => playerRef.current.extractPeakPairs(buffer, { resolution: 200 }),
    [buffer],
  );

  return (
    <div>
      <Waveform peaks={peaks} progress={snap?.progress ?? 0} />
      <button
        onClick={() => {
          if (!playback) {
            setPlayback(playerRef.current.play(buffer));
          } else {
            playback.togglePlayPause();
          }
        }}
      >
        {snap?.state === "playing" ? "Pause" : "Play"}
      </button>
      <span>
        {snap?.position.toFixed(1)}s / {snap?.duration.toFixed(1)}s
      </span>
    </div>
  );
}` as const;
