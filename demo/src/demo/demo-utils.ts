import type { PeakPair } from 'waa';
import type { WaaPlayer } from 'waa';

/* ── Types ──────────────────────────────────────────────────── */

export type TransportState = 'stopped' | 'playing' | 'paused';

export interface I18nStrings {
  pause: string;
  play: string;
  loading: string;
  loadFailed: string;
  loadFile: string;
}

/* ── i18n ───────────────────────────────────────────────────── */

export function initI18nStrings(wrapper: HTMLElement | null): I18nStrings {
  return {
    pause: wrapper?.dataset.i18nPause ?? 'Pause',
    play: wrapper?.dataset.i18nPlay ?? 'Play',
    loading: wrapper?.dataset.i18nLoading ?? 'Loading...',
    loadFailed: wrapper?.dataset.i18nLoadFailed ?? 'Failed to load file',
    loadFile: wrapper?.dataset.i18nLoadFile ?? 'Load Audio File',
  };
}

/* ── Waveform ───────────────────────────────────────────────── */

export function drawWaveform(
  canvas: HTMLCanvasElement,
  pairs: PeakPair[],
  fillStyle = 'rgba(99, 102, 241, 0.6)',
): void {
  const rect = canvas.parentElement!.getBoundingClientRect();
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
  const c = canvas.getContext('2d')!;
  c.scale(devicePixelRatio, devicePixelRatio);
  const w = rect.width, h = rect.height, mid = h / 2;
  const barWidth = w / pairs.length;
  c.clearRect(0, 0, w, h);
  for (let i = 0; i < pairs.length; i++) {
    const { min, max } = pairs[i]!;
    c.fillStyle = fillStyle;
    c.fillRect(i * barWidth, mid - max * mid, barWidth - 0.5, (max - min) * mid);
  }
}

/* ── Transport ──────────────────────────────────────────────── */

export interface TransportElements {
  btnPlayPause: HTMLButtonElement;
  btnStop: HTMLButtonElement;
  iconPlay: SVGElement;
  iconPause: SVGElement;
}

export function setTransportState(
  state: TransportState,
  el: TransportElements,
  i18n: Pick<I18nStrings, 'pause' | 'play'>,
): void {
  el.btnPlayPause.dataset.state = state;
  if (state === 'playing') {
    el.iconPlay.setAttribute('hidden', '');
    el.iconPause.removeAttribute('hidden');
    el.btnPlayPause.title = i18n.pause;
    el.btnStop.disabled = false;
  } else {
    el.iconPause.setAttribute('hidden', '');
    el.iconPlay.removeAttribute('hidden');
    el.btnPlayPause.title = i18n.play;
    el.btnStop.disabled = state === 'stopped';
  }
}

/* ── File Input Handler ─────────────────────────────────────── */

export interface FileInputElements {
  fileInput: HTMLInputElement;
  fileLabel: HTMLElement;
  fileLabelText: HTMLElement;
  fileName: HTMLElement;
}

export function setupFileInputHandler(
  player: WaaPlayer,
  i18n: I18nStrings,
  el: FileInputElements,
  initNodes: () => void,
  onLoad: (buffer: AudioBuffer) => void,
): void {
  el.fileInput.addEventListener('change', async () => {
    const file = el.fileInput.files?.[0];
    if (!file) return;
    el.fileLabel.classList.add('is-loading');
    el.fileLabelText.textContent = i18n.loading;
    el.fileName.innerHTML = '<span class="spinner"></span>';
    try {
      await player.ensureRunning();
      initNodes();
      const buffer = await player.loadFromBlob(file);
      el.fileName.textContent = file.name;
      onLoad(buffer);
    } catch {
      el.fileName.textContent = i18n.loadFailed;
    } finally {
      el.fileLabel.classList.remove('is-loading');
      el.fileLabelText.textContent = i18n.loadFile;
    }
  });
}

/* ── Synth Generation ───────────────────────────────────────── */

export function generateSynthBuffer(
  player: WaaPlayer,
  type: string,
  freq: number,
  dur: number,
): AudioBuffer {
  switch (type) {
    case 'noise': return player.createNoiseBuffer(dur);
    case 'click': return player.createClickBuffer(freq, dur);
    default: return player.createSineBuffer(freq, dur);
  }
}
