# Phase 1: 基盤 — WSOLA コア & Worker インフラ

> 設計書参照: §2（コアコンセプト）、§3（状態モデル）、§10 Phase 1

## 完了基準

30秒チャンクの WSOLA 変換が Worker 上で動作し、変換結果を AudioBuffer に復元して再生できる。

---

## 1-1. Stretcher 型定義

**ファイル:** `src/stretcher/types.ts`
**設計書:** §3.1, §3.2, §5.1, §6.1

設計書の型をそのまま実装する。Stretcher モジュール全体で共有される型の集約。

```ts
// チャンク状態（§3.1）
type ChunkState =
  | "pending"      // 未変換。キューに入っていない
  | "queued"       // 変換キューに投入済み
  | "converting"   // Worker で変換中
  | "ready"        // 変換完了。再生可能
  | "failed"       // 変換失敗（リトライ上限到達）
  | "skipped"      // キャンセルされた
  | "evicted";     // メモリ回収済み（Phase 6 で使用）

// チャンク情報（§3.2）
interface ChunkInfo {
  index: number;
  state: ChunkState;
  inputStart: number;    // 元バッファ上の開始位置（サンプル）
  inputEnd: number;      // 元バッファ上の終了位置（サンプル）
  outputBuffer: Float32Array[] | null;  // 変換済みデータ（チャンネルごと）
  outputLength: number;  // 変換後のサンプル数
  priority: number;      // 変換優先度（低いほど高優先）
  retryCount: number;
}

// 再生状態
type StretcherPlaybackState = "waiting" | "playing" | "buffering" | "paused" | "ended";

// バッファ健全性
type BufferHealth = "healthy" | "low" | "critical" | "empty";

// Worker メッセージ型（メインスレッド → Worker）
interface WorkerRequest {
  type: "convert" | "cancel";
  chunkIndex: number;
  inputData?: Float32Array[];  // Transferable
  tempo?: number;
  algorithm?: "wsola" | "phase-vocoder";
  overlap?: number;
  sampleRate?: number;
}

// Worker メッセージ型（Worker → メインスレッド）
interface WorkerResponse {
  type: "result" | "cancelled" | "error";
  chunkIndex: number;
  outputData?: Float32Array[];  // Transferable
  error?: string;
}

// StretcherStatus 階層構造（§5.1）
interface StretcherStatus {
  phase: "idle" | "initializing" | "active" | "complete" | "error";
  conversion: ConversionStatus;
  buffer: BufferStatus;
  playback: PlaybackStatus;
}

interface ConversionStatus {
  state: "idle" | "converting" | "paused";
  totalChunks: number;
  readyChunks: number;
  progress: number;
  currentChunkIndex: number;
  estimatedTimeRemaining: number;
}

interface BufferStatus {
  health: BufferHealth;
  aheadSeconds: number;
  behindSeconds: number;
  aheadChunks: number;
  isPlayable: boolean;
}

interface PlaybackStatus {
  state: StretcherPlaybackState;
  stallCount: number;
  lastStallDuration: number;
}

// StretcherEvents（§6.1）
interface StretcherEvents {
  statechange: { phase: StretcherStatus["phase"]; playback: StretcherPlaybackState };
  progress: { totalChunks: number; readyChunks: number; progress: number; estimatedTimeRemaining: number };
  bufferhealth: { health: BufferHealth; aheadSeconds: number; aheadChunks: number };
  buffering: { reason: "initial" | "seek" | "tempo-change" | "underrun" };
  buffered: { stallDuration: number };
  chunkready: { chunkIndex: number; conversionTime: number };
  complete: { totalTime: number };
  error: { chunkIndex: number; error: Error; willRetry: boolean };
}
```

**依存:** なし
**テスト:** 型のみのため不要

---

## 1-2. WSOLA アルゴリズム

**ファイル:** `src/workers/wsola.ts`
**設計書:** §2.2, §2.3, §10 Phase 1 タスク 1-4

純粋関数として実装。Worker 内で呼ばれるが、Node.js 環境で単体テスト可能にする。

### API

```ts
export interface WsolaOptions {
  frameSize?: number;    // @default 1024
  tolerance?: number;    // @default 2048（相互相関の探索範囲）
}

/**
 * WSOLA (Waveform Similarity Overlap-Add) による Time-Stretch。
 * ピッチを保持したまま再生速度を変更する。
 *
 * @param input   チャンネルごとの入力サンプル
 * @param tempo   テンポ倍率（1.0 = 等速、2.0 = 2倍速）
 * @param sampleRate  サンプルレート
 * @param options アルゴリズムパラメータ
 * @returns チャンネルごとの出力サンプル
 */
export function wsolaStretch(
  input: Float32Array[],
  tempo: number,
  sampleRate: number,
  options?: WsolaOptions,
): Float32Array[];
```

