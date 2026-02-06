# waa — プログレッシブ変換エンジン & ローディングステータス管理 詳細設計書

## 1. この設計が解決すること

オフライン方式の唯一にして最大の弱点は「速度変更時の待ち時間」である。
3分の音源なら WSOLA で 0.2 秒、Phase Vocoder で 2 秒。問題は長尺音源で顕著になる。

```
60分のポッドキャスト × Phase Vocoder = 37秒の待ち

ユーザーの期待: 「1.5倍速」ボタンを押したら、すぐ再生が始まること
現実:            37秒間のローディングスピナー → 離脱
```

プログレッシブ変換は「全体変換を待たずに、変換済みの部分から即座に再生を開始する」手法。動画ストリーミングのバッファリングと同じ思想を音声の Time-Stretch に適用する。

---

## 2. コアコンセプト: ストリーミング変換

### 2.1 チャンク分割と優先度

バッファ全体を固定長のチャンクに分割し、再生位置に近い順に変換する。

```
元バッファ（60分）:
┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐
│ C0  │ C1  │ C2  │ C3  │ C4  │ C5  │ C6  │ C7  │ C8  │ C9  │ C10 │ C11 │
└─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘
  0:00  5:00  10:00 15:00 20:00 25:00 30:00 35:00 40:00 45:00 50:00 55:00

現在の再生位置: 22:30（C4 の中間）

変換優先度:
  1st: C4  ← 今再生中。最優先
  2nd: C5  ← 次に再生される
  3rd: C6  ← その次
  4th: C3  ← 巻き戻しに備えて
  5th: C7
  6th: C2
  ...        ← 再生位置から双方向に放射状に展開
```

### 2.2 チャンクサイズの設計

チャンクサイズは「初回変換の待ち時間」と「チャンク境界のオーバーヘッド」のバランスで決まる。

```
チャンクサイズ = 30秒（デフォルト）

理由:
  WSOLA:  30秒 → 変換時間 ~0.03秒 → 体感即時
  PV:     30秒 → 変換時間 ~0.3秒  → 許容範囲

  60分の音源 → 120チャンク
  チャンク境界でのクロスフェード: 10ms × 120 = 1.2秒分のオーバーヘッド → 無視可能
```

| 音源長 | チャンク数 | 初回変換 (WSOLA) | 初回変換 (PV) |
|--------|-----------|-----------------|--------------|
| 3分 | 6 | ~0.03秒 | ~0.3秒 |
| 10分 | 20 | ~0.03秒 | ~0.3秒 |
| 60分 | 120 | ~0.03秒 | ~0.3秒 |
| 3時間 | 360 | ~0.03秒 | ~0.3秒 |

→ **音源の長さに関係なく、初回の待ち時間は一定。** これがプログレッシブ変換の本質的な利点。

### 2.3 チャンク境界の処理

Time-Stretch アルゴリズムはフレーム単位で動作するため、チャンク境界で不連続が生じる。これを防ぐために、各チャンクはオーバーラップ領域を持つ。

```
元バッファ上のチャンク分割:

Chunk N:   [========= 30秒 =========][overlap]
Chunk N+1:                    [overlap][========= 30秒 =========]
                              ↑
                              重複領域（フレームサイズ × 2 ≈ 50ms）

変換後の結合:
  Chunk N の末尾と Chunk N+1 の先頭をクロスフェードで接合

  出力: ──────Chunk N──────╲╱──────Chunk N+1──────
                            ↑
                         クロスフェード（10ms）
```

```
overlap の算出:
  WSOLA:  frameSize(1024) + tolerance(2048) = 3072 samples ≈ 70ms
  PV:     fftSize(4096) × 2 = 8192 samples ≈ 186ms

  → 安全マージンを含めて 200ms のオーバーラップを確保
```

---

## 3. 状態モデル

### 3.1 チャンクの状態遷移

各チャンクは以下の状態を持つ。

```
         enqueue()          Worker完了
  PENDING ────────→ CONVERTING ────────→ READY
     │                  │
     │ cancel()         │ error
     ▼                  ▼
  SKIPPED            FAILED ──→ retry → CONVERTING
                                  ↑
                           最大3回まで
```

