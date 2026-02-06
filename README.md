# waa

**Composable Web Audio API utilities.** BYO AudioContext. Framework-agnostic. Sample-accurate.

既存のオーディオライブラリが抱える問題 — AudioContextの囲い込み、重い依存関係、フレームワーク固定 — を解決するために設計されたユーティリティライブラリです。

## Design Principles

| 原則 | 説明 |
|------|------|
| **BYO AudioContext** | コンテキストを外部から注入。複数ライブラリ間での共有が自由 |
| **Composable** | モノリシックなPlayerクラスではなく、組み合わせ可能な関数群 |
| **Zero Dependencies** | Web Audio API のみに依存。バンドルサイズ最小 |
| **Framework-agnostic** | React / Vue / Svelte / Vanilla JS — どこからでも同じAPI |
| **Sample-accurate** | AudioContext.currentTime ベースの精密な再生位置追跡 |
| **Tree-shakeable** | 使う関数だけがバンドルに含まれる |

## Why Web Audio API?

HTML5 `<audio>` 要素の `currentTime` は、ブラウザやコーデックの実装に依存し、特にMP3等の圧縮フォーマットではフレーム境界の問題でミリ秒単位のずれが生じます。Web Audio API の `AudioContext.currentTime` はハードウェアクロックに基づいており、サンプル単位の精度を保証します。

## Install

```bash
npm install waa
```

## Quick Start

```ts
import { createContext, loadBuffer, play, createGain } from "waa";

// 1. AudioContext を作成（または既存のものを使用）
const ctx = createContext();  // = new AudioContext() + 便利なデフォルト値

// 2. 音声ファイルをロード
const buffer = await loadBuffer(ctx, "/audio/track.mp3");

// 3. 再生（ゲインノード経由）
const gain = createGain(ctx, 0.8);
const playback = play(ctx, buffer, { through: [gain] });

// 4. UIと連携
playback.on("timeupdate", ({ position, duration }) => {
  progressBar.style.width = `${(position / duration) * 100}%`;
});

// 5. 操作
playback.pause();
playback.seek(30);
playback.resume();
```

## Architecture

```
┌─────────────┐
│ Your App/UI  │  React, Vue, Svelte, Vanilla...
└──────┬───────┘
       │ import { play, createGain, ... }
┌──────▼───────────────────────────────────────┐
│  waa                                          │
│                                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ playback │ │  nodes   │ │  waveform    │  │
│  │          │ │          │ │              │  │
│  │ play()   │ │ gain     │ │ extractPeaks │  │
│  │ pause()  │ │ filter   │ │ extractRMS   │  │
│  │ seek()   │ │ analyser │ │              │  │
│  │ events   │ │ panner   │ └──────────────┘  │
│  └──────────┘ │ chain()  │ ┌──────────────┐  │
│  ┌──────────┐ └──────────┘ │  scheduler   │  │
│  │ buffer   │ ┌──────────┐ │              │  │
│  │          │ │  fade    │ │ clock        │  │
│  │ load     │ │          │ │ schedule()   │  │
│  │ decode   │ │ fadeIn   │ └──────────────┘  │
│  └──────────┘ │ fadeOut  │ ┌──────────────┐  │
│  ┌──────────┐ │ xfade   │ │  adapters    │  │
│  │ context  │ └──────────┘ │              │  │
│  │          │ ┌──────────┐ │ snapshot     │  │
│  │ create   │ │  synth   │ │ onFrame      │  │
│  │ resume   │ │          │ │ whenEnded    │  │
│  └──────────┘ │ sine     │ └──────────────┘  │
│  ┌──────────┐ │ noise    │                    │
│  │ emitter  │ │ click    │                    │
│  └──────────┘ └──────────┘                    │
└──────────────────┬───────────────────────────┘
                   │ BYO AudioContext
┌──────────────────▼───────────────────────────┐
│  Web Audio API (Browser Native)               │
└───────────────────────────────────────────────┘
```

## Module Reference

### `context` — AudioContext Utilities

```ts
import { createContext, resumeContext, ensureRunning, now } from "waa";

const ctx = createContext({ sampleRate: 48000, latencyHint: "interactive" });

// ブラウザの自動再生ポリシー対応
button.addEventListener("click", () => resumeContext(ctx));

// 現在のハードウェアクロック時刻
console.log(now(ctx)); // 12.345678...
```

### `buffer` — Audio Loading

