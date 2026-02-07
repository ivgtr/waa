// ---------------------------------------------------------------------------
// Stretcher: Engine — integrates all components
// ---------------------------------------------------------------------------

import { createEmitter } from "../emitter.js";
import { CHUNK_DURATION_SEC, OVERLAP_SEC, CROSSFADE_SEC, KEEP_AHEAD_CHUNKS, KEEP_AHEAD_SECONDS, KEEP_BEHIND_CHUNKS, KEEP_BEHIND_SECONDS, WORKER_POOL_SIZE } from "./constants.js";
import { splitIntoChunks, extractChunkData, getChunkIndexForTime } from "./chunk-splitter.js";
import { createWorkerManager } from "./worker-manager.js";
import { createConversionScheduler } from "./conversion-scheduler.js";
import { createChunkPlayer } from "./chunk-player.js";
import { createBufferMonitor } from "./buffer-monitor.js";
import { createConversionEstimator } from "./conversion-estimator.js";
import type {
  ChunkInfo,
  StretcherEngine,
  StretcherEngineOptions,
  StretcherEvents,
  StretcherPlaybackState,
  StretcherSnapshotExtension,
  StretcherStatus,
  WorkerResponse,
} from "./types.js";

/**
 * Trim overlap regions from WSOLA output so adjacent chunks don't double-play.
 */
