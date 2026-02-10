import { describe, expect, it } from "vitest";
import { createPriorityQueue } from "../../src/stretcher/priority-queue";

describe("createPriorityQueue", () => {
  function numQueue() {
    return createPriorityQueue<number>((a, b) => a - b);
  }

  it("starts empty", () => {
    const q = numQueue();
    expect(q.size()).toBe(0);
    expect(q.peek()).toBeUndefined();
    expect(q.dequeue()).toBeUndefined();
  });

  it("enqueue and dequeue in priority order", () => {
    const q = numQueue();
    q.enqueue(5);
    q.enqueue(1);
    q.enqueue(3);

    expect(q.size()).toBe(3);
    expect(q.dequeue()).toBe(1);
    expect(q.dequeue()).toBe(3);
    expect(q.dequeue()).toBe(5);
    expect(q.size()).toBe(0);
  });

  it("peek returns smallest without removing", () => {
    const q = numQueue();
    q.enqueue(10);
    q.enqueue(5);
    q.enqueue(20);

    expect(q.peek()).toBe(5);
    expect(q.size()).toBe(3);
  });

  it("removes item by predicate", () => {
    const q = numQueue();
    q.enqueue(1);
    q.enqueue(2);
    q.enqueue(3);
    q.enqueue(4);

    const removed = q.remove((x) => x === 3);
    expect(removed).toBe(true);
    expect(q.size()).toBe(3);

    const items: number[] = [];
    while (q.size() > 0) {
      items.push(q.dequeue()!);
    }
    expect(items).toEqual([1, 2, 4]);
  });

  it("remove returns false when item not found", () => {
    const q = numQueue();
    q.enqueue(1);
    q.enqueue(2);

    expect(q.remove((x) => x === 99)).toBe(false);
  });

  it("rebuild restores heap property after mutation", () => {
    const q = createPriorityQueue<{ val: number; pri: number }>((a, b) => a.pri - b.pri);

    const items = [
      { val: 1, pri: 10 },
      { val: 2, pri: 5 },
      { val: 3, pri: 8 },
    ];

    for (const item of items) q.enqueue(item);

    // Mutate priorities
    items[0]!.pri = 1; // was 10, now highest priority
    items[1]!.pri = 20; // was 5, now lowest

    q.rebuild();

    expect(q.dequeue()!.val).toBe(1);
    expect(q.dequeue()!.val).toBe(3);
    expect(q.dequeue()!.val).toBe(2);
  });

  it("clear empties the queue", () => {
    const q = numQueue();
    q.enqueue(1);
    q.enqueue(2);
    q.enqueue(3);

    q.clear();
    expect(q.size()).toBe(0);
    expect(q.dequeue()).toBeUndefined();
  });

  it("toArray returns all items", () => {
    const q = numQueue();
    q.enqueue(3);
    q.enqueue(1);
    q.enqueue(2);

    const arr = q.toArray();
    expect(arr).toHaveLength(3);
    expect(arr.sort()).toEqual([1, 2, 3]);
  });

  it("handles duplicate priorities", () => {
    const q = numQueue();
    q.enqueue(5);
    q.enqueue(5);
    q.enqueue(5);

    expect(q.dequeue()).toBe(5);
    expect(q.dequeue()).toBe(5);
    expect(q.dequeue()).toBe(5);
  });

  it("handles large number of items", () => {
    const q = numQueue();
    const items: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const val = Math.floor(Math.random() * 10000);
      items.push(val);
      q.enqueue(val);
    }

    const sorted = items.sort((a, b) => a - b);
    for (let i = 0; i < 1000; i++) {
      expect(q.dequeue()).toBe(sorted[i]);
    }
  });
});
