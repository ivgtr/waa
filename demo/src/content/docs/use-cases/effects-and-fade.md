---
title: エフェクトとフェード
description: waa-play で音声エフェクトとフェード効果を実装する方法
---

このガイドでは、`nodes`、`fade`、`play` モジュールを使用して、音声エフェクトとフェード効果を実装する方法を説明します。

## 使用モジュール

- **nodes**: オーディオノードのファクトリー関数（`createGain`、`createPanner`、`chain` など）
- **fade**: フェードイン/アウト、クロスフェードユーティリティ
- **play**: コア再生エンジン（`through` オプションでエフェクトチェーンをルーティング）

## 1. ボリューム制御

`createGain()` で GainNode を作成し、`play()` の `through` オプションでルーティングします。`rampGain()` を使用することで、クリックノイズなく滑らかに音量を変更できます。

```ts
import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();

const buffer = await waa.load("/audio/track.mp3");
const gain = waa.createGain(0.5); // 初期音量 50%

const playback = waa.play(buffer, { through: [gain] });

// 3秒かけて音量を100%に上げる
waa.rampGain(gain, 1.0, 3);
```

`through` オプションに GainNode を渡すと、`play()` が自動的に音源からゲインノード、そして destination へと接続します。

<details>
<summary>関数 API 版</summary>

```ts
import { createContext, ensureRunning, loadBuffer } from "waa-play/context";
import { createGain, rampGain } from "waa-play/nodes";
import { play } from "waa-play/play";

const ctx = createContext();
await ensureRunning(ctx);

const buffer = await loadBuffer(ctx, "/audio/track.mp3");
const gain = createGain(ctx, 0.5);

const playback = play(ctx, buffer, { through: [gain] });
rampGain(gain, 1.0, 3);
```

</details>

## 2. ステレオパン

`createPanner()` で StereoPannerNode を作成し、左右のパンを制御できます。値は `-1`（左）から `1`（右）の範囲です。

```ts
import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();

const buffer = await waa.load("/audio/track.mp3");
const panner = waa.createPanner(0); // センター

const playback = waa.play(buffer, { through: [panner] });

// 左に振る
panner.pan.value = -1;

// 右に振る
panner.pan.value = 1;

// センターに戻す
panner.pan.value = 0;
```

<details>
<summary>関数 API 版</summary>

```ts
import { createContext, ensureRunning, loadBuffer } from "waa-play/context";
import { createPanner } from "waa-play/nodes";
import { play } from "waa-play/play";

const ctx = createContext();
await ensureRunning(ctx);

const buffer = await loadBuffer(ctx, "/audio/track.mp3");
const panner = createPanner(ctx, 0);

const playback = play(ctx, buffer, { through: [panner] });
panner.pan.value = -1; // 左
```

</details>

## 3. エフェクトチェーン

複数のエフェクトを組み合わせて、リッチなサウンド処理を実現できます。`through` に配列でノードを渡すと、自動的にチェーン接続されます。

```ts
import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();

const buffer = await waa.load("/audio/track.mp3");

// エフェクトチェーンを構築
const gain = waa.createGain(0.8);
const filter = waa.createBiquadFilter("lowpass", 1000);
const compressor = waa.createDynamicsCompressor();
const panner = waa.createPanner(0.5);

// through 配列で自動的にチェーン接続: gain → filter → compressor → panner → destination
const playback = waa.play(buffer, {
  through: [gain, filter, compressor, panner],
});

// フィルター周波数を変更
filter.frequency.value = 500;
```

`through` オプションを使う場合、`play()` が自動的にノードを接続するため、`chain()` は不要です。`chain()` は `play()` の外でノードグラフを構築する場合に使用します。

<details>
<summary>関数 API 版</summary>

`chain()` を使って明示的にノードグラフを構築する例です。

```ts
import { createContext, ensureRunning, loadBuffer } from "waa-play/context";
import {
  createGain,
  createBiquadFilter,
  createDynamicsCompressor,
  createPanner,
  chain,
} from "waa-play/nodes";
import { play } from "waa-play/play";

const ctx = createContext();
await ensureRunning(ctx);

const buffer = await loadBuffer(ctx, "/audio/track.mp3");

const gain = createGain(ctx, 0.8);
const filter = createBiquadFilter(ctx, "lowpass", 1000);
const compressor = createDynamicsCompressor(ctx);
const panner = createPanner(ctx, 0.5);

// chain() で明示的に接続
chain([gain, filter, compressor, panner]);

const playback = play(ctx, buffer, { through: [gain] });
```

