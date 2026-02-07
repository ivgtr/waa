# Phase 3: ステータス & イベント

> 設計書参照: §5（ローディングステータス管理）、§6（イベント API）
> 前提: Phase 2 完了（worker-manager, conversion-scheduler, chunk-player, buffer-health）

## 完了基準

React の `useSyncExternalStore` で全ステータスが UI に反映される。

---

## 3-1. ConversionEstimator

**ファイル:** `src/stretcher/conversion-estimator.ts`
**設計書:** §5.4

### API

```ts
export class ConversionEstimator {
  constructor(options?: {
    windowSize?: number;              // @default 10
    initialEstimateMs?: number;       // 初回推定値（ms/チャンク）@default 30（WSOLA）
  });

  /** 1チャンクの変換時間を記録 */
  recordConversion(durationMs: number): void;

  /**
   * 残り時間の推定（ms）
   *
   * 直近 windowSize 回の移動平均 × 残チャンク数。
   * データがない場合は initialEstimateMs を使用。
   */
  estimateRemaining(remainingChunks: number): number;

  /** 直近の平均変換時間（ms/チャンク） */
  getAverageMs(): number;

  /** 記録をリセット（tempo 変更時） */
  reset(): void;
}
```

### 実装詳細

```ts
private recentDurations: number[] = [];
private readonly windowSize = 10;

estimateRemaining(remainingChunks: number): number {
  if (this.recentDurations.length === 0) {
    return remainingChunks * this.initialEstimateMs;
  }
  const avg = this.recentDurations.reduce((a, b) => a + b, 0)
              / this.recentDurations.length;
  return remainingChunks * avg;
}
```

### 依存

なし（純粋なデータ構造）

### テスト (`tests/conversion-estimator.test.ts`)

```
- 初回推定: データなし + remainingChunks=10 → initialEstimateMs × 10
- 記録1件: recordConversion(100) + remainingChunks=5 → 500
- 移動平均: 10件記録 [10,20,30,...,100] → 平均55 → remaining=2 → 110
- ウィンドウ超過: 11件記録 → 最初の1件が除外される
- reset: 記録クリア → 初回推定に戻る
- getAverageMs: データなし → initialEstimateMs / データあり → 平均
```

---

## 3-2. StretcherEngine 統合

**ファイル:** `src/stretcher/stretcher.ts`
**設計書:** §3.2, §3.3, §6.1, §6.2, §7

全コンポーネントを統合するメインクラス。設計書 §6 のイベント API を公開する。

### API

```ts
export class StretcherEngine {
  constructor(
    ctx: AudioContext,
    buffer: AudioBuffer,
    options: {
      tempo: number;
      algorithm?: "wsola" | "phase-vocoder";  // @default "wsola"
      destination?: AudioNode;
      through?: AudioNode[];
    },
  );

  // ── ステータス ──

  /** 全ステータスの一括取得（§5.1） */
  getStatus(): StretcherStatus;

  // ── コントロール ──

  /** 再生開始（offset: 元バッファ上の秒数） */
  start(offset?: number): void;

  /** 一時停止 */
  pause(): void;

  /** 再開 */
  resume(): void;

  /**
   * シーク（§7.2）
   *
   * 1. ChunkPlayer のソースを停止
   * 2. 対象チャンクとオフセットを計算
   * 3. ready なら即再生、未変換なら BUFFERING → 変換完了後に再生
   * 4. スケジューラの優先度を再計算
   */
  seek(positionSec: number): void;

  /**
   * テンポ変更（§4.3）
   *
   * 1. 現在のバッファを1世代キャッシュに退避（Phase 6）
   * 2. 全チャンクをリセット
   * 3. BUFFERING → 現在位置から変換開始
   */
  setTempo(tempo: number): void;

  /** 停止（全リソースは保持） */
  stop(): void;

  /** 全リソース解放 */
  dispose(): void;

  // ── イベント（§6.1） ──

  on<K extends keyof StretcherEvents>(
    event: K,
    handler: (data: StretcherEvents[K]) => void,
  ): () => void;

  off<K extends keyof StretcherEvents>(
    event: K,
    handler: (data: StretcherEvents[K]) => void,
  ): void;

  // ── 位置追跡 ──

  /** 元バッファ上の現在位置（秒）— UI 表示用（§7.3） */
  getCurrentInputPosition(): number;

  /** 元バッファの長さ（秒） */
  getDuration(): number;

  /** 現在の再生進捗（0.0〜1.0） */
  getProgress(): number;

  /** 現在のテンポ */
  getTempo(): number;
}
```

### 内部構造

```
StretcherEngine
├── ChunkManager           — チャンク分割・状態管理
├── ConversionScheduler    — 変換キュー管理
│   └── PriorityQueue      — 優先度キュー
├── ChunkPlayer            — ダブルバッファリング再生
├── BufferHealthMonitor    — バッファ健全性
├── ConversionEstimator    — 残り時間推定
├── WorkerManager          — Worker 管理
└── Emitter<StretcherEvents>
```

### 状態遷移ロジック（§3.3）

