---
title: 快速开始
description: 安装 waa-play,几分钟内开始播放音频
---

## 安装

```bash
npm install waa-play
```

## 快速开始:类 API (WaaPlayer)

`WaaPlayer` 封装了 `AudioContext`,并将所有模块以方法形式暴露。这是最简单的入门方式。

```ts
import { WaaPlayer } from "waa-play";

const player = new WaaPlayer();

// Generate a 440 Hz sine tone, 2 seconds long
const buffer = player.createSineBuffer(440, 2);

// Start playback — returns a Playback handle
const playback = player.play(buffer);

// Listen to position updates
playback.on("timeupdate", ({ position }) => console.log(position));

// Clean up when done
player.dispose();
```

## 快速开始:函数 API (自带 AudioContext)

如果你需要完全控制,可以导入单个函数并自带 `AudioContext`。这种方式完全支持 tree-shaking。

```ts
import { createContext, ensureRunning, play } from "waa-play";
import { createSineBuffer } from "waa-play/synth";

const ctx = createContext();
await ensureRunning(ctx);

const buffer = createSineBuffer(ctx, 440, 2);
const pb = play(ctx, buffer);
```

每个函数都以 `AudioContext` 作为第一个参数,因此不存在任何隐藏的全局状态。

## 模块

waa-play 由 12 个独立模块组成。每个模块都是独立的入口点,打包器可以对未使用的代码进行 tree-shaking。

| 模块 | 导入路径 | 用途 |
|---|---|---|
| **player** | `waa-play` | `WaaPlayer` 类 — 所有模块的便捷封装 |
| **context** | `waa-play/context` | AudioContext 生命周期 (`createContext`, `ensureRunning`, `now`) |
| **buffer** | `waa-play/buffer` | 音频文件加载 (`loadBuffer`, `loadBufferFromBlob`) |
| **play** | `waa-play/play` | 核心播放引擎 — 返回 `Playback` 句柄 |
| **emitter** | `waa-play/emitter` | 类型安全的事件发射器 (`createEmitter<Events>()`) |
| **nodes** | `waa-play/nodes` | 音频节点工厂、`chain()` / `disconnectChain()` |
| **waveform** | `waa-play/waveform` | 从 `AudioBuffer` 提取峰值 / RMS |
| **fade** | `waa-play/fade` | 淡入、淡出、交叉淡化工具 |
| **scheduler** | `waa-play/scheduler` | 预读调度器和时钟 |
| **synth** | `waa-play/synth` | 缓冲区合成(正弦波、噪声、脉冲) |
| **adapters** | `waa-play/adapters` | 框架集成 (`getSnapshot`, `subscribeSnapshot`, `onFrame`) |
| **stretcher** | `waa-play/stretcher` | 基于 WSOLA 的保持音高时间拉伸 |