</details>

## 4. フェードイン/アウト

`fadeIn()` と `fadeOut()` を使用して、滑らかなフェード効果を実現できます。`autoFade()` を使えば、再生開始時と終了時のフェードを自動化できます。

```ts
import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();

const buffer = await waa.load("/audio/track.mp3");
const gain = waa.createGain(0); // 初期音量 0

const playback = waa.play(buffer, { through: [gain] });

// 2秒かけてフェードイン（equal-power カーブ）
waa.fadeIn(gain, 1, { duration: 2, curve: "equal-power" });

// 2秒かけてフェードアウト
setTimeout(() => {
  waa.fadeOut(gain, { duration: 2 });
}, 5000);
```

`autoFade()` を使用すると、再生開始時と終了時のフェードを自動的に設定できます。

```ts
import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();

const buffer = await waa.load("/audio/track.mp3");
const gain = waa.createGain(0);

const playback = waa.play(buffer, { through: [gain] });

// 開始時に1秒フェードイン、終了2秒前から2秒かけてフェードアウト
waa.autoFade(playback, gain, { fadeIn: 1, fadeOut: 2 });
```

<details>
<summary>関数 API 版</summary>

```ts
import { createContext, ensureRunning, loadBuffer } from "waa-play/context";
import { createGain } from "waa-play/nodes";
import { play } from "waa-play/play";
import { fadeIn, fadeOut, autoFade } from "waa-play/fade";

const ctx = createContext();
await ensureRunning(ctx);

const buffer = await loadBuffer(ctx, "/audio/track.mp3");
const gain = createGain(ctx, 0);

const playback = play(ctx, buffer, { through: [gain] });

// フェードイン
fadeIn(gain, 1, { duration: 2, curve: "equal-power" });

// 自動フェード
autoFade(playback, gain, { fadeIn: 1, fadeOut: 2 });
```

</details>

## 5. DJ クロスフェード

2つのトラック間でクロスフェードを行い、DJ ミックスのようなシームレスな切り替えを実現できます。

```ts
import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();

const bufferA = await waa.load("/audio/track-a.mp3");
const bufferB = await waa.load("/audio/track-b.mp3");

// トラック A（フル音量）
const gainA = waa.createGain(1);
const playbackA = waa.play(bufferA, { through: [gainA], loop: true });

// トラック B（ミュート）
const gainB = waa.createGain(0);
const playbackB = waa.play(bufferB, { through: [gainB], loop: true });

// 3秒かけてトラック A からトラック B へクロスフェード
setTimeout(() => {
  waa.crossfade(gainA, gainB, { duration: 3, curve: "equal-power" });
}, 5000);
```

`crossfade()` は、一方の GainNode を 1 から 0 へ、もう一方を 0 から 1 へ同時にフェードします。`curve: "equal-power"` を使用することで、知覚的に均一な音量でクロスフェードが行われます。

<details>
<summary>関数 API 版</summary>

```ts
import { createContext, ensureRunning, loadBuffer } from "waa-play/context";
import { createGain } from "waa-play/nodes";
import { play } from "waa-play/play";
import { crossfade } from "waa-play/fade";

const ctx = createContext();
await ensureRunning(ctx);

const bufferA = await loadBuffer(ctx, "/audio/track-a.mp3");
const bufferB = await loadBuffer(ctx, "/audio/track-b.mp3");

const gainA = createGain(ctx, 1);
const playbackA = play(ctx, bufferA, { through: [gainA], loop: true });

const gainB = createGain(ctx, 0);
const playbackB = play(ctx, bufferB, { through: [gainB], loop: true });

setTimeout(() => {
  crossfade(gainA, gainB, { duration: 3, curve: "equal-power" });
}, 5000);
```

</details>

## 関連 API

- [WaaPlayer](/waa/api/player/)
- [関数 API](/waa/api/functions/)
