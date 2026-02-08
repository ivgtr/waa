---
title: 関数 API
description: Tree-shake 可能な関数モジュール
---

モジュールごとに整理された、tree-shake 可能な個別関数です。各関数は `AudioContext` を第一引数に取ります（BYO Context パターン）。

```ts
import { createContext } from "waa-play/context";
import { loadBuffer } from "waa-play/buffer";
import { play } from "waa-play/play";

const ctx = createContext();
const buffer = await loadBuffer(ctx, "/audio/track.mp3");
const playback = play(ctx, buffer);
```

---

## play

コア再生エンジン。`AudioBufferSourceNode` をステートマシン、ポジショントラッキング、イベントシステムでラップします。

```ts
import { play } from "waa-play/play";
```

### `play()`

```ts
play(ctx: AudioContext, buffer: AudioBuffer, options?: PlayOptions): Playback;
```

AudioBuffer を再生します。制御可能な `Playback` ハンドルを返します。

```ts
const playback = play(ctx, buffer, {
  offset: 10,
  loop: true,
  playbackRate: 1.5,
  through: [gain, filter],
});
```

### PlayOptions

| オプション | 型 | デフォルト | 説明 |
|--------|------|---------|-------------|
| `offset` | `number` | `0` | 開始位置（秒） |
| `loop` | `boolean` | `false` | ループを有効にする |
| `loopStart` | `number` | `0` | ループ開始点（秒） |
| `loopEnd` | `number` | `duration` | ループ終了点（秒） |
| `playbackRate` | `number` | `1` | 再生速度倍率 |
| `through` | `AudioNode[]` | `[]` | 経由する audio node（effect chain） |
| `destination` | `AudioNode` | `ctx.destination` | 出力先ノード |
| `timeupdateInterval` | `number` | `250` | `timeupdate` イベントの間隔（ms） |
| `preservePitch` | `boolean` | `false` | 再生速度変更時に pitch を保持（Stretcher Engine を使用） |

### Playback メソッド

```ts
// State
getState(): PlaybackState;    // "playing" | "paused" | "stopped"
getCurrentTime(): number;
getDuration(): number;
getProgress(): number;         // [0, 1]

// Control
pause(): void;
resume(): void;
togglePlayPause(): void;
seek(position: number): void;
stop(): void;

// Configuration
setPlaybackRate(rate: number): void;
setLoop(loop: boolean): void;

// Events
on(event: string, handler: Function): () => void;  // Returns unsubscribe
off(event: string, handler: Function): void;

// Cleanup
dispose(): void;
```

### Playback イベント

| イベント | ペイロード | 説明 |
|-------|---------|-------------|
| `play` | - | 再生開始 |
| `pause` | - | 一時停止 |
| `resume` | - | 一時停止から再開 |
| `seek` | `number` | 指定位置にシーク（秒） |
| `stop` | - | 再生停止 |
| `ended` | - | 自然に終了 |
| `loop` | - | 先頭にループ |
| `statechange` | `PlaybackState` | 状態が変化 |
| `timeupdate` | `number` | ポジション更新（`timeupdateInterval` 間隔で発火） |
| `buffering` | - | Stretcher Engine が buffering 中 |
| `buffered` | - | Stretcher Engine の buffering 完了 |

### PlaybackSnapshot

```ts
interface PlaybackSnapshot {
  state: PlaybackState;
  position: number;
  duration: number;
  progress: number;
  stretcher?: StretcherSnapshotExtension;
}
```

---

## context

AudioContext ライフサイクルユーティリティ。

```ts
import { createContext, resumeContext, ensureRunning, now } from "waa-play/context";
```

### `createContext()`

```ts
createContext(options?: { sampleRate?: number; latencyHint?: AudioContextLatencyCategory | number }): AudioContext;
```

### `resumeContext()`

```ts
resumeContext(ctx: AudioContext): Promise<void>;
```

一時停止中の AudioContext を再開します。ユーザージェスチャーハンドラから呼び出してください。

