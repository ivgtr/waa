import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMainThreadProcessor } from "../../src/stretcher/main-thread-processor";
import type { WorkerResponse } from "../../src/stretcher/types";

describe("createMainThreadProcessor", () => {
  let onResult: ReturnType<typeof vi.fn<(r: WorkerResponse) => void>>;
  let onError: ReturnType<typeof vi.fn<(r: WorkerResponse) => void>>;

  beforeEach(() => {
    onResult = vi.fn();
    onError = vi.fn();
  });

  it("implements WorkerManager interface", () => {
    const proc = createMainThreadProcessor(onResult, onError);
    expect(typeof proc.postConvert).toBe("function");
    expect(typeof proc.cancelCurrent).toBe("function");
    expect(typeof proc.cancelChunk).toBe("function");
    expect(typeof proc.isBusy).toBe("function");
    expect(typeof proc.hasCapacity).toBe("function");
    expect(typeof proc.getCurrentChunkIndex).toBe("function");
    expect(typeof proc.getLastPostTime).toBe("function");
    expect(typeof proc.getPostTimeForChunk).toBe("function");
    expect(typeof proc.terminate).toBe("function");
  });

  it("starts with idle state", () => {
    const proc = createMainThreadProcessor(onResult, onError);
    expect(proc.isBusy()).toBe(false);
    expect(proc.hasCapacity()).toBe(true);
    expect(proc.getCurrentChunkIndex()).toBeNull();
    expect(proc.getLastPostTime()).toBeNull();
  });

  it("becomes busy after postConvert", () => {
    const proc = createMainThreadProcessor(onResult, onError);
    const input = [new Float32Array(4096)];
    proc.postConvert(0, input, 1.0, 44100);
    expect(proc.isBusy()).toBe(true);
    expect(proc.hasCapacity()).toBe(false);
    expect(proc.getCurrentChunkIndex()).toBe(0);
  });

  it("records post time", () => {
    const proc = createMainThreadProcessor(onResult, onError);
    const input = [new Float32Array(4096)];
    proc.postConvert(0, input, 1.0, 44100);
    expect(proc.getPostTimeForChunk(0)).toBeTypeOf("number");
    expect(proc.getLastPostTime()).toBeTypeOf("number");
  });

  it("calls onResult asynchronously with converted data", async () => {
    const proc = createMainThreadProcessor(onResult, onError);
    const input = [new Float32Array(4096).fill(0.5)];
    proc.postConvert(0, input, 1.0, 44100);

    // Should not be called synchronously
    expect(onResult).not.toHaveBeenCalled();

    // Wait for setTimeout(0)
    await vi.waitFor(() => {
      expect(onResult).toHaveBeenCalledTimes(1);
    });

    const response = onResult.mock.calls[0]![0]!;
    expect(response.type).toBe("result");
    expect(response.chunkIndex).toBe(0);
    if (response.type === "result") {
      expect(response.outputData).toBeDefined();
      expect(response.outputLength).toBeGreaterThan(0);
    }
  });

  it("returns to idle after conversion completes", async () => {
    const proc = createMainThreadProcessor(onResult, onError);
    const input = [new Float32Array(4096).fill(0.5)];
    proc.postConvert(0, input, 1.0, 44100);

    await vi.waitFor(() => {
      expect(onResult).toHaveBeenCalledTimes(1);
    });

    expect(proc.isBusy()).toBe(false);
    expect(proc.hasCapacity()).toBe(true);
    expect(proc.getCurrentChunkIndex()).toBeNull();
  });

  it("cancels via cancelCurrent", async () => {
    const proc = createMainThreadProcessor(onResult, onError);
    const input = [new Float32Array(4096).fill(0.5)];
    proc.postConvert(0, input, 1.0, 44100);
    proc.cancelCurrent();

    await vi.waitFor(() => {
      expect(onResult).toHaveBeenCalledTimes(1);
    });

    const response = onResult.mock.calls[0]![0]!;
    expect(response.type).toBe("cancelled");
    expect(response.chunkIndex).toBe(0);
  });

  it("cancels via cancelChunk", async () => {
    const proc = createMainThreadProcessor(onResult, onError);
    const input = [new Float32Array(4096).fill(0.5)];
    proc.postConvert(0, input, 1.0, 44100);
    proc.cancelChunk(0);

    await vi.waitFor(() => {
      expect(onResult).toHaveBeenCalledTimes(1);
    });

    const response = onResult.mock.calls[0]![0]!;
    expect(response.type).toBe("cancelled");
  });

  it("does nothing after terminate", async () => {
    const proc = createMainThreadProcessor(onResult, onError);
    proc.terminate();

    const input = [new Float32Array(4096).fill(0.5)];
    proc.postConvert(0, input, 1.0, 44100);

    // Wait a tick to ensure nothing fires
    await new Promise((r) => setTimeout(r, 50));
    expect(onResult).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("handles multiple sequential conversions", async () => {
    const proc = createMainThreadProcessor(onResult, onError);

    // First conversion
    proc.postConvert(0, [new Float32Array(4096).fill(0.5)], 1.0, 44100);
    await vi.waitFor(() => {
      expect(onResult).toHaveBeenCalledTimes(1);
    });

    // Second conversion
    proc.postConvert(1, [new Float32Array(4096).fill(0.3)], 0.8, 44100);
    await vi.waitFor(() => {
      expect(onResult).toHaveBeenCalledTimes(2);
    });

    expect(onResult.mock.calls[0]![0]!.chunkIndex).toBe(0);
    expect(onResult.mock.calls[1]![0]!.chunkIndex).toBe(1);
  });

  // -----------------------------------------------------------------------
  // MTP: postTimes / cancelledChunks ライフサイクル
  // -----------------------------------------------------------------------

  describe("MTP: postTimes / cancelledChunks ライフサイクル", () => {
    it("MTP-a: postTimes persist after result delivery", async () => {
      const proc = createMainThreadProcessor(onResult, onError);
      const input = [new Float32Array(4096).fill(0.5)];
      proc.postConvert(0, input, 1.0, 44100);

      // postTime should be set immediately
      expect(proc.getPostTimeForChunk(0)).toBeTypeOf("number");

      // Wait for result
      await vi.waitFor(() => {
        expect(onResult).toHaveBeenCalledTimes(1);
      });

      // postTimes should still contain the entry (no cleanup on result)
      expect(proc.getPostTimeForChunk(0)).toBeTypeOf("number");
      expect(proc.getLastPostTime()).toBeTypeOf("number");
    });

    it("MTP-b: cancelChunk then re-postConvert same index yields normal result", async () => {
      const proc = createMainThreadProcessor(onResult, onError);
      const input = [new Float32Array(4096).fill(0.5)];

      // First conversion → cancel
      proc.postConvert(0, input, 1.0, 44100);
      proc.cancelChunk(0);

      // Wait for cancelled result
      await vi.waitFor(() => {
        expect(onResult).toHaveBeenCalledTimes(1);
      });
      expect(onResult.mock.calls[0]![0]!.type).toBe("cancelled");

      // Re-post same index → should produce normal result
      proc.postConvert(0, input, 1.0, 44100);

      await vi.waitFor(() => {
        expect(onResult).toHaveBeenCalledTimes(2);
      });
      expect(onResult.mock.calls[1]![0]!.type).toBe("result");
      expect(onResult.mock.calls[1]![0]!.chunkIndex).toBe(0);
    });

    it("MTP-c: terminate clears postTimes and getLastPostTime", () => {
      const proc = createMainThreadProcessor(onResult, onError);
      const input = [new Float32Array(4096).fill(0.5)];
      proc.postConvert(0, input, 1.0, 44100);

      expect(proc.getPostTimeForChunk(0)).toBeTypeOf("number");
      expect(proc.getLastPostTime()).toBeTypeOf("number");

      proc.terminate();

      expect(proc.getPostTimeForChunk(0)).toBeNull();
      expect(proc.getLastPostTime()).toBeNull();
    });

    it("MTP-d: terminate before setTimeout fires prevents callbacks", async () => {
      const proc = createMainThreadProcessor(onResult, onError);
      const input = [new Float32Array(4096).fill(0.5)];

      // Post conversion (setTimeout(0) scheduled)
      proc.postConvert(0, input, 1.0, 44100);

      // Terminate immediately before the setTimeout fires
      proc.terminate();

      // Wait to ensure the setTimeout would have fired
      await new Promise((r) => setTimeout(r, 50));

      // No callbacks should have been called
      expect(onResult).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });
  });
});
