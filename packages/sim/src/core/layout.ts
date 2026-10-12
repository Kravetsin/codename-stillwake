import { LEGEND, LEGEND_UNDER, MACHINES, type MachineKind } from '@stillwake/content';

/**
 * A map drawn as ASCII, one character per cell. Cells are numbered row by row from top-left. `under`,
 * when given, is a second map of the same size, of what lies under and inside the first.
 */
export interface Layout {
  readonly width: number;
  readonly height: number;
  readonly rows: readonly string[];
  readonly under?: readonly string[];
}

export const EMPTY_LAYOUT: Layout = { width: 0, height: 0, rows: [] };

/**
 * Parses a map, and the map under it if given. Written in a template literal, blank first and last
 * lines are dropped and the indentation common to all rows is removed, which suits tests. Given as
 * rows, it is read as written, so the space around a ship stays part of the grid. Short rows are
 * padded with space either way; the map under is padded to the map's size.
 */
export function parseLayout(map: string | readonly string[], under?: readonly string[]): Layout {
  const rows = typeof map === 'string' ? trimmed(map) : map;
  const layout = checked(rows, LEGEND, '');
  if (under === undefined) return layout;
  const { width, height } = layout;
  if (under.length > height || under.some((row) => row.length > width)) {
    throw new Error(`The map under is larger than the map, ${width}×${height}.`);
  }
  const padded = Array.from({ length: height }, (_, y) => (under[y] ?? '').padEnd(width, ' '));
  return { ...layout, under: checked(padded, LEGEND_UNDER, ' under').rows };
}

function trimmed(map: string): string[] {
  const lines = map.split('\n').map((line) => line.replace(/\r$/, ''));
  while (lines.length > 0 && (lines[0] ?? '').trim() === '') lines.shift();
  while (lines.length > 0 && (lines[lines.length - 1] ?? '').trim() === '') lines.pop();

  const indent = Math.min(
    ...lines.map((l) => (l.trim() === '' ? Infinity : l.length - l.trimStart().length)),
  );
  return lines.map((l) => l.slice(Number.isFinite(indent) ? indent : 0).trimEnd());
}

function checked(cut: readonly string[], legend: object, which: string): Layout {
  const width = Math.max(0, ...cut.map((l) => l.length));
  const rows = cut.map((l) => l.padEnd(width, ' '));
  rows.forEach((row, y) => {
    [...row].forEach((char, x) => {
      if (!(char in legend)) {
        throw new Error(`Map cell (${x}, ${y})${which}: '${char}' is not in the legend.`);
      }
    });
  });
  return { width, height: rows.length, rows };
}

/** Every cell holding `char`, in reading order: on the map, or on the map under it. */
export function cellsOf(layout: Layout, char: string, under = false): number[] {
  const cells: number[] = [];
  (under ? (layout.under ?? []) : layout.rows).forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === char) cells.push(y * layout.width + x);
  });
  return cells;
}

const MACHINE_CHARS: Readonly<Record<string, MachineKind>> = {
  T: 'tank',
  G: 'generator',
  V: 'vent',
  K: 'crate',
};

/**
 * The machines a map draws, in reading order of their top-left cells, each with the cells it covers.
 * Each unclaimed machine character starts one machine, whose footprint must be drawn in full.
 */
export function machinesOf(layout: Layout): { kind: MachineKind; cell: number; cells: number[] }[] {
  const { width } = layout;
  const claimed = new Set<number>();
  const machines: { kind: MachineKind; cell: number; cells: number[] }[] = [];
  for (let cell = 0; cell < width * layout.height; cell++) {
    const x = cell % width;
    const y = Math.floor(cell / width);
    const char = layout.rows[y]?.[x] ?? ' ';
    const kind = MACHINE_CHARS[char];
    if (kind === undefined || claimed.has(cell)) continue;
    const spec = MACHINES[kind];
    const cells: number[] = [];
    for (let dy = 0; dy < spec.height; dy++) {
      for (let dx = 0; dx < spec.width; dx++) {
        const covered = (y + dy) * width + x + dx;
        if (x + dx >= width || layout.rows[y + dy]?.[x + dx] !== char || claimed.has(covered)) {
          throw new Error(
            `Map cell (${x}, ${y}): a ${kind} is ${spec.width}×${spec.height}; draw its whole footprint with '${char}'.`,
          );
        }
        claimed.add(covered);
        cells.push(covered);
      }
    }
    machines.push({ kind, cell, cells });
  }
  return machines;
}
