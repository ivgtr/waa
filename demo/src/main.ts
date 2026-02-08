import { WaaPlayer } from "waa";
import type { Playback, PeakPair, StretcherSnapshotExtension } from "waa";

// ---------------------------------------------------------------------------
// DOM Elements
// ---------------------------------------------------------------------------

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const synthType = $<HTMLSelectElement>("synth-type");
const synthFreq = $<HTMLInputElement>("synth-freq");
const synthFreqVal = $("synth-freq-val");
const synthDur = $<HTMLInputElement>("synth-dur");
const synthDurVal = $("synth-dur-val");
const btnGenerate = $<HTMLButtonElement>("btn-generate");
const fileInput = $<HTMLInputElement>("file-input");
const fileLabel = $("file-label");
const fileLabelText = $("file-label-text");
const fileName = $("file-name");

const waveformSection = $("waveform-section");
const waveformCanvas = $<HTMLCanvasElement>("waveform-canvas");
const waveformCursor = $("waveform-cursor");
const timeCurrent = $("time-current");
const timeDuration = $("time-duration");

const playbackSection = $("playback-section");
const btnPlayPause = $<HTMLButtonElement>("btn-play-pause");
const btnStop = $<HTMLButtonElement>("btn-stop");
const iconPlay = btnPlayPause.querySelector(".icon-play") as SVGElement;
const iconPause = btnPlayPause.querySelector(".icon-pause") as SVGElement;
const volumeInput = $<HTMLInputElement>("volume");
const panInput = $<HTMLInputElement>("pan");
const speedSelect = $<HTMLSelectElement>("speed");
const loopCheckbox = $<HTMLInputElement>("loop");
const preservePitchCheckbox = $<HTMLInputElement>("preserve-pitch");

const stretcherStatus = $("stretcher-status");
const stretcherProgressFill = $("stretcher-progress-fill");
const stretcherBuffering = $("stretcher-buffering");
const bufferHealthDot = $("buffer-health");
const stretcherDetail = $("stretcher-detail");
const waveformBufferBar = $("waveform-buffer-bar");
const chunkStrip = $("chunk-strip");
const chunkStripBlocks = $("chunk-strip-blocks");

const visualizerSection = $("visualizer-section");
const visualizerCanvas = $<HTMLCanvasElement>("visualizer-canvas");

// ---------------------------------------------------------------------------
// Audio State
// ---------------------------------------------------------------------------

const player = new WaaPlayer();
let gainNode: GainNode | null = null;
let pannerNode: StereoPannerNode | null = null;
let analyserNode: AnalyserNode | null = null;
let currentBuffer: AudioBuffer | null = null;
let currentPlayback: Playback | null = null;
let stopFrameLoop: (() => void) | null = null;
let peaks: PeakPair[] = [];

function initNodes() {
  if (!gainNode) {
    gainNode = player.createGain(0.8);
    pannerNode = player.createPanner(0);
    analyserNode = player.createAnalyser({ fftSize: 256 });
    player.chain(gainNode, pannerNode!, analyserNode!, player.ctx.destination);
  }
}

// ---------------------------------------------------------------------------
// Transport State Helpers
// ---------------------------------------------------------------------------

type TransportState = "stopped" | "playing" | "paused";

function setTransportState(state: TransportState) {
  btnPlayPause.dataset.state = state;

  if (state === "playing") {
    iconPlay.setAttribute("hidden", "");
    iconPause.removeAttribute("hidden");
    btnPlayPause.title = "Pause";
    btnStop.disabled = false;
  } else {
    iconPause.setAttribute("hidden", "");
    iconPlay.removeAttribute("hidden");
    btnPlayPause.title = "Play";
    btnStop.disabled = state === "stopped";
  }
}

// ---------------------------------------------------------------------------
// Synth Controls UI
// ---------------------------------------------------------------------------

synthFreq.addEventListener("input", () => {
  synthFreqVal.textContent = `${synthFreq.value} Hz`;
});

synthDur.addEventListener("input", () => {
  synthDurVal.textContent = `${Number(synthDur.value).toFixed(1)} s`;
});

