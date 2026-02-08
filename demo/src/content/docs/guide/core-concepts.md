---
title: コアコンセプト
description: waa-play の主要な設計パターンとアーキテクチャ
---

## BYO AudioContext

waa-play のすべての関数は、第一引数に `AudioContext` を取ります。ライブラリが裏でグローバルコンテキストを作成・保持することはありません。

```ts
import { play } from "waa-play/play";
import { loadBuffer } from "waa-play/buffer";

const ctx = new AudioContext();
const buffer = await loadBuffer(ctx, "/audio/track.mp3");
const pb = play(ctx, buffer);
```

これにより、コンテキストのライフサイクル、サンプルレート、レイテンシーヒント、オフラインレンダリングを完全に制御できます。

`WaaPlayer` はこのパターンを便利に使えるようラップしたものです。内部で `AudioContext` を作成・管理しますが、基本設計は同じです。

## 再生ステートマシン

`play()` が返す `Playback` オブジェクトは、シンプルなステートマシンに従います:

```
playing → paused → playing → stopped
playing → stopped
```

- **playing** — オーディオを出力中。ポジションは `AudioContext.currentTime`(ハードウェアクロック精度、JavaScript タイマーではない)に基づいて進みます。
- **paused** — オーディオ出力が一時停止中。ポジションは一時停止時点で凍結されます。
- **stopped** — 終端状態。ソースノードは解放され、再開できません。再度再生するには新しい `Playback` を作成してください。

```ts
const pb = play(ctx, buffer);

pb.pause();           // playing → paused
pb.resume();          // paused → playing
pb.stop();            // → stopped (from any state)

console.log(pb.state) // "playing" | "paused" | "stopped"
```

## イベントシステム

Playback は `on` / `off` パターンで型安全なイベントを発行します:

```ts
pb.on("statechange", ({ state }) => {
  console.log("new state:", state);
});

pb.on("timeupdate", ({ position, duration, progress }) => {
  console.log(`${position.toFixed(1)}s / ${duration.toFixed(1)}s`);
});

pb.on("ended", () => {
  console.log("playback finished");
});
```

**バックグラウンドタブ対応**: `timeupdate` は `requestAnimationFrame` ではなく `setInterval` で発火します。これにより、ブラウザタブがバックグラウンドにあってもポジション更新が継続します。

## ツリーシェイキング

waa-play は 11 の独立モジュール(+ `WaaPlayer` クラスエントリ)に分割されており、各モジュールは独自のサブパスエクスポートを持っています。バンドラーは実際にインポートしたモジュールのみを含めます。

```ts
// Only the play and buffer modules end up in your bundle
import { play } from "waa-play/play";
import { loadBuffer } from "waa-play/buffer";
```

トップレベルの `waa-play` インポートから `WaaPlayer` を使用すると、クラスがすべてをラップしているため、全モジュールが含まれます。

## ピッチ保持タイムストレッチ

`stretcher` モジュールは、WSOLA(Waveform Similarity Overlap-Add)アルゴリズムを使用して、ピッチを変えずにリアルタイムでテンポを変更します。

- **Web Worker 処理** — WSOLA は別スレッドで実行され、メインスレッドの応答性を維持します。
- **ストリーミングアーキテクチャ** — ソースオーディオをチャンクに分割し、目標テンポで変換してギャップレス再生のためにバッファリングします。
- **リアルタイムテンポ制御** — 再生中にテンポを変更可能。ストレッチャーが今後のチャンクをオンザフライで再処理します。

```ts
import { createStretcher } from "waa-play/stretcher";

const stretcher = createStretcher(ctx, buffer, {
  tempo: 0.8, // 80% speed, original pitch
});

stretcher.play();
stretcher.setTempo(1.2); // speed up mid-playback
```
