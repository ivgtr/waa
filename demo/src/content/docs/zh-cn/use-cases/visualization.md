---
title: 可视化
description: 音频可视化模式，包括波形渲染和实时频率显示
---

本指南介绍三种音频数据可视化模式：静态波形渲染、播放光标跟踪和实时频谱显示。

**使用的模块**: `waveform`, `nodes`, `adapters`, `play`

## 1. 静态波形渲染

从 AudioBuffer 提取峰值对并在 Canvas 上渲染波形。

```ts
import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();
const buffer = await waa.load("/audio/track.mp3");

// 提取峰值对
const peaks = waa.extractPeakPairs(buffer, { resolution: 300 });

// 绘制到画布
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

`extractPeakPairs` 从 AudioBuffer 提取最小/最大值对。使用 `resolution` 参数控制输出数据点数量。

<details>
<summary>函数 API 版</summary>

```ts
import { createContext, ensureRunning } from "waa-play/context";
import { loadBuffer } from "waa-play/buffer";
import { extractPeakPairs } from "waa-play/waveform";

const ctx = createContext();
await ensureRunning(ctx);
const buffer = await loadBuffer(ctx, "/audio/track.mp3");

// 提取峰值对
const peaks = extractPeakPairs(buffer, { resolution: 300 });

// 绘制到画布
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

## 2. 播放光标跟踪

根据播放位置移动光标，并对已播放部分进行颜色标记。

```ts
const playback = waa.play(buffer);

// 每个动画帧更新
const stopFrame = waa.onFrame(playback, ({ progress }) => {
  // 更新光标位置
  const cursorX = progress * canvas.width;

  // 重绘波形（清除前一帧）
  canvasCtx.clearRect(0, 0, width, height);

  // 已播放和未播放部分使用不同颜色
  for (let i = 0; i < peaks.length; i++) {
    const { min, max } = peaks[i];
    const x = i * barWidth;
    const top = centerY - max * centerY;
    const bottom = centerY - min * centerY;
    canvasCtx.fillStyle = x < cursorX ? "#4a9eff" : "#666";
    canvasCtx.fillRect(x, top, barWidth - 1, bottom - top);
  }

  // 绘制光标线
  canvasCtx.strokeStyle = "#fff";
  canvasCtx.beginPath();
  canvasCtx.moveTo(cursorX, 0);
  canvasCtx.lineTo(cursorX, height);
  canvasCtx.stroke();
});

// 停止时清理
playback.on("ended", () => stopFrame());
```

`onFrame` 使用 `requestAnimationFrame` 在每一帧返回 `PlaybackSnapshot`。使用 `progress` (0–1) 计算光标位置。

<details>
<summary>函数 API 版</summary>

```ts
import { play } from "waa-play/play";
import { onFrame } from "waa-play/adapters";

const playback = play(ctx, buffer);

// 每个动画帧更新
const stopFrame = onFrame(playback, ({ progress }) => {
  // 更新光标位置
  const cursorX = progress * canvas.width;

  // 重绘波形（清除前一帧）
  canvasCtx.clearRect(0, 0, width, height);

  // 已播放和未播放部分使用不同颜色
  for (let i = 0; i < peaks.length; i++) {
    const { min, max } = peaks[i];
    const x = i * barWidth;
    const top = centerY - max * centerY;
    const bottom = centerY - min * centerY;
    canvasCtx.fillStyle = x < cursorX ? "#4a9eff" : "#666";
    canvasCtx.fillRect(x, top, barWidth - 1, bottom - top);
  }

  // 绘制光标线
  canvasCtx.strokeStyle = "#fff";
  canvasCtx.beginPath();
  canvasCtx.moveTo(cursorX, 0);
  canvasCtx.lineTo(cursorX, height);
  canvasCtx.stroke();
});

// 停止时清理
playback.on("ended", () => stopFrame());
```

</details>

## 3. 实时频率显示

使用 AnalyserNode 在播放期间实时显示频谱。

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

`createAnalyser` 创建 AnalyserNode 并通过 `through` 路由。`getFrequencyDataByte` 以 Uint8Array (0-255) 返回频率数据。

<details>
<summary>函数 API 版</summary>

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

## 相关 API

- [WaaPlayer](/waa/api/player/)
- [函数 API](/waa/api/functions/)
