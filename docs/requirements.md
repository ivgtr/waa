# waa — 要件定義書・実装計画書

## 1. プロジェクト概要

**プロジェクト名:** waa
**パッケージ名:** `waa`
**概要:** Composable Web Audio API ユーティリティライブラリ
**ライセンス:** MIT

### 1.1 解決する課題

既存のオーディオライブラリ（Howler.js, Tone.js 等）が抱える以下の構造的問題を解決する。

- **AudioContext の囲い込み:** ライブラリが内部で AudioContext を生成・管理し、他ライブラリとの共有が困難
- **重い依存関係:** バンドルサイズの肥大化、Tree-shaking 不可
- **フレームワーク固定:** React 専用、Vue 専用など特定フレームワークへのロックイン
- **精度の問題:** HTML5 `<audio>` の `currentTime` はコーデック依存でミリ秒単位のずれが生じる

### 1.2 設計原則

| 原則 | 制約 |
|------|------|
| BYO AudioContext | コンストラクタ引数として外部から注入。内部で `new AudioContext()` しない（`createContext` ヘルパーは提供） |
| Composable | モノリシックな Player クラスを持たない。全機能が独立関数として提供される |
| Zero Dependencies | `dependencies` は空。`devDependencies` のみ許容 |
| Framework-agnostic | コアに React/Vue/Svelte 等のインポートを含めない |
| Sample-accurate | 再生位置は `AudioContext.currentTime` ベースで追跡 |
| Tree-shakeable | 全てを named export し、副作用のあるトップレベルコードを含めない |

---

## 2. 要件定義

### 2.1 機能要件

#### M1: `context` モジュール — AudioContext ユーティリティ

| ID | 要件 | 優先度 |
|----|------|--------|
| CTX-01 | `createContext(options?)` で AudioContext を生成。`sampleRate`, `latencyHint` をオプションで受け付ける | Must |
| CTX-02 | `resumeContext(ctx)` でブラウザの自動再生ポリシーに対応（suspended → running） | Must |
| CTX-03 | `ensureRunning(ctx)` で状態を確認し、必要に応じて resume する | Should |
| CTX-04 | `now(ctx)` で `ctx.currentTime` を返す（短縮ヘルパー） | Could |

#### M2: `buffer` モジュール — 音声ファイル読み込み

| ID | 要件 | 優先度 |
|----|------|--------|
| BUF-01 | `loadBuffer(ctx, url, options?)` で URL から AudioBuffer をデコード。`onProgress` コールバック対応 | Must |
| BUF-02 | `loadBufferFromBlob(ctx, blob)` で File/Blob から AudioBuffer を生成 | Must |
| BUF-03 | `loadBuffers(ctx, map)` で複数ファイルを並列ロードし `Map<string, AudioBuffer>` を返す | Should |
| BUF-04 | `getBufferInfo(buffer)` で duration, numberOfChannels, sampleRate, length を返す | Could |

#### M3: `play` モジュール — 再生エンジン（コア）

| ID | 要件 | 優先度 |
|----|------|--------|
| PLY-01 | `play(ctx, buffer, options?)` で Playback オブジェクトを返す | Must |
| PLY-02 | オプション: `offset`, `loop`, `loopStart`, `loopEnd`, `playbackRate`, `through`, `destination`, `timeupdateInterval` | Must |
| PLY-03 | 状態管理: `"playing"`, `"paused"`, `"stopped"` の3状態を遷移 | Must |
| PLY-04 | `getCurrentTime()` — AudioContext.currentTime ベースの正確な再生位置 | Must |
| PLY-05 | `getDuration()`, `getProgress()` — バッファ長と進捗率 | Must |
| PLY-06 | `pause()`, `resume()`, `togglePlayPause()` — 再生制御 | Must |
| PLY-07 | `seek(position)` — 任意位置へのシーク | Must |
| PLY-08 | `setPlaybackRate(rate)` — 再生速度変更 | Should |
| PLY-09 | `setLoop(boolean)` — ループ切り替え | Should |
| PLY-10 | `stop()` — 完全停止 | Must |
| PLY-11 | `dispose()` — リソース解放 | Must |
| PLY-12 | イベント: `play`, `pause`, `resume`, `seek`, `timeupdate`, `statechange`, `ended`, `loop` | Must |

#### M4: `emitter` モジュール — イベントエミッター

| ID | 要件 | 優先度 |
|----|------|--------|
| EMT-01 | 軽量な型安全イベントエミッターを内部実装。`on`, `off`, `emit` を提供 | Must |
| EMT-02 | `on()` は unsubscribe 関数を返す | Must |