```ts
import { loadBuffer, loadBufferFromBlob, loadBuffers, getBufferInfo } from "waa";

// URL からロード（プログレス付き）
const buffer = await loadBuffer(ctx, "/audio/song.mp3", {
  onProgress: (p) => console.log(`${Math.round(p * 100)}%`),
});

// File input からロード
input.onchange = async (e) => {
  const buffer = await loadBufferFromBlob(ctx, e.target.files[0]);
};

// 複数同時ロード
const sounds = await loadBuffers(ctx, {
  kick: "/audio/kick.wav",
  snare: "/audio/snare.wav",
  hihat: "/audio/hihat.wav",
});
const kickBuffer = sounds.get("kick")!;

// メタデータ
const info = getBufferInfo(buffer);
// { duration: 180.5, numberOfChannels: 2, sampleRate: 44100, length: 7954050 }
```

### `play` — Playback Engine

```ts
import { play } from "waa";

const playback = play(ctx, buffer, {
  offset: 10,           // 10秒目から開始
  loop: true,           // ループ再生
  loopStart: 5,         // ループ開始点
  loopEnd: 60,          // ループ終了点
  playbackRate: 1.25,   // 1.25倍速
  through: [gain, analyser], // 経由するノード
  destination: ctx.destination,
  timeupdateInterval: 16, // ~60fps for UI sync
});

// State
playback.getState();        // "playing" | "paused" | "stopped"
playback.getCurrentTime();  // 正確な再生位置（秒）
playback.getDuration();     // バッファの長さ（秒）
playback.getProgress();     // 0-1

// Controls
playback.pause();
playback.resume();
playback.togglePlayPause();
playback.seek(45.5);
playback.setPlaybackRate(2);
playback.setLoop(false);
playback.stop();

// Events
playback.on("play", ({ position }) => {});
playback.on("pause", ({ position }) => {});
playback.on("resume", ({ position }) => {});
playback.on("seek", ({ position }) => {});
playback.on("timeupdate", ({ position, duration }) => {});
playback.on("statechange", ({ state, position }) => {});
playback.on("ended", () => {});
playback.on("loop", ({ count }) => {});

// Cleanup
playback.dispose();
```

### `nodes` — Audio Graph Building Blocks

全てのファクトリ関数は **標準の Web Audio API ノード** を返します。ラッパーなし。

```ts
import {
  createGain, rampGain,
  createAnalyser, getFrequencyData,
  createFilter, createPanner, createCompressor,
  chain, disconnectChain,
} from "waa";

// Gain
const gain = createGain(ctx, 0.8);
rampGain(gain, 0.5, 0.1); // スムーズなボリューム変更（クリック防止）

// Analyser（ビジュアライゼーション用）
const analyser = createAnalyser(ctx, { fftSize: 4096 });
const freqData = getFrequencyData(analyser); // Float32Array

// Filter
const lowpass = createFilter(ctx, {
  type: "lowpass",
  frequency: 2000,
  Q: 1,
});

// Panner
const panner = createPanner(ctx, -0.5); // 少し左寄り

// ノードチェーン接続
chain(sourceNode, gain, lowpass, analyser, panner);
panner.connect(ctx.destination);

// 切断
disconnectChain(gain, lowpass, analyser, panner);
```

### `waveform` — Waveform Extraction

```ts
import { extractPeaks, extractPeakPairs, extractRMS } from "waa";

// SoundCloud風のピークデータ
const peaks = extractPeaks(buffer, { resolution: 500 });
peaks.forEach((peak, i) => {
  ctx2d.fillRect(i * barWidth, canvas.height * (1 - peak), barWidth - 1, canvas.height * peak);
});

// 詳細な波形（min/max ペア）
const pairs = extractPeakPairs(buffer, { resolution: 300 });

// RMS（知覚ラウドネス）
const rms = extractRMS(buffer, { resolution: 200, channel: -1 }); // 全チャンネル平均
```

### `fade` — Fade Utilities

```ts
import { fadeIn, fadeOut, crossfade, autoFade, createGain } from "waa";

const gain = createGain(ctx, 0);
const playback = play(ctx, buffer, { through: [gain] });

fadeIn(gain, 1, { duration: 2, curve: "equal-power" });

// 自動フェードイン・アウト
const cleanup = autoFade(playback, gain, {
  fadeInDuration: 0.5,
  fadeOutDuration: 1,
  curve: "exponential",
});

// クロスフェード
const gainA = createGain(ctx, 1);
const gainB = createGain(ctx, 0);
crossfade(gainA, gainB, { duration: 3, curve: "equal-power" });
```

### `scheduler` & `clock` — Precise Timing

