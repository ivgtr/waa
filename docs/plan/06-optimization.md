# Phase 6: 最適化 & 堅牢化

> 設計書参照: §4.3（tempo キャッシュ）、§8（メモリ管理）、§9（エラー耐性）
> 前提: Phase 5 完了（Phase Vocoder 動作、アルゴリズム切替可能）

## 完了基準

60分ステレオ音源でメモリ使用量 ≤ 80MB（キャッシュ込み）。Worker クラッシュからの自動回復。

---

## 6-1. メモリ管理（チャンク遅延破棄）

**ファイル:** `src/stretcher/memory-manager.ts`
**設計書:** §8.1, §8.2, §8.3

### API

```ts
export class MemoryManager {
  constructor(options?: {
    keepAheadChunks?: number;     // @default 5
    keepAheadSeconds?: number;    // @default 150
    keepBehindChunks?: number;    // @default 2
    keepBehindSeconds?: number;   // @default 60
  });

  /**
   * 再生位置から離れたチャンクの outputBuffer を破棄（§8.2）
   *
   * 保持範囲:
   *   前方: max(keepAheadChunks, keepAheadSeconds 分のチャンク数)
   *   後方: max(keepBehindChunks, keepBehindSeconds 分のチャンク数)
   *
   * 範囲外のチャンク: outputBuffer = null, state = "evicted"
   */
  evictDistantChunks(
    chunks: ChunkInfo[],
    currentIndex: number,
    chunkDurationSec: number,
  ): number;  // 返り値: 破棄したチャンク数

  /**
   * 推定メモリ使用量を計算（bytes）
   */
  estimateMemoryUsage(
    chunks: ChunkInfo[],
    numberOfChannels: number,
  ): number;
}
```

### 保持範囲の設計（§8.2）

```
再生位置: C8

  保持: C6 C7 [C8] C9 C10 C11 C12 C13
        ←後方2→  現在  ←───前方5──────→

  破棄: C0 C1 C2 C3 C4 C5              C14 C15 ...
        state = "evicted", outputBuffer = null

保持範囲の算出:
  前方: max(5チャンク, 150秒分)   ← 通常再生で十分な先読み
  後方: max(2チャンク, 60秒分)    ← 短い巻き戻しに対応
```

### evicted チャンクの再変換

evicted チャンクが再度必要になった場合（巻き戻しやシーク）:
1. `state` が `"evicted"` のチャンクを検出
2. `"pending"` に状態遷移
3. ConversionScheduler のキューに投入
4. 通常の変換フローで `"ready"` に遷移

### テスト (`tests/memory-manager.test.ts`)

```
- 20チャンク, currentIndex=10 → C0-C7 と C16-C19 が evicted
- currentIndex=0 → 後方は破棄なし
- currentIndex=19 → 前方は破棄なし
- evict 後の返り値が正しいチャンク数
- 保持範囲の計算: 30秒チャンク × 5 = 150秒分
- estimateMemoryUsage: ready チャンクの合計バイト数
```

---

## 6-2. 1世代 tempo キャッシュ

**ファイル:** `src/stretcher/memory-manager.ts`（同ファイルに追加）
**設計書:** §4.3

### API 拡張

```ts
export class MemoryManager {
  // ... 6-1 の API に加えて ...

  /**
   * 現在の tempo のバッファを前世代キャッシュに退避（§4.3）
   *
   * 直前の tempo のバッファのみ保持（1世代）。
   * 2世代以上はメモリコストに見合わないため破棄。
   *
   * 理由: ユーザーは「やっぱり元の速度に戻す」操作を頻繁に行う
   */
  cacheTempo(chunks: ChunkInfo[], tempo: number): void;

  /**
   * 前の tempo に戻す場合にキャッシュから即時復元
   *
   * @returns 復元した ChunkInfo[] | null（キャッシュがない場合）
   */
  restoreTempo(targetTempo: number): ChunkInfo[] | null;

  /** キャッシュをクリア */
  clearCache(): void;

  /** キャッシュされている tempo（なければ null） */
  get cachedTempo(): number | null;
}
```

### メモリバジェット（§8.1）

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

### StretcherEngine への統合