### アルゴリズム詳細

1. **パラメータ設計:**
   - `frameSize = 1024` サンプル（~23ms @ 44.1kHz）
   - `hopAnalysis = frameSize / 2 = 512`（50% オーバーラップ）
   - `hopSynthesis = Math.round(hopAnalysis * tempo)`
   - `tolerance = 2048`（最適接合点の探索範囲）

2. **処理フロー:**
   ```
   入力:  |---frame---|---frame---|---frame---|---frame---|
                 hopA       hopA       hopA

   出力:  |---frame---|---frame---|---frame---|
                hopS       hopS       hopS

   hopS = hopA × tempo
   ```

3. **各フレームの処理:**
   - 入力バッファ上の読み取り位置 `readPos` を `hopSynthesis` ずつ進める
   - `readPos ± tolerance` の範囲で相互相関が最大となるオフセットを探索
   - 最適オフセットの位置からフレームを抽出
   - 前フレームの末尾と新フレームの先頭をクロスフェードで接合

4. **相互相関の高速化:**
   - フルスケールの相関は不要。先頭 `frameSize / 4` サンプルだけで十分
   - マルチチャンネルの場合、チャンネル 0 のみで相関計算し、同じオフセットを全チャンネルに適用

### テスト (`tests/wsola.test.ts`)

```
- 440Hz サイン波 (1秒, mono) × tempo 1.5
  → 出力長が input.length / 1.5 ± 1%
- 440Hz サイン波 × tempo 1.5
  → 出力のピーク周波数が 440Hz ± 2Hz（簡易 DFT で検証）
- tempo 1.0
  → 入力と出力の差の RMS が 閾値以下
- tempo 0.5（スローダウン）
  → 出力長が input.length / 0.5 ± 1%
- ステレオ入力
  → 各チャンネルの出力長が一致
- 空入力
  → 空の出力
```

---

## 1-3. Worker 本体

**ファイル:** `src/workers/stretch-worker.ts`
**設計書:** §4.1, §9

Worker スレッドで動作するメッセージハンドラ。

### 実装

```ts
// Worker のエントリーポイント
// ビルド時にインライン化されるため、import は使わない。
// wsola.ts のコードが先頭に結合される前提。

let cancelFlag = false;

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;

  switch (msg.type) {
    case "convert": {
      cancelFlag = false;
      const startTime = performance.now();

      try {
        // アルゴリズム選択
        const output = wsolaStretch(
          msg.inputData!,
          msg.tempo!,
          msg.sampleRate!,
        );

        if (cancelFlag) {
          self.postMessage({ type: "cancelled", chunkIndex: msg.chunkIndex });
          return;
        }

        // Transferable で返す
        const transferables = output.map(ch => ch.buffer);
        self.postMessage(
          { type: "result", chunkIndex: msg.chunkIndex, outputData: output },
          transferables,
        );
      } catch (err) {
        self.postMessage({
          type: "error",
          chunkIndex: msg.chunkIndex,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }

    case "cancel":
      cancelFlag = true;
      break;
  }
};
```

### ビルド方式

Worker コードは Blob URL でインライン生成する（バンドラ非依存）。

```ts
// worker-manager.ts 内での生成方法
const workerCode = `${WSOLA_SOURCE}\n${STRETCH_WORKER_SOURCE}`;
const blob = new Blob([workerCode], { type: "text/javascript" });
const url = URL.createObjectURL(blob);
const worker = new Worker(url);
```

`WSOLA_SOURCE` と `STRETCH_WORKER_SOURCE` はビルド時に文字列定数として埋め込む。
方式の選択肢:
1. tsup のカスタム esbuild プラグインで `.ts` → コンパイル済み JS 文字列に変換
2. Worker ソースを `function.toString()` パターンで取得
3. ビルドスクリプトで事前に文字列化して `worker-source.ts` に書き出す

→ **方式 3（ビルドスクリプト）** が最もシンプル。npm scripts に `prebuild` ステップを追加。

**依存:** `wsola.ts`
**テスト:** Worker の統合テストは Phase 2 の WorkerManager テストで実施

---

## 1-4. チャンク分割

**ファイル:** `src/stretcher/chunk-manager.ts`
**設計書:** §2.1, §2.2, §2.3, §7.3

### API

