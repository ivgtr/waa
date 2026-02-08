---
title: Stretcher
description: Pitch 保持 time-stretch engine
---

WSOLA（Waveform Similarity Overlap-Add）time-stretch engine で、ピッチに影響を与えずに再生速度を変更します。Web Worker を使用してリアルタイム audio 処理を行います。

```ts
import { createStretcherEngine } from "waa-play/stretcher";
```

:::note
Stretcher Engine は通常、`play()` に `preservePitch: true` を指定して間接的に使用します。直接使用は高度なシナリオ向けです。
:::

## `createStretcherEngine()`

```ts
createStretcherEngine(
  ctx: AudioContext,
  buffer: AudioBuffer,
  options: StretcherOptions,
): StretcherEngine;
```

指定されたバッファに対して WSOLA time-stretch engine を作成します。

```ts
const engine = createStretcherEngine(ctx, buffer, {
  tempo: 0.75,
  loop: true,
});

engine.start();
```

## StretcherOptions

```ts
interface StretcherOptions {
  tempo?: number;
  offset?: number;
  loop?: boolean;
  through?: AudioNode[];
  destination?: AudioNode;
  timeupdateInterval?: number;
  workerPoolSize?: number;
}
```

| オプション | 型 | デフォルト | 説明 |
|--------|------|---------|-------------|
| `tempo` | `number` | `1` | Time-stretch 比率（0.5 = 半速、2 = 倍速） |
| `offset` | `number` | `0` | 開始位置（秒） |
| `loop` | `boolean` | `false` | ループ再生 |
| `through` | `AudioNode[]` | `[]` | 経由する audio node |
| `destination` | `AudioNode` | `ctx.destination` | 出力先 |
| `timeupdateInterval` | `number` | `250` | 進捗イベントの間隔（ms） |
| `workerPoolSize` | `number` | - | WSOLA worker スレッド数 |

## StretcherEngine メソッド

### 再生制御

```ts
start(): void;
pause(): void;
resume(): void;
seek(position: number): void;
stop(): void;
```

### 設定

```ts
setTempo(tempo: number): void;
```

再生中に time-stretch 比率を変更します。

```ts
engine.setTempo(1.5); // Speed up to 1.5x
```

### 状態

```ts
getCurrentPosition(): number;
getStatus(): StretcherStatus;
getSnapshot(): PlaybackSnapshot;
```

### イベント

```ts
on(event: string, handler: Function): () => void;
off(event: string, handler: Function): void;
```

### クリーンアップ

```ts
dispose(): void;
```

再生を停止し、worker を終了し、すべてのリソースを解放します。

## イベント

| イベント | 説明 |
|-------|-------------|
| `progress` | ポジション更新 |
| `bufferhealth` | Buffer health の状態が変化 |
| `buffering` | Worker buffer underrun、音声が途切れる可能性あり |
| `buffered` | Underrun から回復 |
| `chunkready` | 新しいチャンクの処理が完了 |
| `complete` | すべてのチャンクの処理が完了 |
| `ended` | 再生が終端に到達 |
| `error` | ワーカーでエラーが発生 |

## StretcherStatus

```ts
interface StretcherStatus {
  phase: string;
  conversion: { ... };
  buffer: { ... };
  playback: { ... };
}
```

エンジンの内部状態（変換進捗、buffer health、再生位置）に関する詳細な status オブジェクト。

## play() 経由の使用

Stretcher を使用する最も簡単な方法は、`play()` 関数に `preservePitch: true` を指定することです:

```ts
import { play } from "waa-play/play";

const playback = play(ctx, buffer, {
  playbackRate: 0.75,
  preservePitch: true,
});

// Change speed while preserving pitch
playback.setPlaybackRate(1.5);
```