```ts
type ChunkState =
  | "pending"      // 未変換。キューに入っていない
  | "queued"       // 変換キューに投入済み。Worker の空きを待っている
  | "converting"   // Worker で変換中
  | "ready"        // 変換完了。再生可能
  | "failed"       // 変換失敗（リトライ上限到達）
  | "skipped";     // キャンセルされた（seek で不要になった等）
```

### 3.2 全体の状態モデル

```ts
interface StretcherState {
  // 変換パラメータ
  tempo: number;
  algorithm: "wsola" | "phase-vocoder";

  // チャンク管理
  chunks: ChunkInfo[];
  totalChunks: number;
  readyChunks: number;

  // 再生状態
  playbackState: "waiting" | "playing" | "buffering" | "complete";
  currentChunkIndex: number;

  // バッファ健全性
  bufferHealth: "healthy" | "low" | "critical" | "empty";
  convertedAheadSeconds: number;  // 再生位置から先に変換済みの秒数
}

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
```

### 3.3 再生状態の遷移

```
                    初回チャンク変換完了
    WAITING ──────────────────────────→ PLAYING
      ↑                                   │
      │ tempo変更                          │ 先読みバッファ枯渇
      │ (全チャンクリセット)                  │ (変換が再生に追いつかれた)
      │                                   ▼
      │                              BUFFERING
      │                                   │
      │ tempo変更                          │ 次チャンク変換完了
      │                                   │
      └───────────────────────────────────┘
                                          │
                                          │ 全チャンク変換完了 & 再生完了
                                          ▼
                                      COMPLETE
```

---

## 4. 変換スケジューラ

### 4.1 優先度キュー

再生位置に基づいてチャンクの変換優先度を動的に更新する。

```ts
class ConversionScheduler {
  private queue: PriorityQueue<ChunkInfo>;
  private worker: Worker;
  private activeConversion: ChunkInfo | null = null;

  /**
   * 優先度の計算
   *
   * 再生位置からの「距離」をベースに、前方（再生方向）を優遇する。
   *
   *   priority = distance × directionWeight
   *
   *   前方: directionWeight = 1.0
   *   後方: directionWeight = 2.5（巻き戻しは頻度が低いため後回し）
   */
  updatePriorities(currentChunkIndex: number): void {
    for (const chunk of this.chunks) {
      if (chunk.state === "ready" || chunk.state === "converting") continue;

      const distance = Math.abs(chunk.index - currentChunkIndex);
      const isAhead = chunk.index >= currentChunkIndex;
      chunk.priority = distance * (isAhead ? 1.0 : 2.5);
    }
    this.queue.rebuild();
  }

  /**
   * 変換の投入
   *
   * Worker が空いていれば、キューの先頭を投入する。
   * Worker は1つだけ使用（並列 Worker は AudioBuffer のメモリが倍増するため）。
   */
  dispatchNext(): void {
    if (this.activeConversion) return;

    const next = this.queue.dequeue();
    if (!next) return;

    next.state = "converting";
    this.activeConversion = next;

    this.worker.postMessage({
      type: "convert",
      chunkIndex: next.index,
      inputData: this.extractInputChunk(next),  // Transferable
      tempo: this.tempo,
      algorithm: this.algorithm,
      overlap: this.overlapSamples,
    }, [/* transferables */]);
  }
}
```

### 4.2 seek 時のキュー再構築

```
再生位置が 5:00 → 45:00 に seek された場合:

Before:
  変換済み: C0 C1 C2 [C3 converting...]
  キュー:   C4 C5 C6 C7 ...

After:
  1. C3 の変換をキャンセル（Worker に cancel メッセージ）
     → Worker 側: 現在のフレーム処理完了後に中断、"cancelled" を返す
     → C3.state = "skipped" (後で必要になれば再キュー)
  2. 優先度を再計算（currentChunkIndex = 9、45:00 ÷ 5:00 = 9）
  3. C9 を最優先で変換開始
  4. 変換完了まで BUFFERING 状態
```

```ts
handleSeek(newPosition: number): void {
  const newChunkIndex = this.positionToChunkIndex(newPosition);

  // 1. 進行中の変換をキャンセル（seek 先と無関係なら）
  if (this.activeConversion &&
      Math.abs(this.activeConversion.index - newChunkIndex) > 2) {
    this.cancelActiveConversion();
  }

  // 2. キューをクリアして優先度再計算
  this.queue.clear();
  this.updatePriorities(newChunkIndex);

  // 3. seek 先のチャンクが ready でなければ BUFFERING
  const targetChunk = this.chunks[newChunkIndex];
  if (targetChunk.state !== "ready") {
    this.setPlaybackState("buffering");
    this.enqueueChunk(targetChunk);
    // ready になったら自動的に PLAYING に遷移
  }

  // 4. 次のチャンクもプリフェッチ
  this.dispatchNext();
}
```

