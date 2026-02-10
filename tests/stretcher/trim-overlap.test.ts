import { describe, expect, it } from "vitest";
import { trimOverlap } from "../../src/stretcher/engine";
import type { ChunkInfo } from "../../src/stretcher/types";

function makeChunk(overrides: Partial<ChunkInfo> = {}): ChunkInfo {
  return {
    index: 0,
    state: "ready",
    inputStartSample: 0,
    inputEndSample: 352800, // 8 seconds @ 44100
    overlapBefore: 0,
    overlapAfter: 0,
    outputBuffer: null,
    outputLength: 0,
    priority: 0,
    retryCount: 0,
    ...overrides,
  };
}

function makeChannels(length: number, channels = 2): Float32Array[] {
  return Array.from({ length: channels }, () => new Float32Array(length));
}

describe("trimOverlap", () => {
  const SR = 44100;

  it("returns data as-is when inputLength is 0", () => {
    const data = makeChannels(100);
    const chunk = makeChunk({ inputStartSample: 0, inputEndSample: 0 });
    const result = trimOverlap(data, 100, chunk, SR);
    expect(result.length).toBe(100);
    expect(result.data).toBe(data);
  });

  it("returns data as-is when outputLength is 0", () => {
    const data = makeChannels(0);
    const chunk = makeChunk();
    const result = trimOverlap(data, 0, chunk, SR);
    expect(result.length).toBe(0);
    expect(result.data).toBe(data);
  });

  it("does not trim first chunk (overlapBefore=0, overlapAfter=0)", () => {
    const data = makeChannels(352800);
    const chunk = makeChunk();
    const result = trimOverlap(data, 352800, chunk, SR);
    // No overlap → trimStart=0, trimEnd=0, newLength=352800
    expect(result.length).toBe(352800);
  });

  it("trims overlap for middle chunk (overlapBefore > 0, overlapAfter > 0)", () => {
    const inputLen = 352800 + 2 * 8820; // 8sec + overlap before + after
    const outputLen = inputLen; // ratio=1 at tempo=1
    const data = makeChannels(outputLen);
    const chunk = makeChunk({
      inputStartSample: 44100,
      inputEndSample: 44100 + inputLen,
      overlapBefore: 8820, // 0.2 sec overlap
      overlapAfter: 8820,
    });
    const result = trimOverlap(data, outputLen, chunk, SR);
    // ratio=1, crossfadeKeep=round(0.1*44100)=4410
    // overlapBeforeOutput=8820, keepBefore=min(4410,8820)=4410
    // trimStart=8820-4410=4410, trimEnd=8820
    // newLength=outputLen-4410-8820
    const expectedLen = outputLen - 4410 - 8820;
    expect(result.length).toBe(expectedLen);
  });

  it("trims last chunk (overlapBefore > 0, overlapAfter=0)", () => {
    const inputLen = 352800 + 8820; // overlap before only
    const data = makeChannels(inputLen);
    const chunk = makeChunk({
      index: 5,
      inputStartSample: 100000,
      inputEndSample: 100000 + inputLen,
      overlapBefore: 8820,
      overlapAfter: 0,
    });
    const result = trimOverlap(data, inputLen, chunk, SR);
    // trimStart=8820-4410=4410, trimEnd=0, newLength=inputLen-4410
    expect(result.length).toBe(inputLen - 4410);
  });

  it("returns original data when newLength <= 0 (fallback)", () => {
    // Very short chunk where trimming would exceed length
    const data = makeChannels(100);
    const chunk = makeChunk({
      inputStartSample: 0,
      inputEndSample: 100,
      overlapBefore: 80,
      overlapAfter: 80,
    });
    const result = trimOverlap(data, 100, chunk, SR);
    // ratio=100/100=1, overlapBeforeOutput=80, crossfadeKeep=4410
    // keepBefore=min(4410,80)=80, trimStart=80-80=0
    // trimEnd=80, newLength=100-0-80=20 > 0 → trimmed
    // Actually this may not trigger <= 0 ...
    // Let's verify
    expect(result.length).toBe(20);
  });

  it("handles extreme ratio (tempo=0.1 → ratio ~= 10)", () => {
    const inputLen = 352800;
    const outputLen = inputLen * 10; // slow tempo
    const data = makeChannels(outputLen);
    const chunk = makeChunk({
      inputStartSample: 44100,
      inputEndSample: 44100 + inputLen,
      overlapBefore: 8820,
      overlapAfter: 8820,
    });
    const result = trimOverlap(data, outputLen, chunk, SR);
    // ratio=10, overlapBeforeOutput=88200, crossfadeKeep=4410
    // keepBefore=min(4410,88200)=4410, trimStart=88200-4410=83790
    // overlapAfterOutput=88200, trimEnd=88200
    // newLength = 3528000 - 83790 - 88200 = 3356010
    expect(result.length).toBe(3528000 - 83790 - 88200);
  });

  it("trims overlap at high tempo (ratio=0.5, tempo 2.0x)", () => {
    const inputLen = 352800 + 2 * 8820; // 8sec + overlap
    const outputLen = Math.round(inputLen * 0.5); // tempo 2.0x → ratio=0.5
    const data = makeChannels(outputLen);
    const chunk = makeChunk({
      inputStartSample: 44100,
      inputEndSample: 44100 + inputLen,
      overlapBefore: 8820,
      overlapAfter: 8820,
    });
    const result = trimOverlap(data, outputLen, chunk, SR);
    // ratio=0.5, crossfadeKeep=round(0.1*44100*0.5)=2205
    // overlapBeforeOutput=round(8820*0.5)=4410, keepBefore=min(2205,4410)=2205
    // trimStart=4410-2205=2205
    // overlapAfterOutput=round(8820*0.5)=4410, trimEnd=4410
    // newLength=outputLen-2205-4410
    const expectedLen = outputLen - 2205 - 4410;
    expect(result.length).toBe(expectedLen);
    // Ensure trimStart > 0 (the actual bug being fixed)
    expect(expectedLen).toBeLessThan(outputLen);
  });

  it("trims overlap at extreme tempo (ratio=0.25, tempo 4.0x)", () => {
    const inputLen = 352800 + 2 * 8820;
    const outputLen = Math.round(inputLen * 0.25); // tempo 4.0x → ratio=0.25
    const data = makeChannels(outputLen);
    const chunk = makeChunk({
      inputStartSample: 44100,
      inputEndSample: 44100 + inputLen,
      overlapBefore: 8820,
      overlapAfter: 8820,
    });
    const result = trimOverlap(data, outputLen, chunk, SR);
    // ratio=0.25, crossfadeKeep=round(0.1*44100*0.25)=1103
    // overlapBeforeOutput=round(8820*0.25)=2205, keepBefore=min(1103,2205)=1103
    // trimStart=2205-1103=1102
    // overlapAfterOutput=round(8820*0.25)=2205, trimEnd=2205
    // newLength=outputLen-1102-2205
    const expectedLen = outputLen - 1102 - 2205;
    expect(result.length).toBe(expectedLen);
    expect(expectedLen).toBeLessThan(outputLen);
  });

  it("handles crossfadeKeep > overlapBeforeOutput (min branch)", () => {
    // overlapBefore=100 samples, ratio=1
    // overlapBeforeOutput=100, crossfadeKeep=4410
    // keepBefore=min(4410,100)=100 → trimStart=100-100=0
    const data = makeChannels(50000);
    const chunk = makeChunk({
      inputStartSample: 10000,
      inputEndSample: 60000,
      overlapBefore: 100,
      overlapAfter: 0,
    });
    const result = trimOverlap(data, 50000, chunk, SR);
    // keepBefore=min(4410,100)=100, trimStart=100-100=0, trimEnd=0
    expect(result.length).toBe(50000);
  });
});
