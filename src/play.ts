// ---------------------------------------------------------------------------
// M3: Playback engine
// ---------------------------------------------------------------------------

import { createEmitter } from "./emitter.js";
import { calcPlaybackPosition } from "./playback-position.js";
import { createPlaybackStateManager } from "./playback-state.js";
import type {
  Playback,
  PlaybackEventMap,
  PlayOptions,
  StretcherSnapshotExtension,
} from "./types.js";

/**
 * Play an `AudioBuffer` through an `AudioContext` and return a controllable
 * `Playback` handle.
 *
 * ```ts
 * const pb = play(ctx, buffer, { loop: true });
 * pb.on("timeupdate", ({ position }) => console.log(position));
 * pb.pause();
 * pb.resume();
 * pb.seek(10);
 * pb.stop();
 * pb.dispose();
 * ```
 */
export function play(ctx: AudioContext, buffer: AudioBuffer, options?: PlayOptions): Playback {
  const { preservePitch = true } = options ?? {};

  // ----- Pitch-preserving mode (WSOLA-based time-stretch) -----
  if (preservePitch) {
    return createStretchedPlayback(ctx, buffer, options ?? {});
  }

  const {
    offset: initialOffset = 0,
    loop = false,
    loopStart,
    loopEnd,
    playbackRate: initialRate = 1,
    through = [],
    destination = ctx.destination,
    timeupdateInterval = 50,
  } = options ?? {};

  const emitter = createEmitter<PlaybackEventMap>();
  const duration = buffer.duration;

  // ----- mutable internal state -----
  let sourceNode: AudioBufferSourceNode | null = null;
  let startedAt = 0; // ctx.currentTime when playback last started/resumed
  let pausedAt = initialOffset; // position in the buffer (seconds)
  let currentRate = initialRate > 0 ? initialRate : 1;
  let isLooping = loop;

  const sm = createPlaybackStateManager({
    initialState: "stopped",
    onStateChange: (next) => emitter.emit("statechange", { state: next }),
    onTimerTick: () => {
      emitter.emit("timeupdate", {
        position: getCurrentTime(),
        duration,
      });
    },
    timerInterval: timeupdateInterval,
  });

  // ----- helpers -----

  function createSource(): AudioBufferSourceNode {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = currentRate;
    src.loop = isLooping;
    if (loopStart !== undefined) src.loopStart = loopStart;
    if (loopEnd !== undefined) src.loopEnd = loopEnd;

    // Connect through the node chain (or directly to destination).
    if (through.length > 0) {
      src.connect(through[0]!);
      for (let i = 0; i < through.length - 1; i++) {
        through[i]!.connect(through[i + 1]!);
      }
      through[through.length - 1]!.connect(destination);
    } else {
      src.connect(destination);
    }

    src.onended = handleEnded;
    return src;
  }

  function startSource(positionInBuffer: number) {
    sourceNode = createSource();
    sourceNode.start(0, positionInBuffer);
    startedAt = ctx.currentTime - positionInBuffer / currentRate;
  }

  function stopSource() {
    if (sourceNode) {
      sourceNode.onended = null;
      try {
        sourceNode.stop();
      } catch {
        // Already stopped — safe to ignore.
      }
      sourceNode.disconnect();
      sourceNode = null;
    }
  }

  function handleEnded() {
    // If we manually stopped / paused, the handler was already removed.
    if (sm.getState() !== "playing") return;
    if (isLooping) {
      emitter.emit("loop", undefined as never);
      return;
    }
    sm.setState("stopped");
    pausedAt = 0;
    sm.stopTimer();
    emitter.emit("ended", undefined as never);
  }

  // ----- public API -----

  function getCurrentTime(): number {
    const state = sm.getState();
    const elapsed = state === "playing" ? (ctx.currentTime - startedAt) * currentRate : 0;
    return calcPlaybackPosition(state, elapsed, duration, pausedAt, isLooping, loopStart, loopEnd);
  }

  function pause() {
    if (sm.getState() !== "playing" || sm.isDisposed()) return;
    pausedAt = getCurrentTime();
    stopSource();
    sm.stopTimer();
    sm.setState("paused");
    emitter.emit("pause", undefined as never);
  }

  function resume() {
    if (sm.getState() !== "paused" || sm.isDisposed()) return;
    startSource(pausedAt);
    sm.setState("playing");
    sm.startTimer();
    emitter.emit("resume", undefined as never);
  }

  function togglePlayPause() {
    if (sm.getState() === "playing") pause();
    else if (sm.getState() === "paused") resume();
  }

  function seek(position: number) {
    if (sm.isDisposed()) return;
    const clamped = Math.max(0, Math.min(position, duration));
    const wasPlaying = sm.getState() === "playing";

    stopSource();
    sm.stopTimer();

    pausedAt = clamped;

    if (wasPlaying) {
      startSource(clamped);
      sm.startTimer();
    }

    emitter.emit("seek", { position: clamped });
  }

  function stop() {
    if (sm.getState() === "stopped" || sm.isDisposed()) return;
    stopSource();
    sm.stopTimer();
    pausedAt = 0;
    sm.setState("stopped");
    emitter.emit("stop", undefined as never);
  }

  function setPlaybackRate(rate: number) {
    if (rate <= 0) return;
    const position = getCurrentTime();
    currentRate = rate;
    if (sourceNode) {
      sourceNode.playbackRate.value = rate;
      startedAt = ctx.currentTime - position / rate;
    }
  }

  function setLoop(value: boolean) {
    isLooping = value;
    if (sourceNode) {
      sourceNode.loop = value;
    }
  }

  function dispose() {
    if (sm.isDisposed()) return;
    sm.markDisposed();
    stopSource();
    emitter.clear();
  }

  // ----- kick off initial playback -----

  startSource(initialOffset);
  sm.setState("playing");
  sm.startTimer();
  emitter.emit("play", undefined as never);

  return {
    getState: () => sm.getState(),
    getCurrentTime,
    getDuration: () => duration,
    getProgress: () => (duration > 0 ? getCurrentTime() / duration : 0),
    pause,
    resume,
    togglePlayPause,
    seek,
    stop,
    setPlaybackRate,
    setLoop,
    on: emitter.on.bind(emitter) as Playback["on"],
    off: emitter.off.bind(emitter) as Playback["off"],
    dispose,
  };
}

