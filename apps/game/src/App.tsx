import { joinHost } from '@stillwake/net';
import { grid, stillwake, wreck, type Layout } from '@stillwake/sim';
import { Application, Container } from 'pixi.js';
import { useEffect, useRef, useState } from 'react';
import { perfLayout } from './dev/perf-map';
import { FEATURES } from './features';
import type { Layer } from './features/feature';
import { OverlayBar } from './overlays/OverlayBar';
import { createOverlaySwitch, type OverlaySwitch } from './overlays/switch';
import { browserPlatform } from './platform/browser';
import { currentPlatform } from './platform/desktop';
import { createCamera, START_ZOOM } from './render/camera';
import { BUILD } from './session/build';
import { createGame, ownSession, type Game, type Session } from './session/game';
import { hostOnRelay, joinOnRelay, link } from './session/relay-link';
import { relayFor } from './session/relay-socket';
import { keepTime } from './session/time';
import { startedAnew, takeResume, watchForUpdates } from './session/update';
import { PointerTip } from './session/PointerTip';
import { overlayOn, pointerTip } from './session/ui';
import { VersionBar } from './session/VersionBar';

/**
 * The session this tab plays in. `?join=<id>` joins one on the relay — the dev server's, or the
 * playtest server's — falling back to a world of its own if the session is not there, its host leaves
 * first or runs another build; else a world of its own. `stop` leaves the relay.
 */
function startSession(layout: Layout): { session: Promise<Session>; stop: () => void } {
  const joining = new URLSearchParams(location.search).get('join');
  const own = () => ownSession(stillwake.create(Date.now() >>> 0, layout));
  const relay = joining ? relayFor(location, import.meta.hot) : undefined;
  if (!relay || !joining) return { session: Promise.resolve(own()), stop: () => {} };
  const joined = joinOnRelay(relay, joining, link.set);
  const session = Promise.race([joinHost(stillwake, joined.channel, BUILD), joined.ended]).then(
    (client): Session => ({ client, leave: joined.stop }),
    (why: unknown) => {
      // Left before joining, the page is going: its world is never shown.
      if (joined.left()) return own();
      // Shown on the dev panel, which keeps what the relay said; a build mismatch it never heard.
      const last = link.get();
      joined.stop();
      const failed = last.role === 'peer' && last.state !== 'connected';
      link.set(failed ? last : { role: 'peer', session: joining, state: 'other build' });
      console.warn(why);
      return own();
    },
  );
  return { session, stop: joined.stop };
}

/** Every feature's overlay, in FEATURES order. */
const OVERLAYS = FEATURES.flatMap((f) => (f.overlay ? [{ id: f.id, ...f.overlay }] : []));

export function App() {
  const host = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<Game>();
  const [overlays, setOverlays] = useState<OverlaySwitch>();

  useEffect(() => {
    const app = new Application();
    let ready = false;
    let disposed = false;
    let destroyCamera = () => {};
    let unlink = () => {};
    let unwatch = () => {};
    let stopTime = () => {};
    let layers: Layer[] = [];
    let overlayLayers: { id: string; layer: Layer }[] = [];
    const switched = createOverlaySwitch(
      Object.fromEntries(OVERLAYS.map((o) => [o.id, o.key])),
      window,
      overlayOn,
    );
    // `?perf` swaps the wreck for the reference world the budgets in CLAUDE.md are measured on.
    const perf = new URLSearchParams(location.search).has('perf');
    const layout = perf ? perfLayout() : wreck;
    const started = startSession(layout);
    unlink = started.stop;

    void Promise.all([
      app.init({ resizeTo: window, preference: 'webgl', background: '#0b0f17', antialias: true }),
      started.session,
    ]).then(([, session]) => {
      // StrictMode unmounts before an async init resolves; destroy here instead of in cleanup.
      if (disposed) return app.destroy(true);
      ready = true;
      // The game reaches the sim only through its host and client, as every co-op peer does.
      const created = createGame(stillwake, currentPlatform(browserPlatform), session);
      // Lets an agent or a console drive the running game in development.
      if (import.meta.env.DEV) Object.assign(window, { __game: created });
      host.current?.appendChild(app.canvas);

      // Feature layers live in the world, which the camera moves and scales.
      const world = new Container();
      app.stage.addChild(world);
      const camera = createCamera(world, app.canvas, window);
      destroyCamera = () => camera.destroy();
      // The reference world is measured whole on screen; a game starts close on the hero.
      const { width, height } = created.client.sim.query(grid).size();
      if (perf) camera.fit({ x: 0, y: 0, width, height }, app.screen);
      else world.scale.set(START_ZOOM);

      layers = FEATURES.flatMap((f) => (f.layer ? [f.layer()] : []));
      // What runs behind the ship's structure, of every layer, stacked where the first of them
      // stands: over the stars and debris, under the walls and machines.
      const behind = new Container();
      for (const layer of layers) {
        if (layer.behind) {
          if (!behind.parent) world.addChild(behind);
          behind.addChild(layer.behind);
        }
        world.addChild(layer.view);
      }
      // Over everything, and updated only while on: an overlay may read the whole ship.
      overlayLayers = OVERLAYS.map((o) => ({ id: o.id, layer: o.layer() }));
      for (const { layer } of overlayLayers) world.addChild(layer.view);

      // The world's time runs on when the frames slow or stop, in a hidden or covered tab: a host
      // there would stop everyone's world, a peer fall behind.
      const time = keepTime((elapsedMs) => created.frame(elapsedMs));
      stopTime = () => time.destroy();
      app.ticker.add((ticker) => {
        time.frame();
        created.drawn(ticker.deltaMS);
        const frame = {
          game: created,
          screen: app.screen,
          camera,
          elapsedMs: ticker.deltaMS,
        };
        for (const layer of layers) layer.update(frame);
        for (const { id, layer } of overlayLayers) {
          layer.view.visible = switched.active() === id;
          if (layer.view.visible) layer.update(frame);
        }
        // An overlay says what the pointer is on only while it is on; switched off, it says nothing.
        if (switched.active() === undefined && pointerTip.get().world) {
          pointerTip.set({ ...pointerTip.get(), world: undefined });
        }
      });
      setGame(created);
      setOverlays(switched);

      // A page from the playtest server watches it for a newer build; the dev server reloads itself.
      if (!import.meta.env.DEV && /^https?:$/.test(location.protocol)) {
        unwatch = watchForUpdates(BUILD);
      }
      // Reloaded into a new build: the world this page held comes back, if its save still loads.
      if (takeResume() && created.host) created.load().catch(() => startedAnew.set(true));

      // `?host` opens a world of this tab's own to tabs joining over the relay; `?host=<name>`
      // names its session, so links to it outlast a restart of the server.
      const hosting = new URLSearchParams(location.search).get('host');
      const relay = hosting === null ? undefined : relayFor(location, import.meta.hot);
      if (relay && created.host) {
        unlink = hostOnRelay(relay, () => created.host, link.set, hosting || undefined);
      }
    });

    return () => {
      disposed = true;
      destroyCamera();
      unlink();
      unwatch();
      stopTime();
      switched.destroy();
      for (const layer of [...layers, ...overlayLayers.map((o) => o.layer)]) layer.destroy?.();
      if (ready) app.destroy(true, { children: true });
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={host} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0">
        {game && FEATURES.map((f) => (f.Panel ? <f.Panel key={f.id} game={game} /> : null))}
        {overlays && <OverlayBar overlays={overlays} list={OVERLAYS} />}
        {game && <VersionBar game={game} />}
        <PointerTip />
      </div>
    </div>
  );
}
