import { useState, useMemo, useSyncExternalStore, useRef, useEffect, useCallback } from 'react';
import { getSnapshot, subscribeSnapshot } from 'waa';
import type { Playback, PlaybackSnapshot, PeakPair } from 'waa';
import { getSharedPlayer, formatTime } from '../../demo/shared-player';
import { t } from '../../i18n/translations';
import type { Locale } from '../../i18n/translations';
import '../../demo/style.css';

function usePlaybackSnapshot(playback: Playback | null): PlaybackSnapshot | null {
  const subscribe = useCallback(
    (cb: () => void) => (playback ? subscribeSnapshot(playback, cb) : () => {}),
    [playback],
  );
  return useSyncExternalStore(
    subscribe,
    () => (playback ? getSnapshot(playback) : null),
    () => null,
  );
}

function Waveform({ peaks, progress }: { peaks: PeakPair[]; progress: number }) {
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

  return (
    <div className="waveform-container">
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div className="waveform-cursor" style={{ left: `${progress * 100}%` }} />
    </div>
  );
}

interface Props {
  locale?: Locale;
}

export default function ReactPlayerDemo({ locale = 'ja' }: Props) {
  const playerRef = useRef<ReturnType<typeof getSharedPlayer> | null>(null);
  function getPlayer() {
    if (!playerRef.current) playerRef.current = getSharedPlayer();
    return playerRef.current;
  }
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const snap = usePlaybackSnapshot(playback);
  const peaks = useMemo(
    () => (buffer && playerRef.current ? playerRef.current.extractPeakPairs(buffer, { resolution: 200 }) : []),
    [buffer],
  );

  async function handleGenerate() {
    const p = getPlayer();
    await p.ensureRunning();
    if (playback && playback.getState() !== 'stopped') {
      playback.stop();
    }
    setPlayback(null);
    const buf = p.createSineBuffer(440, 3);
    setBuffer(buf);
  }

  function handleToggle() {
    if (!buffer) return;
    const p = getPlayer();
    if (!playback || playback.getState() === 'stopped') {
      if (playback) {
        playback.dispose();
      }
      const pb = p.play(buffer, { loop: true });
      setPlayback(pb);
    } else {
      playback.togglePlayPause();
    }
  }

  function handleStop() {
    if (playback) {
      playback.stop();
    }
  }

  const state = snap?.state ?? 'stopped';

  return (
    <div className="demo-wrapper not-content">
      <section className="card">
        <h2>{t(locale, 'source.title')}</h2>
        <p className="description">{t(locale, 'source.description')}</p>
        <button className="btn btn-primary" onClick={handleGenerate}>
          {t(locale, 'source.generate')}
        </button>
      </section>

      {buffer && (
        <>
          <section className="card">
            <h2>{t(locale, 'waveform.title')}</h2>
            <Waveform peaks={peaks} progress={snap?.progress ?? 0} />
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