#### M5: `nodes` モジュール — オーディオグラフ構築

| ID | 要件 | 優先度 |
|----|------|--------|
| NOD-01 | `createGain(ctx, initialValue?)` — GainNode を生成して返す（ラッパーなし、素のノード） | Must |
| NOD-02 | `rampGain(gain, target, duration)` — `linearRampToValueAtTime` によるクリック防止ボリューム変更 | Must |
| NOD-03 | `createAnalyser(ctx, options?)` — AnalyserNode 生成 | Should |
| NOD-04 | `getFrequencyData(analyser)` / `getFrequencyDataByte(analyser)` — Float32Array / Uint8Array で周波数データ取得 | Should |
| NOD-05 | `createFilter(ctx, options?)` — BiquadFilterNode 生成 | Should |
| NOD-06 | `createPanner(ctx, pan?)` — StereoPannerNode 生成 | Could |
| NOD-07 | `createCompressor(ctx, options?)` — DynamicsCompressorNode 生成 | Could |
| NOD-08 | `chain(...nodes)` / `disconnectChain(...nodes)` — ノードの直列接続・切断 | Must |

#### M6: `waveform` モジュール — 波形データ抽出

| ID | 要件 | 優先度 |
|----|------|--------|
| WAV-01 | `extractPeaks(buffer, options?)` — 指定 resolution でピーク値配列を返す（0〜1） | Should |
| WAV-02 | `extractPeakPairs(buffer, options?)` — min/max ペアで詳細な波形データを返す | Could |
| WAV-03 | `extractRMS(buffer, options?)` — RMS（知覚ラウドネス）データを返す。`channel` オプションで全チャンネル平均対応 | Could |

#### M7: `fade` モジュール — フェードユーティリティ

| ID | 要件 | 優先度 |
|----|------|--------|
| FAD-01 | `fadeIn(gain, target, options?)` — duration, curve 指定でフェードイン | Should |
| FAD-02 | `fadeOut(gain, options?)` — フェードアウト | Should |
| FAD-03 | `crossfade(gainA, gainB, options?)` — 2つの GainNode 間のクロスフェード | Should |
| FAD-04 | `autoFade(playback, gain, options?)` — Playback に連動した自動フェードイン・アウト。cleanup 関数を返す | Could |
| FAD-05 | curve オプション: `"linear"`, `"exponential"`, `"equal-power"` | Should |

#### M8: `scheduler` & `clock` モジュール — 精密タイミング

| ID | 要件 | 優先度 |
|----|------|--------|
| SCH-01 | `createScheduler(ctx, options?)` — lookahead ベースのイベントスケジューラー | Could |
| SCH-02 | `scheduler.schedule(id, time, callback)` — 指定時刻にコールバック実行 | Could |
| SCH-03 | `createClock(ctx, options?)` — BPM ベースのクロック | Could |
| SCH-04 | `clock.beatToTime(beat)`, `clock.getCurrentBeat()`, `clock.getNextBeatTime()` | Could |

#### M9: `synth` モジュール — バッファ合成

| ID | 要件 | 優先度 |
|----|------|--------|
| SYN-01 | `createSineBuffer(ctx, frequency, duration)` — テストトーン生成 | Could |
| SYN-02 | `createNoiseBuffer(ctx, duration)` — ホワイトノイズ生成 | Could |
| SYN-03 | `createClickBuffer(ctx, frequency, duration)` — クリック音生成 | Could |

#### M10: `adapters` モジュール — フレームワーク連携

| ID | 要件 | 優先度 |
|----|------|--------|
| ADP-01 | `subscribeSnapshot(playback, callback)` — 外部ストアパターン対応。unsubscribe 関数を返す | Must |
| ADP-02 | `getSnapshot(playback)` — `{ state, position, duration, progress }` のイミュータブルスナップショットを返す | Must |
| ADP-03 | `onFrame(playback, callback)` — rAF ベースのフレームコールバック。stop 関数を返す | Should |
| ADP-04 | `whenEnded(playback)` — Promise ベースの再生完了待機 | Should |
| ADP-05 | `whenPosition(playback, position)` — Promise ベースの特定位置到達待機 | Could |

### 2.2 非機能要件

| ID | 要件 | 基準 |
|----|------|------|
| NF-01 | バンドルサイズ | 全モジュール込みで gzip 後 5KB 以下 |
| NF-02 | Tree-shaking | 未使用モジュールがバンドルに含まれないことを検証 |
| NF-03 | ブラウザ対応 | Chrome 90+, Firefox 90+, Safari 15+, Edge 90+ |
| NF-04 | TypeScript | 完全な型定義。`strict: true` |
| NF-05 | テスト | 主要モジュール（play, buffer, nodes）のユニットテスト |
| NF-06 | ドキュメント | TSDoc + README のコード例で API を文書化 |

