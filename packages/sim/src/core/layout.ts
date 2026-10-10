import { LEGEND } from '@stillwake/content';

/** A map drawn as ASCII, one character per cell. Cells are numbered row by row from top-left. */
export interface Layout {
  readonly width: number;
  readonly height: number;
  readonly rows: readonly string[];
}

export const EMPTY_LAYOUT: Layout = { width: 0, height: 0, rows: [] };

/**
 * Parses a map written in a template literal: blank first and last lines are dropped, the
 * indentation common to all rows is removed, and short rows are padded with space.
 */
export function parseLayout(ascii: string): Layout {
  const lines = ascii.split('\n').map((line) => line.replace(/\r$/, ''));
  while (lines.length > 0 && (lines[0] ?? '').trim() === '') lines.shift();
  while (lines.length > 0 && (lines[lines.length - 1] ?? '').trim() === '') lines.pop();

  const indent = Math.min(
    ...lines.map((l) => (l.trim() === '' ? Infinity : l.length - l.trimStart().length)),
  );
  const cut = lines.map((l) => l.slice(Number.isFinite(indent) ? indent : 0).trimEnd());
  const width = Math.max(0, ...cut.map((l) => l.length));
  const rows = cut.map((l) => l.padEnd(width, ' '));

  rows.forEach((row, y) => {
    [...row].forEach((char, x) => {
      if (!(char in LEGEND))
        throw new Error(`Map cell (${x}, ${y}): '${char}' is not in the legend.`);
    });
  });
  return { width, height: rows.length, rows };
}

/** Every cell holding `char`, in reading order. */
export function cellsOf(layout: Layout, char: string): number[] {
  const cells: number[] = [];
  layout.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === char) cells.push(y * layout.width + x);
  });
  return cells;
}
