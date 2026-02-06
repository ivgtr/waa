// ---------------------------------------------------------------------------
// M6: Waveform data extraction
// ---------------------------------------------------------------------------

import type { ExtractPeaksOptions, PeakPair } from "./types.js";

/**
 * Extract normalised peak amplitude values from an `AudioBuffer`.
 * Returns an array of numbers in the range `[0, 1]`.
 */
export function extractPeaks(
  buffer: AudioBuffer,
  options?: ExtractPeaksOptions,
): number[] {
  const { resolution = 200, channel = 0 } = options ?? {};
  const data = buffer.getChannelData(channel);
  const blockSize = Math.floor(data.length / resolution);
  const peaks: number[] = [];

  for (let i = 0; i < resolution; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, data.length);
    let max = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(data[j]!);
      if (abs > max) max = abs;
    }
    peaks.push(max);
  }

  return peaks;
}

/**
 * Extract min/max peak pairs for detailed waveform rendering.
 */
export function extractPeakPairs(
  buffer: AudioBuffer,
  options?: ExtractPeaksOptions,
): PeakPair[] {
  const { resolution = 200, channel = 0 } = options ?? {};
  const data = buffer.getChannelData(channel);
  const blockSize = Math.floor(data.length / resolution);
  const pairs: PeakPair[] = [];

  for (let i = 0; i < resolution; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, data.length);
    let min = 0;
    let max = 0;
    for (let j = start; j < end; j++) {
      const sample = data[j]!;
      if (sample < min) min = sample;
      if (sample > max) max = sample;
    }
    pairs.push({ min, max });
  }

  return pairs;
}

/**
 * Extract RMS (root mean square) values representing perceived loudness.
 * Returns values in the range `[0, 1]`.
 *
 * When `channel` is set to `-1`, all channels are averaged.
 */
export function extractRMS(
  buffer: AudioBuffer,
  options?: ExtractPeaksOptions & { channel?: number },
): number[] {
  const { resolution = 200, channel = 0 } = options ?? {};

  if (channel === -1) {
    // Average across all channels.
    const allChannels: number[][] = [];
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      allChannels.push(extractRMS(buffer, { resolution, channel: ch }));
    }
    return allChannels[0]!.map((_, i) => {
      let sum = 0;
      for (const ch of allChannels) {
        sum += ch[i]!;
      }
      return sum / allChannels.length;
    });
  }

  const data = buffer.getChannelData(channel);
  const blockSize = Math.floor(data.length / resolution);
  const rms: number[] = [];

  for (let i = 0; i < resolution; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, data.length);
    let sumSq = 0;
    for (let j = start; j < end; j++) {
      const s = data[j]!;
      sumSq += s * s;
    }
    rms.push(Math.sqrt(sumSq / (end - start)));
  }

  return rms;
}
