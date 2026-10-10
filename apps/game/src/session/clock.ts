/** The most game time a long gap — a hidden tab, a breakpoint — releases; the rest is dropped. */
const MAX_CATCH_UP_MS = 250;

/**
 * Turns frame time into whole steps of `stepMs`: the sim's ticks, the hero controller's steps. A
 * long gap releases at most MAX_CATCH_UP_MS of steps, so the game resumes instead of racing.
 */
export function createClock(stepMs: number) {
  const maxCatchUp = Math.max(1, Math.floor(MAX_CATCH_UP_MS / stepMs));
  let carried = 0;
  return {
    /** How many steps are due after `elapsedMs` more time. */
    advance(elapsedMs: number): number {
      carried += elapsedMs;
      const due = Math.floor(carried / stepMs);
      carried -= due * stepMs;
      if (due <= maxCatchUp) return due;
      carried = 0;
      return maxCatchUp;
    },
    /** How far time is into the next step, from 0 to 1, for smoothing what is drawn. */
    progress(): number {
      return carried / stepMs;
    },
  };
}
