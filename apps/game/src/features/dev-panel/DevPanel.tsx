import { useEffect, useState } from 'react';
import type { Game } from '../../session/game';

const REFRESH_MS = 250;
/** Hashing a big world costs milliseconds, so the readout hashes once a second, not every refresh. */
const HASH_EVERY = 4;
/** A whole grid is megabytes of JSON; the viewer shows the start of it. */
const MAX_JSON = 20_000;

interface Reading {
  fps: number;
  tick: number;
  hash: string;
  /** Every module id, with its JSON only for the modules whose entry is open. */
  slices: [string, string | undefined][];
}

function read(
  game: Game,
  previous: Reading | undefined,
  refresh: number,
  open: ReadonlySet<string>,
): Reading {
  const { sim } = game.client;
  return {
    fps: game.fps,
    tick: sim.world.tick,
    hash: previous && refresh % HASH_EVERY !== 0 ? previous.hash : sim.hash(),
    slices: Object.entries(sim.world.slices).map(([id, slice]) => [
      id,
      open.has(id) ? show(slice) : undefined,
    ]),
  };
}

/** Pretty JSON that also shows derived `Map`s, `Set`s and typed arrays readably. */
function show(value: unknown): string {
  const json = JSON.stringify(value, (_key, v: unknown) => plain(v), 2);
  return json.length > MAX_JSON
    ? `${json.slice(0, MAX_JSON)}
… ${json.length - MAX_JSON} more characters`
    : json;
}

function plain(v: unknown): unknown {
  if (ArrayBuffer.isView(v)) return `${v.constructor.name}(${(v as Int32Array).length})`;
  if (v instanceof Set) return [...(v as Set<unknown>)];
  if (!(v instanceof Map)) return v;
  const entries: Record<string, unknown> = {};
  for (const [key, item] of v as Map<unknown, unknown>) entries[String(key)] = item;
  return entries;
}

/**
 * Development readouts and controls. Refreshed a few times a second, never every tick, and not at
 * all while hidden: on a big world the readouts themselves would cost frames.
 */
export function DevPanel({ game }: { readonly game: Game }) {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [reading, setReading] = useState<Reading>(() => read(game, undefined, 0, expanded));
  const [status, setStatus] = useState('');
  const [speed, setSpeed] = useState(game.speed);

  useEffect(() => {
    if (!open) return;
    let refresh = 0;
    setReading((previous) => read(game, previous, refresh++, expanded));
    const timer = setInterval(
      () => setReading((previous) => read(game, previous, refresh++, expanded)),
      REFRESH_MS,
    );
    return () => clearInterval(timer);
  }, [game, open, expanded]);

  const toggleModule = (id: string, isOpen: boolean) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (isOpen) next.add(id);
      else next.delete(id);
      return next;
    });

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
        <details
          key={id}
          className="mb-1"
          open={expanded.has(id)}
          onToggle={(e) => toggleModule(id, e.currentTarget.open)}
        >
          <summary className="cursor-pointer">{id}</summary>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-slate-400">
            {json ?? '…'}
          </pre>
        </details>
      ))}
    </div>
  );
}