### 4.3 tempo 変更時のキャッシュ戦略

```
tempo 変更 = 全チャンクの再変換が必要

しかし、以前の tempo のキャッシュを保持すべきか？

方針: 直前の tempo のバッファのみ保持（1世代キャッシュ）

理由:
  - ユーザーは「やっぱり元の速度に戻す」操作を頻繁に行う
  - 2世代以上のキャッシュはメモリコストに見合わない

  例: 60分ステレオ @ 44.1kHz
      1 tempo分のバッファ ≈ 60 × 44100 × 2ch × 4bytes ≈ 21MB
      2 tempo分 ≈ 42MB → モバイルの限界付近
```

```ts
handleTempoChange(newTempo: number): void {
  const quantized = this.quantizeTempo(newTempo);
  if (quantized === this.currentTempo) return;

  // 1. 現在のバッファを前世代キャッシュに退避
  this.previousCache = {
    tempo: this.currentTempo,
    chunks: this.chunks.map(c => ({
      ...c,
      outputBuffer: c.outputBuffer,  // 参照を保持（コピーしない）
    })),
  };

  // 2. 全チャンクをリセット
  this.chunks.forEach(c => {
    c.state = "pending";
    c.outputBuffer = null;
  });

  // 3. 現在の再生位置から変換開始
  this.currentTempo = quantized;
  this.updatePriorities(this.currentChunkIndex);
  this.setPlaybackState("buffering");
  this.dispatchNext();
}

// 前の tempo に戻す場合はキャッシュから即時復元
restorePreviousTempo(): boolean {
  if (!this.previousCache) return false;
  // キャッシュの chunks をそのまま復元 → PLAYING に即時遷移
  this.chunks = this.previousCache.chunks;
  this.currentTempo = this.previousCache.tempo;
  this.setPlaybackState("playing");
  return true;
}
```

---

## 5. ローディングステータス管理

### 5.1 ステータスの階層構造

```
StretcherStatus
├── phase: "idle" | "initializing" | "active" | "complete" | "error"
│
├── conversion: ConversionStatus
│   ├── state: "idle" | "converting" | "paused"
│   ├── totalChunks: number
│   ├── readyChunks: number
│   ├── progress: number            // 0.0 〜 1.0（全体の変換進捗）
│   ├── currentChunkIndex: number   // 今変換中のチャンク
│   └── estimatedTimeRemaining: number  // 残り推定秒数
│
├── buffer: BufferStatus
│   ├── health: "healthy" | "low" | "critical" | "empty"
│   ├── aheadSeconds: number        // 再生位置から先の変換済み秒数
│   ├── behindSeconds: number       // 再生位置から後ろの変換済み秒数
│   ├── aheadChunks: number         // 先読みチャンク数
│   └── isPlayable: boolean         // 再生可能か
│
└── playback: PlaybackStatus
    ├── state: "waiting" | "playing" | "buffering" | "paused" | "ended"
    ├── stallCount: number          // バッファリングで再生が止まった回数
    └── lastStallDuration: number   // 最後のバッファリング時間
```

### 5.2 バッファ健全性の判定

動画ストリーミングの「バッファリング」と同じ考え方。再生位置の先にどれだけ変換済みデータがあるかで判定する。

```
aheadSeconds = 再生位置から先に変換済みの秒数

  healthy:   aheadSeconds ≥ 60秒    → 十分な余裕
  low:       aheadSeconds ≥ 15秒    → 変換を加速すべき
  critical:  aheadSeconds ≥ 3秒     → 再生は継続するがギリギリ
  empty:     aheadSeconds < 3秒     → 再生を一時停止（BUFFERING）

  ┌──────────────────────────────────────────────────┐
  │ healthy                                          │
  │  ╔══════╗                                        │
  │  ║ 再生 ║ ■■■■■■■■■■■■■■■■■■■■ ░░░░░░░░░░░░░░  │
  │  ╚══════╝ ←── 変換済み ──────→  ←── 未変換 ──→  │
  │           60秒以上の余裕                           │
  │                                                  │
  │ critical                                         │
  │  ╔══════╗                                        │
  │  ║ 再生 ║ ■■■ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
  │  ╚══════╝ ←→  ←────── 未変換 ──────────────→    │
  │          3秒   変換が追いつかれそう                  │
  │                                                  │
  │ empty → BUFFERING                                │
  │  ╔══════╗                                        │
  │  ║ 停止 ║░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
  │  ╚══════╝                                        │
  │         変換が追いつかれた → 再生を一時停止          │
  └──────────────────────────────────────────────────┘
```

