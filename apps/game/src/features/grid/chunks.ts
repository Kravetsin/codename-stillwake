import type { Cells } from './draw';

/** Cells per side of a chunk: the unit that is redrawn when something in it changes. */
export const CHUNK = 16;

/** What was last drawn, cell by cell. */
export interface Seen {
  readonly structure: Int32Array;
  readonly material: Int32Array;
  readonly conduit: Int32Array;
  readonly back: Int32Array;
}

export function chunksAcross(width: number): number {
  return Math.ceil(width / CHUNK);
}

export function chunkCount(width: number, height: number): number {
  return chunksAcross(width) * Math.ceil(height / CHUNK);
}

export function chunkOf(width: number, cell: number): number {
  const x = cell % width;
  const y = Math.floor(cell / width);
  return Math.floor(y / CHUNK) * chunksAcross(width) + Math.floor(x / CHUNK);
}

export function emptySeen(cells: Cells): Seen {
  const size = cells.width * cells.height;
  return {
    structure: new Int32Array(size),
    material: new Int32Array(size),
    conduit: new Int32Array(size),
    back: new Int32Array(size),
  };
}

/**
 * The chunks whose drawing is stale, bringing `seen` up to date. A changed cell also marks the
 * chunks of its four neighbours, since a conduit is drawn reaching toward the conduits beside it.
 */
export function staleChunks(seen: Seen, cells: Cells): Set<number> {
  const { width } = cells;
  const total = width * cells.height;
  const stale = new Set<number>();
  for (let cell = 0; cell < total; cell++) {
    const s = cells.structure[cell] ?? 0;
    const m = cells.material[cell] ?? 0;
    const c = cells.conduit[cell] ?? 0;
    const b = cells.back[cell] ?? 0;
    if (
      seen.structure[cell] === s &&
      seen.material[cell] === m &&
      seen.conduit[cell] === c &&
      seen.back[cell] === b
    )
      continue;
    seen.structure[cell] = s;
    seen.material[cell] = m;
    seen.conduit[cell] = c;
    seen.back[cell] = b;
    stale.add(chunkOf(width, cell));
    const x = cell % width;
    if (x > 0) stale.add(chunkOf(width, cell - 1));
    if (x < width - 1) stale.add(chunkOf(width, cell + 1));
    if (cell >= width) stale.add(chunkOf(width, cell - width));
    if (cell + width < total) stale.add(chunkOf(width, cell + width));
  }
  return stale;
}
