---
title: WaaPlayer
description: 封装所有模块的类 API
---

`WaaPlayer` 提供了一个统一的、基于类的接口，封装了 waa-play 的所有模块。它在内部管理自己的 `AudioContext`。

```ts
import { WaaPlayer } from "waa-play";
```

## 构造函数

```ts
new WaaPlayer();
new WaaPlayer(ctx: AudioContext);
new WaaPlayer(options: WaaPlayerOptions);
```

创建新的 WaaPlayer 实例。可以选择性地传入现有的 `AudioContext` 或选项对象。

```ts
// Use default AudioContext
const player = new WaaPlayer();

// Provide your own AudioContext
const ctx = new AudioContext({ sampleRate: 48000 });
const player = new WaaPlayer(ctx);

// Pass options for AudioContext creation
const player = new WaaPlayer({ sampleRate: 48000 });
```

## 属性

### `ctx`

```ts
readonly ctx: AudioContext;
```

底层的 `AudioContext` 实例。

## 上下文方法

### `resume()`

```ts
resume(): Promise<void>;
```

恢复已暂停的 AudioContext。等同于 `resumeContext(ctx)`。

### `ensureRunning()`

```ts
ensureRunning(): Promise<void>;
```

确保 AudioContext 处于 `running` 状态。

### `now()`

```ts
now(): number;
```

返回 AudioContext 的当前时间（`ctx.currentTime`）。

## 缓冲区方法

### `load()`

```ts
load(url: string, options?: LoadBufferOptions): Promise<AudioBuffer>;
```

从 URL 获取并解码音频文件。

```ts
const buffer = await player.load("/audio/track.mp3", {
  onProgress: (p) => console.log(`${Math.round(p * 100)}%`),
});
```

### `loadFromBlob()`

```ts
loadFromBlob(blob: Blob): Promise<AudioBuffer>;
```

从 `Blob` 或 `File` 解码 AudioBuffer。

### `loadAll()`

```ts
loadAll(map: Record<string, string>): Promise<Map<string, AudioBuffer>>;
```

并行加载多个音频文件。

```ts
const buffers = await player.loadAll({
  kick: "/audio/kick.wav",
  snare: "/audio/snare.wav",
});
```

### `getBufferInfo()`

```ts
getBufferInfo(buffer: AudioBuffer): BufferInfo;
```

获取 AudioBuffer 的元数据（duration, channels, sampleRate, length）。

## 播放

### `play()`

```ts
play(buffer: AudioBuffer, options?: PlayOptions): Playback;
```

播放 AudioBuffer。返回可控的 `Playback` 句柄。

```ts
const playback = player.play(buffer, {
  offset: 10,
  loop: true,
  playbackRate: 1.5,
});
```

详见 [play 模块](/waa/zh-cn/api/play/) 了解 `PlayOptions` 和 `Playback` 的详情。

## 节点工厂

### `createGain()`

```ts
createGain(initialValue?: number): GainNode;
```

### `createAnalyser()`

```ts
createAnalyser(options?: { fftSize?: number; smoothingTimeConstant?: number }): AnalyserNode;
```

### `createFilter()`

```ts
createFilter(options?: { type?: BiquadFilterType; frequency?: number; Q?: number; gain?: number }): BiquadFilterNode;
```

### `createPanner()`

```ts
createPanner(pan?: number): StereoPannerNode;
```

### `createCompressor()`

```ts
createCompressor(options?: { threshold?: number; knee?: number; ratio?: number; attack?: number; release?: number }): DynamicsCompressorNode;
```

### `rampGain()`

```ts
rampGain(gain: GainNode, target: number, duration: number): void;
```

对 GainNode 的值进行平滑线性过渡。

### `getFrequencyData()`

```ts
getFrequencyData(analyser: AnalyserNode): Float32Array;
```

### `getFrequencyDataByte()`

```ts
getFrequencyDataByte(analyser: AnalyserNode): Uint8Array;
```

### `chain()`

```ts
chain(...nodes: AudioNode[]): void;
```

将音频节点串联连接。

### `disconnectChain()`

```ts
disconnectChain(...nodes: AudioNode[]): void;
```

断开已连接的节点链。

## 波形

### `extractPeaks()`

```ts
extractPeaks(buffer: AudioBuffer, options?: ExtractPeaksOptions): number[];
```

从 AudioBuffer 提取归一化的峰值振幅 `[0, 1]`。

### `extractPeakPairs()`

```ts
extractPeakPairs(buffer: AudioBuffer, options?: ExtractPeaksOptions): PeakPair[];
```

提取用于波形渲染的 min/max 峰值对。

### `extractRMS()`

```ts
extractRMS(buffer: AudioBuffer, options?: ExtractPeaksOptions): number[];
```

提取 RMS 响度值 `[0, 1]`。

## 淡化

### `fadeIn()`

```ts
fadeIn(gain: GainNode, target: number, options?: FadeOptions): void;
```

### `fadeOut()`

```ts
fadeOut(gain: GainNode, options?: FadeOptions): void;
```

### `crossfade()`

```ts
crossfade(gainA: GainNode, gainB: GainNode, options?: CrossfadeOptions): void;
```

### `autoFade()`

```ts
autoFade(playback: Playback, gain: GainNode, options?: AutoFadeOptions): () => void;
```

在播放开始时自动应用淡入，在结束前自动应用淡出。返回清理函数。

## 调度器

### `createScheduler()`

```ts
createScheduler(options?: SchedulerOptions): Scheduler;
```

### `createClock()`

```ts
createClock(options?: ClockOptions): Clock;
```

## 合成器

### `createSineBuffer()`

```ts
createSineBuffer(frequency: number, duration: number): AudioBuffer;
```

### `createNoiseBuffer()`

```ts
createNoiseBuffer(duration: number): AudioBuffer;
```

### `createClickBuffer()`

```ts
createClickBuffer(frequency: number, duration: number): AudioBuffer;
```

## 适配器

### `getSnapshot()`

```ts
getSnapshot(playback: Playback): PlaybackSnapshot;
```

### `subscribeSnapshot()`

```ts
subscribeSnapshot(playback: Playback, callback: (snap: PlaybackSnapshot) => void): () => void;
```

### `onFrame()`

```ts
onFrame(playback: Playback, callback: (snap: PlaybackSnapshot) => void): () => void;
```

### `whenEnded()`

```ts
whenEnded(playback: Playback): Promise<void>;
```

### `whenPosition()`

```ts
whenPosition(playback: Playback, position: number): Promise<void>;
```

## 生命周期

### `dispose()`

```ts
dispose(): void;
```

关闭 AudioContext 并释放所有资源。调用 `dispose()` 后不应再使用该实例。
