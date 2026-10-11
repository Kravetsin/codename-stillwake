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

/**
 * The session this tab plays in. `?join=<id>` joins one on the dev relay, falling back to a world of
 * its own if the session is not there, its host leaves first or runs another build; else a world of
 * its own. `stop` leaves the relay.
 */
function startSession(layout: Layout): { session: Promise<Session>; stop: () => void } {
  const joining = new URLSearchParams(location.search).get('join');
  const hot = import.meta.hot;
  const own = () => ownSession(stillwake.create(Date.now() >>> 0, layout));
  if (!hot || !joining) return { session: Promise.resolve(own()), stop: () => {} };
  const joined = joinOnRelay(hot, joining, link.set);
  const session = Promise.race([joinHost(stillwake, joined.channel, BUILD), joined.ended]).then(
    (client): Session => ({ client }),
    (why: unknown) => {
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
    let layers: Layer[] = [];
    let overlayLayers: { id: string; layer: Layer }[] = [];
    const switched = createOverlaySwitch(
      Object.fromEntries(OVERLAYS.map((o) => [o.id, o.key])),
      window,
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
      const camera = createCamera(world, app.canvas);
      destroyCamera = () => camera.destroy();
      // The reference world is measured whole on screen; a game starts close on the hero.
      const { width, height } = created.client.sim.query(grid).size();
      if (perf) camera.fit({ x: 0, y: 0, width, height }, app.screen);
      else world.scale.set(START_ZOOM);

      layers = FEATURES.flatMap((f) => (f.layer ? [f.layer()] : []));
      for (const layer of layers) world.addChild(layer.view);
      // Over everything, and updated only while on: an overlay may read the whole ship.
      overlayLayers = OVERLAYS.map((o) => ({ id: o.id, layer: o.layer() }));
      for (const { layer } of overlayLayers) world.addChild(layer.view);

      app.ticker.add((ticker) => {
        created.frame(ticker.deltaMS);
        const frame = { game: created, screen: app.screen, camera, elapsedMs: ticker.deltaMS };
        for (const layer of layers) layer.update(frame);
        for (const { id, layer } of overlayLayers) {
          layer.view.visible = switched.active() === id;
          if (layer.view.visible) layer.update(frame);
        }
      });
      setGame(created);
      setOverlays(switched);

      // `?host` opens this world to tabs joining over the dev relay; dev builds only.
      const hot = import.meta.hot;
      if (hot && new URLSearchParams(location.search).has('host')) {
        unlink = hostOnRelay(hot, () => created.host, link.set);
      }
    });

    return () => {
      disposed = true;
      destroyCamera();
      unlink();
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
      </div>
    </div>
  );
}
