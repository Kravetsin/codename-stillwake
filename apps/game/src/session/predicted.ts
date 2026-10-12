import type { Client } from '@stillwake/net';
import { debris, grid, items, type Command, type Sim, type Toggle } from '@stillwake/sim';

/**
 * The grid's doors and valves as this peer shows them: the world with its own toggles still in
 * flight applied, so a door opens on the frame E is pressed rather than a round trip later (0013).
 * `key` changes when they do.
 */
export interface PredictedGrid {
  readonly key: string;
  readonly structure: readonly number[];
  readonly conduit: readonly number[];
}

// One per world: a resync or a load brings another.
const made = new WeakMap<Sim, PredictedGrid>();

export function predictedGrid(client: Client): PredictedGrid {
  const { sim } = client;
  const toggles = client.inFlight.flatMap(toggleOf);
  const key = `${sim.world.tick}:${toggles.map((t) => `${t.type}@${t.cell}`).join(',')}`;
  const known = made.get(sim);
  if (known?.key === key) return known;
  const q = sim.query(grid);
  const live = q.layers();
  // Copied only while a toggle is in flight: the rest of the time the world's own layers serve.
  const layers =
    toggles.length === 0
      ? { structure: live.structure, conduit: live.conduit }
      : q.afterToggles(toggles);
  const predicted = { key, ...layers };
  made.set(sim, predicted);
  return predicted;
}

/** The pieces of debris this peer has a grab in flight for: gone from its view at once (0013). */
export function grabbing(client: Client): ReadonlySet<number> {
  return new Set(
    client.inFlight.flatMap((c) =>
      c.module === debris.id && c.type === 'grab' ? [(c.payload as { piece: number }).piece] : [],
    ),
  );
}

/** The stacks on the floor this peer has a pick-up in flight for: gone from its view at once. */
export function pickingUp(client: Client): ReadonlySet<number> {
  return new Set(
    client.inFlight.flatMap((c) =>
      c.module === items.id && c.type === 'pickUp' ? [(c.payload as { id: number }).id] : [],
    ),
  );
}

function toggleOf(c: Command): Toggle[] {
  if (c.module !== grid.id || (c.type !== 'toggleDoor' && c.type !== 'toggleValve')) return [];
  return [{ type: c.type, cell: (c.payload as { cell: number }).cell }];
}
