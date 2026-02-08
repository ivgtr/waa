---
title: Stretcher
description: 保持音高的时间拉伸引擎
---

WSOLA（波形相似性重叠相加）时间拉伸引擎，在不影响音高的情况下改变播放速度。使用 Web Worker 进行实时音频处理。

```ts
import { createStretcherEngine } from "waa-play/stretcher";
```

:::note
拉伸引擎通常通过 `play()` 配合 `preservePitch: true` 间接使用。直接使用适用于高级场景。
:::

## `createStretcherEngine()`

```ts
createStretcherEngine(
  ctx: AudioContext,
  buffer: AudioBuffer,
  options: StretcherOptions,
): StretcherEngine;
```

为给定缓冲区创建 WSOLA 时间拉伸引擎。

```ts
const engine = createStretcherEngine(ctx, buffer, {
  tempo: 0.75,
  loop: true,
});

engine.start();
```

## StretcherOptions

```ts
interface StretcherOptions {
  tempo?: number;
  offset?: number;
  loop?: boolean;
  through?: AudioNode[];
  destination?: AudioNode;
  timeupdateInterval?: number;
  workerPoolSize?: number;
}
```

| 选项 | 类型 | 默认值 | 说明 |
|--------|------|---------|-------------|
| `tempo` | `number` | `1` | 时间拉伸比率（0.5 = 半速，2 = 倍速） |
| `offset` | `number` | `0` | 起始位置（秒） |
| `loop` | `boolean` | `false` | 循环播放 |
| `through` | `AudioNode[]` | `[]` | 经由的音频节点 |
| `destination` | `AudioNode` | `ctx.destination` | 输出目标 |
| `timeupdateInterval` | `number` | `250` | 进度事件间隔（ms） |
| `workerPoolSize` | `number` | - | WSOLA 工作线程数 |

## StretcherEngine 方法

### 播放控制

```ts
start(): void;
pause(): void;
resume(): void;
seek(position: number): void;
stop(): void;
```

### 配置

```ts
setTempo(tempo: number): void;
```

在播放过程中改变时间拉伸比率。

```ts
engine.setTempo(1.5); // Speed up to 1.5x
```

### 状态

```ts
getCurrentPosition(): number;
getStatus(): StretcherStatus;
getSnapshot(): PlaybackSnapshot;
```

### 事件

```ts
on(event: string, handler: Function): () => void;
off(event: string, handler: Function): void;
```

### 清理

```ts
dispose(): void;
```

停止播放，终止工作线程，释放所有资源。

## 事件

| 事件 | 说明 |
|-------|-------------|
| `progress` | 位置更新 |
| `bufferhealth` | 缓冲健康状态改变 |
| `buffering` | 工作线程缓冲欠载，音频可能卡顿 |
| `buffered` | 从欠载中恢复 |
| `chunkready` | 新的块处理完成 |
| `complete` | 所有块处理完成 |
| `ended` | 播放到达末尾 |
| `error` | 工作线程发生错误 |

## StretcherStatus

```ts
interface StretcherStatus {
  phase: string;
  conversion: { ... };
  buffer: { ... };
  playback: { ... };
}
```

包含引擎内部状态信息的详细状态对象，包括转换进度、缓冲健康状况和播放位置。

## 通过 play() 使用

使用拉伸器最简单的方式是在 `play()` 函数中指定 `preservePitch: true`：

```ts
import { play } from "waa-play/play";

const playback = play(ctx, buffer, {
  playbackRate: 0.75,
  preservePitch: true,
});

// Change speed while preserving pitch
playback.setPlaybackRate(1.5);
```