### 5.3 バッファリング → 再生再開の閾値

```
BUFFERING に入る条件:
  aheadSeconds < 3秒 かつ 次チャンクが ready でない

PLAYING に復帰する条件:
  aheadSeconds ≥ 10秒 または 次チャンクの変換完了

  ※ 復帰閾値を入る閾値より高くする（ヒステリシス）
    → 頻繁な PLAYING ↔ BUFFERING の振動を防止

  ┌────────────────────────────────────────┐
  │                                        │
  │  PLAYING ←──── aheadSeconds ≥ 10 ─────┤
  │    │                                   │
  │    │ aheadSeconds < 3                  │
  │    ▼                                   │
  │  BUFFERING ────────────────────────────┘
  │                                        │
  └────────────────────────────────────────┘
```

### 5.4 推定残り時間の計算

```ts
class ConversionEstimator {
  private recentDurations: number[] = [];  // 直近10チャンクの変換時間
  private readonly windowSize = 10;

  recordConversion(durationMs: number): void {
    this.recentDurations.push(durationMs);
    if (this.recentDurations.length > this.windowSize) {
      this.recentDurations.shift();
    }
  }

  /**
   * 残り時間の推定
   *
   * 移動平均で1チャンクあたりの変換時間を推定し、
   * 残チャンク数を掛ける。
   *
   * 初回は保守的な推定値を使用（実測値がないため）。
   */
  estimateRemaining(remainingChunks: number): number {
    if (this.recentDurations.length === 0) {
      // 初回推定: アルゴリズムとチャンクサイズから概算
      return remainingChunks * this.initialEstimateMs;
    }

    const avgMs = this.recentDurations.reduce((a, b) => a + b, 0)
                  / this.recentDurations.length;
    return remainingChunks * avgMs;
  }
}
```

---

## 6. イベント API

### 6.1 イベント一覧

```ts
interface StretcherEvents {
  // ── 状態遷移 ──
  "statechange": {
    phase: StretcherPhase;
    playback: PlaybackState;
  };

  // ── 変換進捗 ──
  "progress": {
    totalChunks: number;
    readyChunks: number;
    progress: number;               // 0.0〜1.0
    estimatedTimeRemaining: number; // 秒
  };

  // ── バッファ健全性 ──
  "bufferhealth": {
    health: BufferHealth;
    aheadSeconds: number;
    aheadChunks: number;
  };

  // ── バッファリング ──
  "buffering": {
    reason: "initial" | "seek" | "tempo-change" | "underrun";
  };
  "buffered": {
    stallDuration: number;  // バッファリングにかかった時間（ms）
  };

  // ── チャンク単位 ──
  "chunkready": {
    chunkIndex: number;
    conversionTime: number;  // この1チャンクの変換にかかった時間（ms）
  };

  // ── 全体完了 ──
  "complete": {
    totalTime: number;  // 全チャンクの変換にかかった合計時間（ms）
  };

  // ── エラー ──
  "error": {
    chunkIndex: number;
    error: Error;
    willRetry: boolean;
  };
}
```

### 6.2 UI 統合パターン

