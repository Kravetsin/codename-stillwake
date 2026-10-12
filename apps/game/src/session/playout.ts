import { TICKS_PER_SECOND } from '@stillwake/sim';

const TICK_MS = 1000 / TICKS_PER_SECOND;
/** How many arrivals the reserve is sized from: five seconds of ticks. */
const KEPT = 5 * TICKS_PER_SECOND;
/** Above how late the late ones came, the reserve keeps this much more. */
const MARGIN_MS = 10;
/** The reserve before anything is measured, and its bounds. */
const FIRST_MS = 100;
const MIN_MS = 10;
const MAX_MS = 300;
/** How fast the reserve may change, per millisecond passed: so the world never jumps or stalls. */
const EASE = 0.1;
/** How fast the earliest-arrival estimate may slip later, per millisecond: a path grown slower. */
const SLIP = 0.01;
/** A tick this much later than the estimate says starts it over: the host's tab paused, say. */
const RESTART_MS = 500;
/** At most this many ticks a frame, draining a backlog; as the host's clock catches up (`clock.ts`). */
const MAX_PER_FRAME = 5;

/** The share of `sorted` at or under which `share` of it lies. */
const quantile = (sorted: readonly number[], share: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0;

/**
 * When a joined peer runs the ticks its host released: each at the earliest it has been seen to
 * arrive, plus a reserve sized from how late ticks have come over the last few seconds (0013). A
 * jitter buffer, as for others' heroes: the relay delivers unevenly, and running ticks as they come
 * would move the world in bursts, while a fixed reserve wide enough for a bad link wastes time on a
 * good one. Times are the game's own clock, in ms.
 */
export function createPlayout() {
  // This machine's clock less the host's tick times, as the quickest arrival says.
  let offset: number | undefined;
  let heardAt = 0;
  let late: number[] = [];
  let target = FIRST_MS;
  let reserve = FIRST_MS;
  let easedAt: number | undefined;
  return {
    /** Tick `tick` arrived at `now`. */
    arrived(tick: number, now: number) {
      const sample = now - tick * TICK_MS;
      if (offset === undefined || sample - offset > RESTART_MS) {
        offset = sample;
        late = [];
      } else {
        offset = Math.min(offset + (now - heardAt) * SLIP, sample);
      }
      heardAt = now;
      late = [...late.slice(1 - KEPT), sample - offset];
      const p95 = quantile(
        [...late].sort((a, b) => a - b),
        0.95,
      );
      target = Math.min(MAX_MS, Math.max(MIN_MS, p95 + MARGIN_MS));
    },

    /** How many of the `queued` ticks after `tick` are due at `now`. */
    due(tick: number, queued: number, now: number): number {
      if (offset === undefined) return 0;
      const step = (now - (easedAt ?? now)) * EASE;
      reserve += Math.max(-step, Math.min(step, target - reserve));
      easedAt = now;
      const last = Math.floor((now - offset - reserve) / TICK_MS);
      return Math.max(0, Math.min(queued, MAX_PER_FRAME, last - tick + 1));
    },

    /** How far time is from tick `tick` towards the next, 0 to 1, for drawing between ticks. */
    progress(tick: number, now: number): number {
      if (offset === undefined) return 0;
      const into = (now - (offset + reserve + (tick - 1) * TICK_MS)) / TICK_MS;
      return Math.max(0, Math.min(1, into));
    },

    /** The reserve now, in ms, for the dev panel. */
    get reserve() {
      return reserve;
    },
  };
}
