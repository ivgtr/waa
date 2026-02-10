// ---------------------------------------------------------------------------
// M7: Fade utilities
// ---------------------------------------------------------------------------

import type {
  AutoFadeOptions,
  CrossfadeOptions,
  FadeCurve,
  FadeOptions,
  Playback,
} from "./types.js";

/** Minimum value used for exponential ramps (cannot ramp to/from 0). */
const EXP_MIN = 0.0001;

function applyRamp(
  node: GainNode,
  from: number,
  to: number,
  duration: number,
  curve: FadeCurve,
): void {
  const param = node.gain;
  const now = node.context.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(from, now);

  switch (curve) {
    case "exponential":
      param.exponentialRampToValueAtTime(Math.max(to, EXP_MIN), now + duration);
      break;
    case "equal-power": {
      // Approximate equal-power with a setValueCurveAtTime.
      const steps = Math.max(Math.ceil(duration * 100), 2);
      const values = new Float32Array(steps);
      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1);
        const gain = from + (to - from) * Math.sin((t * Math.PI) / 2);
        values[i] = gain;
      }
      param.setValueCurveAtTime(values, now, duration);
      break;
    }
    default:
      param.linearRampToValueAtTime(to, now + duration);
      break;
  }
}

/**
 * Fade a `GainNode` in from 0 to `target`.
 */
export function fadeIn(gain: GainNode, target: number, options?: FadeOptions): void {
  const { duration = 1, curve = "linear" } = options ?? {};
  applyRamp(gain, 0, target, duration, curve);
}

/**
 * Fade a `GainNode` out to 0.
 */
export function fadeOut(gain: GainNode, options?: FadeOptions): void {
  const { duration = 1, curve = "linear" } = options ?? {};
  applyRamp(gain, gain.gain.value, 0, duration, curve);
}

/**
 * Crossfade between two `GainNode`s.
 */
export function crossfade(gainA: GainNode, gainB: GainNode, options?: CrossfadeOptions): void {
  const { duration = 1, curve = "linear" } = options ?? {};
  applyRamp(gainA, gainA.gain.value, 0, duration, curve);
  applyRamp(gainB, 0, gainA.gain.value || 1, duration, curve);
}

/**
 * Automatically apply fade-in at start and/or fade-out near end of a Playback.
 * Returns a cleanup function.
 */
export function autoFade(
  playback: Playback,
  gain: GainNode,
  options?: AutoFadeOptions,
): () => void {
  const {
    fadeIn: fadeInDuration = 0,
    fadeOut: fadeOutDuration = 0,
    curve = "linear",
  } = options ?? {};

  const duration = playback.getDuration();
  let fadeOutScheduled = false;

  // Apply fade-in immediately if playing from the start.
  if (fadeInDuration > 0) {
    applyRamp(gain, 0, 1, fadeInDuration, curve);
  }

  const unsub = playback.on("timeupdate", ({ position }) => {
    if (fadeOutDuration > 0 && !fadeOutScheduled && position >= duration - fadeOutDuration) {
      fadeOutScheduled = true;
      applyRamp(gain, gain.gain.value, 0, fadeOutDuration, curve);
    }
  });

  return unsub;
}
