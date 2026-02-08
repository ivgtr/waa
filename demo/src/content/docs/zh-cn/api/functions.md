---
title: 函数 API
description: 支持 Tree-shaking 的函数模块
---

按模块分组的独立、支持 tree-shaking 的函数。每个函数以 `AudioContext` 作为第一个参数（自带 Context 模式）。

```ts
import { createContext } from "waa-play/context";
import { loadBuffer } from "waa-play/buffer";
import { play } from "waa-play/play";

const ctx = createContext();
const buffer = await loadBuffer(ctx, "/audio/track.mp3");
const playback = play(ctx, buffer);
```

---

## play

核心播放引擎。用状态机、位置跟踪和事件系统封装 `AudioBufferSourceNode`。

```ts
import { play } from "waa-play/play";
```

### `play()`

```ts
play(ctx: AudioContext, buffer: AudioBuffer, options?: PlayOptions): Playback;
```

播放 AudioBuffer。返回可控的 `Playback` 句柄。

```ts
const playback = play(ctx, buffer, {
  offset: 10,
  loop: true,
  playbackRate: 1.5,
  through: [gain, filter],
});
```

### PlayOptions

| 选项 | 类型 | 默认值 | 说明 |
|--------|------|---------|-------------|
| `offset` | `number` | `0` | 起始位置（秒） |
| `loop` | `boolean` | `false` | 启用循环 |
| `loopStart` | `number` | `0` | 循环起始点（秒） |
| `loopEnd` | `number` | `duration` | 循环结束点（秒） |
| `playbackRate` | `number` | `1` | 播放速度倍率 |
| `through` | `AudioNode[]` | `[]` | 经由的音频节点（效果链） |
| `destination` | `AudioNode` | `ctx.destination` | 输出目标节点 |
| `timeupdateInterval` | `number` | `250` | `timeupdate` 事件间隔（ms） |
| `preservePitch` | `boolean` | `false` | 变速时保持音高（使用 stretcher 引擎） |

### Playback 方法

```ts
// State
getState(): PlaybackState;    // "playing" | "paused" | "stopped"
getCurrentTime(): number;
getDuration(): number;
getProgress(): number;         // [0, 1]

// Control
pause(): void;
resume(): void;
togglePlayPause(): void;
seek(position: number): void;
stop(): void;

// Configuration
setPlaybackRate(rate: number): void;
setLoop(loop: boolean): void;

// Events
on(event: string, handler: Function): () => void;  // Returns unsubscribe
off(event: string, handler: Function): void;

// Cleanup
dispose(): void;
```

### Playback 事件

| 事件 | 载荷 | 说明 |
|-------|---------|-------------|
| `play` | - | 播放开始 |
| `pause` | - | 已暂停 |
| `resume` | - | 从暂停恢复 |
| `seek` | `number` | 跳转到指定位置（秒） |
| `stop` | - | 播放停止 |
| `ended` | - | 自然播放结束 |
| `loop` | - | 循环回到开头 |
| `statechange` | `PlaybackState` | 状态改变 |
| `timeupdate` | `number` | 位置更新（按 `timeupdateInterval` 间隔触发） |
| `buffering` | - | 拉伸引擎正在缓冲 |
| `buffered` | - | 拉伸引擎缓冲完成 |

### PlaybackSnapshot

```ts
interface PlaybackSnapshot {
  state: PlaybackState;
  position: number;
  duration: number;
  progress: number;
  stretcher?: StretcherSnapshotExtension;
}
```

---

## context

AudioContext 生命周期工具。

```ts
import { createContext, resumeContext, ensureRunning, now } from "waa-play/context";
```

### `createContext()`

```ts
createContext(options?: { sampleRate?: number; latencyHint?: AudioContextLatencyCategory | number }): AudioContext;
```

### `resumeContext()`

```ts
resumeContext(ctx: AudioContext): Promise<void>;
```

