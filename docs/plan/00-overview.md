# プログレッシブ変換エンジン — 実装計画 概要

## 参照ドキュメント

- 設計書: [`docs/progressive-conversion-engine.md`](../progressive-conversion-engine.md)

---

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

| ファイル | 変更内容 | Phase |
|---------|---------|-------|
| `src/types.ts` | `PlayOptions` に `preservePitch`, `algorithm` 追加。`PlaybackSnapshot` に `stretcher?` フィールド追加 | 3, 4 |
| `src/play.ts` | `preservePitch: true` 時のプログレッシブ変換パスを追加 | 4 |
| `src/adapters.ts` | `getSnapshot()` で `stretcher` フィールドを返す | 3 |
| `src/index.ts` | Stretcher 関連の型・関数をエクスポート | 4 |
| `tsup.config.ts` | `stretcher` エントリーポイントを追加 | 4 |
| `package.json` | `./stretcher` エクスポートを追加 | 4 |

---

## Phase 一覧

| Phase | タイトル | 概要 | 詳細 |
|-------|---------|------|------|
| 1 | 基盤 | WSOLA コア、Worker インフラ、チャンク分割、優先度キュー | [01-foundation.md](./01-foundation.md) |
| 2 | プログレッシブ再生 | 変換スケジューラ、ChunkPlayer、バッファ健全性、Worker 管理 | [02-progressive-playback.md](./02-progressive-playback.md) |
| 3 | ステータス & イベント | 推定残り時間、StretcherEngine 統合、Snapshot 拡張 | [03-status-events.md](./03-status-events.md) |
| 4 | play() API 統合 | PlayOptions 拡張、preservePitch パス、adapters 拡張 | [04-play-api-integration.md](./04-play-api-integration.md) |
| 5 | Phase Vocoder & 高品質 | FFT、PV+IPL、アルゴリズム切替 | [05-phase-vocoder.md](./05-phase-vocoder.md) |
| 6 | 最適化 & 堅牢化 | メモリ管理、1世代キャッシュ、モバイル最適化 | [06-optimization.md](./06-optimization.md) |

---

## 実装順序（依存関係に基づくトポロジカルソート）

```
Phase 1（依存なし → 上流）:
  1. src/stretcher/types.ts
  2. src/workers/wsola.ts              + tests/wsola.test.ts
  3. src/stretcher/priority-queue.ts   + tests/priority-queue.test.ts
  4. src/stretcher/chunk-manager.ts    + tests/chunk-manager.test.ts
  5. src/workers/stretch-worker.ts

Phase 2（Phase 1 に依存）:
  6.  src/stretcher/worker-manager.ts
  7.  src/stretcher/buffer-health.ts          + tests/buffer-health.test.ts
  8.  src/stretcher/conversion-estimator.ts   + tests/conversion-estimator.test.ts
  9.  src/stretcher/conversion-scheduler.ts   + tests/conversion-scheduler.test.ts
  10. src/stretcher/chunk-player.ts

Phase 3（Phase 2 に依存）:
  11. src/stretcher/memory-manager.ts   + tests/memory-manager.test.ts
  12. src/stretcher/stretcher.ts        + tests/stretcher.test.ts
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
├── emitter.test.ts              ← 既存
├── wsola.test.ts                ← Phase 1
├── priority-queue.test.ts       ← Phase 1
├── chunk-manager.test.ts        ← Phase 1
├── buffer-health.test.ts        ← Phase 2
├── conversion-estimator.test.ts ← Phase 2
├── conversion-scheduler.test.ts ← Phase 2
├── memory-manager.test.ts       ← Phase 3
└── stretcher.test.ts            ← Phase 3
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