### `ensureRunning()`

```ts
ensureRunning(ctx: AudioContext): Promise<void>;
```

AudioContext が `"running"` 状態であることを保証します。複数回呼び出しても安全です。

### `now()`

```ts
now(ctx: AudioContext): number;
```

`ctx.currentTime` のショートハンド。

---

## buffer

音声ファイルの読み込みとデコード。

```ts
import { loadBuffer, loadBufferFromBlob, loadBuffers, getBufferInfo } from "waa-play/buffer";
```

### `loadBuffer()`

```ts
loadBuffer(ctx: AudioContext, url: string, options?: { onProgress?: (progress: number) => void }): Promise<AudioBuffer>;
```

音声ファイルを取得してデコードします。`onProgress`（0–1）で進捗をトラッキングできます。

### `loadBufferFromBlob()`

```ts
loadBufferFromBlob(ctx: AudioContext, blob: Blob): Promise<AudioBuffer>;
```

Blob または File から AudioBuffer をデコードします。

### `loadBuffers()`

```ts
loadBuffers(ctx: AudioContext, map: Record<string, string>): Promise<Map<string, AudioBuffer>>;
```

キーと URL のマップから複数の音声ファイルを並行して読み込みます。

### `getBufferInfo()`

```ts
getBufferInfo(buffer: AudioBuffer): { duration: number; numberOfChannels: number; sampleRate: number; length: number };
```

---

## nodes

Audio node ファクトリとルーティングユーティリティ。

```ts
import { createGain, rampGain, createAnalyser, createFilter, createPanner, createCompressor, chain, disconnectChain } from "waa-play/nodes";
```

### ノードファクトリ

```ts
createGain(ctx: AudioContext, initialValue?: number): GainNode;
createAnalyser(ctx: AudioContext, options?: { fftSize?: number; smoothingTimeConstant?: number }): AnalyserNode;
createFilter(ctx: AudioContext, options?: { type?: BiquadFilterType; frequency?: number; Q?: number; gain?: number }): BiquadFilterNode;
createPanner(ctx: AudioContext, pan?: number): StereoPannerNode;
createCompressor(ctx: AudioContext, options?: { threshold?: number; knee?: number; ratio?: number; attack?: number; release?: number }): DynamicsCompressorNode;
```

### ユーティリティ

```ts
rampGain(gain: GainNode, target: number, duration: number): void;
getFrequencyData(analyser: AnalyserNode): Float32Array;
getFrequencyDataByte(analyser: AnalyserNode): Uint8Array;
```

### ルーティング

```ts
chain(...nodes: AudioNode[]): void;           // ノードを直列に接続
disconnectChain(...nodes: AudioNode[]): void;  // チェーン接続を切断
```

---

## emitter

最小限の型安全イベントエミッター。

```ts
import { createEmitter } from "waa-play/emitter";
```

### `createEmitter()`

```ts
createEmitter<Events extends Record<string, unknown>>(): Emitter<Events>;
```

```ts
type MyEvents = { progress: number; complete: void };
const emitter = createEmitter<MyEvents>();

emitter.on("progress", (v) => console.log(v));  // Returns unsubscribe fn
emitter.emit("progress", 0.5);
emitter.clear();  // Remove all handlers
```

### Emitter メソッド

```ts
on<K>(event: K, handler: (data: Events[K]) => void): () => void;
off<K>(event: K, handler: (data: Events[K]) => void): void;
emit<K>(event: K, data: Events[K]): void;
clear(event?: keyof Events): void;
```

---

## waveform

AudioBuffer からビジュアル波形データを抽出。

```ts
import { extractPeaks, extractPeakPairs, extractRMS } from "waa-play/waveform";
```

### 関数

```ts
extractPeaks(buffer: AudioBuffer, options?: ExtractPeaksOptions): number[];
extractPeakPairs(buffer: AudioBuffer, options?: ExtractPeaksOptions): PeakPair[];
extractRMS(buffer: AudioBuffer, options?: ExtractPeaksOptions): number[];
```

