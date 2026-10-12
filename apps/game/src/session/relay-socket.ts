import { badNetworkFrom, overBadNetwork } from './bad-network';
import type { RelaySocket } from './relay-link';

/** What `relaySocket` needs of a WebSocket: the browser's, or a test's stand-in. */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  addEventListener(type: 'open', listener: () => void): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

const OPEN = 1;

/**
 * The playtest server's relay (`apps/relay`) over a WebSocket at `url`, shaped as the dev server's
 * socket: each frame is `{ event, data }` as JSON. What is sent before the socket opens waits for it.
 */
export function relaySocket(
  url: string,
  open: (url: string) => SocketLike = (u) => new WebSocket(u),
): RelaySocket {
  const socket = open(url);
  const listeners = new Map<string, Set<(data: unknown) => void>>();
  const waiting: string[] = [];
  socket.addEventListener('open', () => {
    for (const frame of waiting.splice(0)) socket.send(frame);
  });
  socket.addEventListener('message', ({ data }) => {
    const { event, data: payload } = JSON.parse(String(data)) as { event: string; data: unknown };
    for (const listener of listeners.get(event) ?? []) listener(payload);
  });
  return {
    send(event, data) {
      const frame = JSON.stringify({ event, data });
      if (socket.readyState === OPEN) socket.send(frame);
      else waiting.push(frame);
    },
    on(event, listener) {
      const set = listeners.get(event) ?? new Set();
      set.add(listener);
      listeners.set(event, set);
    },
    off(event, listener) {
      listeners.get(event)?.delete(listener);
    },
  };
}

/**
 * The relay a page reaches for `?host` and `?join`: the dev server's socket in development, else
 * the playtest server's, at `relay` beside the page; none for a page opened from disk. `?lag` and
 * `?jitter` in the page's address make either a bad network (0013).
 */
export function relayFor(
  page: Pick<Location, 'href' | 'protocol'>,
  hot: RelaySocket | undefined,
  open?: (url: string) => SocketLike,
): RelaySocket | undefined {
  const socket = reach(page, hot, open);
  const network = badNetworkFrom(page.href);
  return socket && network ? overBadNetwork(socket, network) : socket;
}

function reach(
  page: Pick<Location, 'href' | 'protocol'>,
  hot: RelaySocket | undefined,
  open?: (url: string) => SocketLike,
): RelaySocket | undefined {
  if (hot) return hot;
  if (page.protocol !== 'http:' && page.protocol !== 'https:') return undefined;
  const url = new URL('relay', page.href);
  url.protocol = page.protocol === 'https:' ? 'wss:' : 'ws:';
  url.search = '';
  url.hash = '';
  return relaySocket(url.href, open);
}