// ---------------------------------------------------------------------------
// Stretched playback (preservePitch: true)
// ---------------------------------------------------------------------------

function createStretchedPlayback(
  ctx: AudioContext,
  buffer: AudioBuffer,
  options: PlayOptions,
): Playback {
  const {
    offset: initialOffset = 0,
    loop = false,
    playbackRate: initialRate = 1,
    through = [],
    destination = ctx.destination,
    timeupdateInterval = 50,
  } = options;

  const emitter = createEmitter<PlaybackEventMap>();
  const duration = buffer.duration;

  let engineInstance: import("./stretcher/types.js").StretcherEngine | null = null;
  let currentRate = initialRate > 0 ? initialRate : 1;
  let isLooping = loop;
  let pendingSeek: number | null = null;

  const sm = createPlaybackStateManager({
    initialState: "playing",
    onStateChange: (next) => emitter.emit("statechange", { state: next }),
    onTimerTick: () => {
      emitter.emit("timeupdate", {
        position: getCurrentTime(),
        duration,
      });
    },
    timerInterval: timeupdateInterval,
  });

  // Emit initial play event
  emitter.emit("statechange", { state: "playing" });
  emitter.emit("play", undefined as never);

  // Fire-and-forget dynamic import of the stretcher engine
  import("./stretcher/engine.js")
    .then(({ createStretcherEngine }) => {
      if (sm.isDisposed()) return;

      engineInstance = createStretcherEngine(ctx, buffer, {
        tempo: currentRate,
        offset: initialOffset,
        loop: isLooping,
        through,
        destination,
        timeupdateInterval,
      });

      // Wire stretcher events to playback events
      engineInstance.on("buffering", (data) => {
        if (sm.isDisposed()) return;
        emitter.emit("buffering", data);
      });

      engineInstance.on("buffered", (data) => {
        if (sm.isDisposed()) return;
        emitter.emit("buffered", data);
      });

      engineInstance.on("loop", () => {
        if (sm.isDisposed()) return;
        emitter.emit("loop", undefined as never);
      });

      engineInstance.on("ended", () => {
        if (sm.isDisposed()) return;
        if (sm.getState() === "stopped") return;
        sm.stopTimer();
        sm.setState("stopped");
        emitter.emit("ended", undefined as never);
      });

      engineInstance.on("error", (data) => {
        if (sm.isDisposed()) return;
        if (data.fatal) {
          sm.setState("stopped");
          emitter.emit("ended", undefined as never);
        }
      });

      // Start engine and timeupdate timer
      engineInstance.start();
      sm.startTimer();

      // Apply pending seek if any
      if (pendingSeek !== null) {
        engineInstance.seek(pendingSeek);
        pendingSeek = null;
      }

      // If we were paused before the engine loaded, pause it
      if (sm.getState() === "paused") {
        engineInstance.pause();
      } else if (sm.getState() === "stopped") {
        engineInstance.stop();
      }
    })
    .catch(() => {
      if (sm.isDisposed()) return;
      sm.stopTimer();
      sm.setState("stopped");
      emitter.emit("ended", undefined as never);
    });

  function getCurrentTime(): number {
    if (pendingSeek !== null) {
      return pendingSeek;
    }
    if (engineInstance) {
      return engineInstance.getCurrentPosition();
    }
    return initialOffset;
  }

  function pause() {
    if (sm.getState() !== "playing" || sm.isDisposed()) return;
    engineInstance?.pause();
    sm.stopTimer();
    sm.setState("paused");
    emitter.emit("pause", undefined as never);
  }

  function resume() {
    if (sm.getState() !== "paused" || sm.isDisposed()) return;
    engineInstance?.resume();
    sm.startTimer();
    sm.setState("playing");
    emitter.emit("resume", undefined as never);
  }

  function togglePlayPause() {
    if (sm.getState() === "playing") pause();
    else if (sm.getState() === "paused") resume();
  }

  function seek(position: number) {
    if (sm.isDisposed()) return;
    const clamped = Math.max(0, Math.min(position, duration));
    if (engineInstance) {
      engineInstance.seek(clamped);
    } else {
      pendingSeek = clamped;
    }
    emitter.emit("seek", { position: clamped });
  }

  function stop() {
    if (sm.getState() === "stopped" || sm.isDisposed()) return;
    engineInstance?.stop();
    sm.stopTimer();
    sm.setState("stopped");
    emitter.emit("stop", undefined as never);
  }

  function setPlaybackRate(rate: number) {
    if (rate <= 0) return;
    currentRate = rate;
    if (engineInstance) {
      engineInstance.setTempo(rate);
    }
  }

  function setLoop(value: boolean) {
    isLooping = value;
    engineInstance?.setLoop(value);
  }

  function dispose() {
    if (sm.isDisposed()) return;
    sm.markDisposed();
    engineInstance?.dispose();
    emitter.clear();
  }

  function _getStretcherSnapshot(): StretcherSnapshotExtension | null {
    if (!engineInstance) return null;
    return engineInstance.getSnapshot();
  }

  const playback: Playback & {
    _getStretcherSnapshot: typeof _getStretcherSnapshot;
  } = {
    getState: () => sm.getState(),
    getCurrentTime,
    getDuration: () => duration,
    getProgress: () => (duration > 0 ? getCurrentTime() / duration : 0),
    pause,
    resume,
    togglePlayPause,
    seek,
    stop,
    setPlaybackRate,
    setLoop,
    on: emitter.on.bind(emitter) as Playback["on"],
    off: emitter.off.bind(emitter) as Playback["off"],
    dispose,
    _getStretcherSnapshot,
  };

  return playback;
}