```ts
// StretcherEngine.setTempo() 内で:
setTempo(newTempo: number): void {
  // 1. 前の tempo にキャッシュから復元を試みる
  const cached = this.memoryManager.restoreTempo(newTempo);
  if (cached) {
    // 即時復元 → PLAYING に遷移
    this.chunks = cached;
    this.setPlaybackState("playing");
    return;
  }

  // 2. 現在のバッファをキャッシュに退避
  this.memoryManager.cacheTempo(this.chunks, this.currentTempo);

  // 3. 全チャンクをリセット → 再変換
  this.chunkManager.resetAll();
  this.scheduler.handleTempoChange(newTempo, this.currentChunkIndex);
  this.setPlaybackState("buffering");
}
```

### テスト

```
- cacheTempo → キャッシュに保存される
- restoreTempo(同じ tempo) → チャンクが復元される
- restoreTempo(異なる tempo) → null
- 2回 cacheTempo → 最初のキャッシュが破棄される（1世代のみ）
- clearCache → cachedTempo === null
```

---

## 6-3. Worker クラッシュ回復の強化

**ファイル:** `src/stretcher/worker-manager.ts`（変更）
**設計書:** §9.1, §9.2

### 強化内容

Phase 2 で基本的なクラッシュ回復を実装済み。Phase 6 では以下を追加:

1. **指数バックオフ:**
   ```
   1回目のリスタート: 即時
   2回目: 500ms 後
   3回目: 2000ms 後
   4回目以降: fatal error
   ```

2. **チャンク変換のパラメータ調整リトライ（§9.2）:**
   ```
   1回目リトライ: 同じパラメータ
   2回目リトライ: FFT サイズを半分に（PV の場合）
   3回目リトライ: WSOLA にフォールバック（PV の場合）
   4回目以降: failed → フォールバック再生
   ```

3. **フォールバック再生:**
   回復不能なチャンクがある場合、その区間はピッチ変化ありの通常再生にフォールバック:
   ```ts
   handleUnrecoverableChunk(chunkIndex: number): void {
     // 元バッファの該当区間をそのまま出力バッファにコピー
     // （ピッチは変わるが、無音よりはマシ）
     const chunk = this.chunks[chunkIndex];
     chunk.outputBuffer = this.chunkManager.extractInputChunk(chunkIndex);
     chunk.outputLength = chunk.outputBuffer[0].length;
     chunk.state = "ready";
   }
   ```

---

## 6-4. モバイル最適化

### メモリバジェット検出

```ts
function detectMemoryBudget(): number {
  // navigator.deviceMemory: デバイスの RAM（GB）
  // 利用可能な場合のみ使用
  if (typeof navigator !== "undefined" && "deviceMemory" in navigator) {
    const deviceGB = (navigator as any).deviceMemory as number;
    // デバイス RAM の 10% を上限とする
    return deviceGB * 1024 * 1024 * 1024 * 0.1;
  }

  // フォールバック: 150MB
  return 150 * 1024 * 1024;
}
```

### チャンクサイズの動的調整

```ts
function autoChunkDuration(memoryBudget: number, bufferSizeBytes: number): number {
  // バッファが大きくてメモリが少ない場合、チャンクサイズを縮小
  if (bufferSizeBytes > memoryBudget * 0.3) {
    return 15;  // 15秒チャンク
  }
  return 30;    // 30秒チャンク（デフォルト）
}
```

### 保持チャンク数の動的調整

メモリ圧迫時に保持範囲を縮小:

```ts
function autoKeepAhead(memoryBudget: number, currentUsage: number): number {
  const ratio = currentUsage / memoryBudget;
  if (ratio > 0.8) return 2;   // メモリ圧迫: 最小保持
  if (ratio > 0.6) return 3;   // 注意: 縮小保持
  return 5;                     // 通常
}
```

---

## 6-5. StretcherEngine への統合

Phase 6 の各コンポーネントを StretcherEngine に統合:

```ts
// StretcherEngine の constructor に追加
this.memoryManager = new MemoryManager({
  keepAheadChunks: autoKeepAhead(memoryBudget, 0),
  // ...
});

// チャンク変換完了時にメモリ管理
engine.on("chunkready", () => {
  this.memoryManager.evictDistantChunks(
    this.chunks,
    this.currentChunkIndex,
    this.chunkDurationSec,
  );
});
```

---

## Phase 6 の実装順序

```
22. src/stretcher/memory-manager.ts    ← types に依存
    + tests/memory-manager.test.ts
23. MemoryManager に 1世代キャッシュ追加
24. worker-manager.ts の強化（指数バックオフ、パラメータ調整リトライ）
25. モバイル最適化（メモリバジェット検出、動的チャンクサイズ）
26. StretcherEngine への統合
```

ステップ 22〜24 は並行して実装可能。
ステップ 25〜26 は 22〜24 に依存。
