export const reactPlayerDemo = `import { useCallback, useSyncExternalStore, useState, useMemo, useRef } from "react";
import { WaaPlayer, getSnapshot, subscribeSnapshot } from "waa-play";
import type { Playback, PlaybackSnapshot, PeakPair } from "waa-play";

// --- hooks ---

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

function useReactPlayer() {
  const waaRef = useRef(new WaaPlayer());
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [loop, setLoop] = useState(true);
  const snap = usePlaybackSnapshot(playback);
  const peaks = useMemo(
    () => (buffer ? waaRef.current.extractPeakPairs(buffer, { resolution: 200 }) : []),
    [buffer],
  );

  async function handleGenerate() {
    const waa = waaRef.current;
    await waa.ensureRunning();
    if (playback && playback.getState() !== "stopped") playback.stop();
    setPlayback(null);
    setBuffer(waa.createSineBuffer(440, 3));
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const waa = waaRef.current;
    await waa.ensureRunning();
    setPlayback(null);
    setBuffer(await waa.loadFromBlob(file));
  }

  function handleToggle() {
    if (!buffer) return;
    if (!playback || playback.getState() === "stopped") {
      if (playback) playback.dispose();
      setPlayback(waaRef.current.play(buffer, { loop }));
    } else {
      playback.togglePlayPause();
    }
  }

  function handleStop() {
    playback?.stop();
  }

  function handleSeek(ratio: number) {
    if (playback && buffer) {
      playback.seek(ratio * buffer.duration);
    }
  }

  function handleLoopToggle() {
    const next = !loop;
    setLoop(next);
    if (playback) playback.setLoop(next);
  }

  return { buffer, snap, peaks, loop, handleGenerate, handleFile, handleToggle, handleStop, handleSeek, handleLoopToggle };
}

// --- component ---

export default function ReactPlayerDemo() {
  const { buffer, snap, peaks, loop, handleGenerate, handleFile, handleToggle, handleStop, handleSeek, handleLoopToggle } =
    useReactPlayer();
  const state = snap?.state ?? "stopped";

  return (
    <div>
      <button onClick={handleGenerate}>Generate Sine</button>
      <input type="file" accept="audio/*" onChange={handleFile} />
      {buffer && (
        <>
          <Waveform peaks={peaks} progress={snap?.progress ?? 0} onSeek={handleSeek} />
          <span>{formatTime(snap?.position ?? 0)} / {formatTime(snap?.duration ?? 0)}</span>
          <button onClick={handleToggle}>
            {state === "playing" ? "Pause" : "Play"}
          </button>
          <button onClick={handleStop} disabled={state === "stopped"}>
            Stop
          </button>
          <label>
            <input type="checkbox" checked={loop} onChange={handleLoopToggle} />
            Loop
          </label>
        </>
      )}
    </div>
  );
}` as const;