function trimOverlap(
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
  const crossfadeKeep = Math.round(CROSSFADE_SEC * sampleRate);
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
    data: outputData.map(ch => ch.slice(trimStart, trimStart + newLength)),
    length: newLength,
  };
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
    through = [],
    destination = ctx.destination,
  } = options;

  const emitter = createEmitter<StretcherEvents>();
  const sampleRate = buffer.sampleRate;
  const totalDuration = buffer.duration;

  // State
  let phase: StretcherPlaybackState = "waiting";
  let currentTempo = initialTempo;
  let disposed = false;
  let bufferingStartTime = 0;
  let currentChunkIndex = 0;
  let bufferingResumePosition: number | null = null;

  // Split buffer into chunks
  const chunks = splitIntoChunks(
    buffer.length,
    sampleRate,
    CHUNK_DURATION_SEC,
    OVERLAP_SEC,
  );

  // Estimator
  const estimator = createConversionEstimator();

  // Buffer monitor
  const monitor = createBufferMonitor();

  // Worker manager
  const poolSize = options.workerPoolSize ?? WORKER_POOL_SIZE;
  const workerManager = createWorkerManager(
    (response: WorkerResponse) => {
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
          schedulerInternal._handleResult(
            response.chunkIndex,
            trimmed.data,
            trimmed.length,
          );
        }
      } else if (response.type === "cancelled") {
        // Chunk was cancelled, scheduler will re-dispatch
        const chunk = chunks[response.chunkIndex];
        if (chunk && chunk.state === "converting") {
          chunk.state = "queued";
        }
        scheduler.dispatchNext();
      }
    },
    (response: WorkerResponse) => {
      if (disposed) return;
      if (response.type === "error") {
        schedulerInternal._handleError(
          response.chunkIndex,
          response.error ?? "Unknown error",
        );
      }
    },
    undefined,
    poolSize,
  );

  // Conversion scheduler
  const schedulerInternal = createConversionScheduler(
    chunks,
    workerManager,
    (chunkIndex: number) => extractChunkData(buffer, chunks[chunkIndex]!),
    sampleRate,
    currentTempo,
    undefined,
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

  chunkPlayer.setOnNeedNext(() => {
    if (disposed) return;
    const nextIdx = currentChunkIndex + 1;
    if (nextIdx < chunks.length) {
      const nextChunk = chunks[nextIdx]!;
      if (nextChunk.state === "ready" && nextChunk.outputBuffer) {
        const audioBuffer = createAudioBufferFromChunk(nextChunk);
        if (audioBuffer) {
          chunkPlayer.scheduleNext(audioBuffer, ctx.currentTime + 0.3);
        }
      }
    }
  });

  chunkPlayer.setOnTransition(() => {
    if (disposed) return;
    // scheduleNext の transition 完了: chunk N+1 が current に昇格した
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
    const audioBuf = ctx.createBuffer(
      numChannels,
      chunk.outputLength,
      sampleRate,
    );

    for (let ch = 0; ch < numChannels; ch++) {
      const channelData = chunk.outputBuffer[ch]!;
      audioBuf.getChannelData(ch).set(channelData.subarray(0, chunk.outputLength));
    }

    return audioBuf;
  }

  function playCurrentChunk(offsetInChunk: number = 0): void {
    const chunk = chunks[currentChunkIndex];
    if (!chunk || chunk.state !== "ready" || !chunk.outputBuffer) return;

    const audioBuf = createAudioBufferFromChunk(chunk);
    if (!audioBuf) return;

    const crossfadeStart = chunk.overlapBefore > 0 ? CROSSFADE_SEC : 0;
    chunkPlayer.playChunk(audioBuf, ctx.currentTime, crossfadeStart + offsetInChunk);
  }

  function advanceToNextChunk(): void {
    const nextIdx = currentChunkIndex + 1;
    if (nextIdx >= chunks.length) {
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
    scheduler.updatePriorities(currentChunkIndex);

    const chunk = chunks[currentChunkIndex];
    if (chunk && chunk.state === "ready") {
      playCurrentChunk();
    } else {
      const nextChunk = chunks[currentChunkIndex]!;
      const nominalStartSample = nextChunk.inputStartSample + nextChunk.overlapBefore;
      bufferingResumePosition = nominalStartSample / sampleRate;
      enterBuffering("underrun");
    }

    evictDistantChunks();
  }

  function enterBuffering(
    reason: "initial" | "seek" | "tempo-change" | "underrun",
  ): void {
    if (phase === "ended") return;
    // Allow re-entering buffering for tempo-change and seek even if already buffering
    if (phase === "buffering" && reason !== "tempo-change" && reason !== "seek") return;
    phase = "buffering";
    bufferingStartTime = performance.now();
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

        playCurrentChunk(offsetInOutput);
      } else {
        playCurrentChunk();
      }
    } else {
      playCurrentChunk();
    }
  }

  // --- Memory management ---

  function evictDistantChunks(): void {
    const keepAhead = Math.max(
      KEEP_AHEAD_CHUNKS,
      Math.ceil(KEEP_AHEAD_SECONDS / CHUNK_DURATION_SEC),
    );
    const keepBehind = Math.max(
      KEEP_BEHIND_CHUNKS,
      Math.ceil(KEEP_BEHIND_SECONDS / CHUNK_DURATION_SEC),
    );

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
    if (phase === "ended") return totalDuration;
    if (phase === "waiting") return offset;
    if (phase === "buffering" && bufferingResumePosition !== null) {
      return bufferingResumePosition;
    }

    const chunk = chunks[currentChunkIndex];
    if (!chunk) return 0;

    // Nominal start time of this chunk in the original buffer
    const nominalStartSample = chunk.inputStartSample + chunk.overlapBefore;
    const nominalStartSec = nominalStartSample / sampleRate;

    // Position within the current chunk (in output time)
    const posInChunk = chunkPlayer.getCurrentPosition();

    // Subtract the crossfade overlap kept at the start of non-first chunks
    const crossfadeOffset = chunk.overlapBefore > 0 ? CROSSFADE_SEC : 0;
    const adjustedPosInChunk = Math.max(0, posInChunk - crossfadeOffset);

    // Convert output position back to original buffer time
    // output duration = input duration / tempo
    const posInOriginal = adjustedPosInChunk * currentTempo;

    return Math.min(nominalStartSec + posInOriginal, totalDuration);
  }

  function getStatus(): StretcherStatus {
    const readyCount = chunks.filter((c) => c.state === "ready").length;
    const convertingCount = chunks.filter(
      (c) => c.state === "converting",
    ).length;
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
    const convertingCount = chunks.filter(
      (c) => c.state === "converting",
    ).length;

    return {
      tempo: currentTempo,
      converting: convertingCount > 0,
      conversionProgress: total > 0 ? readyCount / total : 0,
      bufferHealth: monitor.getHealth(currentChunkIndex, chunks),
      aheadSeconds: monitor.getAheadSeconds(currentChunkIndex, chunks),
      buffering: phase === "buffering" || phase === "waiting",
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

    const chunk = chunks[currentChunkIndex];
    if (chunk && chunk.state === "ready") {
      phase = "playing";
      chunkPlayer.resume();
      // Re-start from paused position
      playCurrentChunk(chunkPlayer.getCurrentPosition());
    } else {
      enterBuffering("underrun");
    }
  }

  function seek(position: number): void {
    if (disposed) return;

    const clamped = Math.max(0, Math.min(position, totalDuration));
    const newChunkIdx = getChunkIndexForTime(chunks, clamped, sampleRate);
    currentChunkIndex = newChunkIdx;

    scheduler.handleSeek(newChunkIdx);

    const chunk = chunks[newChunkIdx];
    if (chunk && chunk.state === "ready") {
      // Calculate offset within the chunk
      const nominalStartSample =
        chunk.inputStartSample + chunk.overlapBefore;
      const nominalStartSec = nominalStartSample / sampleRate;
      const offsetInOriginal = clamped - nominalStartSec;
      const offsetInOutput = offsetInOriginal / currentTempo;

      if (phase === "playing" || phase === "buffering" || phase === "waiting") {
        phase = "playing";
        const audioBuf = createAudioBufferFromChunk(chunk);
        if (audioBuf) {
          const clampedOffset = Math.min(Math.max(0, offsetInOutput), audioBuf.duration - 0.001);
          chunkPlayer.handleSeek(audioBuf, clampedOffset);
        }
      }
    } else {
      bufferingResumePosition = clamped;
      enterBuffering("seek");
    }
  }

  function stop(): void {
    if (disposed) return;
    phase = "ended";
    chunkPlayer.stop();
  }

  function setTempo(newTempo: number): void {
    if (disposed || phase === "ended" || newTempo === currentTempo) return;
    bufferingResumePosition = getPositionInOriginalBuffer();
    currentChunkIndex = getChunkIndexForTime(chunks, bufferingResumePosition, sampleRate);
    currentTempo = newTempo;
    enterBuffering("tempo-change");
    scheduler.updatePriorities(currentChunkIndex);
    scheduler.handleTempoChange(newTempo);
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
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
    getCurrentPosition: getPositionInOriginalBuffer,
    getStatus,
    getSnapshot,
    on: emitter.on.bind(emitter) as StretcherEngine["on"],
    off: emitter.off.bind(emitter) as StretcherEngine["off"],
    dispose,
  };
}
