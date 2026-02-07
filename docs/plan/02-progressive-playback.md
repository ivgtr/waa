# Phase 2: プログレッシブ再生

> 設計書参照: §4（変換スケジューラ）、§5.2-5.3（バッファ健全性）、§7（再生エンジン結合）、§9（エラー耐性）
> 前提: Phase 1 完了（types, wsola, priority-queue, chunk-manager, stretch-worker）

## 完了基準

60分の音源で tempo 変更 → 0.3秒以内に再生開始。バッファ枯渇時に自動的に BUFFERING → 復帰。

---

## 2-1. WorkerManager

**ファイル:** `src/stretcher/worker-manager.ts`
**設計書:** §9.1

Worker の生成・通信・クラッシュ回復を担当。

### API

```ts
export class WorkerManager {
  constructor(emitter: Emitter<StretcherEvents>);

  /** Worker に変換リクエストを送信（Transferable） */
  postConversion(request: WorkerRequest): void;

  /** 進行中の変換をキャンセル */
  cancelActive(): void;

  /** Worker の応答ハンドラを登録 */
  onResult(handler: (response: WorkerResponse) => void): void;

  /** Worker を破棄し、Blob URL を revoke */
  dispose(): void;
}
```

### Worker 生成

```ts
// Blob URL 方式（バンドラ非依存）
private createWorker(): Worker {
  const blob = new Blob([WORKER_SOURCE], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);

  worker.onerror = (e) => this.handleCrash(e);
  worker.onmessage = (e) => this.handleMessage(e);

  return worker;
}
```

### クラッシュ回復（§9.1）

```
Worker クラッシュ:
  crashCount++ → crashCount ≤ 3 → Worker 再生成 → キュー再開
                 crashCount > 3 → fatal error イベント発火
```

- クラッシュ時、進行中のチャンクは `"failed"` に遷移
- 新しい Worker を生成してスケジューラに通知

### 依存

- `src/stretcher/types.ts` — WorkerRequest, WorkerResponse
- `src/emitter.ts` — Emitter

### テスト

Worker のモックを使用:
```
- postConversion → Worker.postMessage が呼ばれること
- cancelActive → cancel メッセージが送信されること
- onResult → Worker からの応答が正しくディスパッチされること
- クラッシュ回復: onerror 発火 → Worker 再生成 → 3回超で fatal
- dispose → Worker.terminate + URL.revokeObjectURL
```

---

## 2-2. ConversionScheduler

**ファイル:** `src/stretcher/conversion-scheduler.ts`
**設計書:** §4.1, §4.2, §4.3

変換キューの管理と Worker への自動投入を担当。Phase 2 の中核。

### API

```ts
export class ConversionScheduler {
  constructor(
    chunkManager: ChunkManager,
    workerManager: WorkerManager,
    emitter: Emitter<StretcherEvents>,
    options: { tempo: number; algorithm: "wsola" | "phase-vocoder" },
  );

  /**
   * 優先度更新（§4.1）
   *
   * 再生位置からの距離をベースに、前方を優遇する。
   *   priority = distance × directionWeight
   *   前方: 1.0 / 後方: 2.5
   */
  updatePriorities(currentChunkIndex: number): void;

  /**
   * 次のチャンクを Worker に投入。
   * Worker が空いていれば、キューの先頭を投入する。
   * Worker は1つだけ使用（並列は AudioBuffer のメモリが倍増するため）。
   */
  dispatchNext(): void;

  /**
   * seek 時のキュー再構築（§4.2）
   *
   * 1. 進行中の変換をキャンセル（seek 先と無関係なら）
   * 2. キューをクリアして優先度再計算
   * 3. seek 先のチャンクが未 ready なら最優先で投入
   */
  handleSeek(newChunkIndex: number): void;

  /**
   * tempo 変更時の全リセット（§4.3）
   *
   * 1. 進行中の変換をキャンセル
   * 2. 全チャンクを pending にリセット
   * 3. 現在の再生位置から変換開始
   */
  handleTempoChange(newTempo: number, currentChunkIndex: number): void;

  /**
   * Worker からの変換完了通知を処理
   *
   * 1. チャンクの状態を "ready" に更新
   * 2. ChunkManager に出力データを格納
   * 3. chunkready イベントを発火
   * 4. 次のチャンクを自動投入
   */
  handleWorkerResult(chunkIndex: number, outputData: Float32Array[]): void;

  /**
   * Worker からのエラーを処理（§9.2）
   *
   * retryCount ≤ 3 → pending に戻して再キュー
   * retryCount > 3 → failed に遷移、error イベント発火
   */
  handleWorkerError(chunkIndex: number, error: string): void;

  /** 全停止。キュークリア + 進行中の変換キャンセル */
  stop(): void;

  /** 現在変換中のチャンクインデックス（なければ -1） */
  get activeChunkIndex(): number;

  /** キューに残っているチャンク数 */
  get queueSize(): number;
}
```

