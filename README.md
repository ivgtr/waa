# waa-play

[![npm version](https://img.shields.io/npm/v/waa-play)](https://www.npmjs.com/package/waa-play)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

Composable Web Audio API utilities.

BYO AudioContext / Zero Dependencies / Framework-agnostic / Sample-accurate / Pitch-preserving time-stretch / Chunk-based streaming

**[Documentation & Demo](https://ivgtr.github.io/waa/)**

## Install

```bash
npm install waa-play
```

## Quick Start

### Function API

関数単位で必要なものだけ import して使う設計です。全関数が `AudioContext` を第一引数に取ります。

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

### Class API

`WaaPlayer` は全モジュールの機能を統合し、`AudioContext` を内部管理するクラスです。

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

## Modules

必要なものだけ個別に import できます。

```ts
import { play } from "waa-play/play";
import { loadBuffer } from "waa-play/buffer";
import { WaaPlayer } from "waa-play/player";
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
| `player` | 全モジュールを統合するクラスベース API |

## API

詳細な使い方・API リファレンスは **[Documentation & Demo](https://ivgtr.github.io/waa/)** をご覧ください。

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
