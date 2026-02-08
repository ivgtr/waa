import { useRef, useEffect } from 'react';
import type { PeakPair } from 'waa';
import { useReactPlayer } from '../../hooks/useReactPlayer';
import { formatTime } from '../../demo/shared-player';
import { t } from '../../i18n/translations';
import type { Locale } from '../../i18n/translations';
import '../../demo/style.css';

function Waveform({ peaks, progress, onSeek }: { peaks: PeakPair[]; progress: number; onSeek?: (ratio: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || peaks.length === 0) return;
    const rect = canvas.parentElement!.getBoundingClientRect();
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;
    const c = canvas.getContext('2d')!;
    c.scale(devicePixelRatio, devicePixelRatio);
    const w = rect.width, h = rect.height, mid = h / 2;
    const barWidth = w / peaks.length;
    c.clearRect(0, 0, w, h);
    for (let i = 0; i < peaks.length; i++) {
      const { min, max } = peaks[i]!;
      const x = i * barWidth;
      const isPlayed = i / peaks.length < progress;
      c.fillStyle = isPlayed ? 'rgba(99, 102, 241, 0.9)' : 'rgba(99, 102, 241, 0.4)';
      c.fillRect(x, mid - max * mid, barWidth - 0.5, (max - min) * mid);
    }
  }, [peaks, progress]);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onSeek(ratio);
  }

  return (
    <div className="waveform-container" onClick={handleClick} style={{ cursor: onSeek ? 'pointer' : undefined }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div className="waveform-cursor" style={{ left: `${progress * 100}%` }} />
    </div>
  );
}

interface Props {
  locale?: Locale;
}

export default function ReactPlayerDemo({ locale = 'ja' }: Props) {
  const {
    buffer,
    snap,
    peaks,
    state,
    synthType,
    setSynthType,
    synthFreq,
    setSynthFreq,
    synthDur,
    setSynthDur,
    fileName,
    fileLoading,
    fileInputRef,
    handleGenerate,
    handleFileChange,
    handleToggle,
    handleStop,
    handleSeek,
  } = useReactPlayer(locale);

  return (
    <div className="demo-wrapper not-content">
      <section className="card">
        <h2>{t(locale, 'source.title')}</h2>
        <p className="description">{t(locale, 'source.description')}</p>
        <div className="source-controls">
          <div className="synth-controls">
            <div className="synth-params">
              <label className="synth-label">
                <span className="label-text">{t(locale, 'source.type')}</span>
                <select value={synthType} onChange={e => setSynthType(e.target.value)}>
                  <option value="sine">{t(locale, 'source.sine')}</option>
                  <option value="noise">{t(locale, 'source.noise')}</option>
                  <option value="click">{t(locale, 'source.click')}</option>
                </select>
              </label>
              <label className="synth-label">
                <span className="label-text">{t(locale, 'source.frequency')}</span>
                <input type="range" min="50" max="2000" value={synthFreq} onChange={e => setSynthFreq(Number(e.target.value))} />
                <span className="range-value">{synthFreq} Hz</span>
              </label>
              <label className="synth-label">
                <span className="label-text">{t(locale, 'source.duration')}</span>
                <input type="range" min="0.5" max="5" step="0.5" value={synthDur} onChange={e => setSynthDur(Number(e.target.value))} />
                <span className="range-value">{synthDur.toFixed(1)} s</span>
              </label>
            </div>
            <button className="btn btn-primary" onClick={handleGenerate}>
              {t(locale, 'source.generate')}
            </button>
          </div>
          <div className="divider">{t(locale, 'source.or')}</div>
          <div className="file-controls">
            <label className={`btn btn-secondary file-label${fileLoading ? ' is-loading' : ''}`}>
              <svg className="file-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span>{fileLoading ? t(locale, 'source.loading') : t(locale, 'source.load-file')}</span>
              <input ref={fileInputRef} type="file" accept="audio/*" hidden onChange={handleFileChange} />
            </label>
            {fileName && <span className="file-name">{fileName}</span>}
            {fileLoading && <span className="file-name"><span className="spinner"></span></span>}
          </div>
        </div>
      </section>

      {buffer && (
        <>
          <section className="card">
            <h2>{t(locale, 'waveform.title')}</h2>
            <Waveform peaks={peaks} progress={snap?.progress ?? 0} onSeek={handleSeek} />
            <div className="time-display">
              <span>{formatTime(snap?.position ?? 0)}</span>
              <span>{formatTime(snap?.duration ?? 0)}</span>
            </div>
          </section>

          <section className="card">
            <h2>{t(locale, 'playback.title')}</h2>
            <div className="playback-controls">
              <div className="transport-buttons">
                <button
                  className="btn btn-icon btn-transport"
                  data-state={state}
                  title={state === 'playing' ? t(locale, 'playback.pause') : t(locale, 'playback.play')}
                  onClick={handleToggle}
                >
                  {state === 'playing' ? (
                    <svg viewBox="0 0 24 24" width="20" height="20">
                      <rect x="5" y="3" width="4" height="18" fill="currentColor" />
                      <rect x="15" y="3" width="4" height="18" fill="currentColor" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="20" height="20">
                      <polygon points="6,3 20,12 6,21" fill="currentColor" />
                    </svg>
                  )}
                </button>
                <button
                  className="btn btn-icon btn-transport"
                  title={t(locale, 'playback.stop')}
                  disabled={state === 'stopped'}
                  onClick={handleStop}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18">
                    <rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" />
                  </svg>
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
