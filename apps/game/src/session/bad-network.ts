import type { RelaySocket } from './relay-link';

/** How bad to make a page's link, in milliseconds: every message waits `lag` plus up to `jitter`. */
export interface BadNetwork {
  readonly lag: number;
  readonly jitter: number;
}

/** What the delays run on: real time in the page, a test's own in tests. */
export interface Timing {
  readonly now: () => number;
  readonly wait: (ms: number, then: () => void) => void;
  readonly random: () => number;
}

const realTiming: Timing = {
  now: () => performance.now(),
  wait: (ms, then) => void setTimeout(then, ms),
  random: () => Math.random(),
};

/** `?lag=<ms>` and `?jitter=<ms>` from a page's address; none when neither is there. */
export function badNetworkFrom(href: string): BadNetwork | undefined {
  const params = new URL(href).searchParams;
  if (!params.has('lag') && !params.has('jitter')) return undefined;
  const ms = (name: string) => Math.max(0, Number(params.get(name)) || 0);
  return { lag: ms('lag'), jitter: ms('jitter') };
}

/**
 * A line that hands things over late, each `lag` plus a random share of `jitter` after it came,
 * but never before the one that came ahead of it: one TCP stream, which keeps order whatever it costs.
 */
function delayLine({ lag, jitter }: BadNetwork, timing: Timing) {
  const due: { at: number; deliver: () => void }[] = [];
  // Only from the head: one not due yet holds back every one behind it.
  const flush = () => {
    const now = timing.now();
    while (due.length > 0 && (due[0] as { at: number }).at <= now) due.shift()?.deliver();
  };
  return (deliver: () => void) => {
    const delay = lag + timing.random() * jitter;
    due.push({ at: timing.now() + delay, deliver });
    timing.wait(delay, flush);
  };
}

/**
 * `socket` as a bad network would carry it, both ways, for reproducing on one machine what friends
 * across the internet see (0013). Every event is delayed, the relay's own `joined` and `left` too.
 */
export function overBadNetwork(
  socket: RelaySocket,
  network: BadNetwork,
  timing: Timing = realTiming,
): RelaySocket {
  const out = delayLine(network, timing);
  const into = delayLine(network, timing);
  // Each listener's late stand-in, by event, so `off` finds it.
  const wrapped = new Map<string, Map<(data: unknown) => void, (data: unknown) => void>>();
  return {
    send(event, data) {
      out(() => socket.send(event, data));
    },
    on(event, listener) {
      const byListener =
        wrapped.get(event) ?? new Map<(data: unknown) => void, (data: unknown) => void>();
      wrapped.set(event, byListener);
      const late = (data: unknown) =>
        into(() => {
          // One that stopped listening while this was on its way hears nothing more.
          if (byListener.get(listener) === late) listener(data);
        });
      byListener.set(listener, late);
      socket.on(event, late);
    },
    off(event, listener) {
      const late = wrapped.get(event)?.get(listener);
      if (!late) return;
      socket.off(event, late);
      wrapped.get(event)?.delete(listener);
    },
  };
}
