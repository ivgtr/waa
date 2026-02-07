# waa

Composable Web Audio API utilities.

BYO AudioContext / Zero Dependencies / Framework-agnostic / Sample-accurate

**[Demo](https://ivgtr.github.io/waa/)**

## What is this?

ブラウザの Web Audio API をもうちょっと使いやすくするためのユーティリティ集です。

既存のオーディオライブラリは独自の AudioContext を内部で抱えていたり、フレームワークに依存していたりして、ちょっとした音声再生をしたいだけなのに大げさになりがちです。waa は「AudioContext は自分で持ってきてね」というスタンスで、必要な関数だけ import して組み合わせて使えるようにしています。

## Features

- **BYO AudioContext** — AudioContext を外から渡す設計なので、他のライブラリとの共存も自由
- **Composable** — モノリシックな Player クラスではなく、小さな関数の組み合わせ
- **Zero Dependencies** — Web Audio API だけに依存、バンドルサイズ最小
- **Framework-agnostic** — React / Vue / Svelte / Vanilla JS どれでも同じ API
- **Sample-accurate** — `AudioContext.currentTime` ベースの精密な再生位置追跡
- **Tree-shakeable** — 使う関数だけがバンドルに入る

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
| `play` | 再生エンジン（play / pause / seek / loop / events） |
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

### 他のライブラリの AudioContext を使う

```ts
import { play, loadBuffer } from "waa";
import { Tone } from "tone";

const ctx = Tone.context.rawContext;
const buffer = await loadBuffer(ctx, "/audio/track.mp3");
play(ctx, buffer);
```

## Pitch-Preserving Playback

`playbackRate` を変えると当然ピッチも変わります。「速度は変えたいけど声の高さはそのままがいい」というときのために、WSOLA ベースのタイムストレッチエンジンを内蔵しています。

```ts
const playback = play(ctx, buffer, {
  preservePitch: true,
  playbackRate: 1.5, // 1.5倍速、ピッチはそのまま
});

// あとからテンポ変更もできる
playback.setPlaybackRate(0.75);
```

### しくみ

普通に WSOLA を音声全体に適用すると、長い音源ほど変換待ちが発生します（60分の音源で数十秒とか）。これだと再生ボタンを押してから音が出るまでが長すぎるので、チャンク分割と組み合わせて遅延を抑えています。

```
音声バッファ (例: 60分)
│
├─ Chunk 0  [0:00 ~ 0:05]  ← まずここだけ変換して再生開始
├─ Chunk 1  [0:05 ~ 0:10]  ← 裏で先読み変換
├─ Chunk 2  [0:10 ~ 0:15]
├─ ...
└─ Chunk N  [最後まで]
```

1. **チャンク分割** — 音声を 5 秒ごとのチャンクに分割（チャンク間は 200ms のオーバーラップ付き）
2. **WSOLA タイムストレッチ** — 各チャンクに対して WSOLA（Waveform Similarity Overlap-Add）を適用。Hann 窓 + 正規化相互相関でフレーム間の位相をそろえるので、ピッチを保ったまま伸縮できる
3. **優先度付きスケジューリング** — 再生ヘッド付近のチャンクを優先的に変換。seek やテンポ変更があれば優先度を再計算
4. **Web Worker 並列処理** — WSOLA の計算はワーカープール（デフォルト 2 スレッド）でメインスレッドをブロックしない
5. **ギャップレス再生** — ダブルバッファリング + 10ms クロスフェードでチャンク間の継ぎ目を目立たなくする

バッファの残量はヒステリシス付きで監視していて、先読みが足りなくなったら自動でバッファリング状態に入り、十分溜まったら復帰します。

### パラメータ

| 定数 | デフォルト | 説明 |
|------|-----------|------|
| `CHUNK_DURATION_SEC` | 5 | チャンクの長さ（秒） |
| `OVERLAP_SEC` | 0.2 | チャンク間オーバーラップ（秒） |
| `WSOLA_FRAME_SIZE` | 1024 | WSOLA の解析フレームサイズ |
| `WSOLA_HOP_SIZE` | 512 | WSOLA のホップサイズ |
| `WSOLA_TOLERANCE` | 2048 | 相互相関の探索範囲（サンプル数） |
| `WORKER_POOL_SIZE` | 2 | ワーカースレッド数 |

## License

MIT
