import { stillwake, wreck } from '@stillwake/sim';
import { Application } from 'pixi.js';
import { useEffect, useRef, useState } from 'react';
import { FEATURES } from './features';
import { browserPlatform } from './platform/browser';
import { createGame, type Game } from './session/game';

export function App() {
  const host = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<Game>();

  useEffect(() => {
    const app = new Application();
    let ready = false;
    let disposed = false;
    // The game reaches the sim only through its host and client, as every co-op peer does.
    const created = createGame(stillwake, browserPlatform(), Date.now() >>> 0, wreck);

    void app
      .init({ resizeTo: window, preference: 'webgl', background: '#0b0f17', antialias: true })
      .then(() => {
        // StrictMode unmounts before an async init resolves; destroy here instead of in cleanup.
        if (disposed) return app.destroy(true);
        ready = true;
        host.current?.appendChild(app.canvas);

        const layers = FEATURES.flatMap((f) => (f.layer ? [f.layer()] : []));
        for (const layer of layers) app.stage.addChild(layer.view);

        app.ticker.add((ticker) => {
          created.frame(ticker.deltaMS);
          const frame = { game: created, screen: app.screen };
          for (const layer of layers) layer.update(frame);
        });
        setGame(created);
      });

    return () => {
      disposed = true;
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
