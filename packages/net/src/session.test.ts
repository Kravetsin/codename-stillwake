import { command, defineSim } from '@stillwake/sim';
import { describe, expect, it } from 'vitest';
import { loopback } from './channel';
import { createClient } from './client';
import { createHost } from './host';
import { localSession } from './local';
import type { ToClient, ToHost } from './protocol';
import { board } from './testing/fixtures';

const game = defineSim([board]);
const write = (text: string) => command(board, 'write', { text });

describe('single-player', () => {
  it('applies a command on the tick the host releases it', () => {
    const { host, client } = localSession(game.create(1));
    client.send(write('hello'));
    expect(client.update()).toEqual([]);

    host.advance();
    const reports = client.update();
    expect(reports).toHaveLength(1);
    expect(client.sim.query(board).notes()).toEqual(['0:hello']);
  });

  it('runs released ticks even with no commands, and catches up on several at once', () => {
    const { host, client } = localSession(game.create(1));
    host.advance();
    host.advance();
    host.advance();
    expect(client.update()).toHaveLength(3);
    expect(client.sim.world.tick).toBe(3);
  });

  it('puts a command sent between releases into the next one', () => {
    const { host, client } = localSession(game.create(1));
    host.advance();
    client.send(write('late'));
    host.advance();
    client.update();
    expect(client.sim.query(board).notes()).toEqual(['1:late']);
  });

  it('reports refusals back to the sender', () => {
    const { host, client } = localSession(game.create(1));
    client.send(write(''));
    host.advance();
    const [report] = client.update();
    expect(report?.refused.map((r) => r.reason)).toEqual(['board.empty']);
  });

  it('starts the host at a loaded world’s tick', () => {
    const played = game.create(1);
    for (let i = 0; i < 7; i++) played.step([]);
    const { host, client } = localSession(game.load(played.save()));
    expect(host.tick).toBe(7);
    host.advance();
    expect(client.update()).toHaveLength(1);
  });
});

describe('several players', () => {
  function threePlayers() {
    const host = createHost(0);
    const clients = [0, 1, 2].map(() => {
      const [toClient, toHost] = loopback<ToClient, ToHost>();
      const id = host.connect(toClient);
      return createClient(game.create(9), toHost, id);
    });
    return { host, clients };
  }

  it('applies everyone’s commands in the order the host received them, on every peer', () => {
    const { host, clients } = threePlayers();
    const [a, b, c] = clients as [(typeof clients)[0], (typeof clients)[0], (typeof clients)[0]];
    b.send(write('b1'));
    a.send(write('a1'));
    host.advance();
    c.send(write('c1'));
    b.send(write('b2'));
    host.advance();
    for (const client of clients) client.update();

    for (const client of clients) {
      expect(client.sim.query(board).notes()).toEqual(['0:b1', '0:a1', '1:c1', '1:b2']);
    }
    expect(new Set(clients.map((client) => client.sim.hash())).size).toBe(1);
  });

  it('stamps each peer’s commands with its id, whatever the client wrote', () => {
    const host = createHost(0);
    const peers = [0, 1].map(() => loopback<ToClient, ToHost>());
    const ids = peers.map(([toClient]) => host.connect(toClient));
    expect(ids).toEqual([0, 1]);
    const released: number[] = [];
    peers[0]?.[1].onMessage((message) => {
      if (message.kind === 'tick') released.push(...message.commands.map((c) => c.from));
    });
    peers[1]?.[1].send({ kind: 'command', command: { ...write('x'), from: 7 } });
    peers[0]?.[1].send({ kind: 'command', command: { ...write('y'), from: 7 } });
    host.advance();
    expect(released).toEqual([1, 0]);
  });

  it('lets a peer that updates later catch up to the same world', () => {
    const { host, clients } = threePlayers();
    const [eager, , lazy] = clients as [(typeof clients)[0], unknown, (typeof clients)[0]];
    for (let i = 0; i < 10; i++) {
      eager.send(write(`n${i}`));
      host.advance();
      eager.update();
    }
    lazy.update();
    expect(lazy.sim.hash()).toBe(eager.sim.hash());
  });

  it('throws when a released tick does not follow the world’s tick', () => {
    const [toClient, toHost] = loopback<ToClient, ToHost>();
    const client = createClient(game.create(1), toHost, 0);
    toClient.send({ kind: 'tick', tick: 5, commands: [] });
    expect(() => client.update()).toThrow('Expected tick 0, but the host released 5.');
  });
});

describe('loopback', () => {
  it('delivers copies, so sender and receiver never share an object', () => {
    const [a, b] = loopback<{ list: number[] }, never>();
    const received: { list: number[] }[] = [];
    b.onMessage((m) => received.push(m));
    const sent = { list: [1] };
    a.send(sent);
    sent.list.push(2);
    expect(received).toEqual([{ list: [1] }]);
  });

  it('holds messages until a receiver is set, then delivers them in order', () => {
    const [a, b] = loopback<number, never>();
    a.send(1);
    a.send(2);
    const received: number[] = [];
    b.onMessage((m) => received.push(m));
    a.send(3);
    expect(received).toEqual([1, 2, 3]);
  });
});

describe('heroes', () => {
  it('pass through the host to every other peer, stamped with the sender, and never back', () => {
    const host = createHost(0);
    const clients = [0, 1, 2].map(() => {
      const [toClient, toHost] = loopback<ToClient, ToHost>();
      return createClient(game.create(1), toHost, host.connect(toClient));
    });
    clients[1]?.sendHero({ x: 1 });
    clients[2]?.sendHero({ x: 2 });
    clients[1]?.sendHero({ x: 3 });
    expect(clients[0]?.takeHeroes()).toEqual([
      { from: 1, state: { x: 1 } },
      { from: 2, state: { x: 2 } },
      { from: 1, state: { x: 3 } },
    ]);
    expect(clients[1]?.takeHeroes()).toEqual([{ from: 2, state: { x: 2 } }]);
    expect(clients[0]?.takeHeroes()).toEqual([]);
  });

  it('stay out of the simulation: no tick, no command, the same hash', () => {
    const { host, client } = localSession(game.create(1));
    const [toClient, toHost] = loopback<ToClient, ToHost>();
    const other = createClient(game.create(1), toHost, host.connect(toClient));
    other.sendHero({ x: 5 });
    host.advance();
    const [report] = client.update();
    expect(report?.refused).toEqual([]);
    // As a world that ran the same tick with nothing in it.
    const quiet = game.create(1);
    quiet.step([]);
    expect(client.sim.hash()).toBe(quiet.hash());
    other.update();
    expect(other.sim.hash()).toBe(client.sim.hash());
    expect(client.takeHeroes()).toEqual([{ from: 1, state: { x: 5 } }]);
  });
});