```ts
// ── パターン A: ミニマル（ポッドキャストアプリ） ──

playback.on("buffering", () => {
  spinner.show();
});
playback.on("buffered", () => {
  spinner.hide();
});

// ── パターン B: プログレスバー付き（音楽プレイヤー） ──

playback.on("progress", ({ progress, readyChunks, totalChunks }) => {
  // シークバーの背景に変換済み領域を表示
  // （YouTube の灰色バッファバーと同じ概念）
  bufferBar.style.width = `${progress * 100}%`;
  statusText.textContent = `${readyChunks}/${totalChunks}`;
});

playback.on("bufferhealth", ({ health, aheadSeconds }) => {
  // バッファ残量のインジケーター
  indicator.className = `buffer-${health}`;
  // "healthy" → 緑, "low" → 黄, "critical" → 赤
});

// ── パターン C: 詳細デバッグ ──

playback.on("chunkready", ({ chunkIndex, conversionTime }) => {
  console.log(`Chunk ${chunkIndex} ready in ${conversionTime}ms`);
});
playback.on("error", ({ chunkIndex, error, willRetry }) => {
  console.warn(`Chunk ${chunkIndex} failed: ${error.message}`,
               willRetry ? "(retrying)" : "(giving up)");
});
```

### 6.3 スナップショット統合

既存の `getSnapshot()` / `subscribeSnapshot()` との統合。

```ts
interface PlaybackSnapshot {
  // 既存フィールド
  state: "playing" | "paused" | "stopped";
  position: number;
  duration: number;
  progress: number;

  // 追加フィールド（preservePitch: true の場合のみ）
  stretcher?: {
    tempo: number;
    converting: boolean;
    conversionProgress: number;    // 0.0〜1.0
    bufferHealth: BufferHealth;
    aheadSeconds: number;
    buffering: boolean;            // BUFFERING 状態か
  };
}

// React での使用例
function Player({ playback }: { playback: Playback }) {
  const snap = usePlayback(playback);
  if (!snap) return null;

  return (
    <div>
      <SeekBar
        position={snap.position}
        duration={snap.duration}
        // 変換済み領域を灰色で表示
        bufferedProgress={snap.stretcher?.conversionProgress}
      />

      {snap.stretcher?.buffering && (
        <div className="buffering-overlay">
          <Spinner />
          <span>変換中...</span>
        </div>
      )}

      <SpeedSelector
        current={snap.stretcher?.tempo ?? 1}
        onChange={(t) => playback.setPlaybackRate(t)}
        // 変換中は速度ボタンに小さいローディングを表示
        loading={snap.stretcher?.converting}
      />
    </div>
  );
}
```

---

## 7. 再生エンジンとの結合

### 7.1 チャンク間のシームレス再生

変換済みチャンクを途切れなく再生するために、AudioBufferSourceNode のダブルバッファリングを行う。

```
時間軸 →

  Source A: [=====Chunk 4=====]
  Source B:              [=====Chunk 5=====]     ← Source A 終了前にスケジュール
  Source A:                           [=====Chunk 6=====]  ← 再利用
                         ↑
                    クロスフェード不要
                    （AudioContext.currentTime ベースの
                      正確なスケジューリングでギャップレス）
```

```ts
class ChunkPlayer {
  private ctx: AudioContext;
  private destination: AudioNode;
  private currentSource: AudioBufferSourceNode | null = null;
  private nextSource: AudioBufferSourceNode | null = null;
  private currentChunkEndTime: number = 0;

  /**
   * 次のチャンクをスケジュール
   *
   * 現在のチャンクが終わる直前（200ms前）に次のチャンクを
   * AudioContext のタイムライン上にスケジュールする。
   *
   * Web Audio API の start(when) は sample-accurate なので、
   * ギャップもオーバーラップも発生しない。
   */
  scheduleNext(chunk: ChunkInfo, startTime: number): void {
    const buffer = this.ctx.createBuffer(
      chunk.outputBuffer!.length,       // channels
      chunk.outputLength,
      this.ctx.sampleRate
    );
    for (let ch = 0; ch < chunk.outputBuffer!.length; ch++) {
      buffer.copyToChannel(chunk.outputBuffer![ch], ch);
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.destination);
    source.start(startTime);  // sample-accurate なスケジュール

    source.onended = () => this.onChunkEnded(chunk.index);

    this.nextSource = source;
    this.currentChunkEndTime = startTime + chunk.outputLength / this.ctx.sampleRate;
  }

  /**
   * 先読みスケジューリング
   *
   * setInterval で 200ms ごとにチェックし、
   * 現在のチャンク終了まで 500ms 以内なら次をスケジュール。
   */
  private lookaheadCheck = (): void => {
    const now = this.ctx.currentTime;
    const remaining = this.currentChunkEndTime - now;

    if (remaining < 0.5 && !this.nextSource) {
      const nextChunk = this.getNextReadyChunk();
      if (nextChunk) {
        this.scheduleNext(nextChunk, this.currentChunkEndTime);
      } else {
        // 次のチャンクが未変換 → BUFFERING に遷移
        this.emit("bufferunderrun");
      }
    }
  };
}
```

