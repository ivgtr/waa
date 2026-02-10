// ---------------------------------------------------------------------------
// M8: Scheduler & Clock
// ---------------------------------------------------------------------------

import type { ClockOptions, ScheduledEvent, SchedulerOptions } from "./types.js";

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

export interface Scheduler {
  /** Schedule a callback at a specific AudioContext time. */
  schedule(id: string, time: number, callback: (time: number) => void): void;
  /** Remove a scheduled event by id. */
  cancel(id: string): void;
  /** Start the scheduler loop. */
  start(): void;
  /** Stop the scheduler loop. */
  stop(): void;
  /** Dispose of all resources. */
  dispose(): void;
}

/**
 * Create a lookahead-based event scheduler.
 *
 * Uses `setInterval` to check upcoming events and fire callbacks
 * slightly before their scheduled time, enabling sample-accurate timing.
 */
export function createScheduler(ctx: AudioContext, options?: SchedulerOptions): Scheduler {
  const { lookahead = 0.1, interval = 25 } = options ?? {};

  const events: ScheduledEvent[] = [];
  let timerId: ReturnType<typeof setInterval> | null = null;

  function tick() {
    const horizon = ctx.currentTime + lookahead;
    for (let i = events.length - 1; i >= 0; i--) {
      const evt = events[i]!;
      if (evt.time <= horizon) {
        evt.callback(evt.time);
        events.splice(i, 1);
      }
    }
  }

  return {
    schedule(id, time, callback) {
      events.push({ id, time, callback });
    },
    cancel(id) {
      const idx = events.findIndex((e) => e.id === id);
      if (idx !== -1) events.splice(idx, 1);
    },
    start() {
      if (timerId !== null) return;
      timerId = setInterval(tick, interval);
    },
    stop() {
      if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
      }
    },
    dispose() {
      this.stop();
      events.length = 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

export interface Clock {
  /** Convert a beat number to AudioContext time (seconds). */
  beatToTime(beat: number): number;
  /** Get the current beat based on AudioContext time. */
  getCurrentBeat(): number;
  /** Get the AudioContext time of the next beat boundary. */
  getNextBeatTime(): number;
  /** Update BPM. */
  setBpm(bpm: number): void;
  /** Get current BPM. */
  getBpm(): number;
}

/**
 * Create a BPM-based clock tied to an `AudioContext`.
 */
export function createClock(ctx: AudioContext, options?: ClockOptions): Clock {
  let bpm = options?.bpm ?? 120;
  const startTime = ctx.currentTime;

  function secondsPerBeat() {
    return 60 / bpm;
  }

  return {
    beatToTime(beat: number): number {
      return startTime + beat * secondsPerBeat();
    },
    getCurrentBeat(): number {
      return (ctx.currentTime - startTime) / secondsPerBeat();
    },
    getNextBeatTime(): number {
      const current = this.getCurrentBeat();
      const next = Math.ceil(current);
      return this.beatToTime(next === current ? next + 1 : next);
    },
    setBpm(value: number) {
      bpm = value;
    },
    getBpm(): number {
      return bpm;
    },
  };
}