---

## 3. 技術設計

### 3.1 プロジェクト構成

```
waa/
├── src/
│   ├── index.ts              # メインエントリ（re-export）
│   ├── context.ts            # M1: AudioContext ユーティリティ
│   ├── buffer.ts             # M2: 音声ロード
│   ├── play.ts               # M3: 再生エンジン
│   ├── emitter.ts            # M4: イベントエミッター
│   ├── nodes.ts              # M5: ノードファクトリ
│   ├── waveform.ts           # M6: 波形抽出
│   ├── fade.ts               # M7: フェード
│   ├── scheduler.ts          # M8: スケジューラー & クロック
│   ├── synth.ts              # M9: バッファ合成
│   ├── adapters.ts           # M10: フレームワーク連携
│   └── types.ts              # 共通型定義
├── tests/
│   ├── context.test.ts
│   ├── buffer.test.ts
│   ├── play.test.ts
│   ├── emitter.test.ts
│   ├── nodes.test.ts
│   └── adapters.test.ts
├── package.json
├── tsconfig.json
├── tsup.config.ts            # ビルド設定
└── README.md
```

### 3.2 ビルド・パッケージ戦略

**ビルドツール:** tsup（esbuild ベース、ESM/CJS デュアル出力）

```jsonc
// package.json（抜粋）
{
  "name": "waa",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    },
    "./playback": { "import": "./dist/play.js", "types": "./dist/play.d.ts" },
    "./buffer":   { "import": "./dist/buffer.js", "types": "./dist/buffer.d.ts" },
    "./waveform": { "import": "./dist/waveform.js", "types": "./dist/waveform.d.ts" }
    // ... 各サブパスエントリ
  },
  "sideEffects": false,
  "files": ["dist"],
  "dependencies": {},
  "devDependencies": {
    "tsup": "^8.x",
    "typescript": "^5.x",
    "vitest": "^2.x"
  }
}
```

### 3.3 コアアーキテクチャ — Playback オブジェクト

再生エンジンの中核となる `play()` の内部設計。AudioBufferSourceNode は `pause()` 後に再利用不可なため、seek/resume の度に新しいノードを生成する。

```
play(ctx, buffer, options)
  │
  ├── 内部状態
  │   ├── state: "playing" | "paused" | "stopped"
  │   ├── startedAt: number      ← ctx.currentTime at play/resume
  │   ├── pausedAt: number       ← 一時停止時の再生位置
  │   ├── sourceNode: AudioBufferSourceNode | null
  │   └── timeupdateTimer: number | null
  │
  ├── getCurrentTime() の計算
  │   ├── playing → (ctx.currentTime - startedAt) * playbackRate + offset
  │   ├── paused  → pausedAt
  │   └── stopped → 0
  │
  ├── pause()
  │   ├── pausedAt = getCurrentTime()
  │   ├── sourceNode.stop()
  │   ├── sourceNode = null
  │   └── emit("pause")
  │
  ├── resume()
  │   ├── 新しい AudioBufferSourceNode を生成
  │   ├── through チェーンに接続
  │   ├── sourceNode.start(0, pausedAt)
  │   ├── startedAt = ctx.currentTime - pausedAt
  │   └── emit("resume")
  │
  └── seek(position)
      ├── wasPlaying = state === "playing"
      ├── sourceNode?.stop()
      ├── 新しい sourceNode を生成 & start(0, position)
      └── emit("seek")
```

### 3.4 timeupdate の実装

`setInterval` + `AudioContext.currentTime` のハイブリッド方式。rAF ではバックグラウンドタブで停止するため、setInterval を採用し、精度は AudioContext のハードウェアクロックで担保する。

```
timeupdateInterval (default: 50ms)
  │
  setInterval(() => {
    if (state !== "playing") return;
    const position = getCurrentTime();  // AudioContext.currentTime ベース
    emit("timeupdate", { position, duration });
  }, timeupdateInterval)
```

UI 同期用に高頻度（16ms ≈ 60fps）が必要な場合は `onFrame()` アダプターで rAF を使用。

---

## 4. 実装計画

### Phase 1: 基盤（Week 1）

コアインフラと最小限の再生機能。これだけで基本的な音声再生が可能になる。

