import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlaybackStateManager } from "../src/playback-state";

describe("createPlaybackStateManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not fire statechange when setState is called with the same state", () => {
    const onStateChange = vi.fn();
    const sm = createPlaybackStateManager({
      initialState: "playing",
      onStateChange,
      onTimerTick: vi.fn(),
      timerInterval: 50,
    });
    const changed = sm.setState("playing");
    expect(changed).toBe(false);
    expect(onStateChange).not.toHaveBeenCalled();
  });

  it("fires statechange when setState is called with a different state", () => {
    const onStateChange = vi.fn();
    const sm = createPlaybackStateManager({
      initialState: "playing",
      onStateChange,
      onTimerTick: vi.fn(),
      timerInterval: 50,
    });
    const changed = sm.setState("paused");
    expect(changed).toBe(true);
    expect(onStateChange).toHaveBeenCalledWith("paused");
    expect(sm.getState()).toBe("paused");
  });

  it("does not create duplicate timers on repeated startTimer calls", () => {
    const onTimerTick = vi.fn();
    const sm = createPlaybackStateManager({
      initialState: "playing",
      onStateChange: vi.fn(),
      onTimerTick,
      timerInterval: 50,
    });
    sm.startTimer();
    sm.startTimer();
    sm.startTimer();
    vi.advanceTimersByTime(100);
    // Should fire ~2 times for 100ms interval with 50ms tick (not 6 times)
    expect(onTimerTick.mock.calls.length).toBe(2);
  });

  it("does not fire callback after stopTimer", () => {
    const onTimerTick = vi.fn();
    const sm = createPlaybackStateManager({
      initialState: "playing",
      onStateChange: vi.fn(),
      onTimerTick,
      timerInterval: 50,
    });
    sm.startTimer();
    vi.advanceTimersByTime(50);
    expect(onTimerTick).toHaveBeenCalledTimes(1);
    sm.stopTimer();
    vi.advanceTimersByTime(200);
    expect(onTimerTick).toHaveBeenCalledTimes(1);
  });

  it("isDisposed returns true after markDisposed", () => {
    const sm = createPlaybackStateManager({
      initialState: "playing",
      onStateChange: vi.fn(),
      onTimerTick: vi.fn(),
      timerInterval: 50,
    });
    expect(sm.isDisposed()).toBe(false);
    sm.markDisposed();
    expect(sm.isDisposed()).toBe(true);
  });

  it("stops timer on markDisposed", () => {
    const onTimerTick = vi.fn();
    const sm = createPlaybackStateManager({
      initialState: "playing",
      onStateChange: vi.fn(),
      onTimerTick,
      timerInterval: 50,
    });
    sm.startTimer();
    vi.advanceTimersByTime(50);
    expect(onTimerTick).toHaveBeenCalledTimes(1);
    sm.markDisposed();
    vi.advanceTimersByTime(200);
    expect(onTimerTick).toHaveBeenCalledTimes(1);
  });
});
