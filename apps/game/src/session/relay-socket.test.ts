import { describe, expect, it } from 'vitest';
import type { RelaySocket } from './relay-link';
import { relayFor, relaySocket, type SocketLike } from './relay-socket';

/** A socket that records what is sent, and opens and hears when told. */
function fake() {
  const sent: string[] = [];
  const on: { open?: () => void; message?: (event: { data: unknown }) => void } = {};
  const socket = {
    readyState: 0,
    send: (data: string) => sent.push(data),
    addEventListener: (type: 'open' | 'message', listener: never) => {
      on[type] = listener;
    },
  } satisfies SocketLike & { readyState: number };
  return {
    socket,
    sent,
    open: () => {
      socket.readyState = 1;
      on.open?.();
    },
    hear: (event: string, data: unknown) => on.message?.({ data: JSON.stringify({ event, data }) }),
  };
}

describe('the relay over a WebSocket', () => {
  it('sends each event as JSON, keeping what is sent before the socket opens', () => {
    const f = fake();
    const relay = relaySocket('ws://x/relay', () => f.socket);
    relay.send('stillwake:host');
    expect(f.sent).toEqual([]);
    f.open();
    relay.send('stillwake:join', { session: '1', token: 2 });
    expect(f.sent.map((frame) => JSON.parse(frame) as unknown)).toEqual([
      { event: 'stillwake:host' },
      { event: 'stillwake:join', data: { session: '1', token: 2 } },
    ]);
  });

  it('hands each event heard to its listeners, until they stop listening', () => {
    const f = fake();
    const relay = relaySocket('ws://x/relay', () => f.socket);
    const heard: unknown[] = [];
    const listener = (data: unknown) => heard.push(data);
    relay.on('stillwake:hosted', listener);
    f.hear('stillwake:hosted', { session: '3' });
    f.hear('stillwake:joined', { peer: 1 });
    relay.off('stillwake:hosted', listener);
    f.hear('stillwake:hosted', { session: '4' });
    expect(heard).toEqual([{ session: '3' }]);
  });
});

describe('which relay a page reaches', () => {
  const hot: RelaySocket = { send() {}, on() {}, off() {} };

  it("is the dev server's in development", () => {
    expect(relayFor({ href: 'http://localhost:5173/?host', protocol: 'http:' }, hot)).toBe(hot);
  });

  it("is the playtest server's beside the page, secure when the page is", () => {
    const urls: string[] = [];
    const open = (url: string) => {
      urls.push(url);
      return fake().socket;
    };
    relayFor({ href: 'https://play.example/?join=3', protocol: 'https:' }, undefined, open);
    relayFor({ href: 'http://10.0.0.2:8080/game/?host', protocol: 'http:' }, undefined, open);
    expect(urls).toEqual(['wss://play.example/relay', 'ws://10.0.0.2:8080/game/relay']);
  });

  it('is none for a page opened from disk, as in the desktop shell', () => {
    expect(relayFor({ href: 'file:///C:/game/index.html', protocol: 'file:' }, undefined)).toBe(
      undefined,
    );
  });
});
