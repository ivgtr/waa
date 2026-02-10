export const tempoChangePlayer = `import { WaaPlayer } from "waa-play";

const waa = new WaaPlayer();
await waa.ensureRunning();
const buffer = await waa.load("/audio/track.mp3");

// Change tempo while preserving pitch (default behavior)
const playback = waa.play(buffer, { playbackRate: 0.8 });

// Change tempo during playback
playback.setPlaybackRate(1.2); // 1.2x speed, pitch maintained

// To change pitch along with tempo, set preservePitch: false
const playback2 = waa.play(buffer, {
  playbackRate: 1.5,
  preservePitch: false,
});` as const;

export const tempoChangeFn = `import { createContext, ensureRunning } from "waa-play/context";
import { loadBuffer } from "waa-play/buffer";
import { play } from "waa-play/play";

const ctx = createContext();
await ensureRunning(ctx);
const buffer = await loadBuffer(ctx, "/audio/track.mp3");

// Change tempo while preserving pitch (default behavior)
const playback = play(ctx, buffer, { playbackRate: 0.8 });

// Change tempo during playback
playback.setPlaybackRate(1.2);

// To change pitch along with tempo, set preservePitch: false
const playback2 = play(ctx, buffer, {
  playbackRate: 1.5,
  preservePitch: false,
});` as const;

export const bufferingMonitorPlayer = `const playback = waa.play(buffer, { playbackRate: 0.8 });

// Monitor buffering start
playback.on("buffering", ({ reason }) => {
  console.log(\`Buffering... (reason: \${reason})\`);
  // Show loading UI
});

// Monitor buffering completion
playback.on("buffered", ({ stallDuration }) => {
  console.log(\`Buffering complete (\${stallDuration.toFixed(0)}ms)\`);
  // Hide loading UI
});

// Check stretcher state via snapshot
const snapshot = waa.getSnapshot(playback);
if (snapshot.stretcher) {
  console.log(\`Tempo: \${snapshot.stretcher.tempo}\`);
  console.log(\`Buffer health: \${snapshot.stretcher.bufferHealth}\`);
  console.log(\`Converting: \${snapshot.stretcher.converting}\`);
  console.log(\`Conversion progress: \${(snapshot.stretcher.conversionProgress * 100).toFixed(0)}%\`);
}` as const;

export const bufferingMonitorFn = `import { getSnapshot } from "waa-play/adapters";

const playback = play(ctx, buffer, { playbackRate: 0.8 });

playback.on("buffering", ({ reason }) => {
  console.log(\`Buffering... (reason: \${reason})\`);
});

playback.on("buffered", ({ stallDuration }) => {
  console.log(\`Buffering complete (\${stallDuration.toFixed(0)}ms)\`);
});

const snapshot = getSnapshot(playback);
if (snapshot.stretcher) {
  console.log(\`Tempo: \${snapshot.stretcher.tempo}\`);
  console.log(\`Buffer health: \${snapshot.stretcher.bufferHealth}\`);
  console.log(\`Converting: \${snapshot.stretcher.converting}\`);
  console.log(\`Conversion progress: \${(snapshot.stretcher.conversionProgress * 100).toFixed(0)}%\`);
}` as const;

export const beatSequencerPlayer = `const waa = new WaaPlayer();
await waa.ensureRunning();

// Synthesize click sounds
const click = waa.createClickBuffer(1000, 0.05);
const accent = waa.createClickBuffer(1500, 0.05);

// Create clock and scheduler
const clock = waa.createClock({ bpm: 120 });
const scheduler = waa.createScheduler({ lookahead: 0.1 });

// 4/4 beat pattern
let beat = 0;
const totalBeats = 16;

function scheduleBeat() {
  const time = clock.beatToTime(beat);
  const isAccent = beat % 4 === 0;

  scheduler.schedule(\`beat-\${beat}\`, time, (t) => {
    // Use accent sound for accent beats
    waa.play(isAccent ? accent : click);
  });

  beat++;
  if (beat < totalBeats) {
    scheduleBeat();
  }
}

scheduleBeat();
scheduler.start();

// Change tempo
clock.setBpm(140);` as const;

export const beatSequencerFn = `import { createContext, ensureRunning } from "waa-play/context";
import { play } from "waa-play/play";
import { createClock, createScheduler } from "waa-play/scheduler";
import { createClickBuffer } from "waa-play/synth";

const ctx = createContext();
await ensureRunning(ctx);

// Synthesize click sounds
const click = createClickBuffer(ctx, 1000, 0.05);
const accent = createClickBuffer(ctx, 1500, 0.05);

// Create clock and scheduler
const clock = createClock(ctx, { bpm: 120 });
const scheduler = createScheduler(ctx, { lookahead: 0.1 });

// 4/4 beat pattern
let beat = 0;
const totalBeats = 16;

function scheduleBeat() {
  const time = clock.beatToTime(beat);
  const isAccent = beat % 4 === 0;

  scheduler.schedule(\`beat-\${beat}\`, time, (t) => {
    play(ctx, isAccent ? accent : click);
  });

  beat++;
  if (beat < totalBeats) {
    scheduleBeat();
  }
}

scheduleBeat();
scheduler.start();

// Change tempo
clock.setBpm(140);` as const;
