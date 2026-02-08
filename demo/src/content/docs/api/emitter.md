---
title: emitter
description: Type-safe event emitter
---

A minimal, type-safe event emitter. Used internally by waa-play and available for your own use.

```ts
import { createEmitter } from "waa-play/emitter";
```

## `createEmitter()`

```ts
createEmitter<Events extends Record<string, unknown>>(): Emitter<Events>;
```

Create a new type-safe event emitter. The `Events` type parameter defines the event names and their payload types.

```ts
type MyEvents = {
  progress: number;
  complete: void;
  error: Error;
};

const emitter = createEmitter<MyEvents>();
```

## Emitter Methods

### `on()`

```ts
on<K extends keyof Events>(event: K, handler: (data: Events[K]) => void): () => void;
```

Subscribe to an event. Returns an unsubscribe function.

```ts
const unsub = emitter.on("progress", (value) => {
  console.log(`Progress: ${value}`);
});

// Later: unsubscribe
unsub();
```

### `off()`

```ts
off<K extends keyof Events>(event: K, handler: (data: Events[K]) => void): void;
```

Remove a specific event handler.

```ts
const handler = (value: number) => console.log(value);
emitter.on("progress", handler);
emitter.off("progress", handler);
```

### `emit()`

```ts
emit<K extends keyof Events>(event: K, data: Events[K]): void;
```

Emit an event with data. All registered handlers for the event will be called synchronously.

```ts
emitter.emit("progress", 0.5);
emitter.emit("complete", undefined);
emitter.emit("error", new Error("Failed"));
```

### `clear()`

```ts
clear(event?: keyof Events): void;
```

Remove all handlers for a specific event, or all handlers for all events if no event is specified.

```ts
emitter.clear("progress");  // Clear handlers for "progress"
emitter.clear();             // Clear all handlers
```
