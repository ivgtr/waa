import { getSharedPlayer, formatTime } from './shared-player';
import {
  $,
  initI18nStrings,
  drawWaveform,
  setTransportState,
  setupFileInputHandler,
  generateSynthBuffer,
} from './demo-utils';
import type { TransportElements, I18nStrings } from './demo-utils';
import type { Playback, PlaybackSnapshot, PeakPair } from 'waa';
import type { WaaPlayer } from 'waa';

/* ── Types ──────────────────────────────────────────────────── */

export interface WaveformOptions {
  resolution?: number;
  seekable?: boolean;
  showTime?: boolean;
}

export interface DemoControllerOptions {
  wrapperId?: string;
  prefix?: string;
  initNodes: (player: WaaPlayer) => AudioNode;
  onBufferLoaded?: (buffer: AudioBuffer) => void;
  getPlayOptions?: () => Record<string, unknown>;
  onFrame?: (snapshot: PlaybackSnapshot) => void;
  onEnded?: () => void;
  onStop?: () => void;
  waveform?: boolean | WaveformOptions;
}

export interface DemoController {
  readonly player: WaaPlayer;
  currentPlayback: Playback | null;
  currentBuffer: AudioBuffer | null;
  peaks: PeakPair[];
  dispose(): void;
  updateWaveform(resolution: number): void;
}

/* ── Factory ────────────────────────────────────────────────── */

