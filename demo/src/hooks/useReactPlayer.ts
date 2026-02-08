import { useState, useMemo, useRef } from 'react';
import type { Playback, PlaybackSnapshot, PeakPair } from 'waa';
import { getSharedPlayer } from '../demo/shared-player';
import { usePlaybackSnapshot } from './usePlaybackSnapshot';
import { t } from '../i18n/translations';
import type { Locale } from '../i18n/translations';

export interface UseReactPlayerReturn {
  buffer: AudioBuffer | null;
  playback: Playback | null;
  snap: PlaybackSnapshot | null;
  peaks: PeakPair[];
  state: 'playing' | 'paused' | 'stopped';
  synthType: string;
  setSynthType: (v: string) => void;
  synthFreq: number;
  setSynthFreq: (v: number) => void;
  synthDur: number;
  setSynthDur: (v: number) => void;
  fileName: string;
  fileLoading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleGenerate: () => Promise<void>;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleToggle: () => void;
  handleStop: () => void;
  handleSeek: (ratio: number) => void;
}

export function useReactPlayer(locale: Locale): UseReactPlayerReturn {
  const playerRef = useRef<ReturnType<typeof getSharedPlayer> | null>(null);
  function getPlayer() {
    if (!playerRef.current) playerRef.current = getSharedPlayer();
    return playerRef.current;
  }

  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [synthType, setSynthType] = useState('sine');
  const [synthFreq, setSynthFreq] = useState(440);
  const [synthDur, setSynthDur] = useState(3);
  const [fileName, setFileName] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    let buf: AudioBuffer;
    switch (synthType) {
      case 'noise': buf = p.createNoiseBuffer(synthDur); break;
      case 'click': buf = p.createClickBuffer(synthFreq, synthDur); break;
      default: buf = p.createSineBuffer(synthFreq, synthDur);
    }
    setBuffer(buf);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileLoading(true);
    setFileName('');
    try {
      const p = getPlayer();
      await p.ensureRunning();
      if (playback && playback.getState() !== 'stopped') {
        playback.stop();
      }
      setPlayback(null);
      const buf = await p.loadFromBlob(file);
      setBuffer(buf);
      setFileName(file.name);
    } catch {
      setFileName(t(locale, 'source.load-failed'));
    } finally {
      setFileLoading(false);
    }
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

  function handleSeek(ratio: number) {
    if (playback && buffer) {
      playback.seek(ratio * buffer.duration);
    }
  }

  const state = snap?.state ?? 'stopped';

  return {
    buffer,
    playback,
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
  };
}
