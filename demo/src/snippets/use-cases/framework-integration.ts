export const reactHookPlayer = `import { useSyncExternalStore, useRef, useCallback } from "react";
import { WaaPlayer } from "waa-play";
import type { Playback, PlaybackSnapshot } from "waa-play";

// Shared WaaPlayer instance
const waa = new WaaPlayer();

function usePlaybackSnapshot(playback: Playback | null): PlaybackSnapshot | null {
  const subscribe = useCallback(
    (callback: () => void) => {
      if (!playback) return () => {};
      return waa.subscribeSnapshot(playback, callback);
    },
    [playback],
  );
  const snap = useCallback(
    () => (playback ? waa.getSnapshot(playback) : null),
    [playback],
  );
  return useSyncExternalStore(subscribe, snap, snap);
}

// Usage example
function AudioPlayer({ url }: { url: string }) {
  const playbackRef = useRef<Playback | null>(null);
  const snapshot = usePlaybackSnapshot(playbackRef.current);

  async function handlePlay() {
    await waa.ensureRunning();
    const buffer = await waa.load(url);
    playbackRef.current = waa.play(buffer);
  }

  return (
    <div>
      <button onClick={handlePlay}>Play</button>
      {snapshot && (
        <div>
          <p>State: {snapshot.state}</p>
          <p>Position: {snapshot.position.toFixed(1)}s / {snapshot.duration.toFixed(1)}s</p>
          <progress value={snapshot.progress} max={1} />
        </div>
      )}
    </div>
  );
}` as const;

export const reactHookFn = `import { useSyncExternalStore, useRef, useCallback } from "react";
import { subscribeSnapshot, getSnapshot, play, loadBuffer, ensureRunning } from "waa-play/adapters";
import type { Playback, PlaybackSnapshot } from "waa-play";

function usePlaybackSnapshot(playback: Playback | null): PlaybackSnapshot | null {
  const subscribe = useCallback(
    (callback: () => void) => {
      if (!playback) return () => {};
      return subscribeSnapshot(playback, callback);
    },
    [playback],
  );
  const snap = useCallback(
    () => (playback ? getSnapshot(playback) : null),
    [playback],
  );
  return useSyncExternalStore(subscribe, snap, snap);
}

// Usage example
function AudioPlayer({ url }: { url: string }) {
  const ctxRef = useRef<AudioContext>(new AudioContext());
  const playbackRef = useRef<Playback | null>(null);
  const snapshot = usePlaybackSnapshot(playbackRef.current);

  async function handlePlay() {
    const ctx = ctxRef.current;
    await ensureRunning(ctx);
    const buffer = await loadBuffer(ctx, url);
    playbackRef.current = play(ctx, buffer);
  }

  return (
    <div>
      <button onClick={handlePlay}>Play</button>
      {snapshot && (
        <div>
          <p>State: {snapshot.state}</p>
          <p>Position: {snapshot.position.toFixed(1)}s / {snapshot.duration.toFixed(1)}s</p>
          <progress value={snapshot.progress} max={1} />
        </div>
      )}
    </div>
  );
}` as const;

export const promiseWaitPlayer = `import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();
const buffer = await waa.load("/audio/track.mp3");
const playback = waa.play(buffer);

// Wait for playback to complete
await waa.whenEnded(playback);
console.log("Playback completed");

// Wait for a specific position
const playback2 = waa.play(buffer);
await waa.whenPosition(playback2, 10); // 10 second mark
console.log("Reached 10 seconds");` as const;

export const promiseWaitFn = `import { createContext, ensureRunning, loadBuffer, play } from "waa-play";
import { whenEnded, whenPosition } from "waa-play/adapters";

const ctx = createContext();
await ensureRunning(ctx);
const buffer = await loadBuffer(ctx, "/audio/track.mp3");
const playback = play(ctx, buffer);

// Wait for playback to complete
await whenEnded(playback);
console.log("Playback completed");

// Wait for a specific position
const playback2 = play(ctx, buffer);
await whenPosition(playback2, 10); // 10 second mark
console.log("Reached 10 seconds");` as const;

export const smoothAnimationPlayer = `import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();
const buffer = await waa.load("/audio/track.mp3");

const progressBar = document.querySelector(".progress-bar") as HTMLElement;
const timeDisplay = document.querySelector(".time") as HTMLElement;

const playback = waa.play(buffer);

// Update UI every frame with onFrame
const stopFrame = waa.onFrame(playback, (snapshot) => {
  // Progress bar
  progressBar.style.width = \`\${snapshot.progress * 100}%\`;

  // Time display
  const pos = snapshot.position;
  const dur = snapshot.duration;
  timeDisplay.textContent = \`\${formatTime(pos)} / \${formatTime(dur)}\`;
});

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return \`\${m}:\${s.toString().padStart(2, "0")}\`;
}

// Cleanup
playback.on("ended", () => stopFrame());` as const;

export const smoothAnimationFn = `import { createContext, ensureRunning, loadBuffer, play } from "waa-play";
import { onFrame } from "waa-play/adapters";

const ctx = createContext();
await ensureRunning(ctx);
const buffer = await loadBuffer(ctx, "/audio/track.mp3");

const progressBar = document.querySelector(".progress-bar") as HTMLElement;
const timeDisplay = document.querySelector(".time") as HTMLElement;

const playback = play(ctx, buffer);

// Update UI every frame with onFrame
const stopFrame = onFrame(playback, (snapshot) => {
  // Progress bar
  progressBar.style.width = \`\${snapshot.progress * 100}%\`;

  // Time display
  const pos = snapshot.position;
  const dur = snapshot.duration;
  timeDisplay.textContent = \`\${formatTime(pos)} / \${formatTime(dur)}\`;
});

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return \`\${m}:\${s.toString().padStart(2, "0")}\`;
}

// Cleanup
playback.on("ended", () => stopFrame());` as const;
