import { TICKS_PER_SECOND } from '@stillwake/sim';

const TICK_MS = 1000 / TICKS_PER_SECOND;

/**
 * Turns frame time into whole ticks. A long gap — a hidden tab, a breakpoint — releases at most
 * `maxCatchUp` ticks and drops the rest, so the game resumes instead of racing to catch up.
 */
export function createClock(maxCatchUp = 5) {
  let carried = 0;
  return {
    /** How many ticks are due after `elapsedMs` more of game time. */
    advance(elapsedMs: number): number {
      carried += elapsedMs;
      const due = Math.floor(carried / TICK_MS);
      carried -= due * TICK_MS;
      if (due <= maxCatchUp) return due;
      carried = 0;
      return maxCatchUp;
    },
    /** How far game time is into the next tick, from 0 to 1, for smoothing what is drawn. */
    progress(): number {
      return carried / TICK_MS;
    },
  };
}
