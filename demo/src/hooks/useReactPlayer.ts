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
  loop: boolean;
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
  handleLoopToggle: () => void;
  seekedPosition: number | null;
}

export function useReactPlayer(locale: Locale): UseReactPlayerReturn {
  const playerRef = useRef<ReturnType<typeof getSharedPlayer> | null>(null);
  function getPlayer() {
    if (!playerRef.current) playerRef.current = getSharedPlayer();
    return playerRef.current;
  }

  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [loop, setLoop] = useState(true);
  const [synthType, setSynthType] = useState('sine');
  const [synthFreq, setSynthFreq] = useState(440);
  const [synthDur, setSynthDur] = useState(3);
  const [fileName, setFileName] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const [seekedPosition, setSeekedPosition] = useState<number | null>(null);

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
    pendingSeekRef.current = null;
    setSeekedPosition(null);
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
      pendingSeekRef.current = null;
      setSeekedPosition(null);
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
      const offset = pendingSeekRef.current;
      pendingSeekRef.current = null;
      setSeekedPosition(null);
      const pb = p.play(buffer, { loop, ...(offset !== null ? { offset } : {}) });
      setPlayback(pb);
    } else {
      playback.togglePlayPause();
    }
  }

  function handleStop() {
    if (playback) {
      playback.stop();
    }
    pendingSeekRef.current = null;
    setSeekedPosition(null);
  }

  function handleSeek(ratio: number) {
    if (!buffer) return;
    const position = ratio * buffer.duration;
    if (playback && (playback.getState() === 'playing' || playback.getState() === 'paused')) {
      playback.seek(position);
    } else {
      pendingSeekRef.current = position;
      setSeekedPosition(position);
    }
  }

  function handleLoopToggle() {
    const next = !loop;
    setLoop(next);
    if (playback) playback.setLoop(next);
  }

  const state = snap?.state ?? 'stopped';

  return {
    buffer,
    playback,
    snap,
    peaks,
    state,
    loop,
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
    handleLoopToggle,
    seekedPosition,
  };
}
