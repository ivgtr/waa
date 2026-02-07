# プログレッシブ変換エンジン — 実装計画

## 前提: 既存コードベースの構造

```
src/
├── types.ts       ← 型定義の集約。PlaybackSnapshot, PlayOptions 等
├── play.ts        ← 再生エンジン（AudioBufferSourceNode ベース）
├── emitter.ts     ← 型安全イベントエミッター（再利用可能）
├── adapters.ts    ← getSnapshot / subscribeSnapshot（拡張対象）
├── context.ts     ← AudioContext ユーティリティ
├── buffer.ts      ← 音声ファイルの読み込み・デコード
├── nodes.ts       ← AudioNode ファクトリ
├── fade.ts        ← フェード・クロスフェード
├── waveform.ts    ← 波形抽出
├── scheduler.ts   ← スケジューラ & クロック
├── synth.ts       ← テストトーン生成
└── index.ts       ← バレルエクスポート
```

**重要な事実:**
- WSOLA / Phase Vocoder / Web Worker のコードは **一切存在しない**
- `play.ts` は `AudioBufferSourceNode` を直接使用。`setPlaybackRate()` はピッチが変わる通常方式
- `emitter.ts` の `createEmitter<Events>()` は汎用的で再利用可能
- `adapters.ts` の `PlaybackSnapshot` は現在 4 フィールドのみ（state, position, duration, progress）
- テストは `vitest` / `environment: "node"` → Web Audio API のモックが必要

---

## ファイル構成計画

### 新規作成ファイル

```
src/
├── stretcher/
│   ├── types.ts              ← Stretcher 固有の型定義
│   ├── chunk-manager.ts      ← チャンク分割・状態管理・位置マッピング
│   ├── priority-queue.ts     ← 距離ベースの優先度キュー
│   ├── conversion-scheduler.ts  ← Worker への変換投入・キュー管理
│   ├── chunk-player.ts       ← ダブルバッファリング・ギャップレス再生
│   ├── buffer-health.ts      ← バッファ健全性モニター（ヒステリシス付き）
│   ├── conversion-estimator.ts  ← 残り時間推定（移動平均）
│   ├── memory-manager.ts     ← チャンク遅延破棄・1世代キャッシュ
│   ├── worker-manager.ts     ← Worker 生成・クラッシュ回復・リトライ
│   ├── stretcher.ts          ← 統合エントリーポイント（StretcherEngine クラス）
│   └── index.ts              ← バレルエクスポート
├── workers/
│   ├── stretch-worker.ts     ← Worker 本体（メッセージハンドラ）
│   ├── wsola.ts              ← WSOLA アルゴリズム実装
│   └── phase-vocoder.ts      ← Phase Vocoder + IPL 実装（Phase 5）
```

### 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/types.ts` | `PlayOptions` に `preservePitch`, `algorithm` 追加。`PlaybackSnapshot` に `stretcher?` フィールド追加。Stretcher イベント型追加 |
| `src/play.ts` | `preservePitch: true` 時のプログレッシブ変換パスを追加 |
| `src/adapters.ts` | `getSnapshot()` で `stretcher` フィールドを返す |
| `src/index.ts` | Stretcher 関連の型・関数をエクスポート |
| `tsup.config.ts` | `stretcher` エントリーポイントを追加 |
| `package.json` | `./stretcher` エクスポートを追加 |

---

## Phase 1: 基盤 — WSOLA コア & Worker インフラ

### 1-1. Stretcher 型定義 (`src/stretcher/types.ts`)

設計書 §3 の型をそのまま実装。

```ts
// チャンク状態
type ChunkState = "pending" | "queued" | "converting" | "ready" | "failed" | "skipped" | "evicted";

// チャンク情報
interface ChunkInfo { index, state, inputStart, inputEnd, outputBuffer, outputLength, priority, retryCount }

// 再生状態
type StretcherPlaybackState = "waiting" | "playing" | "buffering" | "paused" | "ended";

// バッファ健全性
type BufferHealth = "healthy" | "low" | "critical" | "empty";

// Worker メッセージ型（双方向）
interface WorkerRequest { type: "convert" | "cancel", chunkIndex, inputData, tempo, algorithm, overlap }
interface WorkerResponse { type: "result" | "cancelled" | "error", chunkIndex, outputData?, error? }

// StretcherStatus（§5.1 の階層構造）
interface StretcherStatus { phase, conversion, buffer, playback }

// StretcherEvents（§6.1）
interface StretcherEvents { statechange, progress, bufferhealth, buffering, buffered, chunkready, complete, error }
```

