import { describe, it, expect, vi } from "vitest";
import { createEmitter } from "../src/emitter.js";

describe("createEmitter", () => {
  it("calls handlers when an event is emitted", () => {
    const emitter = createEmitter<{ tick: number }>();
    const handler = vi.fn();
    emitter.on("tick", handler);
    emitter.emit("tick", 42);
    expect(handler).toHaveBeenCalledWith(42);
  });

  it("supports multiple handlers for the same event", () => {
    const emitter = createEmitter<{ tick: number }>();
    const a = vi.fn();
    const b = vi.fn();
    emitter.on("tick", a);
    emitter.on("tick", b);
    emitter.emit("tick", 1);
    expect(a).toHaveBeenCalledWith(1);
    expect(b).toHaveBeenCalledWith(1);
  });

  it("returns an unsubscribe function from on()", () => {
    const emitter = createEmitter<{ tick: number }>();
    const handler = vi.fn();
    const unsub = emitter.on("tick", handler);
    unsub();
    emitter.emit("tick", 1);
    expect(handler).not.toHaveBeenCalled();
  });

  it("off() removes a specific handler", () => {
    const emitter = createEmitter<{ tick: number }>();
    const handler = vi.fn();
    emitter.on("tick", handler);
    emitter.off("tick", handler);
    emitter.emit("tick", 1);
    expect(handler).not.toHaveBeenCalled();
  });

  it("clear() removes all handlers for a specific event", () => {
    const emitter = createEmitter<{ a: number; b: string }>();
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    emitter.on("a", handlerA);
    emitter.on("b", handlerB);
    emitter.clear("a");
    emitter.emit("a", 1);
    emitter.emit("b", "x");
    expect(handlerA).not.toHaveBeenCalled();
    expect(handlerB).toHaveBeenCalledWith("x");
  });

  it("clear() with no argument removes all handlers", () => {
    const emitter = createEmitter<{ a: number; b: string }>();
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    emitter.on("a", handlerA);
    emitter.on("b", handlerB);
    emitter.clear();
    emitter.emit("a", 1);
    emitter.emit("b", "x");
    expect(handlerA).not.toHaveBeenCalled();
    expect(handlerB).not.toHaveBeenCalled();
  });

  it("does not throw when emitting an event with no handlers", () => {
    const emitter = createEmitter<{ tick: number }>();
    expect(() => emitter.emit("tick", 1)).not.toThrow();
  });
});