### オプション

| オプション | 型 | デフォルト | 説明 |
|--------|------|---------|-------------|
| `resolution` | `number` | `200` | 抽出するデータポイント数 |
| `channel` | `number` | `0` | チャンネルインデックス（`-1` で全チャンネル） |

`PeakPair` は `{ min: number; max: number }` です。

---

## fade

GainNode オートメーションによるフェードイン/アウトとクロスフェードユーティリティ。

```ts
import { fadeIn, fadeOut, crossfade, autoFade } from "waa-play/fade";
```

### 関数

```ts
fadeIn(gain: GainNode, target: number, options?: FadeOptions): void;
fadeOut(gain: GainNode, options?: FadeOptions): void;
crossfade(gainA: GainNode, gainB: GainNode, options?: CrossfadeOptions): void;
autoFade(playback: Playback, gain: GainNode, options?: AutoFadeOptions): () => void;
```

`autoFade` は開始時にフェードイン、終了前にフェードアウトを適用します。クリーンアップ関数を返します。

### オプション

| オプション | 型 | デフォルト | 説明 |
|--------|------|---------|-------------|
| `duration` | `number` | `1` | フェード時間（秒） |
| `curve` | `FadeCurve` | `"linear"` | `"linear"` \| `"exponential"` \| `"equal-power"` |

`AutoFadeOptions` は `duration` の代わりに `fadeIn` / `fadeOut`（秒）を使用します。

---

## scheduler

先読みベースのイベントスケジューラと BPM クロック。

```ts
import { createScheduler, createClock } from "waa-play/scheduler";
```

### `createScheduler()`

```ts
createScheduler(ctx: AudioContext, options?: { lookahead?: number; interval?: number }): Scheduler;
```

| オプション | 型 | デフォルト | 説明 |
|--------|------|---------|-------------|
| `lookahead` | `number` | `0.1` | 先読み時間（秒） |
| `interval` | `number` | `25` | タイマー間隔（ms） |

**Scheduler メソッド:** `schedule(id, time, callback)`, `cancel(id)`, `start()`, `stop()`, `dispose()`.

### `createClock()`

```ts
createClock(ctx: AudioContext, options?: { bpm?: number }): Clock;
```

BPM ベースのクロック。デフォルト `120` BPM。

**Clock メソッド:** `beatToTime(beat)`, `getCurrentBeat()`, `getNextBeatTime()`, `setBpm(bpm)`, `getBpm()`.

---

## synth

合成 audio buffer を生成。

```ts
import { createSineBuffer, createNoiseBuffer, createClickBuffer } from "waa-play/synth";
```

```ts
createSineBuffer(ctx: AudioContext, frequency: number, duration: number): AudioBuffer;
createNoiseBuffer(ctx: AudioContext, duration: number): AudioBuffer;
createClickBuffer(ctx: AudioContext, frequency: number, duration: number): AudioBuffer;
```

---

## adapters

Framework 統合ユーティリティ。React の `useSyncExternalStore` と互換性があります。

```ts
import { getSnapshot, subscribeSnapshot, onFrame, whenEnded, whenPosition } from "waa-play/adapters";
```

### 関数

```ts
getSnapshot(playback: Playback): PlaybackSnapshot;
subscribeSnapshot(playback: Playback, callback: (snap: PlaybackSnapshot) => void): () => void;
onFrame(playback: Playback, callback: (snap: PlaybackSnapshot) => void): () => void;
whenEnded(playback: Playback): Promise<void>;
whenPosition(playback: Playback, position: number): Promise<void>;
```

### React の例

```tsx
import { useSyncExternalStore } from "react";
import { getSnapshot, subscribeSnapshot } from "waa-play/adapters";

function usePlayback(playback: Playback) {
  return useSyncExternalStore(
    (cb) => subscribeSnapshot(playback, cb),
    () => getSnapshot(playback),
  );
}
```