### 内部状態

```ts
private queue: PriorityQueue<ChunkInfo>;
private activeConversion: ChunkInfo | null;
private currentTempo: number;
private currentAlgorithm: "wsola" | "phase-vocoder";
```

### 依存

- `src/stretcher/chunk-manager.ts` — ChunkManager
- `src/stretcher/priority-queue.ts` — PriorityQueue
- `src/stretcher/worker-manager.ts` — WorkerManager
- `src/emitter.ts` — Emitter

### テスト (`tests/conversion-scheduler.test.ts`)

WorkerManager をモックして使用:
```
- updatePriorities: 再生位置 C5 → C5=0, C6=1, C7=2, C4=2.5, C8=3 ...
- dispatchNext: Worker が空 → キュー先頭が投入される
- dispatchNext: Worker がビジー → 何もしない
- handleSeek(C9): キュークリア → C9 が最優先 → 変換開始
- handleSeek(C5→C9): 進行中の C6 がキャンセルされる
- handleSeek(C5→C6): 距離2以内 → 進行中の C5 はキャンセルされない
- handleTempoChange: 全チャンク pending → 現在位置から再スタート
- handleWorkerResult: state=ready → chunkready イベント → 次を自動投入
- handleWorkerError: retryCount < 3 → 再キュー / retryCount >= 3 → failed
```

---

## 2-3. ChunkPlayer

**ファイル:** `src/stretcher/chunk-player.ts`
**設計書:** §7.1, §7.2

変換済みチャンクをダブルバッファリングでギャップレス再生する。

### API

```ts
export class ChunkPlayer {
  constructor(
    ctx: AudioContext,
    destination: AudioNode,
    options?: { through?: AudioNode[] },
  );

  /**
   * 次のチャンクを AudioContext タイムラインにスケジュール（§7.1）
   *
   * AudioBufferSourceNode の start(when) は sample-accurate なので、
   * ギャップもオーバーラップも発生しない。
   */
  scheduleNext(chunk: ChunkInfo, startTime: number): void;

  /**
   * 先読みスケジューリングのチェックループを開始
   *
   * setInterval(200ms) で現在のチャンク終了まで 500ms 以内かチェック。
   * 500ms 以内なら次のチャンクを要求する onNeedChunk コールバックを呼ぶ。
   */
  startLookahead(onNeedChunk: () => void, onUnderrun: () => void): void;

  /** 先読みチェックループを停止 */
  stopLookahead(): void;

  /**
   * seek 実装（§7.2）
   *
   * 1. 再生中のソースを即座に停止
   * 2. 対象チャンクのオフセット位置から再生開始
   */
  seekTo(chunk: ChunkInfo, offsetInChunk: number): void;

  /** 再生を一時停止（ソース停止 + 位置記憶） */
  pause(): number;  // 返り値: 一時停止した出力位置

  /** 一時停止から再開 */
  resume(chunk: ChunkInfo, offsetInChunk: number): void;

  /** 現在の再生位置（AudioContext.currentTime ベース） */
  getCurrentOutputPosition(): number;

  /** 再生中かどうか */
  get isPlaying(): boolean;

  /** 全リソース解放 */
  dispose(): void;
}
```

### ダブルバッファリング

```
時間軸 →
  Source A: [=====Chunk 4=====]
  Source B:              [=====Chunk 5=====]     ← Source A 終了前にスケジュール
  Source A:                           [=====Chunk 6=====]
                         ↑
                    sample-accurate スケジューリングでギャップレス
```

- `currentSource` と `nextSource` の2つの `AudioBufferSourceNode` を管理
- `source.onended` で参照をローテーション

### 先読みチェック

