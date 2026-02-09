import { describe, it, expect } from "vitest";
import { calcPositionInOriginalBuffer, type PositionCalcParams } from "../../src/stretcher/position-calc";

function makeParams(overrides: Partial<PositionCalcParams> = {}): PositionCalcParams {
  return {
    phase: "playing",
    totalDuration: 30,
    offset: 0,
    bufferingResumePosition: null,
    currentTempo: 1.0,
    sampleRate: 44100,
    crossfadeSec: 0.1,
    chunk: {
      inputStartSample: 0,
      overlapBefore: 0,
    },
    posInChunk: 0,
    ...overrides,
  };
}

describe("calcPositionInOriginalBuffer", () => {
  // --- Phase-based short-circuits ---

  it("returns totalDuration when phase is ended", () => {
    expect(calcPositionInOriginalBuffer(makeParams({ phase: "ended" }))).toBe(30);
  });

  it("returns offset when phase is waiting", () => {
    expect(calcPositionInOriginalBuffer(makeParams({ phase: "waiting", offset: 5 }))).toBe(5);
  });

  it("returns bufferingResumePosition when phase is buffering and resume position is set", () => {
    expect(
      calcPositionInOriginalBuffer(
        makeParams({ phase: "buffering", bufferingResumePosition: 12.5 }),
      ),
    ).toBe(12.5);
  });

  it("falls through when phase is buffering but bufferingResumePosition is null", () => {
    const result = calcPositionInOriginalBuffer(
      makeParams({ phase: "buffering", bufferingResumePosition: null }),
    );
    // Falls through to chunk-based calculation (chunk at 0, posInChunk=0 → 0)
    expect(result).toBe(0);
  });

  // --- chunk === null / undefined ---

  it("returns 0 when chunk is null (defensive)", () => {
    expect(calcPositionInOriginalBuffer(makeParams({ chunk: null }))).toBe(0);
  });

  // --- First chunk (overlapBefore=0) ---

  it("calculates position for first chunk (no crossfade)", () => {
    // inputStartSample=0, overlapBefore=0, nominalStart=0/44100=0
    // crossfadeOffset=0, adjustedPos=2.0, posInOriginal=2.0*1.0=2.0
    expect(
      calcPositionInOriginalBuffer(makeParams({ posInChunk: 2.0 })),
    ).toBe(2.0);
  });

  // --- Middle chunk (overlapBefore > 0) ---

  it("calculates position for middle chunk with crossfade offset", () => {
    // inputStartSample=44100, overlapBefore=4410, nominalStart=(44100+4410)/44100=1.1
    // crossfadeOffset=0.1 (overlapBefore>0), adjustedPos=max(0, 0.5-0.1)=0.4
    // posInOriginal=0.4*1.0=0.4, result=1.1+0.4=1.5
    expect(
      calcPositionInOriginalBuffer(
        makeParams({
          chunk: { inputStartSample: 44100, overlapBefore: 4410 },
          posInChunk: 0.5,
        }),
      ),
    ).toBeCloseTo(1.5, 5);
  });

  // --- Boundary: posInChunk < crossfadeOffset ---

  it("clamps adjustedPos to 0 when posInChunk < crossfadeOffset", () => {
    // overlapBefore>0 → crossfadeOffset=0.1, posInChunk=0.05 < 0.1 → adjustedPos=0
    // nominalStart=(0+4410)/44100=0.1, posInOriginal=0, result=0.1
    expect(
      calcPositionInOriginalBuffer(
        makeParams({
          chunk: { inputStartSample: 0, overlapBefore: 4410 },
          posInChunk: 0.05,
        }),
      ),
    ).toBeCloseTo(0.1, 5);
  });

  // --- Tempo variations ---

  it("calculates correct position at tempo 2.0", () => {
    // nominalStart=0, crossfadeOffset=0, adjustedPos=1.0
    // posInOriginal=1.0*2.0=2.0
    expect(
      calcPositionInOriginalBuffer(makeParams({ currentTempo: 2.0, posInChunk: 1.0 })),
    ).toBe(2.0);
  });

  it("calculates correct position at tempo 0.5", () => {
    // nominalStart=0, crossfadeOffset=0, adjustedPos=1.0
    // posInOriginal=1.0*0.5=0.5
    expect(
      calcPositionInOriginalBuffer(makeParams({ currentTempo: 0.5, posInChunk: 1.0 })),
    ).toBe(0.5);
  });

  it("handles very slow tempo (0.01)", () => {
    // posInChunk=10.0, posInOriginal=10.0*0.01=0.1
    expect(
      calcPositionInOriginalBuffer(makeParams({ currentTempo: 0.01, posInChunk: 10.0 })),
    ).toBeCloseTo(0.1, 5);
  });

  // --- Clamping to totalDuration ---

  it("clamps result to totalDuration", () => {
    // nominalStart=(44100*29)/44100=29, posInChunk=5.0 → posInOriginal=5.0
    // 29+5=34 > totalDuration=30 → clamped to 30
    expect(
      calcPositionInOriginalBuffer(
        makeParams({
          chunk: { inputStartSample: 44100 * 29, overlapBefore: 0 },
          posInChunk: 5.0,
        }),
      ),
    ).toBe(30);
  });

  // --- Negative posInChunk (defensive) ---

  it("handles negative posInChunk gracefully", () => {
    // adjustedPos = max(0, -1.0 - 0) = 0 (first chunk, no crossfade)
    // Wait, Math.max(0, -1.0 - 0) = 0
    const result = calcPositionInOriginalBuffer(makeParams({ posInChunk: -1.0 }));
    expect(result).toBeGreaterThanOrEqual(0);
  });
});
