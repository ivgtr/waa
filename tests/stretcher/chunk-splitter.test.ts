import { describe, it, expect } from "vitest";
import {
  splitIntoChunks,
  getChunkIndexForSample,
  getChunkIndexForTime,
} from "../../src/stretcher/chunk-splitter";

describe("splitIntoChunks", () => {
  const sampleRate = 44100;

  it("returns empty array for zero samples", () => {
    expect(splitIntoChunks(0, sampleRate)).toHaveLength(0);
  });

  it("returns empty array for negative samples", () => {
    expect(splitIntoChunks(-100, sampleRate)).toHaveLength(0);
  });

  it("returns a single chunk for short audio", () => {
    const totalSamples = sampleRate * 10; // 10 seconds
    const chunks = splitIntoChunks(totalSamples, sampleRate, 30, 0.2);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.inputStartSample).toBe(0);
    expect(chunks[0]!.inputEndSample).toBe(totalSamples);
    expect(chunks[0]!.overlapBefore).toBe(0);
    expect(chunks[0]!.overlapAfter).toBe(0);
  });

  it("splits 60 seconds into 2 chunks", () => {
    const totalSamples = sampleRate * 60; // 60 seconds
    const chunks = splitIntoChunks(totalSamples, sampleRate, 30, 0.2);
    expect(chunks).toHaveLength(2);
  });

  it("splits 90 seconds into 3 chunks", () => {
    const totalSamples = sampleRate * 90;
    const chunks = splitIntoChunks(totalSamples, sampleRate, 30, 0.2);
    expect(chunks).toHaveLength(3);
  });

  it("first chunk has no overlap before", () => {
    const totalSamples = sampleRate * 90;
    const chunks = splitIntoChunks(totalSamples, sampleRate, 30, 0.2);
    expect(chunks[0]!.overlapBefore).toBe(0);
  });

  it("last chunk has no overlap after", () => {
    const totalSamples = sampleRate * 90;
    const chunks = splitIntoChunks(totalSamples, sampleRate, 30, 0.2);
    const last = chunks[chunks.length - 1]!;
    expect(last.overlapAfter).toBe(0);
  });

  it("middle chunks have overlap on both sides", () => {
    const totalSamples = sampleRate * 90;
    const chunks = splitIntoChunks(totalSamples, sampleRate, 30, 0.2);
    const mid = chunks[1]!;
    const overlapSamples = Math.round(0.2 * sampleRate);
    expect(mid.overlapBefore).toBe(overlapSamples);
    expect(mid.overlapAfter).toBe(overlapSamples);
  });

  it("all chunks cover the full range without gaps (nominal range)", () => {
    const totalSamples = sampleRate * 120;
    const chunks = splitIntoChunks(totalSamples, sampleRate, 30, 0.2);

    // Verify that nominal ranges (excluding overlap) cover the full range
    for (let i = 0; i < chunks.length - 1; i++) {
      const current = chunks[i]!;
      const next = chunks[i + 1]!;
      const currentNominalEnd =
        current.inputEndSample - current.overlapAfter;
      const nextNominalStart =
        next.inputStartSample + next.overlapBefore;
      expect(currentNominalEnd).toBe(nextNominalStart);
    }

    // First chunk starts at 0
    expect(chunks[0]!.inputStartSample).toBe(0);
    // Last chunk ends at totalSamples
    const last = chunks[chunks.length - 1]!;
    expect(last.inputEndSample).toBe(totalSamples);
  });

  it("initializes all chunks with pending state", () => {
    const totalSamples = sampleRate * 90;
    const chunks = splitIntoChunks(totalSamples, sampleRate, 30, 0.2);
    for (const chunk of chunks) {
      expect(chunk.state).toBe("pending");
      expect(chunk.outputBuffer).toBeNull();
      expect(chunk.outputLength).toBe(0);
      expect(chunk.retryCount).toBe(0);
    }
  });
});

describe("getChunkIndexForSample", () => {
  const sampleRate = 44100;

  it("returns 0 for sample 0", () => {
    const chunks = splitIntoChunks(sampleRate * 90, sampleRate, 30, 0.2);
    expect(getChunkIndexForSample(chunks, 0)).toBe(0);
  });

  it("returns last chunk for a sample past the end", () => {
    const totalSamples = sampleRate * 90;
    const chunks = splitIntoChunks(totalSamples, sampleRate, 30, 0.2);
    expect(getChunkIndexForSample(chunks, totalSamples + 1000)).toBe(
      chunks.length - 1,
    );
  });

  it("returns correct chunk for a sample in the middle", () => {
    const totalSamples = sampleRate * 90;
    const chunks = splitIntoChunks(totalSamples, sampleRate, 30, 0.2);
    // Sample at 45 seconds should be in chunk 1 (30-60s)
    const sample = Math.round(45 * sampleRate);
    expect(getChunkIndexForSample(chunks, sample)).toBe(1);
  });
});

describe("getChunkIndexForTime", () => {
  const sampleRate = 44100;

  it("returns 0 for time 0", () => {
    const chunks = splitIntoChunks(sampleRate * 90, sampleRate, 30, 0.2);
    expect(getChunkIndexForTime(chunks, 0, sampleRate)).toBe(0);
  });

  it("returns correct chunk for time in the middle", () => {
    const chunks = splitIntoChunks(sampleRate * 90, sampleRate, 30, 0.2);
    expect(getChunkIndexForTime(chunks, 65, sampleRate)).toBe(2);
  });
});
