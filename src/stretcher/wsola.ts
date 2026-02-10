// ---------------------------------------------------------------------------
// Stretcher: WSOLA time-stretching algorithm (reference implementation)
// ---------------------------------------------------------------------------

import { WSOLA_FRAME_SIZE, WSOLA_HOP_SIZE, WSOLA_TOLERANCE } from "./constants.js";

/**
 * Create a Hann window of the given size.
 */
export function createHannWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return window;
}

/**
 * Find the best overlap offset using normalized cross-correlation.
 * Searches within [0, maxOffset] range relative to the search buffer start.
 * Returns the offset that maximizes correlation.
 *
 * @param ref - Reference segment (typically the tail of the previous output frame)
 * @param search - Search region from the input signal
 * @param overlapSize - Number of samples to compare in the overlap region
 * @param maxOffset - Maximum offset to search
 */
export function findBestOffset(
  ref: Float32Array,
  search: Float32Array,
  overlapSize: number,
  maxOffset: number,
): number {
  let bestOffset = 0;
  let bestCorr = -Infinity;

  const searchLen = search.length;
  const refLen = ref.length;
  const len = Math.min(overlapSize, refLen);

  for (let offset = 0; offset <= maxOffset; offset++) {
    if (offset + len > searchLen) break;

    let corr = 0;
    let normRef = 0;
    let normSearch = 0;
    for (let i = 0; i < len; i++) {
      const r = ref[i]!;
      const s = search[offset + i]!;
      corr += r * s;
      normRef += r * r;
      normSearch += s * s;
    }

    // Normalized cross-correlation
    const denom = Math.sqrt(normRef * normSearch);
    const ncc = denom > 1e-10 ? corr / denom : 0;

    if (ncc > bestCorr) {
      bestCorr = ncc;
      bestOffset = offset;
    }
  }

  return bestOffset;
}

export interface WsolaResult {
  output: Float32Array[];
  length: number;
}

/**
 * Perform WSOLA time-stretching on multi-channel audio data.
 *
 * @param channels - Array of Float32Array, one per channel
 * @param tempo - Speed multiplier (> 1 = faster, < 1 = slower)
 * @param sampleRate - Sample rate of the audio
 * @param frameSize - Analysis frame size (default: WSOLA_FRAME_SIZE)
 * @param hopSize - Analysis hop size (default: WSOLA_HOP_SIZE)
 * @param tolerance - Search tolerance for cross-correlation (default: WSOLA_TOLERANCE)
 */
export function wsolaTimeStretch(
  channels: Float32Array[],
  tempo: number,
  _sampleRate: number,
  frameSize: number = WSOLA_FRAME_SIZE,
  hopSize: number = WSOLA_HOP_SIZE,
  tolerance: number = WSOLA_TOLERANCE,
): WsolaResult {
  if (channels.length === 0) {
    return { output: [], length: 0 };
  }

  const inputLength = channels[0]!.length;
  if (inputLength === 0) {
    return { output: channels.map(() => new Float32Array(0)), length: 0 };
  }

  // At tempo≈1.0 (identity), skip WSOLA to avoid NCC search artifacts
  const TEMPO_IDENTITY_EPSILON = 0.001;
  if (Math.abs(tempo - 1.0) < TEMPO_IDENTITY_EPSILON) {
    return {
      output: channels.map((ch) => new Float32Array(ch)),
      length: inputLength,
    };
  }

  // WSOLA: synthesisHop is fixed, analysisHop varies with tempo
  const synthesisHop = hopSize;
  const analysisHop = Math.round(hopSize * tempo);

  // Estimate output length: number of frames determined by how far we can read in input
  const numFrames = Math.floor((inputLength - frameSize) / analysisHop) + 1;
  if (numFrames <= 0) {
    // Input too short for even one frame — return a copy
    return {
      output: channels.map((ch) => new Float32Array(ch)),
      length: inputLength,
    };
  }

  const estimatedOutputLength = (numFrames - 1) * synthesisHop + frameSize;
  const outputChannels = channels.map(() => new Float32Array(estimatedOutputLength));
  const windowFunc = createHannWindow(frameSize);

  // Normalization buffer for overlap-add
  const normBuffer = new Float32Array(estimatedOutputLength);

  // Buffer to hold the previous output frame (for cross-correlation reference)
  const prevOutputFrame = channels.map(() => new Float32Array(frameSize));

  let inputPos = 0;
  let outputPos = 0;
  let actualOutputLength = 0;

  for (let frame = 0; frame < numFrames; frame++) {
    if (inputPos + frameSize > inputLength) break;

    // Find best offset using cross-correlation against the previous output frame
    let actualInputPos = inputPos;

    if (frame > 0 && tolerance > 0) {
      // Search region: [inputPos - tolerance, inputPos + tolerance]
      const searchStart = Math.max(0, inputPos - tolerance);
      const searchEnd = Math.min(inputLength - frameSize, inputPos + tolerance);
      const searchRange = searchEnd - searchStart;

      if (searchRange > 0) {
        const refChannel = prevOutputFrame[0]!;
        const inputChannel = channels[0]!;

        // The overlap region is synthesisHop samples from the end of the previous frame
        // prevOutputFrame contains the previous frame (frameSize samples)
        // The overlap region starts at (frameSize - synthesisHop) in the previous frame
        const overlapStart = frameSize - synthesisHop;
        const overlapSize = Math.min(synthesisHop, frameSize - overlapStart);

        const refSlice = refChannel.subarray(overlapStart, overlapStart + overlapSize);

        // Search buffer: extract the region to search in
        const searchSlice = inputChannel.subarray(searchStart, searchEnd + overlapSize);

        const bestOffset = findBestOffset(
          refSlice,
          searchSlice,
          overlapSize,
          Math.min(searchRange, searchSlice.length - overlapSize),
        );

        actualInputPos = searchStart + bestOffset;
      }
    }

    // Extract the current frame and apply window, overlap-add for all channels
    for (let ch = 0; ch < channels.length; ch++) {
      const input = channels[ch]!;
      const output = outputChannels[ch]!;
      const prevFrame = prevOutputFrame[ch]!;

      for (let i = 0; i < frameSize; i++) {
        const inIdx = actualInputPos + i;
        if (inIdx >= inputLength) break;
        const outIdx = outputPos + i;
        if (outIdx >= estimatedOutputLength) break;

        const sample = input[inIdx]!;
        output[outIdx]! += sample * windowFunc[i]!;
        prevFrame[i] = sample * windowFunc[i]!;
      }
    }

    // Accumulate normalization
    for (let i = 0; i < frameSize; i++) {
      const outIdx = outputPos + i;
      if (outIdx >= estimatedOutputLength) break;
      normBuffer[outIdx]! += windowFunc[i]!;
    }

    inputPos += analysisHop;
    outputPos += synthesisHop;
    actualOutputLength = Math.min(outputPos + frameSize, estimatedOutputLength);
  }

  // Normalize output
  for (let ch = 0; ch < outputChannels.length; ch++) {
    const output = outputChannels[ch]!;
    for (let i = 0; i < actualOutputLength; i++) {
      const norm = normBuffer[i]!;
      if (norm > 1e-8) {
        output[i]! /= norm;
      }
    }
  }

  // Trim output to actual length
  const trimmedOutput = outputChannels.map((ch) => ch.subarray(0, actualOutputLength));

  return { output: trimmedOutput, length: actualOutputLength };
}
