# waa-play

[![npm version](https://img.shields.io/npm/v/waa-play)](https://www.npmjs.com/package/waa-play)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

Composable Web Audio API utilities.

BYO AudioContext / Zero Dependencies / Framework-agnostic / Sample-accurate / Pitch-preserving time-stretch / Chunk-based streaming

**[Demo](https://ivgtr.github.io/waa/)**

## Features

再生からピッチ保持タイムストレッチまで、必要な機能を関数単位で組み合わせられる Web Audio ライブラリです。

- **BYO AudioContext** — AudioContext を外から渡す設計で、他のライブラリとの共存が容易
- **Composable** — モノリシックな Player クラスではなく、小さな関数を組み合わせて利用
- **Zero Dependencies** — Web Audio API のみに依存、バンドルサイズを最小化
- **Framework-agnostic** — React / Vue / Svelte / Vanilla JS のどれでも同じ API で動作
- **TypeScript-first** — 完全な型定義により、エディタ補完で快適に開発
- **Sample-accurate** — `AudioContext.currentTime` ベースの精密な再生位置追跡
- **Tree-shakeable** — 使う関数だけがバンドルに含まれる
- **Pitch-preserving time-stretch** — WSOLA アルゴリズムによるテンポ変更を Web Worker で処理
- **Chunk-based streaming** — 音声をチャンク分割で逐次処理し、低スペック環境でも安定動作

## Install

```bash
npm install waa-play
```

## Quick Start

```ts
import { createContext, loadBuffer, play, createGain } from "waa-play";

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

## Usage Examples

### オーディオグラフの構築

```ts
import { createGain, createFilter, createPanner, chain } from "waa-play";

const gain = createGain(ctx, 0.8);
const lowpass = createFilter(ctx, { type: "lowpass", frequency: 2000 });
const panner = createPanner(ctx, -0.5);

chain(sourceNode, gain, lowpass, panner);
panner.connect(ctx.destination);
```

### 波形の描画

```ts
import { extractPeaks } from "waa-play";

const peaks = extractPeaks(buffer, { resolution: 500 });
peaks.forEach((peak, i) => {
  ctx2d.fillRect(i * barWidth, canvas.height * (1 - peak), barWidth - 1, canvas.height * peak);
});
```

### React で使う

```tsx
import { useSyncExternalStore, useCallback } from "react";
import { subscribeSnapshot, getSnapshot, type Playback } from "waa-play";

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
import { createContext, loadBuffer, play, onFrame } from "waa-play";

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
import { play, loadBuffer } from "waa-play";
import { Tone } from "tone";

const ctx = Tone.context.rawContext;
const buffer = await loadBuffer(ctx, "/audio/track.mp3");
play(ctx, buffer);
```

## Modules

必要なものだけ import できます。

```ts
import { play } from "waa-play/play";
import { loadBuffer } from "waa-play/buffer";
import { extractPeaks } from "waa-play/waveform";
```

| Module | 概要 |
|--------|------|
| `context` | AudioContext のライフサイクル管理 |
| `buffer` | 音声ファイルのロード・デコード |
| `play` | 再生制御（play / pause / seek / loop / preservePitch） |
| `emitter` | 型安全なイベントエミッター |
| `nodes` | AudioNode のファクトリとチェーン接続 |
| `waveform` | 波形データの抽出（ピーク・RMS） |
| `fade` | フェード処理（in / out / crossfade） |
| `scheduler` | スケジューリングと BPM ベースのクロック |
| `synth` | 波形バッファの生成（sin / noise / click） |
| `adapters` | フレームワーク統合（React / Vue / Svelte） |
| `stretcher` | ピッチ保持タイムストレッチ（WSOLA） |

## License

MIT
