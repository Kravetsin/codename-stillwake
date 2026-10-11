import type { QueryApi } from '../../core/module';
import type { GridModule, Layer } from '../grid';
import type { ItemsModule } from '../items';
import { buildOf, builtAt, ticksFor } from './costs';
import type { Action, Plan } from './state';

type Grid = QueryApi<GridModule>;
type Items = QueryApi<ItemsModule>;

/**
 * Structure and machines exclude each other in a cell; a conduit runs through either, and a back
 * wall stands behind all three.
 */
const slotOf = (layer: Layer) =>
  layer === 'conduit' ? 'conduit' : layer === 'back' ? 'back' : 'solid';

/** The cells a plan covers: a machine's whole footprint, otherwise its one cell. */
export function covers(grid: Grid, plan: { readonly cell: number } & Action): readonly number[] {
  if ('place' in plan) {
    if (plan.place.layer !== 'machine') return [plan.cell];
    return grid.footprint(plan.place.kind, plan.cell) ?? [plan.cell];
  }
  const machine = plan.clear === 'machine' ? grid.machineAt(plan.cell) : undefined;
  return (machine && grid.footprint(machine.kind, machine.cell)) ?? [plan.cell];
}

/** Where a mark to clear `layer` at `cell` is kept, or nothing when that layer is empty there. */
export function markedCell(grid: Grid, cell: number, layer: Layer): number | undefined {
  switch (layer) {
    case 'structure':
      return grid.structureAt(cell).kind === 'empty' ? undefined : cell;
    case 'conduit':
      return grid.conduitAt(cell).kind === 'none' ? undefined : cell;
    case 'machine':
      return grid.machineAt(cell)?.cell;
    case 'back':
      return grid.layers().back[cell] === grid.codes().back.wall ? cell : undefined;
  }
}

function isMarked(plans: readonly Plan[], layer: Layer, cell: number): boolean {
  return plans.some((p) => 'clear' in p && p.clear === layer && p.cell === cell);
}

/**
 * What deconstruction takes from a cell next: a machine, then a conduit, then the structure, then
 * the back wall, passing over what is marked already, so a second pass over a pipe in a wall marks
 * the wall. When everything there is marked, the top one, which a mark would refuse.
 */
export function clearAt(
  grid: Grid,
  plans: readonly Plan[],
  cell: number,
): { layer: Layer; cell: number } | undefined {
  let top: { layer: Layer; cell: number } | undefined;
  for (const layer of ['machine', 'conduit', 'structure', 'back'] as const) {
    const at = markedCell(grid, cell, layer);
    if (at === undefined) continue;
    if (!isMarked(plans, layer, at)) return { layer, cell: at };
    top ??= { layer, cell: at };
  }
  return top;
}

/** `building.notEmpty` when taking `layer` out of `cell` would take a crate holding something. */
function notEmpty(grid: Grid, items: Items, cell: number, layer: Layer): string | undefined {
  const machine = layer === 'machine' ? grid.machineAt(cell) : undefined;
  if (machine?.kind !== 'crate') return undefined;
  return items.crate(machine.id).some((s) => s !== null) ? 'building.notEmpty' : undefined;
}

/** Why `action` cannot be planned at `cell`, as a refusal key; `undefined` when it can. */
export function planProblem(
  grid: Grid,
  items: Items,
  plans: readonly Plan[],
  cell: number,
  action: Action,
): string | undefined {
  if ('clear' in action) {
    const at = markedCell(grid, cell, action.clear);
    if (at === undefined) return 'building.nothingThere';
    if (isMarked(plans, action.clear, at)) return 'building.planned';
    return notEmpty(grid, items, at, action.clear);
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

/**
 * Why work on plan `id` by peer `peer` is refused: the plan is gone; it is not begun and the hero
 * cannot pay; or this tick would take apart what a mark names, and it is a crate that holds
 * something again or the refund does not fit.
 */
export function workProblem(
  grid: Grid,
  items: Items,
  plans: readonly Plan[],
  id: number,
  peer: number,
): string | undefined {
  const plan = plans.find((p) => p.id === id);
  if (!plan) return 'building.noPlan';
  if ('place' in plan) {
    return plan.progress === 0 ? items.shortOf(peer, buildOf(plan.place).cost) : undefined;
  }
  if (plan.progress + 1 < ticksFor(grid, plan)) return undefined;
  const built = builtAt(grid, plan.cell, plan.clear);
  return notEmpty(grid, items, plan.cell, plan.clear) ?? (built && items.fullFor(peer, built.cost));
}
