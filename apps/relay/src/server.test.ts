import { RELAY } from '@stillwake/net';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { get } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createPlaytestServer, textOf, type Options } from './server';

/** A built game of two files, in a folder of its own, beside a file it must never give away. */
function game(): string {
  const outside = mkdtempSync(join(tmpdir(), 'stillwake-'));
  writeFileSync(join(outside, 'secret.txt'), 'secret');
  const dir = join(outside, 'game');
  mkdirSync(dir);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Stillwake</title>');
  writeFileSync(join(dir, 'version.json'), '{"build":"abc1234"}');
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'index-abc.js'), 'console.log(1)');
  return dir;
}

const servers: { close(): void }[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

/** A server listening on a free port, and its address. */
async function start(options: Partial<Options> = {}): Promise<string> {
  const server = createPlaytestServer({ gameDir: game(), ...options });
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  return `127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** A page's socket to the relay, and what it hears. */
async function page(at: string, headers: Record<string, string> = {}) {
  const ws = new WebSocket(`ws://${at}/relay`, { headers });
  const heard: { event: string; data: unknown }[] = [];
  ws.on('message', (raw) =>
    heard.push(JSON.parse(textOf(raw)) as { event: string; data: unknown }),
  );
  servers.push({ close: () => ws.close() });
  await new Promise((done, fail) => ws.on('open', done).on('error', fail));
  return {
    heard,
    send: (event: string, data?: unknown) => ws.send(JSON.stringify({ event, data })),
    close: () => ws.close(),
  };
}

/** Waits until `check` holds, a little at a time. */
async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(check()).toBe(true);
}

const basic = (password: string) => ({
  Authorization: `Basic ${Buffer.from(`friend:${password}`).toString('base64')}`,
});

describe('the playtest server', () => {
  it('serves the built game, the page fresh and the hashed assets for long', async () => {
    const at = await start();
    const page = await fetch(`http://${at}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(page.headers.get('cache-control')).toBe('no-cache');
    expect(await page.text()).toContain('Stillwake');
    const asset = await fetch(`http://${at}/assets/index-abc.js`);
    expect(asset.headers.get('content-type')).toContain('text/javascript');
    expect(asset.headers.get('cache-control')).toContain('immutable');
    // Which build is out is asked again and again: never kept.
    expect((await fetch(`http://${at}/version.json`)).headers.get('cache-control')).toBe(
      'no-cache',
    );
  });

  it('serves nothing outside the game: no missing file, no climbing out', async () => {
    const at = await start();
    expect((await fetch(`http://${at}/nope.js`)).status).toBe(404);
    expect((await fetch(`http://${at}/assets`)).status).toBe(404);
    // Sent as written: fetch would tidy the climb away before it left.
    const raw = (path: string) =>
      new Promise<number>((done) => {
        const [host, port] = at.split(':');
        get({ host, port, path }, (res) => {
          res.resume();
          done(res.statusCode ?? 0);
        });
      });
    expect(await raw('/../secret.txt')).toBe(404);
    expect(await raw('/..%2fsecret.txt')).toBe(404);
    expect(await raw('/%2e%2e/secret.txt')).toBe(404);
  });

  it('asks for the password when it has one, under any user name', async () => {
    const at = await start({ password: 'hatch' });
    const refused = await fetch(`http://${at}/`);
    expect(refused.status).toBe(401);
    expect(refused.headers.get('www-authenticate')).toContain('Basic');
    expect((await fetch(`http://${at}/`, { headers: basic('wrong') })).status).toBe(401);
    expect((await fetch(`http://${at}/`, { headers: basic('hatch') })).status).toBe(200);
    await expect(page(at)).rejects.toThrow('401');
    await expect(page(at, basic('hatch'))).resolves.toBeDefined();
  });

  it('relays between a host and a page joining it, and tells the host when it goes', async () => {
    const at = await start();
    const host = await page(at);
    host.send(RELAY.host);
    await until(() => host.heard.some((m) => m.event === RELAY.hosted));
    const session = (host.heard[0]?.data as { session: string }).session;

    const peer = await page(at);
    peer.send(RELAY.join, { session, token: 1 });
    await until(() => peer.heard.some((m) => m.event === RELAY.connected));
    await until(() => host.heard.some((m) => m.event === RELAY.joined));

    peer.send(RELAY.toHost, { message: { kind: 'hello' } });
    await until(() => host.heard.some((m) => m.event === RELAY.fromPeer));
    expect(host.heard.find((m) => m.event === RELAY.fromPeer)?.data).toEqual({
      peer: 1,
      message: { kind: 'hello' },
    });

    // A page that closes its socket leaves, as a tab that closes does.
    peer.close();
    await until(() => host.heard.some((m) => m.event === RELAY.left));
  });
});
