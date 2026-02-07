# Phase 4: play() API 統合

> 設計書参照: §7（再生エンジンとの結合）、§10 Phase 4
> 前提: Phase 3 完了（StretcherEngine, PlaybackSnapshot 拡張, adapters 拡張）

## 完了基準

`play(ctx, buffer, { preservePitch: true })` のフルライフサイクルが動作。既存テスト回帰なし。

---

## 4-1. PlayOptions 拡張

**ファイル:** `src/types.ts`（既存ファイルの変更）

### 変更内容

```ts
export interface PlayOptions {
  // 既存（変更なし）
  offset?: number;
  loop?: boolean;
  loopStart?: number;
  loopEnd?: number;
  playbackRate?: number;
  through?: AudioNode[];
  destination?: AudioNode;
  timeupdateInterval?: number;

  // 新規
  /**
   * true の場合、playbackRate による速度変更時にピッチを保持する。
   * 内部でプログレッシブ変換エンジン（WSOLA / Phase Vocoder）を使用。
   * @default false
   */
  preservePitch?: boolean;

  /**
   * Time-Stretch アルゴリズムの選択。preservePitch: true の場合のみ有効。
   * - "wsola": 高速・低遅延。音声コンテンツに最適。
   * - "phase-vocoder": 高品質。音楽コンテンツに最適。
   * @default "wsola"
   */
  algorithm?: "wsola" | "phase-vocoder";
}
```

### 後方互換性

- 両フィールドともオプショナル
- デフォルト値は既存の挙動を維持（`preservePitch: false` = ピッチ変化あり速度変更）

---

## 4-2. play.ts の分岐

**ファイル:** `src/play.ts`（既存ファイルの変更）

### 設計方針

- 既存の `play()` 関数のシグネチャと返り値の型（`Playback`）は変更しない
- `preservePitch: true` かつ `playbackRate !== 1` の場合のみ Stretcher パスに分岐
- Stretcher パスでは `StretcherEngine` を内部で生成し、同じ `Playback` インターフェースにラップして返す

### 実装

```ts
export function play(
  ctx: AudioContext,
  buffer: AudioBuffer,
  options?: PlayOptions,
): Playback {
  const rate = options?.playbackRate ?? 1;

  // Stretcher パス: preservePitch が true かつ速度変更がある場合
  if (options?.preservePitch && rate !== 1) {
    return playWithStretcher(ctx, buffer, options);
  }

  // 既存パス（変更なし）
  return playDirect(ctx, buffer, options);
}
```

既存の `play()` 内部実装は `playDirect()` にリネーム（内容は一切変更なし）。

### playWithStretcher() の実装

```ts
function playWithStretcher(
  ctx: AudioContext,
  buffer: AudioBuffer,
  options: PlayOptions,
): Playback {
  const {
    offset: initialOffset = 0,
    playbackRate: initialRate = 1,
    algorithm = "wsola",
    through = [],
    destination = ctx.destination,
    timeupdateInterval = 50,
    loop = false,
  } = options;

  const emitter = createEmitter<PlaybackEventMap>();
  const duration = buffer.duration;

  // StretcherEngine を内部で生成
  const engine = new StretcherEngine(ctx, buffer, {
    tempo: initialRate,
    algorithm,
    destination,
    through,
  });

  let state: PlaybackState = "stopped";
  let disposed = false;
  let timerId: ReturnType<typeof setInterval> | null = null;

  // ... 以下、Playback インターフェースの各メソッドを StretcherEngine に委譲 ...

  return {
    getState: () => state,
    getCurrentTime: () => engine.getCurrentInputPosition(),
    getDuration: () => duration,
    getProgress: () => engine.getProgress(),
    pause,
    resume,
    togglePlayPause,
    seek,
    stop,
    setPlaybackRate,
    setLoop,
    on: emitter.on.bind(emitter) as Playback["on"],
    off: emitter.off.bind(emitter) as Playback["off"],
    dispose,
    // Stretcher 固有: adapters.ts のダックタイピング用
    getStretcherSnapshot: () => ({ ... }),
  };
}
```

### 各メソッドの委譲ロジック

