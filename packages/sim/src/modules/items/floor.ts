import { FLOOR, ITEMS } from '@stillwake/content';
import type { QueryApi } from '../../core/module';
import type { GridModule } from '../grid';
import type { RoomsModule } from '../rooms';
import type { FloorStack, Item, ItemsState } from './state';

/** Thousandths of a cell: a stack's position and speed, as the hero's and debris's are. */
export const UNIT = 1000;

/** What the floor rules read of the ship: its cells, and which of them are space. */
export interface Ship {
  readonly grid: QueryApi<GridModule>;
  readonly rooms: QueryApi<RoomsModule>;
}

/** Built up: a wall, a floor, a closed door or a machine. A stack rests on one and rises out of one. */
function built(ship: Ship, cell: number): boolean {
  const s = ship.grid.structureAt(cell);
  if (s.kind === 'wall' || s.kind === 'floor' || (s.kind === 'door' && !s.open)) return true;
  return ship.grid.machineAt(cell) !== undefined;
}

/** The cell at column `x` and row `y`, or none past the grid's edge. */
function cellAt(ship: Ship, x: number, y: number): number | undefined {
  const { width, height } = ship.grid.size();
  return x >= 0 && y >= 0 && x < width && y < height ? y * width + x : undefined;
}

/** The cell a stack is in: the one its bottom middle point lies just above. */
export function cellOf(x: number, y: number, width: number): number {
  return Math.floor((y - 1) / UNIT) * width + Math.floor(x / UNIT);
}

/** Built, or past the grid's edge: what stops a stack inside the ship. */
const blocks = (ship: Ship, x: number, y: number) => {
  const cell = cellAt(ship, x, y);
  return cell === undefined || built(ship, cell);
};

/**
 * Lays `count` of `item` on cell `cell`, dropped by peer `by` and thrown at `vx`: as new stacks of
 * at most the stack limit each, from the cell's bottom middle, rising a little as they go.
 */
export function layDown(
  state: ItemsState,
  drop: { item: Item; count: number; cell: number; vx: number; width: number },
  by: number,
): void {
  const x = (drop.cell % drop.width) * UNIT + UNIT / 2;
  const y = (Math.floor(drop.cell / drop.width) + 1) * UNIT;
  let left = drop.count;
  while (left > 0) {
    const count = Math.min(left, ITEMS[drop.item].stack);
    const vy = drop.vx === 0 ? 0 : -FLOOR.throwLift;
    state.floor.push({
      id: state.nextFloorId,
      item: drop.item,
      count,
      cell: drop.cell,
      x,
      y,
      vx: drop.vx,
      vy,
      by,
      at: state.ticks,
    });
    state.nextFloorId += 1;
    left -= count;
  }
}

/**
 * A tick of one stack. Inside something built it rises a cell. In space it flies on as it was
 * thrown, and with everything outside it drifts back past the moving ship. Inside the ship it falls,
 * stops against what is built, and slides to a stop on what it lands on. Whether it is still on the
 * grid: past the edge it is gone.
 */
function move(s: FloorStack, ship: Ship): boolean {
  const { width, height } = ship.grid.size();
  const row = Math.floor((s.y - 1) / UNIT);
  if (built(ship, s.cell)) {
    if (row > 0) s.y -= UNIT;
    s.vx = 0;
    s.vy = 0;
  } else if (ship.rooms.roomAt(s.cell) === 'space') {
    s.x += s.vx - FLOOR.spaceDrift;
    s.y += s.vy;
  } else {
    s.vy = Math.min(s.vy + FLOOR.gravity, FLOOR.maxFall);
    const nx = s.x + s.vx;
    if (blocks(ship, Math.floor(nx / UNIT), row)) s.vx = 0;
    else s.x = nx;
    const x = Math.floor(s.x / UNIT);
    if (s.vy > 0) {
      const to = s.y + s.vy;
      let landed = false;
      for (let r = row + 1; r <= Math.floor((to - 1) / UNIT); r++) {
        if (!blocks(ship, x, r)) continue;
        s.y = r * UNIT;
        s.vy = 0;
        landed = true;
        break;
      }
      if (!landed) s.y = to;
    } else if (s.vy < 0) {
      const to = s.y + s.vy;
      if (blocks(ship, x, Math.floor((to - 1) / UNIT))) s.vy = 0;
      else s.y = to;
    }
    // Resting on something: it slides to a stop.
    if (s.vy === 0 && blocks(ship, x, Math.floor((s.y - 1) / UNIT) + 1)) {
      s.vx = Math.sign(s.vx) * Math.max(0, Math.abs(s.vx) - FLOOR.friction);
    }
  }
  if (s.x < 0 || s.y <= 0 || s.x >= width * UNIT || s.y > height * UNIT) return false;
  s.cell = cellOf(s.x, s.y, width);
  return true;
}

/**
 * A tick of the floor: each stack moves, in id order, and one that left the grid is gone for good:
 * thrown out into space. Then stacks of one item at rest in a cell merge into the oldest, up to its
 * limit.
 */
export function settle(state: ItemsState, ship: Ship): void {
  state.floor = state.floor.filter((s) => move(s, ship));
  const kept: FloorStack[] = [];
  for (const s of state.floor) {
    const resting = s.vx === 0 && s.vy === 0;
    for (const into of kept) {
      if (!resting || into.cell !== s.cell || into.item !== s.item) continue;
      if (into.vx !== 0 || into.vy !== 0) continue;
      const n = Math.min(s.count, ITEMS[s.item].stack - into.count);
      into.count += n;
      s.count -= n;
    }
    if (s.count > 0) kept.push(s);
  }
  state.floor = kept;
}
