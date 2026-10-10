import { HERO } from '@stillwake/content';
import { command, CONDUIT, grid, STRUCTURE, type Command } from '@stillwake/sim';
import { UNIT, type Hero, type Ship } from './hero';

/** The cells the hero aims at: structure for doors, conduit for valves. */
export interface Cells extends Ship {
  readonly conduit: readonly number[];
}

/** The cell under the pointer, the command E would send for it, and whether the hero reaches it. */
export interface Aim {
  readonly cell: number;
  readonly use: Command | undefined;
  readonly inReach: boolean;
}

/**
 * What the hero aims at with the pointer at `point`, in cells; nothing off the grid. A door and a
 * valve may share a cell, and then E works the door.
 */
export function aimAt(cells: Cells, hero: Hero, point: { x: number; y: number }): Aim | undefined {
  const x = Math.floor(point.x);
  const y = Math.floor(point.y);
  if (x < 0 || y < 0 || x >= cells.width || y >= cells.height) return undefined;
  const cell = y * cells.width + x;
  const dx = x * UNIT + UNIT / 2 - hero.x;
  const dy = y * UNIT + UNIT / 2 - (hero.y - HERO.height / 2);
  return { cell, use: useOf(cells, cell), inReach: dx * dx + dy * dy <= HERO.reach * HERO.reach };
}

function useOf(cells: Cells, cell: number): Command | undefined {
  const s = cells.structure[cell];
  if (s === STRUCTURE.doorClosed || s === STRUCTURE.doorOpen) {
    return command(grid, 'toggleDoor', { cell });
  }
  const c = cells.conduit[cell];
  if (c === CONDUIT.valveClosed || c === CONDUIT.valveOpen) {
    return command(grid, 'toggleValve', { cell });
  }
  return undefined;
}
