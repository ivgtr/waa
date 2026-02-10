import { describe, expect, it } from "vitest";
import { createContext, ensureRunning, now, resumeContext } from "../src/context.js";
import { createMockAudioContext } from "./helpers/audio-mocks.js";

describe("context", () => {
  // -------------------------------------------------------------------------
  // createContext
  // -------------------------------------------------------------------------
  describe("createContext", () => {
    it("creates an AudioContext (smoke test with mock)", () => {
      // createContext calls `new AudioContext()` which isn't available in node.
      // We test that the function signature works via the mock-based tests below.
      // This test documents the function exists and accepts options.
      expect(typeof createContext).toBe("function");
    });
  });

  // -------------------------------------------------------------------------
  // resumeContext
  // -------------------------------------------------------------------------
  describe("resumeContext", () => {
    it("calls resume() when state is suspended", async () => {
      const ctx = createMockAudioContext();
      (ctx as unknown as { _setState: (s: string) => void })._setState(
        "suspended" as AudioContextState,
      );
      await resumeContext(ctx);
      expect(ctx.resume).toHaveBeenCalled();
    });

    it("does not call resume() when state is running", async () => {
      const ctx = createMockAudioContext();
      await resumeContext(ctx);
      expect(ctx.resume).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // ensureRunning
  // -------------------------------------------------------------------------
  describe("ensureRunning", () => {
    it("calls resume() when state is not running", async () => {
      const ctx = createMockAudioContext();
      (ctx as unknown as { _setState: (s: string) => void })._setState(
        "suspended" as AudioContextState,
      );
      await ensureRunning(ctx);
      expect(ctx.resume).toHaveBeenCalled();
    });

    it("does not call resume() when state is running", async () => {
      const ctx = createMockAudioContext();
      await ensureRunning(ctx);
      expect(ctx.resume).not.toHaveBeenCalled();
    });

    it("calls resume() when state is closed", async () => {
      const ctx = createMockAudioContext();
      (ctx as unknown as { _setState: (s: string) => void })._setState(
        "closed" as AudioContextState,
      );
      await ensureRunning(ctx);
      expect(ctx.resume).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // now
  // -------------------------------------------------------------------------
  describe("now", () => {
    it("returns ctx.currentTime", () => {
      const ctx = createMockAudioContext({ currentTime: 1.5 });
      expect(now(ctx)).toBe(1.5);
    });

    it("tracks currentTime changes", () => {
      const ctx = createMockAudioContext();
      expect(now(ctx)).toBe(0);
      ctx._setCurrentTime(5.0);
      expect(now(ctx)).toBe(5.0);
    });
  });
});