// ---------------------------------------------------------------------------
// Generate Buffer
// ---------------------------------------------------------------------------

btnGenerate.addEventListener("click", async () => {
  await player.ensureRunning();
  initNodes();

  const freq = Number(synthFreq.value);
  const dur = Number(synthDur.value);
  const type = synthType.value;

  let buffer: AudioBuffer;
  switch (type) {
    case "noise":
      buffer = player.createNoiseBuffer(dur);
      break;
    case "click":
      buffer = player.createClickBuffer(freq, dur);
      break;
    default:
      buffer = player.createSineBuffer(freq, dur);
  }

  loadAudio(buffer);
});

// ---------------------------------------------------------------------------
// File Input (with loading state)
// ---------------------------------------------------------------------------

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  // Show loading state
  fileLabel.classList.add("is-loading");
  fileLabelText.textContent = "Loading...";
  fileName.innerHTML = '<span class="spinner"></span>';

  try {
    await player.ensureRunning();
    initNodes();

    const buffer = await player.loadFromBlob(file);

    // Restore label and show file name
    fileName.textContent = file.name;
    loadAudio(buffer);
  } catch {
    fileName.textContent = "Failed to load file";
  } finally {
    fileLabel.classList.remove("is-loading");
    fileLabelText.textContent = "Load Audio File";
  }
});

// ---------------------------------------------------------------------------
// Load Audio & Draw Waveform
// ---------------------------------------------------------------------------

function loadAudio(buffer: AudioBuffer) {
  // Stop any current playback
  if (currentPlayback) {
    currentPlayback.dispose();
    currentPlayback = null;
  }
  if (stopFrameLoop) {
    stopFrameLoop();
    stopFrameLoop = null;
  }

  currentBuffer = buffer;

  // Extract waveform peaks
  peaks = player.extractPeakPairs(buffer, { resolution: 300 });

  // Show sections first so the canvas has layout dimensions for drawing
  waveformSection.hidden = false;
  playbackSection.hidden = false;
  visualizerSection.hidden = false;

  drawWaveform(peaks);

  // Update duration display
  timeDuration.textContent = formatTime(buffer.duration);
  timeCurrent.textContent = formatTime(0);
  waveformCursor.style.left = "0%";

  // Reset transport state
  setTransportState("stopped");
  updateStretcherVisibility();
}

function drawWaveform(pairs: PeakPair[]) {
  const canvas = waveformCanvas;
  const rect = canvas.parentElement!.getBoundingClientRect();
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;

  const c = canvas.getContext("2d")!;
  c.scale(devicePixelRatio, devicePixelRatio);

  const w = rect.width;
  const h = rect.height;
  const mid = h / 2;
  const barWidth = w / pairs.length;

  c.clearRect(0, 0, w, h);

  for (let i = 0; i < pairs.length; i++) {
    const { min, max } = pairs[i]!;
    const x = i * barWidth;

    c.fillStyle = "rgba(99, 102, 241, 0.6)";
    c.fillRect(x, mid - max * mid, barWidth - 0.5, (max - min) * mid);
  }
}

// Redraw on resize
window.addEventListener("resize", () => {
  if (peaks.length > 0) drawWaveform(peaks);
  resizeVisualizerCanvas();
});

// ---------------------------------------------------------------------------
// Waveform Seek
// ---------------------------------------------------------------------------

waveformCanvas.parentElement!.addEventListener("click", (e) => {
  if (!currentPlayback || !currentBuffer) return;
  const rect = waveformCanvas.parentElement!.getBoundingClientRect();
  const ratio = (e.clientX - rect.left) / rect.width;
  const position = ratio * currentBuffer.duration;
  currentPlayback.seek(position);
});

// ---------------------------------------------------------------------------
// Playback Controls
// ---------------------------------------------------------------------------

