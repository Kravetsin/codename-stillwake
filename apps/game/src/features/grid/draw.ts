import { BACK, CONDUIT, STRUCTURE } from '@stillwake/sim';
import type { Graphics, Texture } from 'pixi.js';
import { CELL } from '../../render/camera';
import {
  backTexture,
  doorTexture,
  floorTexture,
  ladderTexture,
  pipeTexture,
  SIDE,
  valveTexture,
  wallEdgeTexture,
  wallTexture,
} from './art';

/** The raw codes of the grid, as the `layers` query hands them out. */
export interface Cells {
  readonly width: number;
  readonly height: number;
  readonly structure: readonly number[];
  readonly material: readonly number[];
  readonly conduit: readonly number[];
  readonly back: readonly number[];
  readonly backMaterial: readonly number[];
}

function tile(g: Graphics, texture: Texture, x: number, y: number): void {
  g.texture(texture, undefined, x, y);
}

/** The sides of `cell` whose neighbour passes `is`, as `SIDE`'s bits; past the grid's edge never does. */
function sidesOf(cells: Cells, cell: number, is: (neighbour: number) => boolean): number {
  const col = cell % cells.width;
  const row = Math.floor(cell / cells.width);
  let sides = 0;
  if (row > 0 && is(cell - cells.width)) sides |= SIDE.up;
  if (col < cells.width - 1 && is(cell + 1)) sides |= SIDE.right;
  if (row < cells.height - 1 && is(cell + cells.width)) sides |= SIDE.down;
  if (col > 0 && is(cell - 1)) sides |= SIDE.left;
  return sides;
}

/** Draws one cell's back wall into `g`: under everything else in the ship. */
export function drawBack(g: Graphics, cells: Cells, cell: number): void {
  if (cells.back[cell] !== BACK.wall) return;
  const x = cell % cells.width;
  const y = Math.floor(cell / cells.width);
  tile(g, backTexture(cells.backMaterial[cell] ?? 0, x, y), x * CELL, y * CELL);
}

/** Draws one cell's structure into `g`, at the cell's place in the world. */
export function drawStructure(g: Graphics, cells: Cells, cell: number): void {
  const x = (cell % cells.width) * CELL;
  const y = Math.floor(cell / cells.width) * CELL;
  switch (cells.structure[cell]) {
    case STRUCTURE.wall: {
      const walled = sidesOf(cells, cell, (n) => cells.structure[n] === STRUCTURE.wall);
      const code = cells.material[cell] ?? 0;
      tile(g, wallTexture(code, x / CELL, y / CELL), x, y);
      const open = ~walled & 0b1111;
      if (open !== 0) tile(g, wallEdgeTexture(code, open), x, y);
      break;
    }
    case STRUCTURE.floor:
      tile(g, floorTexture(), x, y);
      break;
    case STRUCTURE.ladder:
      tile(g, ladderTexture(), x, y);
      break;
    case STRUCTURE.doorClosed:
    case STRUCTURE.doorOpen: {
      const door = (n: number) =>
        cells.structure[n] === STRUCTURE.doorClosed || cells.structure[n] === STRUCTURE.doorOpen;
      const linked = sidesOf(cells, cell, door) & (SIDE.up | SIDE.down);
      tile(g, doorTexture(cells.structure[cell] === STRUCTURE.doorClosed, linked), x, y);
      break;
    }
  }
}

/** Draws one cell's conduit into `g`: behind walls and machines, reaching toward its neighbours. */
export function drawConduit(g: Graphics, cells: Cells, cell: number): void {
  const conduit = cells.conduit[cell] ?? CONDUIT.none;
  if (conduit === CONDUIT.none) return;
  const x = (cell % cells.width) * CELL;
  const y = Math.floor(cell / cells.width) * CELL;
  // A pipe reaches toward every neighbouring conduit, so runs read as lines.
  const linked = sidesOf(cells, cell, (n) => (cells.conduit[n] ?? CONDUIT.none) !== CONDUIT.none);
  tile(g, pipeTexture(linked), x, y);
  if (conduit === CONDUIT.valveOpen || conduit === CONDUIT.valveClosed) {
    tile(g, valveTexture(conduit === CONDUIT.valveOpen), x + CELL / 2 - 5, y + CELL / 2 - 5);
  }
}
