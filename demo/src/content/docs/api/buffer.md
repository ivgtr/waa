---
title: buffer
description: Audio file loading utilities
---

Functions for loading and decoding audio data into `AudioBuffer` instances.

```ts
import { loadBuffer, loadBufferFromBlob, loadBuffers, getBufferInfo } from "waa-play/buffer";
```

## `loadBuffer()`

```ts
loadBuffer(ctx: AudioContext, url: string, options?: LoadBufferOptions): Promise<AudioBuffer>;
```

Fetch an audio file from a URL and decode it into an `AudioBuffer`. Supports progress tracking via the `onProgress` callback.

```ts
const buffer = await loadBuffer(ctx, "/audio/track.mp3");

// With progress tracking
const buffer = await loadBuffer(ctx, "/audio/track.mp3", {
  onProgress: (progress) => {
    console.log(`${Math.round(progress * 100)}%`);
  },
});
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `ctx` | `AudioContext` | The AudioContext to use for decoding |
| `url` | `string` | URL of the audio file |
| `options.onProgress` | `(progress: number) => void` | Progress callback, `progress` ranges from `0` to `1` |

### Returns

`Promise<AudioBuffer>` - The decoded audio data.

## `loadBufferFromBlob()`

```ts
loadBufferFromBlob(ctx: AudioContext, blob: Blob): Promise<AudioBuffer>;
```

Decode an `AudioBuffer` from a `Blob` or `File` object. Useful for file uploads and drag-and-drop.

```ts
input.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  const buffer = await loadBufferFromBlob(ctx, file);
});
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `ctx` | `AudioContext` | The AudioContext to use for decoding |
| `blob` | `Blob` | The audio data as a Blob or File |

### Returns

`Promise<AudioBuffer>` - The decoded audio data.

## `loadBuffers()`

```ts
loadBuffers(ctx: AudioContext, map: Record<string, string>): Promise<Map<string, AudioBuffer>>;
```

Load multiple audio files in parallel. Takes a key-URL map and returns a `Map` of key-buffer pairs.

```ts
const buffers = await loadBuffers(ctx, {
  kick: "/audio/kick.wav",
  snare: "/audio/snare.wav",
  hihat: "/audio/hihat.wav",
});

const kickBuffer = buffers.get("kick");
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `ctx` | `AudioContext` | The AudioContext to use for decoding |
| `map` | `Record<string, string>` | Object mapping keys to audio file URLs |

### Returns

`Promise<Map<string, AudioBuffer>>` - Map of decoded buffers keyed by the input keys.

## `getBufferInfo()`

```ts
getBufferInfo(buffer: AudioBuffer): BufferInfo;
```

Get metadata about an `AudioBuffer`.

```ts
const info = getBufferInfo(buffer);
// { duration: 3.5, numberOfChannels: 2, sampleRate: 44100, length: 154350 }
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `buffer` | `AudioBuffer` | The AudioBuffer to inspect |

### Returns

```ts
interface BufferInfo {
  duration: number;
  numberOfChannels: number;
  sampleRate: number;
  length: number;
}
```