**依存:** なし
**テスト:** 型のみのため不要

### 1-2. WSOLA アルゴリズム (`src/workers/wsola.ts`)

純粋関数として実装。Worker 内で呼ばれるが、単体テスト可能にする。

```ts
export function wsolaStretch(
  input: Float32Array[],    // チャンネルごとの入力
  tempo: number,
  sampleRate: number,
  options?: { frameSize?: number; tolerance?: number }
): Float32Array[]           // チャンネルごとの出力
```

**アルゴリズム概要:**
1. `frameSize = 1024`, `hopAnalysis = 512` (50% オーバーラップ)
2. `hopSynthesis = Math.round(hopAnalysis * tempo)`
3. 各フレームで相互相関による最適接合点を探索 (`tolerance = 2048` サンプル)
4. 前フレームの末尾と新フレームの先頭をクロスフェードで接合

**依存:** なし（純粋な数値計算）
**テスト:**
- 440Hz サイン波を 1.5x に変換 → 出力長が `input.length / 1.5` ± 1% 以内
- 出力のピッチが 440Hz ± 2Hz（FFT で検証）
- tempo = 1.0 → 入出力がほぼ同一

### 1-3. Worker 本体 (`src/workers/stretch-worker.ts`)

```ts
// Worker のメッセージハンドラ
self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  switch (e.data.type) {
    case "convert":
      // 1. アルゴリズム選択（wsola or phase-vocoder）
      // 2. 変換実行
      // 3. Transferable で結果を返す
      break;
    case "cancel":
      // キャンセルフラグを立てる（現フレーム処理完了後に中断）
      break;
  }
};
```

**ビルド方式:**
- `stretch-worker.ts` を文字列として inline 化（Blob URL 方式）
- `worker-manager.ts` 内で `new Blob([workerCode], { type: "text/javascript" })` → `URL.createObjectURL(blob)` → `new Worker(url)`
- これにより外部ファイル不要、バンドラ依存なし

**依存:** `wsola.ts`
**テスト:** Worker の統合テストは Phase 2 で

### 1-4. チャンク分割 (`src/stretcher/chunk-manager.ts`)

```ts
export class ChunkManager {
  readonly chunks: ChunkInfo[];
  readonly chunkSizeSamples: number;   // 30秒 × sampleRate
  readonly overlapSamples: number;      // 200ms × sampleRate

  constructor(buffer: AudioBuffer, chunkDurationSec?: number);

  // 元バッファからチャンクの入力データを抽出（オーバーラップ含む）
  extractInputChunk(index: number): Float32Array[];

  // 変換済みチャンクの出力を結合（クロスフェード接合）
  assembleOutput(chunkIndex: number, outputData: Float32Array[]): void;

  // 位置 → チャンクインデックス
  positionToChunkIndex(positionSec: number): number;

  // 出力位置 → 入力位置のマッピング（§7.3）
  outputToInputPosition(outputPosSec: number): number;

  // 全チャンクをリセット（tempo 変更時）
  resetAll(): void;
}
```

**依存:** `types.ts`
**テスト:**
- 3分バッファ → 6 チャンク（30秒デフォルト）
- オーバーラップが正しいサンプル数（200ms 分）
- `positionToChunkIndex()` の正確性
- クロスフェード接合後に不連続がないこと

### 1-5. 優先度キュー (`src/stretcher/priority-queue.ts`)

```ts
export class PriorityQueue<T extends { priority: number }> {
  enqueue(item: T): void;
  dequeue(): T | undefined;
  clear(): void;
  rebuild(): void;           // 優先度再計算後に呼ぶ
  remove(predicate: (item: T) => boolean): void;
  get size(): number;
}
```

