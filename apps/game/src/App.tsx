import { localSession } from '@stillwake/net';
import { stillwake } from '@stillwake/sim';
import { Application } from 'pixi.js';
import { useEffect, useRef } from 'react';
import { createClock } from './session/clock';

export function App() {
  const host = useRef<HTMLDivElement>(null);
  const tickLabel = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const app = new Application();
    let ready = false;
    let disposed = false;

    // Single-player is a host and a local client: the game reaches the sim only through them.
    const session = localSession(stillwake.create(Date.now() >>> 0));
    const clock = createClock();

    void app
      .init({ resizeTo: window, preference: 'webgl', background: '#0b0f17', antialias: true })
      .then(() => {
        // StrictMode unmounts before an async init resolves; destroy here instead of in cleanup.
        if (disposed) return app.destroy(true);
        ready = true;
        host.current?.appendChild(app.canvas);
        app.ticker.add((ticker) => {
          for (let due = clock.advance(ticker.deltaMS); due > 0; due--) session.host.advance();
          session.client.update();
          if (tickLabel.current)
            tickLabel.current.textContent = String(session.client.sim.world.tick);
        });
      });

    return () => {
      disposed = true;
      if (ready) app.destroy(true);
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={host} className="absolute inset-0" />
      <div className="pointer-events-none absolute left-4 top-4 font-mono text-sm text-slate-400">
        Stillwake · tick <span ref={tickLabel}>0</span>
      </div>
    </div>
  );
}