btnPlayPause.addEventListener("click", async () => {
  await player.ensureRunning();
  initNodes();

  if (!currentBuffer) return;

  // If playing -> pause
  if (currentPlayback && currentPlayback.getState() === "playing") {
    currentPlayback.pause();
    setTransportState("paused");
    return;
  }

  // If paused -> resume
  if (currentPlayback && currentPlayback.getState() === "paused") {
    currentPlayback.resume();
    setTransportState("playing");
    return;
  }

  // Start new playback
  if (currentPlayback) {
    currentPlayback.dispose();
  }
  if (stopFrameLoop) {
    stopFrameLoop();
  }

  const usePitchPreserve = preservePitchCheckbox.checked;

  currentPlayback = player.play(currentBuffer, {
    through: [gainNode!],
    loop: usePitchPreserve ? false : loopCheckbox.checked,
    playbackRate: Number(speedSelect.value),
    preservePitch: usePitchPreserve,
  });

  setTransportState("playing");
  updateStretcherVisibility();

  // Frame loop for visualizer + cursor updates
  stopFrameLoop = player.onFrame(currentPlayback, (snapshot) => {
    // Update cursor
    waveformCursor.style.left = `${snapshot.progress * 100}%`;
    timeCurrent.textContent = formatTime(snapshot.position);

    // Draw frequency visualizer
    if (analyserNode) drawVisualizer();

    // Sync transport state from playback
    if (snapshot.state === "playing") {
      setTransportState("playing");
    } else if (snapshot.state === "paused") {
      setTransportState("paused");
    }

    // Update stretcher UI
    updateStretcherUI(snapshot.stretcher);
  });

  currentPlayback.on("ended", () => {
    setTransportState("stopped");
    updateStretcherVisibility();
    waveformCursor.style.left = "0%";
    timeCurrent.textContent = formatTime(0);
  });
});

btnStop.addEventListener("click", () => {
  if (currentPlayback) {
    currentPlayback.stop();
    setTransportState("stopped");
    updateStretcherVisibility();
    waveformCursor.style.left = "0%";
    timeCurrent.textContent = formatTime(0);
  }
});

// Volume
volumeInput.addEventListener("input", () => {
  if (gainNode) {
    gainNode.gain.value = Number(volumeInput.value);
  }
});

// Pan
panInput.addEventListener("input", () => {
  if (pannerNode) {
    pannerNode.pan.value = Number(panInput.value);
  }
});

// Speed
speedSelect.addEventListener("change", () => {
  if (currentPlayback) {
    currentPlayback.setPlaybackRate(Number(speedSelect.value));
  }
});

// Loop
loopCheckbox.addEventListener("change", () => {
  if (currentPlayback) {
    currentPlayback.setLoop(loopCheckbox.checked);
  }
});

// preservePitch が初期 checked なので loop を初期 disabled に
loopCheckbox.disabled = preservePitchCheckbox.checked;