**実装:** min-heap（priority が低いほど高優先）。チャンク数は最大数百なので、単純な配列ソートでも十分だが、ヒープの方が将来的に安全。

**依存:** なし
**テスト:**
- enqueue/dequeue の順序が priority 順
- rebuild 後に再ソートされること
- remove で特定要素を削除

---

## Phase 2: プログレッシブ再生

### 2-1. ConversionScheduler (`src/stretcher/conversion-scheduler.ts`)

設計書 §4 の中核。

```ts
export class ConversionScheduler {
  constructor(
    chunkManager: ChunkManager,
    workerManager: WorkerManager,
    emitter: Emitter<StretcherEvents>
  );

  // 優先度更新（§4.1）— 再生位置からの距離 × 方向重み
  updatePriorities(currentChunkIndex: number): void;

  // 次のチャンクを Worker に投入
  dispatchNext(): void;

  // seek 時のキュー再構築（§4.2）
  handleSeek(newChunkIndex: number): void;

  // tempo 変更（§4.3）
  handleTempoChange(newTempo: number): void;

  // Worker からの完了通知ハンドラ
  handleWorkerResult(chunkIndex: number, outputData: Float32Array[]): void;

  // 全停止
  stop(): void;
}
```

**方向重み:** 前方 1.0 / 後方 2.5（設計書通り）
**依存:** `chunk-manager`, `priority-queue`, `worker-manager`, `emitter`
**テスト:**
- 優先度が再生位置から放射状に割り当てられること
- seek 後にキューが再構築されること
- 変換完了後に次のチャンクが自動投入されること

### 2-2. ChunkPlayer (`src/stretcher/chunk-player.ts`)

設計書 §7.1 のダブルバッファリング再生。

```ts
export class ChunkPlayer {
  constructor(ctx: AudioContext, destination: AudioNode);

  // チャンクを AudioBuffer に変換してスケジュール
  scheduleNext(chunk: ChunkInfo, startTime: number): void;

  // 先読みチェック（200ms インターバル）
  startLookahead(): void;
  stopLookahead(): void;

  // seek（§7.2）
  seekTo(chunk: ChunkInfo, offsetInChunk: number): void;

  // pause / resume
  pause(): void;
  resume(): void;

  // 現在の再生位置（出力バッファ上）
  getCurrentOutputPosition(): number;

  dispose(): void;
}
```

**ギャップレス再生:** `source.start(when)` の sample-accurate なスケジューリングで実現。
**依存:** `types`
**テスト:** AudioContext のモックが必要。基本的な状態遷移の単体テスト。

### 2-3. バッファ健全性モニター (`src/stretcher/buffer-health.ts`)

設計書 §5.2, §5.3 のヒステリシス付き判定。

```ts
export class BufferHealthMonitor {
  constructor(emitter: Emitter<StretcherEvents>);

  // aheadSeconds を更新し、health を再判定
  update(aheadSeconds: number, behindSeconds: number, nextChunkReady: boolean): void;

  getHealth(): BufferHealth;
  isPlayable(): boolean;

  // BUFFERING → PLAYING の復帰判定（ヒステリシス）
  shouldResumePlayback(): boolean;
  shouldPausePlayback(): boolean;
}
```

**閾値:**
- `healthy`: ≥ 60秒
- `low`: ≥ 15秒
- `critical`: ≥ 3秒
- `empty`: < 3秒

**BUFFERING 入り:** aheadSeconds < 3 かつ次チャンク not ready
**PLAYING 復帰:** aheadSeconds ≥ 10 または次チャンク ready（ヒステリシス）

**依存:** `types`, `emitter`
**テスト:**
- 各閾値での health 判定
- ヒステリシスが正しく動作すること（3秒で BUFFERING → 10秒まで復帰しない）

### 2-4. WorkerManager (`src/stretcher/worker-manager.ts`)

設計書 §9.1 の Worker 生成・クラッシュ回復。

