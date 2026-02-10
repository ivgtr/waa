import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSnapshot,
  onFrame,
  subscribeSnapshot,
  whenEnded,
  whenPosition,
} from "../src/adapters.js";
import type { Playback, PlaybackSnapshot } from "../src/types.js";
import { createMockPlayback } from "./helpers/audio-mocks.js";

describe("adapters", () => {
  // -------------------------------------------------------------------------
  // getSnapshot
  // -------------------------------------------------------------------------
  describe("getSnapshot", () => {
    it("returns a snapshot with state, position, duration, progress", () => {
      const pb = createMockPlayback({
        state: "playing",
        currentTime: 5,
        duration: 10,
        progress: 0.5,
      });
      const snap = getSnapshot(pb as unknown as Playback);
      expect(snap.state).toBe("playing");
      expect(snap.position).toBe(5);
      expect(snap.duration).toBe(10);
      expect(snap.progress).toBe(0.5);
    });

    it("caches the snapshot (returns same reference on second call)", () => {
      const pb = createMockPlayback();
      const snap1 = getSnapshot(pb as unknown as Playback);
      const snap2 = getSnapshot(pb as unknown as Playback);
      expect(snap1).toBe(snap2);
    });

    it("does not include stretcher field when not available", () => {
      const pb = createMockPlayback();
      const snap = getSnapshot(pb as unknown as Playback);
      expect(snap.stretcher).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // subscribeSnapshot
  // -------------------------------------------------------------------------
  describe("subscribeSnapshot", () => {
    it("subscribes to 4 events (statechange, timeupdate, seek, ended)", () => {
      const pb = createMockPlayback();
      const callback = vi.fn();
      subscribeSnapshot(pb as unknown as Playback, callback);

      expect(pb.on).toHaveBeenCalledTimes(4);
      const events = pb.on.mock.calls.map((c: unknown[]) => c[0]);
      expect(events).toContain("statechange");
      expect(events).toContain("timeupdate");
      expect(events).toContain("seek");
      expect(events).toContain("ended");
    });

    it("calls callback when statechange fires", () => {
      const pb = createMockPlayback();
      const callback = vi.fn();
      subscribeSnapshot(pb as unknown as Playback, callback);

      pb._emit("statechange", { state: "paused" });
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("updates cache before calling callback (snapshot is fresh)", () => {
      const pb = createMockPlayback({
        state: "playing",
        currentTime: 0,
        duration: 10,
        progress: 0,
      });
      let capturedSnap: PlaybackSnapshot | null = null;

      subscribeSnapshot(pb as unknown as Playback, () => {
        capturedSnap = getSnapshot(pb as unknown as Playback);
      });

      // Change mock state
      pb.getState.mockReturnValue("paused");
      pb.getCurrentTime.mockReturnValue(5);
      pb.getProgress.mockReturnValue(0.5);

      pb._emit("statechange", { state: "paused" });

      expect(capturedSnap).not.toBeNull();
      expect(capturedSnap!.state).toBe("paused");
      expect(capturedSnap!.position).toBe(5);
    });

    it("unsubscribe removes all event listeners", () => {
      const pb = createMockPlayback();
      const callback = vi.fn();
      const unsub = subscribeSnapshot(pb as unknown as Playback, callback);

      unsub();

      // After unsub, events should not trigger callback
      pb._emit("statechange", { state: "paused" });
      expect(callback).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // onFrame
  // -------------------------------------------------------------------------
  describe("onFrame", () => {
    let rafCallbacks: Array<(time: number) => void>;
    let rafIdCounter: number;

    beforeEach(() => {
      rafCallbacks = [];
      rafIdCounter = 0;
      vi.stubGlobal(
        "requestAnimationFrame",
        vi.fn((cb: (time: number) => void) => {
          rafCallbacks.push(cb);
          return ++rafIdCounter;
        }),
      );
      vi.stubGlobal("cancelAnimationFrame", vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("calls callback on each animation frame", () => {
      const pb = createMockPlayback({
        state: "playing",
        currentTime: 1,
        duration: 10,
        progress: 0.1,
      });
      const callback = vi.fn();

      onFrame(pb as unknown as Playback, callback);

      // First rAF should be registered
      expect(rafCallbacks.length).toBe(1);

      // Simulate frame
      rafCallbacks[0]!(0);
      expect(callback).toHaveBeenCalledTimes(1);
      const snap = callback.mock.calls[0]![0] as PlaybackSnapshot;
      expect(snap.state).toBe("playing");
      expect(snap.position).toBe(1);
    });

    it("stop cancels the animation frame loop", () => {
      const pb = createMockPlayback();
      const callback = vi.fn();

      const stop = onFrame(pb as unknown as Playback, callback);
      stop();

      expect(cancelAnimationFrame).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // whenEnded
  // -------------------------------------------------------------------------
  describe("whenEnded", () => {
    it("resolves when ended event fires", async () => {
      const pb = createMockPlayback();
      const promise = whenEnded(pb as unknown as Playback);

      pb._emit("ended");

      await expect(promise).resolves.toBeUndefined();
    });

    it("unsubscribes after resolving", async () => {
      const pb = createMockPlayback();
      const promise = whenEnded(pb as unknown as Playback);

      pb._emit("ended");
      await promise;

      // The 'ended' handler set should now be empty
      pb._emit("ended"); // should not cause issues
    });
  });

  // -------------------------------------------------------------------------
  // whenPosition
  // -------------------------------------------------------------------------
  describe("whenPosition", () => {
    it("resolves when position is reached", async () => {
      const pb = createMockPlayback();
      const promise = whenPosition(pb as unknown as Playback, 5);

      pb._emit("timeupdate", { position: 3, duration: 10 });
      // Should not have resolved yet

      pb._emit("timeupdate", { position: 5, duration: 10 });
      await expect(promise).resolves.toBeUndefined();
    });

    it("resolves when position is exceeded", async () => {
      const pb = createMockPlayback();
      const promise = whenPosition(pb as unknown as Playback, 5);

      pb._emit("timeupdate", { position: 7, duration: 10 });
      await expect(promise).resolves.toBeUndefined();
    });

    it("resolves immediately if position is already passed (fixed: initial check)", async () => {
      const pb = createMockPlayback({ currentTime: 10, duration: 10, progress: 1 });
      const promise = whenPosition(pb as unknown as Playback, 5);
      await expect(promise).resolves.toBeUndefined();
    });

    it("unsubscribes after resolving", async () => {
      const pb = createMockPlayback();
      const promise = whenPosition(pb as unknown as Playback, 5);

      pb._emit("timeupdate", { position: 5, duration: 10 });
      await promise;

      // Subsequent events should not cause issues
      pb._emit("timeupdate", { position: 6, duration: 10 });
    });
  });
});
