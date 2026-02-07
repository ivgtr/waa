import { describe, it, expect } from "vitest";
import { createBufferMonitor } from "../../src/stretcher/buffer-monitor";
import type { ChunkInfo } from "../../src/stretcher/types";

function makeChunks(count: number, readyUpTo: number): ChunkInfo[] {
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    state: i < readyUpTo ? ("ready" as const) : ("pending" as const),
    inputStartSample: i * 44100 * 30,
    inputEndSample: (i + 1) * 44100 * 30,
    overlapBefore: i === 0 ? 0 : 8820,
    overlapAfter: i === count - 1 ? 0 : 8820,
    outputBuffer: i < readyUpTo ? [new Float32Array(0)] : null,
    outputLength: i < readyUpTo ? 44100 * 30 : 0,
    priority: 0,
    retryCount: 0,
  }));
}

describe("createBufferMonitor", () => {
  const monitor = createBufferMonitor({
    healthySec: 60,
    lowSec: 15,
    criticalSec: 3,
    resumeSec: 10,
    chunkDurationSec: 30,
  });

  describe("getHealth", () => {
    it("returns 'empty' when no chunks are ready", () => {
      const chunks = makeChunks(10, 0);
      expect(monitor.getHealth(0, chunks)).toBe("empty");
    });

    it("returns 'critical' when 1 chunk ahead (30s >= 3s)", () => {
      const chunks = makeChunks(10, 1);
      expect(monitor.getHealth(0, chunks)).toBe("low");
    });

    it("returns 'healthy' when 3+ chunks ahead (90s >= 60s)", () => {
      const chunks = makeChunks(10, 3);
      expect(monitor.getHealth(0, chunks)).toBe("healthy");
    });

    it("returns 'low' when 1 chunk ahead from current position (30s)", () => {
      const chunks = makeChunks(10, 4);
      // Position at chunk 3, chunks 3 is ready, that's 30s ahead
      expect(monitor.getHealth(3, chunks)).toBe("low");
    });

    it("returns 'empty' when current chunk is not ready", () => {
      const chunks = makeChunks(10, 2);
      // Position at chunk 5, no ready chunks from 5 onward
      expect(monitor.getHealth(5, chunks)).toBe("empty");
    });
  });

  describe("getAheadSeconds", () => {
    it("returns 0 when no chunks are ready", () => {
      const chunks = makeChunks(5, 0);
      expect(monitor.getAheadSeconds(0, chunks)).toBe(0);
    });

    it("counts consecutive ready chunks from current position", () => {
      const chunks = makeChunks(10, 5);
      // At position 0, chunks 0-4 are ready = 5 * 30 = 150s
      expect(monitor.getAheadSeconds(0, chunks)).toBe(150);
    });

    it("stops counting at first non-ready chunk", () => {
      const chunks = makeChunks(10, 3);
      // At position 0, chunks 0-2 ready = 90s
      expect(monitor.getAheadSeconds(0, chunks)).toBe(90);
    });

    it("counts from current chunk index", () => {
      const chunks = makeChunks(10, 5);
      // At position 3, chunks 3-4 ready = 60s
      expect(monitor.getAheadSeconds(3, chunks)).toBe(60);
    });
  });

  describe("shouldEnterBuffering (hysteresis entry)", () => {
    it("enters buffering when current chunk is not ready", () => {
      const chunks = makeChunks(5, 0);
      expect(monitor.shouldEnterBuffering(0, chunks)).toBe(true);
    });

    it("does not enter buffering when enough ahead", () => {
      const chunks = makeChunks(10, 5);
      expect(monitor.shouldEnterBuffering(0, chunks)).toBe(false);
    });
  });

  describe("shouldExitBuffering (hysteresis exit)", () => {
    it("exits when ahead >= resumeSec", () => {
      const chunks = makeChunks(10, 3);
      // At position 0, ahead = 90s >= 10s (resumeSec)
      expect(monitor.shouldExitBuffering(0, chunks)).toBe(true);
    });

    it("exits when current and next chunk become ready", () => {
      const chunks = makeChunks(5, 0);
      chunks[0]!.state = "ready";
      chunks[1]!.state = "ready";
      expect(monitor.shouldExitBuffering(0, chunks)).toBe(true);
    });

    it("does not exit when only next chunk is ready but current is pending", () => {
      const chunks = makeChunks(5, 0);
      chunks[1]!.state = "ready";
      expect(monitor.shouldExitBuffering(0, chunks)).toBe(false);
    });

    it("exits when all chunks are ready", () => {
      const chunks = makeChunks(3, 3);
      expect(monitor.shouldExitBuffering(0, chunks)).toBe(true);
    });
  });
});
