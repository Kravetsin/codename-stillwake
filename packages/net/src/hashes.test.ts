import { command, defineSim } from '@stillwake/sim';
import { describe, expect, it } from 'vitest';
import { loopback } from './channel';
import type { Client } from './client';
import { diffSaves } from './diff';
import { joinHost } from './join';
import { localSession } from './local';
import { HASH_EVERY, type ToClient, type ToHost } from './protocol';
import { board, drift } from './testing/fixtures';

const game = defineSim([board, drift]);

/** A host player's session and a peer joined to it, both at tick 0. */
async function session() {
  const own = localSession(game.create(1), 'b');
  const [toPeer, fromHost] = loopback<ToClient, ToHost>();
  own.host.admit(toPeer);
  const peer = await joinHost(game, fromHost, 'b');
  return { own, peer };
}

/** Releases ticks up to `tick` and runs them, the peer first or the host player first. */
function runTo(
  own: { host: { advance(): void; tick: number }; client: Client },
  peer: Client,
  tick: number,
  first: 'peer' | 'own' = 'own',
) {
  while (own.host.tick < tick) own.host.advance();
  const order = first === 'own' ? [own.client, peer] : [peer, own.client];
  for (const client of order) client.update();
}

describe('live hash checks', () => {
  it('leave peers in step alone: no resync, no report', async () => {
    const { own, peer } = await session();
    peer.send(command(board, 'write', { text: 'hi' }));
    runTo(own, peer, 3 * HASH_EVERY);
    runTo(own, peer, 3 * HASH_EVERY + 1);
    expect(peer.takeDesyncs()).toEqual([]);
    expect(peer.sim.hash()).toBe(own.client.sim.hash());
  });

  it('catch a drifted peer at the next check, report what drifted, and repair it', async () => {
    const { own, peer } = await session();
    runTo(own, peer, 5);
    // Injected: the peer's world changed behind the pipeline's back.
    (peer.sim.world.slices['drift'] as { position: number }).position += 3;
    runTo(own, peer, HASH_EVERY);
    // The host saw the hashes differ and sent the resync; the peer takes it on its next update.
    runTo(own, peer, HASH_EVERY + 1);
    expect(peer.takeDesyncs()).toEqual([
      { tick: HASH_EVERY, rng: false, modules: [{ id: 'drift', paths: ['drift.position'] }] },
    ]);
    expect(peer.sim.hash()).toBe(own.client.sim.hash());
    // Repaired, it stays in step.
    runTo(own, peer, 3 * HASH_EVERY + 1);
    expect(peer.takeDesyncs()).toEqual([]);
    expect(peer.sim.hash()).toBe(own.client.sim.hash());
  });

  it("hold a peer's hash until the host player's arrives, then check it", async () => {
    const { own, peer } = await session();
    (peer.sim.world.slices['drift'] as { position: number }).position += 1;
    runTo(own, peer, HASH_EVERY, 'peer');
    runTo(own, peer, HASH_EVERY + 1);
    expect(peer.takeDesyncs()).toHaveLength(1);
    expect(peer.sim.hash()).toBe(own.client.sim.hash());
  });

  it('resync a peer once, not again for the hashes it sent before taking the resync', async () => {
    const { own, peer } = await session();
    (peer.sim.world.slices['drift'] as { position: number }).position += 1;
    // The peer runs two checks' worth before it takes the resync the first one brought.
    runTo(own, peer, 2 * HASH_EVERY);
    runTo(own, peer, 2 * HASH_EVERY + 1);
    expect(peer.takeDesyncs()).toHaveLength(1);
    runTo(own, peer, 4 * HASH_EVERY + 1);
    expect(peer.takeDesyncs()).toEqual([]);
  });
});

describe('a desync report', () => {
  const save = (tick: number, rng: number, slices: object) =>
    JSON.stringify({ format: 0, world: { tick, rng: { s: rng }, slices } });

  it('names each module that differs, with the paths within it, and whether the rng drifted', () => {
    const mine = save(9, 1, { a: { x: [1, 2, 3], y: { z: 1 } }, b: { k: 1 }, c: 5 });
    const theirs = save(9, 2, { a: { x: [1, 5], y: { z: 2 } }, b: { k: 1 }, c: 6 });
    expect(diffSaves(mine, theirs)).toEqual({
      tick: 9,
      rng: true,
      modules: [
        { id: 'a', paths: ['a.x.length', 'a.x[1]', 'a.y.z'] },
        { id: 'c', paths: ['c'] },
      ],
    });
  });

  it('lists a few paths per module, not a whole drifted grid', () => {
    const many = Array.from({ length: 100 }, (_, i) => i);
    const report = diffSaves(save(0, 1, { g: many }), save(0, 1, { g: many.map((n) => n + 1) }));
    expect(report.modules[0]?.paths).toHaveLength(10);
  });
});