### 7.2 seek の実装

```ts
handleSeek(targetPosition: number): void {
  // 1. 再生中のソースを即座に停止
  this.currentSource?.stop();
  this.nextSource?.stop();
  this.currentSource = null;
  this.nextSource = null;

  // 2. 対象チャンクとチャンク内オフセットを計算
  const { chunkIndex, offsetInChunk } = this.positionToChunkOffset(targetPosition);

  // 3. 対象チャンクが ready なら即座に再生
  const chunk = this.chunks[chunkIndex];
  if (chunk.state === "ready") {
    this.playChunkFromOffset(chunk, offsetInChunk);
    this.setPlaybackState("playing");
  } else {
    // 4. 未変換なら BUFFERING → 変換完了を待って再生
    this.setPlaybackState("buffering");
    this.scheduler.handleSeek(chunkIndex);
    // chunkready イベントで再生開始
  }

  // 5. 優先度を再計算
  this.scheduler.updatePriorities(chunkIndex);
}
```

### 7.3 再生位置の正確な追跡

```
問題:
  チャンク単位で変換すると、各チャンクの出力長が厳密に
  inputLength / tempo にならない場合がある（アルゴリズム固有の誤差）。

  例: 30秒のチャンク × tempo 1.5
      理想: 20.000秒
      実際: 19.987秒（WSOLA の接合点ずれ）or 20.014秒（PV の位相調整）

  この誤差がチャンクごとに累積すると、表示位置がずれる。

解決:
  各チャンクの変換時に「入力位置 → 出力位置」のマッピングを記録する。
```

```ts
interface ChunkPositionMap {
  // チャンクの入力範囲
  inputStartSec: number;
  inputEndSec: number;

  // チャンクの出力範囲（実際の変換結果に基づく）
  outputStartSec: number;  // 出力バッファ上の累積開始位置
  outputEndSec: number;

  // 精密マッピング（チャンク内の位置変換用）
  // 入力の 0%〜100% が出力の何%〜何%に対応するか
  // Time-Stretch の歪みが線形でない場合に使用
  inputRatio: Float32Array;   // [0.0, 0.1, 0.2, ..., 1.0]
  outputRatio: Float32Array;  // [0.0, 0.098, 0.201, ..., 1.0]
}

/**
 * 再生位置（出力バッファ上）→ 元バッファ上の位置 に変換
 * UI に表示するのは常に「元バッファ上の位置」
 */
function outputToInputPosition(outputPos: number): number {
  const chunk = findChunkByOutputPosition(outputPos);
  const localOutput = outputPos - chunk.outputStartSec;
  const localRatio = localOutput / (chunk.outputEndSec - chunk.outputStartSec);

  // チャンク内の精密マッピングで補間
  const inputRatio = interpolate(chunk.outputRatio, chunk.inputRatio, localRatio);
  return chunk.inputStartSec + inputRatio * (chunk.inputEndSec - chunk.inputStartSec);
}
```

---

## 8. メモリ管理

### 8.1 メモリバジェット

```
前提: モバイルデバイスで安全に使用できるメモリ量 ≈ 150MB

固定コスト:
  元バッファ（60分ステレオ）:     ~21MB
  アプリ本体 + JS ヒープ:         ~20MB

変動コスト:
  変換済みチャンク（全体）:        ~21MB ÷ tempo（例: 1.5x → ~14MB）
  1世代キャッシュ:                ~14MB
  Worker 内の作業バッファ:         ~2MB

合計（60分, 1.5x, キャッシュ有）:  ~71MB → OK

合計（60分, 0.5x, キャッシュ有）:  ~104MB → ギリギリ
```

### 8.2 チャンクの遅延破棄

再生位置から大きく離れたチャンクのバッファを破棄し、メモリを回収する。