| タスク | 対象モジュール | 成果物 |
|--------|---------------|--------|
| 1-1. プロジェクト初期化 | — | tsup + TypeScript + Vitest の設定 |
| 1-2. 型定義 | `types.ts` | `Playback`, `PlayOptions`, `PlaybackState`, `PlaybackSnapshot` 等 |
| 1-3. イベントエミッター | `emitter.ts` | 型安全な `createEmitter<Events>()` + テスト |
| 1-4. AudioContext ユーティリティ | `context.ts` | `createContext`, `resumeContext`, `now` |
| 1-5. バッファロード | `buffer.ts` | `loadBuffer`, `loadBufferFromBlob`, `loadBuffers` + テスト |
| 1-6. 再生エンジン | `play.ts` | `play()` — 全状態遷移、イベント、timeupdate + テスト |

**Phase 1 完了基準:** `createContext → loadBuffer → play → pause → seek → resume → stop` のフルサイクルが動作

### Phase 2: オーディオグラフ（Week 2）

ノード操作とフェード。音量制御・エフェクト・ビジュアライゼーションが可能になる。

| タスク | 対象モジュール | 成果物 |
|--------|---------------|--------|
| 2-1. ノードファクトリ | `nodes.ts` | `createGain`, `rampGain`, `createAnalyser`, `createFilter`, `chain` + テスト |
| 2-2. フェード | `fade.ts` | `fadeIn`, `fadeOut`, `crossfade`, `autoFade` |
| 2-3. `play()` の `through` オプション統合テスト | — | ノードチェーン経由の再生が正しく動作することを確認 |

**Phase 2 完了基準:** `play(ctx, buffer, { through: [gain, analyser] })` + フェードイン・アウトが動作

### Phase 3: アダプター & 波形（Week 3）

フレームワーク連携と波形データ。UI 統合が可能になる。

| タスク | 対象モジュール | 成果物 |
|--------|---------------|--------|
| 3-1. スナップショット | `adapters.ts` | `subscribeSnapshot`, `getSnapshot` + テスト |
| 3-2. フレームコールバック | `adapters.ts` | `onFrame`, `whenEnded`, `whenPosition` |
| 3-3. 波形抽出 | `waveform.ts` | `extractPeaks`, `extractPeakPairs`, `extractRMS` |
| 3-4. React/Vue/Svelte サンプルコード | README | 各フレームワークでの使用例を文書化 |

**Phase 3 完了基準:** `useSyncExternalStore` + `getSnapshot` で React コンポーネントが動作

### Phase 4: 拡張機能（Week 4）

スケジューラー、クロック、シンセ。BPM 同期やプログラマティックなサウンド生成が可能になる。

| タスク | 対象モジュール | 成果物 |
|--------|---------------|--------|
| 4-1. スケジューラー | `scheduler.ts` | `createScheduler` |
| 4-2. BPM クロック | `scheduler.ts` | `createClock` |
| 4-3. バッファ合成 | `synth.ts` | `createSineBuffer`, `createNoiseBuffer`, `createClickBuffer` |

### Phase 5: パッケージング & リリース（Week 5）

| タスク | 成果物 |
|--------|--------|
| 5-1. サブパスエクスポート設定 | `package.json` の `exports` フィールド |
| 5-2. バンドルサイズ検証 | `size-limit` で 5KB 以下を CI で検証 |
| 5-3. Tree-shaking 検証 | webpack/rollup でのバンドル結果を確認 |
| 5-4. README 最終化 | API リファレンス + Quick Start + Architecture 図 |
| 5-5. npm publish | v0.1.0 初回リリース |

---

## 5. リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| AudioBufferSourceNode が再利用不可 | pause/resume の実装複雑化 | 再生位置を正確に記録し、resume 時に新ノードを生成するパターンで統一 |
| ブラウザの自動再生ポリシー | 初回再生がブロックされる | `resumeContext` を提供し、ユーザーインタラクション時に呼ぶガイドを文書化 |
| Safari の Web Audio API 実装差異 | 一部 API の挙動が異なる | Safari 15+ で統合テストを実施。`webkitAudioContext` フォールバック不要（Safari 14.1+ で標準化済み） |
| timeupdate の精度 vs パフォーマンス | 高頻度タイマーが CPU を消費 | デフォルト 50ms、UI 同期用は `onFrame()` で rAF を分離 |

---

## 6. 成功指標

| 指標 | 目標値 |
|------|--------|
| バンドルサイズ（全モジュール, gzip） | ≤ 5KB |
| バンドルサイズ（play + buffer のみ, gzip） | ≤ 2KB |
| テストカバレッジ（コアモジュール） | ≥ 80% |
| TypeScript strict mode | エラー 0 |
| npm dependencies | 0 |
