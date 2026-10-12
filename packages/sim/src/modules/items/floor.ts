import { ITEMS } from '@stillwake/content';
import type { QueryApi } from '../../core/module';
import type { GridModule } from '../grid';
import type { RoomsModule } from '../rooms';
import type { FloorStack, Item, ItemsState } from './state';

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

/**
 * Where a stack in `cell` is a tick later: a cell up out of something built, a cell down onto
 * whatever is open below, or where it is: in space nothing falls, and past the grid's edge nothing
 * holds it, so it stays.
 */
export function nextCell(ship: Ship, cell: number): number {
  const { width, height } = ship.grid.size();
  if (built(ship, cell)) return cell >= width ? cell - width : cell;
  if (ship.rooms.roomAt(cell) === 'space') return cell;
  const below = cell + width;
  return below < width * height && !built(ship, below) ? below : cell;
}

/**
 * Lays `count` of `item` on cell `cell`, dropped by peer `by`: onto a stack of it there first, up
 * to the stack limit, then as new stacks of at most the limit each.
 */
export function layDown(
  state: ItemsState,
  item: Item,
  count: number,
  cell: number,
  by: number,
): void {
  let left = count;
  for (const s of state.floor) {
    if (left === 0) break;
    if (s.cell !== cell || s.item !== item) continue;
    const n = Math.min(left, ITEMS[item].stack - s.count);
    s.count += n;
    left -= n;
  }
  while (left > 0) {
    const n = Math.min(left, ITEMS[item].stack);
    state.floor.push({ id: state.nextFloorId, item, count: n, cell, by, at: state.ticks });
    state.nextFloorId += 1;
    left -= n;
  }
}

/**
 * A tick of the floor: each stack moves a cell, in id order, then stacks of one item sharing a cell
 * merge into the oldest, up to its limit.
 */
export function settle(state: ItemsState, ship: Ship): void {
  for (const s of state.floor) s.cell = nextCell(ship, s.cell);
  const kept: FloorStack[] = [];
  for (const s of state.floor) {
    for (const into of kept) {
      if (into.cell !== s.cell || into.item !== s.item) continue;
      const n = Math.min(s.count, ITEMS[s.item].stack - into.count);
      into.count += n;
      s.count -= n;
    }
    if (s.count > 0) kept.push(s);
  }
  state.floor = kept;
}
