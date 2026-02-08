---
title: 核心概念
description: waa-play 的关键设计模式和架构
---

## 自带 AudioContext

waa-play 中的每个函数都以 `AudioContext` 作为第一个参数。库不会在幕后创建或存储全局上下文。

```ts
import { play } from "waa-play/play";
import { loadBuffer } from "waa-play/buffer";

const ctx = new AudioContext();
const buffer = await loadBuffer(ctx, "/audio/track.mp3");
const pb = play(ctx, buffer);
```

这使你可以完全控制上下文的生命周期、采样率、延迟提示和离线渲染。

`WaaPlayer` 为了使用方便而封装了这个模式 — 它在内部创建和管理 `AudioContext`,但底层设计保持不变。

## 播放状态机

`play()` 返回的 `Playback` 对象遵循一个简单的状态机:

```
playing → paused → playing → stopped
playing → stopped
```

- **playing** — 正在输出音频。位置基于 `AudioContext.currentTime`(硬件时钟精度,而非 JavaScript 定时器)推进。
- **paused** — 音频输出已暂停。位置冻结在暂停点。
- **stopped** — 终止状态。源节点已释放,无法重新启动。要再次播放需创建新的 `Playback`。

```ts
const pb = play(ctx, buffer);

pb.pause();           // playing → paused
pb.resume();          // paused → playing
pb.stop();            // → stopped (from any state)

console.log(pb.state) // "playing" | "paused" | "stopped"
```

## 事件系统

Playback 通过 `on` / `off` 模式发出类型安全的事件:

```ts
pb.on("statechange", ({ state }) => {
  console.log("new state:", state);
});

pb.on("timeupdate", ({ position, duration, progress }) => {
  console.log(`${position.toFixed(1)}s / ${duration.toFixed(1)}s`);
});

pb.on("ended", () => {
  console.log("playback finished");
});
```

**后台标签页支持**:`timeupdate` 通过 `setInterval` 触发,而非 `requestAnimationFrame`。这意味着即使浏览器标签页在后台,位置更新也会继续工作。

## Tree-shaking

waa-play 分为 11 个独立模块(加上 `WaaPlayer` 类入口),每个模块都有自己的子路径导出。打包器只会包含你实际导入的模块。

```ts
// Only the play and buffer modules end up in your bundle
import { play } from "waa-play/play";
import { loadBuffer } from "waa-play/buffer";
```

如果你通过顶层 `waa-play` 导入使用 `WaaPlayer`,由于该类封装了所有模块,因此所有模块都会被包含。

## 保持音高的时间拉伸

`stretcher` 模块使用 WSOLA(波形相似性重叠相加)算法,在不改变音高的情况下实时改变节奏。

- **Web Worker 处理** — WSOLA 在独立线程中运行,保持主线程的响应性。
- **流式架构** — 源音频被分割成块,按目标节奏转换,并缓冲以实现无缝播放。
- **实时变速控制** — 可在播放过程中改变节奏;拉伸器会即时重新处理后续块。

```ts
import { createStretcher } from "waa-play/stretcher";

const stretcher = createStretcher(ctx, buffer, {
  tempo: 0.8, // 80% speed, original pitch
});

stretcher.play();
stretcher.setTempo(1.2); // speed up mid-playback
```
