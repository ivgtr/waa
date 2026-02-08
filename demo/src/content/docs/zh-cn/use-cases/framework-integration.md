---
title: 框架集成
description: 与 React 等框架的集成模式、基于 Promise 的等待以及 UI 动画同步
---

本指南介绍与 React 等框架的集成模式、基于 Promise 的等待以及 UI 动画同步。

**使用的模块**: `adapters`, `play`

## React 自定义 Hook

`subscribeSnapshot` 和 `getSnapshot` 与 React 的 `useSyncExternalStore` 直接兼容。

```tsx
import { useSyncExternalStore, useRef } from "react";
import { WaaPlayer } from "waa-play";
import type { Playback, PlaybackSnapshot } from "waa-play";

// 共享 WaaPlayer 实例
const waa = new WaaPlayer();

function usePlaybackSnapshot(playback: Playback | null): PlaybackSnapshot | null {
  return useSyncExternalStore(
    (callback) => {
      if (!playback) return () => {};
      return waa.subscribeSnapshot(playback, callback);
    },
    () => (playback ? waa.getSnapshot(playback) : null),
  );
}

// 使用示例
function AudioPlayer({ url }: { url: string }) {
  const playbackRef = useRef<Playback | null>(null);
  const snapshot = usePlaybackSnapshot(playbackRef.current);

  async function handlePlay() {
    await waa.ensureRunning();
    const buffer = await waa.load(url);
    playbackRef.current = waa.play(buffer);
  }

  return (
    <div>
      <button onClick={handlePlay}>Play</button>
      {snapshot && (
        <div>
          <p>状态: {snapshot.state}</p>
          <p>位置: {snapshot.position.toFixed(1)}s / {snapshot.duration.toFixed(1)}s</p>
          <progress value={snapshot.progress} max={1} />
        </div>
      )}
    </div>
  );
}
```

**说明**: `subscribeSnapshot` 订阅 `statechange`、`timeupdate`、`seek` 和 `ended` 事件，在变化时调用 callback。`getSnapshot` 返回不可变的快照。这两个函数直接对应 `useSyncExternalStore` 的 subscribe / getSnapshot 参数。

<details>
<summary>函数 API 版</summary>

```tsx
import { useSyncExternalStore, useRef } from "react";
import { subscribeSnapshot, getSnapshot, play, loadBuffer, ensureRunning } from "waa-play/adapters";
import type { Playback, PlaybackSnapshot } from "waa-play";

function usePlaybackSnapshot(playback: Playback | null): PlaybackSnapshot | null {
  return useSyncExternalStore(
    (callback) => {
      if (!playback) return () => {};
      return subscribeSnapshot(playback, callback);
    },
    () => (playback ? getSnapshot(playback) : null),
  );
}

// 使用示例
function AudioPlayer({ url }: { url: string }) {
  const ctxRef = useRef<AudioContext>(new AudioContext());
  const playbackRef = useRef<Playback | null>(null);
  const snapshot = usePlaybackSnapshot(playbackRef.current);

  async function handlePlay() {
    const ctx = ctxRef.current;
    await ensureRunning(ctx);
    const buffer = await loadBuffer(ctx, url);
    playbackRef.current = play(ctx, buffer);
  }

  return (
    <div>
      <button onClick={handlePlay}>Play</button>
      {snapshot && (
        <div>
          <p>状态: {snapshot.state}</p>
          <p>位置: {snapshot.position.toFixed(1)}s / {snapshot.duration.toFixed(1)}s</p>
          <progress value={snapshot.progress} max={1} />
        </div>
      )}
    </div>
  );
}
```

</details>

## 基于 Promise 的等待

您可以使用 Promise 等待播放完成或到达指定位置。

```ts
import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();
const buffer = await waa.load("/audio/track.mp3");
const playback = waa.play(buffer);

// 等待播放完成
await waa.whenEnded(playback);
console.log("播放已完成");

// 等待到达特定位置
const playback2 = waa.play(buffer);
await waa.whenPosition(playback2, 10); // 10 秒位置
console.log("已到达 10 秒");
```

**说明**: `whenEnded` 返回一个在 `ended` 事件（自然结束）时 resolve 的 Promise。手动 `stop()` 不会 resolve。`whenPosition` 监听 `timeupdate` 事件，在到达（或超过）指定位置时 resolve。

<details>
<summary>函数 API 版</summary>

```ts
import { createContext, ensureRunning, loadBuffer, play } from "waa-play";
import { whenEnded, whenPosition } from "waa-play/adapters";

const ctx = createContext();
await ensureRunning(ctx);
const buffer = await loadBuffer(ctx, "/audio/track.mp3");
const playback = play(ctx, buffer);

// 等待播放完成
await whenEnded(playback);
console.log("播放已完成");

// 等待到达特定位置
const playback2 = play(ctx, buffer);
await whenPosition(playback2, 10); // 10 秒位置
console.log("已到达 10 秒");
```

</details>

## 平滑 UI 动画

`onFrame` 基于 `requestAnimationFrame` 实现平滑的进度条和播放器更新。

```ts
import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();
const buffer = await waa.load("/audio/track.mp3");

const progressBar = document.querySelector(".progress-bar") as HTMLElement;
const timeDisplay = document.querySelector(".time") as HTMLElement;

const playback = waa.play(buffer);

// 使用 onFrame 每帧更新 UI
const stopFrame = waa.onFrame(playback, (snapshot) => {
  // 进度条
  progressBar.style.width = `${snapshot.progress * 100}%`;

  // 时间显示
  const pos = snapshot.position;
  const dur = snapshot.duration;
  timeDisplay.textContent = `${formatTime(pos)} / ${formatTime(dur)}`;
});

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// 清理
playback.on("ended", () => stopFrame());
```

**说明**: `onFrame` 内部管理 `requestAnimationFrame` 循环，每帧将 `PlaybackSnapshot` 传递给 callback。调用返回的函数可停止循环。相比 `timeupdate`（基于 setInterval，默认 50ms），可实现更平滑的更新。

**与 `timeupdate` 事件的区别**: `timeupdate` 基于 setInterval，在后台标签页中也能工作。`onFrame` 基于 requestAnimationFrame，适合视觉更新，但在后台会暂停。

<details>
<summary>函数 API 版</summary>

```ts
import { createContext, ensureRunning, loadBuffer, play } from "waa-play";
import { onFrame } from "waa-play/adapters";

const ctx = createContext();
await ensureRunning(ctx);
const buffer = await loadBuffer(ctx, "/audio/track.mp3");

const progressBar = document.querySelector(".progress-bar") as HTMLElement;
const timeDisplay = document.querySelector(".time") as HTMLElement;

const playback = play(ctx, buffer);

// 使用 onFrame 每帧更新 UI
const stopFrame = onFrame(playback, (snapshot) => {
  // 进度条
  progressBar.style.width = `${snapshot.progress * 100}%`;

  // 时间显示
  const pos = snapshot.position;
  const dur = snapshot.duration;
  timeDisplay.textContent = `${formatTime(pos)} / ${formatTime(dur)}`;
});

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// 清理
playback.on("ended", () => stopFrame());
```

</details>

## 相关 API

- [WaaPlayer](/waa/api/player/)
- [函数 API](/waa/api/functions/)
