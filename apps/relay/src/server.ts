import { createRelay, RELAY, serve, type RelayClient } from '@stillwake/net';
import { timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';

export interface Options {
  /** The built game to serve: `apps/game/dist`. */
  readonly gameDir: string;
  /** Asked of every request, with any user name, when set; the whole server is open without it. */
  readonly password?: string;
}

/** Where the relay answers, beside the game: the game asks for `relay` next to its page. */
const RELAY_PATH = '/relay';
/** Pings a socket this often, so proxies do not close a quiet one and a dead one is found. */
const PING_MS = 30_000;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

/** Whether `request` carries `password` in its basic authorization, under any user name. */
function allowed(request: IncomingMessage, password: string | undefined): boolean {
  if (password === undefined) return true;
  const [scheme, encoded] = (request.headers.authorization ?? '').split(' ');
  if (scheme !== 'Basic' || !encoded) return false;
  const given = Buffer.from(
    Buffer.from(encoded, 'base64')
      .toString()
      .replace(/^[^:]*:/, ''),
  );
  const wanted = Buffer.from(password);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/** A frame as text, however `ws` hands it over: whole, in pieces, or as raw bytes. */
export function textOf(raw: RawData): string {
  if (Buffer.isBuffer(raw)) return raw.toString();
  return Array.isArray(raw) ? Buffer.concat(raw).toString() : Buffer.from(raw).toString();
}

/** The file under `root` a URL path names, or none for one that climbs out of it. */
function fileFor(root: string, path: string): string | undefined {
  const name = normalize(decodeURIComponent(path === '/' ? '/index.html' : path));
  const file = join(root, name);
  return file.startsWith(root + sep) ? file : undefined;
}

/**
 * The playtest server: the built game, and the relay that passes messages between a hosting page
 * and those joining it, as the dev server does in development. One process, one port; a proxy in
 * front gives it a name and HTTPS.
 */
export function createPlaytestServer({ gameDir, password }: Options): Server {
  const root = resolve(gameDir);
  const relay = createRelay();
  // The relay's handlers by event, wired once; every socket's frames go through them.
  const handlers = new Map<string, (data: never, client: RelayClient) => void>();
  serve(relay, (event, handler) => handlers.set(event, handler));
  const dispatch = (event: string, data: unknown, client: RelayClient) =>
    handlers.get(event)?.(data as never, client);

  const server = createServer((request, response) => {
    if (!allowed(request, password)) {
      response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Stillwake playtest"' }).end();
      return;
    }
    const file = fileFor(root, new URL(request.url ?? '/', 'http://x').pathname);
    if (!file) return void response.writeHead(404).end();
    void stat(file)
      .then((found) => (found.isFile() ? readFile(file) : Promise.reject(new Error('not a file'))))
      .then(
        (body) => {
          // Built assets carry a hash in their names; the page that names them, and the file that
          // says which build is out, must be fresh.
          const fresh = file.endsWith('index.html') || file.endsWith('version.json');
          response.writeHead(200, {
            'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
            'Cache-Control': fresh ? 'no-cache' : 'public, max-age=31536000, immutable',
          });
          response.end(body);
        },
        () => response.writeHead(404).end(),
      );
  });

  const sockets = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    const path = new URL(request.url ?? '/', 'http://x').pathname;
    if (!path.endsWith(RELAY_PATH)) return void socket.destroy();
    if (!allowed(request, password)) {
      socket.end(['HTTP/1.1 401 Unauthorized', 'Connection: close', '', ''].join('\r\n'));
      return;
    }
    sockets.handleUpgrade(request, socket, head, (ws) => sockets.emit('connection', ws));
  });
  sockets.on('connection', (ws: WebSocket) => {
    const client: RelayClient = {
      send: (event, data) => ws.send(JSON.stringify({ event, data })),
    };
    let alive = true;
    ws.on('pong', () => (alive = true));
    const ping = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, PING_MS);
    ws.on('message', (raw) => {
      try {
        const { event, data } = JSON.parse(textOf(raw)) as { event: string; data: unknown };
        // A page leaving says so; the socket closing says it again, which the relay ignores.
        dispatch(event, data, client);
      } catch {
        // Not a frame of ours: dropped.
      }
    });
    ws.on('close', () => {
      clearInterval(ping);
      dispatch(RELAY.leave, undefined, client);
    });
  });
  server.on('close', () => sockets.close());
  return server;
}
