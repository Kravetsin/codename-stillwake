import { joinHost, localSession } from '@stillwake/net';
import { command, stillwake, stock, wreck } from '@stillwake/sim';
import { describe, expect, it } from 'vitest';
import { createRelay, serve, type RelayClient } from '../dev/relay';
import { hostOnRelay, joinOnRelay, type HotSocket, type LinkStatus } from './relay-link';

/**
 * A dev server in one process: the relay served on an event bus, and tabs whose sockets reach it.
 * Payloads go through JSON both ways, as over the real socket.
 */
function devServer() {
  const handlers = new Map<string, (data: never, client: RelayClient) => void>();
  serve(createRelay(), (event, handler) => handlers.set(event, handler));
  return {
    tab(): HotSocket & { close(): void } {
      const listeners = new Map<string, Set<(data: never) => void>>();
      const client: RelayClient = {
        send: (event, payload) => {
          const data: unknown =
            payload === undefined ? undefined : (JSON.parse(JSON.stringify(payload)) as unknown);
          for (const listener of listeners.get(event) ?? []) listener(data as never);
        },
      };
      const toServer = (event: string, data?: unknown) =>
        handlers.get(event)?.(JSON.parse(JSON.stringify(data ?? null)) as never, client);
      return {
        send: toServer,
        on: (event, listener) =>
          listeners.set(event, (listeners.get(event) ?? new Set()).add(listener)),
        off: (event, listener) => listeners.get(event)?.delete(listener),
        close: () => toServer('vite:client:disconnect'),
      };
    },
  };
}

/** What a tab's link last reported. */
function status() {
  let last: LinkStatus = { role: 'alone' };
  return { report: (next: LinkStatus) => (last = next), get: () => last };
}

describe('two tabs through the relay', () => {
  it('join mid-session: the joined tab loads the host world, catches up and stays in step', async () => {
    const server = devServer();
    const own = localSession(stillwake.create(3, wreck), 'b1');
    const hosting = status();
    hostOnRelay(server.tab(), () => own.host, hosting.report);
    expect(hosting.get()).toEqual({ role: 'host', session: '1', peers: 0 });
    // The host plays on alone for a while, with a command still pending when the other tab joins.
    own.client.send(command(stock, 'setCreative', { on: true }));
    for (let i = 0; i < 30; i++) own.host.advance();
    own.client.send(command(stock, 'setCreative', { on: false }));

    const joining = status();
    const joined = joinOnRelay(server.tab(), '1', joining.report);
    const client = await joinHost(stillwake, joined.channel, 'b1');
    expect(joining.get()).toEqual({ role: 'peer', session: '1', state: 'connected' });
    expect(hosting.get()).toMatchObject({ peers: 1 });
    expect(client.id).toBe(1);

    // Both play on, each sending commands; every tick both have run, their worlds agree.
    for (let i = 0; i < 40; i++) {
      if (i % 7 === 0) client.send(command(stock, 'setCreative', { on: i % 2 === 0 }));
      own.host.advance();
      own.client.update();
      client.update();
      expect(client.sim.world.tick).toBe(own.client.sim.world.tick);
      expect(client.sim.hash()).toBe(own.client.sim.hash());
    }
    expect(client.sim.world.tick).toBe(70);

    joined.stop();
    expect(joining.get()).toEqual({ role: 'alone' });
    expect(hosting.get()).toMatchObject({ peers: 0 });
  });

  it('refuse a tab running another build', async () => {
    const server = devServer();
    const own = localSession(stillwake.create(3, wreck), 'b1');
    hostOnRelay(
      server.tab(),
      () => own.host,
      () => {},
    );
    const joined = joinOnRelay(server.tab(), '1', () => {});
    await expect(joinHost(stillwake, joined.channel, 'b2')).rejects.toThrow('build b1');
  });

  it('tell a joining tab when its session never was, or its host left', async () => {
    const server = devServer();
    const hostTab = server.tab();
    hostOnRelay(
      hostTab,
      () => undefined,
      () => {},
    );
    const lost = status();
    await expect(joinOnRelay(server.tab(), '9', lost.report).ended).rejects.toThrow('No session 9');
    expect(lost.get()).toMatchObject({ state: 'refused' });
    const left = status();
    const waiting = joinOnRelay(server.tab(), '1', left.report);
    hostTab.close();
    await expect(waiting.ended).rejects.toThrow('left');
    expect(left.get()).toMatchObject({ state: 'host left' });
  });
});
