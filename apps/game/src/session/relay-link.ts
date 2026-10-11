import type { Channel, Host, ToClient, ToHost } from '@stillwake/net';
import type { ViteHotContext } from 'vite/types/hot.d.ts';
import { RELAY } from '../dev/relay';

/** The dev server's socket, as Vite's `import.meta.hot` offers it to a page. */
export type HotSocket = Pick<ViteHotContext, 'send' | 'on' | 'off'>;

/** This tab's place in a relayed session, for the dev panel. */
export type LinkStatus =
  | { readonly role: 'alone' }
  | { readonly role: 'host'; readonly session: string | undefined; readonly peers: number }
  | { readonly role: 'peer'; readonly session: string; readonly state: PeerState };

/** Where a joining tab stands with its session on the relay. */
export type PeerState = 'connecting' | 'connected' | 'refused' | 'host left' | 'other build';

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
  host: () => Host | undefined,
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
      host()?.admit(channel);
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
 * Joins session `session` on the relay: the channel to its host, to join the host's world over
 * (`joinHost`), and `ended`, which rejects if the session is not there or its host goes.
 */
export function joinOnRelay(
  socket: HotSocket,
  session: string,
  report: (status: LinkStatus) => void,
): { channel: Channel<ToClient, ToHost>; ended: Promise<never>; stop: () => void } {
  let receive: ((message: ToClient) => void) | undefined;
  // As a channel promises: what the host sends before anyone listens is kept, then handed over.
  const waiting: ToClient[] = [];
  let end: (why: Error) => void = () => {};
  const ended = new Promise<never>((_, reject) => (end = reject));
  // Nobody may be waiting on it once joined: a host leaving later only shows on the panel.
  ended.catch(() => {});
  const show = (state: PeerState) => report({ role: 'peer', session, state });
  show('connecting');
  const stop = listen(socket, {
    [RELAY.connected]: () => show('connected'),
    [RELAY.refused]: () => {
      show('refused');
      end(new Error(`No session ${session} on the relay.`));
    },
    [RELAY.hostLeft]: () => {
      show('host left');
      end(new Error(`The host of session ${session} left.`));
    },
    [RELAY.fromHost]: ({ message }: { message: ToClient }) => {
      if (receive) receive(message);
      else waiting.push(message);
    },
  });
  socket.send(RELAY.join, { session });
  return {
    channel: {
      send: (message) => socket.send(RELAY.toHost, { message }),
      onMessage: (handler) => {
        receive = handler;
        for (const message of waiting.splice(0)) handler(message);
      },
    },
    ended,
    stop: () => {
      stop();
      socket.send(RELAY.leave);
      report({ role: 'alone' });
    },
  };
}
