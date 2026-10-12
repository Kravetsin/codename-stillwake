/**
 * Ticks a joined peer keeps in reserve before it runs any: the relay delivers in bursts, and a
 * reserve lets the world go on at an even pace through them (0013). Two ticks, 100 ms.
 */
export const PLAYOUT_TICKS = 2;
/** Each tick waiting beyond the reserve plays the rest this much faster, to drain a backlog. */
const DRAIN_PER_TICK = 0.25;

/**
 * How fast a joined peer plays the ticks its host released, as a multiple of real time: 0 holds.
 * It waits for the reserve before it starts and again whenever the queue runs dry, plays at the
 * host's pace while the queue holds about the reserve, and faster the more ticks pile up.
 */
export function createPlayout() {
  let playing = false;
  return {
    /** The pace for this frame, given how many released ticks wait to run. */
    rate(queued: number): number {
      if (queued === 0) playing = false;
      else if (queued >= PLAYOUT_TICKS) playing = true;
      if (!playing) return 0;
      // A tick above the reserve is a burst's spare, not a backlog: it plays out at the host's pace.
      const backlog = Math.max(0, queued - PLAYOUT_TICKS - 1);
      return 1 + backlog * DRAIN_PER_TICK;
    },
  };
}
