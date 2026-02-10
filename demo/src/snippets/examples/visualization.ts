export const staticWaveformPlayer = `import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();
const buffer = await waa.load("/audio/track.mp3");

// Extract peak pairs
const peaks = waa.extractPeakPairs(buffer, { resolution: 300 });

// Draw to canvas
const canvas = document.querySelector("canvas")!;
const canvasCtx = canvas.getContext("2d")!;
const { width, height } = canvas;
const barWidth = width / peaks.length;
const centerY = height / 2;

canvasCtx.fillStyle = "#4a9eff";
for (let i = 0; i < peaks.length; i++) {
  const { min, max } = peaks[i];
  const x = i * barWidth;
  const top = centerY - max * centerY;
  const bottom = centerY - min * centerY;
  canvasCtx.fillRect(x, top, barWidth - 1, bottom - top);
}` as const;

export const staticWaveformFn = `import { createContext, ensureRunning } from "waa-play/context";
import { loadBuffer } from "waa-play/buffer";
import { extractPeakPairs } from "waa-play/waveform";

const ctx = createContext();
await ensureRunning(ctx);
const buffer = await loadBuffer(ctx, "/audio/track.mp3");

// Extract peak pairs
const peaks = extractPeakPairs(buffer, { resolution: 300 });

// Draw to canvas
const canvas = document.querySelector("canvas")!;
const canvasCtx = canvas.getContext("2d")!;
const { width, height } = canvas;
const barWidth = width / peaks.length;
const centerY = height / 2;

canvasCtx.fillStyle = "#4a9eff";
for (let i = 0; i < peaks.length; i++) {
  const { min, max } = peaks[i];
  const x = i * barWidth;
  const top = centerY - max * centerY;
  const bottom = centerY - min * centerY;
  canvasCtx.fillRect(x, top, barWidth - 1, bottom - top);
}` as const;

export const playbackCursorPlayer = `const playback = waa.play(buffer);

// Update on each animation frame
const stopFrame = waa.onFrame(playback, ({ progress }) => {
  // Update cursor position
  const cursorX = progress * canvas.width;

  // Redraw waveform (clear previous frame)
  canvasCtx.clearRect(0, 0, width, height);

  // Color-code played and unplayed portions
  for (let i = 0; i < peaks.length; i++) {
    const { min, max } = peaks[i];
    const x = i * barWidth;
    const top = centerY - max * centerY;
    const bottom = centerY - min * centerY;
    canvasCtx.fillStyle = x < cursorX ? "#4a9eff" : "#666";
    canvasCtx.fillRect(x, top, barWidth - 1, bottom - top);
  }

  // Draw cursor line
  canvasCtx.strokeStyle = "#fff";
  canvasCtx.beginPath();
  canvasCtx.moveTo(cursorX, 0);
  canvasCtx.lineTo(cursorX, height);
  canvasCtx.stroke();
});

// Clean up on stop
playback.on("ended", () => stopFrame());` as const;

export const playbackCursorFn = `import { play } from "waa-play/play";
import { onFrame } from "waa-play/adapters";

const playback = play(ctx, buffer);

// Update on each animation frame
const stopFrame = onFrame(playback, ({ progress }) => {
  // Update cursor position
  const cursorX = progress * canvas.width;

  // Redraw waveform (clear previous frame)
  canvasCtx.clearRect(0, 0, width, height);

  // Color-code played and unplayed portions
  for (let i = 0; i < peaks.length; i++) {
    const { min, max } = peaks[i];
    const x = i * barWidth;
    const top = centerY - max * centerY;
    const bottom = centerY - min * centerY;
    canvasCtx.fillStyle = x < cursorX ? "#4a9eff" : "#666";
    canvasCtx.fillRect(x, top, barWidth - 1, bottom - top);
  }

  // Draw cursor line
  canvasCtx.strokeStyle = "#fff";
  canvasCtx.beginPath();
  canvasCtx.moveTo(cursorX, 0);
  canvasCtx.lineTo(cursorX, height);
  canvasCtx.stroke();
});

// Clean up on stop
playback.on("ended", () => stopFrame());` as const;

export const realtimeFrequencyPlayer = `const analyser = waa.createAnalyser({ fftSize: 256 });
const playback = waa.play(buffer, { through: [analyser] });

const freqCanvas = document.querySelector("#freq-canvas") as HTMLCanvasElement;
const freqCtx = freqCanvas.getContext("2d")!;

function drawFrequency() {
  requestAnimationFrame(drawFrequency);

  const data = waa.getFrequencyDataByte(analyser);
  const barWidth = freqCanvas.width / data.length;

  freqCtx.clearRect(0, 0, freqCanvas.width, freqCanvas.height);
  freqCtx.fillStyle = "#4a9eff";

  for (let i = 0; i < data.length; i++) {
    const barHeight = (data[i] / 255) * freqCanvas.height;
    freqCtx.fillRect(
      i * barWidth,
      freqCanvas.height - barHeight,
      barWidth - 1,
      barHeight
    );
  }
}

drawFrequency();` as const;

export const realtimeFrequencyFn = `import { play } from "waa-play/play";
import { createAnalyser, getFrequencyDataByte } from "waa-play/nodes";

const analyser = createAnalyser(ctx, { fftSize: 256 });
const playback = play(ctx, buffer, { through: [analyser] });

const freqCanvas = document.querySelector("#freq-canvas") as HTMLCanvasElement;
const freqCtx = freqCanvas.getContext("2d")!;

function drawFrequency() {
  requestAnimationFrame(drawFrequency);

  const data = getFrequencyDataByte(analyser);
  const barWidth = freqCanvas.width / data.length;

  freqCtx.clearRect(0, 0, freqCanvas.width, freqCanvas.height);
  freqCtx.fillStyle = "#4a9eff";

  for (let i = 0; i < data.length; i++) {
    const barHeight = (data[i] / 255) * freqCanvas.height;
    freqCtx.fillRect(
      i * barWidth,
      freqCanvas.height - barHeight,
      barWidth - 1,
      barHeight
    );
  }
}

drawFrequency();` as const;
