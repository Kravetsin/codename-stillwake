import type { DeepReadonly } from '../../core/module';
import type { Rng } from '../../core/rng';
import { CONDUIT, STRUCTURE, type GridState } from './state';

/**
 * Toggles a real door or valve most of the time, and any cell — off the grid included — otherwise,
 * so the refusals are drawn too.
 */
export function fuzzGrid(state: DeepReadonly<GridState>, rng: Rng) {
  const size = state.width * state.height;
  const pick = (cells: number[]) =>
    cells.length > 0 && rng.below(4) !== 0
      ? (cells[rng.below(cells.length)] as number)
      : rng.below(size + 2) - 1;

  if (rng.below(2) === 0) {
    const doors = cellsWith(state.structure, [STRUCTURE.doorClosed, STRUCTURE.doorOpen]);
    return { type: 'toggleDoor', payload: { cell: pick(doors) } } as const;
  }
  const valves = cellsWith(state.conduit, [CONDUIT.valveOpen, CONDUIT.valveClosed]);
  return { type: 'toggleValve', payload: { cell: pick(valves) } } as const;
}

function cellsWith(codes: readonly number[], wanted: readonly number[]): number[] {
  const cells: number[] = [];
  codes.forEach((code, cell) => {
    if (wanted.includes(code)) cells.push(cell);
  });
  return cells;
}