```ts
export class WorkerManager {
  constructor(emitter: Emitter<StretcherEvents>);

  // Worker に変換を投入
  postConversion(request: WorkerRequest): void;

  // 進行中の変換をキャンセル
  cancelActive(): void;

  // Worker クラッシュ時の自動リスタート（最大3回）
  // onerror ハンドラ内で実装

  dispose(): void;
}
```

**Worker 生成方式:**
```ts
// wsola.ts と stretch-worker.ts を文字列として結合 → Blob URL
const workerCode = `${WSOLA_SOURCE}\n${WORKER_SOURCE}`;
const blob = new Blob([workerCode], { type: "text/javascript" });
const url = URL.createObjectURL(blob);
const worker = new Worker(url);
```

**依存:** `types`, `emitter`, `workers/stretch-worker.ts`（ビルド時にインライン化）
**テスト:** Worker のモックを使った単体テスト

---

## Phase 3: ステータス & イベント

### 3-1. ConversionEstimator (`src/stretcher/conversion-estimator.ts`)

設計書 §5.4 の移動平均ベース推定。

```ts
export class ConversionEstimator {
  private recentDurations: number[] = [];
  private readonly windowSize = 10;

  recordConversion(durationMs: number): void;
  estimateRemaining(remainingChunks: number): number;
}
```

**依存:** なし
**テスト:** 移動平均の正確性、初回推定値の妥当性

### 3-2. StretcherEngine 統合 (`src/stretcher/stretcher.ts`)

全コンポーネントを統合するメインクラス。設計書 §6 のイベント API を公開。

```ts
export class StretcherEngine {
  constructor(
    ctx: AudioContext,
    buffer: AudioBuffer,
    options: { tempo: number; algorithm: "wsola" | "phase-vocoder"; destination?: AudioNode }
  );

  // ── ステータス ──
  getStatus(): StretcherStatus;

  // ── コントロール ──
  start(offset?: number): void;
  pause(): void;
  resume(): void;
  seek(positionSec: number): void;
  setTempo(tempo: number): void;
  stop(): void;
  dispose(): void;

  // ── イベント（§6.1）──
  on<K extends keyof StretcherEvents>(event: K, handler: ...): () => void;
  off<K extends keyof StretcherEvents>(event: K, handler: ...): void;

  // ── 位置追跡 ──
  getCurrentInputPosition(): number;   // 元バッファ上の位置（UI 表示用）
  getDuration(): number;               // 元バッファの長さ
}
```

**内部構造:**
```
StretcherEngine
├── ChunkManager        — チャンク分割・状態管理
├── ConversionScheduler — 変換キュー管理
│   └── PriorityQueue   — 優先度キュー
├── ChunkPlayer         — ダブルバッファリング再生
├── BufferHealthMonitor — バッファ健全性
├── ConversionEstimator — 残り時間推定
├── MemoryManager       — チャンク破棄（Phase 6）
├── WorkerManager       — Worker 管理
└── Emitter<StretcherEvents>
```

**依存:** 上記全コンポーネント
**テスト:** 統合テスト（AudioContext モック）

### 3-3. PlaybackSnapshot 拡張 (`src/types.ts` 変更)

```ts
// 追加
interface PlaybackSnapshot {
  // 既存フィールド
  state: PlaybackState;
  position: number;
  duration: number;
  progress: number;

  // 新規（preservePitch: true の場合のみ）
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

**依存:** なし
**テスト:** 型変更のため回帰テストのみ

### 3-4. adapters.ts 拡張

`getSnapshot()` が `stretcher` フィールドも返すように拡張。
`subscribeSnapshot()` が Stretcher イベントも購読するように拡張。

**依存:** `types.ts` の変更
**テスト:** 既存テストの回帰 + 新フィールドの検証

---

## Phase 4: play() API 統合

### 4-1. PlayOptions 拡張 (`src/types.ts`)

```ts
interface PlayOptions {
  // 既存
  offset?: number;
  loop?: boolean;
  // ...

