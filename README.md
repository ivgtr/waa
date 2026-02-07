# waa

Composable Web Audio API utilities.

BYO AudioContext / Zero Dependencies / Framework-agnostic / Sample-accurate / Pitch-preserving time-stretch

**[Demo](https://ivgtr.github.io/waa/)**

## What is this?

再生からピッチ保持タイムストレッチまで、必要な機能を関数単位で組み合わせられる Web Audio ライブラリです。

## Features

- **BYO AudioContext** — AudioContext を外から渡す設計なので、他のライブラリとの共存も自由
- **Composable** — モノリシックな Player クラスではなく、小さな関数の組み合わせ
- **Zero Dependencies** — Web Audio API だけに依存、バンドルサイズ最小
- **Framework-agnostic** — React / Vue / Svelte / Vanilla JS どれでも同じ API
- **Sample-accurate** — `AudioContext.currentTime` ベースの精密な再生位置追跡
- **Tree-shakeable** — 使う関数だけがバンドルに入る
- **Pitch-preserving time-stretch** — WSOLA アルゴリズムによるテンポ変更、Web Worker でメインスレッドをブロックしない

## Install

```bash
npm install waa
```

## Quick Start

```ts
import { createContext, loadBuffer, play, createGain } from "waa";

const ctx = createContext();
const buffer = await loadBuffer(ctx, "/audio/track.mp3");

const gain = createGain(ctx, 0.8);
const playback = play(ctx, buffer, { through: [gain] });

playback.on("timeupdate", ({ position, duration }) => {
  console.log(`${position.toFixed(1)}s / ${duration.toFixed(1)}s`);
});

playback.pause();
playback.seek(30);
playback.resume();
```

## Modules

必要なものだけ import できます。

```ts
import { play } from "waa/play";
import { loadBuffer } from "waa/buffer";
import { extractPeaks } from "waa/waveform";
```

| Module | 概要 |
|--------|------|
| `context` | AudioContext の作成・resume・現在時刻の取得 |
| `buffer` | URL や Blob からの音声ロード・デコード |
| `play` | 再生エンジン（play / pause / seek / loop / events / preservePitch） |
| `emitter` | 型安全なイベントエミッター |
| `nodes` | GainNode, AnalyserNode, Filter 等のファクトリとチェーン接続 |
| `waveform` | ピーク抽出・RMS 計算（波形描画用） |
| `fade` | フェードイン・アウト・クロスフェード |
| `scheduler` | 精密スケジューリングと BPM ベースの Clock |
| `synth` | サイン波・ノイズ・クリック音のバッファ生成 |
| `adapters` | React `useSyncExternalStore` / Vue / Svelte 向けのスナップショット連携 |
| `stretcher` | WSOLA アルゴリズムによるピッチ保持タイムストレッチ |

## Usage Examples

### 音声ファイルのロードと再生

```ts
import { createContext, loadBuffer, play } from "waa";

const ctx = createContext();
const buffer = await loadBuffer(ctx, "/audio/song.mp3", {
  onProgress: (p) => console.log(`${Math.round(p * 100)}%`),
});

const playback = play(ctx, buffer, {
  loop: true,
  playbackRate: 1.25,
});

playback.on("ended", () => console.log("Done!"));
```

### オーディオグラフの構築

```ts
import { createGain, createFilter, createPanner, chain } from "waa";

const gain = createGain(ctx, 0.8);
const lowpass = createFilter(ctx, { type: "lowpass", frequency: 2000 });
const panner = createPanner(ctx, -0.5);

chain(sourceNode, gain, lowpass, panner);
panner.connect(ctx.destination);
```

### 波形の描画

```ts
import { extractPeaks } from "waa";

const peaks = extractPeaks(buffer, { resolution: 500 });
peaks.forEach((peak, i) => {
  ctx2d.fillRect(i * barWidth, canvas.height * (1 - peak), barWidth - 1, canvas.height * peak);
});
```

### React で使う

```tsx
import { useSyncExternalStore, useCallback } from "react";
import { subscribeSnapshot, getSnapshot, type Playback } from "waa";

function usePlayback(playback: Playback | null) {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (!playback) return () => {};
      return subscribeSnapshot(playback, cb);
    },
    [playback],
  );
  return useSyncExternalStore(
    subscribe,
    () => (playback ? getSnapshot(playback) : null),
  );
}
```

### ピッチを保持したままテンポを変更

```ts
import { createContext, loadBuffer, play, onFrame } from "waa";

const ctx = createContext();
const buffer = await loadBuffer(ctx, "/audio/track.mp3");

// preservePitch: true を渡すだけでピッチ保持タイムストレッチが有効に
const playback = play(ctx, buffer, {
  playbackRate: 0.75,     // テンポ 75%（スロー再生）
  preservePitch: true,    // ピッチは変わらない
});

// 再生中にテンポを変更
playback.setPlaybackRate(1.25); // テンポ 125%（高速再生）

// stretcher の状態を監視
const stopLoop = onFrame(playback, (snapshot) => {
  if (snapshot.stretcher) {
    console.log(`変換進捗: ${(snapshot.stretcher.conversionProgress * 100).toFixed(0)}%`);
    console.log(`バッファ: ${snapshot.stretcher.bufferHealth}`);
  }
});
```

### 他のライブラリの AudioContext を使う

```ts
import { play, loadBuffer } from "waa";
import { Tone } from "tone";

const ctx = Tone.context.rawContext;
const buffer = await loadBuffer(ctx, "/audio/track.mp3");
play(ctx, buffer);
```

## License

MIT
