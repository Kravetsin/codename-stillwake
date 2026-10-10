import { defineModule, refuse, withFuzz, type QueryApi } from '../../core/module';
import type { GridModule, Layer, Placement } from '../grid';
import { fuzzBuilding } from './fuzz';
import type { Action, BuildingState, Plan } from './state';

export type { Action, BuildingState, Plan } from './state';

type Grid = QueryApi<GridModule>;

/** Structure and machines exclude each other in a cell; a conduit runs through either. */
const slotOf = (layer: Layer) => (layer === 'conduit' ? 'conduit' : 'solid');

/** The cells a plan covers: a machine's whole footprint, otherwise its one cell. */
function covers(grid: Grid, plan: { readonly cell: number } & Action): readonly number[] {
  if ('place' in plan) {
    if (plan.place.layer !== 'machine') return [plan.cell];
    return grid.footprint(plan.place.kind, plan.cell) ?? [plan.cell];
  }
  const machine = plan.clear === 'machine' ? grid.machineAt(plan.cell) : undefined;
  return (machine && grid.footprint(machine.kind, machine.cell)) ?? [plan.cell];
}

/** Where a mark to clear `layer` at `cell` is kept, or nothing when that layer is empty there. */
function markedCell(grid: Grid, cell: number, layer: Layer): number | undefined {
  switch (layer) {
    case 'structure':
      return grid.structureAt(cell).kind === 'empty' ? undefined : cell;
    case 'conduit':
      return grid.conduitAt(cell).kind === 'none' ? undefined : cell;
    case 'machine':
      return grid.machineAt(cell)?.cell;
  }
}

function isMarked(plans: readonly Plan[], layer: Layer, cell: number): boolean {
  return plans.some((p) => 'clear' in p && p.clear === layer && p.cell === cell);
}

/**
 * What deconstruction takes from a cell next: a machine, then a conduit, then the structure, passing
 * over what is marked already, so a second pass over a pipe in a wall marks the wall. When everything
 * there is marked, the top one, which a mark would refuse.
 */
function clearAt(
  grid: Grid,
  plans: readonly Plan[],
  cell: number,
): { layer: Layer; cell: number } | undefined {
  let top: { layer: Layer; cell: number } | undefined;
  for (const layer of ['machine', 'conduit', 'structure'] as const) {
    const at = markedCell(grid, cell, layer);
    if (at === undefined) continue;
    if (!isMarked(plans, layer, at)) return { layer, cell: at };
    top ??= { layer, cell: at };
  }
  return top;
}

/** Why `action` cannot be planned at `cell`, as a refusal key; `undefined` when it can. */
function problem(
  grid: Grid,
  plans: readonly Plan[],
  cell: number,
  action: Action,
): string | undefined {
  if ('clear' in action) {
    const at = markedCell(grid, cell, action.clear);
    if (at === undefined) return 'building.nothingThere';
    return isMarked(plans, action.clear, at) ? 'building.planned' : undefined;
  }
  const gridProblem = grid.placementProblem(cell, action.place);
  if (gridProblem) return gridProblem;
  const slot = slotOf(action.place.layer);
  const wanted = covers(grid, { cell, ...action });
  const taken = plans.some(
    (p) =>
      'place' in p &&
      slotOf(p.place.layer) === slot &&
      covers(grid, p).some((c) => wanted.includes(c)),
  );
  return taken ? 'building.planned' : undefined;
}

const buildingModule = defineModule<[GridModule]>()({
  id: 'building',
  dependsOn: ['grid'],
  init: (): BuildingState => ({ plans: [], nextPlanId: 1 }),

  queries: {
    plans: (ctx) => ctx.state.plans,
    /** Every plan covering `cell`, in the order they were made. */
    plansAt: (ctx, cell: number) =>
      ctx.state.plans.filter((p) => covers(ctx.deps.grid.query, p).includes(cell)),
    /** The layer a deconstruct tool takes from `cell`, and the cell its mark is kept at. */
    clearAt: (ctx, cell: number) => clearAt(ctx.deps.grid.query, ctx.state.plans, cell),
    /** Why `action` cannot be planned at `cell`: what a ghost shows before the command is sent. */
    problem: (ctx, cell: number, action: Action) =>
      problem(ctx.deps.grid.query, ctx.state.plans, cell, action),
  },

  commands: {
    placePlan: {
      validate(ctx, p: { cell: number; placement: Placement }) {
        const why = problem(ctx.deps.grid.query, ctx.state.plans, p.cell, { place: p.placement });
        if (why) return refuse(why);
      },
      apply(ctx, p: { cell: number; placement: Placement }) {
        ctx.state.plans.push({ id: ctx.state.nextPlanId, cell: p.cell, place: p.placement });
        ctx.state.nextPlanId += 1;
      },
    },
    deconstruct: {
      validate(ctx, p: { cell: number; layer: Layer }) {
        const why = problem(ctx.deps.grid.query, ctx.state.plans, p.cell, { clear: p.layer });
        if (why) return refuse(why);
      },
      apply(ctx, p: { cell: number; layer: Layer }) {
        const cell = markedCell(ctx.deps.grid.query, p.cell, p.layer) ?? p.cell;
        ctx.state.plans.push({ id: ctx.state.nextPlanId, cell, clear: p.layer });
        ctx.state.nextPlanId += 1;
      },
    },
    cancelPlan: {
      validate(ctx, p: { id: number }) {
        if (!ctx.state.plans.some((plan) => plan.id === p.id)) return refuse('building.noPlan');
      },
      apply(ctx, p: { id: number }) {
        ctx.state.plans = ctx.state.plans.filter((plan) => plan.id !== p.id);
      },
    },
  },
});

export type BuildingModule = typeof buildingModule;
export const building = withFuzz(buildingModule, fuzzBuilding);
