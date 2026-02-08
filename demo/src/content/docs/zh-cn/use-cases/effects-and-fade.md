---
title: 效果与淡入淡出
description: 如何使用 waa-play 实现音频效果和淡入淡出过渡
---

本指南演示如何使用 `nodes`、`fade` 和 `play` 模块实现音频效果和淡入淡出过渡。

## 使用的模块

- **nodes**: 音频节点工厂函数（`createGain`、`createPanner`、`chain` 等）
- **fade**: 淡入/淡出和交叉淡入淡出工具
- **play**: 核心播放引擎（通过 `through` 选项路由效果链）

## 1. 音量控制

使用 `createGain()` 创建 GainNode，并通过 `play()` 函数的 `through` 选项进行路由。使用 `rampGain()` 可以平滑地改变音量，不会产生爆音。

```ts
import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();

const buffer = await waa.load("/audio/track.mp3");
const gain = waa.createGain(0.5); // 初始音量 50%

const playback = waa.play(buffer, { through: [gain] });

// 在 3 秒内将音量提升到 100%
waa.rampGain(gain, 1.0, 3);
```

当您将 GainNode 传递给 `through` 选项时，`play()` 会自动将音源连接到增益节点，然后再连接到目标。

<details>
<summary>函数 API 版</summary>

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

## 2. 立体声声像

使用 `createPanner()` 创建 StereoPannerNode 以控制左右声像。值的范围从 `-1`（左）到 `1`（右）。

```ts
import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();

const buffer = await waa.load("/audio/track.mp3");
const panner = waa.createPanner(0); // 中央

const playback = waa.play(buffer, { through: [panner] });

// 向左平移
panner.pan.value = -1;

// 向右平移
panner.pan.value = 1;

// 回到中央
panner.pan.value = 0;
```

<details>
<summary>函数 API 版</summary>

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

## 3. 效果链

组合多个效果以实现丰富的声音处理。将节点数组传递给 `through` 以自动将它们链接在一起。

```ts
import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();

const buffer = await waa.load("/audio/track.mp3");

// 构建效果链
const gain = waa.createGain(0.8);
const filter = waa.createBiquadFilter("lowpass", 1000);
const compressor = waa.createDynamicsCompressor();
const panner = waa.createPanner(0.5);

// 自动链接: gain → filter → compressor → panner → destination
const playback = waa.play(buffer, {
  through: [gain, filter, compressor, panner],
});

// 调整滤波器频率
filter.frequency.value = 500;
```

使用 `through` 选项时，`play()` 会自动连接节点，因此不需要 `chain()`。在 `play()` 之外构建节点图时使用 `chain()`。

<details>
<summary>函数 API 版</summary>

使用 `chain()` 显式构建节点图的示例：

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

// 使用 chain() 显式连接
chain([gain, filter, compressor, panner]);

const playback = play(ctx, buffer, { through: [gain] });
```

</details>

## 4. 淡入/淡出

使用 `fadeIn()` 和 `fadeOut()` 实现平滑的淡入淡出效果。`autoFade()` 可以在播放开始和结束时自动淡入淡出。

```ts
import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();

const buffer = await waa.load("/audio/track.mp3");
const gain = waa.createGain(0); // 从 0 音量开始

const playback = waa.play(buffer, { through: [gain] });

// 在 2 秒内淡入（等功率曲线）
waa.fadeIn(gain, 1, { duration: 2, curve: "equal-power" });

// 在 2 秒内淡出
setTimeout(() => {
  waa.fadeOut(gain, { duration: 2 });
}, 5000);
```

使用 `autoFade()` 可以自动设置播放开始和结束时的淡入淡出。

```ts
import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();

const buffer = await waa.load("/audio/track.mp3");
const gain = waa.createGain(0);

const playback = waa.play(buffer, { through: [gain] });

// 开始时淡入 1 秒，最后 2 秒淡出 2 秒
waa.autoFade(playback, gain, { fadeIn: 1, fadeOut: 2 });
```

<details>
<summary>函数 API 版</summary>

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

// 淡入
fadeIn(gain, 1, { duration: 2, curve: "equal-power" });

// 自动淡入淡出
autoFade(playback, gain, { fadeIn: 1, fadeOut: 2 });
```

</details>

## 5. DJ 交叉淡入淡出

在两个音轨之间交叉淡入淡出，实现无缝的 DJ 风格过渡。

```ts
import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();

const bufferA = await waa.load("/audio/track-a.mp3");
const bufferB = await waa.load("/audio/track-b.mp3");

// 音轨 A（全音量）
const gainA = waa.createGain(1);
const playbackA = waa.play(bufferA, { through: [gainA], loop: true });

// 音轨 B（静音）
const gainB = waa.createGain(0);
const playbackB = waa.play(bufferB, { through: [gainB], loop: true });

// 在 3 秒内从音轨 A 交叉淡入淡出到音轨 B
setTimeout(() => {
  waa.crossfade(gainA, gainB, { duration: 3, curve: "equal-power" });
}, 5000);
```

`crossfade()` 同时将一个 GainNode 从 1 淡出到 0，将另一个从 0 淡入到 1。使用 `curve: "equal-power"` 可以确保在交叉淡入淡出期间音量感知均匀。

<details>
<summary>函数 API 版</summary>

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

## 相关 API

- [WaaPlayer](/waa/zh-cn/api/player/)
- [函数 API](/waa/zh-cn/api/functions/)