// Preserve Pitch <-> Loop 連動
preservePitchCheckbox.addEventListener("change", () => {
  if (preservePitchCheckbox.checked) {
    loopCheckbox.checked = false;
    loopCheckbox.disabled = true;
  } else {
    loopCheckbox.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Frequency Visualizer
// ---------------------------------------------------------------------------

function resizeVisualizerCanvas() {
  const rect = visualizerCanvas.parentElement!.getBoundingClientRect();
  visualizerCanvas.width = rect.width * devicePixelRatio;
  visualizerCanvas.height = 120 * devicePixelRatio;
}

function drawVisualizer() {
  if (!analyserNode) return;

  const canvas = visualizerCanvas;
  const c = canvas.getContext("2d")!;

  const rect = canvas.parentElement!.getBoundingClientRect();
  const w = rect.width;
  const h = 120;

  // Ensure canvas is sized
  if (canvas.width !== w * devicePixelRatio) {
    canvas.width = w * devicePixelRatio;
    canvas.height = h * devicePixelRatio;
  }
  c.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

  const data = player.getFrequencyDataByte(analyserNode);
  const barCount = data.length;
  const barWidth = w / barCount;

  c.clearRect(0, 0, w, h);

  for (let i = 0; i < barCount; i++) {
    const value = data[i]! / 255;
    const barHeight = value * h;

    const hue = 240 + value * 60; // blue to purple gradient
    c.fillStyle = `hsla(${hue}, 70%, 60%, 0.8)`;
    c.fillRect(i * barWidth, h - barHeight, barWidth - 1, barHeight);
  }
}

// Initial canvas resize
resizeVisualizerCanvas();

// ---------------------------------------------------------------------------
// Stretcher UI Helpers
// ---------------------------------------------------------------------------

function updateStretcherVisibility() {
  const isActive =
    preservePitchCheckbox.checked &&
    currentPlayback &&
    currentPlayback.getState() !== "stopped";
  stretcherStatus.hidden = !isActive;
  chunkStrip.hidden = !isActive;
  if (!isActive) {
    waveformBufferBar.innerHTML = "";
  }
}

function updateStretcherUI(snap: StretcherSnapshotExtension | undefined) {
  if (!snap) {
    stretcherStatus.hidden = true;
    chunkStrip.hidden = true;
    waveformBufferBar.innerHTML = "";
    return;
  }

  stretcherStatus.hidden = false;
  chunkStrip.hidden = false;

  // Progress bar (window-based)
  stretcherProgressFill.style.width = `${(snap.windowConversionProgress * 100).toFixed(1)}%`;

  // Buffer health dot
  bufferHealthDot.className = `buffer-health buffer-${snap.bufferHealth}`;

  // Detail text (window-based)
  const pct = (snap.windowConversionProgress * 100).toFixed(0);
  stretcherDetail.textContent = `window: ${pct}% | ahead: ${snap.aheadSeconds.toFixed(1)}s`;

  // Buffering indicator
  stretcherBuffering.hidden = !snap.buffering;

  // Chunk strip visualization
  renderChunkStrip(snap);
}

let prevTotalChunks = 0;

function renderChunkStrip(snap: StretcherSnapshotExtension) {
  const { chunkStates, currentChunkIndex: playhead, activeWindowStart, activeWindowEnd, totalChunks } = snap;

  // Rebuild DOM elements only when totalChunks changes
  if (totalChunks !== prevTotalChunks) {
    prevTotalChunks = totalChunks;
    chunkStripBlocks.innerHTML = "";
    waveformBufferBar.innerHTML = "";
    for (let i = 0; i < totalChunks; i++) {
      const block = document.createElement("div");
      block.className = "chunk-block chunk-pending";
      chunkStripBlocks.appendChild(block);

      const wbBlock = document.createElement("div");
      wbBlock.className = "waveform-buffer-block wb-pending";
      waveformBufferBar.appendChild(wbBlock);
    }
  }

  // Update classes each frame
  const blocks = chunkStripBlocks.children;
  const wbBlocks = waveformBufferBar.children;
  for (let i = 0; i < blocks.length; i++) {
    const state = chunkStates[i] ?? "pending";

    // Chunk strip
    let cls = `chunk-block chunk-${state}`;
    if (i >= activeWindowStart && i <= activeWindowEnd) {
      cls += " chunk-in-window";
    }
    if (i === playhead) {
      cls += " chunk-playhead";
    }
    if (blocks[i]!.className !== cls) {
      blocks[i]!.className = cls;
    }

    // Waveform buffer overlay
    const wbCls = `waveform-buffer-block wb-${state}`;
    if (wbBlocks[i] && wbBlocks[i]!.className !== wbCls) {
      wbBlocks[i]!.className = wbCls;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs < 10 ? "0" : ""}${secs.toFixed(1)}`;
}

// ---------------------------------------------------------------------------
// Code Example Tabs
// ---------------------------------------------------------------------------

document.querySelector(".code-tab-buttons")?.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".code-tab-btn");
  if (!btn) return;
  const tab = btn.dataset.tab!;
  document.querySelectorAll(".code-tab-btn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".code-tab-panel").forEach((p) => p.classList.remove("active"));
  btn.classList.add("active");
  document.querySelector(`.code-tab-panel[data-tab="${tab}"]`)?.classList.add("active");
});