```
                    初回チャンク変換完了
    WAITING ──────────────────────────→ PLAYING
      ↑                                   │
      │ tempo変更                          │ 先読みバッファ枯渇
      │ (全チャンクリセット)                  │
      │                                   ▼
      │                              BUFFERING
      │                                   │
      │ tempo変更                          │ 次チャンク変換完了
      │                                   │
      └───────────────────────────────────┘
                                          │
                                          │ 全チャンク再生完了
                                          ▼
                                      ENDED
```

StretcherEngine は以下を内部で接続する:

1. **ConversionScheduler → ChunkManager**: 変換完了時に `storeOutput()`
2. **ChunkPlayer の onNeedChunk**: 次の ready チャンクを ConversionScheduler から取得
3. **ChunkPlayer の onUnderrun**: BufferHealthMonitor の判定で BUFFERING 遷移
4. **ConversionScheduler の chunkready**: BufferHealthMonitor を更新 → PLAYING 復帰判定
5. **timeupdate ループ**: `setInterval` で位置更新 → `outputToInputPosition()` で元バッファ位置に変換

### 依存

- `src/stretcher/chunk-manager.ts`
- `src/stretcher/conversion-scheduler.ts`
- `src/stretcher/chunk-player.ts`
- `src/stretcher/buffer-health.ts`
- `src/stretcher/conversion-estimator.ts`
- `src/stretcher/worker-manager.ts`
- `src/emitter.ts`

### テスト (`tests/stretcher.test.ts`)

AudioContext + Worker のモックを使用した統合テスト:
```
- constructor → ChunkManager がチャンクを生成
- start() → WAITING → 初回チャンク投入 → 完了 → PLAYING
- pause() → ChunkPlayer 停止、スケジューラ継続
- resume() → ChunkPlayer 再開
- seek(readyチャンク) → 即座に PLAYING
- seek(未変換チャンク) → BUFFERING → 変換完了 → PLAYING
- setTempo() → 全チャンクリセット → BUFFERING → 初回完了 → PLAYING
- stop() → 全停止
- dispose() → Worker 終了、タイマー停止
- getStatus() が全フィールドを返す
- イベント発火: progress, bufferhealth, chunkready, complete
```

---

## 3-3. PlaybackSnapshot 拡張

**ファイル:** `src/types.ts`（既存ファイルの変更）
**設計書:** §6.3

### 変更内容

```ts
// 新規追加の型
export type BufferHealth = "healthy" | "low" | "critical" | "empty";

// PlaybackSnapshot に stretcher フィールドを追加
export interface PlaybackSnapshot {
  // 既存（変更なし）
  state: PlaybackState;
  position: number;
  duration: number;
  progress: number;

  // 新規（preservePitch: true の場合のみ存在）
  stretcher?: {
    tempo: number;
    converting: boolean;
    conversionProgress: number;   // 0.0〜1.0
    bufferHealth: BufferHealth;
    aheadSeconds: number;
    buffering: boolean;
  };
}
```

### 後方互換性

- `stretcher` はオプショナル(`?`)なので、既存コードに影響なし
- `preservePitch` を使わない場合、`stretcher` は `undefined`
- `BufferHealth` 型は `src/stretcher/types.ts` にも定義されるが、公開 API 用に `src/types.ts` にも配置

### 依存

なし

### テスト

型変更のみ。既存テスト（`emitter.test.ts`）の回帰確認。

---

## 3-4. adapters.ts 拡張

**ファイル:** `src/adapters.ts`（既存ファイルの変更）
**設計書:** §6.3

### 変更内容

`getSnapshot()` が Playback に `stretcher` プロパティがある場合にそれを含める。
`subscribeSnapshot()` が Stretcher 関連イベントも購読する。

```ts
// getSnapshot() の拡張
export function getSnapshot(playback: Playback): PlaybackSnapshot {
  const base = {
    state: playback.getState(),
    position: playback.getCurrentTime(),
    duration: playback.getDuration(),
    progress: playback.getProgress(),
  };

  // Playback に getStretcherSnapshot がある場合（StretcherPlayback）
  if ("getStretcherSnapshot" in playback) {
    return {
      ...base,
      stretcher: (playback as any).getStretcherSnapshot(),
    };
  }

  return base;
}
```

**設計判断:** `Playback` インターフェースは変更せず、ダックタイピングで Stretcher 対応を検出。これにより Phase 3 を Phase 4 の play.ts 変更前に完了できる。

### 依存

- `src/types.ts` の変更

### テスト

- 通常の Playback → `stretcher` が `undefined`
- StretcherPlayback モック → `stretcher` フィールドが含まれる

---

## 3-5. バレルエクスポート

**ファイル:** `src/stretcher/index.ts`（新規）

```ts
export { StretcherEngine } from "./stretcher.js";
export type {
  ChunkState,
  ChunkInfo,
  StretcherPlaybackState,
  BufferHealth,
  StretcherStatus,
  StretcherEvents,
  // ...
} from "./types.js";
```

---

## Phase 3 の実装順序

```
10. src/stretcher/conversion-estimator.ts  ← 依存なし
    + tests/conversion-estimator.test.ts
11. src/stretcher/stretcher.ts             ← Phase 2 全体に依存
    + tests/stretcher.test.ts
12. src/types.ts の変更                     ← 依存なし（並行可能）
13. src/adapters.ts の変更                  ← types.ts に依存
14. src/stretcher/index.ts                 ← stretcher.ts に依存
```

ステップ 10 と 12 は並行して実装可能。