```
再生位置: C8

  保持: C6 C7 [C8] C9 C10 C11 C12 C13
        ←後方2→  現在  ←───前方5──────→

  破棄: C0 C1 C2 C3 C4 C5              C14 C15 ...
        state は "ready" のまま、outputBuffer を null に
        → 再度必要になったら再変換（state は "pending" に戻さない。
          "evicted" という新しい状態を使い、再変換時に "ready" に戻る）

保持範囲の算出:
  前方: max(5チャンク, 150秒分)   ← 通常再生で十分な先読み
  後方: max(2チャンク, 60秒分)    ← 短い巻き戻しに対応
```

```ts
const KEEP_AHEAD_CHUNKS = 5;
const KEEP_AHEAD_SECONDS = 150;
const KEEP_BEHIND_CHUNKS = 2;
const KEEP_BEHIND_SECONDS = 60;

function evictDistantChunks(currentIndex: number): void {
  const aheadLimit = Math.max(
    currentIndex + KEEP_AHEAD_CHUNKS,
    this.secondsToChunkIndex(currentIndex, KEEP_AHEAD_SECONDS)
  );
  const behindLimit = Math.max(
    0,
    Math.min(
      currentIndex - KEEP_BEHIND_CHUNKS,
      this.secondsToChunkIndex(currentIndex, -KEEP_BEHIND_SECONDS)
    )
  );

  for (const chunk of this.chunks) {
    if (chunk.outputBuffer &&
        (chunk.index > aheadLimit || chunk.index < behindLimit)) {
      chunk.outputBuffer = null;
      chunk.state = "evicted";
    }
  }
}
```

### 8.3 チャンク状態遷移の完全版

```
                  enqueue()            Worker完了
   PENDING ──────────────→ QUEUED ──────────→ CONVERTING ──────→ READY
      ↑          cancel()    ↑                    │                │
      │      ┌───────────────┘                    │ error          │ メモリ圧迫
      │      │                                    ▼                ▼
      │   SKIPPED                              FAILED          EVICTED
      │                                          │                │
      │                                    retry (≤3)        再度必要
      │                                          │                │
      └──────────────────────────────────────────┘────────────────┘
                          re-enqueue
```

---

## 9. エラー耐性

### 9.1 Worker クラッシュからの回復

```ts
class WorkerManager {
  private worker: Worker | null = null;
  private crashCount = 0;
  private readonly maxCrashes = 3;

  private createWorker(): Worker {
    const w = new Worker(this.workerUrl);

    w.onerror = (e) => {
      this.crashCount++;
      this.activeConversion?.setState("failed");

      if (this.crashCount <= this.maxCrashes) {
        // Worker を再生成してキューを再開
        this.worker = this.createWorker();
        this.scheduler.retryFailed();
        this.emit("error", {
          type: "worker-crash",
          message: `Worker crashed (${this.crashCount}/${this.maxCrashes}), restarting`,
          fatal: false,
        });
      } else {
        // 回復不能 → ユーザーに通知
        this.emit("error", {
          type: "worker-crash",
          message: "Worker crashed too many times",
          fatal: true,
        });
      }
    };

    return w;
  }
}
```

### 9.2 チャンク変換のリトライ

```ts
handleChunkError(chunkIndex: number, error: Error): void {
  const chunk = this.chunks[chunkIndex];
  chunk.retryCount++;

  if (chunk.retryCount <= 3) {
    // パラメータを調整してリトライ
    // 例: FFT サイズを小さくする、tolerance を狭める
    chunk.state = "pending";
    this.scheduler.enqueueWithHighPriority(chunk);
  } else {
    chunk.state = "failed";
    // 隣接チャンクで補完を試みる
    // 最悪の場合: この区間はピッチ変化ありの通常再生にフォールバック
    this.handleUnrecoverableChunk(chunkIndex);
  }
}
```

---

## 10. 実装フェーズ（改訂版）

前提: 方式 B（オフライン）のみに集中。方式 A（リアルタイム AudioWorklet）は将来の拡張。

### Phase 1: 基盤（4日）

| タスク | 成果物 |
|--------|--------|
| 1-1. Web Worker インフラ | Worker 生成、Blob URL、MessagePort 通信の基盤 |
| 1-2. チャンク分割ロジック | バッファ → チャンク配列。オーバーラップ計算。位置マッピング |
| 1-3. 優先度キュー | 距離ベースの優先度計算、動的再構築 |
| 1-4. WSOLA コア | Worker 内で動作する一括変換。相互相関の高速化 |
| 1-5. チャンク結合 | クロスフェード接合。出力バッファの構築 |