| Playback メソッド | Stretcher パスでの挙動 |
|------------------|----------------------|
| `getState()` | 内部状態を返す（"playing" / "paused" / "stopped"） |
| `getCurrentTime()` | `engine.getCurrentInputPosition()` — 元バッファ上の位置 |
| `getDuration()` | `buffer.duration` — 変更なし |
| `getProgress()` | `engine.getProgress()` |
| `pause()` | `engine.pause()` → state="paused" |
| `resume()` | `engine.resume()` → state="playing" |
| `seek(pos)` | `engine.seek(pos)` → 変換済みなら即再生 / 未変換なら BUFFERING |
| `stop()` | `engine.stop()` → state="stopped" |
| `setPlaybackRate(rate)` | `engine.setTempo(rate)` — BUFFERING → 再変換 → PLAYING |
| `setLoop(bool)` | ループは Phase 4 ではサポートしない（将来拡張） |
| `dispose()` | `engine.dispose()` — Worker 終了、バッファ解放 |

### イベントの橋渡し

StretcherEngine のイベントを Playback のイベントにマッピング:

```ts
// StretcherEngine → Playback イベント
engine.on("statechange", ({ playback: pb }) => {
  if (pb === "playing" && state !== "playing") {
    state = "playing";
    emitter.emit("statechange", { state: "playing" });
  }
  // ... 他の状態遷移
});

// timeupdate は setInterval で（既存と同じパターン）
timerId = setInterval(() => {
  if (state === "playing") {
    emitter.emit("timeupdate", {
      position: engine.getCurrentInputPosition(),
      duration,
    });
  }
}, timeupdateInterval);
```

---

## 4-3. ビルド・エクスポート設定

### tsup.config.ts

```ts
entry: {
  // 既存
  index: "src/index.ts",
  context: "src/context.ts",
  buffer: "src/buffer.ts",
  play: "src/play.ts",
  emitter: "src/emitter.ts",
  nodes: "src/nodes.ts",
  waveform: "src/waveform.ts",
  fade: "src/fade.ts",
  scheduler: "src/scheduler.ts",
  synth: "src/synth.ts",
  adapters: "src/adapters.ts",
  // 新規
  stretcher: "src/stretcher/index.ts",
},
```

### package.json — exports

```json
"./stretcher": {
  "import": {
    "types": "./dist/stretcher.d.ts",
    "default": "./dist/stretcher.js"
  },
  "require": {
    "types": "./dist/stretcher.d.cts",
    "default": "./dist/stretcher.cjs"
  }
}
```

### index.ts — バレルエクスポート

```ts
// 既存のエクスポートに追加
export { StretcherEngine } from "./stretcher/index.js";
export type {
  BufferHealth,
  StretcherStatus,
  StretcherEvents,
} from "./stretcher/index.js";
```

---

## 4-4. 重要な設計判断

### loop サポートについて

`preservePitch: true` 時のループ再生は複雑度が高い（最終チャンク → 先頭チャンクへのシームレス接続）。Phase 4 では非サポートとし、`loop: true` と `preservePitch: true` の組み合わせは警告を出す。

```ts
if (options?.preservePitch && options?.loop) {
  console.warn("waa: loop is not supported with preservePitch. Loop option will be ignored.");
}
```

### playbackRate = 1 の場合

`preservePitch: true` でも `playbackRate = 1` なら変換不要。既存パスにフォールバックし、不要な Worker 生成を避ける。

### 動的な preservePitch 切替

一度 `play()` で生成された Playback は、途中で Stretcher パス / 通常パスを切り替えられない。速度変更は `setPlaybackRate()` で対応するが、`preservePitch` 自体の変更は `stop() → play()` の再生成が必要。

---

## 4-5. テスト

### 既存テスト回帰

```
npm test → emitter.test.ts が引き続きパスすること
npm run typecheck → 型エラーなし
npm run build → ビルド成功
```

### 新規テスト（統合レベル）

AudioContext + Worker のフルモックが必要:
```
- play(ctx, buf, { preservePitch: true, playbackRate: 1.5 })
  → Playback が返る
  → getState() === "playing"（初回チャンク変換完了後）
- setPlaybackRate(2.0) → BUFFERING → PLAYING
- seek(readyチャンク) → 位置が更新される
- pause() → resume() → 継続再生
- dispose() → Worker 終了
- preservePitch なし → 既存パスで動作（回帰）
- preservePitch: true, playbackRate: 1 → 既存パスにフォールバック
- preservePitch: true, loop: true → 警告が出る
```

---

## Phase 4 の実装順序

```
14. src/types.ts の変更（PlayOptions に preservePitch, algorithm 追加）
15. src/play.ts の変更（既存を playDirect にリネーム + playWithStretcher 追加）
16. src/index.ts の変更（Stretcher エクスポート追加）
17. tsup.config.ts の変更（stretcher エントリーポイント追加）
18. package.json の変更（./stretcher エクスポート追加）
```

ステップ 14 → 15 は順序依存。
ステップ 16〜18 は並行して実装可能。
