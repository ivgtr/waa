---
title: はじめに
description: waa-play をインストールして、数分で audio 再生を始めましょう
---

## インストール

```bash
npm install waa-play
```

## クイックスタート: クラス API (WaaPlayer)

`WaaPlayer` は `AudioContext` をラップし、すべてのモジュールをメソッドとして提供します。最も簡単な使い方です。

```ts
import { WaaPlayer } from "waa-play";

const player = new WaaPlayer();

// Generate a 440 Hz sine tone, 2 seconds long
const buffer = player.createSineBuffer(440, 2);

// Start playback — returns a Playback handle
const playback = player.play(buffer);

// Listen to position updates
playback.on("timeupdate", ({ position }) => console.log(position));

// Clean up when done
player.dispose();
```

## クイックスタート: 関数 API (BYO AudioContext)

完全な制御が必要な場合は、個別の関数をインポートして自前の `AudioContext` を使用します。このアプローチは完全に tree-shake 可能です。

```ts
import { createContext, ensureRunning, play } from "waa-play";
import { createSineBuffer } from "waa-play/synth";

const ctx = createContext();
await ensureRunning(ctx);

const buffer = createSineBuffer(ctx, 440, 2);
const pb = play(ctx, buffer);
```

すべての関数が `AudioContext` を第一引数に取るため、隠れた global state は一切ありません。

## モジュール

waa-play は 12 の独立モジュールで構成されています。各モジュールは個別のエントリポイントなので、バンドラーは未使用のコードを tree-shake できます。

| モジュール | インポート | 用途 |
|---|---|---|
| **player** | `waa-play` | `WaaPlayer` クラス — 全モジュールのコンビニエンスラッパー |
| **context** | `waa-play/context` | AudioContext ライフサイクル (`createContext`, `ensureRunning`, `now`) |
| **buffer** | `waa-play/buffer` | 音声ファイル読み込み (`loadBuffer`, `loadBufferFromBlob`) |
| **play** | `waa-play/play` | コア再生エンジン — `Playback` ハンドルを返す |
| **emitter** | `waa-play/emitter` | 型安全イベントエミッター (`createEmitter<Events>()`) |
| **nodes** | `waa-play/nodes` | Audio node ファクトリ、`chain()` / `disconnectChain()` |
| **waveform** | `waa-play/waveform` | `AudioBuffer` からのピーク / RMS 抽出 |
| **fade** | `waa-play/fade` | フェードイン、フェードアウト、クロスフェードユーティリティ |
| **scheduler** | `waa-play/scheduler` | 先読みスケジューラとクロック |
| **synth** | `waa-play/synth` | バッファ合成 (サイン波、ノイズ、クリック) |
| **adapters** | `waa-play/adapters` | Framework 統合 (`getSnapshot`, `subscribeSnapshot`, `onFrame`) |
| **stretcher** | `waa-play/stretcher` | WSOLA ベースの pitch 保持 time-stretch |
