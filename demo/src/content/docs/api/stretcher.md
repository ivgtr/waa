---
title: Stretcher
description: ピッチ保持タイムストレッチエンジン
---

WSOLA（Waveform Similarity Overlap-Add）タイムストレッチエンジンで、ピッチに影響を与えずに再生速度を変更します。Web Worker を使用してリアルタイムオーディオ処理を行います。

```ts
import { createStretcherEngine } from "waa-play/stretcher";
```

:::note
ストレッチャーエンジンは通常、`play()` に `preservePitch: true` を指定して間接的に使用します。直接使用は高度なシナリオ向けです。
:::

## `createStretcherEngine()`

```ts
createStretcherEngine(
  ctx: AudioContext,
  buffer: AudioBuffer,
  options: StretcherOptions,
): StretcherEngine;
```

指定されたバッファに対して WSOLA タイムストレッチエンジンを作成します。

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
| `tempo` | `number` | `1` | タイムストレッチ比率（0.5 = 半速、2 = 倍速） |
| `offset` | `number` | `0` | 開始位置（秒） |
| `loop` | `boolean` | `false` | ループ再生 |
| `through` | `AudioNode[]` | `[]` | 経由するオーディオノード |
| `destination` | `AudioNode` | `ctx.destination` | 出力先 |
| `timeupdateInterval` | `number` | `250` | 進捗イベントの間隔（ms） |
| `workerPoolSize` | `number` | - | WSOLA ワーカースレッド数 |

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

再生中にタイムストレッチ比率を変更します。

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

再生を停止し、ワーカーを終了し、すべてのリソースを解放します。

## イベント

| イベント | 説明 |
|-------|-------------|
| `progress` | ポジション更新 |
| `bufferhealth` | バッファヘルスの状態が変化 |
| `buffering` | ワーカーバッファアンダーラン、音声が途切れる可能性あり |
| `buffered` | アンダーランから回復 |
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

エンジンの内部状態（変換進捗、バッファヘルス、再生位置）に関する詳細なステータスオブジェクト。

## play() 経由の使用

ストレッチャーを使用する最も簡単な方法は、`play()` 関数に `preservePitch: true` を指定することです:

```ts
import { play } from "waa-play/play";

const playback = play(ctx, buffer, {
  playbackRate: 0.75,
  preservePitch: true,
});

// Change speed while preserving pitch
playback.setPlaybackRate(1.5);
```
