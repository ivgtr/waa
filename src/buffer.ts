// ---------------------------------------------------------------------------
// M2: Audio buffer loading utilities
// ---------------------------------------------------------------------------

import type { BufferInfo, LoadBufferOptions } from "./types.js";

/**
 * Fetch an audio file from a URL and decode it into an `AudioBuffer`.
 *
 * ```ts
 * const buffer = await loadBuffer(ctx, "/audio/track.mp3", {
 *   onProgress: (p) => console.log(`${(p * 100).toFixed(0)}%`),
 * });
 * ```
 */
export async function loadBuffer(
  ctx: AudioContext,
  url: string,
  options?: LoadBufferOptions,
): Promise<AudioBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
  }

  if (options?.onProgress && response.body && response.headers.get("content-length")) {
    const total = Number(response.headers.get("content-length"));
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      options.onProgress(total > 0 ? received / total : 0);
    }

    const merged = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return ctx.decodeAudioData(merged.buffer);
  }

  const arrayBuffer = await response.arrayBuffer();
  return ctx.decodeAudioData(arrayBuffer);
}

/**
 * Decode an `AudioBuffer` from a `Blob` or `File`.
 */
export async function loadBufferFromBlob(
  ctx: AudioContext,
  blob: Blob,
): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  return ctx.decodeAudioData(arrayBuffer);
}

/**
 * Load multiple audio files in parallel.
 *
 * ```ts
 * const buffers = await loadBuffers(ctx, {
 *   kick: "/samples/kick.wav",
 *   snare: "/samples/snare.wav",
 * });
 * buffers.get("kick"); // AudioBuffer
 * ```
 */
export async function loadBuffers(
  ctx: AudioContext,
  map: Record<string, string>,
): Promise<Map<string, AudioBuffer>> {
  const entries = Object.entries(map);
  const results = await Promise.all(
    entries.map(async ([key, url]) => {
      const buffer = await loadBuffer(ctx, url);
      return [key, buffer] as const;
    }),
  );
  return new Map(results);
}

/**
 * Return metadata about an `AudioBuffer`.
 */
export function getBufferInfo(buffer: AudioBuffer): BufferInfo {
  return {
    duration: buffer.duration,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
    length: buffer.length,
  };
}
