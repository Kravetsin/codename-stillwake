import type { Channel, Host, ToClient, ToHost } from '@stillwake/net';
import type { ViteHotContext } from 'vite/types/hot.d.ts';
import { RELAY } from '../dev/relay';

/** The dev server's socket, as Vite's `import.meta.hot` offers it to a page. */
export type HotSocket = Pick<ViteHotContext, 'send' | 'on' | 'off'>;

/** This tab's place in a relayed session, for the dev panel. */
export type LinkStatus =
  | { readonly role: 'alone' }
  | { readonly role: 'host'; readonly session: string | undefined; readonly peers: number }
  | {
      readonly role: 'peer';
      readonly session: string;
      readonly state: 'connecting' | 'connected' | 'refused' | 'host left';
      /** Ticks the host has released to this tab, and the last of them. */
      readonly ticks: number;
      readonly tick: number | undefined;
    };

/** One per page, as there is one game: read by the dev panel, reported to by the link. */
export const link = createStatus();

function createStatus() {
  let status: LinkStatus = { role: 'alone' };
  return {
    get: () => status,
    set: (next: LinkStatus) => {
      status = next;
    },
  };
}

/** Listens on `socket` for each pair, and returns how to stop listening to all of them. */
function listen(socket: HotSocket, listeners: Record<string, (data: never) => void>): () => void {
  // Each listener names its payload's shape; the socket hands payloads over untyped.
  const pairs = Object.entries(listeners) as [string, (data: unknown) => void][];
  for (const [event, listener] of pairs) socket.on(event, listener);
  return () => {
    for (const [event, listener] of pairs) socket.off(event, listener);
  };
}

/**
 * Opens a session on the relay and connects every tab that joins it to this tab's host, as a peer
 * over a channel through the relay. `host` is read on each join, since a load replaces it.
 */
export function hostOnRelay(
  socket: HotSocket,
  host: () => Host,
  report: (status: LinkStatus) => void,
): () => void {
  const receivers = new Map<number, (message: ToHost) => void>();
  let session: string | undefined;
  const show = () => report({ role: 'host', session, peers: receivers.size });
  show();
  const stop = listen(socket, {
    [RELAY.hosted]: (data: { session: string }) => {
      session = data.session;
      show();
    },
    [RELAY.joined]: ({ peer }: { peer: number }) => {
      const channel: Channel<ToHost, ToClient> = {
        send: (message) => socket.send(RELAY.toPeer, { peer, message }),
        onMessage: (receive) => receivers.set(peer, receive),
      };
      host().connect(channel);
      show();
    },
    [RELAY.fromPeer]: ({ peer, message }: { peer: number; message: ToHost }) => {
      receivers.get(peer)?.(message);
    },
    // The host keeps sending to a peer that left; the relay drops what has nowhere to go.
    [RELAY.left]: ({ peer }: { peer: number }) => {
      receivers.delete(peer);
      show();
    },
  });
  socket.send(RELAY.host);
  return () => {
    stop();
    socket.send(RELAY.leave);
    report({ role: 'alone' });
  };
}

/**
 * Joins session `session` on the relay and counts the ticks its host releases. Loading the host's
 * world and running those ticks is joining proper (P1-41); this only proves the link.
 */
export function joinOnRelay(
  socket: HotSocket,
  session: string,
  report: (status: LinkStatus) => void,
): () => void {
  let state: 'connecting' | 'connected' | 'refused' | 'host left' = 'connecting';
  let ticks = 0;
  let tick: number | undefined;
  const show = () => report({ role: 'peer', session, state, ticks, tick });
  show();
  const stop = listen(socket, {
    [RELAY.connected]: () => {
      state = 'connected';
      show();
    },
    [RELAY.refused]: () => {
      state = 'refused';
      show();
    },
    [RELAY.hostLeft]: () => {
      state = 'host left';
      show();
    },
    [RELAY.fromHost]: ({ message }: { message: ToClient }) => {
      ticks += 1;
      tick = message.tick;
      show();
    },
  });
  socket.send(RELAY.join, { session });
  return () => {
    stop();
    socket.send(RELAY.leave);
    report({ role: 'alone' });
  };
}
