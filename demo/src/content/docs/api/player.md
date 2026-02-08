---
title: WaaPlayer
description: 全モジュールをラップするクラスベース API
---

`WaaPlayer` は waa-play の全モジュールをラップした統一的なクラスベースインターフェースを提供します。内部で `AudioContext` を管理します。

```ts
import { WaaPlayer } from "waa-play";
```

## コンストラクタ

```ts
new WaaPlayer();
new WaaPlayer(ctx: AudioContext);
new WaaPlayer(options: WaaPlayerOptions);
```

新しい WaaPlayer インスタンスを作成します。既存の `AudioContext` またはオプションオブジェクトを任意で渡せます。

```ts
// Use default AudioContext
const player = new WaaPlayer();

// Provide your own AudioContext
const ctx = new AudioContext({ sampleRate: 48000 });
const player = new WaaPlayer(ctx);

// Pass options for AudioContext creation
const player = new WaaPlayer({ sampleRate: 48000 });
```

## プロパティ

### `ctx`

```ts
readonly ctx: AudioContext;
```

内部の `AudioContext` インスタンス。

## コンテキストメソッド

### `resume()`

```ts
resume(): Promise<void>;
```

一時停止中の AudioContext を再開します。`resumeContext(ctx)` と同等です。

### `ensureRunning()`

```ts
ensureRunning(): Promise<void>;
```

AudioContext が `running` 状態であることを保証します。

### `now()`

```ts
now(): number;
```

AudioContext の現在時刻（`ctx.currentTime`）を返します。

## バッファメソッド

### `load()`

```ts
load(url: string, options?: LoadBufferOptions): Promise<AudioBuffer>;
```

URL から音声ファイルを取得してデコードします。

```ts
const buffer = await player.load("/audio/track.mp3", {
  onProgress: (p) => console.log(`${Math.round(p * 100)}%`),
});
```

### `loadFromBlob()`

```ts
loadFromBlob(blob: Blob): Promise<AudioBuffer>;
```

`Blob` または `File` から AudioBuffer をデコードします。

### `loadAll()`

```ts
loadAll(map: Record<string, string>): Promise<Map<string, AudioBuffer>>;
```

複数の音声ファイルを並行して読み込みます。

```ts
const buffers = await player.loadAll({
  kick: "/audio/kick.wav",
  snare: "/audio/snare.wav",
});
```

### `getBufferInfo()`

```ts
getBufferInfo(buffer: AudioBuffer): BufferInfo;
```

AudioBuffer のメタデータ（duration, channels, sampleRate, length）を取得します。

## 再生

### `play()`

```ts
play(buffer: AudioBuffer, options?: PlayOptions): Playback;
```

AudioBuffer を再生します。制御可能な `Playback` ハンドルを返します。

```ts
const playback = player.play(buffer, {
  offset: 10,
  loop: true,
  playbackRate: 1.5,
});
```

`PlayOptions` と `Playback` の詳細は [play モジュール](/waa/api/play/) を参照してください。

## ノードファクトリ

### `createGain()`

```ts
createGain(initialValue?: number): GainNode;
```

### `createAnalyser()`

```ts
createAnalyser(options?: { fftSize?: number; smoothingTimeConstant?: number }): AnalyserNode;
```

### `createFilter()`

```ts
createFilter(options?: { type?: BiquadFilterType; frequency?: number; Q?: number; gain?: number }): BiquadFilterNode;
```

### `createPanner()`

```ts
createPanner(pan?: number): StereoPannerNode;
```

### `createCompressor()`

```ts
createCompressor(options?: { threshold?: number; knee?: number; ratio?: number; attack?: number; release?: number }): DynamicsCompressorNode;
```

### `rampGain()`

```ts
rampGain(gain: GainNode, target: number, duration: number): void;
```

GainNode の値をスムーズにリニアランプします。

### `getFrequencyData()`

```ts
getFrequencyData(analyser: AnalyserNode): Float32Array;
```

### `getFrequencyDataByte()`

```ts
getFrequencyDataByte(analyser: AnalyserNode): Uint8Array;
```

### `chain()`

```ts
chain(...nodes: AudioNode[]): void;
```

Audio node を直列に接続します。

### `disconnectChain()`

```ts
disconnectChain(...nodes: AudioNode[]): void;
```

接続済みのチェーンを切断します。

## 波形

### `extractPeaks()`

```ts
extractPeaks(buffer: AudioBuffer, options?: ExtractPeaksOptions): number[];
```

AudioBuffer から正規化されたピーク振幅 `[0, 1]` を抽出します。

### `extractPeakPairs()`

```ts
extractPeakPairs(buffer: AudioBuffer, options?: ExtractPeaksOptions): PeakPair[];
```

波形描画用の min/max ピークペアを抽出します。

### `extractRMS()`

```ts
extractRMS(buffer: AudioBuffer, options?: ExtractPeaksOptions): number[];
```

RMS ラウドネス値 `[0, 1]` を抽出します。

## フェード

### `fadeIn()`

```ts
fadeIn(gain: GainNode, target: number, options?: FadeOptions): void;
```

### `fadeOut()`

```ts
fadeOut(gain: GainNode, options?: FadeOptions): void;
```

### `crossfade()`

```ts
crossfade(gainA: GainNode, gainB: GainNode, options?: CrossfadeOptions): void;
```

### `autoFade()`

```ts
autoFade(playback: Playback, gain: GainNode, options?: AutoFadeOptions): () => void;
```

再生開始時にフェードイン、終了前にフェードアウトを自動適用します。クリーンアップ関数を返します。

## スケジューラ

### `createScheduler()`

```ts
createScheduler(options?: SchedulerOptions): Scheduler;
```

### `createClock()`

```ts
createClock(options?: ClockOptions): Clock;
```

## シンセ

### `createSineBuffer()`

```ts
createSineBuffer(frequency: number, duration: number): AudioBuffer;
```

### `createNoiseBuffer()`

```ts
createNoiseBuffer(duration: number): AudioBuffer;
```

### `createClickBuffer()`

```ts
createClickBuffer(frequency: number, duration: number): AudioBuffer;
```

## アダプター

### `getSnapshot()`

```ts
getSnapshot(playback: Playback): PlaybackSnapshot;
```

### `subscribeSnapshot()`

```ts
subscribeSnapshot(playback: Playback, callback: (snap: PlaybackSnapshot) => void): () => void;
```

### `onFrame()`

```ts
onFrame(playback: Playback, callback: (snap: PlaybackSnapshot) => void): () => void;
```

### `whenEnded()`

```ts
whenEnded(playback: Playback): Promise<void>;
```

### `whenPosition()`

```ts
whenPosition(playback: Playback, position: number): Promise<void>;
```

## ライフサイクル

### `dispose()`

```ts
dispose(): void;
```

AudioContext を閉じ、すべてのリソースを解放します。`dispose()` 呼び出し後はインスタンスを使用しないでください。
