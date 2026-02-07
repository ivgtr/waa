// ---------------------------------------------------------------------------
// Stretcher: Buffer health monitor
// ---------------------------------------------------------------------------

import {
  BUFFER_HEALTHY_SEC,
  BUFFER_LOW_SEC,
  BUFFER_CRITICAL_SEC,
  BUFFER_RESUME_SEC,
  CHUNK_DURATION_SEC,
} from "./constants.js";
import type { BufferHealth, BufferMonitor, BufferMonitorOptions, ChunkInfo } from "./types.js";

/**
 * Create a buffer health monitor with hysteresis.
 */
export function createBufferMonitor(
  options?: Partial<BufferMonitorOptions>,
): BufferMonitor {
  const healthySec = options?.healthySec ?? BUFFER_HEALTHY_SEC;
  const lowSec = options?.lowSec ?? BUFFER_LOW_SEC;
  const criticalSec = options?.criticalSec ?? BUFFER_CRITICAL_SEC;
  const resumeSec = options?.resumeSec ?? BUFFER_RESUME_SEC;
  const chunkDurSec = options?.chunkDurationSec ?? CHUNK_DURATION_SEC;

  function getAheadSeconds(
    currentChunkIndex: number,
    chunks: ChunkInfo[],
  ): number {
    let aheadSec = 0;
    for (let i = currentChunkIndex; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk || chunk.state !== "ready") break;
      aheadSec += chunkDurSec;
    }
    return aheadSec;
  }

  function getHealth(
    currentChunkIndex: number,
    chunks: ChunkInfo[],
  ): BufferHealth {
    const ahead = getAheadSeconds(currentChunkIndex, chunks);

    if (ahead >= healthySec) return "healthy";
    if (ahead >= lowSec) return "low";
    if (ahead >= criticalSec) return "critical";
    return "empty";
  }

  function shouldEnterBuffering(
    currentChunkIndex: number,
    chunks: ChunkInfo[],
  ): boolean {
    const ahead = getAheadSeconds(currentChunkIndex, chunks);
    if (ahead >= criticalSec) return false;

    // Also check if the next chunk is ready
    const nextChunk = chunks[currentChunkIndex + 1];
    if (nextChunk && nextChunk.state === "ready") return false;

    // Current chunk must not be ready either (if we're at the boundary)
    const currentChunk = chunks[currentChunkIndex];
    if (!currentChunk || currentChunk.state !== "ready") return true;

    return ahead < criticalSec;
  }

  function shouldExitBuffering(
    currentChunkIndex: number,
    chunks: ChunkInfo[],
  ): boolean {
    const ahead = getAheadSeconds(currentChunkIndex, chunks);
    if (ahead >= resumeSec) return true;

    // Also exit if the next chunk has become ready
    const nextChunk = chunks[currentChunkIndex + 1];
    if (nextChunk && nextChunk.state === "ready") return true;

    // If all chunks are done
    const allReady = chunks.every(
      (c) => c.state === "ready" || c.state === "skipped",
    );
    if (allReady) return true;

    return false;
  }

  return {
    getHealth,
    getAheadSeconds,
    shouldEnterBuffering,
    shouldExitBuffering,
  };
}