```ts
import { createScheduler, createClock } from "waa";

// Scheduler
const scheduler = createScheduler(ctx, { lookahead: 0.1 });
scheduler.start();
scheduler.schedule("event-1", ctx.currentTime + 1.5, (time) => {
  console.log("Fired at", time);
});

// Clock（BPM ベース）
const clock = createClock(ctx, { bpm: 128, beatsPerBar: 4 });
console.log(clock.getCurrentBeat());
console.log(clock.getNextBeatTime());

// ビートに合わせてスケジュール
for (let beat = 0; beat < 16; beat++) {
  scheduler.schedule(`beat-${beat}`, clock.beatToTime(beat), (time) => {
    play(ctx, kickBuffer); // ビートごとにキック
  });
}
```

### `synth` — Buffer Synthesis

```ts
import { createSineBuffer, createNoiseBuffer, createClickBuffer } from "waa";

// テストトーン
const tone = createSineBuffer(ctx, 440, 1); // 440Hz, 1秒

// ホワイトノイズ
const noise = createNoiseBuffer(ctx, 2);

// クリック音（メトロノーム等）
const click = createClickBuffer(ctx, 1000, 0.02);
```

### `adapters` — Framework Integration

```ts
import { subscribeSnapshot, getSnapshot, onFrame, whenEnded } from "waa";
```

#### React

```tsx
import { useSyncExternalStore, useCallback } from "react";
import { subscribeSnapshot, getSnapshot, type Playback } from "waa";

function usePlayback(playback: Playback | null) {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (!playback) return () => {};
      return subscribeSnapshot(playback, cb);
    },
    [playback],
  );

  return useSyncExternalStore(
    subscribe,
    () => (playback ? getSnapshot(playback) : null),
  );
}

// Usage
function Player({ playback }: { playback: Playback }) {
  const snap = usePlayback(playback);
  if (!snap) return null;

  return (
    <div>
      <span>{snap.position.toFixed(1)}s / {snap.duration.toFixed(1)}s</span>
      <progress value={snap.progress} max={1} />
      <button onClick={() => playback.togglePlayPause()}>
        {snap.state === "playing" ? "⏸" : "▶"}
      </button>
    </div>
  );
}
```

#### Vue

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { subscribeSnapshot, getSnapshot, type Playback } from "waa";

const props = defineProps<{ playback: Playback }>();
const snap = ref(getSnapshot(props.playback));

let unsub: (() => void) | null = null;
onMounted(() => {
  unsub = subscribeSnapshot(props.playback, () => {
    snap.value = getSnapshot(props.playback);
  });
});
onUnmounted(() => unsub?.());
</script>
```

#### Svelte

```svelte
<script lang="ts">
  import { writable } from "svelte/store";
  import { onDestroy } from "svelte";
  import { subscribeSnapshot, getSnapshot, type Playback } from "waa";

  export let playback: Playback;

  const snap = writable(getSnapshot(playback));
  const unsub = subscribeSnapshot(playback, () => snap.set(getSnapshot(playback)));
  onDestroy(unsub);
</script>

<progress value={$snap.progress} max={1} />
```

#### Canvas / WebGL Visualization

```ts
import { onFrame, createAnalyser, getFrequencyDataByte } from "waa";

const analyser = createAnalyser(ctx, { fftSize: 256 });
const playback = play(ctx, buffer, { through: [analyser] });

const stop = onFrame(playback, (position, duration) => {
  const freqData = getFrequencyDataByte(analyser);
  // Canvas/WebGL rendering here
  drawBars(canvasCtx, freqData);
});
```

#### Async/Await

```ts
import { whenEnded, whenPosition } from "waa";

// 再生完了を待つ
const playback = play(ctx, buffer);
await whenEnded(playback);
console.log("Done!");

// 特定位置を待つ
await whenPosition(playback, 30);
console.log("Reached 30 seconds");
```

## BYO AudioContext — Why It Matters

```ts
// 他のライブラリが作った AudioContext を共有
import { play, loadBuffer } from "waa";
import { Tone } from "tone"; // or any other library

const ctx = Tone.context.rawContext; // Tone.js の AudioContext を流用
const buffer = await loadBuffer(ctx, "/audio/track.mp3");
const playback = play(ctx, buffer);
```

```ts
// 1つの AudioContext で複数の waa インスタンスを並行再生
const ctx = new AudioContext();
const [trackA, trackB] = await Promise.all([
  loadBuffer(ctx, "/a.mp3"),
  loadBuffer(ctx, "/b.mp3"),
]);

const playbackA = play(ctx, trackA);
const playbackB = play(ctx, trackB, { offset: 2 }); // 2秒遅れで開始
```

## Tree-shaking / Subpath Imports

必要なモジュールだけをインポート:

```ts
// メインエントリから
import { play, loadBuffer } from "waa";

// サブパスから（より明示的）
import { play } from "waa/playback";
import { loadBuffer } from "waa/buffer";
import { extractPeaks } from "waa/waveform";
```

## License

MIT
