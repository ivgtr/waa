// ---------------------------------------------------------------------------
// Stretcher: Chunk player with double-buffering and gapless playback
// ---------------------------------------------------------------------------

import { CROSSFADE_SEC, LOOKAHEAD_INTERVAL_MS, LOOKAHEAD_THRESHOLD_SEC } from "./constants.js";
import type { ChunkPlayer, ChunkPlayerOptions } from "./types.js";

/**
 * Create a chunk player that manages gapless playback of converted chunks.
 */
export function createChunkPlayer(
  ctx: AudioContext,
  options: ChunkPlayerOptions,
): ChunkPlayer {
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

  function createSourceFromBuffer(
    buffer: AudioBuffer,
    gain: GainNode,
  ): AudioBufferSourceNode {
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

  function getElapsedInChunk(): number {
    if (paused) return pausedPosition;
    if (stopped) return 0;
    return (ctx.currentTime - playStartCtxTime) + playStartOffset;
  }

  function playChunk(
    buffer: AudioBuffer,
    _startTime: number,
    offsetInChunk: number = 0,
  ): void {
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

    currentSource.onended = () => {
      if (!disposed && !paused && !stopped) {
        onChunkEnded?.();
      }
    };

    currentSource.start(0, offsetInChunk);

    // Apply fade-in
    if (crossfadeSec > 0) {
      currentGain.gain.setValueAtTime(0, ctx.currentTime);
      currentGain.gain.linearRampToValueAtTime(
        1,
        ctx.currentTime + crossfadeSec,
      );
    }

    startLookahead();
  }

  function scheduleNext(buffer: AudioBuffer, startTime: number): void {
    if (disposed) return;

    stopNextSource();

    nextGain = ctx.createGain();
    nextSource = createSourceFromBuffer(buffer, nextGain);

    nextSource.onended = () => {
      if (!disposed && !paused && !stopped) {
        onChunkEnded?.();
      }
    };

    nextSource.start(startTime);

    // Crossfade: fade out current, fade in next
    if (crossfadeSec > 0 && currentGain) {
      currentGain.gain.setValueAtTime(1, startTime - crossfadeSec);
      currentGain.gain.linearRampToValueAtTime(0, startTime);

      nextGain.gain.setValueAtTime(0, startTime - crossfadeSec);
      nextGain.gain.linearRampToValueAtTime(1, startTime);
    }

    // After transition, promote next to current
    const transitionDelay = Math.max(
      0,
      (startTime - ctx.currentTime) * 1000 + 50,
    );
    cancelTransition();
    transitionTimerId = setTimeout(() => {
      transitionTimerId = null;
      if (disposed) return;
      stopCurrentSource();
      currentSource = nextSource;
      currentGain = nextGain;
      nextSource = null;
      nextGain = null;

      currentChunkDuration = buffer.duration;
      playStartOffset = 0;
      playStartCtxTime = startTime;

      onTransition?.();
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
    // Resume needs a new buffer — the engine will call playChunk again
    if (!paused || disposed) return;
    paused = false;
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

  return {
    playChunk,
    scheduleNext,
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
