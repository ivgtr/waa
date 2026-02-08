---
title: フレームワーク統合
description: React などのフレームワークとの統合パターン、Promise ベースの待機、UI アニメーション連携
---

React などのフレームワークとの統合パターンや、Promise ベースの待機、UI アニメーション連携について説明します。

**使用モジュール**: `adapters`, `play`

## React カスタムフック

`subscribeSnapshot` と `getSnapshot` は React の `useSyncExternalStore` と直接互換性があります。

```tsx
import { useSyncExternalStore, useRef } from "react";
import { WaaPlayer } from "waa-play";
import type { Playback, PlaybackSnapshot } from "waa-play";

// WaaPlayer インスタンスを共有
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

// 使用例
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
          <p>状態: {snapshot.state}</p>
          <p>位置: {snapshot.position.toFixed(1)}s / {snapshot.duration.toFixed(1)}s</p>
          <progress value={snapshot.progress} max={1} />
        </div>
      )}
    </div>
  );
}
```

**解説**: `subscribeSnapshot` は `statechange`, `timeupdate`, `seek`, `ended` イベントを購読し、変更時に callback を呼びます。`getSnapshot` はイミュータブルなスナップショットを返します。この2つの関数は `useSyncExternalStore` の subscribe / getSnapshot パラメータにそのまま対応します。

<details>
<summary>関数 API 版</summary>

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

// 使用例
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
          <p>状態: {snapshot.state}</p>
          <p>位置: {snapshot.position.toFixed(1)}s / {snapshot.duration.toFixed(1)}s</p>
          <progress value={snapshot.progress} max={1} />
        </div>
      )}
    </div>
  );
}
```

</details>

## Promise ベース待機

再生完了やポジション到達を Promise で待機できます。

```ts
import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();
const buffer = await waa.load("/audio/track.mp3");
const playback = waa.play(buffer);

// 再生完了を待つ
await waa.whenEnded(playback);
console.log("再生が完了しました");

// 特定のポジションに到達するのを待つ
const playback2 = waa.play(buffer);
await waa.whenPosition(playback2, 10); // 10秒地点
console.log("10秒に到達しました");
```

**解説**: `whenEnded` は `ended` イベント（自然終了）で resolve する Promise を返します。手動 `stop()` では resolve されません。`whenPosition` は `timeupdate` イベントを監視し、指定ポジションに到達（または超過）したら resolve します。

<details>
<summary>関数 API 版</summary>

```ts
import { createContext, ensureRunning, loadBuffer, play } from "waa-play";
import { whenEnded, whenPosition } from "waa-play/adapters";

const ctx = createContext();
await ensureRunning(ctx);
const buffer = await loadBuffer(ctx, "/audio/track.mp3");
const playback = play(ctx, buffer);

// 再生完了を待つ
await whenEnded(playback);
console.log("再生が完了しました");

// 特定のポジションに到達するのを待つ
const playback2 = play(ctx, buffer);
await whenPosition(playback2, 10); // 10秒地点
console.log("10秒に到達しました");
```

</details>

## スムーズ UI アニメーション

`onFrame` で `requestAnimationFrame` ベースのスムーズなプログレスバー・シーカー更新が可能です。

```ts
import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();
const buffer = await waa.load("/audio/track.mp3");

const progressBar = document.querySelector(".progress-bar") as HTMLElement;
const timeDisplay = document.querySelector(".time") as HTMLElement;

const playback = waa.play(buffer);

// onFrame で毎フレーム UI を更新
const stopFrame = waa.onFrame(playback, (snapshot) => {
  // プログレスバー
  progressBar.style.width = `${snapshot.progress * 100}%`;

  // 時間表示
  const pos = snapshot.position;
  const dur = snapshot.duration;
  timeDisplay.textContent = `${formatTime(pos)} / ${formatTime(dur)}`;
});

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// クリーンアップ
playback.on("ended", () => stopFrame());
```

**解説**: `onFrame` は `requestAnimationFrame` ループを内部で管理し、毎フレーム `PlaybackSnapshot` を callback に渡します。戻り値の関数を呼ぶとループが停止します。`timeupdate`（setInterval ベース、デフォルト 50ms）より滑らかな更新が可能です。

**`timeupdate` イベントとの違い**: `timeupdate` は `setInterval` ベースでバックグラウンドタブでも動作します。`onFrame` は `requestAnimationFrame` ベースで視覚更新に最適ですがバックグラウンドでは停止します。

<details>
<summary>関数 API 版</summary>

```ts
import { createContext, ensureRunning, loadBuffer, play } from "waa-play";
import { onFrame } from "waa-play/adapters";

const ctx = createContext();
await ensureRunning(ctx);
const buffer = await loadBuffer(ctx, "/audio/track.mp3");

const progressBar = document.querySelector(".progress-bar") as HTMLElement;
const timeDisplay = document.querySelector(".time") as HTMLElement;

const playback = play(ctx, buffer);

// onFrame で毎フレーム UI を更新
const stopFrame = onFrame(playback, (snapshot) => {
  // プログレスバー
  progressBar.style.width = `${snapshot.progress * 100}%`;

  // 時間表示
  const pos = snapshot.position;
  const dur = snapshot.duration;
  timeDisplay.textContent = `${formatTime(pos)} / ${formatTime(dur)}`;
});

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// クリーンアップ
playback.on("ended", () => stopFrame());
```

</details>

## 関連 API

- [WaaPlayer](/waa/api/player/)
- [関数 API](/waa/api/functions/)
