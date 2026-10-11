import { describe, expect, it } from 'vitest';
import { createRelay, RELAY, type RelayClient } from './relay';

/** A tab that records what the relay sends it. */
function tab(): RelayClient & { got: [string, unknown][] } {
  const got: [string, unknown][] = [];
  return { got, send: (event, payload) => got.push([event, payload]) };
}

describe('the dev relay', () => {
  it('opens a session for a host and joins tabs to it, telling both sides', () => {
    const relay = createRelay();
    const host = tab();
    const a = tab();
    const b = tab();
    relay.host(host);
    relay.join(a, '1', 5);
    relay.join(b, '1', 5);
    expect(host.got).toEqual([
      [RELAY.hosted, { session: '1' }],
      [RELAY.joined, { peer: 1 }],
      [RELAY.joined, { peer: 2 }],
    ]);
    expect(a.got).toEqual([[RELAY.connected, { session: '1', token: 5, peer: 1 }]]);
  });

  it('refuses a session that does not exist', () => {
    const relay = createRelay();
    const a = tab();
    relay.join(a, '7', 3);
    expect(a.got).toEqual([[RELAY.refused, { session: '7', token: 3 }]]);
  });

  it('passes messages between a host and each of its peers, and only them', () => {
    const relay = createRelay();
    const [host, other, a, b, stranger] = [tab(), tab(), tab(), tab(), tab()];
    relay.host(host);
    relay.host(other);
    relay.join(a, '1', 1);
    relay.join(b, '2', 1);
    relay.toHost(a, { n: 1 });
    relay.toHost(stranger, { n: 2 });
    relay.toPeer(host, 1, { n: 3 });
    relay.toPeer(host, 9, { n: 4 });
    relay.toPeer(stranger, 1, { n: 5 });
    expect(host.got.at(-1)).toEqual([RELAY.fromPeer, { peer: 1, message: { n: 1 } }]);
    expect(other.got).toEqual([
      [RELAY.hosted, { session: '2' }],
      [RELAY.joined, { peer: 1 }],
    ]);
    expect(a.got.at(-1)).toEqual([RELAY.fromHost, { peer: 1, message: { n: 3 } }]);
    expect(b.got).toEqual([[RELAY.connected, { session: '2', token: 1, peer: 1 }]]);
  });

  it('tells a host of a peer that left, and the peers of a host that left, ending the session', () => {
    const relay = createRelay();
    const [host, a, b, late] = [tab(), tab(), tab(), tab()];
    relay.host(host);
    relay.join(a, '1', 1);
    relay.join(b, '1', 1);
    relay.leave(a);
    expect(host.got.at(-1)).toEqual([RELAY.left, { peer: 1 }]);
    relay.leave(host);
    expect(b.got.at(-1)).toEqual([RELAY.hostLeft, undefined]);
    relay.join(late, '1', 1);
    expect(late.got).toEqual([[RELAY.refused, { session: '1', token: 1 }]]);
    relay.leave(late);
  });
});
