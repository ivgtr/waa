// ---------------------------------------------------------------------------
// Stretcher: Generic min-heap priority queue
// ---------------------------------------------------------------------------

import type { PriorityQueue } from "./types.js";

/**
 * Create a min-heap based priority queue.
 *
 * @param compareFn - Returns negative if a has higher priority (lower value) than b
 */
export function createPriorityQueue<T>(
  compareFn: (a: T, b: T) => number,
): PriorityQueue<T> {
  const heap: T[] = [];

  function parent(i: number): number {
    return Math.floor((i - 1) / 2);
  }

  function left(i: number): number {
    return 2 * i + 1;
  }

  function right(i: number): number {
    return 2 * i + 2;
  }

  function swap(i: number, j: number): void {
    const tmp = heap[i]!;
    heap[i] = heap[j]!;
    heap[j] = tmp;
  }

  function siftUp(i: number): void {
    while (i > 0) {
      const p = parent(i);
      if (compareFn(heap[i]!, heap[p]!) < 0) {
        swap(i, p);
        i = p;
      } else {
        break;
      }
    }
  }

  function siftDown(i: number): void {
    const n = heap.length;
    while (true) {
      let smallest = i;
      const l = left(i);
      const r = right(i);

      if (l < n && compareFn(heap[l]!, heap[smallest]!) < 0) {
        smallest = l;
      }
      if (r < n && compareFn(heap[r]!, heap[smallest]!) < 0) {
        smallest = r;
      }

      if (smallest !== i) {
        swap(i, smallest);
        i = smallest;
      } else {
        break;
      }
    }
  }

  function heapify(): void {
    for (let i = Math.floor(heap.length / 2) - 1; i >= 0; i--) {
      siftDown(i);
    }
  }

  return {
    enqueue(item: T): void {
      heap.push(item);
      siftUp(heap.length - 1);
    },

    dequeue(): T | undefined {
      if (heap.length === 0) return undefined;
      const min = heap[0]!;
      const last = heap.pop()!;
      if (heap.length > 0) {
        heap[0] = last;
        siftDown(0);
      }
      return min;
    },

    peek(): T | undefined {
      return heap[0];
    },

    remove(predicate: (item: T) => boolean): boolean {
      const idx = heap.findIndex(predicate);
      if (idx === -1) return false;

      if (idx === heap.length - 1) {
        heap.pop();
      } else {
        heap[idx] = heap.pop()!;
        // Re-heapify from this position
        siftDown(idx);
        siftUp(idx);
      }
      return true;
    },

    rebuild(): void {
      heapify();
    },

    clear(): void {
      heap.length = 0;
    },

    size(): number {
      return heap.length;
    },

    toArray(): T[] {
      return [...heap];
    },
  };
}
