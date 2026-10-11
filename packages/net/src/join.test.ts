import { command, defineSim } from '@stillwake/sim';
import { describe, expect, it } from 'vitest';
import { loopback } from './channel';
import { createHost } from './host';
import { joinHost } from './join';
import { localSession } from './local';
import type { ToClient, ToHost } from './protocol';
import { board } from './testing/fixtures';

const game = defineSim([board]);
const write = (text: string) => command(board, 'write', { text });

describe('joining a session mid-way', () => {
  it("starts from the host's world, with the commands it had not released yet, and keeps step", async () => {
    const { host, client: own } = localSession(game.create(1), 'b1');
    own.send(write('before'));
    host.advance();
    host.advance();
    // Released but not yet run by the host player: the welcome brings the world up to date first.
    own.send(write('pending'));

    const [toPeer, fromHost] = loopback<ToClient, ToHost>();
    const id = host.admit(toPeer);
    const joined = await joinHost(game, fromHost, 'b1');
    expect(joined.id).toBe(id);
    expect(joined.sim.world.tick).toBe(2);

    joined.send(write('joined'));
    host.advance();
    own.update();
    joined.update();
    expect(joined.sim.query(board).notes()).toEqual(['0:before', '2:pending', '2:joined']);
    expect(joined.sim.hash()).toBe(own.sim.hash());
  });

  it('catches up on ticks released between the welcome and its first update', async () => {
    const { host, client: own } = localSession(game.create(1), 'b1');
    const [toPeer, fromHost] = loopback<ToClient, ToHost>();
    host.admit(toPeer);
    host.advance();
    host.advance();
    const joined = await joinHost(game, fromHost, 'b1');
    expect(joined.update()).toHaveLength(2);
    own.update();
    expect(joined.sim.hash()).toBe(own.sim.hash());
  });

  it('is refused by a host running another build', async () => {
    const { host } = localSession(game.create(1), 'b1');
    const [toPeer, fromHost] = loopback<ToClient, ToHost>();
    host.admit(toPeer);
    await expect(joinHost(game, fromHost, 'b2')).rejects.toThrow('build b1; this is build b2');
  });

  it('leaves the host quiet after a refusal: what it sends next goes nowhere', async () => {
    const { host } = localSession(game.create(1), 'b1');
    const [toPeer, fromHost] = loopback<ToClient, ToHost>();
    host.admit(toPeer);
    await expect(joinHost(game, fromHost, 'b2')).rejects.toThrow();
    expect(() => host.advance()).not.toThrow();
  });

  it('is our bug on a host with no world to welcome with', () => {
    const [toPeer] = loopback<ToClient, ToHost>();
    expect(() => createHost(0).admit(toPeer)).toThrow('no world');
  });
});
