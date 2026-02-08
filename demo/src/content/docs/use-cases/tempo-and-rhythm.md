---
title: テンポ変更とリズム
description: テンポの変更やリズムパターンの構築など、タイミング制御のパターンを紹介します。
---

テンポの変更やリズムパターンの構築など、タイミング制御のパターンを紹介します。

**使用モジュール**: `play`, `scheduler`, `synth`

## 1. ピッチ保存テンポ変更

`preservePitch` のデフォルトは `true` なので、通常の `play()` 呼び出しでピッチが保存されます。通常速度変更（ピッチも変わる）には `preservePitch: false` を明示します。

```ts
import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();
const buffer = await waa.load("/audio/track.mp3");

// ピッチを保持したままテンポ変更（デフォルト動作）
const playback = waa.play(buffer, { playbackRate: 0.8 });

// 再生中にテンポを変更
playback.setPlaybackRate(1.2); // 1.2倍速、ピッチは維持

// ピッチも一緒に変更する場合は preservePitch: false
const playback2 = waa.play(buffer, {
  playbackRate: 1.5,
  preservePitch: false,
});
```

WSOLA アルゴリズムにより、ピッチを変えずにテンポを変更できます。`preservePitch: true`（デフォルト）で WSOLA ベースのタイムストレッチが有効になります。

<details>
<summary>関数 API 版</summary>

```ts
import { createContext, ensureRunning } from "waa-play/context";
import { loadBuffer } from "waa-play/buffer";
import { play } from "waa-play/play";

const ctx = createContext();
await ensureRunning(ctx);
const buffer = await loadBuffer(ctx, "/audio/track.mp3");

// ピッチを保持したままテンポ変更（デフォルト動作）
const playback = play(ctx, buffer, { playbackRate: 0.8 });

// 再生中にテンポを変更
playback.setPlaybackRate(1.2);

// ピッチも一緒に変更する場合は preservePitch: false
const playback2 = play(ctx, buffer, {
  playbackRate: 1.5,
  preservePitch: false,
});
```

</details>

## 2. バッファリング状態の監視

WSOLA 処理は非同期で行われるため、テンポ変更時にバッファリングが発生する可能性があります。

```ts
const playback = waa.play(buffer, { playbackRate: 0.8 });

// バッファリング開始を監視
playback.on("buffering", ({ reason }) => {
  console.log(`バッファリング中... (理由: ${reason})`);
  // UI にローディング表示
});

// バッファリング完了を監視
playback.on("buffered", ({ stallDuration }) => {
  console.log(`バッファリング完了 (${stallDuration.toFixed(0)}ms)`);
  // ローディング表示を解除
});

// スナップショットでストレッチャー状態を確認
const snapshot = waa.getSnapshot(playback);
if (snapshot.stretcher) {
  console.log(`テンポ: ${snapshot.stretcher.tempo}`);
  console.log(`バッファ状態: ${snapshot.stretcher.bufferHealth}`);
  console.log(`変換中: ${snapshot.stretcher.converting}`);
  console.log(`変換進捗: ${(snapshot.stretcher.conversionProgress * 100).toFixed(0)}%`);
}
```

`buffering` イベントの `reason` は `"initial"` | `"seek"` | `"tempo-change"` | `"underrun"` のいずれかです。`getSnapshot()` の `stretcher` フィールドで詳細な状態を取得できます。

<details>
<summary>関数 API 版</summary>

```ts
import { getSnapshot } from "waa-play/adapters";

const playback = play(ctx, buffer, { playbackRate: 0.8 });

playback.on("buffering", ({ reason }) => {
  console.log(`バッファリング中... (理由: ${reason})`);
});

playback.on("buffered", ({ stallDuration }) => {
  console.log(`バッファリング完了 (${stallDuration.toFixed(0)}ms)`);
});

const snapshot = getSnapshot(playback);
if (snapshot.stretcher) {
  console.log(`テンポ: ${snapshot.stretcher.tempo}`);
  console.log(`バッファ状態: ${snapshot.stretcher.bufferHealth}`);
  console.log(`変換中: ${snapshot.stretcher.converting}`);
  console.log(`変換進捗: ${(snapshot.stretcher.conversionProgress * 100).toFixed(0)}%`);
}
```

</details>

## 3. ビートシーケンサー

クロックとスケジューラーを使用して、正確なタイミングでビートパターンを構築できます。

```ts
const waa = new WaaPlayer();
await waa.ensureRunning();

// クリック音を合成
const click = waa.createClickBuffer(1000, 0.05);
const accent = waa.createClickBuffer(1500, 0.05);

// クロックとスケジューラーを作成
const clock = waa.createClock({ bpm: 120 });
const scheduler = waa.createScheduler({ lookahead: 0.1 });

// 4拍子のビートパターン
let beat = 0;
const totalBeats = 16;

function scheduleBeat() {
  const time = clock.beatToTime(beat);
  const isAccent = beat % 4 === 0;

  scheduler.schedule(`beat-${beat}`, time, (t) => {
    // アクセント拍にはアクセント音を使用
    waa.play(isAccent ? accent : click);
  });

  beat++;
  if (beat < totalBeats) {
    scheduleBeat();
  }
}

scheduleBeat();
scheduler.start();

// テンポ変更
clock.setBpm(140);
```

`createClock` で BPM ベースのクロックを作成し、`createScheduler` のルックアヘッドスケジューリングでサンプル精度のタイミング制御を実現します。`createClickBuffer` でクリック音を合成できます。

<details>
<summary>関数 API 版</summary>

```ts
import { createContext, ensureRunning } from "waa-play/context";
import { play } from "waa-play/play";
import { createClock, createScheduler } from "waa-play/scheduler";
import { createClickBuffer } from "waa-play/synth";

const ctx = createContext();
await ensureRunning(ctx);

// クリック音を合成
const click = createClickBuffer(ctx, 1000, 0.05);
const accent = createClickBuffer(ctx, 1500, 0.05);

// クロックとスケジューラーを作成
const clock = createClock(ctx, { bpm: 120 });
const scheduler = createScheduler(ctx, { lookahead: 0.1 });

// 4拍子のビートパターン
let beat = 0;
const totalBeats = 16;

function scheduleBeat() {
  const time = clock.beatToTime(beat);
  const isAccent = beat % 4 === 0;

  scheduler.schedule(`beat-${beat}`, time, (t) => {
    play(ctx, isAccent ? accent : click);
  });

  beat++;
  if (beat < totalBeats) {
    scheduleBeat();
  }
}

scheduleBeat();
scheduler.start();

// テンポ変更
clock.setBpm(140);
```

</details>

## 関連 API

- [WaaPlayer](/waa/api/player/)
- [関数 API](/waa/api/functions/)
- [Stretcher](/waa/api/stretcher/)
