// ---------------------------------------------------------------------------
// M5: Audio node factory & graph utilities
// ---------------------------------------------------------------------------

/**
 * Create a `GainNode` with an optional initial value.
 */
export function createGain(ctx: AudioContext, initialValue?: number): GainNode {
  const gain = ctx.createGain();
  if (initialValue !== undefined) {
    gain.gain.value = initialValue;
  }
  return gain;
}

/**
 * Smoothly ramp a `GainNode` to a target value over `duration` seconds using
 * `linearRampToValueAtTime`. This avoids audible clicks when changing volume.
 */
export function rampGain(gain: GainNode, target: number, duration: number): void {
  const now = gain.context.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(target, now + duration);
}

/**
 * Create an `AnalyserNode`.
 */
export function createAnalyser(
  ctx: AudioContext,
  options?: { fftSize?: number; smoothingTimeConstant?: number },
): AnalyserNode {
  const analyser = ctx.createAnalyser();
  if (options?.fftSize !== undefined) analyser.fftSize = options.fftSize;
  if (options?.smoothingTimeConstant !== undefined) {
    analyser.smoothingTimeConstant = options.smoothingTimeConstant;
  }
  return analyser;
}

/**
 * Get the current frequency data from an `AnalyserNode` as `Float32Array`.
 */
export function getFrequencyData(analyser: AnalyserNode): Float32Array {
  const data = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(data);
  return data;
}

/**
 * Get the current frequency data from an `AnalyserNode` as `Uint8Array`.
 */
export function getFrequencyDataByte(analyser: AnalyserNode): Uint8Array {
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  return data;
}

/**
 * Create a `BiquadFilterNode`.
 */
export function createFilter(
  ctx: AudioContext,
  options?: {
    type?: BiquadFilterType;
    frequency?: number;
    Q?: number;
    gain?: number;
  },
): BiquadFilterNode {
  const filter = ctx.createBiquadFilter();
  if (options?.type !== undefined) filter.type = options.type;
  if (options?.frequency !== undefined) filter.frequency.value = options.frequency;
  if (options?.Q !== undefined) filter.Q.value = options.Q;
  if (options?.gain !== undefined) filter.gain.value = options.gain;
  return filter;
}

/**
 * Create a `StereoPannerNode`.
 */
export function createPanner(ctx: AudioContext, pan?: number): StereoPannerNode {
  const panner = ctx.createStereoPanner();
  if (pan !== undefined) {
    panner.pan.value = pan;
  }
  return panner;
}

/**
 * Create a `DynamicsCompressorNode`.
 */
export function createCompressor(
  ctx: AudioContext,
  options?: {
    threshold?: number;
    knee?: number;
    ratio?: number;
    attack?: number;
    release?: number;
  },
): DynamicsCompressorNode {
  const comp = ctx.createDynamicsCompressor();
  if (options?.threshold !== undefined) comp.threshold.value = options.threshold;
  if (options?.knee !== undefined) comp.knee.value = options.knee;
  if (options?.ratio !== undefined) comp.ratio.value = options.ratio;
  if (options?.attack !== undefined) comp.attack.value = options.attack;
  if (options?.release !== undefined) comp.release.value = options.release;
  return comp;
}

/**
 * Connect a series of `AudioNode`s in order (serial chain).
 *
 * ```ts
 * chain(source, gain, analyser, ctx.destination);
 * ```
 */
export function chain(...nodes: AudioNode[]): void {
  for (let i = 0; i < nodes.length - 1; i++) {
    nodes[i]!.connect(nodes[i + 1]!);
  }
}

/**
 * Disconnect a series of `AudioNode`s that were previously chained.
 */
export function disconnectChain(...nodes: AudioNode[]): void {
  for (const node of nodes) {
    try {
      node.disconnect();
    } catch {
      // Already disconnected — safe to ignore.
    }
  }
}
