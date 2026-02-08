# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`waa-play` is a composable Web Audio API utility library. Zero dependencies, tree-shakeable, framework-agnostic, BYO AudioContext.

## Commands

```bash
npm run build        # Build with tsup (ESM + CJS → dist/)
npm run dev          # Build in watch mode
npm test             # Run tests once (vitest)
npm run test:watch   # Run tests in watch mode
npm run typecheck    # Type check (tsc --noEmit)
```

Run a single test file:
```bash
npx vitest run tests/emitter.test.ts
```

## Architecture

10 independent modules, each a separate entry point for tree-shaking:

| Module | File | Purpose |
|--------|------|---------|
| context | `src/context.ts` | AudioContext lifecycle (`createContext`, `ensureRunning`, `now`) |
| buffer | `src/buffer.ts` | Audio file loading (`loadBuffer`, `loadBufferFromBlob`) |
| play | `src/play.ts` | **Core playback engine** — returns `Playback` object wrapping `AudioBufferSourceNode` |
| emitter | `src/emitter.ts` | Type-safe event emitter (`createEmitter<Events>()`) |
| nodes | `src/nodes.ts` | Audio node factories + `chain()` / `disconnectChain()` |
| waveform | `src/waveform.ts` | Peak/RMS extraction from AudioBuffer |
| fade | `src/fade.ts` | Fade in/out, crossfade utilities |
| scheduler | `src/scheduler.ts` | Scheduler and clock |
| synth | `src/synth.ts` | Buffer synthesis (sine, noise, click) |
| adapters | `src/adapters.ts` | Framework integration (`getSnapshot`, `subscribeSnapshot`, `onFrame`) |

### Key Design Patterns

- **BYO AudioContext**: Every function takes `AudioContext` as first argument. Never creates its own.
- **Function exports only**: No classes. All modules export plain functions.
- **Playback state machine**: `play()` returns a `Playback` object with states `playing` → `paused` → `stopped`. Position tracking uses `AudioContext.currentTime` for hardware-clock accuracy. Timeupdate uses `setInterval` (not rAF) to work in background tabs.
- **Dual build**: tsup outputs both ESM (`dist/index.js`) and CJS (`dist/index.cjs`) with subpath exports per module.

### Types

Core types in `src/types.ts`:
- `PlaybackState = "playing" | "paused" | "stopped"`
- `Playback` — full playback control interface
- `PlaybackSnapshot` — `{ state, position, duration, progress }`
- `PlayOptions` — offset, loop, playbackRate, through, destination, etc.

## Test Setup

- Framework: Vitest with `globals: true`, environment: `node`
- Test location: `tests/**/*.test.ts`
- Coverage excludes: `src/index.ts`, `src/types.ts`

## Build Configuration

- Target: ES2020
- TypeScript: strict mode with `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`
- tsup: splitting enabled, sourcemaps, no minification
- Each module in `src/` is a separate entry point in `tsup.config.ts`

## Demo Site

Located in `demo/`. Built with Vite + vanilla TypeScript. Deployed to GitHub Pages via `.github/workflows/deploy-demo.yml` on push to main.