恢复已暂停的 AudioContext。应从用户手势处理器中调用。

### `ensureRunning()`

```ts
ensureRunning(ctx: AudioContext): Promise<void>;
```

确保 AudioContext 处于 `"running"` 状态。可安全多次调用。

### `now()`

```ts
now(ctx: AudioContext): number;
```

`ctx.currentTime` 的简写。

---

## buffer

音频文件加载和解码。

```ts
import { loadBuffer, loadBufferFromBlob, loadBuffers, getBufferInfo } from "waa-play/buffer";
```

### `loadBuffer()`

```ts
loadBuffer(ctx: AudioContext, url: string, options?: { onProgress?: (progress: number) => void }): Promise<AudioBuffer>;
```

获取并解码音频文件。通过 `onProgress`（0–1）支持进度跟踪。

### `loadBufferFromBlob()`

```ts
loadBufferFromBlob(ctx: AudioContext, blob: Blob): Promise<AudioBuffer>;
```

从 Blob 或 File 解码 AudioBuffer。

### `loadBuffers()`

```ts
loadBuffers(ctx: AudioContext, map: Record<string, string>): Promise<Map<string, AudioBuffer>>;
```

从键-URL 映射并行加载多个音频文件。

### `getBufferInfo()`

```ts
getBufferInfo(buffer: AudioBuffer): { duration: number; numberOfChannels: number; sampleRate: number; length: number };
```

---

## nodes

音频节点工厂和路由工具。

```ts
import { createGain, rampGain, createAnalyser, createFilter, createPanner, createCompressor, chain, disconnectChain } from "waa-play/nodes";
```

### 节点工厂

```ts
createGain(ctx: AudioContext, initialValue?: number): GainNode;
createAnalyser(ctx: AudioContext, options?: { fftSize?: number; smoothingTimeConstant?: number }): AnalyserNode;
createFilter(ctx: AudioContext, options?: { type?: BiquadFilterType; frequency?: number; Q?: number; gain?: number }): BiquadFilterNode;
createPanner(ctx: AudioContext, pan?: number): StereoPannerNode;
createCompressor(ctx: AudioContext, options?: { threshold?: number; knee?: number; ratio?: number; attack?: number; release?: number }): DynamicsCompressorNode;
```

### 工具函数

```ts
rampGain(gain: GainNode, target: number, duration: number): void;
getFrequencyData(analyser: AnalyserNode): Float32Array;
getFrequencyDataByte(analyser: AnalyserNode): Uint8Array;
```

### 路由

```ts
chain(...nodes: AudioNode[]): void;           // 串联连接节点
disconnectChain(...nodes: AudioNode[]): void;  // 断开已连接的节点链
```

---

## emitter

最小化的类型安全事件发射器。

```ts
import { createEmitter } from "waa-play/emitter";
```

### `createEmitter()`

```ts
createEmitter<Events extends Record<string, unknown>>(): Emitter<Events>;
```

```ts
type MyEvents = { progress: number; complete: void };
const emitter = createEmitter<MyEvents>();

emitter.on("progress", (v) => console.log(v));  // Returns unsubscribe fn
emitter.emit("progress", 0.5);
emitter.clear();  // Remove all handlers
```

### Emitter 方法

```ts
on<K>(event: K, handler: (data: Events[K]) => void): () => void;
off<K>(event: K, handler: (data: Events[K]) => void): void;
emit<K>(event: K, data: Events[K]): void;
clear(event?: keyof Events): void;
```

---

## waveform

从 AudioBuffer 提取可视化波形数据。

```ts
import { extractPeaks, extractPeakPairs, extractRMS } from "waa-play/waveform";
```

### 函数

```ts
extractPeaks(buffer: AudioBuffer, options?: ExtractPeaksOptions): number[];
extractPeakPairs(buffer: AudioBuffer, options?: ExtractPeaksOptions): PeakPair[];
extractRMS(buffer: AudioBuffer, options?: ExtractPeaksOptions): number[];
```

