import { MACHINES, MATERIALS } from '@stillwake/content';
import type { DeepReadonly } from '../../core/module';
import { CONDUIT, STRUCTURE, type GridState, type Machine, type Placement } from './state';

type Grid = DeepReadonly<GridState>;

export function inBounds(state: Grid, cell: number): boolean {
  return Number.isSafeInteger(cell) && cell >= 0 && cell < state.width * state.height;
}

/** The cells a machine of `kind` would cover with its top-left at `cell`, or none off the grid. */
export function footprint(state: Grid, kind: Machine['kind'], cell: number): number[] | undefined {
  if (!inBounds(state, cell)) return undefined;
  const { width, height } = MACHINES[kind];
  const x = cell % state.width;
  const y = Math.floor(cell / state.width);
  if (x + width > state.width || y + height > state.height) return undefined;
  const cells: number[] = [];
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) cells.push((y + dy) * state.width + x + dx);
  }
  return cells;
}

/** Why `placement` cannot go at `cell`, as a refusal key; `undefined` when it can. */
export function placementProblem(
  state: Grid,
  cell: number,
  placement: Placement,
): string | undefined {
  if (!inBounds(state, cell)) return 'grid.outOfBounds';
  switch (placement.layer) {
    case 'structure':
      if (state.structure[cell] !== STRUCTURE.empty) return 'grid.occupied';
      if (state.occupancy[cell] !== 0) return 'grid.machineInTheWay';
      if (placement.kind === 'wall' && !(placement.material in MATERIALS))
        return 'grid.noSuchMaterial';
      return undefined;
    case 'conduit':
      return state.conduit[cell] === CONDUIT.none ? undefined : 'grid.occupied';
    case 'machine': {
      if (!(placement.kind in MACHINES)) return 'grid.noSuchMachine';
      const cells = footprint(state, placement.kind, cell);
      if (!cells) return 'grid.outOfBounds';
      if (cells.some((c) => state.structure[c] !== STRUCTURE.empty)) return 'grid.blocked';
      if (cells.some((c) => state.occupancy[c] !== 0)) return 'grid.machineInTheWay';
      return undefined;
    }
  }
}
