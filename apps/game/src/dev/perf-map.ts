import { parseLayout, type Layout } from '@stillwake/sim';

/**
 * The reference world from CLAUDE.md's budgets: 256×128 cells with every layer in use — walls,
 * floors, ladders, doors, pipe runs with valves, tanks and vents. Opened with `?perf`.
 */
export function perfLayout(): Layout {
  const width = 256;
  const height = 128;
  // An 8×8 tile repeated across the map, so every chunk holds every kind of cell.
  const tile = [
    '########',
    '#TT.V.-#',
    '#TT.H.v#',
    '#=.DH.-#',
    '#--x-H.#',
    '#.V.dH.#',
    '#==..=.#',
    '########',
  ];
  const rows: string[] = [];
  for (let y = 0; y < height; y++) rows.push((tile[y % 8] ?? '').repeat(width / 8));
  // The hero wakes in the first tile, above a closed door.
  rows[1] = `#TTS${(rows[1] ?? '').slice(4)}`;
  return parseLayout(rows);
}
