import { describe, expect, it } from 'vitest';
import { badNetworkFrom, overBadNetwork, type Timing } from './bad-network';
import type { RelaySocket } from './relay-link';
import { relayFor } from './relay-socket';

/** Time that moves only when told, and a random draw the test sets. */
function testTiming() {
  let now = 0;
  let timers: { at: number; then: () => void }[] = [];
  const timing: Timing & { draw: number } = {
    draw: 0,
    now: () => now,
    wait: (ms, then) => void timers.push({ at: now + ms, then }),
    random: () => timing.draw,
  };
  return {
    timing,
    /** Moves time on to `to`, firing every timer due by then, earliest first. */
    pass: (to: number) => {
      for (;;) {
        const next = timers.filter((t) => t.at <= to).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        timers = timers.filter((t) => t !== next);
        now = next.at;
        next.then();
      }
      now = to;
    },
  };
}

/** A socket that records what is sent and hears what the test says. */
function fakeSocket() {
  const sent: { at: number; event: string; data: unknown }[] = [];
  const listeners = new Map<string, Set<(data: unknown) => void>>();
  let clock = () => 0;
  const socket: RelaySocket = {
    send: (event, data) => sent.push({ at: clock(), event, data }),
    on: (event, listener) => {
      listeners.set(event, (listeners.get(event) ?? new Set()).add(listener));
    },
    off: (event, listener) => listeners.get(event)?.delete(listener),
  };
  return {
    socket,
    sent,
    tell: (now: () => number) => (clock = now),
    hear: (event: string, data: unknown) => {
      for (const listener of listeners.get(event) ?? []) listener(data);
    },
  };
}

describe('a bad network', () => {
  it('is read from the page’s address, and none without it', () => {
    expect(badNetworkFrom('http://x/?join=a&lag=100&jitter=60')).toEqual({ lag: 100, jitter: 60 });
    expect(badNetworkFrom('http://x/?host&jitter=40')).toEqual({ lag: 0, jitter: 40 });
    expect(badNetworkFrom('http://x/?host&lag=oops')).toEqual({ lag: 0, jitter: 0 });
    expect(badNetworkFrom('http://x/?host')).toBeUndefined();
  });

  it('sends each message lag plus up to jitter late', () => {
    const { timing, pass } = testTiming();
    const f = fakeSocket();
    f.tell(timing.now);
    const bad = overBadNetwork(f.socket, { lag: 100, jitter: 60 }, timing);
    timing.draw = 0.5;
    bad.send('a', 1);
    pass(129);
    expect(f.sent).toEqual([]);
    pass(1000);
    expect(f.sent).toEqual([{ at: 130, event: 'a', data: 1 }]);
  });

  it('never hands a message over before the one sent ahead of it', () => {
    const { timing, pass } = testTiming();
    const f = fakeSocket();
    f.tell(timing.now);
    const bad = overBadNetwork(f.socket, { lag: 100, jitter: 60 }, timing);
    timing.draw = 1;
    bad.send('slow', 1);
    pass(10);
    timing.draw = 0;
    bad.send('quick', 2);
    pass(1000);
    // The quick one would be due at 110; it waits for the slow one, due at 160.
    expect(f.sent.map((s) => [s.event, s.at])).toEqual([
      ['slow', 160],
      ['quick', 160],
    ]);
  });

  it('delays what is heard the same way, each listener in order', () => {
    const { timing, pass } = testTiming();
    const f = fakeSocket();
    const bad = overBadNetwork(f.socket, { lag: 50, jitter: 0 }, timing);
    const heard: [string, unknown, number][] = [];
    bad.on('joined', (data) => heard.push(['joined', data, timing.now()]));
    bad.on('message', (data) => heard.push(['message', data, timing.now()]));
    f.hear('joined', 1);
    pass(20);
    f.hear('message', 2);
    pass(49);
    expect(heard).toEqual([]);
    pass(1000);
    expect(heard).toEqual([
      ['joined', 1, 50],
      ['message', 2, 70],
    ]);
  });

  it('stops a listener that went off hearing, even what was on its way', () => {
    const { timing, pass } = testTiming();
    const f = fakeSocket();
    const bad = overBadNetwork(f.socket, { lag: 50, jitter: 0 }, timing);
    const heard: unknown[] = [];
    const listener = (data: unknown) => heard.push(data);
    bad.on('message', listener);
    f.hear('message', 1);
    bad.off('message', listener);
    f.hear('message', 2);
    pass(1000);
    expect(heard).toEqual([]);
  });

  it('wraps whichever relay a page reaches, only when asked', () => {
    const hot: RelaySocket = { send() {}, on() {}, off() {} };
    expect(relayFor({ href: 'http://localhost:5173/?host', protocol: 'http:' }, hot)).toBe(hot);
    const bad = relayFor({ href: 'http://localhost:5173/?host&lag=80', protocol: 'http:' }, hot);
    expect(bad).toBeDefined();
    expect(bad).not.toBe(hot);
  });
});
