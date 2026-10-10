import { grid, stillwake, wreck } from '@stillwake/sim';
import { Application, Container } from 'pixi.js';
import { useEffect, useRef, useState } from 'react';
import { perfLayout } from './dev/perf-map';
import { FEATURES } from './features';
import { browserPlatform } from './platform/browser';
import { createCamera } from './render/camera';
import { createGame, type Game } from './session/game';

export function App() {
  const host = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<Game>();

  useEffect(() => {
    const app = new Application();
    let ready = false;
    let disposed = false;
    let destroyCamera = () => {};
    // `?perf` swaps the wreck for the reference world the budgets in CLAUDE.md are measured on.
    const layout = new URLSearchParams(location.search).has('perf') ? perfLayout() : wreck;
    // The game reaches the sim only through its host and client, as every co-op peer does.
    const created = createGame(stillwake, browserPlatform(), Date.now() >>> 0, layout);
    // Lets an agent or a console drive the running game in development.
    if (import.meta.env.DEV) Object.assign(window, { __game: created });

    void app
      .init({ resizeTo: window, preference: 'webgl', background: '#0b0f17', antialias: true })
      .then(() => {
        // StrictMode unmounts before an async init resolves; destroy here instead of in cleanup.
        if (disposed) return app.destroy(true);
        ready = true;
        host.current?.appendChild(app.canvas);

        // Feature layers live in the world, which the camera moves and scales.
        const world = new Container();
        app.stage.addChild(world);
        const camera = createCamera(world, app.canvas);
        destroyCamera = () => camera.destroy();
        const { width, height } = created.client.sim.query(grid).size();
        camera.fit({ x: 0, y: 0, width, height }, app.screen);

        const layers = FEATURES.flatMap((f) => (f.layer ? [f.layer()] : []));
        for (const layer of layers) world.addChild(layer.view);

        app.ticker.add((ticker) => {
          created.frame(ticker.deltaMS);
          const frame = { game: created, screen: app.screen };
          for (const layer of layers) layer.update(frame);
        });
        setGame(created);
      });

    return () => {
      disposed = true;
      destroyCamera();
      if (ready) app.destroy(true, { children: true });
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={host} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0">
        {game && FEATURES.map((f) => (f.Panel ? <f.Panel key={f.id} game={game} /> : null))}
      </div>
    </div>
  );
}