### 选项

| 选项 | 类型 | 默认值 | 说明 |
|--------|------|---------|-------------|
| `resolution` | `number` | `200` | 提取的数据点数量 |
| `channel` | `number` | `0` | 通道索引（`-1` 表示所有通道） |

`PeakPair` 为 `{ min: number; max: number }`。

---

## fade

使用 GainNode 自动化的淡入/淡出和交叉淡化工具。

```ts
import { fadeIn, fadeOut, crossfade, autoFade } from "waa-play/fade";
```

### 函数

```ts
fadeIn(gain: GainNode, target: number, options?: FadeOptions): void;
fadeOut(gain: GainNode, options?: FadeOptions): void;
crossfade(gainA: GainNode, gainB: GainNode, options?: CrossfadeOptions): void;
autoFade(playback: Playback, gain: GainNode, options?: AutoFadeOptions): () => void;
```

`autoFade` 在播放开始时应用淡入，在结束前应用淡出。返回清理函数。

### 选项

| 选项 | 类型 | 默认值 | 说明 |
|--------|------|---------|-------------|
| `duration` | `number` | `1` | 淡化时长（秒） |
| `curve` | `FadeCurve` | `"linear"` | `"linear"` \| `"exponential"` \| `"equal-power"` |

`AutoFadeOptions` 使用 `fadeIn` / `fadeOut`（秒）代替 `duration`。

---

## scheduler

基于预读的事件调度器和 BPM 时钟。

```ts
import { createScheduler, createClock } from "waa-play/scheduler";
```

### `createScheduler()`

```ts
createScheduler(ctx: AudioContext, options?: { lookahead?: number; interval?: number }): Scheduler;
```

| 选项 | 类型 | 默认值 | 说明 |
|--------|------|---------|-------------|
| `lookahead` | `number` | `0.1` | 预读时间（秒） |
| `interval` | `number` | `25` | 定时器间隔（ms） |

**Scheduler 方法：** `schedule(id, time, callback)`, `cancel(id)`, `start()`, `stop()`, `dispose()`。

### `createClock()`

```ts
createClock(ctx: AudioContext, options?: { bpm?: number }): Clock;
```

基于 BPM 的时钟。默认 `120` BPM。

**Clock 方法：** `beatToTime(beat)`, `getCurrentBeat()`, `getNextBeatTime()`, `setBpm(bpm)`, `getBpm()`。

---

## synth

生成合成音频缓冲区。

```ts
import { createSineBuffer, createNoiseBuffer, createClickBuffer } from "waa-play/synth";
```

```ts
createSineBuffer(ctx: AudioContext, frequency: number, duration: number): AudioBuffer;
createNoiseBuffer(ctx: AudioContext, duration: number): AudioBuffer;
createClickBuffer(ctx: AudioContext, frequency: number, duration: number): AudioBuffer;
```

---

## adapters

框架集成工具。兼容 React 的 `useSyncExternalStore`。

```ts
import { getSnapshot, subscribeSnapshot, onFrame, whenEnded, whenPosition } from "waa-play/adapters";
```

### 函数

```ts
getSnapshot(playback: Playback): PlaybackSnapshot;
subscribeSnapshot(playback: Playback, callback: (snap: PlaybackSnapshot) => void): () => void;
onFrame(playback: Playback, callback: (snap: PlaybackSnapshot) => void): () => void;
whenEnded(playback: Playback): Promise<void>;
whenPosition(playback: Playback, position: number): Promise<void>;
```

### React 示例

```tsx
import { useSyncExternalStore } from "react";
import { getSnapshot, subscribeSnapshot } from "waa-play/adapters";

function usePlayback(playback: Playback) {
  return useSyncExternalStore(
    (cb) => subscribeSnapshot(playback, cb),
    () => getSnapshot(playback),
  );
}
```
