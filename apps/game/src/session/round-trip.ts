/** How many round trips the median is taken over. */
const KEPT = 20;

/** How long this peer's commands took from sent to run, in ms: the last, and the median of late. */
export interface RoundTrip {
  readonly last: number | undefined;
  readonly median: number | undefined;
}

/**
 * Times this peer's commands from sent to run by watching how many are in flight: each new one is
 * stamped when first seen, and one leaves, oldest first, when its tick runs. Seen once a frame, so a
 * time may read up to a frame short. `now` is the game's own clock, in ms.
 */
export function createRoundTrip() {
  let sentAt: number[] = [];
  let times: number[] = [];
  let last: number | undefined;
  return {
    /** Stamps the commands sent since the last look; called before the ticks run. */
    sent(inFlight: number, now: number) {
      while (sentAt.length < inFlight) sentAt.push(now);
    },
    /** Times the commands that ran; called after the ticks run. */
    ran(inFlight: number, now: number) {
      while (sentAt.length > inFlight) {
        last = now - (sentAt.shift() as number);
        times = [...times.slice(1 - KEPT), last];
      }
    },
    /** A new session's client: nothing of the old one is in flight. */
    reset() {
      sentAt = [];
    },
    read(): RoundTrip {
      const sorted = [...times].sort((a, b) => a - b);
      return { last, median: sorted[Math.floor(sorted.length / 2)] };
    },
  };
}
