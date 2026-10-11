import { MACHINES, MATERIALS, WRECK, type MachineKind, type MaterialId } from '@stillwake/content';
import type { DeepReadonly } from '../../core/module';
import type { Rng } from '../../core/rng';
import type { Layer, Placement } from '../grid';
import type { BuildingState } from './state';

const PLACEMENTS: readonly Placement[] = [
  ...(Object.keys(MATERIALS) as MaterialId[]).map(
    (material) => ({ layer: 'structure', kind: 'wall', material }) as const,
  ),
  ...(['floor', 'ladder', 'door'] as const).map((kind) => ({ layer: 'structure', kind }) as const),
  ...(['pipe', 'valve'] as const).map((kind) => ({ layer: 'conduit', kind }) as const),
  ...(Object.keys(MACHINES) as MachineKind[]).map((kind) => ({ layer: 'machine', kind }) as const),
  { layer: 'back', kind: 'backWall' },
];
const LAYERS: readonly Layer[] = ['structure', 'conduit', 'machine', 'back'];

// The module cannot see the grid. The generic suites fuzz it on the wreck, so cells are drawn from
// the wreck's size, and marks mostly from the cells where it has something built.
const WIDTH = WRECK[0]?.length ?? 0;
const CELLS = WIDTH * WRECK.length;
const BUILT: readonly number[] = WRECK.flatMap((row, y) =>
  [...row].flatMap((char, x) => ('#=HDd-vxTVK.'.includes(char) ? [y * WIDTH + x] : [])),
);

/**
 * Draws every command, refused ones included: off the grid, on nothing, twice on one thing, work on
 * a plan that is gone or that the ship cannot pay for.
 */
export function fuzzBuilding(state: DeepReadonly<BuildingState>, rng: Rng) {
  const anywhere = () => rng.below(CELLS + 2) - 1;
  switch (rng.below(5)) {
    case 0:
      return {
        type: 'placePlan',
        payload: {
          cell: anywhere(),
          placement: PLACEMENTS[rng.below(PLACEMENTS.length)] as Placement,
        },
      } as const;
    case 1: {
      const marks = state.plans.filter((p) => 'clear' in p);
      const pick = rng.below(4);
      const cell =
        pick === 0 && marks.length > 0
          ? (marks[rng.below(marks.length)]?.cell ?? 0)
          : pick < 3 && BUILT.length > 0
            ? (BUILT[rng.below(BUILT.length)] ?? 0)
            : anywhere();
      return {
        type: 'deconstruct',
        payload: { cell, layer: LAYERS[rng.below(LAYERS.length)] as Layer },
      } as const;
    }
    case 2:
      return { type: 'cancelPlan', payload: { id: rng.below(state.nextPlanId + 2) } } as const;
    default: {
      // Mostly on the oldest plan, so work piles up on one and plans complete within a run; often
      // on one not begun, so payments drain inventories and their refusal is drawn too.
      const oldest = state.plans[0];
      const unbegun = state.plans.filter((p) => p.progress === 0);
      const pick = rng.below(8);
      const plan =
        oldest && pick < 5
          ? oldest.id
          : unbegun.length > 0 && pick < 7
            ? (unbegun[rng.below(unbegun.length)]?.id ?? 0)
            : rng.below(state.nextPlanId + 2);
      return { type: 'work', payload: { plan } } as const;
    }
  }
}
