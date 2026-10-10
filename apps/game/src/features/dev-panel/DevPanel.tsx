import { useEffect, useState } from 'react';
import type { Game } from '../../session/game';

const REFRESH_MS = 250;

interface Reading {
  fps: number;
  tick: number;
  hash: string;
  slices: [string, string][];
}

function read(game: Game): Reading {
  const { sim } = game.client;
  return {
    fps: game.fps,
    tick: sim.world.tick,
    hash: sim.hash(),
    slices: Object.entries(sim.world.slices).map(([id, slice]) => [id, show(slice)]),
  };
}

/** Pretty JSON that also shows derived `Map`s, `Set`s and typed arrays readably. */
function show(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => plain(v), 2);
}

function plain(v: unknown): unknown {
  if (ArrayBuffer.isView(v)) return `${v.constructor.name}(${(v as Int32Array).length})`;
  if (v instanceof Set) return [...(v as Set<unknown>)];
  if (!(v instanceof Map)) return v;
  const entries: Record<string, unknown> = {};
  for (const [key, item] of v as Map<unknown, unknown>) entries[String(key)] = item;
  return entries;
}

/** Development readouts and controls. Refreshed a few times a second, never every tick. */
export function DevPanel({ game }: { readonly game: Game }) {
  const [reading, setReading] = useState(() => read(game));
  const [open, setOpen] = useState(true);
  const [status, setStatus] = useState('');
  const [speed, setSpeed] = useState(game.speed);

  useEffect(() => {
    const timer = setInterval(() => setReading(read(game)), REFRESH_MS);
    return () => clearInterval(timer);
  }, [game]);

  useEffect(() => {
    const toggle = (e: KeyboardEvent) => {
      if (e.key === '`') setOpen((o) => !o);
    };
    window.addEventListener('keydown', toggle);
    return () => window.removeEventListener('keydown', toggle);
  }, []);

  const run = (label: string, action: () => Promise<string>) => {
    action().then(setStatus, (e: unknown) => setStatus(`${label} failed: ${String(e)}`));
  };

  if (!open) return null;

  return (
    <div className="pointer-events-auto absolute right-3 top-3 w-80 rounded border border-slate-700 bg-slate-900/90 p-3 font-mono text-xs text-slate-300">
      <div className="mb-2 flex items-center justify-between text-slate-400">
        <span>dev · ` to hide</span>
        <span>{Math.round(reading.fps)} fps</span>
      </div>
      <dl className="mb-2 grid grid-cols-[4rem_1fr] gap-y-1">
        <dt>tick</dt>
        <dd>{reading.tick}</dd>
        <dt>hash</dt>
        <dd>{reading.hash}</dd>
      </dl>
      <div className="mb-2 flex gap-2">
        <button
          className="rounded bg-slate-700 px-2 py-1 hover:bg-slate-600"
          onClick={() => run('Save', () => game.save().then(() => 'Saved.'))}
        >
          save
        </button>
        <button
          className="rounded bg-slate-700 px-2 py-1 hover:bg-slate-600"
          onClick={() =>
            run('Load', () =>
              game.load().then((found) => (found ? 'Loaded.' : 'Nothing saved yet.')),
            )
          }
        >
          load
        </button>
        <button
          className="rounded bg-slate-700 px-2 py-1 hover:bg-slate-600"
          onClick={() => {
            game.speed = game.speed === 1 ? 4 : 1;
            setSpeed(game.speed);
          }}
        >
          ×{speed === 1 ? 4 : 1}
        </button>
      </div>
      {status && <p className="mb-2 text-slate-400">{status}</p>}
      <p className="mb-1 text-slate-400">modules</p>
      {reading.slices.length === 0 && <p className="text-slate-500">none registered yet</p>}
      {reading.slices.map(([id, json]) => (
        <details key={id} className="mb-1">
          <summary className="cursor-pointer">{id}</summary>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-slate-400">
            {json}
          </pre>
        </details>
      ))}
    </div>
  );
}
