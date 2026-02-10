// ---------------------------------------------------------------------------
// Stretcher: Engine — integrates all components
// ---------------------------------------------------------------------------

import { createEmitter } from "../emitter.js";
import { createBufferMonitor } from "./buffer-monitor.js";
import { createChunkPlayer } from "./chunk-player.js";
import { extractChunkData, getChunkIndexForTime, splitIntoChunks } from "./chunk-splitter.js";
import {
  CHUNK_DURATION_SEC,
  CROSSFADE_SEC,
  KEEP_AHEAD_CHUNKS,
  KEEP_AHEAD_SECONDS,
  KEEP_BEHIND_CHUNKS,
  KEEP_BEHIND_SECONDS,
  OVERLAP_SEC,
  PROACTIVE_SCHEDULE_THRESHOLD_SEC,
  WORKER_POOL_SIZE,
} from "./constants.js";
import { createConversionEstimator } from "./conversion-estimator.js";
import { createConversionScheduler } from "./conversion-scheduler.js";
import { createMainThreadProcessor } from "./main-thread-processor.js";
import { calcPositionInOriginalBuffer } from "./position-calc.js";
import type {
  ChunkInfo,
  StretcherEngine,
  StretcherEngineOptions,
  StretcherEvents,
  StretcherPlaybackState,
  StretcherSnapshotExtension,
  StretcherStatus,
  WorkerManager,
  WorkerResponse,
} from "./types.js";
import { createWorkerManager } from "./worker-manager.js";

/**
 * Trim overlap regions from WSOLA output so adjacent chunks don't double-play.
 */
export function trimOverlap(
  outputData: Float32Array[],
  outputLength: number,
  chunk: ChunkInfo,
  sampleRate: number,
): { data: Float32Array[]; length: number } {
  const inputLength = chunk.inputEndSample - chunk.inputStartSample;
  if (inputLength === 0 || outputLength === 0) {
    return { data: outputData, length: outputLength };
  }

  const ratio = outputLength / inputLength;
  const crossfadeKeep = Math.round(CROSSFADE_SEC * sampleRate * Math.min(1, ratio));
  const overlapBeforeOutput = Math.round(chunk.overlapBefore * ratio);
  const overlapAfterOutput = Math.round(chunk.overlapAfter * ratio);
  const keepBefore = chunk.overlapBefore > 0 ? Math.min(crossfadeKeep, overlapBeforeOutput) : 0;
  const trimStart = overlapBeforeOutput - keepBefore;
  const trimEnd = overlapAfterOutput;
  const newLength = outputLength - trimStart - trimEnd;

  if (newLength <= 0) {
    return { data: outputData, length: outputLength };
  }

  return {
    data: outputData.map((ch) => ch.slice(trimStart, trimStart + newLength)),
    length: newLength,
  };
}

function getCrossfadeStart(chunk: ChunkInfo): number {
  return chunk.overlapBefore > 0 ? CROSSFADE_SEC : 0;
}

/**
 * Create the stretcher engine that orchestrates all components.
 */