**完了基準:** 30秒チャンクの WSOLA 変換が Worker 上で動作。変換結果を AudioBuffer に復元して再生できる。

### Phase 2: プログレッシブ再生（4日）

| タスク | 成果物 |
|--------|--------|
| 2-1. ConversionScheduler | 優先度順の自動変換、seek 時のキュー再構築 |
| 2-2. ChunkPlayer | ダブルバッファリング、ギャップレス再生、先読みスケジューリング |
| 2-3. 状態遷移エンジン | WAITING → PLAYING → BUFFERING の遷移。ヒステリシス |
| 2-4. バッファ健全性モニター | aheadSeconds 計算、health 判定、underrun 検出 |

**完了基準:** 60分の音源で tempo 変更 → 0.3秒以内に再生開始。バッファ枯渇時に自動的に BUFFERING → 復帰。

### Phase 3: ステータス & イベント（3日）

| タスク | 成果物 |
|--------|--------|
| 3-1. StretcherStatus 構造体 | 全ステータスの集約 |
| 3-2. イベントエミッター統合 | progress, bufferhealth, buffering, buffered, complete, error |
| 3-3. スナップショット拡張 | PlaybackSnapshot への stretcher フィールド追加 |
| 3-4. 推定残り時間 | ConversionEstimator（移動平均ベース） |

**完了基準:** React の useSyncExternalStore で全ステータスが UI に反映される。

### Phase 4: play() API 統合（3日）

| タスク | 成果物 |
|--------|--------|
| 4-1. `preservePitch` オプション | play() 内部でのプログレッシブ変換エンジンの起動 |
| 4-2. setPlaybackRate() の非同期化 | tempo 変更 → BUFFERING → 再開のフロー |
| 4-3. seek の統合 | チャンク単位の seek + チャンク内オフセット再生 |
| 4-4. pause / resume / stop | チャンクプレイヤーとの状態同期 |
| 4-5. dispose | Worker 終了、Blob URL revoke、バッファ解放 |

**完了基準:** `play(ctx, buffer, { preservePitch: true })` のフルライフサイクルが動作。既存テスト回帰なし。

### Phase 5: Phase Vocoder & 高品質オプション（4日）

| タスク | 成果物 |
|--------|--------|
| 5-1. Radix-4 FFT | Worker 内で動作する軽量 FFT |
| 5-2. Phase Vocoder + IPL | 一括変換バージョン。オフラインなので大きな FFT サイズ使用可 |
| 5-3. アルゴリズム選択 | `algorithm: "wsola" | "phase-vocoder"` の切り替え |
| 5-4. 品質比較テスト | サイン波・音楽・音声での A/B 比較用テストハーネス |

### Phase 6: 最適化 & 堅牢化（3日）

| タスク | 成果物 |
|--------|--------|
| 6-1. メモリ管理 | チャンクの遅延破棄（eviction）、保持範囲の動的調整 |
| 6-2. 1世代キャッシュ | 直前の tempo のバッファ保持・復元 |
| 6-3. Worker クラッシュ回復 | 自動リスタート、リトライロジック |
| 6-4. モバイル最適化 | メモリバジェット検出、チャンクサイズの自動調整 |
| 6-5. ドキュメント | API リファレンス、UI 統合ガイド、パフォーマンスチューニング |

---

## 11. 成功指標

| 指標 | 目標値 |
|------|--------|
| 初回チャンク変換時間（WSOLA, 30秒チャンク） | ≤ 50ms |
| 初回チャンク変換時間（PV, 30秒チャンク） | ≤ 500ms |
| tempo 変更から再生開始まで | ≤ 1秒（WSOLA）、≤ 2秒（PV） |
| 再生中の CPU 負荷 | ~0%（通常の AudioBufferSourceNode） |
| BUFFERING 発生頻度（3分音源、WSOLA） | 0回 |
| BUFFERING 発生頻度（60分音源、WSOLA） | 0回 |
| BUFFERING 発生頻度（60分音源、PV） | ≤ 1回（初回 tempo 変更時のみ） |
| seek → 再生再開 | ≤ 100ms（チャンクが ready の場合） |
| メモリ使用量（60分ステレオ、キャッシュ込み） | ≤ 80MB |
| 周波数精度（440Hz サイン波、1.5x tempo） | ±2Hz 以内 |