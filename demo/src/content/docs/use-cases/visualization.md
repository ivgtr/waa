---
title: ビジュアライゼーション
description: 波形描画やリアルタイム周波数表示など、オーディオのビジュアル表現パターン
---

オーディオデータを視覚的に表現する3つのパターンを紹介します。静的な波形描画、再生カーソル連動、リアルタイム周波数表示を実装する方法を学びます。

**使用モジュール**: `waveform`, `nodes`, `adapters`, `play`

## 1. 静的波形描画

AudioBuffer からピークペアを抽出し、Canvas に波形を描画します。

```ts
import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();
const buffer = await waa.load("/audio/track.mp3");

// ピークペアを抽出
const peaks = waa.extractPeakPairs(buffer, { resolution: 300 });

// Canvas に描画
const canvas = document.querySelector("canvas")!;
const canvasCtx = canvas.getContext("2d")!;
const { width, height } = canvas;
const barWidth = width / peaks.length;
const centerY = height / 2;

canvasCtx.fillStyle = "#4a9eff";
for (let i = 0; i < peaks.length; i++) {
  const { min, max } = peaks[i];
  const x = i * barWidth;
  const top = centerY - max * centerY;
  const bottom = centerY - min * centerY;
  canvasCtx.fillRect(x, top, barWidth - 1, bottom - top);
}
```

`extractPeakPairs` は AudioBuffer から min/max のペアを抽出します。`resolution` パラメータで出力データ点数を制御できます。

<details>
<summary>関数 API 版</summary>

```ts
import { createContext, ensureRunning } from "waa-play/context";
import { loadBuffer } from "waa-play/buffer";
import { extractPeakPairs } from "waa-play/waveform";

const ctx = createContext();
await ensureRunning(ctx);
const buffer = await loadBuffer(ctx, "/audio/track.mp3");

// ピークペアを抽出
const peaks = extractPeakPairs(buffer, { resolution: 300 });

// Canvas に描画
const canvas = document.querySelector("canvas")!;
const canvasCtx = canvas.getContext("2d")!;
const { width, height } = canvas;
const barWidth = width / peaks.length;
const centerY = height / 2;

canvasCtx.fillStyle = "#4a9eff";
for (let i = 0; i < peaks.length; i++) {
  const { min, max } = peaks[i];
  const x = i * barWidth;
  const top = centerY - max * centerY;
  const bottom = centerY - min * centerY;
  canvasCtx.fillRect(x, top, barWidth - 1, bottom - top);
}
```

</details>

## 2. 再生カーソル連動

再生位置に応じてカーソルを動かし、再生済み部分を色分けします。

```ts
const playback = waa.play(buffer);

// onFrame でアニメーションフレームごとに更新
const stopFrame = waa.onFrame(playback, ({ progress }) => {
  // カーソル位置を更新
  const cursorX = progress * canvas.width;

  // 波形を再描画（前のフレームをクリア）
  canvasCtx.clearRect(0, 0, width, height);

  // 再生済み部分を色分け
  for (let i = 0; i < peaks.length; i++) {
    const { min, max } = peaks[i];
    const x = i * barWidth;
    const top = centerY - max * centerY;
    const bottom = centerY - min * centerY;
    canvasCtx.fillStyle = x < cursorX ? "#4a9eff" : "#666";
    canvasCtx.fillRect(x, top, barWidth - 1, bottom - top);
  }

  // カーソルライン描画
  canvasCtx.strokeStyle = "#fff";
  canvasCtx.beginPath();
  canvasCtx.moveTo(cursorX, 0);
  canvasCtx.lineTo(cursorX, height);
  canvasCtx.stroke();
});

// 停止時にクリーンアップ
playback.on("ended", () => stopFrame());
```

`onFrame` は `requestAnimationFrame` ベースで `PlaybackSnapshot` を毎フレーム返します。`progress` (0〜1) でカーソル位置を計算できます。

<details>
<summary>関数 API 版</summary>

```ts
import { play } from "waa-play/play";
import { onFrame } from "waa-play/adapters";

const playback = play(ctx, buffer);

// onFrame でアニメーションフレームごとに更新
const stopFrame = onFrame(playback, ({ progress }) => {
  // カーソル位置を更新
  const cursorX = progress * canvas.width;

  // 波形を再描画（前のフレームをクリア）
  canvasCtx.clearRect(0, 0, width, height);

  // 再生済み部分を色分け
  for (let i = 0; i < peaks.length; i++) {
    const { min, max } = peaks[i];
    const x = i * barWidth;
    const top = centerY - max * centerY;
    const bottom = centerY - min * centerY;
    canvasCtx.fillStyle = x < cursorX ? "#4a9eff" : "#666";
    canvasCtx.fillRect(x, top, barWidth - 1, bottom - top);
  }

  // カーソルライン描画
  canvasCtx.strokeStyle = "#fff";
  canvasCtx.beginPath();
  canvasCtx.moveTo(cursorX, 0);
  canvasCtx.lineTo(cursorX, height);
  canvasCtx.stroke();
});

// 停止時にクリーンアップ
playback.on("ended", () => stopFrame());
```

</details>

## 3. リアルタイム周波数表示

AnalyserNode を使用して、再生中の周波数スペクトルをリアルタイムで表示します。

```ts
const analyser = waa.createAnalyser({ fftSize: 256 });
const playback = waa.play(buffer, { through: [analyser] });

const freqCanvas = document.querySelector("#freq-canvas") as HTMLCanvasElement;
const freqCtx = freqCanvas.getContext("2d")!;

function drawFrequency() {
  requestAnimationFrame(drawFrequency);

  const data = waa.getFrequencyDataByte(analyser);
  const barWidth = freqCanvas.width / data.length;

  freqCtx.clearRect(0, 0, freqCanvas.width, freqCanvas.height);
  freqCtx.fillStyle = "#4a9eff";

  for (let i = 0; i < data.length; i++) {
    const barHeight = (data[i] / 255) * freqCanvas.height;
    freqCtx.fillRect(
      i * barWidth,
      freqCanvas.height - barHeight,
      barWidth - 1,
      barHeight
    );
  }
}

drawFrequency();
```

`createAnalyser` で AnalyserNode を生成し、`through` でルーティングします。`getFrequencyDataByte` は Uint8Array (0-255) で周波数データを返します。

<details>
<summary>関数 API 版</summary>

```ts
import { play } from "waa-play/play";
import { createAnalyser, getFrequencyDataByte } from "waa-play/nodes";

const analyser = createAnalyser(ctx, { fftSize: 256 });
const playback = play(ctx, buffer, { through: [analyser] });

const freqCanvas = document.querySelector("#freq-canvas") as HTMLCanvasElement;
const freqCtx = freqCanvas.getContext("2d")!;

function drawFrequency() {
  requestAnimationFrame(drawFrequency);

  const data = getFrequencyDataByte(analyser);
  const barWidth = freqCanvas.width / data.length;

  freqCtx.clearRect(0, 0, freqCanvas.width, freqCanvas.height);
  freqCtx.fillStyle = "#4a9eff";

  for (let i = 0; i < data.length; i++) {
    const barHeight = (data[i] / 255) * freqCanvas.height;
    freqCtx.fillRect(
      i * barWidth,
      freqCanvas.height - barHeight,
      barWidth - 1,
      barHeight
    );
  }
}

drawFrequency();
```

</details>

## 関連 API

- [WaaPlayer](/waa/api/player/)
- [関数 API](/waa/api/functions/)
