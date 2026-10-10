import {
  BUILDS,
  DECONSTRUCT_SPEEDUP,
  MACHINES,
  MATERIALS,
  type Build,
  type MaterialId,
} from '@stillwake/content';
import type { QueryApi } from '../../core/module';
import type { GridModule, Layer, Placement } from '../grid';
import type { Plan } from './state';

type Grid = QueryApi<GridModule>;

function wall(material: MaterialId): Build {
  const { cost, buildTicks } = MATERIALS[material];
  return { cost: { [material]: cost }, buildTicks };
}

/** What a placement costs and how long it takes to build. */
export function buildOf(placement: Placement): Build {
  switch (placement.layer) {
    case 'structure':
      return placement.kind === 'wall' ? wall(placement.material) : BUILDS[placement.kind];
    case 'conduit':
      return BUILDS[placement.kind];
    case 'machine':
      return MACHINES[placement.kind];
  }
}

/** What `layer` of `cell` holds now, as a build: what taking it apart refunds. */
export function builtAt(grid: Grid, cell: number, layer: Layer): Build | undefined {
  switch (layer) {
    case 'structure': {
      const s = grid.structureAt(cell);
      if (s.kind === 'empty') return undefined;
      return s.kind === 'wall' ? wall(s.material) : BUILDS[s.kind];
    }
    case 'conduit': {
      const c = grid.conduitAt(cell);
      return c.kind === 'none' ? undefined : BUILDS[c.kind];
    }
    case 'machine': {
      const m = grid.machineAt(cell);
      return m && MACHINES[m.kind];
    }
  }
}

/** Ticks to take apart what took `buildTicks` to build: a share of them, rounded up. */
export function apartTicks(buildTicks: number): number {
  return Math.ceil(buildTicks / DECONSTRUCT_SPEEDUP);
}

/** Ticks of work a plan takes: its build's, or those to take apart what a mark names. */
export function ticksFor(grid: Grid, plan: Plan): number {
  if ('place' in plan) return buildOf(plan.place).buildTicks;
  const built = builtAt(grid, plan.cell, plan.clear);
  return built ? apartTicks(built.buildTicks) : 1;
}