```ts
private lookaheadCheck = (): void => {
  const remaining = this.currentChunkEndTime - this.ctx.currentTime;
  if (remaining < 0.5 && !this.nextSource) {
    this.onNeedChunk();  // → StretcherEngine が次の ready チャンクを取得してスケジュール
  }
};
// setInterval(this.lookaheadCheck, 200)
```

### 依存

- `src/stretcher/types.ts` — ChunkInfo

### テスト

AudioContext のモックが必要。基本的な状態遷移の単体テスト:
```
- scheduleNext → AudioBufferSourceNode.start(when) が呼ばれること
- seekTo → 既存ソースが stop() → 新しいソースが start()
- pause → 現在の位置を返す、ソースが停止
- resume → 新しいソースが start()
- dispose → ソース停止 + lookahead 停止
```

---

## 2-4. バッファ健全性モニター

**ファイル:** `src/stretcher/buffer-health.ts`
**設計書:** §5.2, §5.3

### API

```ts
export class BufferHealthMonitor {
  constructor(emitter: Emitter<StretcherEvents>);

  /**
   * バッファ状態を更新し、health を再判定。
   * health が変化した場合に bufferhealth イベントを発火。
   */
  update(
    aheadSeconds: number,
    behindSeconds: number,
    aheadChunks: number,
    nextChunkReady: boolean,
  ): void;

  /** 現在のバッファ健全性 */
  getHealth(): BufferHealth;

  /** 再生可能か（empty でない） */
  isPlayable(): boolean;

  /**
   * BUFFERING → PLAYING の復帰判定（ヒステリシス）
   *
   * 復帰条件: aheadSeconds ≥ 10 または 次チャンク ready
   * → 閾値 3秒 → BUFFERING、閾値 10秒 → PLAYING の非対称
   */
  shouldResumePlayback(): boolean;

  /**
   * PLAYING → BUFFERING の遷移判定
   *
   * 遷移条件: aheadSeconds < 3 かつ 次チャンク not ready
   */
  shouldPausePlayback(): boolean;

  /** 現在の統計情報を返す */
  getStatus(): BufferStatus;
}
```

### 閾値設計（§5.2）

```
aheadSeconds ≥ 60  → healthy   （十分な余裕）
aheadSeconds ≥ 15  → low       （変換を加速すべき）
aheadSeconds ≥ 3   → critical  （ギリギリ）
aheadSeconds < 3   → empty     （再生を一時停止）
```

### ヒステリシス（§5.3）

```
  PLAYING ←── aheadSeconds ≥ 10 ──── BUFFERING
    │                                     ↑
    │ aheadSeconds < 3                    │
    │ && !nextChunkReady                  │
    └─────────────────────────────────────┘
```

復帰閾値（10秒）を入り閾値（3秒）より高くすることで、頻繁な PLAYING ↔ BUFFERING の振動を防止。

### 依存

- `src/stretcher/types.ts` — BufferHealth, BufferStatus
- `src/emitter.ts` — Emitter

### テスト (`tests/buffer-health.test.ts`)

```
- aheadSeconds=60 → healthy
- aheadSeconds=30 → low
- aheadSeconds=5  → critical
- aheadSeconds=1  → empty
- shouldPausePlayback: ahead=2, nextReady=false → true
- shouldPausePlayback: ahead=2, nextReady=true  → false
- shouldResumePlayback: ahead=10 → true
- shouldResumePlayback: ahead=5, nextReady=true → true
- shouldResumePlayback: ahead=5, nextReady=false → false
- ヒステリシス: ahead=2→BUFFERING, ahead=8→まだBUFFERING, ahead=10→PLAYING
- update で health 変化時に bufferhealth イベントが発火
- update で health 不変時はイベントなし
```

---

## Phase 2 の実装順序

```
6.  src/stretcher/worker-manager.ts    ← types, emitter に依存
7.  src/stretcher/buffer-health.ts     ← types, emitter に依存（並行可能）
    + tests/buffer-health.test.ts
8.  src/stretcher/conversion-scheduler.ts  ← chunk-manager, priority-queue, worker-manager に依存
    + tests/conversion-scheduler.test.ts
9.  src/stretcher/chunk-player.ts      ← types に依存（並行可能）
```

ステップ 6 と 7 は並行して実装可能。
ステップ 8 は 6 に依存するため、6 完了後に実装。
ステップ 9 は他と独立して並行可能。
