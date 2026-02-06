// ---------------------------------------------------------------------------
// M1: AudioContext utilities
// ---------------------------------------------------------------------------

import type { CreateContextOptions } from "./types.js";

/**
 * Create an `AudioContext` with optional configuration.
 *
 * This is the only place in the library where `new AudioContext()` is called.
 * Users are encouraged to create their own context and pass it to other
 * functions — this helper exists purely for convenience.
 */
export function createContext(options?: CreateContextOptions): AudioContext {
  return new AudioContext({
    sampleRate: options?.sampleRate,
    latencyHint: options?.latencyHint,
  });
}

/**
 * Resume a suspended AudioContext (e.g. blocked by autoplay policy).
 *
 * Should be called inside a user-interaction event handler (click, keydown…)
 * if the context is in the `"suspended"` state.
 */
export async function resumeContext(ctx: AudioContext): Promise<void> {
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
}

/**
 * Ensure the context is in the `"running"` state, resuming if necessary.
 */
export async function ensureRunning(ctx: AudioContext): Promise<void> {
  if (ctx.state !== "running") {
    await ctx.resume();
  }
}

/**
 * Shorthand for `ctx.currentTime`.
 */
export function now(ctx: AudioContext): number {
  return ctx.currentTime;
}
