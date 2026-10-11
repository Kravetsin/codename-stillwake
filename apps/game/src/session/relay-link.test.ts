import { createHost, loopback, type ToClient, type ToHost } from '@stillwake/net';
import { command, stock } from '@stillwake/sim';
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
  it('host and join a session: the host releases ticks, the joined tab receives them', () => {
    const server = devServer();
    const host = createHost(0);
    // The host tab's own game, a local peer of its host: it sees what every peer sees.
    const [toLocal, local] = loopback<ToClient, ToHost>();
    host.connect(toLocal);
    const released: ToClient[] = [];
    local.onMessage((m) => released.push(m));

    const hosting = status();
    hostOnRelay(server.tab(), () => host, hosting.report);
    expect(hosting.get()).toEqual({ role: 'host', session: '1', peers: 0 });

    const joining = status();
    const joiner = server.tab();
    const stopJoin = joinOnRelay(joiner, '1', joining.report);
    expect(joining.get()).toMatchObject({
      role: 'peer',
      session: '1',
      state: 'connected',
      ticks: 0,
    });
    expect(hosting.get()).toMatchObject({ peers: 1 });
    host.advance();
    host.advance();
    expect(joining.get()).toMatchObject({ ticks: 2, tick: 1 });

    // A command from the joined tab reaches the host, which stamps it with that peer's id.
    const creative = command(stock, 'setCreative', { on: true });
    joiner.send('stillwake:to-host', { message: { kind: 'command', command: creative } });
    host.advance();
    expect(released.at(-1)?.commands).toEqual([{ ...creative, from: 1 }]);
    expect(joining.get()).toMatchObject({ ticks: 3, tick: 2 });

    stopJoin();
    expect(joining.get()).toEqual({ role: 'alone' });
    expect(hosting.get()).toMatchObject({ peers: 0 });
  });

  it('tell a joining tab when its session never was, or its host left', () => {
    const server = devServer();
    const hostTab = server.tab();
    hostOnRelay(
      hostTab,
      () => createHost(0),
      () => {},
    );
    const lost = status();
    joinOnRelay(server.tab(), '9', lost.report);
    expect(lost.get()).toMatchObject({ state: 'refused' });
    const left = status();
    joinOnRelay(server.tab(), '1', left.report);
    hostTab.close();
    expect(left.get()).toMatchObject({ state: 'host left' });
  });
});
