// ---------------------------------------------------------------------------
// Stretcher: Chunk player with double-buffering and gapless playback
// ---------------------------------------------------------------------------

import { CROSSFADE_SEC, LOOKAHEAD_INTERVAL_MS, LOOKAHEAD_THRESHOLD_SEC } from "./constants.js";
import { calcTransitionDelay } from "./transition-timing.js";
import type { ChunkPlayer, ChunkPlayerOptions } from "./types.js";

const CURVE_LENGTH = 256;

function createEqualPowerCurve(fadeIn: boolean): Float32Array {
  const curve = new Float32Array(CURVE_LENGTH);
  for (let i = 0; i < CURVE_LENGTH; i++) {
    const t = i / (CURVE_LENGTH - 1);
    curve[i] = fadeIn ? Math.sin((t * Math.PI) / 2) : Math.cos((t * Math.PI) / 2);
  }
  return curve;
}

const fadeInCurve = createEqualPowerCurve(true);
const fadeOutCurve = createEqualPowerCurve(false);

/**
 * Create a chunk player that manages gapless playback of converted chunks.
 */
export function createChunkPlayer(ctx: AudioContext, options: ChunkPlayerOptions): ChunkPlayer {
  const destination = options.destination ?? ctx.destination;
  const through = options.through ?? [];
  const crossfadeSec = options.crossfadeSec ?? CROSSFADE_SEC;

  let currentSource: AudioBufferSourceNode | null = null;
  let nextSource: AudioBufferSourceNode | null = null;
  let currentGain: GainNode | null = null;
  let nextGain: GainNode | null = null;

  // Position tracking
  let playStartCtxTime = 0; // ctx.currentTime when playback started
  let playStartOffset = 0; // offset within the chunk at start
  let currentChunkDuration = 0;
  let nextStartCtxTime = 0; // scheduleNext で次ソースの AudioContext 開始時刻
  let paused = false;
  let pausedPosition = 0;
  let stopped = true;

  let lookaheadTimer: ReturnType<typeof setInterval> | null = null;
  let transitionTimerId: ReturnType<typeof setTimeout> | null = null;
  let onChunkEnded: (() => void) | null = null;
  let onNeedNext: (() => void) | null = null;
  let onTransition: (() => void) | null = null;
  let disposed = false;

  function connectToDestination(node: AudioNode): void {
    if (through.length > 0) {
      node.connect(through[0]!);
      for (let i = 0; i < through.length - 1; i++) {
        through[i]!.connect(through[i + 1]!);
      }
      through[through.length - 1]!.connect(destination);
    } else {
      node.connect(destination);
    }
  }

  function createSourceFromBuffer(buffer: AudioBuffer, gain: GainNode): AudioBufferSourceNode {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(gain);
    connectToDestination(gain);
    return src;
  }

  function stopCurrentSource(): void {
    if (currentSource) {
      currentSource.onended = null;
      try {
        currentSource.stop();
      } catch {
        // Already stopped
      }
      currentSource.disconnect();
      currentSource = null;
    }
    if (currentGain) {
      currentGain.disconnect();
      currentGain = null;
    }
  }

  function stopNextSource(): void {
    if (nextSource) {
      nextSource.onended = null;
      try {
        nextSource.stop();
      } catch {
        // Already stopped
      }
      nextSource.disconnect();
      nextSource = null;
    }
    if (nextGain) {
      nextGain.disconnect();
      nextGain = null;
    }
  }

  function startLookahead(): void {
    if (lookaheadTimer !== null) return;
    lookaheadTimer = setInterval(() => {
      if (paused || stopped || disposed) return;

      const pos = getElapsedInChunk();
      const remaining = currentChunkDuration - pos;

      if (remaining <= LOOKAHEAD_THRESHOLD_SEC && !nextSource) {
        onNeedNext?.();
      }
    }, LOOKAHEAD_INTERVAL_MS);
  }

  function stopLookahead(): void {
    if (lookaheadTimer !== null) {
      clearInterval(lookaheadTimer);
      lookaheadTimer = null;
    }
  }

  function cancelTransition(): void {
    if (transitionTimerId !== null) {
      clearTimeout(transitionTimerId);
      transitionTimerId = null;
    }
  }

  function doTransition(buffer: AudioBuffer, startCtxTime: number): void {
    stopCurrentSource();
    currentSource = nextSource;
    currentGain = nextGain;
    nextSource = null;
    nextGain = null;

    currentChunkDuration = buffer.duration;
    playStartOffset = 0;
    playStartCtxTime = startCtxTime;

    if (currentSource) {
      currentSource.onended = handleCurrentSourceEnded;
    }

    onTransition?.();
  }

  function handleCurrentSourceEnded(): void {
    if (disposed || paused || stopped) return;
    if (nextSource) {
      const buf = nextSource.buffer;
      if (!buf) {
        onChunkEnded?.();
        return;
      }
      cancelTransition();
      doTransition(buf, nextStartCtxTime);
    } else {
      onChunkEnded?.();
    }
  }

  function getElapsedInChunk(): number {
    if (paused) return pausedPosition;
    if (stopped) return 0;
    return ctx.currentTime - playStartCtxTime + playStartOffset;
  }

  function playChunk(buffer: AudioBuffer, _startTime: number, offsetInChunk: number = 0): void {
    cancelTransition();
    stopCurrentSource();
    stopNextSource();

    currentGain = ctx.createGain();
    currentSource = createSourceFromBuffer(buffer, currentGain);
    currentChunkDuration = buffer.duration;
    playStartOffset = offsetInChunk;
    playStartCtxTime = ctx.currentTime;
    paused = false;
    stopped = false;

    currentSource.onended = handleCurrentSourceEnded;

    currentSource.start(0, offsetInChunk);

    // Apply equal-power fade-in
    if (crossfadeSec > 0) {
      currentGain.gain.setValueCurveAtTime(fadeInCurve, ctx.currentTime, crossfadeSec);
    }

    startLookahead();
  }

  function scheduleNext(buffer: AudioBuffer, startTime: number): void {
    if (disposed) return;

    stopNextSource();

    nextGain = ctx.createGain();
    nextSource = createSourceFromBuffer(buffer, nextGain);

    nextSource.onended = handleCurrentSourceEnded;

    nextStartCtxTime = startTime - crossfadeSec;
    nextSource.start(nextStartCtxTime);

    // Equal-power crossfade: fade out current, fade in next
    if (crossfadeSec > 0 && currentGain) {
      currentGain.gain.setValueCurveAtTime(fadeOutCurve, nextStartCtxTime, crossfadeSec);
      nextGain.gain.setValueCurveAtTime(fadeInCurve, nextStartCtxTime, crossfadeSec);
    }

    // After transition, promote next to current
    const transitionDelay = calcTransitionDelay(startTime, ctx.currentTime);
    cancelTransition();
    transitionTimerId = setTimeout(() => {
      transitionTimerId = null;
      if (disposed || !nextSource) return;
      doTransition(buffer, nextStartCtxTime);
    }, transitionDelay);
  }

  function handleSeek(buffer: AudioBuffer, offsetInChunk: number): void {
    playChunk(buffer, 0, offsetInChunk);
  }

  function pause(): void {
    if (paused || stopped || disposed) return;
    pausedPosition = getElapsedInChunk();
    paused = true;
    cancelTransition();
    stopCurrentSource();
    stopNextSource();
    stopLookahead();
  }

  function resume(): void {
    // Resume needs a new buffer — the engine will call playChunk again.
    // paused フラグは playChunk() が解除する。
    if (!paused || disposed) return;
  }

  function stop(): void {
    if (stopped || disposed) return;
    stopped = true;
    paused = false;
    pausedPosition = 0;
    cancelTransition();
    stopCurrentSource();
    stopNextSource();
    stopLookahead();
  }

  function getCurrentPosition(): number {
    return getElapsedInChunk();
  }

  function hasNextScheduled(): boolean {
    return nextSource !== null;
  }

  return {
    playChunk,
    scheduleNext,
    hasNextScheduled,
    handleSeek,
    pause,
    resume,
    stop,
    getCurrentPosition,
    setOnChunkEnded(callback: () => void): void {
      onChunkEnded = callback;
    },
    setOnNeedNext(callback: () => void): void {
      onNeedNext = callback;
    },
    setOnTransition(callback: () => void): void {
      onTransition = callback;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      cancelTransition();
      stopCurrentSource();
      stopNextSource();
      stopLookahead();
    },
  };
}
