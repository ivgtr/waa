// ---------------------------------------------------------------------------
// M9: Buffer synthesis
// ---------------------------------------------------------------------------

/**
 * Create an `AudioBuffer` containing a sine wave.
 * Useful for test tones and debugging.
 */
export function createSineBuffer(
  ctx: AudioContext,
  frequency: number,
  duration: number,
): AudioBuffer {
  const length = Math.ceil(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    data[i] = Math.sin((2 * Math.PI * frequency * i) / ctx.sampleRate);
  }

  return buffer;
}

/**
 * Create an `AudioBuffer` containing white noise.
 */
export function createNoiseBuffer(
  ctx: AudioContext,
  duration: number,
): AudioBuffer {
  const length = Math.ceil(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  return buffer;
}

/**
 * Create an `AudioBuffer` containing a short click/impulse.
 */
export function createClickBuffer(
  ctx: AudioContext,
  frequency: number,
  duration: number,
): AudioBuffer {
  const length = Math.ceil(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    // Exponential decay envelope.
    const envelope = Math.exp((-5 * i) / length);
    data[i] =
      envelope * Math.sin((2 * Math.PI * frequency * i) / ctx.sampleRate);
  }

  return buffer;
}