  // 新規
  preservePitch?: boolean;                      // true で Stretcher パスを使用
  algorithm?: "wsola" | "phase-vocoder";        // @default "wsola"
}
```

### 4-2. play.ts の分岐

```ts
export function play(ctx, buffer, options?): Playback {
  if (options?.preservePitch && options?.playbackRate !== undefined && options.playbackRate !== 1) {
    return playWithStretcher(ctx, buffer, options);
  }
  return playDirect(ctx, buffer, options);  // 既存実装
}
```

`playWithStretcher()` は `StretcherEngine` を内部で生成し、同じ `Playback` インターフェースを返す。

**重要な設計判断:**
- `Playback` インターフェースは変更しない（後方互換性）
- `setPlaybackRate()` が内部で `StretcherEngine.setTempo()` を呼ぶ
- `seek()` が `StretcherEngine.seek()` を呼ぶ
- `getCurrentTime()` が `StretcherEngine.getCurrentInputPosition()` を返す（UI には元バッファの位置を表示）
- `dispose()` が `StretcherEngine.dispose()` を呼ぶ

**依存:** `stretcher/stretcher.ts`, `types.ts`
**テスト:**
- `play(ctx, buffer, { preservePitch: true, playbackRate: 1.5 })` のフルライフサイクル
- 既存テスト（preservePitch なし）の回帰なし

---

## Phase 5: Phase Vocoder & 高品質オプション

### 5-1. Radix-4 FFT (`src/workers/fft.ts`)

Worker 内で動作する軽量 FFT。外部依存なし。

```ts
export class FFT {
  constructor(size: number);  // size は 2 のべき乗
  forward(real: Float32Array, imag: Float32Array): void;   // in-place
  inverse(real: Float32Array, imag: Float32Array): void;   // in-place
}
```

**テスト:** 既知の信号の FFT/IFFT ラウンドトリップ

### 5-2. Phase Vocoder + IPL (`src/workers/phase-vocoder.ts`)

```ts
export function phaseVocoderStretch(
  input: Float32Array[],
  tempo: number,
  sampleRate: number,
  options?: { fftSize?: number }
): Float32Array[]
```

**依存:** `fft.ts`
**テスト:** WSOLA と同じテストスイート + 位相精度テスト

### 5-3. アルゴリズム切替

`stretch-worker.ts` 内で `algorithm` パラメータに基づいて分岐。

---

## Phase 6: 最適化 & 堅牢化

### 6-1. MemoryManager (`src/stretcher/memory-manager.ts`)

設計書 §8 のチャンク遅延破棄。

```ts
export class MemoryManager {
  // 再生位置から離れたチャンクの outputBuffer を null に（evicted 状態）
  evictDistantChunks(currentIndex: number): void;

