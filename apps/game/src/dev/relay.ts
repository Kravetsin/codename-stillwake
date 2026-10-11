/**
 * The development relay: passes messages between a hosting tab and the tabs that join it, over the
 * dev server's own WebSocket. It reads no message, only routes it. Release builds talk over Steam.
 */

/** A connected tab, as the dev server hands it to the relay. */
export interface RelayClient {
  send(event: string, payload?: unknown): void;
}

/** What the relay sends to tabs, by event name. */
export const RELAY = {
  host: 'stillwake:host',
  hosted: 'stillwake:hosted',
  join: 'stillwake:join',
  connected: 'stillwake:connected',
  refused: 'stillwake:refused',
  joined: 'stillwake:joined',
  left: 'stillwake:left',
  hostLeft: 'stillwake:host-left',
  leave: 'stillwake:leave',
  toHost: 'stillwake:to-host',
  fromPeer: 'stillwake:from-peer',
  toPeer: 'stillwake:to-peer',
  fromHost: 'stillwake:from-host',
} as const;

interface Session {
  readonly host: RelayClient;
  readonly peers: Map<number, RelayClient>;
  nextPeer: number;
}

/**
 * Sessions by id, each a hosting tab and the tabs joined to it. A tab hosts or joins one session at a
 * time; a session ends when its host goes, and its peers hear of it.
 */
export function createRelay() {
  const sessions = new Map<string, Session>();
  let nextSession = 1;
  const hostOf = (client: RelayClient) => [...sessions].find(([, s]) => s.host === client);
  const peerOf = (client: RelayClient) => {
    for (const [id, session] of sessions) {
      for (const [peer, c] of session.peers) if (c === client) return { id, session, peer };
    }
    return undefined;
  };

  return {
    host(client: RelayClient) {
      const id = String(nextSession++);
      sessions.set(id, { host: client, peers: new Map(), nextPeer: 1 });
      client.send(RELAY.hosted, { session: id });
    },

    join(client: RelayClient, session: string) {
      const found = sessions.get(session);
      if (!found) return client.send(RELAY.refused, { session });
      const peer = found.nextPeer++;
      found.peers.set(peer, client);
      client.send(RELAY.connected, { session });
      found.host.send(RELAY.joined, { peer });
    },

    /** A joined tab's message, passed to its host with the peer it came from. */
    toHost(client: RelayClient, message: unknown) {
      const from = peerOf(client);
      from?.session.host.send(RELAY.fromPeer, { peer: from.peer, message });
    },

    /** A host's message to one of its peers; nothing if that peer has gone. */
    toPeer(client: RelayClient, peer: number, message: unknown) {
      hostOf(client)?.[1].peers.get(peer)?.send(RELAY.fromHost, { message });
    },

    /** A tab gone: a host takes its session with it, a peer leaves its session. */
    leave(client: RelayClient) {
      const hosted = hostOf(client);
      if (hosted) {
        sessions.delete(hosted[0]);
        for (const peer of hosted[1].peers.values()) peer.send(RELAY.hostLeft);
        return;
      }
      const from = peerOf(client);
      if (!from) return;
      from.session.peers.delete(from.peer);
      from.session.host.send(RELAY.left, { peer: from.peer });
    },
  };
}

export type Relay = ReturnType<typeof createRelay>;

/**
 * Wires `relay` to a server's events: `on` subscribes to one event from the tabs, as the dev server's
 * `ws.on` does. A tab leaves when it closes, or when the game in it is torn down and made again.
 */
export function serve(
  relay: Relay,
  on: (event: string, handler: (data: never, client: RelayClient) => void) => void,
): void {
  on(RELAY.host, (_: unknown, client) => relay.host(client));
  on(RELAY.join, (data: { session: string }, client) => relay.join(client, data.session));
  on(RELAY.toHost, (data: { message: unknown }, client) => relay.toHost(client, data.message));
  on(RELAY.toPeer, (data: { peer: number; message: unknown }, client) =>
    relay.toPeer(client, data.peer, data.message),
  );
  for (const event of ['vite:client:disconnect', RELAY.leave]) {
    on(event, (_: unknown, client) => relay.leave(client));
  }
}
