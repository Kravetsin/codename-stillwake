import { WRECK } from '@stillwake/content';
import type { DeepReadonly } from '../../core/module';
import type { Rng } from '../../core/rng';
import type { HazardsState } from './index';

// The module cannot see the grid. The generic suites fuzz it on the wreck, so hits go mostly to the
// wreck's walls, and now and then anywhere: off the grid, into space, at a wall already gone.
const WIDTH = WRECK[0]?.length ?? 0;
const CELLS = WIDTH * WRECK.length;
const WALLS: readonly number[] = WRECK.flatMap((row, y) =>
  [...row].flatMap((char, x) => (char === '#' ? [y * WIDTH + x] : [])),
);

/** Meteors by hand, rarely: every hit opens the wreck a little more. */
export function fuzzHazards(_state: DeepReadonly<HazardsState>, rng: Rng) {
  if (rng.below(64) !== 0) return undefined;
  const cell =
    rng.below(3) !== 0 && WALLS.length > 0
      ? (WALLS[rng.below(WALLS.length)] as number)
      : rng.below(CELLS + 2) - 1;
  return { type: 'meteorHit', payload: { cell } } as const;
}
