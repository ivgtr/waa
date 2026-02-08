# waa-play

[![npm version](https://img.shields.io/npm/v/waa-play)](https://www.npmjs.com/package/waa-play)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

Convenient composable building blocks for Web Audio API.

Time-stretch / Streaming / Waveform / BYO AudioContext / Zero Dependencies

[Documentation & Demo](https://ivgtr.github.io/waa/)

## Install

```bash
npm install waa-play
```

## Features

### Pitch-preserving time-stretch
再生速度を変えてもピッチが変わりません。処理は別スレッドで実行されるため、UI をブロックしません。

### Streaming playback
音声を段階的に処理し、バッファリング状態をイベントで通知します。ローディング UI を簡単に実装できます。

### BYO AudioContext
既存の AudioContext やオーディオグラフをそのまま使えます。他のライブラリとの統合も容易です。

### Framework integration
React・Vue・Svelte など、お好みのフレームワークで再生状態をリアクティブに扱えます。

### Waveform extraction
波形データを取得し、プログレスバーや波形ビジュアライザーを構築できます。

### Background-tab safe
バックグラウンドタブでも再生位置の追跡が継続します。

## Quick Start

### Class API (WaaPlayer)

最もシンプルな使い方です。`WaaPlayer` が `AudioContext` を内部管理し、全モジュールの機能を統合して提供します。

```ts
import { WaaPlayer } from "waa-play";

const player = new WaaPlayer();
const buffer = await player.load("/audio/track.mp3");

const gain = player.createGain(0.8);
const playback = player.play(buffer, { through: [gain] });

player.dispose();
```

既存の `AudioContext` を渡すこともできます。

```ts
const player = new WaaPlayer(existingAudioContext);
```

### Function API

個別の関数だけ import したい場合はこちら。全関数が `AudioContext` を第一引数に取ります。

```ts
import { createContext, loadBuffer, play, createGain } from "waa-play";

const ctx = createContext();
const buffer = await loadBuffer(ctx, "/audio/track.mp3");

const gain = createGain(ctx, 0.8);
const playback = play(ctx, buffer, { through: [gain] });

playback.on("timeupdate", ({ position, duration }) => {
  console.log(`${position.toFixed(1)}s / ${duration.toFixed(1)}s`);
});
```

## Modules

必要なものだけ個別に import できます。

```ts
import { play } from "waa-play/play";
import { loadBuffer } from "waa-play/buffer";
import { WaaPlayer } from "waa-play/player";
```

| Module | 概要 |
|--------|------|
| `player` | 全モジュールを統合するクラスベース API |
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

## API

詳細な使い方・API リファレンスは [Documentation & Demo](https://ivgtr.github.io/waa/) をご覧ください。

### WaaPlayer

| メソッド | 概要 |
|----------|------|
| `resume()` / `ensureRunning()` / `now()` | AudioContext 制御 |
| `load(url)` / `loadFromBlob(blob)` / `loadAll(map)` | 音声ロード |
| `play(buffer, options?)` | 再生（`Playback` を返す） |
| `createGain()` / `createFilter()` / `createPanner()` / `createCompressor()` / `createAnalyser()` | ノード生成 |
| `chain(...nodes)` / `disconnectChain(...nodes)` | グラフ接続 |
| `fadeIn()` / `fadeOut()` / `crossfade()` / `autoFade()` | フェード |
| `extractPeaks()` / `extractPeakPairs()` / `extractRMS()` | 波形抽出 |
| `createScheduler()` / `createClock()` | スケジューリング |
| `createSineBuffer()` / `createNoiseBuffer()` / `createClickBuffer()` | バッファ合成 |
| `getSnapshot()` / `subscribeSnapshot()` / `onFrame()` / `whenEnded()` / `whenPosition()` | アダプター |
| `dispose()` | リソース解放 |

## License

MIT
