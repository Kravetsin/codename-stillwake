import { command, grid, hazards, items, rooms, type Sim } from '@stillwake/sim';
import { useEffect, useState } from 'react';
import type { Game } from '../../session/game';
import { link, type LinkStatus } from '../../session/relay-link';

const REFRESH_MS = 250;
/** Hashing a big world costs milliseconds, so the readout hashes once a second, not every refresh. */
const HASH_EVERY = 4;
/** A whole grid is megabytes of JSON; the viewer shows the start of it. */
const MAX_JSON = 20_000;

interface Reading {
  fps: number;
  tick: number;
  hash: string;
  creative: boolean;
  link: LinkStatus;
  desyncs: number;
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
    creative: sim.query(items).creative(),
    link: link.get(),
    desyncs: game.desyncs,
    slices: Object.entries(sim.world.slices).map(([id, slice]) => [
      id,
      open.has(id) ? show(slice) : undefined,
    ]),
  };
}

/** A random wall of the outer hull, where a meteor would hit, if any is left. */
function hullWall(sim: Sim): number | undefined {
  const walls = sim
    .query(rooms)
    .rooms()
    .flatMap((r) => r.hull)
    .filter((cell) => sim.query(grid).structureAt(cell).kind === 'wall');
  return walls[Math.floor(Math.random() * walls.length)];
}

/** Where this tab stands on the dev relay, in a line. */
function describeLink(status: LinkStatus): string | undefined {
  if (status.role === 'alone') return undefined;
  if (status.role === 'host') {
    return status.session === undefined
      ? 'hosting…'
      : `hosting ?join=${status.session} · peers ${status.peers}`;
  }
  return `joined ${status.session} · ${status.state}`;
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
    // Counted outside the updater: StrictMode runs updaters twice, which would skip every hash.
    const update = () => {
      const count = refresh++;
      setReading((previous) => read(game, previous, count, expanded));
    };
    update();
    const timer = setInterval(update, REFRESH_MS);
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
        {describeLink(reading.link) && (
          <>
            <dt>net</dt>
            <dd>
              {describeLink(reading.link)}
              {reading.desyncs > 0 && ` · resynced ${reading.desyncs}×`}
            </dd>
          </>
        )}
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
        <button
          className={`rounded px-2 py-1 ${reading.creative ? 'bg-amber-700 hover:bg-amber-600' : 'bg-slate-700 hover:bg-slate-600'}`}
          onClick={() => {
            // Read now, not from the last reading: two quick clicks must switch it back.
            const on = !game.client.sim.query(items).creative();
            game.client.send(command(items, 'setCreative', { on }));
          }}
        >
          creative
        </button>
        <button
          className="rounded bg-slate-700 px-2 py-1 hover:bg-slate-600"
          onClick={() => {
            const cell = hullWall(game.client.sim);
            if (cell === undefined) setStatus('No hull wall left to hit.');
            else {
              game.client.send(command(hazards, 'meteorHit', { cell }));
              setStatus('');
            }
          }}
        >
          meteor
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
