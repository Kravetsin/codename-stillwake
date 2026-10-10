import { Application } from 'pixi.js';
import { useEffect, useRef } from 'react';

export function App() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const app = new Application();
    let ready = false;
    let disposed = false;

    void app
      .init({ resizeTo: window, preference: 'webgl', background: '#0b0f17', antialias: true })
      .then(() => {
        // StrictMode unmounts before an async init resolves; destroy here instead of in cleanup.
        if (disposed) return app.destroy(true);
        ready = true;
        host.current?.appendChild(app.canvas);
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
        Stillwake
      </div>
    </div>
  );
}
