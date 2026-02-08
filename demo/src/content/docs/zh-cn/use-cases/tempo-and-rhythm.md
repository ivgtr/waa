---
title: 节奏与韵律
description: 介绍节奏控制模式，包括节奏变更和节奏模式构建等时序控制。
---

介绍节奏控制模式，包括节奏变更和节奏模式构建等时序控制。

**使用模块**: `play`, `scheduler`, `synth`

## 1. 保持音高的节奏变更

由于 `preservePitch` 默认为 `true`，因此在正常的 `play()` 调用中会自动保持音高。如需常规速度变更（音高也会改变），请明确设置 `preservePitch: false`。

```ts
import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();
const buffer = await waa.load("/audio/track.mp3");

// 保持音高的节奏变更（默认行为）
const playback = waa.play(buffer, { playbackRate: 0.8 });

// 播放期间改变节奏
playback.setPlaybackRate(1.2); // 1.2倍速，音高保持不变

// 如需同时改变音高，请设置 preservePitch: false
const playback2 = waa.play(buffer, {
  playbackRate: 1.5,
  preservePitch: false,
});
```

WSOLA 算法允许在不改变音高的情况下改变节奏。设置 `preservePitch: true`（默认）将启用基于 WSOLA 的时间拉伸。

<details>
<summary>函数 API 版</summary>

```ts
import { createContext, ensureRunning } from "waa-play/context";
import { loadBuffer } from "waa-play/buffer";
import { play } from "waa-play/play";

const ctx = createContext();
await ensureRunning(ctx);
const buffer = await loadBuffer(ctx, "/audio/track.mp3");

// 保持音高的节奏变更（默认行为）
const playback = play(ctx, buffer, { playbackRate: 0.8 });

// 播放期间改变节奏
playback.setPlaybackRate(1.2);

// 如需同时改变音高，请设置 preservePitch: false
const playback2 = play(ctx, buffer, {
  playbackRate: 1.5,
  preservePitch: false,
});
```

</details>

## 2. 监控缓冲状态

由于 WSOLA 处理是异步的，因此在改变节奏时可能会发生缓冲。

```ts
const playback = waa.play(buffer, { playbackRate: 0.8 });

// 监控缓冲开始
playback.on("buffering", ({ reason }) => {
  console.log(`缓冲中... (原因: ${reason})`);
  // 显示加载 UI
});

// 监控缓冲完成
playback.on("buffered", ({ stallDuration }) => {
  console.log(`缓冲完成 (${stallDuration.toFixed(0)}ms)`);
  // 隐藏加载 UI
});

// 通过快照检查拉伸器状态
const snapshot = waa.getSnapshot(playback);
if (snapshot.stretcher) {
  console.log(`节奏: ${snapshot.stretcher.tempo}`);
  console.log(`缓冲区健康度: ${snapshot.stretcher.bufferHealth}`);
  console.log(`转换中: ${snapshot.stretcher.converting}`);
  console.log(`转换进度: ${(snapshot.stretcher.conversionProgress * 100).toFixed(0)}%`);
}
```

`buffering` 事件中的 `reason` 为 `"initial"` | `"seek"` | `"tempo-change"` | `"underrun"` 之一。您可以通过 `getSnapshot()` 中的 `stretcher` 字段获取详细状态信息。

<details>
<summary>函数 API 版</summary>

```ts
import { getSnapshot } from "waa-play/adapters";

const playback = play(ctx, buffer, { playbackRate: 0.8 });

playback.on("buffering", ({ reason }) => {
  console.log(`缓冲中... (原因: ${reason})`);
});

playback.on("buffered", ({ stallDuration }) => {
  console.log(`缓冲完成 (${stallDuration.toFixed(0)}ms)`);
});

const snapshot = getSnapshot(playback);
if (snapshot.stretcher) {
  console.log(`节奏: ${snapshot.stretcher.tempo}`);
  console.log(`缓冲区健康度: ${snapshot.stretcher.bufferHealth}`);
  console.log(`转换中: ${snapshot.stretcher.converting}`);
  console.log(`转换进度: ${(snapshot.stretcher.conversionProgress * 100).toFixed(0)}%`);
}
```

</details>

## 3. 节拍序列器

您可以使用时钟和调度器以精确的时序构建节拍模式。

```ts
const waa = new WaaPlayer();
await waa.ensureRunning();

// 合成咔嗒声
const click = waa.createClickBuffer(1000, 0.05);
const accent = waa.createClickBuffer(1500, 0.05);

// 创建时钟和调度器
const clock = waa.createClock({ bpm: 120 });
const scheduler = waa.createScheduler({ lookahead: 0.1 });

// 4/4 拍节拍模式
let beat = 0;
const totalBeats = 16;

function scheduleBeat() {
  const time = clock.beatToTime(beat);
  const isAccent = beat % 4 === 0;

  scheduler.schedule(`beat-${beat}`, time, (t) => {
    // 在重拍上使用重音声音
    waa.play(isAccent ? accent : click);
  });

  beat++;
  if (beat < totalBeats) {
    scheduleBeat();
  }
}

scheduleBeat();
scheduler.start();

// 改变节奏
clock.setBpm(140);
```

使用 `createClock` 创建基于 BPM 的时钟，通过 `createScheduler` 的前瞻调度实现采样精确的时序控制。您可以使用 `createClickBuffer` 合成咔嗒声。

<details>
<summary>函数 API 版</summary>

```ts
import { createContext, ensureRunning } from "waa-play/context";
import { play } from "waa-play/play";
import { createClock, createScheduler } from "waa-play/scheduler";
import { createClickBuffer } from "waa-play/synth";

const ctx = createContext();
await ensureRunning(ctx);

// 合成咔嗒声
const click = createClickBuffer(ctx, 1000, 0.05);
const accent = createClickBuffer(ctx, 1500, 0.05);

// 创建时钟和调度器
const clock = createClock(ctx, { bpm: 120 });
const scheduler = createScheduler(ctx, { lookahead: 0.1 });

// 4/4 拍节拍模式
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

// 改变节奏
clock.setBpm(140);
```

</details>

## 相关 API

- [WaaPlayer](/waa/api/player/)
- [函数 API](/waa/api/functions/)
- [Stretcher](/waa/api/stretcher/)
