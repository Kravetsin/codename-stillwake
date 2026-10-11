import { MATERIALS, type MaterialId } from '@stillwake/content';
import { CONDUIT, STRUCTURE } from '@stillwake/sim';
import type { Graphics } from 'pixi.js';
import { CELL } from '../../render/camera';

/** The raw codes of the grid, as the `layers` query hands them out. */
export interface Cells {
  readonly width: number;
  readonly height: number;
  readonly structure: readonly number[];
  readonly material: readonly number[];
  readonly conduit: readonly number[];
}

const MATERIAL_COLOUR: Record<MaterialId, number> = { scrap: 0x5b6170, steel: 0x8f99ad };
const COLOUR_BY_CODE = new Map<number, number>(
  (Object.keys(MATERIALS) as MaterialId[]).map((id) => [MATERIALS[id].code, MATERIAL_COLOUR[id]]),
);

const FLOOR = 0x9aa3b5;
const LADDER = 0xb08d57;
const DOOR = 0xc97a3a;
/** Dull: the pipes feature lights the ones carrying oxygen over it. */
const PIPE = 0x56606e;
const VALVE_OPEN = 0x4caf6a;
const VALVE_CLOSED = 0xd05050;

type Rect = [x: number, y: number, w: number, h: number];

/**
 * Rectangles grouped by colour, so a chunk fills each colour once. Measured on the reference world:
 * 0.27 ms per chunk against 1.26 ms with a fill per rectangle and an outline per cell.
 */
export class Batch {
  private readonly fills = new Map<number, Rect[]>();
  private readonly outlines = new Map<number, Rect[]>();

  fill(colour: number, ...rect: Rect): void {
    this.add(this.fills, colour, rect);
  }

  outline(colour: number, ...rect: Rect): void {
    this.add(this.outlines, colour, rect);
  }

  drawInto(g: Graphics): void {
    for (const [colour, rects] of this.fills) {
      for (const r of rects) g.rect(...r);
      g.fill(colour);
    }
    for (const [colour, rects] of this.outlines) {
      for (const r of rects) g.rect(...r);
      g.stroke({ width: 2, color: colour });
    }
  }

  private add(into: Map<number, Rect[]>, colour: number, rect: Rect) {
    const list = into.get(colour);
    if (list) list.push(rect);
    else into.set(colour, [rect]);
  }
}

/** Adds one cell's structure to `batch`, at the cell's place in the world. */
export function drawStructure(batch: Batch, cells: Cells, cell: number): void {
  const x = (cell % cells.width) * CELL;
  const y = Math.floor(cell / cells.width) * CELL;
  switch (cells.structure[cell]) {
    case STRUCTURE.wall:
      batch.fill(COLOUR_BY_CODE.get(cells.material[cell] ?? 0) ?? 0xff00ff, x, y, CELL, CELL);
      break;
    case STRUCTURE.floor:
      batch.fill(FLOOR, x, y, CELL, 4);
      break;
    case STRUCTURE.ladder:
      batch.fill(LADDER, x + 5, y, 2, CELL);
      batch.fill(LADDER, x + CELL - 7, y, 2, CELL);
      for (let r = 4; r < CELL; r += 7) batch.fill(LADDER, x + 5, y + r, CELL - 10, 2);
      break;
    case STRUCTURE.doorClosed:
      batch.fill(DOOR, x + 3, y, CELL - 6, CELL);
      break;
    case STRUCTURE.doorOpen:
      batch.outline(DOOR, x + 4, y + 1, CELL - 8, CELL - 2);
      break;
  }
}

/** Adds one cell's conduit to `batch`: drawn over machines, so a pipe shows where it joins one. */
export function drawConduit(batch: Batch, cells: Cells, cell: number): void {
  const col = cell % cells.width;
  const row = Math.floor(cell / cells.width);
  const x = col * CELL;
  const y = row * CELL;
  const conduit = cells.conduit[cell] ?? CONDUIT.none;
  if (conduit === CONDUIT.none) return;
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  // A pipe reaches toward every neighbouring conduit, so runs read as lines.
  const linked = (dx: number, dy: number) => {
    const nx = col + dx;
    const ny = row + dy;
    if (nx < 0 || ny < 0 || nx >= cells.width || ny >= cells.height) return false;
    return (cells.conduit[ny * cells.width + nx] ?? CONDUIT.none) !== CONDUIT.none;
  };
  batch.fill(PIPE, cx - 2, cy - 2, 4, 4);
  if (linked(1, 0)) batch.fill(PIPE, cx, cy - 2, CELL / 2, 4);
  if (linked(-1, 0)) batch.fill(PIPE, x, cy - 2, CELL / 2, 4);
  if (linked(0, 1)) batch.fill(PIPE, cx - 2, cy, 4, CELL / 2);
  if (linked(0, -1)) batch.fill(PIPE, cx - 2, y, 4, CELL / 2);
  if (conduit === CONDUIT.valveOpen || conduit === CONDUIT.valveClosed) {
    batch.fill(conduit === CONDUIT.valveOpen ? VALVE_OPEN : VALVE_CLOSED, cx - 5, cy - 5, 10, 10);
  }
}