export function createStretcherEngine(
  ctx: AudioContext,
  buffer: AudioBuffer,
  options: StretcherEngineOptions,
): StretcherEngine {
  const {
    tempo: initialTempo,
    offset = 0,
    loop: initialLoop = false,
    through = [],
    destination = ctx.destination,
  } = options;

  const emitter = createEmitter<StretcherEvents>();
  const sampleRate = buffer.sampleRate;
  const totalDuration = buffer.duration;

  // State
  let phase: StretcherPlaybackState = "waiting";
  let currentTempo = initialTempo;
  let isLooping = initialLoop;
  let disposed = false;
  let bufferingStartTime = 0;
  let currentChunkIndex = 0;
  let bufferingResumePosition: number | null = null;
  let expectedTransitionFrom: number | null = null;
  let nextChunkScheduledIndex: number | null = null;
  let pendingTempoChange = false;

  // Memory management window
  const keepAhead = Math.max(KEEP_AHEAD_CHUNKS, Math.ceil(KEEP_AHEAD_SECONDS / CHUNK_DURATION_SEC));
  const keepBehind = Math.max(
    KEEP_BEHIND_CHUNKS,
    Math.ceil(KEEP_BEHIND_SECONDS / CHUNK_DURATION_SEC),
  );

  // Split buffer into chunks
  const chunks = splitIntoChunks(buffer.length, sampleRate, CHUNK_DURATION_SEC, OVERLAP_SEC);

  // Estimator
  const estimator = createConversionEstimator();

  // Buffer monitor
  const monitor = createBufferMonitor();

  // Worker manager (with main-thread fallback)
  const poolSize = options.workerPoolSize ?? WORKER_POOL_SIZE;

  function handleWorkerResult(response: WorkerResponse): void {
    if (disposed) return;
    if (response.type === "result") {
      const chunk = chunks[response.chunkIndex];
      if (chunk) {
        const postTime = workerManager.getPostTimeForChunk(response.chunkIndex);
        const elapsed = postTime !== null ? performance.now() - postTime : 0;
        estimator.recordConversion(elapsed);
        const trimmed = trimOverlap(
          response.outputData!,
          response.outputLength!,
          chunk,
          sampleRate,
        );
        schedulerInternal._handleResult(response.chunkIndex, trimmed.data, trimmed.length);
      }
    } else if (response.type === "cancelled") {
      const chunk = chunks[response.chunkIndex];
      if (chunk && chunk.state === "converting") {
        chunk.state = "queued";
      }
      scheduler.dispatchNext();
    }
  }

  function handleWorkerError(response: WorkerResponse): void {
    if (disposed) return;
    if (response.type === "error") {
      schedulerInternal._handleError(response.chunkIndex, response.error ?? "Unknown error");
    }
  }

  function switchToMainThread(): void {
    if (disposed) return;
    const fallback = createMainThreadProcessor(handleWorkerResult, handleWorkerError);
    // Replace the workerManager reference
    workerManager.terminate();
    Object.assign(workerManager, fallback);
  }

  const workerManager: WorkerManager = createWorkerManager(
    handleWorkerResult,
    handleWorkerError,
    undefined,
    poolSize,
    switchToMainThread,
  );

  // Conversion scheduler
  const schedulerInternal = createConversionScheduler(
    chunks,
    workerManager,
    (chunkIndex: number) => extractChunkData(buffer, chunks[chunkIndex]!),
    sampleRate,
    currentTempo,
    { keepAheadChunks: keepAhead, keepBehindChunks: keepBehind },
    onChunkReady,
    onChunkFailed,
  ) as ReturnType<typeof createConversionScheduler>;
  const scheduler = schedulerInternal;

  // Chunk player
  const chunkPlayer = createChunkPlayer(ctx, {
    through,
    destination,
    crossfadeSec: CROSSFADE_SEC,
  });

  chunkPlayer.setOnChunkEnded(() => {
    if (disposed || phase === "paused" || phase === "ended") return;
    advanceToNextChunk();
  });

  function tryScheduleNext(nextIdx: number): void {
    if (nextChunkScheduledIndex === nextIdx) return;
    if (nextIdx >= chunks.length) return;
    const nextChunk = chunks[nextIdx];
    if (!nextChunk || nextChunk.state !== "ready" || !nextChunk.outputBuffer) return;
    if (chunkPlayer.hasNextScheduled()) return;
    const curChunk = chunks[currentChunkIndex];
    const curOutputDuration = curChunk ? curChunk.outputLength / sampleRate : 0;
    const elapsed = chunkPlayer.getCurrentPosition();
    const remaining = curOutputDuration - elapsed;
    if (remaining <= 0) return;
    const audioBuffer = createAudioBufferFromChunk(nextChunk);
    if (!audioBuffer) return;
    const startTime = ctx.currentTime + remaining;
    expectedTransitionFrom = currentChunkIndex;
    chunkPlayer.scheduleNext(audioBuffer, startTime);
    nextChunkScheduledIndex = nextIdx;
  }

  chunkPlayer.setOnNeedNext(() => {
    if (disposed) return;
    tryScheduleNext(currentChunkIndex + 1);
  });

  chunkPlayer.setOnTransition(() => {
    if (disposed) return;
    if (expectedTransitionFrom !== null && currentChunkIndex !== expectedTransitionFrom) {
      return;
    }
    nextChunkScheduledIndex = null;
    const nextIdx = currentChunkIndex + 1;
    if (nextIdx < chunks.length) {
      currentChunkIndex = nextIdx;
      scheduler.updatePriorities(currentChunkIndex);
      evictDistantChunks();
    }
  });

  // --- Callbacks ---

  function onChunkReady(chunkIndex: number): void {
    if (disposed) return;

    emitter.emit("chunkready", { index: chunkIndex });
    emitProgress();
    emitBufferHealth();

    // If we're waiting or buffering and enough chunks are ready, start/resume
    if (phase === "waiting" || phase === "buffering") {
      if (monitor.shouldExitBuffering(currentChunkIndex, chunks)) {
        exitBuffering();
      }
    }

    // Proactively schedule next chunk when it becomes ready (background tab resilience)
    if (phase === "playing" && chunkIndex === currentChunkIndex + 1) {
      const curChunk = chunks[currentChunkIndex];
      const curOutputDuration = curChunk ? curChunk.outputLength / sampleRate : 0;
      const elapsed = chunkPlayer.getCurrentPosition();
      const remaining = curOutputDuration - elapsed;

      if (remaining <= PROACTIVE_SCHEDULE_THRESHOLD_SEC) {
        tryScheduleNext(chunkIndex);
      }
    }

    // Check if all chunks are done
    const allDone = chunks.every(
      (c) => c.state === "ready" || c.state === "skipped" || c.state === "evicted",
    );
    if (allDone) {
      emitter.emit("complete", undefined as never);
    }

    evictDistantChunks();
  }

  function onChunkFailed(chunkIndex: number, error: string): void {
    if (disposed) return;
    const chunk = chunks[chunkIndex];
    const fatal = chunk ? chunk.retryCount >= 3 : true;
    emitter.emit("error", { message: error, chunkIndex, fatal });
  }

  // --- Playback helpers ---

  function createAudioBufferFromChunk(chunk: ChunkInfo): AudioBuffer | null {
    if (!chunk.outputBuffer || chunk.outputLength === 0) return null;

    const numChannels = chunk.outputBuffer.length;
    const audioBuf = ctx.createBuffer(numChannels, chunk.outputLength, sampleRate);

    for (let ch = 0; ch < numChannels; ch++) {
      const channelData = chunk.outputBuffer[ch]!;
      audioBuf.getChannelData(ch).set(channelData.subarray(0, chunk.outputLength));
    }

    return audioBuf;
  }

  function playCurrentChunk(offsetInBuffer = 0, skipFadeIn = false): void {
    const chunk = chunks[currentChunkIndex];
    if (!chunk || chunk.state !== "ready" || !chunk.outputBuffer) return;

    const audioBuf = createAudioBufferFromChunk(chunk);
    if (!audioBuf) return;

    chunkPlayer.playChunk(audioBuf, ctx.currentTime, offsetInBuffer, skipFadeIn);
  }

  function advanceToNextChunk(): void {
    const nextIdx = currentChunkIndex + 1;
    if (nextIdx >= chunks.length) {
      if (isLooping) {
        currentChunkIndex = 0;
        scheduler.handleSeek(0);
        const chunk = chunks[0];
        if (chunk && chunk.state === "ready") {
          playCurrentChunk();
        } else {
          bufferingResumePosition = 0;
          enterBuffering("seek");
        }
        emitter.emit("loop", undefined as never);
        evictDistantChunks();
        return;
      }
      // Reached the end
      phase = "ended";
      chunkPlayer.stop();
      emitter.emit("ended", undefined as never);
      emitter.emit("bufferhealth", {
        health: monitor.getHealth(currentChunkIndex, chunks),
        aheadSeconds: monitor.getAheadSeconds(currentChunkIndex, chunks),
      });
      return;
    }

    currentChunkIndex = nextIdx;
    nextChunkScheduledIndex = null;
    scheduler.updatePriorities(currentChunkIndex);

    const chunk = chunks[currentChunkIndex];
    if (chunk && chunk.state === "ready") {
      playCurrentChunk(getCrossfadeStart(chunk));
    } else {
      const nextChunk = chunks[currentChunkIndex]!;
      const nominalStartSample = nextChunk.inputStartSample + nextChunk.overlapBefore;
      bufferingResumePosition = nominalStartSample / sampleRate;
      enterBuffering("underrun");
    }

    evictDistantChunks();
  }

  function enterBuffering(reason: "initial" | "seek" | "tempo-change" | "underrun"): void {
    if (phase === "ended") return;
    // Allow re-entering buffering for tempo-change and seek even if already buffering
    if (phase === "buffering" && reason !== "tempo-change" && reason !== "seek") return;
    phase = "buffering";
    bufferingStartTime = performance.now();
    nextChunkScheduledIndex = null;
    chunkPlayer.pause();
    emitter.emit("buffering", { reason });
  }

  function exitBuffering(): void {
    const stallDuration = performance.now() - bufferingStartTime;
    phase = "playing";
    emitter.emit("buffered", { stallDuration });

    if (bufferingResumePosition !== null) {
      const resumePos = bufferingResumePosition;
      bufferingResumePosition = null;

      const chunk = chunks[currentChunkIndex];
      if (chunk && chunk.state === "ready" && chunk.outputBuffer) {
        const nominalStartSample = chunk.inputStartSample + chunk.overlapBefore;
        const nominalStartSec = nominalStartSample / sampleRate;
        const offsetInOriginal = resumePos - nominalStartSec;
        const offsetInOutput = Math.max(0, offsetInOriginal / currentTempo);
        const outputDurationSec = chunk.outputLength / sampleRate;

        const MIN_PLAYABLE_SEC = 0.05;
        if (outputDurationSec > 0 && offsetInOutput >= outputDurationSec - MIN_PLAYABLE_SEC) {
          advanceToNextChunk();
          return;
        }

        playCurrentChunk(getCrossfadeStart(chunk) + offsetInOutput);
      } else {
        const cfChunk = chunks[currentChunkIndex];
        const cfStart = cfChunk ? getCrossfadeStart(cfChunk) : 0;
        playCurrentChunk(cfStart);
      }
    } else {
      const chunk = chunks[currentChunkIndex];
      const cfStart = chunk ? getCrossfadeStart(chunk) : 0;
      playCurrentChunk(cfStart);
    }
  }

  // --- Memory management ---

  function evictDistantChunks(): void {
    for (const chunk of chunks) {
      if (chunk.state !== "ready") continue;

      const dist = chunk.index - currentChunkIndex;
      if (dist > keepAhead || dist < -keepBehind) {
        chunk.outputBuffer = null;
        chunk.outputLength = 0;
        chunk.state = "evicted";
      }
    }
  }

  // --- Status & events ---

  function emitProgress(): void {
    const readyCount = chunks.filter((c) => c.state === "ready").length;
    const total = chunks.length;
    emitter.emit("progress", {
      total,
      ready: readyCount,
      progress: total > 0 ? readyCount / total : 0,
    });
  }

  function emitBufferHealth(): void {
    emitter.emit("bufferhealth", {
      health: monitor.getHealth(currentChunkIndex, chunks),
      aheadSeconds: monitor.getAheadSeconds(currentChunkIndex, chunks),
    });
  }

  function getPositionInOriginalBuffer(): number {
    const chunk = chunks[currentChunkIndex] ?? null;
    return calcPositionInOriginalBuffer({
      phase,
      totalDuration,
      offset,
      bufferingResumePosition,
      currentTempo,
      sampleRate,
      crossfadeSec: CROSSFADE_SEC,
      chunk: chunk
        ? { inputStartSample: chunk.inputStartSample, overlapBefore: chunk.overlapBefore }
        : null,
      posInChunk: chunkPlayer.getCurrentPosition(),
    });
  }

  function getStatus(): StretcherStatus {
    const readyCount = chunks.filter((c) => c.state === "ready").length;
    const convertingCount = chunks.filter((c) => c.state === "converting").length;
    const total = chunks.length;

    return {
      phase,
      conversion: {
        total,
        ready: readyCount,
        converting: convertingCount,
        progress: total > 0 ? readyCount / total : 0,
      },
      buffer: {
        health: monitor.getHealth(currentChunkIndex, chunks),
        aheadSeconds: monitor.getAheadSeconds(currentChunkIndex, chunks),
      },
      playback: {
        position: getPositionInOriginalBuffer(),
        duration: totalDuration,
        tempo: currentTempo,
      },
    };
  }

  function getSnapshot(): StretcherSnapshotExtension {
    const readyCount = chunks.filter((c) => c.state === "ready").length;
    const total = chunks.length;
    const convertingCount = chunks.filter((c) => c.state === "converting").length;

    const windowStart = Math.max(0, currentChunkIndex - keepBehind);
    const windowEnd = Math.min(total - 1, currentChunkIndex + keepAhead);
    const windowSize = windowEnd - windowStart + 1;
    const readyInWindow = chunks
      .slice(windowStart, windowEnd + 1)
      .filter((c) => c.state === "ready").length;

    return {
      tempo: currentTempo,
      converting: convertingCount > 0,
      conversionProgress: total > 0 ? readyCount / total : 0,
      bufferHealth: monitor.getHealth(currentChunkIndex, chunks),
      aheadSeconds: monitor.getAheadSeconds(currentChunkIndex, chunks),
      buffering: phase === "buffering" || phase === "waiting",
      chunkStates: chunks.map((c) => c.state),
      currentChunkIndex,
      activeWindowStart: windowStart,
      activeWindowEnd: windowEnd,
      totalChunks: total,
      windowConversionProgress: windowSize > 0 ? readyInWindow / windowSize : 0,
    };
  }

  // --- Public API ---

  function start(): void {
    if (disposed) return;

    currentChunkIndex = getChunkIndexForTime(chunks, offset, sampleRate);
    bufferingResumePosition = offset;
    phase = "waiting";
    enterBuffering("initial");

    scheduler.start(currentChunkIndex);
  }

  function pause(): void {
    if (disposed || phase === "ended") return;
    phase = "paused";
    chunkPlayer.pause();
  }

  function resume(): void {
    if (disposed || phase !== "paused") return;

    if (pendingTempoChange) {
      pendingTempoChange = false;
      currentChunkIndex = getChunkIndexForTime(chunks, bufferingResumePosition!, sampleRate);
      enterBuffering("tempo-change");
      scheduler.updatePriorities(currentChunkIndex);
      scheduler.handleTempoChange(currentTempo);
      return;
    }

    if (bufferingResumePosition !== null) {
      const resumePos = bufferingResumePosition;
      bufferingResumePosition = null;
      const chunk = chunks[currentChunkIndex];
      if (chunk && chunk.state === "ready" && chunk.outputBuffer) {
        const nominalStartSample = chunk.inputStartSample + chunk.overlapBefore;
        const nominalStartSec = nominalStartSample / sampleRate;
        const offsetInOriginal = resumePos - nominalStartSec;
        const offsetInOutput = Math.max(0, offsetInOriginal / currentTempo);
        phase = "playing";
        playCurrentChunk(getCrossfadeStart(chunk) + offsetInOutput, true);
      } else {
        bufferingResumePosition = resumePos;
        enterBuffering("seek");
      }
      return;
    }

    const chunk = chunks[currentChunkIndex];
    if (chunk && chunk.state === "ready") {
      const resumePosition = chunkPlayer.getCurrentPosition();
      phase = "playing";
      chunkPlayer.resume();
      playCurrentChunk(resumePosition, true);
    } else {
      enterBuffering("underrun");
    }
  }

  function seek(position: number): void {
    if (disposed) return;

    const clamped = Math.max(0, Math.min(position, totalDuration));
    const newChunkIdx = getChunkIndexForTime(chunks, clamped, sampleRate);
    currentChunkIndex = newChunkIdx;
    nextChunkScheduledIndex = null;

    scheduler.handleSeek(newChunkIdx);

    const chunk = chunks[newChunkIdx];
    if (chunk && chunk.state === "ready") {
      // Calculate offset within the chunk
      const nominalStartSample = chunk.inputStartSample + chunk.overlapBefore;
      const nominalStartSec = nominalStartSample / sampleRate;
      const offsetInOriginal = clamped - nominalStartSec;
      const offsetInOutput = offsetInOriginal / currentTempo;

      if (phase === "playing" || phase === "buffering" || phase === "waiting") {
        phase = "playing";
        const audioBuf = createAudioBufferFromChunk(chunk);
        if (audioBuf) {
          const crossfadeStart = getCrossfadeStart(chunk);
          const bufferOffset = crossfadeStart + offsetInOutput;
          const clampedOffset = Math.min(Math.max(0, bufferOffset), audioBuf.duration - 0.001);
          chunkPlayer.handleSeek(audioBuf, clampedOffset);
        }
      } else if (phase === "paused") {
        bufferingResumePosition = clamped;
      }
    } else {
      if (phase === "paused") {
        bufferingResumePosition = clamped;
      } else {
        bufferingResumePosition = clamped;
        enterBuffering("seek");
      }
    }
  }

  function stop(): void {
    if (disposed) return;
    phase = "ended";
    chunkPlayer.stop();
  }

  function setLoop(value: boolean): void {
    isLooping = value;
  }

  let tempoDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  function setTempo(newTempo: number): void {
    if (disposed || phase === "ended" || newTempo === currentTempo) return;

    if (phase === "paused") {
      if (!pendingTempoChange) {
        bufferingResumePosition = getPositionInOriginalBuffer();
      }
      currentTempo = newTempo;
      pendingTempoChange = true;
      return;
    }

    const isFirstInBurst = tempoDebounceTimer === null;

    if (isFirstInBurst) {
      bufferingResumePosition = getPositionInOriginalBuffer();
      currentChunkIndex = getChunkIndexForTime(chunks, bufferingResumePosition, sampleRate);
      enterBuffering("tempo-change");
    }

    currentTempo = newTempo;

    if (tempoDebounceTimer !== null) clearTimeout(tempoDebounceTimer);
    tempoDebounceTimer = setTimeout(() => {
      tempoDebounceTimer = null;
      if (disposed || phase === "ended") return;
      scheduler.updatePriorities(currentChunkIndex);
      scheduler.handleTempoChange(currentTempo);
    }, 50);
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    if (tempoDebounceTimer !== null) {
      clearTimeout(tempoDebounceTimer);
      tempoDebounceTimer = null;
    }
    chunkPlayer.dispose();
    scheduler.dispose();
    workerManager.terminate();
    emitter.clear();
  }

  return {
    start,
    pause,
    resume,
    seek,
    stop,
    setTempo,
    setLoop,
    getCurrentPosition: getPositionInOriginalBuffer,
    getStatus,
    getSnapshot,
    on: emitter.on.bind(emitter) as StretcherEngine["on"],
    off: emitter.off.bind(emitter) as StretcherEngine["off"],
    dispose,
  };
}