export function createDemoController(options: DemoControllerOptions): DemoController {
  const {
    wrapperId,
    prefix = '',
    initNodes,
    onBufferLoaded,
    getPlayOptions,
    onFrame: externalOnFrame,
    onEnded: externalOnEnded,
    onStop: externalOnStop,
  } = options;

  // Resolve waveform config
  const waveformEnabled = options.waveform !== false;
  const waveformOpts: WaveformOptions =
    typeof options.waveform === 'object' ? options.waveform : {};
  const waveformResolution = waveformOpts.resolution ?? 300;
  const waveformSeekable = waveformOpts.seekable ?? true;
  const waveformShowTime = waveformOpts.showTime ?? true;

  // AbortController for all listeners
  const ac = new AbortController();
  const { signal } = ac;
  const on = <K extends keyof HTMLElementEventMap>(
    el: EventTarget,
    ev: K,
    fn: (e: HTMLElementEventMap[K]) => void,
  ) => el.addEventListener(ev, fn as EventListener, { signal });

  // Shared player
  const player = getSharedPlayer();

  // Wrapper + i18n
  const wrapper = wrapperId
    ? document.getElementById(wrapperId)
    : document.querySelector('.demo-wrapper');
  const i18n: I18nStrings = initI18nStrings(wrapper as HTMLElement | null);

  // Synth elements
  const synthType = $<HTMLSelectElement>(`${prefix}synth-type`);
  const synthFreq = $<HTMLInputElement>(`${prefix}synth-freq`);
  const synthFreqVal = $(`${prefix}synth-freq-val`);
  const synthDur = $<HTMLInputElement>(`${prefix}synth-dur`);
  const synthDurVal = $(`${prefix}synth-dur-val`);
  const btnGenerate = $<HTMLButtonElement>(`${prefix}btn-generate`);

  // Transport elements
  const btnPlayPause = $<HTMLButtonElement>(`${prefix}btn-play-pause`);
  const btnStop = $<HTMLButtonElement>(`${prefix}btn-stop`);
  const transport: TransportElements = {
    btnPlayPause,
    btnStop,
    iconPlay: btnPlayPause.querySelector('.icon-play') as SVGElement,
    iconPause: btnPlayPause.querySelector('.icon-pause') as SVGElement,
  };

  // Waveform elements (may be absent if waveform disabled)
  const waveformSection = document.getElementById(`${prefix}waveform-section`);
  const waveformCanvas = document.getElementById(`${prefix}waveform-canvas`) as HTMLCanvasElement | null;
  const waveformCursor = document.getElementById(`${prefix}waveform-cursor`);
  const timeCurrent = waveformShowTime ? document.getElementById(`${prefix}time-current`) : null;
  const timeDuration = waveformShowTime ? document.getElementById(`${prefix}time-duration`) : null;
  const playbackSection = document.getElementById(`${prefix}playback-section`);

  // State
  let currentBuffer: AudioBuffer | null = null;
  let currentPlayback: Playback | null = null;
  let stopFrameLoop: (() => void) | null = null;
  let peaks: PeakPair[] = [];
  let throughNode: AudioNode | null = null;
  let pendingSeekPosition: number | null = null;

  // Diff-based frame update tracking
  let prevProgress = -1;
  let prevTimeText = '';
  let prevState = '';

  /* ── Internal helpers ─────────────────────────────────────── */

  function ensureNodes(): AudioNode {
    if (!throughNode) {
      throughNode = initNodes(player);
    }
    return throughNode;
  }

  function loadAudio(buffer: AudioBuffer) {
    if (currentPlayback) { currentPlayback.dispose(); currentPlayback = null; }
    if (stopFrameLoop) { stopFrameLoop(); stopFrameLoop = null; }
    currentBuffer = buffer;
    pendingSeekPosition = null;

    if (waveformEnabled && waveformCanvas) {
      peaks = player.extractPeakPairs(buffer, { resolution: waveformResolution });
      if (waveformSection) waveformSection.hidden = false;
      drawWaveform(waveformCanvas, peaks);
      if (waveformCursor) waveformCursor.style.left = '0%';
    }
    if (waveformShowTime) {
      if (timeDuration) timeDuration.textContent = formatTime(buffer.duration);
      if (timeCurrent) timeCurrent.textContent = formatTime(0);
    }
    if (playbackSection) playbackSection.hidden = false;
    setTransportState('stopped', transport, i18n);
    onBufferLoaded?.(buffer);
  }

  function resetCursor() {
    if (waveformCursor) waveformCursor.style.left = '0%';
    if (waveformShowTime && timeCurrent) timeCurrent.textContent = formatTime(0);
    prevProgress = -1;
    prevTimeText = '';
    prevState = '';
    pendingSeekPosition = null;
  }

  /* ── Synth param listeners ────────────────────────────────── */

  on(synthFreq, 'input', () => {
    synthFreqVal.textContent = `${synthFreq.value} Hz`;
  });

  on(synthDur, 'input', () => {
    synthDurVal.textContent = `${Number(synthDur.value).toFixed(1)} s`;
  });

  on(btnGenerate, 'click', async () => {
    try {
      await player.ensureRunning();
      ensureNodes();
      const buffer = generateSynthBuffer(
        player, synthType.value, Number(synthFreq.value), Number(synthDur.value),
      );
      loadAudio(buffer);
    } catch (e) {
      console.error('Failed to generate synth buffer:', e);
    }
  });

  /* ── File input ───────────────────────────────────────────── */

  setupFileInputHandler(
    player, i18n,
    {
      fileInput: $<HTMLInputElement>(`${prefix}file-input`),
      fileLabel: $(`${prefix}file-label`),
      fileLabelText: $(`${prefix}file-label-text`),
      fileName: $(`${prefix}file-name`),
    },
    () => ensureNodes(),
    loadAudio,
    signal,
  );

  /* ── Waveform resize + seek ───────────────────────────────── */

  if (waveformEnabled && waveformCanvas) {
    on(window, 'resize', () => {
      if (peaks.length > 0) drawWaveform(waveformCanvas, peaks);
    });

    if (waveformSeekable) {
      const container = waveformCanvas.closest('.waveform-container');
      if (container) {
        on(container, 'click', (e: Event) => {
          if (!currentBuffer) return;
          const mouseEvent = e as MouseEvent;
          const rect = container.getBoundingClientRect();
          const ratio = (mouseEvent.clientX - rect.left) / rect.width;
          const position = ratio * currentBuffer.duration;

          if (currentPlayback && (currentPlayback.getState() === 'playing' || currentPlayback.getState() === 'paused')) {
            currentPlayback.seek(position);
          } else {
            pendingSeekPosition = position;
            if (waveformCursor) waveformCursor.style.left = `${ratio * 100}%`;
            if (waveformShowTime && timeCurrent) timeCurrent.textContent = formatTime(position);
          }
        });
      }
    }
  }

  /* ── Transport ────────────────────────────────────────────── */

  on(btnPlayPause, 'click', async () => {
    try {
      await player.ensureRunning();
      const node = ensureNodes();
      if (!currentBuffer) return;

      if (currentPlayback && currentPlayback.getState() === 'playing') {
        currentPlayback.pause();
        setTransportState('paused', transport, i18n);
        return;
      }
      if (currentPlayback && currentPlayback.getState() === 'paused') {
        currentPlayback.resume();
        setTransportState('playing', transport, i18n);
        return;
      }

      if (currentPlayback) currentPlayback.dispose();
      if (stopFrameLoop) { stopFrameLoop(); stopFrameLoop = null; }

      const playOpts = {
        through: [node],
        ...getPlayOptions?.(),
        ...(pendingSeekPosition !== null ? { offset: pendingSeekPosition } : {}),
      };
      pendingSeekPosition = null;
      currentPlayback = player.play(currentBuffer, playOpts as Parameters<typeof player.play>[1]);
      setTransportState('playing', transport, i18n);

      // Frame loop
      stopFrameLoop = player.onFrame(currentPlayback, (snapshot) => {
        // Diff-based cursor update
        const progressPct = snapshot.progress * 100;
        if (waveformCursor && Math.abs(progressPct - prevProgress) > 0.05) {
          waveformCursor.style.left = `${progressPct}%`;
          prevProgress = progressPct;
        }
        // Diff-based time update
        if (waveformShowTime && timeCurrent) {
          const timeText = formatTime(snapshot.position);
          if (timeText !== prevTimeText) {
            timeCurrent.textContent = timeText;
            prevTimeText = timeText;
          }
        }
        // Diff-based transport state update
        if (snapshot.state !== prevState) {
          if (snapshot.state === 'playing') setTransportState('playing', transport, i18n);
          else if (snapshot.state === 'paused') setTransportState('paused', transport, i18n);
          prevState = snapshot.state;
        }
        externalOnFrame?.(snapshot);
      });

      currentPlayback.on('ended', () => {
        if (stopFrameLoop) { stopFrameLoop(); stopFrameLoop = null; }
        setTransportState('stopped', transport, i18n);
        resetCursor();
        externalOnEnded?.();
      });
    } catch (e) {
      console.error('Playback error:', e);
    }
  });

  on(btnStop, 'click', () => {
    if (currentPlayback) {
      if (stopFrameLoop) { stopFrameLoop(); stopFrameLoop = null; }
      currentPlayback.stop();
      setTransportState('stopped', transport, i18n);
      resetCursor();
      externalOnStop?.();
    }
  });

  /* ── Public API ───────────────────────────────────────────── */

  const controller: DemoController = {
    player,
    get currentPlayback() { return currentPlayback; },
    set currentPlayback(v) { currentPlayback = v; },
    get currentBuffer() { return currentBuffer; },
    set currentBuffer(v) { currentBuffer = v; },
    get peaks() { return peaks; },
    set peaks(v) { peaks = v; },
    dispose() {
      ac.abort();
      if (stopFrameLoop) { stopFrameLoop(); stopFrameLoop = null; }
      if (currentPlayback) { currentPlayback.dispose(); currentPlayback = null; }
    },
    updateWaveform(resolution: number) {
      if (!currentBuffer || !waveformCanvas) return;
      peaks = player.extractPeakPairs(currentBuffer, { resolution });
      drawWaveform(waveformCanvas, peaks);
    },
  };

  return controller;
}
