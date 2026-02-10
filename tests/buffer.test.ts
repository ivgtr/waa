import { afterEach, describe, expect, it, vi } from "vitest";
import { getBufferInfo, loadBuffer, loadBufferFromBlob, loadBuffers } from "../src/buffer.js";
import { createMockAudioBuffer, createMockAudioContext } from "./helpers/audio-mocks.js";

describe("buffer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // loadBuffer
  // -------------------------------------------------------------------------
  describe("loadBuffer", () => {
    it("fetches and decodes audio data", async () => {
      const mockArrayBuffer = new ArrayBuffer(1024);
      const mockBuffer = createMockAudioBuffer(1);

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          headers: new Headers(),
          arrayBuffer: async () => mockArrayBuffer,
        })),
      );

      const ctx = createMockAudioContext();
      ctx.decodeAudioData = vi.fn(async () => mockBuffer) as unknown as typeof ctx.decodeAudioData;

      const result = await loadBuffer(ctx, "/test.mp3");
      expect(result).toBe(mockBuffer);
      expect(fetch).toHaveBeenCalledWith("/test.mp3");
    });

    it("throws on non-ok response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: false,
          status: 404,
          statusText: "Not Found",
        })),
      );

      const ctx = createMockAudioContext();
      await expect(loadBuffer(ctx, "/missing.mp3")).rejects.toThrow(
        "Failed to fetch audio: 404 Not Found",
      );
    });

    it("reports progress when content-length is available", async () => {
      const chunk1 = new Uint8Array([1, 2, 3, 4]);
      const chunk2 = new Uint8Array([5, 6, 7, 8]);
      let readCount = 0;

      const mockReader = {
        read: vi.fn(async () => {
          readCount++;
          if (readCount === 1) return { done: false, value: chunk1 };
          if (readCount === 2) return { done: false, value: chunk2 };
          return { done: true, value: undefined };
        }),
      };

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          headers: { get: (name: string) => (name === "content-length" ? "8" : null) },
          body: { getReader: () => mockReader },
        })),
      );

      const ctx = createMockAudioContext();
      const mockBuffer = createMockAudioBuffer(1);
      ctx.decodeAudioData = vi.fn(async () => mockBuffer) as unknown as typeof ctx.decodeAudioData;

      const progressValues: number[] = [];
      await loadBuffer(ctx, "/track.mp3", {
        onProgress: (p) => progressValues.push(p),
      });

      expect(progressValues.length).toBe(2);
      expect(progressValues[0]).toBeCloseTo(0.5);
      expect(progressValues[1]).toBeCloseTo(1.0);
    });

    it("skips streaming when no content-length", async () => {
      const mockArrayBuffer = new ArrayBuffer(1024);
      const mockBuffer = createMockAudioBuffer(1);

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          headers: { get: () => null },
          body: {},
          arrayBuffer: async () => mockArrayBuffer,
        })),
      );

      const ctx = createMockAudioContext();
      ctx.decodeAudioData = vi.fn(async () => mockBuffer) as unknown as typeof ctx.decodeAudioData;

      const progressValues: number[] = [];
      const result = await loadBuffer(ctx, "/track.mp3", {
        onProgress: (p) => progressValues.push(p),
      });

      expect(result).toBe(mockBuffer);
      expect(progressValues.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // loadBufferFromBlob
  // -------------------------------------------------------------------------
  describe("loadBufferFromBlob", () => {
    it("decodes blob to AudioBuffer", async () => {
      const mockArrayBuffer = new ArrayBuffer(512);
      const mockBlob = {
        arrayBuffer: vi.fn(async () => mockArrayBuffer),
      } as unknown as Blob;

      const ctx = createMockAudioContext();
      const mockBuffer = createMockAudioBuffer(1);
      ctx.decodeAudioData = vi.fn(async () => mockBuffer) as unknown as typeof ctx.decodeAudioData;

      const result = await loadBufferFromBlob(ctx, mockBlob);
      expect(result).toBe(mockBuffer);
      expect(ctx.decodeAudioData).toHaveBeenCalledWith(mockArrayBuffer);
    });
  });

  // -------------------------------------------------------------------------
  // loadBuffers
  // -------------------------------------------------------------------------
  describe("loadBuffers", () => {
    it("loads multiple buffers in parallel and returns Map", async () => {
      const mockBuffer1 = createMockAudioBuffer(1);
      const mockBuffer2 = createMockAudioBuffer(2);
      let callCount = 0;

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          headers: new Headers(),
          arrayBuffer: async () => new ArrayBuffer(1024),
        })),
      );

      const ctx = createMockAudioContext();
      ctx.decodeAudioData = vi.fn(async () => {
        callCount++;
        return callCount === 1 ? mockBuffer1 : mockBuffer2;
      }) as unknown as typeof ctx.decodeAudioData;

      const result = await loadBuffers(ctx, {
        kick: "/kick.wav",
        snare: "/snare.wav",
      });

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(2);
      expect(result.has("kick")).toBe(true);
      expect(result.has("snare")).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // getBufferInfo
  // -------------------------------------------------------------------------
  describe("getBufferInfo", () => {
    it("returns all metadata fields", () => {
      const buf = createMockAudioBuffer(2.5, 48000, 2);
      const info = getBufferInfo(buf);
      expect(info.duration).toBe(2.5);
      expect(info.numberOfChannels).toBe(2);
      expect(info.sampleRate).toBe(48000);
      expect(info.length).toBe(Math.round(2.5 * 48000));
    });
  });
});
