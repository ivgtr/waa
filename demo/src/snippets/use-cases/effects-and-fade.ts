export const volumeControlPlayer = `import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();

const buffer = await waa.load("/audio/track.mp3");
const gain = waa.createGain(0.5); // Initial volume 50%

const playback = waa.play(buffer, { through: [gain] });

// Ramp to 100% volume over 3 seconds
waa.rampGain(gain, 1.0, 3);` as const;

export const volumeControlFn = `import { createContext, ensureRunning } from "waa-play/context";
import { loadBuffer } from "waa-play/buffer";
import { createGain, rampGain } from "waa-play/nodes";
import { play } from "waa-play/play";

const ctx = createContext();
await ensureRunning(ctx);

const buffer = await loadBuffer(ctx, "/audio/track.mp3");
const gain = createGain(ctx, 0.5);

const playback = play(ctx, buffer, { through: [gain] });
rampGain(gain, 1.0, 3);` as const;

export const stereoPanPlayer = `import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();

const buffer = await waa.load("/audio/track.mp3");
const panner = waa.createPanner(0); // Center

const playback = waa.play(buffer, { through: [panner] });

// Pan left
panner.pan.value = -1;

// Pan right
panner.pan.value = 1;

// Back to center
panner.pan.value = 0;` as const;

export const stereoPanFn = `import { createContext, ensureRunning } from "waa-play/context";
import { loadBuffer } from "waa-play/buffer";
import { createPanner } from "waa-play/nodes";
import { play } from "waa-play/play";

const ctx = createContext();
await ensureRunning(ctx);

const buffer = await loadBuffer(ctx, "/audio/track.mp3");
const panner = createPanner(ctx, 0);

const playback = play(ctx, buffer, { through: [panner] });
panner.pan.value = -1; // Left` as const;

export const effectChainPlayer = `import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();

const buffer = await waa.load("/audio/track.mp3");

// Build effect chain
const gain = waa.createGain(0.8);
const filter = waa.createFilter({ type: "lowpass", frequency: 1000 });
const compressor = waa.createCompressor();
const panner = waa.createPanner(0.5);

// Auto-chain: gain → filter → compressor → panner → destination
const playback = waa.play(buffer, {
  through: [gain, filter, compressor, panner],
});

// Adjust filter frequency
filter.frequency.value = 500;` as const;

export const effectChainFn = `import { createContext, ensureRunning } from "waa-play/context";
import { loadBuffer } from "waa-play/buffer";
import {
  createGain,
  createFilter,
  createCompressor,
  createPanner,
  chain,
} from "waa-play/nodes";
import { play } from "waa-play/play";

const ctx = createContext();
await ensureRunning(ctx);

const buffer = await loadBuffer(ctx, "/audio/track.mp3");

const gain = createGain(ctx, 0.8);
const filter = createFilter(ctx, { type: "lowpass", frequency: 1000 });
const compressor = createCompressor(ctx);
const panner = createPanner(ctx, 0.5);

// Explicitly connect with chain()
chain(gain, filter, compressor, panner);

const playback = play(ctx, buffer, { through: [gain] });` as const;

export const fadeInOutPlayer = `import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();

const buffer = await waa.load("/audio/track.mp3");
const gain = waa.createGain(0); // Start at 0 volume

const playback = waa.play(buffer, { through: [gain] });

// Fade in over 2 seconds (equal-power curve)
waa.fadeIn(gain, 1, { duration: 2, curve: "equal-power" });

// Fade out over 2 seconds
setTimeout(() => {
  waa.fadeOut(gain, { duration: 2 });
}, 5000);` as const;

export const autoFadePlayer = `import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();

const buffer = await waa.load("/audio/track.mp3");
const gain = waa.createGain(0);

const playback = waa.play(buffer, { through: [gain] });

// Fade in 1s at start, fade out 2s over the last 2 seconds
waa.autoFade(playback, gain, { fadeIn: 1, fadeOut: 2 });` as const;

export const fadeInOutFn = `import { createContext, ensureRunning } from "waa-play/context";
import { loadBuffer } from "waa-play/buffer";
import { createGain } from "waa-play/nodes";
import { play } from "waa-play/play";
import { fadeIn, fadeOut, autoFade } from "waa-play/fade";

const ctx = createContext();
await ensureRunning(ctx);

const buffer = await loadBuffer(ctx, "/audio/track.mp3");
const gain = createGain(ctx, 0);

const playback = play(ctx, buffer, { through: [gain] });

// Fade in
fadeIn(gain, 1, { duration: 2, curve: "equal-power" });

// Auto fade
autoFade(playback, gain, { fadeIn: 1, fadeOut: 2 });` as const;

export const crossfadePlayer = `import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();

const bufferA = await waa.load("/audio/track-a.mp3");
const bufferB = await waa.load("/audio/track-b.mp3");

// Track A (full volume)
const gainA = waa.createGain(1);
const playbackA = waa.play(bufferA, { through: [gainA], loop: true });

// Track B (muted)
const gainB = waa.createGain(0);
const playbackB = waa.play(bufferB, { through: [gainB], loop: true });

// Crossfade from track A to track B over 3 seconds
setTimeout(() => {
  waa.crossfade(gainA, gainB, { duration: 3, curve: "equal-power" });
}, 5000);` as const;

export const crossfadeFn = `import { createContext, ensureRunning } from "waa-play/context";
import { loadBuffer } from "waa-play/buffer";
import { createGain } from "waa-play/nodes";
import { play } from "waa-play/play";
import { crossfade } from "waa-play/fade";

const ctx = createContext();
await ensureRunning(ctx);

const bufferA = await loadBuffer(ctx, "/audio/track-a.mp3");
const bufferB = await loadBuffer(ctx, "/audio/track-b.mp3");

const gainA = createGain(ctx, 1);
const playbackA = play(ctx, bufferA, { through: [gainA], loop: true });

const gainB = createGain(ctx, 0);
const playbackB = play(ctx, bufferB, { through: [gainB], loop: true });

setTimeout(() => {
  crossfade(gainA, gainB, { duration: 3, curve: "equal-power" });
}, 5000);` as const;
