import { describe, it, expect, vi, beforeEach } from "vitest";
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
});