```ts
export class ChunkManager {
  readonly chunks: ChunkInfo[];
  readonly chunkSizeSamples: number;     // 30秒 × sampleRate
  readonly overlapSamples: number;        // 200ms × sampleRate
  readonly totalChunks: number;
  readonly sampleRate: number;
  readonly numberOfChannels: number;

  constructor(
    channelData: Float32Array[],         // チャンネルごとのバッファデータ
    sampleRate: number,
    options?: { chunkDurationSec?: number },  // @default 30
  );

  // 元バッファからチャンクの入力データを抽出（オーバーラップ含む）
  extractInputChunk(index: number): Float32Array[];

  // 変換結果を格納し、隣接チャンクとクロスフェード接合
  storeOutput(chunkIndex: number, outputData: Float32Array[]): void;

  // 位置（秒）→ チャンクインデックス
  positionToChunkIndex(positionSec: number): number;

  // チャンクインデックス + チャンク内オフセット → 位置（秒）
  chunkOffsetToPosition(chunkIndex: number, offsetSamples: number): number;

  // 出力位置 → 入力位置のマッピング（§7.3 の精密マッピング）
  outputToInputPosition(outputPosSec: number): number;

  // 全チャンクをリセット（tempo 変更時）
  resetAll(): void;

  // 特定チャンクのバッファを破棄（eviction）
  evict(chunkIndex: number): void;

  // ready なチャンク数
  getReadyCount(): number;
}
```

### チャンク境界のオーバーラップ（§2.3）

```
元バッファ上のチャンク分割:

Chunk N:   [========= chunkSize =========][overlap]
Chunk N+1:                        [overlap][========= chunkSize =========]

overlap = 200ms × sampleRate（安全マージン込み）
```

`extractInputChunk(n)` は `inputStart - overlap` 〜 `inputEnd + overlap` の範囲を返す（バッファ境界でクリップ）。

### 位置マッピング（§7.3）

各チャンクの `storeOutput()` 時に `ChunkPositionMap` を記録:

```ts
interface ChunkPositionMap {
  inputStartSec: number;
  inputEndSec: number;
  outputStartSec: number;  // 累積出力位置
  outputEndSec: number;
}
```

出力位置 → 入力位置は線形補間で計算（チャンク内のアルゴリズム歪みは無視可能）。

### テスト (`tests/chunk-manager.test.ts`)

```
- 3分バッファ (44100Hz, mono) → 6 チャンク（30秒デフォルト）
- 1分バッファ → 2 チャンク
- 端数: 95秒 → 4 チャンク（最後は 5 秒）
- overlapSamples = Math.ceil(0.2 * 44100) = 8820
- extractInputChunk(0) の先頭はオーバーラップなし（バッファ先頭）
- extractInputChunk(最終) の末尾はオーバーラップなし（バッファ末尾）
- positionToChunkIndex(0) === 0
- positionToChunkIndex(31) === 1
- positionToChunkIndex(180) === 5 （3分バッファの最終チャンク）
- resetAll() 後に全チャンクが pending、outputBuffer が null
- evict() 後に state が "evicted"、outputBuffer が null
```

---

## 1-5. 優先度キュー

**ファイル:** `src/stretcher/priority-queue.ts`
**設計書:** §4.1

### API

```ts
export class PriorityQueue<T extends { priority: number }> {
  /** 要素を追加 */
  enqueue(item: T): void;

  /** 最高優先度（priority が最小）の要素を取り出す */
  dequeue(): T | undefined;

  /** 最高優先度の要素を取り出さずに参照 */
  peek(): T | undefined;

  /** 全要素を削除 */
  clear(): void;

  /** 優先度が変更された後にヒープを再構築 */
  rebuild(): void;

  /** 条件に一致する要素を削除 */
  remove(predicate: (item: T) => boolean): void;

  /** 現在の要素数 */
  get size(): number;
}
```

### 実装

min-heap（二分ヒープ）。`priority` が小さいほど先に dequeue される。

チャンク数は最大でも数百（3時間の音源で 360 チャンク）なので、`rebuild()` は単純に `Array.sort()` でも十分な性能。ただし、heap 構造の方が `enqueue` / `dequeue` が O(log n) で安定する。

### テスト (`tests/priority-queue.test.ts`)

```
- enqueue 3要素 → dequeue が priority 順
- dequeue で空の場合 → undefined
- peek で取り出さずに参照
- rebuild: 要素の priority を外部から変更 → rebuild() → 正しい順序
- remove: 条件に一致する要素を削除 → size が減る
- clear: 全削除 → size === 0
- 大量挿入（1000 要素）→ dequeue がソート済み順
```

---

## Phase 1 の実装順序

```
1. src/stretcher/types.ts          ← 依存なし。最初に作成
2. src/stretcher/priority-queue.ts ← 依存なし。並行可能
   + tests/priority-queue.test.ts
3. src/workers/wsola.ts            ← 依存なし。並行可能
   + tests/wsola.test.ts
4. src/stretcher/chunk-manager.ts  ← types.ts に依存
   + tests/chunk-manager.test.ts
5. src/workers/stretch-worker.ts   ← wsola.ts に依存
```

ステップ 1〜3 は並行して実装可能。
