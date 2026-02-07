// ---------------------------------------------------------------------------
// M3: Playback engine
// ---------------------------------------------------------------------------

import { createEmitter } from "./emitter.js";
import type {
  Playback,
  PlaybackEventMap,
  PlaybackState,
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
export function play(
  ctx: AudioContext,
  buffer: AudioBuffer,
  options?: PlayOptions,
): Playback {
  const { preservePitch = false } = options ?? {};

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
  let state: PlaybackState = "stopped";
  let sourceNode: AudioBufferSourceNode | null = null;
  let startedAt = 0; // ctx.currentTime when playback last started/resumed
  let pausedAt = initialOffset; // position in the buffer (seconds)
  let currentRate = initialRate;
  let isLooping = loop;
  let timerId: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

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
    if (state !== "playing") return;
    if (isLooping) {
      emitter.emit("loop", undefined as never);
      return;
    }
    setState("stopped");
    pausedAt = 0;
    stopTimer();
    emitter.emit("ended", undefined as never);
  }

  function setState(next: PlaybackState) {
    if (state === next) return;
    state = next;
    emitter.emit("statechange", { state: next });
  }

  function startTimer() {
    if (timerId !== null) return;
    timerId = setInterval(() => {
      if (state !== "playing") return;
      emitter.emit("timeupdate", {
        position: getCurrentTime(),
        duration,
      });
    }, timeupdateInterval);
  }

  function stopTimer() {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  // ----- public API -----

  function getCurrentTime(): number {
    if (state === "playing") {
      const elapsed = (ctx.currentTime - startedAt) * currentRate;
      if (isLooping) {
        const loopDur =
          (loopEnd ?? duration) - (loopStart ?? 0);
        return ((elapsed - (loopStart ?? 0)) % loopDur) + (loopStart ?? 0);
      }
      return Math.min(elapsed, duration);
    }
    if (state === "paused") return pausedAt;
    return 0;
  }

  function pause() {
    if (state !== "playing" || disposed) return;
    pausedAt = getCurrentTime();
    stopSource();
    stopTimer();
    setState("paused");
    emitter.emit("pause", undefined as never);
  }

  function resume() {
    if (state !== "paused" || disposed) return;
    startSource(pausedAt);
    setState("playing");
    startTimer();
    emitter.emit("resume", undefined as never);
  }

  function togglePlayPause() {
    if (state === "playing") pause();
    else if (state === "paused") resume();
  }

  function seek(position: number) {
    if (disposed) return;
    const clamped = Math.max(0, Math.min(position, duration));
    const wasPlaying = state === "playing";

    stopSource();
    stopTimer();

    pausedAt = clamped;

    if (wasPlaying) {
      startSource(clamped);
      startTimer();
    }

    emitter.emit("seek", { position: clamped });
  }

  function stop() {
    if (state === "stopped" || disposed) return;
    stopSource();
    stopTimer();
    pausedAt = 0;
    setState("stopped");
    emitter.emit("stop", undefined as never);
  }

  function setPlaybackRate(rate: number) {
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
    if (disposed) return;
    disposed = true;
    stopSource();
    stopTimer();
    emitter.clear();
  }

  // ----- kick off initial playback -----

  startSource(initialOffset);
  setState("playing");
  startTimer();
  emitter.emit("play", undefined as never);

  return {
    getState: () => state,
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
    playbackRate: initialRate = 1,
    through = [],
    destination = ctx.destination,
    timeupdateInterval = 50,
  } = options;

  const emitter = createEmitter<PlaybackEventMap>();
  const duration = buffer.duration;

  let state: PlaybackState = "playing";
  let engineInstance: import("./stretcher/types.js").StretcherEngine | null =
    null;
  let timerId: ReturnType<typeof setInterval> | null = null;
  let disposed = false;
  let currentRate = initialRate;

  // Emit initial play event
  emitter.emit("statechange", { state: "playing" });
  emitter.emit("play", undefined as never);

  // Fire-and-forget dynamic import of the stretcher engine
  import("./stretcher/engine.js").then(({ createStretcherEngine }) => {
    if (disposed) return;

    engineInstance = createStretcherEngine(ctx, buffer, {
      tempo: currentRate,
      offset: initialOffset,
      through,
      destination,
      timeupdateInterval,
    });

    // Wire stretcher events to playback events
    engineInstance.on("buffering", (data) => {
      if (disposed) return;
      emitter.emit("buffering", data);
    });

    engineInstance.on("buffered", (data) => {
      if (disposed) return;
      emitter.emit("buffered", data);
    });

    engineInstance.on("ended", () => {
      if (disposed) return;
      state = "stopped";
      stopTimer();
      emitter.emit("statechange", { state: "stopped" });
      emitter.emit("ended", undefined as never);
    });

    engineInstance.on("error", (data) => {
      if (disposed) return;
      if (data.fatal) {
        state = "stopped";
        emitter.emit("statechange", { state: "stopped" });
        emitter.emit("ended", undefined as never);
      }
    });

    // Start engine and timeupdate timer
    engineInstance.start();
    startTimer();

    // If we were paused before the engine loaded, pause it
    if (state === "paused") {
      engineInstance.pause();
    } else if (state === "stopped") {
      engineInstance.stop();
    }
  });

  function startTimer() {
    if (timerId !== null) return;
    timerId = setInterval(() => {
      if (state !== "playing" || disposed) return;
      emitter.emit("timeupdate", {
        position: getCurrentTime(),
        duration,
      });
    }, timeupdateInterval);
  }

  function stopTimer() {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function getCurrentTime(): number {
    if (engineInstance) {
      return engineInstance.getCurrentPosition();
    }
    return initialOffset;
  }

  function pause() {
    if (state !== "playing" || disposed) return;
    state = "paused";
    engineInstance?.pause();
    stopTimer();
    emitter.emit("statechange", { state: "paused" });
    emitter.emit("pause", undefined as never);
  }

  function resume() {
    if (state !== "paused" || disposed) return;
    state = "playing";
    engineInstance?.resume();
    startTimer();
    emitter.emit("statechange", { state: "playing" });
    emitter.emit("resume", undefined as never);
  }

  function togglePlayPause() {
    if (state === "playing") pause();
    else if (state === "paused") resume();
  }

  function seek(position: number) {
    if (disposed) return;
    const clamped = Math.max(0, Math.min(position, duration));
    engineInstance?.seek(clamped);
    emitter.emit("seek", { position: clamped });
  }

  function stop() {
    if (state === "stopped" || disposed) return;
    state = "stopped";
    engineInstance?.stop();
    stopTimer();
    emitter.emit("statechange", { state: "stopped" });
    emitter.emit("stop", undefined as never);
  }

  function setPlaybackRate(rate: number) {
    currentRate = rate;
    if (engineInstance) {
      engineInstance.setTempo(rate);
    }
  }

  function setLoop(_value: boolean) {
    // Loop is not supported in stretcher mode
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stopTimer();
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
    getState: () => state,
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
