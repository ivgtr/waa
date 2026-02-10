// ---------------------------------------------------------------------------
// Stretcher: Inline Worker source code
// ---------------------------------------------------------------------------
// This file contains the WSOLA algorithm as a self-contained JavaScript string
// for execution inside a Web Worker. The logic mirrors wsola.ts.
// ---------------------------------------------------------------------------

import { WSOLA_FRAME_SIZE, WSOLA_HOP_SIZE, WSOLA_TOLERANCE } from "./constants.js";

function getWorkerCode(): string {
  // Embed constants directly into the worker code
  return `"use strict";

var FRAME_SIZE = ${WSOLA_FRAME_SIZE};
var HOP_SIZE = ${WSOLA_HOP_SIZE};
var TOLERANCE = ${WSOLA_TOLERANCE};

function createHannWindow(size) {
  var w = new Float32Array(size);
  for (var i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return w;
}

function findBestOffset(ref, search, overlapSize, maxOffset) {
  var bestOffset = 0;
  var bestCorr = -Infinity;
  var searchLen = search.length;
  var refLen = ref.length;
  var len = Math.min(overlapSize, refLen);

  for (var offset = 0; offset <= maxOffset; offset++) {
    if (offset + len > searchLen) break;
    var corr = 0;
    var normRef = 0;
    var normSearch = 0;
    for (var i = 0; i < len; i++) {
      var r = ref[i];
      var s = search[offset + i];
      corr += r * s;
      normRef += r * r;
      normSearch += s * s;
    }
    var denom = Math.sqrt(normRef * normSearch);
    var ncc = denom > 1e-10 ? corr / denom : 0;
    if (ncc > bestCorr) {
      bestCorr = ncc;
      bestOffset = offset;
    }
  }
  return bestOffset;
}

function wsolaTimeStretch(channels, tempo, sampleRate) {
  if (channels.length === 0) {
    return { output: [], length: 0 };
  }

  var inputLength = channels[0].length;
  if (inputLength === 0) {
    return { output: channels.map(function() { return new Float32Array(0); }), length: 0 };
  }

  var TEMPO_IDENTITY_EPSILON = 0.001;
  if (Math.abs(tempo - 1.0) < TEMPO_IDENTITY_EPSILON) {
    return {
      output: channels.map(function(ch) { return new Float32Array(ch); }),
      length: inputLength
    };
  }

  var synthesisHop = HOP_SIZE;
  var analysisHop = Math.round(HOP_SIZE * tempo);
  var numFrames = Math.floor((inputLength - FRAME_SIZE) / analysisHop) + 1;

  if (numFrames <= 0) {
    return {
      output: channels.map(function(ch) { return new Float32Array(ch); }),
      length: inputLength
    };
  }

  var estimatedOutputLength = (numFrames - 1) * synthesisHop + FRAME_SIZE;
  var outputChannels = channels.map(function() {
    return new Float32Array(estimatedOutputLength);
  });
  var windowFunc = createHannWindow(FRAME_SIZE);
  var normBuffer = new Float32Array(estimatedOutputLength);

  var prevOutputFrame = channels.map(function() {
    return new Float32Array(FRAME_SIZE);
  });

  var inputPos = 0;
  var outputPos = 0;
  var actualOutputLength = 0;

  for (var frame = 0; frame < numFrames; frame++) {
    if (cancelled) return null;
    if (inputPos + FRAME_SIZE > inputLength) break;

    var actualInputPos = inputPos;

    if (frame > 0 && TOLERANCE > 0) {
      var searchStart = Math.max(0, inputPos - TOLERANCE);
      var searchEnd = Math.min(inputLength - FRAME_SIZE, inputPos + TOLERANCE);
      var searchRange = searchEnd - searchStart;

      if (searchRange > 0) {
        var refChannel = prevOutputFrame[0];
        var inputChannel = channels[0];

        var overlapStart = FRAME_SIZE - synthesisHop;
        var overlapSize = Math.min(synthesisHop, FRAME_SIZE - overlapStart);

        var refSlice = refChannel.subarray(overlapStart, overlapStart + overlapSize);
        var searchSlice = inputChannel.subarray(searchStart, searchEnd + overlapSize);

        var bestOffset = findBestOffset(
          refSlice, searchSlice, overlapSize,
          Math.min(searchRange, searchSlice.length - overlapSize)
        );

        actualInputPos = searchStart + bestOffset;
      }
    }

    for (var ch = 0; ch < channels.length; ch++) {
      var input = channels[ch];
      var output = outputChannels[ch];
      var prevFrame = prevOutputFrame[ch];
      for (var i = 0; i < FRAME_SIZE; i++) {
        var inIdx = actualInputPos + i;
        if (inIdx >= inputLength) break;
        var outIdx = outputPos + i;
        if (outIdx >= estimatedOutputLength) break;
        var sample = input[inIdx];
        output[outIdx] += sample * windowFunc[i];
        prevFrame[i] = sample * windowFunc[i];
      }
    }

    for (var i = 0; i < FRAME_SIZE; i++) {
      var outIdx = outputPos + i;
      if (outIdx >= estimatedOutputLength) break;
      normBuffer[outIdx] += windowFunc[i];
    }

    inputPos += analysisHop;
    outputPos += synthesisHop;
    actualOutputLength = Math.min(outputPos + FRAME_SIZE, estimatedOutputLength);
  }

  for (var ch = 0; ch < outputChannels.length; ch++) {
    var output = outputChannels[ch];
    for (var i = 0; i < actualOutputLength; i++) {
      var norm = normBuffer[i];
      if (norm > 1e-8) {
        output[i] /= norm;
      }
    }
  }

  var trimmedOutput = outputChannels.map(function(ch) {
    return ch.slice(0, actualOutputLength);
  });

  return { output: trimmedOutput, length: actualOutputLength };
}

var cancelled = false;

self.onmessage = function(e) {
  var msg = e.data;
  if (msg.type === "cancel") {
    cancelled = true;
    return;
  }
  if (msg.type === "convert") {
    cancelled = false;
    try {
      var result = wsolaTimeStretch(msg.inputData, msg.tempo, msg.sampleRate);
      if (cancelled || result === null) {
        self.postMessage({ type: "cancelled", chunkIndex: msg.chunkIndex });
      } else {
        self.postMessage(
          { type: "result", chunkIndex: msg.chunkIndex, outputData: result.output, outputLength: result.length },
          result.output.map(function(ch) { return ch.buffer; })
        );
      }
    } catch (err) {
      self.postMessage({ type: "error", chunkIndex: msg.chunkIndex, error: String(err) });
    }
  }
};
`;
}

/**
 * Create a Blob URL for the inline WSOLA Worker.
 */
export function createWorkerURL(): string {
  const code = getWorkerCode();
  const blob = new Blob([code], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}

/**
 * Revoke a previously created Worker Blob URL.
 */
export function revokeWorkerURL(url: string): void {
  URL.revokeObjectURL(url);
}
