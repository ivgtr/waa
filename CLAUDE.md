# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`waa-play` is a composable Web Audio API utility library. Zero dependencies, tree-shakeable, framework-agnostic, BYO AudioContext.

## Commands

```bash
npm run build        # Build with tsup (ESM + CJS → dist/)
npm run dev          # Build in watch mode
npm test             # Run all tests (unit + browser)
npm run test:unit    # Node unit tests only
npm run test:browser # Playwright browser tests only
npm run test:watch   # Run tests in watch mode
npm run typecheck    # Type check (tsc --noEmit)
npm run lint         # Biome lint
npm run format       # Biome format (auto-fix)
npm run check        # Biome check (lint + format)
```

Run a single test file:
```bash
npx vitest run tests/emitter.test.ts
npx vitest run --project=unit tests/stretcher/wsola.test.ts
```

## Architecture

14 modules, each a separate entry point for tree-shaking:

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
| stretcher | `src/stretcher/index.ts` | WSOLA time-stretch engine (preservePitch playback) |
| player | `src/player.ts` | WaaPlayer class (high-level facade over `play()`) |
| playback-state | `src/playback-state.ts` | Playback state manager (shared state machine) |
| playback-position | `src/playback-position.ts` | Position calculation (pure functions) |

### Key Design Patterns

- **BYO AudioContext**: Every function takes `AudioContext` as first argument. Never creates its own.
- **Function exports only**: No classes (except WaaPlayer). All modules export plain functions.
- **Playback state machine**: `play()` returns a `Playback` object with states `playing` → `paused` → `stopped`. Position tracking uses `AudioContext.currentTime` for hardware-clock accuracy. Timeupdate uses `setInterval` (not rAF) to work in background tabs.
- **Dual build**: tsup outputs both ESM (`dist/index.js`) and CJS (`dist/index.cjs`) with subpath exports per module.

### Types

Core types in `src/types.ts`:
- `PlaybackState = "playing" | "paused" | "stopped"`
- `Playback` — full playback control interface
- `PlaybackSnapshot` — `{ state, position, duration, progress }`
- `PlayOptions` — offset, loop, playbackRate, through, destination, preservePitch, etc.

## Test Setup

- **Vitest 4.x**, projects 構成 (unit + browser)
- `npm run test:unit` — Node 環境の単体テスト
- `npm run test:browser` — Playwright Chromium ブラウザテスト
- `npm test` — 両方実行
- Test location: `tests/**/*.test.ts`, `tests/browser/*.browser.test.ts`
- Shared mocks: `tests/helpers/audio-mocks.ts`
- Coverage excludes: `src/index.ts`, `src/types.ts`

### テスト方針

- **純粋関数テスト** → `tests/<module>.test.ts`（入出力のみ検証）
- **コンポーネントテスト** → `tests/stretcher/<component>.test.ts`（audio-mocks.ts 使用）
- **Race condition テスト** → タイマー + コールバックが絡む箇所には必須（3 パターン: CB先行, dispose前, 連続呼び出し）
- `vi.useFakeTimers()` は動的 `import()` をブロックするため stretched playback テストでは使わない
- Worker モックは `function` キーワード必須（Vitest 4.x で arrow fn は `new` 不可）
- URL モックはコンストラクタ機能を保持する必要あり（Vitest 4.x 内部で `new URL()` を使用）

### バグ防止チェックリスト

コードレビュー・実装時に確認:

- **状態管理**: disposed チェック、不正遷移ガード、コールバック内の状態変更考慮
- **タイマー管理**: clearTimeout/clearInterval の確実な実行、dispose 時の全タイマーキャンセル
- **リソースリーク**: AudioNode disconnect, Worker terminate, Blob URL revoke
- **async 競合**: dynamic import の disposed チェック、pending 操作キュー
- **Stretcher 固有**: currentChunkIndex は onTransition でのみ更新、synthesisHop 固定・analysisHop を tempo 依存に

## Build Configuration

- Target: ES2020
- TypeScript: strict mode with `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`
- tsup: splitting enabled, sourcemaps, no minification
- Each module in `src/` is a separate entry point in `tsup.config.ts`
- Linter/Formatter: Biome (`biome.json`)

## Adding a New Module

1. `src/<module>.ts` 作成（BYO AudioContext パターン）
2. 型を `src/types.ts` に追加
3. `tsup.config.ts` にエントリ追加
4. `package.json` の `exports` にサブパス追加
5. `src/index.ts` から re-export
6. テスト作成（`tests/<module>.test.ts`）
7. この CLAUDE.md の Architecture テーブルに追記

## Demo Site

Located in `demo/`. Built with Vite + vanilla TypeScript. Deployed to GitHub Pages via `.github/workflows/deploy-demo.yml` on push to main.