  // 1世代キャッシュ（§4.3）
  cacheTempo(chunks: ChunkInfo[], tempo: number): void;
  restoreTempo(targetTempo: number): ChunkInfo[] | null;
  clearCache(): void;
}
```

**保持範囲:**
- 前方: max(5チャンク, 150秒分)
- 後方: max(2チャンク, 60秒分)

### 6-2. モバイル最適化

- メモリバジェット検出（`navigator.deviceMemory` / `performance.memory`）
- チャンクサイズの動的調整（メモリ不足時は 15 秒チャンクに縮小）

---

## ビルド・エクスポート設定の変更

### tsup.config.ts

```ts
entry: {
  // 既存...
  stretcher: "src/stretcher/index.ts",
}
```

### package.json

```json
"./stretcher": {
  "import": {
    "types": "./dist/stretcher.d.ts",
    "default": "./dist/stretcher.js"
  }
}
```

### Worker のインライン化

Worker コードは別ファイルに分離できないため（バンドラ依存になる）、ビルド時に文字列化する方式を採用:

1. `src/workers/wsola.ts` と `src/workers/stretch-worker.ts` を純粋な ES Module として書く
2. `src/stretcher/worker-manager.ts` 内で、ビルド時に生成された文字列定数からWorker を生成
3. tsup のカスタムプラグインで Worker ソースを文字列化するか、手動で `const WORKER_SOURCE = "..."` として管理

代替案: tsup の `--define` でビルド時置換。または、Worker ソースを関数の `.toString()` で取得する方式。

---

## テスト戦略

### 環境の課題

`vitest.config.ts` は `environment: "node"` なので、`AudioContext`, `AudioBufferSourceNode`, `Worker` が存在しない。

### 解決策

1. **純粋ロジックのテスト**（モック不要）:
   - `wsola.ts` — Float32Array の入出力
   - `priority-queue.ts` — データ構造
   - `chunk-manager.ts`（AudioBuffer をモック）
   - `buffer-health.ts` — 閾値判定
   - `conversion-estimator.ts` — 移動平均

2. **AudioContext モック**:
   - `ChunkPlayer` / `StretcherEngine` のテスト用に最低限のモックを作成
   - `createBuffer`, `createBufferSource`, `currentTime` 程度

3. **Worker モック**:
   - `WorkerManager` のテスト用に `Worker` をモック
   - `postMessage` / `onmessage` のシミュレーション

### テストファイル構成

```
tests/
├── emitter.test.ts          ← 既存
├── wsola.test.ts            ← WSOLA 単体テスト
├── priority-queue.test.ts   ← キュー単体テスト
├── chunk-manager.test.ts    ← チャンク分割テスト
├── buffer-health.test.ts    ← バッファ健全性テスト
├── conversion-estimator.test.ts
├── conversion-scheduler.test.ts
├── memory-manager.test.ts
└── stretcher.test.ts        ← 統合テスト
```

---

## 実装順序（依存関係に基づくトポロジカルソート）

```
Phase 1（依存なし → 上流）:
  1. src/stretcher/types.ts
  2. src/workers/wsola.ts          + tests/wsola.test.ts
  3. src/stretcher/priority-queue.ts + tests/priority-queue.test.ts
  4. src/stretcher/chunk-manager.ts  + tests/chunk-manager.test.ts
  5. src/workers/stretch-worker.ts

Phase 2（Phase 1 に依存）:
  6. src/stretcher/worker-manager.ts
  7. src/stretcher/buffer-health.ts   + tests/buffer-health.test.ts
  8. src/stretcher/conversion-estimator.ts + tests/conversion-estimator.test.ts
  9. src/stretcher/conversion-scheduler.ts + tests/conversion-scheduler.test.ts
  10. src/stretcher/chunk-player.ts

Phase 3（Phase 2 に依存）:
  11. src/stretcher/memory-manager.ts  + tests/memory-manager.test.ts
  12. src/stretcher/stretcher.ts       + tests/stretcher.test.ts
  13. src/stretcher/index.ts

Phase 4（Phase 3 に依存）:
  14. src/types.ts の変更（PlayOptions, PlaybackSnapshot 拡張）
  15. src/play.ts の変更（preservePitch パス追加）
  16. src/adapters.ts の変更（stretcher スナップショット）
  17. src/index.ts の変更（エクスポート追加）
  18. tsup.config.ts / package.json の変更

Phase 5（Phase 4 完了後）:
  19. src/workers/fft.ts
  20. src/workers/phase-vocoder.ts
  21. stretch-worker.ts への PV 統合

Phase 6（Phase 5 完了後）:
  22. memory-manager の実装強化
  23. モバイル最適化
```

---

## 成功指標（設計書 §11 より）

| 指標 | 目標値 | 検証方法 |
|------|--------|---------|
| 初回チャンク変換 (WSOLA) | ≤ 50ms | `performance.now()` で計測 |
| 初回チャンク変換 (PV) | ≤ 500ms | 同上 |
| tempo 変更→再生開始 | ≤ 1秒 (WSOLA) | イベントタイムスタンプ |
| 再生中 CPU | ~0% | `requestIdleCallback` で計測 |
| BUFFERING 頻度 (60分, WSOLA) | 0回 | `buffering` イベントカウント |
| seek → 再開 (ready チャンク) | ≤ 100ms | イベントタイムスタンプ |
| メモリ (60分ステレオ) | ≤ 80MB | `performance.memory` |
| 周波数精度 (440Hz, 1.5x) | ±2Hz | FFT 検証テスト |
